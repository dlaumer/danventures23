import type { SelectedChartPart, SleepStat } from "../types";
import { SleepPieChart } from "./SleepPieChart";

type SleepCategoryPanelProps = {
  selectedChartPart: SelectedChartPart | null;
  selectedSleepCategory: string | null;
  stats: SleepStat[];
  onSelectChartPart: (part: SelectedChartPart | null) => void;
  onSelectSleepCategory: (sleepCategory: string | null) => void;
};

export function SleepCategoryPanel({
  selectedChartPart,
  selectedSleepCategory,
  stats,
  onSelectChartPart,
  onSelectSleepCategory,
}: SleepCategoryPanelProps) {
  return (
    <>
      <div className="panel-heading">
        <div>
          <h2>Sleep categories</h2>
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
