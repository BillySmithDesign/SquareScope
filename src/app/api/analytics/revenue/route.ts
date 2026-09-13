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

const dollars = (cents: number) =>
  Math.round((cents / 100) * 100) / 100;

function businessDate(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.BUSINESS_TIMEZONE ?? "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
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
        cache: {
          status: "HIT",
          ageSeconds: Math.round(
            (Date.now() - cache.createdAt) / 1000
          ),
        },
      });
    }

    const started = Date.now();
    const payments = await getAllPayments();

    const completed = payments.filter(
      (payment) => payment.status === "COMPLETED"
    );

    const daily = new Map<
      string,
      { revenue: number; transactions: number }
    >();

    let grossCents = 0;
    let refundCents = 0;

    const methods = new Map<string, number>();

    for (const payment of completed) {
      const amount = Number(payment.amount_money?.amount ?? 0);
      const refund = Number(payment.refunded_money?.amount ?? 0);

      grossCents += amount;
      refundCents += refund;

      if (payment.created_at) {
        const date = businessDate(payment.created_at);
        const current = daily.get(date) ?? {
          revenue: 0,
          transactions: 0,
        };

        current.revenue += amount;
        current.transactions += 1;

        daily.set(date, current);
      }

      let method = "Other";

      if (payment.card_details) method = "Card";
      else if (payment.cash_details) method = "Cash";
      else if (payment.bank_account_details) method = "Bank";
      else if (payment.wallet_details) method = "Wallet";
      else if (payment.source_type) method = payment.source_type;

      methods.set(method, (methods.get(method) ?? 0) + amount);
    }

    const dailyRevenue = [...daily.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({
        date,
        revenue: dollars(value.revenue),
        transactions: value.transactions,
        averageSale:
          value.transactions > 0
            ? dollars(value.revenue / value.transactions)
            : 0,
      }));

    // Current business calendar date.
    const todayString = businessDate(new Date().toISOString());
    const [year, month, day] = todayString.split("-").map(Number);

    const currentYearPrefix = `${year}-`;
    const previousYearPrefix = `${year - 1}-`;

    const ytd = dailyRevenue
      .filter((row) => {
        if (!row.date.startsWith(currentYearPrefix)) return false;

        const [, rowMonth, rowDay] = row.date.split("-").map(Number);

        return (
          rowMonth < month ||
          (rowMonth === month && rowDay <= day)
        );
      })
      .reduce((sum, row) => sum + row.revenue, 0);

    const previousYtd = dailyRevenue
      .filter((row) => {
        if (!row.date.startsWith(previousYearPrefix)) return false;

        const [, rowMonth, rowDay] = row.date.split("-").map(Number);

        return (
          rowMonth < month ||
          (rowMonth === month && rowDay <= day)
        );
      })
      .reduce((sum, row) => sum + row.revenue, 0);

    const ytdChange =
      previousYtd > 0
        ? ((ytd - previousYtd) / previousYtd) * 100
        : null;

    const monthPrefix = `${year}-${String(month).padStart(2, "0")}-`;

    const currentMonthRows = dailyRevenue.filter((row) =>
      row.date.startsWith(monthPrefix)
    );

    const monthRevenue = currentMonthRows.reduce(
      (sum, row) => sum + row.revenue,
      0
    );

    const daysInMonth = new Date(year, month, 0).getDate();

    // Pure historical run-rate forecast. This remains useful as a
    // baseline, but the Insights engine will augment it with accepted
    // bookings remaining in the current month.
    const runRateMonthForecast =
      day > 0 ? (monthRevenue / day) * daysInMonth : monthRevenue;

    // Day-of-week analytics
    const dayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];

    const weekdayMap = new Map<
      string,
      { revenue: number; transactions: number }
    >();

    for (const row of dailyRevenue) {
      const weekday = new Intl.DateTimeFormat(process.env.BUSINESS_LOCALE ?? "en-US", {
        timeZone: process.env.BUSINESS_TIMEZONE ?? "UTC",
        weekday: "long",
      }).format(new Date(`${row.date}T12:00:00+09:30`));

      const current = weekdayMap.get(weekday) ?? {
        revenue: 0,
        transactions: 0,
      };

      current.revenue += row.revenue;
      current.transactions += row.transactions;

      weekdayMap.set(weekday, current);
    }

    const weekdayPerformance = dayNames.map((dayName) => {
      const value = weekdayMap.get(dayName) ?? {
        revenue: 0,
        transactions: 0,
      };

      return {
        day: dayName,
        revenue: Math.round(value.revenue * 100) / 100,
        transactions: value.transactions,
        averageSale:
          value.transactions > 0
            ? Math.round(
                (value.revenue / value.transactions) * 100
              ) / 100
            : 0,
      };
    });

    const bestDay = [...dailyRevenue]
      .sort((a, b) => b.revenue - a.revenue)[0] ?? null;

    // Monthly comparison by year
    const monthlyMap = new Map<
      string,
      { revenue: number; transactions: number }
    >();

    for (const row of dailyRevenue) {
      const key = row.date.slice(0, 7);

      const current = monthlyMap.get(key) ?? {
        revenue: 0,
        transactions: 0,
      };

      current.revenue += row.revenue;
      current.transactions += row.transactions;

      monthlyMap.set(key, current);
    }

    const monthlyRevenue = [...monthlyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([monthKey, value]) => ({
        month: monthKey,
        year: Number(monthKey.slice(0, 4)),
        monthNumber: Number(monthKey.slice(5, 7)),
        revenue: Math.round(value.revenue * 100) / 100,
        transactions: value.transactions,
      }));

    const bestMonth = [...monthlyRevenue]
      .sort((a, b) => b.revenue - a.revenue)[0] ?? null;

    const payload = {
      success: true,
      generatedAt: new Date().toISOString(),

      summary: {
        lifetimeRevenue: dollars(grossCents - refundCents),
        grossRevenue: dollars(grossCents),
        refunds: dollars(refundCents),
        transactions: completed.length,
        averageSale:
          completed.length > 0
            ? dollars(grossCents / completed.length)
            : 0,
        ytd: Math.round(ytd * 100) / 100,
        previousYtd: Math.round(previousYtd * 100) / 100,
        ytdChange:
          ytdChange === null
            ? null
            : Math.round(ytdChange * 10) / 10,
        monthRevenue: Math.round(monthRevenue * 100) / 100,

        // Backward-compatible field for the existing UI.
        monthForecast:
          Math.round(runRateMonthForecast * 100) / 100,

        runRateMonthForecast:
          Math.round(runRateMonthForecast * 100) / 100,

        daysElapsedInMonth: day,
        daysInMonth,
      },

      bestDay,
      bestMonth,
      dailyRevenue,
      monthlyRevenue,
      weekdayPerformance,

      paymentMethods: [...methods.entries()]
        .map(([method, cents]) => ({
          method,
          revenue: dollars(cents),
        }))
        .sort((a, b) => b.revenue - a.revenue),

      diagnostics: {
        paymentsAnalysed: completed.length,
        processingMs: Date.now() - started,
      },
    };

    cache = {
      createdAt: Date.now(),
      payload,
    };

    return NextResponse.json({
      ...payload,
      cache: { status: "MISS", ageSeconds: 0 },
    });
  } catch (error) {
    console.error("Revenue analytics failed:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
