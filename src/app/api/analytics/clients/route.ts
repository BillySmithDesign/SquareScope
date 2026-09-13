import { NextResponse } from "next/server";

const SQUARE_ENVIRONMENT = process.env.SQUARE_ENVIRONMENT === "production" ? "production" : "sandbox";

const BASE = SQUARE_ENVIRONMENT === "production"
  ? "https://connect.squareup.com"
  : "https://connect.squareupsandbox.com";
const VERSION = "2026-08-19";
const LOCATION_ID = process.env.SQUARE_LOCATION_ID!;
const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { createdAt: number; payload: any } | null = null;

async function squareFetch(path: string) {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) throw new Error("SQUARE_ACCESS_TOKEN missing");

  const response = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Square-Version": VERSION,
      "Content-Type": "application/json",
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

const money = (cents: number) =>
  Math.round((cents / 100) * 100) / 100;

const DAY_MS = 86_400_000;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const force = url.searchParams.get("refresh") === "1";

    if (
      !force &&
      cache &&
      Date.now() - cache.createdAt < CACHE_TTL_MS
    ) {
      return NextResponse.json({
        ...cache.payload,
        cache: {
          status: "HIT",
          ageSeconds: Math.round(
            (Date.now() - cache.createdAt) / 1000
          ),
        },
      });
    }

    const started = Date.now();

    const [payments, customers] = await Promise.all([
      getAllPayments(),
      getAllCustomers(),
    ]);

    const completed = payments.filter(
      (payment) =>
        payment.status === "COMPLETED" &&
        payment.customer_id &&
        payment.created_at
    );

    const customerDirectory = new Map(
      customers.map((customer) => [customer.id, customer])
    );

    const history = new Map<
      string,
      {
        spendCents: number;
        payments: number;
        dates: string[];
      }
    >();

    for (const payment of completed) {
      const id = payment.customer_id;

      const record = history.get(id) ?? {
        spendCents: 0,
        payments: 0,
        dates: [],
      };

      record.spendCents +=
        Number(payment.amount_money?.amount ?? 0) -
        Number(payment.refunded_money?.amount ?? 0);

      record.payments += 1;
      record.dates.push(payment.created_at);

      history.set(id, record);
    }

    const now = new Date();

    const clientRows = [...history.entries()].map(
      ([customerId, record]) => {
        const customer = customerDirectory.get(customerId);

        const dates = record.dates
          .map((date) => new Date(date))
          .sort((a, b) => a.getTime() - b.getTime());

        const firstVisit = dates[0];
        const lastVisit = dates.at(-1)!;

        const daysSinceLastVisit = Math.floor(
          (now.getTime() - lastVisit.getTime()) / DAY_MS
        );

        const gaps: number[] = [];

        for (let i = 1; i < dates.length; i++) {
          gaps.push(
            (dates[i].getTime() - dates[i - 1].getTime()) /
              DAY_MS
          );
        }

        const averageVisitGap =
          gaps.length > 0
            ? gaps.reduce((sum, gap) => sum + gap, 0) /
              gaps.length
            : null;

        // A client becomes "due" after their normal cadence plus
        // a 30% tolerance. Minimum threshold prevents very frequent
        // payment behaviour from creating noisy alerts.
        const expectedReturnDays =
          averageVisitGap !== null
            ? Math.max(28, averageVisitGap * 1.3)
            : null;

        const overdueDays =
          expectedReturnDays !== null
            ? Math.max(
                0,
                Math.round(
                  daysSinceLastVisit - expectedReturnDays
                )
              )
            : 0;

        const name =
          customer?.given_name || customer?.family_name
            ? `${customer?.given_name ?? ""} ${
                customer?.family_name ?? ""
              }`.trim()
            : "Historical customer";

        return {
          customerId,
          name,

          currentProfile: Boolean(customer),

          lifetimeSpend: money(record.spendCents),
          transactions: record.payments,

          averageSpend: money(
            record.spendCents / record.payments
          ),

          firstVisit: firstVisit.toISOString(),
          lastVisit: lastVisit.toISOString(),

          daysSinceLastVisit,

          averageVisitGap:
            averageVisitGap === null
              ? null
              : Math.round(averageVisitGap),

          expectedReturnDays:
            expectedReturnDays === null
              ? null
              : Math.round(expectedReturnDays),

          overdueDays,

          status:
            daysSinceLastVisit <= 90
              ? "active"
              : daysSinceLastVisit <= 180
              ? "cooling"
              : "lapsed",
        };
      }
    );

    // Lifetime history can contain customer IDs whose Square
    // directory profile has since been deleted/merged/archived.
    // Preserve those rows for lifetime value/history, but do not
    // let them distort current client-health metrics.
    const currentClientRows = clientRows.filter(
      (client) => client.currentProfile
    );

    const historicalOnlyRows = clientRows.filter(
      (client) => !client.currentProfile
    );

    // Lifetime payment history may contain customer IDs whose
    // Square directory profile has since been deleted, merged or archived.
    // Keep them for lifetime analysis, but exclude them from CURRENT
    // client-health metrics.

    const repeatCustomers = clientRows.filter(
      (client) => client.transactions > 1
    );

    const currentRepeatCustomers = currentClientRows.filter(
      (client) => client.transactions > 1
    );

    const activeCustomers = currentClientRows.filter(
      (client) => client.status === "active"
    );

    const coolingCustomers = currentClientRows.filter(
      (client) => client.status === "cooling"
    );

    const lapsedCustomers = currentClientRows.filter(
      (client) => client.status === "lapsed"
    );

    // Return opportunities should be real, current Square clients:
    // - profile still exists
    // - at least 3 historical transactions
    // - seen within the last 365 days
    // - beyond their individual expected return cadence
    const overdueCustomers = currentClientRows
      .filter(
        (client) =>
          client.transactions >= 3 &&
          client.daysSinceLastVisit <= 365 &&
          client.overdueDays > 0
      )
      .sort((a, b) => b.overdueDays - a.overdueDays);

    const totalSpend = clientRows.reduce(
      (sum, client) => sum + client.lifetimeSpend,
      0
    );

    const avgLifetimeValue =
      clientRows.length > 0
        ? totalSpend / clientRows.length
        : 0;

    const avgTransactions =
      clientRows.length > 0
        ? clientRows.reduce(
            (sum, client) => sum + client.transactions,
            0
          ) / clientRows.length
        : 0;

    const topCustomers = [...clientRows]
      .sort((a, b) => b.lifetimeSpend - a.lifetimeSpend)
      .slice(0, 25);

    const recentCustomers = [...clientRows]
      .sort(
        (a, b) =>
          new Date(b.lastVisit).getTime() -
          new Date(a.lastVisit).getTime()
      )
      .slice(0, 25);

    // Revenue concentration — useful for understanding whether
    // the business relies too heavily on a small group of clients.
    const spendSorted = [...clientRows].sort(
      (a, b) => b.lifetimeSpend - a.lifetimeSpend
    );

    const top10Spend = spendSorted
      .slice(0, 10)
      .reduce((sum, client) => sum + client.lifetimeSpend, 0);

    const top10RevenueShare =
      totalSpend > 0
        ? (top10Spend / totalSpend) * 100
        : 0;

    // New clients by month based on first recorded payment.
    const acquisitionMap = new Map<string, number>();

    for (const client of clientRows) {
      const month = client.firstVisit.slice(0, 7);

      acquisitionMap.set(
        month,
        (acquisitionMap.get(month) ?? 0) + 1
      );
    }

    const acquisition = [...acquisitionMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({
        month,
        clients: count,
      }));

    const payload = {
      success: true,
      generatedAt: new Date().toISOString(),

      summary: {
        paymentProfiles: clientRows.length,
        currentProfiles: customers.length,

        // Lifetime behaviour across every payment-linked ID.
        repeatCustomers: repeatCustomers.length,
        repeatRate:
          clientRows.length > 0
            ? Math.round(
                (repeatCustomers.length / clientRows.length) *
                  1000
              ) / 10
            : 0,

        // Current client-health population.
        currentPaymentProfiles: currentClientRows.length,
        historicalOnlyProfiles: historicalOnlyRows.length,

        currentRepeatCustomers: currentRepeatCustomers.length,
        currentRepeatRate:
          currentClientRows.length > 0
            ? Math.round(
                (currentRepeatCustomers.length /
                  currentClientRows.length) *
                  1000
              ) / 10
            : 0,

        activeCustomers: activeCustomers.length,
        coolingCustomers: coolingCustomers.length,
        lapsedCustomers: lapsedCustomers.length,
        overdueCustomers: overdueCustomers.length,

        averageLifetimeValue:
          Math.round(avgLifetimeValue * 100) / 100,

        averageTransactions:
          Math.round(avgTransactions * 10) / 10,

        top10RevenueShare:
          Math.round(top10RevenueShare * 10) / 10,
      },

      topCustomers,
      recentCustomers,
      overdueCustomers: overdueCustomers.slice(0, 30),
      acquisition,

      diagnostics: {
        paymentsAnalysed: completed.length,
        customerDirectoryRecords: customers.length,
        historicalCustomerIds: clientRows.length,
        currentPaymentLinkedProfiles: currentClientRows.length,
        historicalOnlyProfiles: historicalOnlyRows.length,
        processingMs: Date.now() - started,
      },
    };

    cache = {
      createdAt: Date.now(),
      payload,
    };

    return NextResponse.json({
      ...payload,
      cache: {
        status: "MISS",
        ageSeconds: 0,
      },
    });
  } catch (error) {
    console.error("Client analytics failed:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      { status: 500 }
    );
  }
}
