"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  CircleDollarSign,
  LayoutDashboard,
  LoaderCircle,
  Scissors,
  Sparkles,
  Users,
  WalletCards,
} from "lucide-react";

type Analytics = {
  generatedAt: string;
  dataRange: {
    firstPayment: string | null;
    latestPayment: string | null;
  };
  totals: {
    revenue: number;
    grossRevenue: number;
    refunds: number;
    payments: number;
    orders: number;
    customers: number;
    averageSale: number;
    customersWithPayments: number;
    repeatCustomers: number;
    repeatRate: number;
  };
  currentPeriod: {
    monthRevenue: number;
    previousComparableRevenue: number;
    percentageChange: number | null;
  };
  monthlyRevenue: {
    month: string;
    revenue: number;
    transactions: number;
    averageSale: number;
  }[];
  paymentMethods: {
    method: string;
    revenue: number;
  }[];
  topServices: {
    name: string;
    quantity: number;
    revenue: number;
  }[];
  topCustomers: {
    customerId: string;
    name: string;
    lifetimeSpend: number;
    transactions: number;
  }[];
};

const BUSINESS_LOCALE =
  process.env.NEXT_PUBLIC_BUSINESS_LOCALE || "en-US";

const BUSINESS_CURRENCY =
  process.env.NEXT_PUBLIC_BUSINESS_CURRENCY || "USD";

const BUSINESS_TIMEZONE =
  process.env.NEXT_PUBLIC_BUSINESS_TIMEZONE || "UTC";

const money = new Intl.NumberFormat(BUSINESS_LOCALE, {
  style: "currency",
  currency: BUSINESS_CURRENCY,
  maximumFractionDigits: 0,
});

const compactMoney = new Intl.NumberFormat(BUSINESS_LOCALE, {
  style: "currency",
  currency: BUSINESS_CURRENCY,
  notation: "compact",
  maximumFractionDigits: 1,
});

function StatCard({
  title,
  value,
  detail,
  icon: Icon,
  change,
}: {
  title: string;
  value: string;
  detail: string;
  icon: React.ElementType;
  change?: number | null;
}) {
  return (
    <div className="rounded-3xl border border-black/[0.06] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f3f1ed]">
          <Icon size={18} strokeWidth={1.8} />
        </div>

        {change !== undefined && change !== null && (
          <div
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
              change >= 0
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-600"
            }`}
          >
            {change >= 0 ? (
              <ArrowUpRight size={13} />
            ) : (
              <ArrowDownRight size={13} />
            )}
            {Math.abs(change).toFixed(1)}%
          </div>
        )}
      </div>

      <div className="mt-6">
        <p className="text-sm text-black/45">{title}</p>
        <p className="mt-1 text-3xl font-semibold tracking-[-0.04em]">
          {value}
        </p>
        <p className="mt-2 text-xs text-black/40">{detail}</p>
      </div>
    </div>
  );
}


type RevenueAnalytics = {
  summary: {
    lifetimeRevenue: number;
    grossRevenue: number;
    refunds: number;
    transactions: number;
    averageSale: number;
    ytd: number;
    previousYtd: number;
    ytdChange: number | null;
    monthRevenue: number;
    monthForecast: number;
    runRateMonthForecast: number;
    daysElapsedInMonth: number;
    daysInMonth: number;
  };
  bestDay: {
    date: string;
    revenue: number;
    transactions: number;
    averageSale: number;
  } | null;
  bestMonth: {
    month: string;
    year: number;
    monthNumber: number;
    revenue: number;
    transactions: number;
  } | null;
  dailyRevenue: {
    date: string;
    revenue: number;
    transactions: number;
    averageSale: number;
  }[];
  monthlyRevenue: {
    month: string;
    year: number;
    monthNumber: number;
    revenue: number;
    transactions: number;
  }[];
  weekdayPerformance: {
    day: string;
    revenue: number;
    transactions: number;
    averageSale: number;
  }[];
  paymentMethods: {
    method: string;
    revenue: number;
  }[];
};

function RevenueView() {
  const [revenue, setRevenue] = useState<RevenueAnalytics | null>(null);
  const [range, setRange] = useState<"12m" | "24m" | "all">("12m");

  useEffect(() => {
    fetch("/api/analytics/revenue")
      .then((res) => res.json())
      .then((json) => {
        if (!json.success) throw new Error(json.error);
        setRevenue(json);
      })
      .catch(console.error);
  }, []);

  const chart = useMemo(() => {
    if (!revenue) return [];

    const source =
      range === "12m"
        ? revenue.monthlyRevenue.slice(-12)
        : range === "24m"
        ? revenue.monthlyRevenue.slice(-24)
        : revenue.monthlyRevenue;

    return source.map((row) => ({
      ...row,
      label: new Date(
        row.year,
        row.monthNumber - 1,
        1
      ).toLocaleDateString(BUSINESS_LOCALE, {
        month: "short",
        year: "2-digit",
      }),
    }));
  }, [revenue, range]);

  if (!revenue) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-black/40">
          <LoaderCircle size={18} className="animate-spin" />
          Loading revenue analytics…
        </div>
      </div>
    );
  }

  const cardRevenue =
    revenue.paymentMethods.find((x) => x.method === "Card")?.revenue ?? 0;

  const cashRevenue =
    revenue.paymentMethods.find((x) => x.method === "Cash")?.revenue ?? 0;

  const totalMethodRevenue = revenue.paymentMethods.reduce(
    (sum, x) => sum + x.revenue,
    0
  );



  return (
    <>
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm text-black/40">Financial performance</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-[-0.05em]">
            Revenue
          </h2>
        </div>

        <div className="flex rounded-full border border-black/[0.07] bg-white p-1 text-xs">
          {(["12m", "24m", "all"] as const).map((item) => (
            <button
              key={item}
              onClick={() => setRange(item)}
              className={`rounded-full px-4 py-2 transition ${
                range === item
                  ? "bg-black text-white"
                  : "text-black/40 hover:text-black"
              }`}
            >
              {item === "all" ? "All" : item.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Sales YTD"
          value={money.format(revenue.summary.ytd)}
          detail={`${money.format(
            revenue.summary.previousYtd
          )} at this point last year`}
          icon={CircleDollarSign}
          change={revenue.summary.ytdChange}
        />

        <StatCard
          title="Sales this month"
          value={money.format(revenue.summary.monthRevenue)}
          detail="Completed Square sales so far"
          icon={CalendarDays}
        />

        <StatCard
          title="Projected month-end"
          value={money.format(revenue.summary.monthForecast)}
          detail={`Based on ${money.format(revenue.summary.monthRevenue)} sales MTD`}
          icon={Sparkles}
        />

        <StatCard
          title="Average transaction"
          value={money.format(revenue.summary.averageSale)}
          detail={`${revenue.summary.transactions} completed payments`}
          icon={WalletCards}
        />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.65fr_.85fr]">
        <div className="rounded-3xl border border-black/[0.06] bg-white p-6">
          <div>
            <p className="text-sm font-medium">Sales history</p>
            <p className="mt-1 text-xs text-black/40">
              Monthly completed Square sales
            </p>
          </div>

          <div className="mt-7 h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart}>
                <defs>
                  <linearGradient
                    id="revenuePageGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="#171717"
                      stopOpacity={0.16}
                    />
                    <stop
                      offset="100%"
                      stopColor="#171717"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  vertical={false}
                  stroke="#000"
                  strokeOpacity={0.05}
                />

                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "#999" }}
                  minTickGap={24}
                />

                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "#999" }}
                  tickFormatter={(v) => `$${v / 1000}k`}
                  width={42}
                />

                <Tooltip
                  formatter={(value) => [
                    money.format(Number(value)),
                    "Revenue",
                  ]}
                  contentStyle={{
                    borderRadius: 16,
                    border: "1px solid rgba(0,0,0,.06)",
                  }}
                />

                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#171717"
                  strokeWidth={2}
                  fill="url(#revenuePageGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-3xl bg-[#171717] p-6 text-white">
          <p className="text-sm font-medium">Records</p>
          <p className="mt-1 text-xs text-white/40">
            Across complete Square history
          </p>

          <div className="mt-8">
            <p className="text-xs text-white/40">Best month</p>
            <p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
              {revenue.bestMonth
                ? money.format(revenue.bestMonth.revenue)
                : "—"}
            </p>
            <p className="mt-1 text-sm text-white/50">
              {revenue.bestMonth
                ? new Date(
                    revenue.bestMonth.year,
                    revenue.bestMonth.monthNumber - 1
                  ).toLocaleDateString(BUSINESS_LOCALE, {
                    month: "long",
                    year: "numeric",
                  })
                : ""}
            </p>
          </div>

          <div className="mt-8 border-t border-white/10 pt-7">
            <p className="text-xs text-white/40">Best recorded day</p>
            <p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
              {revenue.bestDay
                ? money.format(revenue.bestDay.revenue)
                : "—"}
            </p>
            <p className="mt-1 text-sm text-white/50">
              {revenue.bestDay
                ? new Date(
                    `${revenue.bestDay.date}T12:00:00`
                  ).toLocaleDateString(BUSINESS_LOCALE, {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : ""}
            </p>
          </div>

          <div className="mt-8 border-t border-white/10 pt-7">
            <p className="text-xs text-white/40">Total sales</p>
            <p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
              {money.format(revenue.summary.grossRevenue)}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <div className="rounded-3xl border border-black/[0.06] bg-white p-6">
          <p className="text-sm font-medium">Revenue by day of week</p>
          <p className="mt-1 text-xs text-black/40">
            Which trading days generate the most revenue
          </p>

          <div className="mt-6 h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenue.weekdayPerformance}>
                <CartesianGrid
                  vertical={false}
                  stroke="#000"
                  strokeOpacity={0.05}
                />

                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "#888" }}
                  tickFormatter={(value) => value.slice(0, 3)}
                />

                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "#999" }}
                  tickFormatter={(v) => `$${v / 1000}k`}
                  width={42}
                />

                <Tooltip
                  formatter={(value) => [
                    money.format(Number(value)),
                    "Revenue",
                  ]}
                  contentStyle={{
                    borderRadius: 16,
                    border: "1px solid rgba(0,0,0,.06)",
                  }}
                />

                <Bar
                  dataKey="revenue"
                  fill="#171717"
                  radius={[8, 8, 2, 2]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-3xl border border-black/[0.06] bg-white p-6">
          <p className="text-sm font-medium">Payment mix</p>
          <p className="mt-1 text-xs text-black/40">
            How clients pay
          </p>

          <div className="mt-8">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-black/40">Card</p>
                <p className="mt-1 text-2xl font-semibold">
                  {money.format(cardRevenue)}
                </p>
              </div>
              <p className="text-sm font-semibold">
                {totalMethodRevenue
                  ? ((cardRevenue / totalMethodRevenue) * 100).toFixed(1)
                  : 0}
                %
              </p>
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/[0.06]">
              <div
                className="h-full rounded-full bg-black"
                style={{
                  width: `${
                    totalMethodRevenue
                      ? (cardRevenue / totalMethodRevenue) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>

          <div className="mt-8">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-black/40">Cash</p>
                <p className="mt-1 text-2xl font-semibold">
                  {money.format(cashRevenue)}
                </p>
              </div>
              <p className="text-sm font-semibold">
                {totalMethodRevenue
                  ? ((cashRevenue / totalMethodRevenue) * 100).toFixed(1)
                  : 0}
                %
              </p>
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/[0.06]">
              <div
                className="h-full rounded-full bg-black/40"
                style={{
                  width: `${
                    totalMethodRevenue
                      ? (cashRevenue / totalMethodRevenue) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>

          <div className="mt-8 border-t border-black/[0.06] pt-6">
            <div className="flex justify-between text-sm">
              <span className="text-black/40">Refunds</span>
              <span className="font-semibold">
                {money.format(revenue.summary.refunds)}
              </span>
            </div>

            <div className="mt-4 flex justify-between text-sm">
              <span className="text-black/40">Total sales</span>
              <span className="font-semibold">
                {money.format(revenue.summary.grossRevenue)}
              </span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}


type ClientAnalytics = {
  summary: {
    paymentProfiles: number;
    currentProfiles: number;
    repeatCustomers: number;
    repeatRate: number;
    currentPaymentProfiles: number;
    historicalOnlyProfiles: number;
    currentRepeatCustomers: number;
    currentRepeatRate: number;
    activeCustomers: number;
    coolingCustomers: number;
    lapsedCustomers: number;
    overdueCustomers: number;
    averageLifetimeValue: number;
    averageTransactions: number;
    top10RevenueShare: number;
  };
  topCustomers: ClientRow[];
  recentCustomers: ClientRow[];
  overdueCustomers: ClientRow[];
  acquisition: {
    month: string;
    clients: number;
  }[];
};

type ClientRow = {
  customerId: string;
  name: string;
  currentProfile: boolean;
  lifetimeSpend: number;
  transactions: number;
  averageSpend: number;
  firstVisit: string;
  lastVisit: string;
  daysSinceLastVisit: number;
  averageVisitGap: number | null;
  expectedReturnDays: number | null;
  overdueDays: number;
  status: "active" | "cooling" | "lapsed";
};

function CustomersView() {
  const [clients, setCustomers] = useState<ClientAnalytics | null>(null);
  const [clientTab, setClientTab] = useState<
    "top" | "recent" | "due"
  >("top");

  useEffect(() => {
    fetch("/api/analytics/clients")
      .then((res) => res.json())
      .then((json) => {
        if (!json.success) throw new Error(json.error);
        setCustomers(json);
      })
      .catch(console.error);
  }, []);

  const acquisitionChart = useMemo(() => {
    if (!clients) return [];

    return clients.acquisition.slice(-18).map((row) => ({
      ...row,
      label: new Date(`${row.month}-01T12:00:00`).toLocaleDateString(
        BUSINESS_LOCALE,
        {
          month: "short",
          year: "2-digit",
        }
      ),
    }));
  }, [clients]);

  if (!clients) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-black/40">
          <LoaderCircle size={18} className="animate-spin" />
          Analysing client history…
        </div>
      </div>
    );
  }

  // The API owns the return-opportunity definition.
  const dueCustomers = [...clients.overdueCustomers].sort(
    (a, b) => b.overdueDays - a.overdueDays
  );

  const rows =
    clientTab === "top"
      ? clients.topCustomers
      : clientTab === "recent"
      ? clients.recentCustomers
      : dueCustomers;

  return (
    <>
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm text-black/40">Customer intelligence</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-[-0.05em]">
            Customers
          </h2>
        </div>

        <div className="rounded-full border border-black/[0.07] bg-white px-4 py-2 text-xs text-black/45">
          {clients.summary.currentProfiles} current Square profiles
        </div>
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Active customers"
          value={String(clients.summary.activeCustomers)}
          detail="Seen within the last 90 days"
          icon={Users}
        />

        <StatCard
          title="Repeat customer rate"
          value={`${clients.summary.currentRepeatRate}%`}
          detail={`${clients.summary.currentRepeatCustomers} current repeat customers`}
          icon={Sparkles}
        />

        <StatCard
          title="Average customer value"
          value={money.format(clients.summary.averageLifetimeValue)}
          detail={`${clients.summary.averageTransactions} transactions per client`}
          icon={CircleDollarSign}
        />

        <StatCard
          title="Top 10 revenue share"
          value={`${clients.summary.top10RevenueShare}%`}
          detail="Share generated by top 10 clients"
          icon={WalletCards}
        />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_.75fr]">
        <div className="rounded-3xl border border-black/[0.06] bg-white p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-medium">Client activity</p>
              <p className="mt-1 text-xs text-black/40">
                Value, frequency and return behaviour
              </p>
            </div>

            <div className="flex rounded-full bg-[#f5f3ef] p-1 text-xs">
              {[
                ["top", "Top value"],
                ["recent", "Recent"],
                ["due", "Due to return"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() =>
                    setClientTab(key as "top" | "recent" | "due")
                  }
                  className={`rounded-full px-3 py-2 transition ${
                    clientTab === key
                      ? "bg-black text-white"
                      : "text-black/40"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[680px] text-left">
              <thead>
                <tr className="border-b border-black/[0.06] text-[11px] uppercase tracking-[0.08em] text-black/30">
                  <th className="pb-3 font-medium">Client</th>
                  <th className="pb-3 font-medium">Lifetime</th>
                  <th className="pb-3 font-medium">Visits</th>
                  <th className="pb-3 font-medium">Avg spend</th>
                  <th className="pb-3 font-medium">Last visit</th>
                  <th className="pb-3 text-right font-medium">
                    {clientTab === "due" ? "Overdue" : "Status"}
                  </th>
                </tr>
              </thead>

              <tbody>
                {rows.slice(0, 12).map((client) => (
                  <tr
                    key={client.customerId}
                    className="border-b border-black/[0.05] last:border-0"
                  >
                    <td className="py-4 pr-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f3f1ed] text-xs font-semibold">
                          {client.name === "Historical customer"
                            ? "H"
                            : client.name
                                .split(" ")
                                .filter(Boolean)
                                .slice(0, 2)
                                .map((x) => x[0])
                                .join("")
                                .toUpperCase()}
                        </div>

                        <div>
                          <p className="text-sm font-medium">
                            {client.name}
                          </p>
                          <p className="mt-0.5 text-[11px] text-black/30">
                            {client.currentProfile
                              ? "Current profile"
                              : "Historical record"}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="py-4 text-sm font-semibold">
                      {money.format(client.lifetimeSpend)}
                    </td>

                    <td className="py-4 text-sm text-black/55">
                      {client.transactions}
                    </td>

                    <td className="py-4 text-sm text-black/55">
                      {money.format(client.averageSpend)}
                    </td>

                    <td className="py-4 text-sm text-black/55">
                      {new Date(client.lastVisit).toLocaleDateString(
                        BUSINESS_LOCALE,
                        {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        }
                      )}
                    </td>

                    <td className="py-4 text-right">
                      {clientTab === "due" ? (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                          {client.overdueDays}d overdue
                        </span>
                      ) : (
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            client.status === "active"
                              ? "bg-emerald-50 text-emerald-700"
                              : client.status === "cooling"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-black/[0.05] text-black/45"
                          }`}
                        >
                          {client.status}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}

                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-12 text-center text-sm text-black/35"
                    >
                      No clients in this group.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-3xl bg-[#171717] p-6 text-white">
          <p className="text-sm font-medium">Client health</p>
          <p className="mt-1 text-xs text-white/40">
            Based on last recorded visit
          </p>

          <div className="mt-8">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-white/40">Active</p>
                <p className="mt-1 text-3xl font-semibold">
                  {clients.summary.activeCustomers}
                </p>
              </div>
              <span className="text-xs text-emerald-400">
                ≤ 90 days
              </span>
            </div>

            <div className="mt-7 border-t border-white/10 pt-6">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-white/40">Cooling</p>
                  <p className="mt-1 text-3xl font-semibold">
                    {clients.summary.coolingCustomers}
                  </p>
                </div>
                <span className="text-xs text-amber-300">
                  91–180 days
                </span>
              </div>
            </div>

            <div className="mt-7 border-t border-white/10 pt-6">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-white/40">Lapsed</p>
                  <p className="mt-1 text-3xl font-semibold">
                    {clients.summary.lapsedCustomers}
                  </p>
                </div>
                <span className="text-xs text-white/35">
                  180+ days
                </span>
              </div>
            </div>

            <div className="mt-7 rounded-2xl bg-white/[0.06] p-4">
              <p className="text-xs text-white/45">
                Return opportunity
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {dueCustomers.length}
              </p>
              <p className="mt-1 text-xs leading-5 text-white/40">
                Repeat customers seen within the last year who are now
                beyond their usual visit cadence.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.3fr_.7fr]">
        <div className="rounded-3xl border border-black/[0.06] bg-white p-6">
          <p className="text-sm font-medium">Client acquisition</p>
          <p className="mt-1 text-xs text-black/40">
            First recorded payment by month
          </p>

          <div className="mt-6 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={acquisitionChart}>
                <CartesianGrid
                  vertical={false}
                  stroke="#000"
                  strokeOpacity={0.05}
                />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "#999" }}
                  minTickGap={20}
                />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "#999" }}
                  width={30}
                />
                <Tooltip
                  formatter={(value) => [
                    `${value} clients`,
                    "New clients",
                  ]}
                  contentStyle={{
                    borderRadius: 16,
                    border: "1px solid rgba(0,0,0,.06)",
                  }}
                />
                <Bar
                  dataKey="clients"
                  fill="#171717"
                  radius={[7, 7, 2, 2]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-3xl border border-black/[0.06] bg-white p-6">
          <p className="text-sm font-medium">Client database</p>
          <p className="mt-1 text-xs text-black/40">
            Understanding the Square history
          </p>

          <div className="mt-7 space-y-6">
            <div>
              <p className="text-xs text-black/40">
                Current Square profiles
              </p>
              <p className="mt-1 text-3xl font-semibold">
                {clients.summary.currentProfiles}
              </p>
            </div>

            <div className="border-t border-black/[0.06] pt-5">
              <p className="text-xs text-black/40">
                Current profiles with payment history
              </p>
              <p className="mt-1 text-3xl font-semibold">
                {clients.summary.currentPaymentProfiles}
              </p>
              <p className="mt-1 text-xs text-black/35">
                {clients.summary.historicalOnlyProfiles} historical-only payment profiles retained
              </p>
            </div>

            <div className="border-t border-black/[0.06] pt-5">
              <p className="text-xs text-black/40">
                Average transactions
              </p>
              <p className="mt-1 text-3xl font-semibold">
                {clients.summary.averageTransactions}
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}


type ServiceRow = {
  name: string;
  category: string;
  quantity: number;
  revenue: number;
  orders: number;
  averageValue: number;
  revenueShare: number;
};

type ServiceAnalytics = {
  summary: {
    totalRevenue: number;
    units: number;
    uniqueServices: number;
    averageServiceValue: number;
  };
  highestAverage: ServiceRow | null;
  mostPopular: ServiceRow | null;
  services: ServiceRow[];
  categories: {
    category: string;
    quantity: number;
    revenue: number;
    averageValue: number;
    share: number;
  }[];
  trends: {
    category: string;
    recentRevenue: number;
    previousRevenue: number;
    change: number | null;
  }[];
  monthlyCategoryRevenue: Record<string, string | number>[];
};

function ServicesView() {
  const [services, setServices] = useState<ServiceAnalytics | null>(null);
  const [category, setCategory] = useState("All");

  useEffect(() => {
    fetch("/api/analytics/services")
      .then((res) => res.json())
      .then((json) => {
        if (!json.success) throw new Error(json.error);
        setServices(json);
      })
      .catch(console.error);
  }, []);

  const filtered = useMemo(() => {
    if (!services) return [];

    return services.services.filter(
      (service) =>
        service.name !== "Unknown item" &&
        (category === "All" || service.category === category)
    );
  }, [services, category]);

  if (!services) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-black/40">
          <LoaderCircle size={18} className="animate-spin" />
          Analysing services…
        </div>
      </div>
    );
  }

  const topCategory = services.categories[0];

  const strongestGrowth = [...services.trends]
    .filter(
      (trend) =>
        trend.change !== null &&
        trend.category !== "Other"
    )
    .sort((a, b) => (b.change ?? 0) - (a.change ?? 0))[0];

  const maxCategoryValue = Math.max(
    ...services.categories.map((item) => item.revenue),
    1
  );

  return (
    <>
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm text-black/40">Product & service performance</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-[-0.05em]">
            Services
          </h2>
        </div>

        <div className="rounded-full border border-black/[0.07] bg-white px-4 py-2 text-xs text-black/45">
          {services.summary.uniqueServices} historical line-item names
        </div>
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Completed product & service sales"
          value={compactMoney.format(services.summary.totalRevenue)}
          detail={`${services.summary.units.toLocaleString()} completed line items`}
          icon={CircleDollarSign}
        />

        <StatCard
          title="Largest category"
          value={topCategory?.category ?? "—"}
          detail={
            topCategory
              ? `${topCategory.share}% of completed product & service sales`
              : ""
          }
          icon={Scissors}
        />

        <StatCard
          title="Most popular"
          value={services.mostPopular?.quantity.toString() ?? "—"}
          detail={services.mostPopular?.name ?? ""}
          icon={Users}
        />

        <StatCard
          title="Highest average"
          value={
            services.highestAverage
              ? money.format(services.highestAverage.averageValue)
              : "—"
          }
          detail={services.highestAverage?.name ?? ""}
          icon={Sparkles}
        />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <div className="rounded-3xl border border-black/[0.06] bg-white p-6">
          <div>
            <p className="text-sm font-medium">Product & service mix</p>
            <p className="mt-1 text-xs text-black/40">
              Completed product & service sales by category
            </p>
          </div>

          <div className="mt-7 space-y-6">
            {services.categories.map((item) => (
              <div key={item.category}>
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">
                      {item.category}
                    </p>
                    <p className="mt-1 text-xs text-black/35">
                      {item.quantity} units · avg{" "}
                      {money.format(item.averageValue)}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-sm font-semibold">
                      {money.format(item.revenue)}
                    </p>
                    <p className="mt-1 text-xs text-black/35">
                      {item.share}%
                    </p>
                  </div>
                </div>

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/[0.05]">
                  <div
                    className="h-full rounded-full bg-black"
                    style={{
                      width: `${
                        (item.revenue / maxCategoryValue) * 100
                      }%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl bg-[#171717] p-6 text-white">
          <p className="text-sm font-medium">Category momentum</p>
          <p className="mt-1 text-xs text-white/40">
            Recent 6 months vs previous 6
          </p>

          <div className="mt-7 space-y-1">
            {services.trends
              .filter((trend) => trend.category !== "Other")
              .sort(
                (a, b) =>
                  (b.recentRevenue ?? 0) -
                  (a.recentRevenue ?? 0)
              )
              .map((trend) => (
                <div
                  key={trend.category}
                  className="flex items-center justify-between border-b border-white/10 py-4 last:border-0"
                >
                  <div>
                    <p className="text-sm">{trend.category}</p>
                    <p className="mt-1 text-xs text-white/35">
                      {money.format(trend.recentRevenue)}
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      (trend.change ?? 0) >= 0
                        ? "bg-emerald-400/10 text-emerald-300"
                        : "bg-red-400/10 text-red-300"
                    }`}
                  >
                    {trend.change === null
                      ? "—"
                      : `${trend.change > 0 ? "+" : ""}${
                          trend.change
                        }%`}
                  </span>
                </div>
              ))}
          </div>

          {strongestGrowth && (
            <div className="mt-6 rounded-2xl bg-white/[0.06] p-4">
              <p className="text-xs text-white/40">
                Strongest category growth
              </p>
              <p className="mt-2 text-xl font-semibold">
                {strongestGrowth.category}
              </p>
              <p className="mt-1 text-sm text-emerald-300">
                +{strongestGrowth.change}% recent period
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="mt-4 rounded-3xl border border-black/[0.06] bg-white p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-medium">Product & service leaderboard</p>
            <p className="mt-1 text-xs text-black/40">
              Completed order line performance
            </p>
          </div>

          <div className="flex flex-wrap gap-1 rounded-2xl bg-[#f5f3ef] p-1 text-xs">
            {["All", ...services.categories.map((x) => x.category)].map(
              (item) => (
                <button
                  key={item}
                  onClick={() => setCategory(item)}
                  className={`rounded-xl px-3 py-2 transition ${
                    category === item
                      ? "bg-black text-white"
                      : "text-black/40 hover:text-black"
                  }`}
                >
                  {item}
                </button>
              )
            )}
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b border-black/[0.06] text-[11px] uppercase tracking-[0.08em] text-black/30">
                <th className="pb-3 font-medium">Service</th>
                <th className="pb-3 font-medium">Category</th>
                <th className="pb-3 font-medium">Units</th>
                <th className="pb-3 font-medium">Avg value</th>
                <th className="pb-3 font-medium">Sales</th>
                <th className="pb-3 text-right font-medium">Share</th>
              </tr>
            </thead>

            <tbody>
              {filtered.slice(0, 20).map((service, index) => (
                <tr
                  key={`${service.name}-${index}`}
                  className="border-b border-black/[0.05] last:border-0"
                >
                  <td className="max-w-[340px] py-4 pr-6">
                    <p className="truncate text-sm font-medium">
                      {service.name}
                    </p>
                  </td>

                  <td className="py-4 text-sm text-black/45">
                    {service.category}
                  </td>

                  <td className="py-4 text-sm text-black/55">
                    {service.quantity}
                  </td>

                  <td className="py-4 text-sm text-black/55">
                    {money.format(service.averageValue)}
                  </td>

                  <td className="py-4 text-sm font-semibold">
                    {money.format(service.revenue)}
                  </td>

                  <td className="py-4 text-right text-sm text-black/45">
                    {service.revenueShare}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-4 rounded-2xl border border-black/[0.05] bg-white/50 px-5 py-4 text-xs leading-5 text-black/40">
        Service figures use completed Square order line items only. They describe
        which services generated completed sales. The Revenue workspace uses completed
        Square payments for financial totals, payment methods and refunds.
      </div>
    </>
  );
}


type BookingRow = {
  id: string;
  customerId: string | null;
  customerName: string;
  startAt: string;
  endAt: string;
  localDate: string;
  localHour: number;
  status: string;
  services: string[];
  serviceCount: number;
  durationMinutes: number;
  estimatedValue: number;
  teamMemberId: string | null;
};

type BookingAnalytics = {
  summary: {
    bookingsReturned: number;
    futureBookings: number;
    next7Bookings: number;
    next30Bookings: number;
    estimatedFutureValue: number;
    estimatedNext30Value: number;
    futureBookedHours: number;
    next30BookedHours: number;
    futureBookedDays: number;
    averageBookingValue: number;
    averageDurationMinutes: number;
  };
  nextBookings: BookingRow[];
  futureDays: {
    date: string;
    bookings: number;
    minutes: number;
    estimatedValue: number;
    bookedHours: number;
  }[];
  busiestFutureDay: {
    date: string;
    bookings: number;
    minutes: number;
    estimatedValue: number;
    bookedHours: number;
  } | null;
  statusCounts: Record<string, number>;
};

function BookingsView() {
  const [bookings, setBookings] = useState<BookingAnalytics | null>(null);
  const [bookingsUnavailable, setBookingsUnavailable] = useState(false);
  const [bookingRange, setBookingRange] = useState<"7" | "30">("30");

  useEffect(() => {
    fetch("/api/analytics/bookings")
      .then((res) => res.json())
      .then((json) => {
        if (!json.success) throw new Error(json.error);
        setBookings(json);
      })
      .catch(() => setBookingsUnavailable(true));
  }, []);

  if (bookingsUnavailable) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-6">
        <div className="max-w-md text-center">
          <CalendarDays size={28} className="mx-auto text-black/30" />
          <h2 className="mt-4 text-lg font-semibold">Bookings unavailable</h2>
          <p className="mt-2 text-sm leading-6 text-black/50">
            Square Bookings is not available for this account or the connected credentials do not include access to booking data. Your other SquareScope analytics are unaffected.
          </p>
        </div>
      </div>
    );
  }

  if (!bookings) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-black/40">
          <LoaderCircle size={18} className="animate-spin" />
          Reading forward bookings…
        </div>
      </div>
    );
  }

  const now = Date.now();

  const visibleBookings = bookings.nextBookings.filter((booking) => {
    const delta =
      new Date(booking.startAt).getTime() - now;

    return delta <=
      Number(bookingRange) * 24 * 60 * 60 * 1000;
  });

  const visibleDays = bookings.futureDays.filter((day) => {
    const delta =
      new Date(`${day.date}T23:59:59`).getTime() - now;

    return delta <=
      Number(bookingRange) * 24 * 60 * 60 * 1000;
  });

  const maxHours = Math.max(
    ...visibleDays.map((day) => day.bookedHours),
    1
  );

  const formatTime = (iso: string) =>
    new Intl.DateTimeFormat(BUSINESS_LOCALE, {
      timeZone: BUSINESS_TIMEZONE,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));

  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(BUSINESS_LOCALE, {
      timeZone: BUSINESS_TIMEZONE,
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(new Date(iso));

  return (
    <>
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm text-black/40">Forward schedule</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-[-0.05em]">
            Bookings
          </h2>
        </div>

        <div className="flex rounded-full border border-black/[0.07] bg-white p-1 text-xs">
          {(["7", "30"] as const).map((range) => (
            <button
              key={range}
              onClick={() => setBookingRange(range)}
              className={`rounded-full px-4 py-2 transition ${
                bookingRange === range
                  ? "bg-black text-white"
                  : "text-black/40"
              }`}
            >
              Next {range} days
            </button>
          ))}
        </div>
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Upcoming bookings"
          value={String(
            bookingRange === "7"
              ? bookings.summary.next7Bookings
              : bookings.summary.next30Bookings
          )}
          detail={`Across ${bookings.summary.futureBookedDays} booked days ahead`}
          icon={CalendarDays}
        />

        <StatCard
          title="Forward booked value"
          value={money.format(
            bookingRange === "7"
              ? visibleBookings.reduce(
                  (sum, x) => sum + x.estimatedValue,
                  0
                )
              : bookings.summary.estimatedNext30Value
          )}
          detail="Estimated from booked items"
          icon={CircleDollarSign}
        />

        <StatCard
          title="Booked hours"
          value={`${(
            visibleBookings.reduce(
              (sum, x) => sum + x.durationMinutes,
              0
            ) / 60
          ).toFixed(1)}h`}
          detail="Appointment time currently committed"
          icon={Scissors}
        />

        <StatCard
          title="Average booking"
          value={money.format(
            bookings.summary.averageBookingValue
          )}
          detail={`${bookings.summary.averageDurationMinutes} min average duration`}
          icon={Sparkles}
        />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.45fr_.75fr]">
        <div className="rounded-3xl border border-black/[0.06] bg-white p-6">
          <div>
            <p className="text-sm font-medium">Upcoming appointments</p>
            <p className="mt-1 text-xs text-black/40">
              Live accepted bookings from Square
            </p>
          </div>

          <div className="mt-6">
            {visibleBookings.length === 0 ? (
              <div className="py-12 text-center text-sm text-black/35">
                No bookings in this period.
              </div>
            ) : (
              visibleBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="grid gap-3 border-b border-black/[0.05] py-4 last:border-0 sm:grid-cols-[115px_1fr_auto]"
                >
                  <div>
                    <p className="text-sm font-semibold">
                      {formatDate(booking.startAt)}
                    </p>
                    <p className="mt-1 text-xs text-black/40">
                      {formatTime(booking.startAt)}
                    </p>
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {booking.customerName}
                    </p>
                    <p className="mt-1 truncate text-xs text-black/35">
                      {booking.services.join(", ")}
                      {" · "}
                      {booking.durationMinutes} min
                    </p>
                  </div>

                  <div className="text-left sm:text-right">
                    <p className="text-sm font-semibold">
                      {money.format(booking.estimatedValue)}
                    </p>
                    <span className="mt-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      Accepted
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-3xl bg-[#171717] p-6 text-white">
          <p className="text-sm font-medium">Forward book</p>
          <p className="mt-1 text-xs text-white/40">
            Current appointment pipeline
          </p>

          <div className="mt-8">
            <p className="text-xs text-white/40">
              Estimated booked value
            </p>
            <p className="mt-2 text-4xl font-semibold tracking-[-0.05em]">
              {money.format(bookings.summary.estimatedFutureValue)}
            </p>
          </div>

          <div className="mt-8 border-t border-white/10 pt-6">
            <p className="text-xs text-white/40">
              Total booked hours
            </p>
            <p className="mt-2 text-3xl font-semibold">
              {bookings.summary.futureBookedHours}h
            </p>
          </div>

          <div className="mt-8 border-t border-white/10 pt-6">
            <p className="text-xs text-white/40">
              Average appointment
            </p>
            <p className="mt-2 text-3xl font-semibold">
              {money.format(bookings.summary.averageBookingValue)}
            </p>
          </div>

          {bookings.busiestFutureDay && (
            <div className="mt-8 rounded-2xl bg-white/[0.06] p-4">
              <p className="text-xs text-white/40">
                Busiest upcoming day
              </p>
              <p className="mt-2 text-lg font-semibold">
                {new Date(
                  `${bookings.busiestFutureDay.date}T12:00:00`
                ).toLocaleDateString(BUSINESS_LOCALE, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </p>
              <p className="mt-1 text-xs text-white/45">
                {bookings.busiestFutureDay.bookings} bookings ·{" "}
                {bookings.busiestFutureDay.bookedHours}h ·{" "}
                {money.format(
                  bookings.busiestFutureDay.estimatedValue
                )}
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="mt-4 rounded-3xl border border-black/[0.06] bg-white p-6">
        <div>
          <p className="text-sm font-medium">Forward workload</p>
          <p className="mt-1 text-xs text-black/40">
            Booked hours and estimated value by day
          </p>
        </div>

        <div className="mt-7 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleDays.map((day) => (
            <div
              key={day.date}
              className="rounded-2xl border border-black/[0.06] p-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold">
                    {new Date(
                      `${day.date}T12:00:00`
                    ).toLocaleDateString(BUSINESS_LOCALE, {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                  <p className="mt-1 text-xs text-black/35">
                    {day.bookings}{" "}
                    {day.bookings === 1
                      ? "booking"
                      : "bookings"}
                  </p>
                </div>

                <p className="text-sm font-semibold">
                  {money.format(day.estimatedValue)}
                </p>
              </div>

              <div className="mt-5 flex items-end justify-between">
                <span className="text-xs text-black/40">
                  {day.bookedHours}h booked
                </span>
              </div>

              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/[0.05]">
                <div
                  className="h-full rounded-full bg-black"
                  style={{
                    width: `${Math.max(
                      5,
                      (day.bookedHours / maxHours) * 100
                    )}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-4 rounded-2xl border border-black/[0.05] bg-white/50 px-5 py-4 text-xs leading-5 text-black/40">
        Forward value is an estimate derived from the current Square catalog
        price attached to each booked item variation. It is not recognised
        revenue and may differ from the final amount charged.
      </div>
    </>
  );
}


type BusinessInsight = {
  id: string;
  type: "positive" | "warning" | "opportunity" | "info";
  priority: "high" | "medium" | "low";
  title: string;
  message: string;
  metric?: string;
  source: string;
};

type InsightAnalytics = {
  headline: {
    ytdRevenue: number;
    ytdChange: number;
    monthForecast: number;
    runRateMonthForecast: number;
    bookedMonthOutlook: number;
    remainingMonthBookedValue: number;
    forwardValue: number;
    forwardBookings: number;
    repeatRate: number;
  };
  insights: BusinessInsight[];
};

function InsightsView() {
  const [data, setData] = useState<InsightAnalytics | null>(null);

  useEffect(() => {
    fetch("/api/analytics/insights")
      .then((res) => res.json())
      .then((json) => {
        if (!json.success) throw new Error(json.error);
        setData(json);
      })
      .catch(console.error);
  }, []);

  if (!data) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-black/40">
          <LoaderCircle size={18} className="animate-spin" />
          Interpreting the business…
        </div>
      </div>
    );
  }

  const highPriority = data.insights.filter(
    (x) => x.priority === "high"
  );

  const remaining = data.insights.filter(
    (x) => x.priority !== "high"
  );

  const iconFor = (type: BusinessInsight["type"]) => {
    if (type === "positive") return "↑";
    if (type === "warning") return "↓";
    if (type === "opportunity") return "↗";
    return "•";
  };

  return (
    <>
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm text-black/40">Business intelligence</p>
          <h2 className="mt-1 text-3xl font-semibold tracking-[-0.05em]">
            Insights
          </h2>
        </div>

        <div className="rounded-full border border-black/[0.07] bg-white px-4 py-2 text-xs text-black/45">
          Generated from live Square analytics
        </div>
      </header>

      <section className="mt-8 overflow-hidden rounded-[32px] bg-[#171717] p-7 text-white sm:p-9">
        <div className="grid gap-8 xl:grid-cols-[1.35fr_.65fr] xl:items-end">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-white/35">
              Current position
            </p>

            <h3 className="mt-4 max-w-2xl text-3xl font-semibold leading-tight tracking-[-0.05em] sm:text-4xl">
              Revenue is{" "}
              <span className="text-emerald-300">
                {data.headline.ytdChange >= 0 ? "+" : ""}
                {data.headline.ytdChange.toFixed(1)}%
              </span>{" "}
              YTD with{" "}
              {money.format(data.headline.forwardValue)} currently
              sitting in the forward book.
            </h3>

            <p className="mt-5 max-w-xl text-sm leading-6 text-white/45">
              Your business is tracking toward{" "}
              {money.format(data.headline.monthForecast)} for the
              current month, with a current repeat-customer rate of{" "}
              {data.headline.repeatRate.toFixed(1)}%.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/[0.06] p-4">
              <p className="text-xs text-white/35">YTD revenue</p>
              <p className="mt-2 text-2xl font-semibold">
                {compactMoney.format(data.headline.ytdRevenue)}
              </p>
            </div>

            <div className="rounded-2xl bg-white/[0.06] p-4">
              <p className="text-xs text-white/35">Forward bookings</p>
              <p className="mt-2 text-2xl font-semibold">
                {data.headline.forwardBookings}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-4">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="text-sm font-medium">Needs attention</p>
            <p className="mt-1 text-xs text-black/40">
              Highest-priority signals from the business
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {highPriority.map((insight) => (
            <div
              key={insight.id}
              className="rounded-3xl border border-black/[0.06] bg-white p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-lg font-medium ${
                    insight.type === "positive"
                      ? "bg-emerald-50 text-emerald-700"
                      : insight.type === "warning"
                      ? "bg-red-50 text-red-700"
                      : insight.type === "opportunity"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-black/[0.05]"
                  }`}
                >
                  {iconFor(insight.type)}
                </div>

                {insight.metric && (
                  <span className="text-xl font-semibold tracking-[-0.04em]">
                    {insight.metric}
                  </span>
                )}
              </div>

              <p className="mt-6 text-base font-semibold">
                {insight.title}
              </p>

              <p className="mt-2 text-sm leading-6 text-black/45">
                {insight.message}
              </p>

              <p className="mt-5 text-[10px] uppercase tracking-[0.12em] text-black/25">
                {insight.source}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-4 xl:grid-cols-2">
        {remaining.map((insight) => (
          <div
            key={insight.id}
            className="group rounded-3xl border border-black/[0.06] bg-white p-6"
          >
            <div className="flex gap-5">
              <div
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                  insight.type === "positive"
                    ? "bg-emerald-50 text-emerald-700"
                    : insight.type === "warning"
                    ? "bg-red-50 text-red-700"
                    : insight.type === "opportunity"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-[#f3f1ed] text-black/55"
                }`}
              >
                {iconFor(insight.type)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-4">
                  <p className="font-semibold">{insight.title}</p>

                  {insight.metric && (
                    <span className="shrink-0 text-sm font-semibold">
                      {insight.metric}
                    </span>
                  )}
                </div>

                <p className="mt-2 text-sm leading-6 text-black/45">
                  {insight.message}
                </p>

                <p className="mt-4 text-[10px] uppercase tracking-[0.12em] text-black/25">
                  {insight.source}
                </p>
              </div>
            </div>
          </div>
        ))}
      </section>

      <div className="mt-8 rounded-2xl border border-black/[0.05] bg-white/50 px-5 py-4 text-xs leading-5 text-black/40">
        Insights are automatically derived from recorded Square payments,
        customers, orders and future bookings. They are analytical signals,
        not accounting forecasts. Forward booking values use current catalog
        pricing and may differ from the final amount charged.
      </div>
    </>
  );
}

export default function Home() {
  const [view, setView] = useState<"overview" | "revenue" | "clients" | "services" | "bookings" | "insights">("overview");
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/analytics/overview")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Unable to load analytics");
        }
        setData(json);
      })
      .catch((err) => setError(err.message));
  }, []);

  const chartData = useMemo(() => {
    if (!data) return [];

    return data.monthlyRevenue.slice(-18).map((item) => {
      const [year, month] = item.month.split("-");
      const date = new Date(Number(year), Number(month) - 1, 1);

      return {
        ...item,
        label: date.toLocaleDateString(BUSINESS_LOCALE, {
          month: "short",
          year: "2-digit",
        }),
      };
    });
  }, [data]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f5f2] p-8">
        <div className="rounded-3xl bg-white p-8 shadow-sm">
          <p className="font-semibold">Couldn&apos;t load Square analytics.</p>
          <p className="mt-2 text-sm text-black/50">{error}</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f5f2]">
        <div className="flex items-center gap-3 text-sm text-black/50">
          <LoaderCircle className="animate-spin" size={18} />
          Analysing SquareScope…
        </div>
      </main>
    );
  }

  const topServiceMax = Math.max(
    ...data.topServices.slice(0, 6).map((s) => s.revenue),
    1
  );

  return (
    <div className="min-h-screen bg-[#f6f5f2] text-[#171717]">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="hidden w-[235px] shrink-0 border-r border-black/[0.06] px-5 py-7 lg:block">
          <div className="px-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-black/35">
              SquareScope
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-[-0.04em]">
              Analytics
            </h1>
          </div>

          <nav className="mt-10 space-y-1 text-sm">
            <button
              onClick={() => setView("overview")}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                view === "overview"
                  ? "bg-black text-white"
                  : "text-black/45 hover:bg-black/[0.04]"
              }`}
            >
              <LayoutDashboard size={16} />
              Overview
            </button>

            <button
              onClick={() => setView("revenue")}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                view === "revenue"
                  ? "bg-black text-white"
                  : "text-black/45 hover:bg-black/[0.04]"
              }`}
            >
              <CircleDollarSign size={16} />
              Revenue
            </button>
            <button
              onClick={() => setView("clients")}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                view === "clients"
                  ? "bg-black text-white"
                  : "text-black/45 hover:bg-black/[0.04]"
              }`}
            >
              <Users size={16} />
              Customers
            </button>
            <button
              onClick={() => setView("services")}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                view === "services"
                  ? "bg-black text-white"
                  : "text-black/45 hover:bg-black/[0.04]"
              }`}
            >
              <Scissors size={16} />
              Services
            </button>
            <button
              onClick={() => setView("bookings")}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                view === "bookings"
                  ? "bg-black text-white"
                  : "text-black/45 hover:bg-black/[0.04]"
              }`}
            >
              <CalendarDays size={16} />
              Bookings
            </button>
            <button
              onClick={() => setView("insights")}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                view === "insights"
                  ? "bg-black text-white"
                  : "text-black/45 hover:bg-black/[0.04]"
              }`}
            >
              <Sparkles size={16} />
              Insights
            </button>
          </nav>

          <div className="mt-10 border-t border-black/[0.06] pt-5">
            <div className="rounded-2xl bg-white p-4">
              <div className="flex items-center gap-2 text-xs font-medium">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Square connected
              </div>
              <p className="mt-2 text-[11px] leading-5 text-black/35">
                Production data
                <br />
                Powered by Square
              </p>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-5 py-7 md:px-8 lg:px-10">
          {view === "insights" ? (
            <InsightsView />
          ) : view === "bookings" ? (
            <BookingsView />
          ) : view === "services" ? (
            <ServicesView />
          ) : view === "clients" ? (
            <CustomersView />
          ) : view === "overview" ? (
            <>
          <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm text-black/40">Business overview</p>
              <h2 className="mt-1 text-3xl font-semibold tracking-[-0.05em]">
                Welcome to SquareScope 👋
              </h2>
            </div>

            <div className="rounded-full border border-black/[0.07] bg-white px-4 py-2 text-xs text-black/45">
              Updated from Square
            </div>
          </header>

          <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Sales this month"
              value={money.format(data.currentPeriod.monthRevenue)}
              detail={`${money.format(
                data.currentPeriod.previousComparableRevenue
              )} same point last month`}
              icon={CircleDollarSign}
              change={data.currentPeriod.percentageChange}
            />

            <StatCard
              title="Average transaction"
              value={money.format(data.totals.averageSale)}
              detail={`${data.totals.payments.toLocaleString()} completed payments`}
              icon={WalletCards}
            />

            <StatCard
              title="Customer profiles"
              value={String(data.totals.customers)}
              detail="Current profiles in Square"
              icon={Users}
            />

            <StatCard
              title="Total sales"
              value={compactMoney.format(data.totals.grossRevenue)}
              detail={`Since ${new Date(
                data.dataRange.firstPayment ?? ""
              ).toLocaleDateString(BUSINESS_LOCALE, {
                month: "short",
                year: "numeric",
              })}`}
              icon={Sparkles}
            />
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[1.65fr_0.85fr]">
            <div className="rounded-3xl border border-black/[0.06] bg-white p-5 md:p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium">Sales trend</p>
                  <p className="mt-1 text-xs text-black/40">
                    Last 18 months
                  </p>
                </div>

                <div className="rounded-full bg-[#f5f3ef] px-3 py-1.5 text-xs text-black/45">
                  Monthly
                </div>
              </div>

              <div className="mt-7 h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient
                        id="revenueGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#171717"
                          stopOpacity={0.16}
                        />
                        <stop
                          offset="100%"
                          stopColor="#171717"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>

                    <CartesianGrid
                      vertical={false}
                      stroke="#000"
                      strokeOpacity={0.05}
                    />

                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: "#999" }}
                      minTickGap={25}
                    />

                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: "#999" }}
                      tickFormatter={(value) => `$${value / 1000}k`}
                      width={42}
                    />

                    <Tooltip
                      formatter={(value) => [
                        money.format(Number(value)),
                        "Revenue",
                      ]}
                      contentStyle={{
                        borderRadius: 16,
                        border: "1px solid rgba(0,0,0,.06)",
                        boxShadow: "0 10px 30px rgba(0,0,0,.08)",
                      }}
                    />

                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#171717"
                      strokeWidth={2}
                      fill="url(#revenueGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-3xl border border-black/[0.06] bg-[#171717] p-6 text-white">
              <p className="text-sm font-medium">At a glance</p>
              <p className="mt-1 text-xs text-white/40">
                Full Square history
              </p>

              <div className="mt-8 space-y-6">
                <div>
                  <p className="text-xs text-white/40">Completed payments</p>
                  <p className="mt-1 text-2xl font-semibold">
                    {data.totals.payments}
                  </p>
                </div>

                <div className="border-t border-white/10 pt-5">
                  <p className="text-xs text-white/40">Orders recorded</p>
                  <p className="mt-1 text-2xl font-semibold">
                    {data.totals.orders}
                  </p>
                </div>

                <div className="border-t border-white/10 pt-5">
                  <p className="text-xs text-white/40">Current client profiles</p>
                  <p className="mt-1 text-2xl font-semibold">
                    {data.totals.customers}
                  </p>
                </div>

                <div className="border-t border-white/10 pt-5">
                  <p className="text-xs text-white/40">Refunds</p>
                  <p className="mt-1 text-2xl font-semibold">
                    {money.format(data.totals.refunds)}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-2">
            <div className="rounded-3xl border border-black/[0.06] bg-white p-6">
              <div>
                <p className="text-sm font-medium">Top products & services</p>
                <p className="mt-1 text-xs text-black/40">
                  Ranked by completed sales
                </p>
              </div>

              <div className="mt-6 space-y-5">
                {data.topServices.slice(0, 6).map((service, index) => (
                  <div key={service.name}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm">
                          <span className="mr-2 text-black/25">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          {service.name}
                        </p>
                      </div>

                      <p className="shrink-0 text-sm font-semibold">
                        {money.format(service.revenue)}
                      </p>
                    </div>

                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/[0.05]">
                      <div
                        className="h-full rounded-full bg-black"
                        style={{
                          width: `${Math.max(
                            3,
                            (service.revenue / topServiceMax) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-black/[0.06] bg-white p-6">
              <div>
                <p className="text-sm font-medium">Highest-value clients</p>
                <p className="mt-1 text-xs text-black/40">
                  Lifetime recorded spend
                </p>
              </div>

              <div className="mt-5">
                {data.topCustomers.slice(0, 6).map((customer, index) => (
                  <div
                    key={customer.customerId}
                    className="flex items-center gap-4 border-b border-black/[0.05] py-3.5 last:border-0"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f3f1ed] text-xs font-semibold">
                      {customer.name
                        .split(" ")
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((word) => word[0])
                        .join("")
                        .toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {customer.name}
                      </p>
                      <p className="mt-0.5 text-xs text-black/35">
                        {customer.transactions} transactions
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-semibold">
                        {money.format(customer.lifetimeSpend)}
                      </p>
                      <p className="text-[10px] text-black/30">
                        #{index + 1}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <footer className="mt-8 flex flex-col justify-between gap-2 border-t border-black/[0.06] py-5 text-[11px] text-black/30 sm:flex-row">
            <span>SquareScope · Square Production</span>
            <span>
              {data.totals.payments} payments analysed ·{" "}
              {data.totals.orders} orders analysed
            </span>
          </footer>
            </>
          ) : (
            <RevenueView />
          )}
        </main>
      </div>
    </div>
  );
}
