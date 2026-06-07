import {
  BedDouble,
  CalendarDays,
  CircleDollarSign,
  MapPinned,
  Route,
  Sparkles,
} from "lucide-react";
import type { GeneralStats } from "../types";
import { formatCount, formatKm, formatMoney } from "../utils";

type GeneralStatsPanelProps = {
  generalStats: GeneralStats;
};

export function GeneralStatsPanel({ generalStats }: GeneralStatsPanelProps) {
  const travelRatio =
    generalStats.totalDays > 0
      ? Math.round((generalStats.travelDayCount / generalStats.totalDays) * 100)
      : 0;
  const secondaryStats = [
    {
      icon: <Route size={15} />,
      label: "Rides",
      value: formatCount(generalStats.rideCount),
    },
    {
      icon: <CalendarDays size={15} />,
      label: "Travel days",
      value: formatCount(generalStats.travelDayCount),
    },
    {
      icon: <CircleDollarSign size={15} />,
      label: "Transport costs",
      value: formatMoney(generalStats.transportCostTotal),
    },
    {
      icon: <BedDouble size={15} />,
      label: "Sleeping costs",
      value: formatMoney(generalStats.sleepCostTotal),
    },
  ];

  return (
    <div className="general-stats-content">
      <section className="general-hero-stat">
        <span className="general-hero-icon">
          <MapPinned size={19} />
        </span>
        <div>
          <span>Total distance</span>
          <strong>{formatKm(generalStats.totalDistanceKm)} km</strong>
        </div>
      </section>

      <section className="general-days-card">
        <div>
          <span>On the road</span>
          <strong>{formatCount(generalStats.totalDays)} days</strong>
        </div>
        <div className="general-days-meter" aria-hidden="true">
          <span style={{ width: `${Math.min(travelRatio, 100)}%` }} />
        </div>
        <p>
          <Sparkles size={14} />
          {travelRatio}% of the trip days include travel movement
        </p>
      </section>

      <div className="general-stat-list">
        {secondaryStats.map((item) => (
          <div className="general-stat-row" key={item.label}>
            <span className="general-stat-icon">{item.icon}</span>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
