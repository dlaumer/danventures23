import { X } from "lucide-react";
import type { SelectedChartPart, TransportStat } from "../types";
import { TransportPieChart } from "./TransportPieChart";

type TransportDistancePanelProps = {
  orderedStats: TransportStat[];
  selectedChartPart: SelectedChartPart | null;
  selectedTransport: string | null;
  onClose: () => void;
  onSelectChartPart: (part: SelectedChartPart | null) => void;
  onSelectTransport: (transport: string | null) => void;
};

export function TransportDistancePanel({
  orderedStats,
  selectedChartPart,
  selectedTransport,
  onClose,
  onSelectChartPart,
  onSelectTransport,
}: TransportDistancePanelProps) {
  return (
    <>
      <div className="panel-heading">
        <div>
          <h2>Transport distance</h2>
        </div>
        <button
          type="button"
          className="panel-close-button"
          onClick={onClose}
          title="Close panel"
          aria-label="Close panel"
        >
          <X size={18} />
        </button>
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
