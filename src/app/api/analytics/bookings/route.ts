import { NextResponse } from "next/server";

const BASE = "https://connect.squareup.com";
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

async function getAllBookings() {
  const results: any[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({
      location_id: LOCATION_ID,
      limit: "100",
    });

    if (cursor) params.set("cursor", cursor);

    const data = await squareFetch(`/v2/bookings?${params}`);

    results.push(...(data.bookings ?? []));
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

async function getCatalog() {
  const results: any[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({
      types: "ITEM,ITEM_VARIATION",
    });

    if (cursor) params.set("cursor", cursor);

    const data = await squareFetch(
      `/v2/catalog/list?${params}`
    );

    results.push(...(data.objects ?? []));
    cursor = data.cursor;
  } while (cursor);

  return results;
}

function centsToMoney(cents: number) {
  return Math.round((cents / 100) * 100) / 100;
}

function localDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.BUSINESS_TIMEZONE || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function localHour(date: Date) {
  return Number(
    new Intl.DateTimeFormat("en-AU", {
      timeZone: process.env.BUSINESS_TIMEZONE || "UTC",
      hour: "2-digit",
      hour12: false,
    }).format(date)
  );
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
          ttlSeconds: CACHE_TTL_MS / 1000,
        },
      });
    }

    const started = Date.now();

    const [bookings, customers, catalog] = await Promise.all([
      getAllBookings(),
      getAllCustomers(),
      getCatalog(),
    ]);

    const customerMap = new Map(
      customers.map((customer) => [customer.id, customer])
    );

    const variationMap = new Map<string, any>();

    // Build the variation map from ITEM parents first.
    // Square commonly names the variation itself "Regular",
    // while the useful salon service name lives on the parent ITEM.
    for (const object of catalog) {
      if (object.type !== "ITEM") continue;

      const parentItemName =
        object.item_data?.name?.trim() || null;

      for (const variation of object.item_data?.variations ?? []) {
        variationMap.set(variation.id, {
          ...variation,
          parentItemName,
        });
      }
    }

    // Fill any orphan ITEM_VARIATION records without overwriting
    // the richer parent-item mappings above.
    for (const object of catalog) {
      if (
        object.type === "ITEM_VARIATION" &&
        !variationMap.has(object.id)
      ) {
        variationMap.set(object.id, {
          ...object,
          parentItemName: null,
        });
      }
    }

    const now = new Date();

    const rows = bookings
      .filter((booking) => booking.start_at)
      .map((booking) => {
        const customer = customerMap.get(booking.customer_id);

        const customerName =
          customer?.given_name || customer?.family_name
            ? `${customer?.given_name ?? ""} ${
                customer?.family_name ?? ""
              }`.trim()
            : "Client";

        const segments = booking.appointment_segments ?? [];

        let durationMinutes = 0;
        let estimatedValueCents = 0;

        const serviceNames: string[] = [];

        for (const segment of segments) {
          durationMinutes += Number(
            segment.duration_minutes ?? 0
          );

          const variation = variationMap.get(
            segment.service_variation_id
          );

          const variationData =
            variation?.item_variation_data ?? {};

          const variationName =
            variationData.name?.trim() || null;

          const serviceName =
            variation?.parentItemName?.trim() ||
            (variationName &&
            variationName.toLowerCase() !== "regular"
              ? variationName
              : null) ||
            "Booked service";

          serviceNames.push(serviceName);

          estimatedValueCents += Number(
            variationData.price_money?.amount ?? 0
          );
        }

        const start = new Date(booking.start_at);
        const end = new Date(
          start.getTime() + durationMinutes * 60_000
        );

        return {
          id: booking.id,
          customerId: booking.customer_id ?? null,
          customerName,

          startAt: booking.start_at,
          endAt: end.toISOString(),

          localDate: localDateKey(start),
          localHour: localHour(start),

          status: booking.status ?? "UNKNOWN",

          services: [...new Set(serviceNames)],
          serviceCount: segments.length,

          durationMinutes,
          estimatedValue: centsToMoney(
            estimatedValueCents
          ),

          teamMemberId:
            segments[0]?.team_member_id ?? null,

          createdAt: booking.created_at ?? null,
          updatedAt: booking.updated_at ?? null,
        };
      })
      .sort(
        (a, b) =>
          new Date(a.startAt).getTime() -
          new Date(b.startAt).getTime()
      );

    const future = rows.filter(
      (booking) =>
        new Date(booking.startAt) >= now &&
        !["CANCELLED_BY_CUSTOMER", "CANCELLED_BY_SELLER"].includes(
          booking.status
        )
    );

    const next7 = future.filter(
      (booking) =>
        new Date(booking.startAt).getTime() <=
        now.getTime() + 7 * 86_400_000
    );

    const next30 = future.filter(
      (booking) =>
        new Date(booking.startAt).getTime() <=
        now.getTime() + 30 * 86_400_000
    );

    const futureValue = future.reduce(
      (sum, booking) => sum + booking.estimatedValue,
      0
    );

    const next30Value = next30.reduce(
      (sum, booking) => sum + booking.estimatedValue,
      0
    );

    const futureMinutes = future.reduce(
      (sum, booking) => sum + booking.durationMinutes,
      0
    );

    const next30Minutes = next30.reduce(
      (sum, booking) => sum + booking.durationMinutes,
      0
    );

    const dayMap = new Map<
      string,
      {
        date: string;
        bookings: number;
        minutes: number;
        estimatedValue: number;
      }
    >();

    for (const booking of future) {
      const day = dayMap.get(booking.localDate) ?? {
        date: booking.localDate,
        bookings: 0,
        minutes: 0,
        estimatedValue: 0,
      };

      day.bookings += 1;
      day.minutes += booking.durationMinutes;
      day.estimatedValue += booking.estimatedValue;

      dayMap.set(booking.localDate, day);
    }

    const futureDays = [...dayMap.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((day) => ({
        ...day,
        estimatedValue:
          Math.round(day.estimatedValue * 100) / 100,
        bookedHours:
          Math.round((day.minutes / 60) * 10) / 10,
      }));

    const busiestFutureDay =
      [...futureDays].sort(
        (a, b) => b.minutes - a.minutes
      )[0] ?? null;

    const hourMap = new Map<
      number,
      { hour: number; bookings: number; minutes: number }
    >();

    for (const booking of future) {
      const hour = booking.localHour;

      const row = hourMap.get(hour) ?? {
        hour,
        bookings: 0,
        minutes: 0,
      };

      row.bookings += 1;
      row.minutes += booking.durationMinutes;

      hourMap.set(hour, row);
    }

    const startHourPerformance = [...hourMap.values()]
      .sort((a, b) => a.hour - b.hour)
      .map((row) => ({
        ...row,
        bookedHours:
          Math.round((row.minutes / 60) * 10) / 10,
      }));

    const statusCounts = rows.reduce(
      (acc: Record<string, number>, booking) => {
        acc[booking.status] =
          (acc[booking.status] ?? 0) + 1;

        return acc;
      },
      {}
    );

    const payload = {
      success: true,
      generatedAt: new Date().toISOString(),

      summary: {
        bookingsReturned: rows.length,
        futureBookings: future.length,
        next7Bookings: next7.length,
        next30Bookings: next30.length,

        estimatedFutureValue:
          Math.round(futureValue * 100) / 100,

        estimatedNext30Value:
          Math.round(next30Value * 100) / 100,

        futureBookedHours:
          Math.round((futureMinutes / 60) * 10) / 10,

        next30BookedHours:
          Math.round((next30Minutes / 60) * 10) / 10,

        futureBookedDays: futureDays.length,

        averageBookingValue:
          future.length > 0
            ? Math.round(
                (futureValue / future.length) * 100
              ) / 100
            : 0,

        averageDurationMinutes:
          future.length > 0
            ? Math.round(
                futureMinutes / future.length
              )
            : 0,
      },

      nextBookings: future.slice(0, 25),
      futureDays: futureDays.slice(0, 60),
      busiestFutureDay,
      startHourPerformance,
      statusCounts,

      diagnostics: {
        rawBookings: bookings.length,
        customers: customers.length,
        catalogObjects: catalog.length,
        catalogVariations: variationMap.size,
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
        ttlSeconds: CACHE_TTL_MS / 1000,
      },
    });
  } catch (error) {
    console.error("Booking analytics failed:", error);

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
