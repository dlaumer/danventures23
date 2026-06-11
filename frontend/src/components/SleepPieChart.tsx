import type { CSSProperties } from "react";
import {
  BedDouble,
  HandHeart,
  Home,
  Sailboat,
  Tent,
  Users,
} from "lucide-react";
import { costGroupColors, sleepCategoryDisplayOrder } from "../constants";
import type { SelectedChartPart, SleepStat } from "../types";
import {
  colorForSleepCategory,
  formatCount,
  isPaidSleepCategory,
  sleepCategoryLabel,
} from "../utils";

type SleepPieChartProps = {
  selectedPart: SelectedChartPart | null;
  selectedSleepCategory: string | null;
  stats: SleepStat[];
  onSelectPart: (part: SelectedChartPart | null) => void;
  onSelectSleepCategory: (sleepCategory: string | null) => void;
};

type SleepBarItem = SleepStat & {
  color: string;
  group: "free" | "paid";
  label: string;
};

function sleepCategoryOrder(value: string | null) {
  const index = sleepCategoryDisplayOrder.indexOf(value ?? "");
  return index === -1 ? sleepCategoryDisplayOrder.length : index;
}

function sleepIconFor(value: string | null) {
  const size = 14;

  switch (value) {
    case "camping":
    case "campingPaid":
      return <Tent size={size} />;
    case "boat":
      return <Sailboat size={size} />;
    case "house":
    case "airbnb":
    case "renting":
      return <Home size={size} />;
    case "friends":
    case "couchsurfing":
      return <Users size={size} />;
    case "volunteering":
      return <HandHeart size={size} />;
    case "hostel":
    default:
      return <BedDouble size={size} />;
  }
}

function describeNights(value: number) {
  return `${formatCount(value)} ${value === 1 ? "night" : "nights"}`;
}

function logarithmicBarWidth(value: number, maxValue: number) {
  if (!value || !maxValue) return "0%";
  const linear = value / maxValue;
  const logarithmic = Math.log10(value + 1) / Math.log10(maxValue + 1);
  const blended = linear * 0.55 + logarithmic * 0.45;
  return `${Math.max(6, blended * 100)}%`;
}

function paleColor(color: string) {
  const hex = color.replace("#", "");
  if (hex.length !== 6) return color;
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, 0.18)`;
}

export function SleepPieChart({
  selectedPart,
  selectedSleepCategory,
  stats,
  onSelectPart,
  onSelectSleepCategory,
}: SleepPieChartProps) {
  const items: SleepBarItem[] = stats
    .filter((item) => item.night_count > 0)
    .map((item) => ({
      ...item,
      color: colorForSleepCategory(item.sleepcategory),
      group: (isPaidSleepCategory(item.sleepcategory) ? "paid" : "free") as
        | "free"
        | "paid",
      label: sleepCategoryLabel(item.sleepcategory),
    }))
    .sort((a, b) => {
      if (a.group !== b.group) return a.group === "free" ? -1 : 1;
      return (
        sleepCategoryOrder(a.sleepcategory) -
        sleepCategoryOrder(b.sleepcategory)
      );
    });
  const maxValue = Math.max(...items.map((item) => item.night_count), 0);
  const groupTotals = {
    free: items
      .filter((item) => item.group === "free")
      .reduce((sum, item) => sum + item.night_count, 0),
    paid: items
      .filter((item) => item.group === "paid")
      .reduce((sum, item) => sum + item.night_count, 0),
  };

  if (!items.length || !maxValue) {
    return <div className="transport-chart empty">No sleep data</div>;
  }

  return (
    <div className="bar-chart sleep-chart" aria-label="Nights by sleep category">
      {(["free", "paid"] as const).map((group) => {
        const groupItems = items.filter((item) => item.group === group);
        if (!groupItems.length) return null;
        const color =
          group === "free" ? costGroupColors.free : costGroupColors.paid;
        const isGroupSelected = selectedPart?.id === `sleep-cost:${group}`;
        const toggleGroupSelection = () => {
          onSelectSleepCategory(null);
          onSelectPart(
            isGroupSelected
              ? null
              : {
                  color,
                  id: `sleep-cost:${group}`,
                  label: group === "free" ? "Free" : "Paid",
                  value: groupTotals[group],
                },
          );
        };

        return (
          <div className="bar-chart-group" key={group}>
            <button
              type="button"
              className={`bar-chart-group-rail ${
                isGroupSelected ? "selected" : ""
              }`}
              onClick={toggleGroupSelection}
              style={
                {
                  "--group-color": color,
                  "--group-fill": paleColor(color),
                } as CSSProperties
              }
              title={group === "free" ? "Free stays" : "Paid stays"}
            />
            <div className="bar-chart-group-body">
              <button
                type="button"
                className={`bar-chart-group-header ${
                  isGroupSelected ? "selected" : ""
                }`}
                onClick={toggleGroupSelection}
              >
                <span>{group === "free" ? "Free" : "Paid"}</span>
                <strong>{describeNights(groupTotals[group])}</strong>
              </button>
              <div className="bar-chart-rows">
                {groupItems.map((item) => {
                  const isSelected =
                    selectedSleepCategory === item.sleepcategory;
                  const width = logarithmicBarWidth(item.night_count, maxValue);

                  return (
                    <button
                      type="button"
                      className={`bar-chart-row ${isSelected ? "selected" : ""}`}
                      key={item.sleepcategory ?? "unknown"}
                      onClick={() => {
                        onSelectSleepCategory(
                          isSelected ? null : item.sleepcategory,
                        );
                        onSelectPart(
                          isSelected
                            ? null
                            : {
                                color: item.color,
                                id: `sleep:${item.sleepcategory ?? "unknown"}`,
                                label: item.label,
                                value: item.night_count,
                              },
                        );
                      }}
                    >
                      <span className="bar-chart-label">
                        <span
                          className="bar-chart-icon"
                          style={{ color: item.color }}
                        >
                          {sleepIconFor(item.sleepcategory)}
                        </span>
                        <span>{item.label}</span>
                      </span>
                      <span className="bar-track">
                        <span
                          className="bar-fill"
                          style={{
                            backgroundColor: paleColor(item.color),
                            borderColor: item.color,
                            width,
                          }}
                        />
                      </span>
                      <strong>{describeNights(item.night_count)}</strong>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
