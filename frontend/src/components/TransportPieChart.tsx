import { costGroupColors, transportDisplayOrder } from "../constants";
import type { SelectedChartPart, TransportStat } from "../types";
import {
  colorForTransport,
  describeArc,
  describeDonutSegment,
  formatKm,
  isFreeTransport,
  numberFromKm,
  polarToCartesian,
  transportLabel,
} from "../utils";

type TransportPieChartProps = {
  selectedPart: SelectedChartPart | null;
  stats: TransportStat[];
  selectedTransport: string | null;
  onSelectPart: (part: SelectedChartPart | null) => void;
  onSelectTransport: (transport: string | null) => void;
};

type ChartSegment = TransportStat & {
  distanceValue: number;
  endAngle: number;
  isRightSide: boolean;
  labelEndX: number;
  labelY: number;
  midAngle: number;
  startAngle: number;
  textX: number;
};

export function TransportPieChart({
  selectedPart,
  stats,
  selectedTransport,
  onSelectPart,
  onSelectTransport,
}: TransportPieChartProps) {
  const chartStats = stats
    .map((item) => ({
      ...item,
      distanceValue: numberFromKm(item.distance_km),
    }))
    .filter((item) => item.distanceValue > 0)
    .sort((a, b) => {
      const aIndex = transportDisplayOrder.indexOf(a.transport ?? "");
      const bIndex = transportDisplayOrder.indexOf(b.transport ?? "");

      return (
        (aIndex === -1 ? transportDisplayOrder.length : aIndex) -
        (bIndex === -1 ? transportDisplayOrder.length : bIndex)
      );
    });
  const total = chartStats.reduce((sum, item) => sum + item.distanceValue, 0);
  const freeTotal = chartStats
    .filter((item) => isFreeTransport(item.transport))
    .reduce((sum, item) => sum + item.distanceValue, 0);
  const paidTotal = Math.max(total - freeTotal, 0);
  const center = 150;
  const innerPieRadius = 58;
  const donutInnerRadius = 72;
  const donutOuterRadius = 112;
  const labelRadius = 121;
  const labelColumnX = { left: 34, right: 266 };
  const minLabelGap = 13;

  if (!total) {
    return <div className="transport-chart empty">No distance data</div>;
  }

  let outerAngle = 0;
  let innerAngle = 0;
  const costGroups = [
    { key: "free", label: "Free", value: freeTotal, color: costGroupColors.free },
    { key: "paid", label: "Paid", value: paidTotal, color: costGroupColors.paid },
  ].filter((item) => item.value > 0);
  const outerSegments: ChartSegment[] = chartStats.map((item) => {
    const startAngle = outerAngle;
    const endAngle = outerAngle + (item.distanceValue / total) * 360;
    const midAngle = startAngle + (endAngle - startAngle) / 2;
    const labelPoint = polarToCartesian(center, center, labelRadius, midAngle);
    const isRightSide = labelPoint.x >= center;
    outerAngle = endAngle;

    return {
      ...item,
      endAngle,
      isRightSide,
      labelEndX: isRightSide ? 260 : 40,
      labelY: labelPoint.y,
      midAngle,
      startAngle,
      textX: isRightSide ? labelColumnX.right : labelColumnX.left,
    };
  });

  (["left", "right"] as const).forEach((side) => {
    const sideSegments = outerSegments
      .filter((item) => item.isRightSide === (side === "right"))
      .sort((a, b) => a.labelY - b.labelY);

    sideSegments.forEach((item, index) => {
      if (index === 0) {
        item.labelY = Math.max(item.labelY, 22);
        return;
      }

      item.labelY = Math.max(
        item.labelY,
        sideSegments[index - 1].labelY + minLabelGap,
      );
    });

    const overflow = sideSegments.length
      ? sideSegments[sideSegments.length - 1].labelY - 278
      : 0;

    if (overflow > 0) {
      sideSegments.forEach((item) => {
        item.labelY -= overflow;
      });
    }
  });

  return (
    <div className="transport-chart" aria-label="Kilometers by transport">
      <svg viewBox="0 0 300 300" role="img">
        <title>Kilometers by transport and cost type</title>
        {costGroups.map((group) => {
          const startAngle = innerAngle;
          const endAngle = innerAngle + (group.value / total) * 360;
          innerAngle = endAngle;
          const isSelected = selectedPart?.id === `cost:${group.key}`;

          return (
            <g
              className={`chart-segment chart-inner-segment ${
                isSelected ? "selected" : ""
              }`}
              key={group.key}
              onClick={() => {
                onSelectTransport(null);
                onSelectPart(
                  isSelected
                    ? null
                    : {
                        color: group.color,
                        id: `cost:${group.key}`,
                        label: group.label,
                        value: group.value,
                      },
                );
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectTransport(null);
                  onSelectPart(
                    isSelected
                      ? null
                      : {
                          color: group.color,
                          id: `cost:${group.key}`,
                          label: group.label,
                          value: group.value,
                        },
                  );
                }
              }}
              role="button"
              tabIndex={0}
            >
              <path
                d={`${describeArc(
                  center,
                  center,
                  innerPieRadius,
                  startAngle,
                  endAngle,
                )} L ${center} ${center} Z`}
                fill={group.color}
                stroke="#fbfaf5"
                strokeWidth="1.5"
              />
            </g>
          );
        })}

        {outerSegments.map((item) => {
          const labelStart = polarToCartesian(
            center,
            center,
            116,
            item.midAngle,
          );
          const isSelected = selectedTransport === item.transport;

          return (
            <g
              className={`chart-segment ${isSelected ? "selected" : ""}`}
              key={item.transport ?? "unknown"}
              onClick={() => {
                onSelectTransport(isSelected ? null : item.transport);
                onSelectPart(
                  isSelected
                    ? null
                    : {
                        color: colorForTransport(item.transport),
                        id: `transport:${item.transport ?? "unknown"}`,
                        label: transportLabel(item.transport),
                        value: item.distanceValue,
                      },
                );
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectTransport(isSelected ? null : item.transport);
                  onSelectPart(
                    isSelected
                      ? null
                      : {
                          color: colorForTransport(item.transport),
                          id: `transport:${item.transport ?? "unknown"}`,
                          label: transportLabel(item.transport),
                          value: item.distanceValue,
                        },
                  );
                }
              }}
              role="button"
              tabIndex={0}
            >
              <path
                d={describeDonutSegment(
                  center,
                  center,
                  donutInnerRadius,
                  donutOuterRadius,
                  item.startAngle,
                  item.endAngle,
                )}
                fill={colorForTransport(item.transport)}
                stroke="#fbfaf5"
                strokeWidth="1.4"
              />
              <polyline
                fill="none"
                points={`${labelStart.x},${labelStart.y} ${item.labelEndX},${item.labelY}`}
                stroke={colorForTransport(item.transport)}
                strokeWidth="1.1"
              />
              <text
                dominantBaseline="middle"
                fill={colorForTransport(item.transport)}
                fontSize="12"
                fontWeight="650"
                textAnchor={item.isRightSide ? "start" : "end"}
                x={item.textX}
                y={item.labelY}
              >
                {transportLabel(item.transport)}
              </text>
            </g>
          );
        })}
        <circle
          cx={center}
          cy={center}
          fill="none"
          r={donutInnerRadius}
          stroke="#fbfaf5"
          strokeWidth="10"
        />
      </svg>
      <div className="chart-cost-legend" aria-label="Free versus paid">
        <span>
          <i style={{ backgroundColor: costGroupColors.free }} />
          Free {formatKm(freeTotal)} km
        </span>
        <span>
          <i style={{ backgroundColor: costGroupColors.paid }} />
          Paid {formatKm(paidTotal)} km
        </span>
      </div>
      {selectedPart && (
        <div className="chart-selection">
          <span>
            <i style={{ backgroundColor: selectedPart.color }} />
            {selectedPart.label}
          </span>
          <strong>{formatKm(selectedPart.value)} km</strong>
        </div>
      )}
    </div>
  );
}
