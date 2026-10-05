import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Eye, EyeOff, X } from "lucide-react";
import type { FeatureCollection, MonthlyTransportDistanceBucket } from "../types";
import { colorForTransport, formatKm, parseTravelDate, propertyNumber, propertyString, transportLabel } from "../utils";
import { transportDisplayOrder } from "../constants";

type Period = "years" | "months" | "weeks" | "days";
type Bucket = { date: Date; values: Map<string, number> };
const weekDateFormat = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" });

function periodStart(date: Date, period: Period) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (period === "years") start.setMonth(0, 1);
  if (period === "months") start.setDate(1);
  if (period === "weeks") start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  return start;
}

function nextPeriod(date: Date, period: Period) {
  const next = new Date(date);
  if (period === "years") next.setFullYear(next.getFullYear() + 1);
  else if (period === "months") next.setMonth(next.getMonth() + 1);
  else next.setDate(next.getDate() + (period === "weeks" ? 7 : 1));
  return next;
}

function isoWeek(date: Date) {
  const thursday = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const year = thursday.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  const week = Math.ceil(((thursday.getTime() - yearStart) / 86400000 + 1) / 7);
  return { week, year };
}

function periodLabel(date: Date, period: Period) {
  if (period === "years") return String(date.getFullYear());
  if (period === "weeks") return `W${String(isoWeek(date).week).padStart(2, "0")}`;
  const label = new Intl.DateTimeFormat("en", {
    ...(period !== "months" ? { day: "numeric" as const } : {}),
    month: "short", year: "2-digit",
  }).format(date);
  return label;
}

function weekRangeLabel(date: Date) {
  const end = new Date(date);
  end.setDate(end.getDate() + 6);
  return `Week ${isoWeek(date).week}: ${weekDateFormat.format(date)} – ${weekDateFormat.format(end)}`;
}

export function StatisticsOverlay({ monthlyStats, legs, onClose }: {
  monthlyStats: MonthlyTransportDistanceBucket[];
  legs: FeatureCollection | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const legendToggleRef = useRef<HTMLButtonElement>(null);
  const anchorDateRef = useRef<Date | null>(null);
  const [period, setPeriod] = useState<Period>(() =>
    window.matchMedia("(max-width: 900px)").matches ? "years" : "months",
  );
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 });
  const [isRescaling, setIsRescaling] = useState(false);
  const [excludedTransports, setExcludedTransports] = useState<Set<string>>(() => new Set());
  const [isLegendOpen, setIsLegendOpen] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState<{ dateMs: number; transport: string } | null>(null);
  const closeLegend = () => {
    setIsLegendOpen(false);
    legendToggleRef.current?.focus();
  };
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  const buckets = useMemo(() => {
    const records: { date: Date; transport: string; km: number }[] = [];
    if (period === "months" || period === "years") {
      for (const month of monthlyStats) {
        const date = parseTravelDate(month.month_start);
        if (!date) continue;
        for (const transport of month.transports) {
          records.push({ date, transport: transport.transport ?? "unknown", km: Number(transport.distance_m) / 1000 });
        }
      }
    } else {
      for (const leg of legs?.features ?? []) {
        const date = parseTravelDate(leg.properties?.travel_date);
        if (date) records.push({ date, transport: propertyString(leg.properties, "transport") ?? "unknown", km: propertyNumber(leg.properties, "distance_m") / 1000 });
      }
    }
    const dates = monthlyStats.flatMap(month => {
      const date = parseTravelDate(month.month_start);
      return date ? [date] : [];
    });
    if (!dates.length && !records.length) return [];
    const times = (dates.length ? dates : records.map(record => record.date)).map(date => date.getTime());
    const first = periodStart(new Date(Math.min(...times)), period);
    const lastMonth = new Date(Math.max(...times));
    // Fine-grained views end at the last travel day, not the end of its month.
    const lastRecord = records.length ? new Date(Math.max(...records.map(record => record.date.getTime()))) : lastMonth;
    const last = periodStart(period === "days" || period === "weeks" ? lastRecord : lastMonth, period);
    const result = new Map<number, Bucket>();
    for (let date = first; date <= last; date = nextPeriod(date, period)) {
      result.set(date.getTime(), { date, values: new Map() });
    }
    for (const record of records) {
      if (!Number.isFinite(record.km) || record.km <= 0) continue;
      const bucket = result.get(periodStart(record.date, period).getTime());
      if (bucket) bucket.values.set(record.transport, (bucket.values.get(record.transport) ?? 0) + record.km);
    }
    return [...result.values()];
  }, [legs, monthlyStats, period]);
  const scrollable = period !== "years";
  const changePeriod = (next: Period) => {
    if (next === period) return;
    setSelectedSegment(null);
    const scroll = scrollRef.current;
    if (scrollable && scroll && buckets.length) {
      // Keep the date at the viewport's left edge, including a partial bucket.
      const position = scroll.scrollLeft / (scroll.scrollWidth / buckets.length);
      const index = Math.min(buckets.length - 1, Math.floor(position));
      const date = buckets[index].date;
      const end = nextPeriod(date, period);
      anchorDateRef.current = new Date(date.getTime() + (position - index) * (end.getTime() - date.getTime()));
    }
    setPeriod(next);
  };
  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll || !buckets.length) return;
    if (scrollable && anchorDateRef.current) {
      const anchor = anchorDateRef.current.getTime();
      const found = buckets.findIndex(bucket => nextPeriod(bucket.date, period).getTime() > anchor);
      const index = found < 0 ? buckets.length - 1 : found;
      const start = buckets[index].date.getTime();
      const end = nextPeriod(buckets[index].date, period).getTime();
      const fraction = Math.max(0, Math.min(1, (anchor - start) / (end - start)));
      scroll.scrollLeft = (index + fraction) * (scroll.scrollWidth / buckets.length);
    }
    let settleTimer = 0;
    let animationTimer = 0;
    const updateVisibleRange = (animate = false) => {
      const columnWidth = scroll.scrollWidth / buckets.length;
      let start = Math.max(0, Math.floor(scroll.scrollLeft / columnWidth));
      let end = Math.min(buckets.length, Math.ceil((scroll.scrollLeft + scroll.clientWidth) / columnWidth));
      const viewport = scroll.getBoundingClientRect();
      const left = Math.max(0, viewport.left + scroll.clientLeft);
      const right = Math.min(window.innerWidth, viewport.left + scroll.clientLeft + scroll.clientWidth);
      const bars = scroll.querySelectorAll<HTMLElement>(".statistics-bar");
      // A column's gap can be visible while its bar is entirely off screen.
      // Use the actual bar edges so those off-screen distances cannot set the scale.
      while (start < end && bars[start].getBoundingClientRect().right <= left + 0.5) start += 1;
      while (end > start && bars[end - 1].getBoundingClientRect().left >= right - 0.5) end -= 1;
      setVisibleRange(current => current.start === start && current.end === end ? current : { start, end });
      if (animate) {
        setIsRescaling(true);
        animationTimer = window.setTimeout(() => setIsRescaling(false), 400);
      }
    };
    const scheduleUpdate = () => {
      setSelectedSegment(null);
      window.clearTimeout(settleTimer);
      window.clearTimeout(animationTimer);
      setIsRescaling(false);
      settleTimer = window.setTimeout(() => updateVisibleRange(true), 280);
    };
    setIsRescaling(false);
    updateVisibleRange();
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(scroll);
    scroll.addEventListener("scroll", scheduleUpdate, { passive: true });
    return () => {
      window.clearTimeout(settleTimer);
      window.clearTimeout(animationTimer);
      observer.disconnect();
      scroll.removeEventListener("scroll", scheduleUpdate);
    };
  }, [buckets, period, scrollable]);
  const transports = [...new Set(buckets.flatMap(bucket => [...bucket.values.keys()]))].sort((a, b) => {
    const rank = (key: string) => { const index = transportDisplayOrder.indexOf(key); return index < 0 ? transportDisplayOrder.length : index; };
    return rank(a) - rank(b) || a.localeCompare(b);
  });
  const visibleTransports = transports.filter(key => !excludedTransports.has(key));
  const visibleBuckets = useMemo(() => buckets.map(bucket => ({
    ...bucket,
    values: new Map([...bucket.values].filter(([key]) => !excludedTransports.has(key))),
  })), [buckets, excludedTransports]);
  const scaleBuckets = visibleBuckets.slice(visibleRange.start, visibleRange.end);
  const maximum = Math.max(1, ...scaleBuckets.map(bucket => [...bucket.values.values()].reduce((sum, km) => sum + km, 0)));
  const magnitude = 10 ** Math.floor(Math.log10(maximum / 5));
  const step = Math.ceil(maximum / 5 / magnitude) * magnitude;
  const ceiling = step * 5;
  const selectedBucket = selectedSegment ? visibleBuckets.find(bucket => bucket.date.getTime() === selectedSegment.dateMs) : null;

  return createPortal(
    <dialog ref={dialogRef} className="statistics-overlay" aria-labelledby="statistics-title" onCancel={event => {
      if (isLegendOpen && window.matchMedia("(max-width: 900px)").matches) {
        event.preventDefault();
        closeLegend();
      } else if (selectedSegment) {
        event.preventDefault();
        setSelectedSegment(null);
      } else onClose();
    }}
      onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>
      <header className="statistics-header">
        <div><h2 id="statistics-title">Distance over time</h2><p>Travel distance by transport · kilometers</p></div>
        <button type="button" className="statistics-close" aria-label="Close statistics" onClick={onClose}><X size={22} /></button>
      </header>
      <div className="statistics-toolbar">
      <div className="statistics-periods" role="group" aria-label="Group distance by">
        {(["years", "months", "weeks", "days"] as const).map(value => <button type="button" key={value} aria-pressed={period === value} onClick={() => changePeriod(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}
      </div>
      <button ref={legendToggleRef} type="button" className="statistics-legend-toggle" aria-expanded={isLegendOpen} aria-controls="statistics-legend"
        onClick={() => { setSelectedSegment(null); setIsLegendOpen(current => !current); }}>
        {isLegendOpen ? <EyeOff size={18} /> : <Eye size={18} />}
        {isLegendOpen ? "Hide legend" : "Show legend"}
      </button>
      </div>
      {buckets.length ? <div className="statistics-body">
        <div className={`statistics-chart statistics-chart--${period}`}>
          <div className="statistics-y-axis" key={`${period}-${ceiling}`} aria-label="Distance in kilometers"><strong>km</strong>{Array.from({ length: 6 }, (_, index) => <span key={index} style={{ top: `${index * 20}%` }}>{formatKm(ceiling - index * step)}</span>)}</div>
          <div ref={scrollRef} className="statistics-chart-scroll" key={period} tabIndex={scrollable ? 0 : undefined} aria-label={scrollable ? `Scroll ${period} horizontally` : undefined}>
            <div className={`statistics-plot${scrollable ? " statistics-plot--scrollable" : ""}`} style={{ "--statistics-bucket-count": buckets.length, "--statistics-visible-count": Math.max(1, monthlyStats.length) } as CSSProperties}>
              <div className="statistics-grid" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <span key={index} style={{ top: `${index * 20}%` }} />)}</div>
              <div className="statistics-bars">{visibleBuckets.map(bucket => {
                const total = [...bucket.values.values()].reduce((sum, km) => sum + km, 0);
                const label = periodLabel(bucket.date, period);
                const fullLabel = period === "weeks" ? weekRangeLabel(bucket.date) : label;
                return <div className="statistics-column" key={bucket.date.getTime()}>
                  <div className="statistics-bar" role="group" aria-label={`${fullLabel}: ${formatKm(total)} km`} title={`${fullLabel}: ${formatKm(total)} km`}>
                    <div className="statistics-bar-stack" style={{ height: `${total / ceiling * 100}%` }}>
                      {visibleTransports.map(key => { const km = bucket.values.get(key) ?? 0; const color = colorForTransport(key); return km > 0 ? <button type="button" className="bar-fill statistics-segment" key={key} style={{ height: `${km / total * 100}%`, backgroundColor: color }} title={`${transportLabel(key)}: ${formatKm(km)} km`} aria-label={`${fullLabel}, ${transportLabel(key)}: ${formatKm(km)} km. Show breakdown`} onClick={() => setSelectedSegment({ dateMs: bucket.date.getTime(), transport: key })} /> : null; })}
                    </div>
                  </div>
                  <span className="statistics-x-label" title={fullLabel}>{label}</span>
                </div>;
              })}</div>
            </div>
          </div>
          <div className="statistics-x-title">{period[0].toUpperCase() + period.slice(1)}{scrollable ? " · Scroll horizontally to explore · Y-axis scales to visible bars" : ""}</div>
          <div className="statistics-scale-status" role="status">{scrollable && isRescaling && <><span aria-hidden="true" />Adjusting scale…</>}</div>
          {selectedBucket && <section className="statistics-bar-details" aria-label="Distance breakdown">
            <header><strong>{period === "weeks" ? weekRangeLabel(selectedBucket.date) : periodLabel(selectedBucket.date, period)}</strong><button type="button" className="statistics-close" aria-label="Close distance breakdown" onClick={() => setSelectedSegment(null)}><X size={18} /></button></header>
            <div className="statistics-bar-details-list" aria-live="polite">
              {visibleTransports.filter(key => selectedBucket.values.has(key)).map(key => <div key={key} className={selectedSegment?.transport === key ? "selected" : ""}>
                <span className="statistics-legend-swatch" style={{ backgroundColor: colorForTransport(key) }} />
                <span className="statistics-legend-label">{transportLabel(key)}</span>
                <strong>{formatKm(selectedBucket.values.get(key)!)} km</strong>
              </div>)}
            </div>
            <footer>Total <strong>{formatKm([...selectedBucket.values.values()].reduce((sum, km) => sum + km, 0))} km</strong></footer>
          </section>}
        </div>
        {isLegendOpen && <button type="button" className="statistics-legend-backdrop" aria-label="Close legend" onClick={closeLegend} />}
        <aside id="statistics-legend" className={`statistics-legend${isLegendOpen ? " statistics-legend--open" : ""}`} aria-label="Transport visibility">
          <div className="statistics-legend-header">
            <h3>Transport</h3>
            <button type="button" className="statistics-legend-close statistics-close" aria-label="Close legend" onClick={closeLegend}><X size={20} /></button>
          </div>
          <div className="statistics-legend-items">
          {transports.map(key => {
            const excluded = excludedTransports.has(key);
            const label = transportLabel(key);
            return <button type="button" key={key} className={`statistics-legend-item${excluded ? " excluded" : ""}`}
              aria-pressed={!excluded} aria-label={`${excluded ? "Show" : "Hide"} ${label}`} title={`${excluded ? "Show" : "Hide"} ${label}`}
              onClick={() => setExcludedTransports(current => {
                const next = new Set(current);
                if (next.has(key)) next.delete(key); else next.add(key);
                return next;
              })}>
              <span className="statistics-legend-swatch" style={{ backgroundColor: colorForTransport(key) }} />
              <span className="statistics-legend-label">{label}</span>
              <span className="statistics-legend-eye" aria-hidden="true">{excluded ? <EyeOff size={20} strokeWidth={1.5} /> : <Eye size={20} strokeWidth={1.5} />}</span>
            </button>;
          })}
          </div>
        </aside>
      </div> : <p>No travel distances available.</p>}
    </dialog>, document.body,
  );
}
