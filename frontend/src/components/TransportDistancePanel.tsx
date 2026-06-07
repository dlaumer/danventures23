import { Eye, EyeOff, X } from "lucide-react";
import type { SelectedChartPart, TransportStat } from "../types";
import { TransportPieChart } from "./TransportPieChart";

type TransportDistancePanelProps = {
  orderedStats: TransportStat[];
  selectedChartPart: SelectedChartPart | null;
  selectedTransport: string | null;
  isTransportLayerVisible: boolean;
  onClose: () => void;
  onSelectChartPart: (part: SelectedChartPart | null) => void;
  onSelectTransport: (transport: string | null) => void;
  onToggleTransportLayer: () => void;
};

export function TransportDistancePanel({
  orderedStats,
  selectedChartPart,
  selectedTransport,
  isTransportLayerVisible,
  onClose,
  onSelectChartPart,
  onSelectTransport,
  onToggleTransportLayer,
}: TransportDistancePanelProps) {
  return (
    <>
      <div className="panel-heading">
        <div>
          <h2>Transport distance</h2>
        </div>
        <div className="panel-heading-actions">
          <button
            type="button"
            className="panel-icon-button"
            onClick={onToggleTransportLayer}
            title={
              isTransportLayerVisible
                ? "Hide transport layer"
                : "Show transport layer"
            }
            aria-label={
              isTransportLayerVisible
                ? "Hide transport layer"
                : "Show transport layer"
            }
            aria-pressed={!isTransportLayerVisible}
          >
            {isTransportLayerVisible ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
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
