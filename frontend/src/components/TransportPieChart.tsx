import { costGroupColors, transportDisplayOrder } from "../constants";
import type { CSSProperties } from "react";
import {
  Bike,
  Bus,
  Car,
  Footprints,
  Plane,
  Ship,
  Train,
  Truck,
  Users,
} from "lucide-react";
import type { SelectedChartPart, TransportStat } from "../types";
import {
  colorForTransport,
  formatKm,
  isFreeTransport,
  numberFromKm,
  transportLabel,
} from "../utils";

type TransportPieChartProps = {
  selectedPart: SelectedChartPart | null;
  stats: TransportStat[];
  selectedTransport: string | null;
  onSelectPart: (part: SelectedChartPart | null) => void;
  onSelectTransport: (transport: string | null) => void;
};

type TransportBarItem = TransportStat & {
  color: string;
  distanceValue: number;
  group: "free" | "paid";
  label: string;
};

function transportOrder(value: string | null) {
  const index = transportDisplayOrder.indexOf(value ?? "");
  return index === -1 ? transportDisplayOrder.length : index;
}

function transportIconFor(value: string | null) {
  const size = 14;

  switch (value) {
    case "bike":
      return <Bike size={size} />;
    case "bus":
      return <Bus size={size} />;
    case "boat":
    case "ferry":
      return <Ship size={size} />;
    case "foot":
      return <Footprints size={size} />;
    case "plane":
      return <Plane size={size} />;
    case "train":
      return <Train size={size} />;
    case "truck":
      return <Truck size={size} />;
    case "friends":
      return <Users size={size} />;
    case "car":
    case "rentalCar":
    case "taxi":
    default:
      return <Car size={size} />;
  }
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

export function TransportPieChart({
  selectedPart,
  stats,
  selectedTransport,
  onSelectPart,
  onSelectTransport,
}: TransportPieChartProps) {
  const items: TransportBarItem[] = stats
    .map((item) => ({
      ...item,
      color: colorForTransport(item.transport),
      distanceValue: numberFromKm(item.distance_km),
      group: (isFreeTransport(item.transport) ? "free" : "paid") as
        | "free"
        | "paid",
      label: transportLabel(item.transport),
    }))
    .filter((item) => item.distanceValue > 0)
    .sort((a, b) => {
      if (a.group !== b.group) return a.group === "free" ? -1 : 1;
      if (a.distanceValue !== b.distanceValue) {
        return b.distanceValue - a.distanceValue;
      }
      return transportOrder(a.transport) - transportOrder(b.transport);
    });
  const maxValue = Math.max(...items.map((item) => item.distanceValue), 0);
  const groupTotals = {
    free: items
      .filter((item) => item.group === "free")
      .reduce((sum, item) => sum + item.distanceValue, 0),
    paid: items
      .filter((item) => item.group === "paid")
      .reduce((sum, item) => sum + item.distanceValue, 0),
  };

  if (!items.length || !maxValue) {
    return <div className="transport-chart empty">No distance data</div>;
  }

  return (
    <div className="bar-chart" aria-label="Kilometers by transport">
      {(["free", "paid"] as const).map((group) => {
        const groupItems = items.filter((item) => item.group === group);
        if (!groupItems.length) return null;
        const color =
          group === "free" ? costGroupColors.free : costGroupColors.paid;
        const isGroupSelected = selectedPart?.id === `cost:${group}`;
        const toggleGroupSelection = () => {
          onSelectTransport(null);
          onSelectPart(
            isGroupSelected
              ? null
              : {
                  color,
                  id: `cost:${group}`,
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
              title={group === "free" ? "Free transport" : "Paid transport"}
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
                <strong>{formatKm(groupTotals[group])} km</strong>
              </button>
              <div className="bar-chart-rows">
                {groupItems.map((item) => {
                  const isSelected = selectedTransport === item.transport;
                  const width = logarithmicBarWidth(
                    item.distanceValue,
                    maxValue,
                  );

                  return (
                    <button
                      type="button"
                      className={`bar-chart-row ${isSelected ? "selected" : ""}`}
                      key={item.transport ?? "unknown"}
                      onClick={() => {
                        onSelectTransport(isSelected ? null : item.transport);
                        onSelectPart(
                          isSelected
                            ? null
                            : {
                                color: item.color,
                                id: `transport:${item.transport ?? "unknown"}`,
                                label: item.label,
                                value: item.distanceValue,
                              },
                        );
                      }}
                    >
                      <span className="bar-chart-label">
                        <span
                          className="bar-chart-icon"
                          style={{ color: item.color }}
                        >
                          {transportIconFor(item.transport)}
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
                      <strong>{formatKm(item.distanceValue)} km</strong>
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
