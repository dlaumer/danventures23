import type { SelectedChartPart, TransportStat } from "../types";
import { TransportPieChart } from "./TransportPieChart";

type TransportDistancePanelProps = {
  orderedStats: TransportStat[];
  selectedChartPart: SelectedChartPart | null;
  selectedTransport: string | null;
  onSelectChartPart: (part: SelectedChartPart | null) => void;
  onSelectTransport: (transport: string | null) => void;
};

export function TransportDistancePanel({
  orderedStats,
  selectedChartPart,
  selectedTransport,
  onSelectChartPart,
  onSelectTransport,
}: TransportDistancePanelProps) {
  return (
    <>
      <div className="panel-heading">
        <div>
          <h2>Transport distance</h2>
        </div>
      </div>

      <TransportPieChart
        stats={orderedStats}
        selectedPart={selectedChartPart}
        selectedTransport={selectedTransport}
        onSelectPart={onSelectChartPart}
        onSelectTransport={onSelectTransport}
      />
    </>
  );
}
