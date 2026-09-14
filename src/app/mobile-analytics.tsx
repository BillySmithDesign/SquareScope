"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type RefObject, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import styles from "./mobile-analytics.module.css";

type Row = { label: string; value: number };
type Props = {
  title: string;
  description: string;
  rows: Row[];
  headline?: string;
  context?: string;
  comparison?: string;
  supporting?: string;
  currency?: boolean;
  kind?: "trend" | "bars";
  children: ReactNode;
};

const BUSINESS_LOCALE = process.env.NEXT_PUBLIC_BUSINESS_LOCALE || "en-US";
const BUSINESS_CURRENCY = process.env.NEXT_PUBLIC_BUSINESS_CURRENCY || "USD";
const money = new Intl.NumberFormat(BUSINESS_LOCALE, { style: "currency", currency: BUSINESS_CURRENCY, maximumFractionDigits: 0 });
const count = new Intl.NumberFormat(BUSINESS_LOCALE);
const mobileQuery = "(max-width: 767px), (max-height: 500px) and (pointer: coarse)";

function subscribe(callback: () => void) {
  const media = window.matchMedia(mobileQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const getMobile = () => window.matchMedia(mobileQuery).matches;
const getServerMobile = () => false;

function Detail({ title, description, rows, currency, kind, onClose, returnFocus }: Omit<Props, "children"> & { onClose: () => void; returnFocus: RefObject<HTMLButtonElement | null> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const id = useId();
  const format = (value: number) => currency ? money.format(value) : count.format(value);

  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = returnFocus.current;
    const scrollY = window.scrollY;
    const bodyStyle = document.body.getAttribute("style");
    Object.assign(document.body.style, { position: "fixed", top: `-${scrollY}px`, width: "100%", overflow: "hidden" });
    element.showModal();
    return () => {
      element.close();
      if (bodyStyle === null) document.body.removeAttribute("style");
      else document.body.setAttribute("style", bodyStyle);
      window.scrollTo(0, scrollY);
      previousFocus?.focus({ preventScroll: true });
    };
  }, [returnFocus]);

  useEffect(() => {
    const element = host.current!;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const axes = <>
    <CartesianGrid vertical={false} stroke="#e7e4df" />
    <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={28} tickLine={false} />
    <YAxis width={currency ? 64 : 40} tick={{ fontSize: 11 }} allowDecimals={false} tickFormatter={format} tickLine={false} />
    <Tooltip formatter={(value) => [format(Number(value)), currency ? `Revenue (${BUSINESS_CURRENCY})` : "New clients"]} contentStyle={{ borderRadius: 12, maxWidth: "min(260px, 70vw)", whiteSpace: "normal" }} />
  </>;

  return createPortal(
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <header className={styles.header}>
        <div><h2 id={`${id}-title`}>{title}</h2><p id={`${id}-description`}>{description}{currency ? ` · ${BUSINESS_CURRENCY}` : ""}</p></div>
        <button type="button" autoFocus onClick={onClose} className={styles.close} aria-label={`Close ${title} chart`}>Close ×</button>
      </header>
      <div className={styles.detailBody}>
        <p className={styles.hint}>Tap a point or bar for details. With a keyboard, Tab to the chart and use the arrow keys.</p>
        <div ref={host} className={styles.chart}>
          {rows.length === 0 ? <p>No recorded data for this period.</p> : size.width > 0 && size.height > 0 && (
            kind === "bars" || !currency ? <BarChart width={size.width} height={size.height} data={rows} accessibilityLayer margin={{ top: 12, right: 12, bottom: 12, left: 0 }}>
              {axes}<Bar dataKey="value" fill="#292722" radius={[6, 6, 0, 0]} isAnimationActive={false} />
            </BarChart> : <AreaChart width={size.width} height={size.height} data={rows} accessibilityLayer margin={{ top: 12, right: 12, bottom: 12, left: 0 }}>
              {axes}<Area dataKey="value" stroke="#292722" fill="#e4dfd4" strokeWidth={2} isAnimationActive={false} />
            </AreaChart>
          )}
        </div>
        <details className={styles.table}><summary>View all values</summary><table><caption>{title}{currency ? ` (${BUSINESS_CURRENCY})` : ""}</caption><thead><tr><th scope="col">Period / category</th><th scope="col">{currency ? "Revenue" : "Clients"}</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.label}-${index}`}><th scope="row">{row.label}</th><td>{format(row.value)}</td></tr>)}</tbody></table></details>
      </div>
    </dialog>, document.body,
  );
}

/** Desktop children stay intact; mobile mounts only the compact presentation. */
export function MobileAnalytics(props: Props) {
  const mobile = useSyncExternalStore(subscribe, getMobile, getServerMobile);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const { rows, currency = true, kind = "trend", title } = props;
  const format = (value: number) => currency ? money.format(value) : count.format(value);
  const visible = kind === "trend" ? rows.slice(-4) : rows;
  const maximum = Math.max(0, ...rows.map((row) => row.value));
  const best = maximum > 0 ? rows.find((row) => row.value === maximum) : undefined;

  return <>
    {mobile ? <div className={styles.summary}>
      {rows.length ? <>
        {props.headline && <div><p className={styles.metric}>{props.headline}</p><p className={styles.context}>{props.context}</p></div>}
        {props.comparison && <p className={styles.comparison}>{props.comparison}</p>}
        {kind === "trend" && <p className={styles.context}>Latest {visible.length} recorded months</p>}
        <ul className={styles.bars}>{visible.map((row, index) => <li key={`${row.label}-${index}`}><div><span>{row.label}</span><strong>{format(row.value)}</strong></div><div className={styles.track} aria-hidden="true"><span style={{ width: `${maximum ? Math.max(0, row.value) / maximum * 100 : 0}%` }} /></div></li>)}</ul>
        {best && <p className={styles.observation}>Highest in this view: {best.label} · {format(best.value)}</p>}
        {props.supporting && <p className={styles.context}>{props.supporting}</p>}
      </> : <p className={styles.context}>No recorded data for this period.</p>}
      <button ref={trigger} type="button" className={styles.full} aria-label={`Full chart: ${title}`} aria-haspopup="dialog" onClick={() => setOpen(true)}>Full chart <span aria-hidden="true">↗</span></button>
    </div> : props.children}
    {open && <Detail {...props} returnFocus={trigger} currency={currency} kind={kind} onClose={() => setOpen(false)} />}
  </>;
}
