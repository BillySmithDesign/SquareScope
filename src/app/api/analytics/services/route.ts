import { NextResponse } from "next/server";

const BASE = "https://connect.squareup.com";
const VERSION = "2026-08-19";
const LOCATION_ID = process.env.SQUARE_LOCATION_ID!;
const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { createdAt: number; payload: any } | null = null;

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

const money = (cents: number) =>
  Math.round((cents / 100) * 100) / 100;

function categoryFor(_name: string) {
  // Generic fallback for SquareScope.
  //
  // The original private implementation inferred categories from
  // business-specific item names. SquareScope must not make assumptions
  // about the type of business using the dashboard.
  //
  // Future versions can derive this from Square Catalog categories.
  return "Products & Services";
}

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
        cache: { status: "HIT" },
      });
    }

    const started = Date.now();
    const allOrders = await getAllOrders();

    // Service analytics represents realised sales only.
    // Draft, open and cancelled orders must never contribute
    // to revenue, service mix or historical trend metrics.
    const orders = allOrders.filter(
      (order) => order.state === "COMPLETED"
    );

    const excludedOrders = allOrders.filter(
      (order) => order.state !== "COMPLETED"
    );

    const serviceMap = new Map<string, any>();
    const categoryMap = new Map<string, any>();
    const monthlyMap = new Map<string, Map<string, number>>();

    let totalServiceRevenue = 0;
    let totalUnits = 0;

    for (const order of orders) {
      const orderDate =
        order.closed_at ||
        order.created_at ||
        order.updated_at;

      const month = orderDate?.slice(0, 7);

      for (const item of order.line_items ?? []) {
        const name = item.name?.trim() || "Custom / Uncategorised";

        const quantity = Number(item.quantity ?? 1);

        const revenue =
          Number(item.total_money?.amount ?? 0) ||
          Number(item.gross_sales_money?.amount ?? 0);

        if (revenue <= 0) continue;

        const category = categoryFor(name);

        totalServiceRevenue += revenue;
        totalUnits += quantity;

        const service = serviceMap.get(name) ?? {
          name,
          category,
          quantity: 0,
          revenue: 0,
          orders: 0,
        };

        service.quantity += quantity;
        service.revenue += revenue;
        service.orders += 1;

        serviceMap.set(name, service);

        const categoryRow = categoryMap.get(category) ?? {
          category,
          quantity: 0,
          revenue: 0,
        };

        categoryRow.quantity += quantity;
        categoryRow.revenue += revenue;

        categoryMap.set(category, categoryRow);

        if (month) {
          if (!monthlyMap.has(month)) {
            monthlyMap.set(month, new Map());
          }

          const monthData = monthlyMap.get(month)!;

          monthData.set(
            category,
            (monthData.get(category) ?? 0) + revenue
          );
        }
      }
    }

    const services = [...serviceMap.values()]
      .map((service) => ({
        ...service,
        revenue: money(service.revenue),
        averageValue:
          service.quantity > 0
            ? money(service.revenue / service.quantity)
            : 0,
        revenueShare:
          totalServiceRevenue > 0
            ? Math.round(
                (service.revenue / totalServiceRevenue) *
                  1000
              ) / 10
            : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const categories = [...categoryMap.values()]
      .map((category) => ({
        ...category,
        revenue: money(category.revenue),
        averageValue:
          category.quantity > 0
            ? money(category.revenue / category.quantity)
            : 0,
        share:
          totalServiceRevenue > 0
            ? Math.round(
                (category.revenue / totalServiceRevenue) *
                  1000
              ) / 10
            : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const monthlyCategoryRevenue = [...monthlyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, values]) => {
        const row: Record<string, any> = { month };

        for (const [category, cents] of values.entries()) {
          row[category] = money(cents);
        }

        return row;
      });

    // Compare last 6 complete-ish months against prior 6 months.
    const months = [...monthlyMap.keys()].sort();

    const recentMonths = months.slice(-6);
    const previousMonths = months.slice(-12, -6);

    const trends = categories.map((category) => {
      const recent = recentMonths.reduce(
        (sum, month) =>
          sum +
          Number(
            monthlyMap.get(month)?.get(category.category) ?? 0
          ),
        0
      );

      const previous = previousMonths.reduce(
        (sum, month) =>
          sum +
          Number(
            monthlyMap.get(month)?.get(category.category) ?? 0
          ),
        0
      );

      const change =
        previous > 0
          ? ((recent - previous) / previous) * 100
          : null;

      return {
        category: category.category,
        recentRevenue: money(recent),
        previousRevenue: money(previous),
        change:
          change === null
            ? null
            : Math.round(change * 10) / 10,
      };
    });

    const highestAverage = [...services]
      .filter((x) => x.quantity >= 3)
      .sort((a, b) => b.averageValue - a.averageValue)[0] ?? null;

    const mostPopular = [...services]
      .sort((a, b) => b.quantity - a.quantity)[0] ?? null;

    const payload = {
      success: true,
      generatedAt: new Date().toISOString(),

      summary: {
        totalRevenue: money(totalServiceRevenue),
        units: totalUnits,
        uniqueServices: services.length,
        averageServiceValue:
          totalUnits > 0
            ? money(totalServiceRevenue / totalUnits)
            : 0,
      },

      highestAverage,
      mostPopular,
      services,
      categories,
      trends,
      monthlyCategoryRevenue,

      diagnostics: {
        ordersRetrieved: allOrders.length,
        completedOrdersAnalysed: orders.length,
        excludedOrders: excludedOrders.length,
        excludedByState: excludedOrders.reduce(
          (acc: Record<string, number>, order) => {
            const state = order.state ?? "UNKNOWN";
            acc[state] = (acc[state] ?? 0) + 1;
            return acc;
          },
          {}
        ),
        processingMs: Date.now() - started,
      },
    };

    cache = {
      createdAt: Date.now(),
      payload,
    };

    return NextResponse.json({
      ...payload,
      cache: { status: "MISS" },
    });
  } catch (error) {
    console.error("Service analytics failed:", error);

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
