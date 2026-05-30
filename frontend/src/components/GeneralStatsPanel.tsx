import type { GeneralStats } from "../types";
import { formatCount, formatKm } from "../utils";

type GeneralStatsPanelProps = {
  freeTransportRides: number;
  statsCount: number;
  totalKm: number;
  generalStats: GeneralStats;
};

export function GeneralStatsPanel({
  freeTransportRides,
  generalStats,
  statsCount,
  totalKm,
}: GeneralStatsPanelProps) {
  return (
    <div className="general-stats-content">
      <div className="summary compact">
        <p className="eyebrow">Distance</p>
        <strong>{formatKm(totalKm)} km</strong>
        <span>
          {formatCount(freeTransportRides)} free transport rides across{" "}
          {statsCount} transport types
        </span>
      </div>

      <dl className="general-stats-grid">
        <div>
          <dt>Total distance</dt>
          <dd>{formatKm(totalKm)} km</dd>
        </div>
        <div>
          <dt>Number of rides</dt>
          <dd>{formatCount(generalStats.rideCount)}</dd>
        </div>
        <div>
          <dt>Total days</dt>
          <dd>{formatCount(generalStats.totalDays)}</dd>
        </div>
        <div>
          <dt>Travel days</dt>
          <dd>{formatCount(generalStats.travelDayCount)}</dd>
        </div>
        <div>
          <dt>Sleeping costs</dt>
          <dd>{formatCount(generalStats.sleepCostTotal)}</dd>
        </div>
        <div>
          <dt>Transport costs</dt>
          <dd>{formatCount(generalStats.transportCostTotal)}</dd>
        </div>
      </dl>
    </div>
  );
}
