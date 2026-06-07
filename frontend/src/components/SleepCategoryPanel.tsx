import { Eye, EyeOff, X } from "lucide-react";
import type { SelectedChartPart, SleepStat } from "../types";
import { SleepPieChart } from "./SleepPieChart";

type SleepCategoryPanelProps = {
  selectedChartPart: SelectedChartPart | null;
  selectedSleepCategory: string | null;
  isSleepLayerVisible: boolean;
  stats: SleepStat[];
  onClose: () => void;
  onSelectChartPart: (part: SelectedChartPart | null) => void;
  onSelectSleepCategory: (sleepCategory: string | null) => void;
  onToggleSleepLayer: () => void;
};

export function SleepCategoryPanel({
  selectedChartPart,
  selectedSleepCategory,
  isSleepLayerVisible,
  stats,
  onClose,
  onSelectChartPart,
  onSelectSleepCategory,
  onToggleSleepLayer,
}: SleepCategoryPanelProps) {
  return (
    <>
      <div className="panel-heading">
        <div>
          <h2>Sleep categories</h2>
        </div>
        <div className="panel-heading-actions">
          <button
            type="button"
            className="panel-icon-button"
            onClick={onToggleSleepLayer}
            title={isSleepLayerVisible ? "Hide sleep layer" : "Show sleep layer"}
            aria-label={
              isSleepLayerVisible ? "Hide sleep layer" : "Show sleep layer"
            }
            aria-pressed={!isSleepLayerVisible}
          >
            {isSleepLayerVisible ? <Eye size={18} /> : <EyeOff size={18} />}
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

      <SleepPieChart
        selectedPart={selectedChartPart}
        selectedSleepCategory={selectedSleepCategory}
        stats={stats}
        onSelectPart={onSelectChartPart}
        onSelectSleepCategory={onSelectSleepCategory}
      />
    </>
  );
}
