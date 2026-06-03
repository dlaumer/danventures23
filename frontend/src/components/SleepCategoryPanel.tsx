import { X } from "lucide-react";
import type { SelectedChartPart, SleepStat } from "../types";
import { SleepPieChart } from "./SleepPieChart";

type SleepCategoryPanelProps = {
  selectedChartPart: SelectedChartPart | null;
  selectedSleepCategory: string | null;
  stats: SleepStat[];
  onClose: () => void;
  onSelectChartPart: (part: SelectedChartPart | null) => void;
  onSelectSleepCategory: (sleepCategory: string | null) => void;
};

export function SleepCategoryPanel({
  selectedChartPart,
  selectedSleepCategory,
  stats,
  onClose,
  onSelectChartPart,
  onSelectSleepCategory,
}: SleepCategoryPanelProps) {
  return (
    <>
      <div className="panel-heading">
        <div>
          <h2>Sleep categories</h2>
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
