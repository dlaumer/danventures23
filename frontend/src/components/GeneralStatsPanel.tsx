import type { GeneralStats } from "../types";
import { formatCount, formatKm } from "../utils";

type GeneralStatsPanelProps = {
  generalStats: GeneralStats;
};

export function GeneralStatsPanel({ generalStats }: GeneralStatsPanelProps) {
  return (
    <div className="general-stats-content">
      <dl className="general-stats-grid">
        <div>
          <dt>Total distance</dt>
          <dd>{formatKm(generalStats.totalDistanceKm)} km</dd>
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
