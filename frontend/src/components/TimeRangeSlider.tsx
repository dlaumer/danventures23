import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import type {
  MonthlyTransportDistanceBucket,
  TravelTimeRange,
} from "../types";
import {
  colorForTransport,
  formatKm,
  numberFromKm,
  parseTravelDate,
  transportLabel,
} from "../utils";
import { transportDisplayOrder } from "../constants";

type TimeRangeSliderProps = {
  className?: string;
  monthlyStats: MonthlyTransportDistanceBucket[];
  range: TravelTimeRange | null;
  selectedDistanceKm: number;
  onChange: (range: TravelTimeRange | null) => void;
};

type MonthTransportStack = {
  color: string;
  distanceKm: number;
  key: string;
  label: string;
};

type MonthBucket = {
  endMs: number;
  label: string;
  monthKey: string;
  startMs: number;
  totalKm: number;
  transports: MonthTransportStack[];
};

const minSelectedMonths = 1;

function formatMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
  }).format(date);
}

function orderTransports(a: [string, number], b: [string, number]) {
  const aIndex = transportDisplayOrder.indexOf(a[0]);
  const bIndex = transportDisplayOrder.indexOf(b[0]);

  if (aIndex !== bIndex) {
    return (
      (aIndex === -1 ? transportDisplayOrder.length : aIndex) -
      (bIndex === -1 ? transportDisplayOrder.length : bIndex)
    );
  }

  return a[0].localeCompare(b[0]);
}

function formatCompactMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "2-digit",
  }).format(date);
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function formatDateInputValue(ms: number) {
  const date = new Date(ms);
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join("-");
}

function dateInputStartMs(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
}

function dateInputEndMs(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
}

function formatRangeDate(ms: number) {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(ms));
}

function paleColor(color: string) {
  const hex = color.replace("#", "");
  if (hex.length !== 6) return color;
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, 0.38)`;
}

function buildMonthBuckets(
  monthlyStats: MonthlyTransportDistanceBucket[],
): MonthBucket[] {
  return monthlyStats
    .map((bucket) => {
      const startDate = parseTravelDate(bucket.month_start);
      const endDate = parseTravelDate(bucket.month_end);
      if (!startDate || !endDate) return null;

      return {
        endMs: endDate.getTime(),
        label: formatMonthLabel(startDate),
        monthKey: formatMonthKey(startDate),
        startMs: startDate.getTime(),
        totalKm: numberFromKm(bucket.total_km),
        transports: bucket.transports
          .map((transport) => {
            const key = transport.transport ?? "unknown";

            return {
              color: colorForTransport(key),
              distanceKm: numberFromKm(transport.distance_km),
              key,
              label: transportLabel(key),
            };
          })
          .filter((transport) => transport.distanceKm > 0)
          .sort((a, b) => orderTransports([a.key, a.distanceKm], [b.key, b.distanceKm])),
      };
    })
    .filter((bucket): bucket is MonthBucket => Boolean(bucket));
}

function clampRangeStart(index: number, endIndex: number) {
  return Math.max(0, Math.min(index, endIndex - minSelectedMonths + 1));
}

function clampRangeEnd(index: number, startIndex: number, maxIndex: number) {
  return Math.min(maxIndex, Math.max(index, startIndex + minSelectedMonths - 1));
}

export function TimeRangeSlider({
  className = "",
  monthlyStats,
  range,
  selectedDistanceKm,
  onChange,
}: TimeRangeSliderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const datePopoverRef = useRef<HTMLDivElement | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const buckets = useMemo(
    () => buildMonthBuckets(monthlyStats),
    [monthlyStats],
  );
  const maxLogKm = Math.max(
    1,
    ...buckets.map((bucket) => Math.log1p(bucket.totalKm)),
  );
  const minDateMs = buckets[0]?.startMs ?? 0;
  const maxDateMs = buckets[buckets.length - 1]?.endMs ?? 0;
  const activeRange = range ?? { endMs: maxDateMs, startMs: minDateMs };
  const selectedStartIndex = buckets.findIndex(
    (bucket) => bucket.endMs >= activeRange.startMs,
  );
  const selectedEndIndex = (() => {
    for (let index = buckets.length - 1; index >= 0; index -= 1) {
      if (buckets[index].startMs <= activeRange.endMs) return index;
    }

    return -1;
  })();
  const startIndex = selectedStartIndex === -1 ? 0 : selectedStartIndex;
  const endIndex =
    selectedEndIndex === -1 ? buckets.length - 1 : selectedEndIndex;
  const minDateInput = minDateMs ? formatDateInputValue(minDateMs) : "";
  const maxDateInput = maxDateMs ? formatDateInputValue(maxDateMs) : "";

  useEffect(() => {
    if (buckets.length === 0) {
      if (range) onChange(null);
      return;
    }

    const fullRange = {
      endMs: buckets[buckets.length - 1].endMs,
      startMs: buckets[0].startMs,
    };

    if (
      !range ||
      range.endMs < fullRange.startMs ||
      range.startMs > fullRange.endMs ||
      range.startMs > range.endMs
    ) {
      onChange(fullRange);
    }
  }, [buckets, onChange, range]);

  useEffect(() => {
    if (!isDatePickerOpen) return;

    const closeOnOutsidePointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        datePopoverRef.current?.contains(target)
      ) {
        return;
      }

      setIsDatePickerOpen(false);
    };

    window.addEventListener("mousedown", closeOnOutsidePointer);
    window.addEventListener("touchstart", closeOnOutsidePointer);
    return () => {
      window.removeEventListener("mousedown", closeOnOutsidePointer);
      window.removeEventListener("touchstart", closeOnOutsidePointer);
    };
  }, [isDatePickerOpen]);

  const updateRange = useCallback(
    (nextStartIndex: number, nextEndIndex: number) => {
      const nextStart = buckets[nextStartIndex];
      const nextEnd = buckets[nextEndIndex];
      if (!nextStart || !nextEnd) return;

      onChange({
        endMs: nextEnd.endMs,
        startMs: nextStart.startMs,
      });
    },
    [buckets, onChange],
  );

  const indexFromClientX = useCallback(
    (clientX: number, side: "start" | "end") => {
      const track = trackRef.current;
      if (!track || buckets.length <= 1) return 0;

      const rect = track.getBoundingClientRect();
      const barInset =
        parseFloat(getComputedStyle(track).getPropertyValue("--bar-inset")) || 0;
      const progress = (clientX - rect.left - barInset) / (rect.width - barInset * 2);
      const boundedProgress = Math.max(0, Math.min(1, progress));
      const nextIndex =
        side === "start"
          ? Math.floor(boundedProgress * buckets.length)
          : Math.ceil(boundedProgress * buckets.length) - 1;

      return Math.max(
        0,
        Math.min(buckets.length - 1, nextIndex),
      );
    },
    [buckets.length],
  );

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const updateTrackWidth = () => {
      setTrackWidth(track.getBoundingClientRect().width);
    };
    const resizeObserver = new ResizeObserver(updateTrackWidth);

    updateTrackWidth();
    resizeObserver.observe(track);
    return () => resizeObserver.disconnect();
  }, [buckets.length]);

  const startHandleDrag =
    (side: "start" | "end") => (event: PointerEvent<HTMLButtonElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);

      const moveHandle = (clientX: number) => {
        const nextIndex = indexFromClientX(clientX, side);
        if (side === "start") {
          updateRange(clampRangeStart(nextIndex, endIndex), endIndex);
          return;
        }

        updateRange(
          startIndex,
          clampRangeEnd(nextIndex, startIndex, buckets.length - 1),
        );
      };

      moveHandle(event.clientX);

      const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
        moveHandle(moveEvent.clientX);
      };
      const stopDragging = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", stopDragging);
        window.removeEventListener("pointercancel", stopDragging);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stopDragging);
      window.addEventListener("pointercancel", stopDragging);
    };

  if (buckets.length === 0) return null;

  const selectedLeft = buckets.length === 0 ? 0 : (startIndex / buckets.length) * 100;
  const selectedRight =
    buckets.length === 0
      ? 0
      : 100 - ((endIndex + 1) / buckets.length) * 100;
  const barInset = (() => {
    const track = trackRef.current;
    if (!track) return 28;
    return (
      parseFloat(getComputedStyle(track).getPropertyValue("--bar-inset")) || 28
    );
  })();
  const panelInset = (() => {
    const track = trackRef.current;
    if (!track) return 11;
    return (
      parseFloat(getComputedStyle(track).getPropertyValue("--panel-inset")) || 11
    );
  })();
  const selectionLaneWidth = Math.max(0, trackWidth - barInset * 2);
  const selectedLeftValue =
    startIndex === 0
      ? `${panelInset}px`
      : trackWidth > 0
      ? `${barInset + (selectedLeft / 100) * selectionLaneWidth}px`
      : `${selectedLeft}%`;
  const selectedRightValue =
    endIndex === buckets.length - 1
      ? `${panelInset}px`
      : trackWidth > 0
      ? `${barInset + (selectedRight / 100) * selectionLaneWidth}px`
      : `${selectedRight}%`;
  const exactSelectedLabel = `${formatRangeDate(activeRange.startMs)} - ${formatRangeDate(
    activeRange.endMs,
  )}`;

  const updateStartDate = (value: string) => {
    const nextStartMs = dateInputStartMs(value);
    onChange({
      endMs: Math.max(activeRange.endMs, dateInputEndMs(value)),
      startMs: Math.min(nextStartMs, maxDateMs),
    });
  };

  const updateEndDate = (value: string) => {
    const nextEndMs = dateInputEndMs(value);
    onChange({
      endMs: Math.max(minDateMs, nextEndMs),
      startMs: Math.min(activeRange.startMs, dateInputStartMs(value)),
    });
  };

  return (
    <section
      className={`time-slider-shell ${className}`.trim()}
      aria-label="Travel time range"
    >
      <div className="time-slider-summary" ref={datePopoverRef}>
        <button
          type="button"
          className="time-slider-date-button"
          onClick={() => setIsDatePickerOpen((current) => !current)}
          title="Choose exact date range"
          aria-expanded={isDatePickerOpen}
        >
          {exactSelectedLabel}
        </button>
        <strong>{formatKm(selectedDistanceKm)} km</strong>
        {isDatePickerOpen && (
          <div className="time-slider-date-popover">
            <label>
              <span>Start</span>
              <input
                type="date"
                min={minDateInput}
                max={maxDateInput}
                value={formatDateInputValue(activeRange.startMs)}
                onChange={(event) => updateStartDate(event.target.value)}
              />
            </label>
            <label>
              <span>End</span>
              <input
                type="date"
                min={minDateInput}
                max={maxDateInput}
                value={formatDateInputValue(activeRange.endMs)}
                onChange={(event) => updateEndDate(event.target.value)}
              />
            </label>
          </div>
        )}
      </div>

      <div
        ref={trackRef}
        className="time-slider-track"
        style={
          {
            "--selected-left": selectedLeftValue,
            "--selected-right": selectedRightValue,
            "--bucket-count": buckets.length,
          } as CSSProperties
        }
      >
        <div className="time-slider-bars" aria-hidden="true">
          {buckets.map((bucket, index) => {
            const height = Math.max(
              bucket.totalKm > 0 ? 7 : 3,
              (Math.log1p(bucket.totalKm) / maxLogKm) * 52,
            );
            const isDimmed = index < startIndex || index > endIndex;

            return (
              <div
                className={
                  isDimmed ? "time-slider-month dimmed" : "time-slider-month"
                }
                key={bucket.startMs}
                title={`${bucket.label}: ${formatKm(bucket.totalKm)} km`}
                style={{ height: `${height}px` }}
              >
                {bucket.transports.map((transport) => (
                  <span
                    key={transport.key}
                    style={{
                      backgroundColor: paleColor(transport.color),
                      height: `${(transport.distanceKm / bucket.totalKm) * 100}%`,
                    }}
                    title={`${transport.label}: ${formatKm(transport.distanceKm)} km`}
                  />
                ))}
              </div>
            );
          })}
        </div>
        <div className="time-slider-selection" aria-hidden="true" />
        <button
          type="button"
          className="time-slider-handle start"
          onPointerDown={startHandleDrag("start")}
          title="Adjust start date"
          aria-label="Adjust start date"
        >
          <span />
        </button>
        <button
          type="button"
          className="time-slider-handle end"
          onPointerDown={startHandleDrag("end")}
          title="Adjust end date"
          aria-label="Adjust end date"
        >
          <span />
        </button>
      </div>

      <div className="time-slider-labels" aria-hidden="true">
        {buckets.map((bucket, index) => {
          const date = new Date(bucket.startMs);
          const shouldShow =
            index === 0 ||
            index === buckets.length - 1 ||
            date.getMonth() === 0 ||
            date.getMonth() === 6;
          if (!shouldShow) return null;

          return (
            <span
              key={bucket.monthKey}
              style={{
                left:
                  buckets.length === 1
                    ? "0%"
                    : `${(index / (buckets.length - 1)) * 100}%`,
              }}
            >
              {formatCompactMonthLabel(date)}
            </span>
          );
        })}
      </div>
    </section>
  );
}
