import { Eye, EyeOff, X } from "lucide-react";
import { useState } from "react";
import type {
  ChartCostSummary,
  SelectedChartPart,
  SleepCountryStat,
  SleepStat,
} from "../types";
import { formatMoney } from "../utils";
import { SleepCountryChart } from "./SleepCountryChart";
import { SleepPieChart } from "./SleepPieChart";

type SleepCategoryPanelProps = {
  selectedChartPart: SelectedChartPart | null;
  selectedCostSummary: ChartCostSummary | null;
  selectedSleepCategory: string | null;
  selectedSleepCountry: string | null;
  isSleepLayerVisible: boolean;
  countryStats: SleepCountryStat[];
  stats: SleepStat[];
  onClose: () => void;
  onSelectChartPart: (part: SelectedChartPart | null) => void;
  onSelectSleepCategory: (sleepCategory: string | null) => void;
  onSelectSleepCountry: (country: string | null) => void;
  onToggleSleepLayer: () => void;
};

export function SleepCategoryPanel({
  selectedChartPart,
  selectedCostSummary,
  selectedSleepCategory,
  selectedSleepCountry,
  isSleepLayerVisible,
  countryStats,
  stats,
  onClose,
  onSelectChartPart,
  onSelectSleepCategory,
  onSelectSleepCountry,
  onToggleSleepLayer,
}: SleepCategoryPanelProps) {
  const [activeTab, setActiveTab] = useState<"category" | "countries">(
    "category",
  );

  return (
    <>
      <div className="panel-heading">
        <div>
          <h2>Sleep</h2>
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

      <div className="panel-tabs" role="tablist" aria-label="Sleep charts">
        <button
          type="button"
          className={activeTab === "category" ? "active" : ""}
          role="tab"
          aria-selected={activeTab === "category"}
          onClick={() => setActiveTab("category")}
        >
          Category
        </button>
        <button
          type="button"
          className={activeTab === "countries" ? "active" : ""}
          role="tab"
          aria-selected={activeTab === "countries"}
          onClick={() => setActiveTab("countries")}
        >
          Countries
        </button>
      </div>

      <div className="panel-scroll-content">
        {activeTab === "category" ? (
          <SleepPieChart
            selectedPart={selectedChartPart}
            selectedSleepCategory={selectedSleepCategory}
            stats={stats}
            onSelectPart={onSelectChartPart}
            onSelectSleepCategory={(sleepCategory) => {
              onSelectSleepCountry(null);
              onSelectSleepCategory(sleepCategory);
            }}
          />
        ) : (
          <SleepCountryChart
            selectedPart={selectedChartPart}
            selectedSleepCountry={selectedSleepCountry}
            stats={countryStats}
            onSelectCountry={onSelectSleepCountry}
            onSelectPart={(part) => {
              onSelectSleepCategory(null);
              onSelectChartPart(part);
            }}
          />
        )}
        {activeTab === "category" && selectedCostSummary && (
          <div className="chart-cost-summary">
            <span>{selectedCostSummary.label} costs</span>
            <strong>{formatMoney(selectedCostSummary.amount)}</strong>
          </div>
        )}
      </div>
    </>
  );
}
