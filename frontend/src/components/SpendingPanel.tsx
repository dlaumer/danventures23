import { useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { colorForSleepCategory, colorForTransport, formatMoney, sleepCategoryLabel, transportLabel } from "../utils";
import { sleepIconFor, transportIconFor } from "./categoryIcons";

function SpendingChart({ title, costs, sleep = false }: { title: string; costs: Map<string, number>; sleep?: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const items = Array.from(costs, ([id, amount]) => ({ id, amount,
    label: sleep ? sleepCategoryLabel(id) : transportLabel(id),
    color: sleep ? colorForSleepCategory(id) : colorForTransport(id),
  })).filter(item => Number.isFinite(item.amount) && item.amount > 0).sort((a,b) => b.amount-a.amount);
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const active = items.find(item => item.id === (hovered ?? selected));
  const toggle = (id: string) => setSelected(selected === id ? null : id);
  let angle = -Math.PI / 2;
  return <section className="spending-chart" aria-label={title}>
    <h3>{title}</h3>
    {total > 0 ? <>
      <svg viewBox="0 0 240 240" className="spending-pie" aria-label={`${title}: ${formatMoney(total)}`}>
        {items.map(item => {
          const start = angle, sweep = item.amount / total * Math.PI * 2;
          angle += sweep;
          const point = (a: number) => `${120 + 103 * Math.cos(a)} ${120 + 103 * Math.sin(a)}`;
          const d = items.length === 1 ? "M 120 17 A 103 103 0 1 1 120 223 A 103 103 0 1 1 120 17 Z" : `M 120 120 L ${point(start)} A 103 103 0 ${sweep > Math.PI ? 1 : 0} 1 ${point(angle)} Z`;
          return <path key={item.id} d={d} fill={item.color} stroke="white" strokeWidth={2} role="button" tabIndex={0}
            aria-label={`${item.label}: ${formatMoney(item.amount)}, ${(item.amount/total*100).toFixed(1)}%`} aria-pressed={selected === item.id}
            style={{ opacity: active && active.id !== item.id ? 0.35 : 1 }}
            onMouseEnter={() => setHovered(item.id)} onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(item.id)} onBlur={() => setHovered(null)} onClick={() => toggle(item.id)}
            onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(item.id); } }}>
            <title>{item.label}: {formatMoney(item.amount)}</title>
          </path>;
        })}
      </svg>
      <div className="spending-detail" aria-live="polite"><span>{active?.label ?? "Total spent"}</span><strong>{formatMoney(active?.amount ?? total)}</strong><small>{active ? `${(active.amount/total*100).toFixed(1)}% of total` : "Select a slice or category"}</small></div>
      <div className="spending-legend">{items.map(item => <button key={item.id} type="button" className={active?.id === item.id ? "selected" : ""} aria-pressed={selected === item.id}
        onMouseEnter={() => setHovered(item.id)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(item.id)} onBlur={() => setHovered(null)} onClick={() => toggle(item.id)}>
        <span style={{ color: item.color }}>{sleep ? sleepIconFor(item.id) : transportIconFor(item.id)}</span><span>{item.label}</span><strong>{formatMoney(item.amount)}</strong><small>{(item.amount/total*100).toFixed(1)}%</small>
      </button>)}</div>
    </> : <p>No spending recorded for this period.</p>}
  </section>;
}

export function SpendingPanel({ transportCosts, sleepCosts, onClose, onBack }: { transportCosts: Map<string, number>; sleepCosts: Map<string, number>; onClose: () => void; onBack: () => void }) {
  return <><div className="panel-heading">
    <button type="button" className="panel-icon-button" onClick={onBack} aria-label="Back to general statistics"><ArrowLeft size={18} /></button><h2>Spending statistics</h2>
    <button type="button" className="panel-close-button" onClick={onClose} aria-label="Close panel"><X size={18} /></button>
  </div><div className="panel-scroll-content spending-content"><SpendingChart title="Transport costs" costs={transportCosts} /><SpendingChart title="Accommodation costs" costs={sleepCosts} sleep /></div></>;
}
