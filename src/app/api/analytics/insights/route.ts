import { NextResponse } from "next/server";

type Insight = {
  id: string;
  type: "positive" | "warning" | "opportunity" | "info";
  priority: "high" | "medium" | "low";
  title: string;
  message: string;
  metric?: string;
  source: string;
};

async function getLocalAnalytics(request: Request, endpoint: string) {
  const url = new URL(request.url);
  const origin = url.origin;

  const response = await fetch(`${origin}${endpoint}`, {
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(
      data?.error || `Analytics endpoint failed: ${endpoint}`
    );
  }

  return data;
}

export async function GET(request: Request) {
  try {
    const started = Date.now();

    const [overview, revenue, clients, services, bookings] =
      await Promise.all([
        getLocalAnalytics(request, "/api/analytics/overview"),
        getLocalAnalytics(request, "/api/analytics/revenue"),
        getLocalAnalytics(request, "/api/analytics/clients"),
        getLocalAnalytics(request, "/api/analytics/services"),
        getLocalAnalytics(request, "/api/analytics/bookings"),
      ]);

    const insights: Insight[] = [];

    const ytdChange = Number(
      revenue.summary?.ytdChange ?? 0
    );

    if (ytdChange >= 5) {
      insights.push({
        id: "ytd-growth",
        type: "positive",
        priority: "high",
        title: "Revenue is ahead of last year",
        message: `Year-to-date collected revenue is ${ytdChange.toFixed(
          1
        )}% ahead of the same point last year.`,
        metric: `+${ytdChange.toFixed(1)}%`,
        source: "Revenue",
      });
    } else if (ytdChange < 0) {
      insights.push({
        id: "ytd-decline",
        type: "warning",
        priority: "high",
        title: "Revenue is behind last year",
        message: `Year-to-date collected revenue is ${Math.abs(
          ytdChange
        ).toFixed(1)}% below the same point last year.`,
        metric: `${ytdChange.toFixed(1)}%`,
        source: "Revenue",
      });
    }

    const runRateForecast = Number(
      revenue.summary?.runRateMonthForecast ??
        revenue.summary?.monthForecast ??
        0
    );

    const monthRevenue = Number(
      revenue.summary?.monthRevenue ?? 0
    );

    // Work in the configured business timezone.
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: process.env.BUSINESS_TIMEZONE || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const currentMonth = today.slice(0, 7);

    // Accepted bookings remaining in THIS calendar month only.
    // These are pipeline, not realised sales.
    const remainingMonthBookings = Array.isArray(
      bookings.nextBookings
    )
      ? bookings.nextBookings.filter(
          (booking: any) =>
            String(booking.localDate ?? "").startsWith(
              currentMonth
            ) &&
            String(booking.localDate ?? "") >= today
        )
      : [];

    const remainingBookedValue =
      remainingMonthBookings.reduce(
        (sum: number, booking: any) =>
          sum + Number(booking.estimatedValue ?? 0),
        0
      );

    const bookedMonthOutlook =
      monthRevenue + remainingBookedValue;

    // Working forecast uses the stronger of:
    // 1. historical run rate
    // 2. sales already realised + accepted booking pipeline
    const forecast = Math.max(
      runRateForecast,
      bookedMonthOutlook
    );

    if (forecast > monthRevenue && forecast > 0) {
      insights.push({
        id: "month-forecast",
        type: "info",
        priority: "medium",
        title: "Month-end outlook",
        message:
          remainingBookedValue > 0
            ? `$${Math.round(
                monthRevenue
              ).toLocaleString(
                "en-AU"
              )} has been collected so far this month, with another $${Math.round(
                remainingBookedValue
              ).toLocaleString(
                "en-AU"
              )} currently accepted in the remaining booking calendar. The working month-end outlook is approximately $${Math.round(
                forecast
              ).toLocaleString("en-AU")}.`
            : `Based on the current sales pace, the month is tracking toward approximately $${Math.round(
                runRateForecast
              ).toLocaleString("en-AU")}.`,
        metric: `$${Math.round(
          forecast
        ).toLocaleString("en-AU")}`,
        source: "Revenue + Bookings",
      });
    }

    const serviceTrends = Array.isArray(services.trends)
      ? services.trends
      : [];

    const meaningfulGrowth = serviceTrends
      .filter(
        (trend: any) =>
          trend.category !== "Other" &&
          trend.change !== null &&
          Number(trend.change) >= 10 &&
          Number(trend.recentRevenue) >= 500
      )
      .sort(
        (a: any, b: any) =>
          Number(b.change) - Number(a.change)
      );

    if (meaningfulGrowth.length) {
      const strongest = meaningfulGrowth[0];

      insights.push({
        id: "service-growth",
        type: "positive",
        priority: "medium",
        title: `${strongest.category} is gaining momentum`,
        message: `${strongest.category} completed service sales are up ${Number(
          strongest.change
        ).toFixed(
          1
        )}% across the recent six-month comparison period.`,
        metric: `+${Number(strongest.change).toFixed(1)}%`,
        source: "Services",
      });
    }

    const declining = serviceTrends
      .filter(
        (trend: any) =>
          trend.category !== "Other" &&
          trend.change !== null &&
          Number(trend.change) < -3 &&
          Number(trend.previousRevenue) >= 500
      )
      .sort(
        (a: any, b: any) =>
          Number(a.change) - Number(b.change)
      );

    if (declining.length) {
      const weakest = declining[0];

      insights.push({
        id: "service-decline",
        type: "warning",
        priority: "medium",
        title: `${weakest.category} has softened`,
        message: `${weakest.category} completed service sales are ${Math.abs(
          Number(weakest.change)
        ).toFixed(
          1
        )}% lower than the previous six-month comparison period.`,
        metric: `${Number(weakest.change).toFixed(1)}%`,
        source: "Services",
      });
    }

    const largestCategory = services.categories?.[0];

    if (largestCategory) {
      insights.push({
        id: "service-concentration",
        type: "info",
        priority: "low",
        title: `${largestCategory.category} is the largest service category`,
        message: `${largestCategory.category} represents ${Number(
          largestCategory.share
        ).toFixed(
          1
        )}% of completed service sales, making it a major driver of the service mix.`,
        metric: `${Number(largestCategory.share).toFixed(1)}%`,
        source: "Services",
      });
    }

    const overdueCustomers = Array.isArray(
      clients.overdueCustomers
    )
      ? clients.overdueCustomers
      : [];

    if (overdueCustomers.length) {
      insights.push({
        id: "return-opportunity",
        type: "opportunity",
        priority: "high",
        title: "Repeat customers appear due to return",
        message: `${overdueCustomers.length} repeat customers seen within the last year are now beyond their individual historical visit cadence.`,
        metric: String(overdueCustomers.length),
        source: "Customers",
      });
    }

    const repeatRate = Number(
      clients.summary?.currentRepeatRate ??
        clients.summary?.repeatRate ??
        0
    );

    if (repeatRate >= 50) {
      insights.push({
        id: "repeat-rate",
        type: "positive",
        priority: "medium",
        title: "Repeat behaviour is strong",
        message: `${repeatRate.toFixed(
          1
        )}% of current payment-linked clients have more than one completed transaction.`,
        metric: `${repeatRate.toFixed(1)}%`,
        source: "Customers",
      });
    }

    const concentration = Number(
      clients.summary?.top10RevenueShare ?? 0
    );

    if (concentration >= 30) {
      insights.push({
        id: "client-concentration",
        type: "info",
        priority: "low",
        title: "Top clients contribute significant value",
        message: `The top 10 historical clients account for ${concentration.toFixed(
          1
        )}% of payment-linked client revenue.`,
        metric: `${concentration.toFixed(1)}%`,
        source: "Customers",
      });
    }

    const forwardValue = Number(
      bookings.summary?.estimatedFutureValue ?? 0
    );

    const forwardBookings = Number(
      bookings.summary?.futureBookings ?? 0
    );

    const forwardHours = Number(
      bookings.summary?.futureBookedHours ?? 0
    );

    if (forwardBookings > 0) {
      insights.push({
        id: "forward-book",
        type: "positive",
        priority: "high",
        title: "Forward bookings provide visible pipeline",
        message: `${forwardBookings} accepted future appointments currently represent approximately $${Math.round(
          forwardValue
        ).toLocaleString(
          "en-AU"
        )} in estimated booked value across ${forwardHours.toFixed(
          1
        )} booked hours.`,
        metric: `$${Math.round(forwardValue).toLocaleString("en-AU")}`,
        source: "Bookings",
      });
    }

    const busiest = bookings.busiestFutureDay;

    if (busiest) {
      const busyDate = new Date(
        `${busiest.date}T12:00:00`
      ).toLocaleDateString("en-AU", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });

      insights.push({
        id: "busiest-forward-day",
        type: "info",
        priority: "low",
        title: `${busyDate} is currently the busiest upcoming day`,
        message: `${Number(
          busiest.bookedHours
        ).toFixed(1)} hours are booked across ${
          busiest.bookings
        } appointments, representing approximately $${Math.round(
          busiest.estimatedValue
        ).toLocaleString("en-AU")} in estimated value.`,
        metric: `${Number(busiest.bookedHours).toFixed(1)}h`,
        source: "Bookings",
      });
    }

    const priorityOrder = {
      high: 0,
      medium: 1,
      low: 2,
    };

    insights.sort(
      (a, b) =>
        priorityOrder[a.priority] -
        priorityOrder[b.priority]
    );

    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),

      headline: {
        ytdRevenue: revenue.summary.ytd,
        ytdChange,
        monthForecast: forecast,
        runRateMonthForecast: runRateForecast,
        bookedMonthOutlook:
          Math.round(bookedMonthOutlook * 100) / 100,
        remainingMonthBookedValue:
          Math.round(remainingBookedValue * 100) / 100,
        forwardValue,
        forwardBookings,
        repeatRate,
      },

      insights,

      diagnostics: {
        insightsGenerated: insights.length,
        processingMs: Date.now() - started,
      },
    });
  } catch (error) {
    console.error("Insights generation failed:", error);

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
