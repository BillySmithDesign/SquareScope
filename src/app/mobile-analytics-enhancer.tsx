"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MobileAnalytics } from "./mobile-analytics";

type Row = { label: string; value: number };
type Target = {
  title: string;
  description: string;
  rows: Row[];
  headline?: string;
  context?: string;
  comparison?: string;
  supporting?: string;
  currency?: boolean;
  kind?: "trend" | "bars";
  host: HTMLElement;
};

const locale = process.env.NEXT_PUBLIC_BUSINESS_LOCALE || "en-US";
const currency = process.env.NEXT_PUBLIC_BUSINESS_CURRENCY || "USD";
const money = new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 });

function cardFor(title: string) {
  const labels = Array.from(document.querySelectorAll("main p"));
  const label = labels.find((node) => node.textContent?.trim() === title);
  return label?.closest(".rounded-3xl") as HTMLElement | null;
}

function monthLabel(row: { year?: number; monthNumber?: number; month?: string }) {
  if (row.year && row.monthNumber) {
    return new Date(row.year, row.monthNumber - 1, 1).toLocaleDateString(locale, { month: "short", year: "2-digit" });
  }
  if (row.month) {
    const [year, month] = row.month.split("-").map(Number);
    if (year && month) return new Date(year, month - 1, 1).toLocaleDateString(locale, { month: "short", year: "2-digit" });
  }
  return row.month || "";
}

async function json(path: string) {
  const response = await fetch(path);
  const body = await response.json();
  if (!response.ok || !body.success) throw new Error(body.error || `Failed to load ${path}`);
  return body;
}

export default function MobileAnalyticsEnhancer() {
  const [targets, setTargets] = useState<Target[]>([]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px), (max-height: 500px) and (pointer: coarse)");
    if (!media.matches) return;
    let cancelled = false;
    let timer = 0;

    const build = async () => {
      try {
        const [overview, revenue, clients] = await Promise.all([
          json("/api/analytics/overview"),
          json("/api/analytics/revenue"),
          json("/api/analytics/clients"),
        ]);
        if (cancelled) return;

        const next: Target[] = [];
        const add = (title: string, target: Omit<Target, "title" | "host">) => {
          const host = cardFor(title);
          if (!host || host.dataset.mobileAnalytics === "1") return;
          host.dataset.mobileAnalytics = "1";
          next.push({ title, host, ...target });
        };

        const overviewRows = (overview.data?.monthlyRevenue || overview.monthlyRevenue || []).slice(-18).map((row: any) => ({ label: monthLabel(row), value: Number(row.revenue || 0) }));
        const current = overview.data?.currentPeriod || overview.currentPeriod;
        const totals = overview.data?.totals || overview.totals;
        add("Sales trend", {
          description: "Monthly completed Square sales · last 18 months",
          rows: overviewRows,
          headline: current ? money.format(current.monthRevenue) : undefined,
          context: "Sales this month so far",
          comparison: current?.percentageChange == null ? "Comparable-period change unavailable" : `${current.percentageChange >= 0 ? "+" : ""}${current.percentageChange.toFixed(1)}% vs the same point last month`,
          supporting: totals ? `${money.format(totals.averageSale)} average transaction across recorded history.` : undefined,
        });

        const revenueRows = (revenue.monthlyRevenue || []).map((row: any) => ({ label: monthLabel(row), value: Number(row.revenue || 0) }));
        add("Sales history", {
          description: "Monthly completed Square sales",
          rows: revenueRows,
          headline: money.format(revenue.summary.monthRevenue),
          context: "Sales this month so far",
          comparison: revenue.summary.ytdChange == null ? "Year-to-date comparison unavailable" : `${revenue.summary.ytdChange >= 0 ? "+" : ""}${revenue.summary.ytdChange.toFixed(1)}% sales YTD vs the same point last year`,
          supporting: `${revenueRows.length} recorded months available. The current month may be incomplete.`,
        });

        add("Revenue by day of week", {
          description: "Total revenue by trading day across Square history",
          rows: (revenue.weekdayPerformance || []).map((row: any) => ({ label: row.day, value: Number(row.revenue || 0) })),
          kind: "bars",
          supporting: "Totals across recorded history, not average revenue per trading day.",
        });

        const methods = (revenue.paymentMethods || []).map((row: any) => ({ label: row.method, value: Number(row.revenue || 0) }));
        const methodTotal = methods.reduce((sum: number, row: Row) => sum + row.value, 0);
        add("Payment mix", {
          description: "Recorded Square payment methods",
          rows: methods,
          kind: "bars",
          headline: money.format(methodTotal),
          context: "Revenue across payment methods",
          supporting: `${methods.length} recorded payment method${methods.length === 1 ? "" : "s"}.`,
        });

        const acquisition = (clients.acquisition || []).map((row: any) => ({ label: monthLabel(row), value: Number(row.clients || 0) }));
        const latest = acquisition.at(-1);
        const previous = acquisition.at(-2);
        add("Client acquisition", {
          description: "First recorded payment by month",
          rows: acquisition,
          currency: false,
          headline: latest ? `${latest.value} new clients` : undefined,
          context: latest ? `Latest recorded month · ${latest.label}` : undefined,
          comparison: latest && previous ? `${latest.value - previous.value >= 0 ? "+" : ""}${latest.value - previous.value} clients vs ${previous.label}` : "Previous recorded month unavailable",
          supporting: "Current month may be incomplete; missing months are not treated as zero.",
        });

        setTargets(next);
      } catch (error) {
        console.error("SquareScope mobile analytics enhancement failed", error);
      }
    };

    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(build, 120);
    };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.querySelector("main") || document.body, { childList: true, subtree: true });
    return () => { cancelled = true; observer.disconnect(); window.clearTimeout(timer); };
  }, []);

  return <>{targets.map((target) => createPortal(
    <MobileAnalytics
      key={target.title}
      title={target.title}
      description={target.description}
      rows={target.rows}
      headline={target.headline}
      context={target.context}
      comparison={target.comparison}
      supporting={target.supporting}
      currency={target.currency}
      kind={target.kind}
    >
      <></>
    </MobileAnalytics>,
    target.host,
  ))}</>;
}
