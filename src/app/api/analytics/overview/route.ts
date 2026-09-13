import { NextResponse } from "next/server";

const BASE = "https://connect.squareup.com";
const VERSION = "2026-08-19";
const LOCATION_ID = process.env.SQUARE_LOCATION_ID!;

// Analytics are expensive to rebuild because we paginate the complete
// Square history. Keep a short-lived in-memory copy for fast navigation.
const CACHE_TTL_MS = 5 * 60 * 1000;

let analyticsCache: {
  createdAt: number;
  payload: any;
} | null = null;

async function squareFetch(path: string, options?: RequestInit) {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) throw new Error("SQUARE_ACCESS_TOKEN missing");

  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Square-Version": VERSION,
      "Content-Type": "application/json",
      ...options?.headers,
    },
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.errors?.[0]?.detail || `Square returned ${response.status}`
    );
  }

  return data;
}

async function getAllPayments() {
  const results: any[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({
      location_id: LOCATION_ID,
      limit: "100",
      sort_order: "DESC",
    });

    if (cursor) params.set("cursor", cursor);

    const data = await squareFetch(`/v2/payments?${params}`);

    results.push(...(data.payments ?? []));
    cursor = data.cursor;
  } while (cursor);

  return results;
}

async function getAllCustomers() {
  const results: any[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({ limit: "100" });
    if (cursor) params.set("cursor", cursor);

    const data = await squareFetch(`/v2/customers?${params}`);

    results.push(...(data.customers ?? []));
    cursor = data.cursor;
  } while (cursor);

  return results;
}

async function getAllOrders() {
  const results: any[] = [];
  let cursor: string | undefined;

  do {
    const body: any = {
      location_ids: [LOCATION_ID],
      limit: 500,
      query: {
        sort: {
          sort_field: "CREATED_AT",
          sort_order: "DESC",
        },
      },
    };

    if (cursor) body.cursor = cursor;

    const data = await squareFetch("/v2/orders/search", {
      method: "POST",
      body: JSON.stringify(body),
    });

    results.push(...(data.orders ?? []));
    cursor = data.cursor;
  } while (cursor);

  return results;
}

function money(cents: number) {
  return Math.round(cents) / 100;
}

export async function GET(request: Request) {
  try {
    const started = Date.now();

    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get("refresh") === "1";

    if (
      !forceRefresh &&
      analyticsCache &&
      Date.now() - analyticsCache.createdAt < CACHE_TTL_MS
    ) {
      return NextResponse.json({
        ...analyticsCache.payload,
        cache: {
          status: "HIT",
          ageSeconds: Math.round(
            (Date.now() - analyticsCache.createdAt) / 1000
          ),
          ttlSeconds: CACHE_TTL_MS / 1000,
        },
      });
    }

    const [payments, customers, orders] = await Promise.all([
      getAllPayments(),
      getAllCustomers(),
      getAllOrders(),
    ]);

    // -----------------------------
    // PAYMENTS
    // -----------------------------

    const completedPayments = payments.filter(
      (payment) => payment.status === "COMPLETED"
    );

    const grossRevenueCents = completedPayments.reduce(
      (sum, payment) => sum + Number(payment.amount_money?.amount ?? 0),
      0
    );

    const refundsCents = completedPayments.reduce(
      (sum, payment) =>
        sum + Number(payment.refunded_money?.amount ?? 0),
      0
    );

    const netRevenueCents = grossRevenueCents - refundsCents;

    const paymentDates = completedPayments
      .map((payment) => payment.created_at)
      .filter(Boolean)
      .sort();

    // -----------------------------
    // MONTHLY REVENUE
    // -----------------------------

    const monthlyMap = new Map<
      string,
      {
        revenue: number;
        transactions: number;
      }
    >();

    for (const payment of completedPayments) {
      if (!payment.created_at) continue;

      const month = payment.created_at.slice(0, 7);

      const current = monthlyMap.get(month) ?? {
        revenue: 0,
        transactions: 0,
      };

      current.revenue += Number(payment.amount_money?.amount ?? 0);
      current.transactions += 1;

      monthlyMap.set(month, current);
    }

    const monthlyRevenue = [...monthlyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, value]) => ({
        month,
        revenue: money(value.revenue),
        transactions: value.transactions,
        averageSale:
          value.transactions > 0
            ? money(value.revenue / value.transactions)
            : 0,
      }));

    // -----------------------------
    // PAYMENT METHODS
    // -----------------------------

    const paymentMethods: Record<string, number> = {};

    for (const payment of completedPayments) {
      let method = "Other";

      if (payment.card_details) method = "Card";
      else if (payment.cash_details) method = "Cash";
      else if (payment.bank_account_details) method = "Bank";
      else if (payment.wallet_details) method = "Wallet";
      else if (payment.source_type) method = payment.source_type;

      paymentMethods[method] =
        (paymentMethods[method] ?? 0) +
        Number(payment.amount_money?.amount ?? 0);
    }

    const paymentMethodSummary = Object.entries(paymentMethods)
      .map(([method, cents]) => ({
        method,
        revenue: money(cents),
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // -----------------------------
    // CUSTOMERS / RETENTION
    // -----------------------------

    const customerPaymentCounts = new Map<string, number>();
    const customerSpend = new Map<string, number>();

    for (const payment of completedPayments) {
      if (!payment.customer_id) continue;

      customerPaymentCounts.set(
        payment.customer_id,
        (customerPaymentCounts.get(payment.customer_id) ?? 0) + 1
      );

      customerSpend.set(
        payment.customer_id,
        (customerSpend.get(payment.customer_id) ?? 0) +
          Number(payment.amount_money?.amount ?? 0)
      );
    }

    const customersWithPayments = customerPaymentCounts.size;

    const repeatCustomers = [...customerPaymentCounts.values()].filter(
      (count) => count > 1
    ).length;

    const repeatRate =
      customersWithPayments > 0
        ? (repeatCustomers / customersWithPayments) * 100
        : 0;

    const topCustomers = [...customerSpend.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([customerId, cents]) => {
        const customer = customers.find(
          (entry) => entry.id === customerId
        );

        return {
          customerId,
          name:
            customer?.given_name || customer?.family_name
              ? `${customer?.given_name ?? ""} ${
                  customer?.family_name ?? ""
                }`.trim()
              : "Unknown customer",
          lifetimeSpend: money(cents),
          transactions:
            customerPaymentCounts.get(customerId) ?? 0,
        };
      });

    // -----------------------------
    // ORDER / SERVICE ANALYTICS
    // -----------------------------

    const serviceMap = new Map<
      string,
      {
        quantity: number;
        revenue: number;
      }
    >();

    for (const order of orders) {
      for (const item of order.line_items ?? []) {
        const name = item.name || "Unknown item";
        const quantity = Number(item.quantity ?? 1);

        const total =
          Number(item.total_money?.amount ?? 0) ||
          Number(item.gross_sales_money?.amount ?? 0);

        const current = serviceMap.get(name) ?? {
          quantity: 0,
          revenue: 0,
        };

        current.quantity += quantity;
        current.revenue += total;

        serviceMap.set(name, current);
      }
    }

    const topServices = [...serviceMap.entries()]
      .map(([name, data]) => ({
        name,
        quantity: data.quantity,
        revenue: money(data.revenue),
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 15);

    // -----------------------------
    // PERIOD COMPARISON
    // -----------------------------

    const now = new Date();

    const currentMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    );

    const previousMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
    );

    function revenueBetween(start: Date, end: Date) {
      return completedPayments.reduce((sum, payment) => {
        const date = new Date(payment.created_at);

        if (date >= start && date < end) {
          return sum + Number(payment.amount_money?.amount ?? 0);
        }

        return sum;
      }, 0);
    }

    const currentMonthCents = revenueBetween(
      currentMonthStart,
      now
    );

    // Compare same number of elapsed days last month
    const elapsed = now.getTime() - currentMonthStart.getTime();

    const previousComparableEnd = new Date(
      previousMonthStart.getTime() + elapsed
    );

    const previousMonthComparableCents = revenueBetween(
      previousMonthStart,
      previousComparableEnd
    );

    const monthChange =
      previousMonthComparableCents > 0
        ? ((currentMonthCents - previousMonthComparableCents) /
            previousMonthComparableCents) *
          100
        : null;

    // -----------------------------
    // RESPONSE
    // -----------------------------

    const payload = {
      success: true,

      generatedAt: new Date().toISOString(),

      dataRange: {
        firstPayment: paymentDates[0] ?? null,
        latestPayment: paymentDates.at(-1) ?? null,
      },

      totals: {
        revenue: money(netRevenueCents),
        grossRevenue: money(grossRevenueCents),
        refunds: money(refundsCents),

        payments: completedPayments.length,
        orders: orders.length,
        customers: customers.length,

        averageSale:
          completedPayments.length > 0
            ? money(grossRevenueCents / completedPayments.length)
            : 0,

        customersWithPayments,
        repeatCustomers,
        repeatRate: Number(repeatRate.toFixed(1)),
      },

      currentPeriod: {
        monthRevenue: money(currentMonthCents),
        previousComparableRevenue: money(
          previousMonthComparableCents
        ),
        percentageChange:
          monthChange === null
            ? null
            : Number(monthChange.toFixed(1)),
      },

      monthlyRevenue,
      paymentMethods: paymentMethodSummary,
      topServices,
      topCustomers,

      diagnostics: {
        rawPayments: payments.length,
        completedPayments: completedPayments.length,
        rawOrders: orders.length,
        rawCustomers: customers.length,
        processingMs: Date.now() - started,
      },
    };

    analyticsCache = {
      createdAt: Date.now(),
      payload,
    };

    return NextResponse.json({
      ...payload,
      cache: {
        status: "MISS",
        ageSeconds: 0,
        ttlSeconds: CACHE_TTL_MS / 1000,
      },
    });
  } catch (error) {
    console.error("Analytics generation failed:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown analytics error",
      },
      { status: 500 }
    );
  }
}
