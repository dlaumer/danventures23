import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { BedDouble, ChevronDown, MapPin, Navigation, SquarePen } from "lucide-react";
import {
  initialTimelineEntryCount,
  timelineEntryBatchSize,
  timelineTargetContextCount,
} from "../constants";
import type {
  FeatureCollection,
  LocationFormState,
  TimelineEntry,
  TimelineLegEntry,
  TimelineLocationEntry,
} from "../types";
import {
  colorForTransport,
  coordinatesForFeature,
  formatCoordinate,
  formatKm,
  formatTimelineDate,
  formatTimelineDateTime,
  formFromFeature,
  featureRecordId,
  optionLabel,
  parseTravelDate,
  propertyNumber,
  propertyString,
  timelineEntryId,
  transportLabel,
} from "../utils";

type TravelTimelineProps = {
  legs: FeatureCollection | null;
  locations: FeatureCollection | null;
  targetEntryId: string | null;
  targetEntrySignal: number;
  onEditLocation: (id: number, form: LocationFormState) => void;
};

function buildTimelineEntries(
  locations: FeatureCollection | null,
  legs: FeatureCollection | null,
) {
  const locationEntries: TimelineLocationEntry[] =
    locations?.features.map((feature, index) => ({
      date: parseTravelDate(feature.properties?.travel_date),
      feature,
      id: timelineEntryId("location", feature, index),
      kind: "location",
    })) ?? [];

  const legEntries: TimelineLegEntry[] =
    legs?.features.map((feature, index) => {
      const distanceKm = propertyNumber(feature.properties, "distance_m") / 1000;
      const gap = Math.min(
        126,
        Math.max(38, Math.round(34 + Math.log10(distanceKm + 1) * 28)),
      );

      return {
        date: parseTravelDate(feature.properties?.travel_date),
        feature,
        gap,
        id: timelineEntryId("leg", feature, index),
        kind: "leg",
      };
    }) ?? [];

  return [...locationEntries, ...legEntries].sort((a, b) => {
    const aTime = a.date?.getTime() ?? 0;
    const bTime = b.date?.getTime() ?? 0;

    if (aTime !== bTime) return bTime - aTime;
    if (a.kind !== b.kind) return a.kind === "location" ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

function TimelineDetails({ entry }: { entry: TimelineEntry }) {
  const properties = entry.feature.properties ?? {};

  if (entry.kind === "leg") {
    const distanceKm = propertyNumber(properties, "distance_m") / 1000;
    const transport = propertyString(properties, "transport");
    const rows = [
      ["From", propertyString(properties, "from_name")],
      ["To", propertyString(properties, "to_name")],
      ["Transport", transport ? transportLabel(transport) : null],
      ["Date", formatTimelineDateTime(entry.date)],
      ["Distance", `${formatKm(distanceKm)} km`],
      ["Travel cost", propertyString(properties, "travel_cost")],
      ["Route source", propertyString(properties, "route_source")],
      ["Route confidence", propertyString(properties, "route_confidence")],
    ].filter(([, value]) => value);

    return (
      <dl className="timeline-details">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    );
  }

  const coordinates = coordinatesForFeature(entry.feature);
  const pointType = propertyString(properties, "pointtype") ?? "waypoint";
  const rows = [
    ["Name", propertyString(properties, "name")],
    ["Type", optionLabel(pointType)],
    ["Date", formatTimelineDateTime(entry.date)],
    ["Transport", optionLabel(propertyString(properties, "transport") ?? "")],
    ["Sleep category", propertyString(properties, "sleepcategory")],
    ["Nights", propertyString(properties, "nonights")],
    ["People", propertyString(properties, "people")],
    ["Boat", propertyString(properties, "boat")],
    ["Travel cost", propertyString(properties, "travelcost")],
    ["Sleep cost", propertyString(properties, "sleepcost")],
    ["Description", propertyString(properties, "description")],
    [
      "Coordinates",
      coordinates
        ? `${formatCoordinate(coordinates.lat)}, ${formatCoordinate(
            coordinates.lng,
          )}`
        : null,
    ],
  ].filter(([, value]) => value);

  return (
    <dl className="timeline-details">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

type TimelineRange = {
  end: number;
  start: number;
};

export function TravelTimeline({
  legs,
  locations,
  targetEntryId,
  targetEntrySignal,
  onEditLocation,
}: TravelTimelineProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);
  const entryRefs = useRef(new Map<string, HTMLElement>());
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const [visibleRange, setVisibleRange] = useState<TimelineRange>({
    end: initialTimelineEntryCount,
    start: 0,
  });
  const entries = useMemo(
    () => buildTimelineEntries(locations, legs),
    [locations, legs],
  );
  const visibleEntries = entries.slice(visibleRange.start, visibleRange.end);

  useEffect(() => {
    setVisibleRange({ end: initialTimelineEntryCount, start: 0 });
    setExpandedEntryId(null);
  }, [entries.length, visibleRange.end, visibleRange.start]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const observer = new IntersectionObserver(
      (intersections) => {
        intersections.forEach((intersection) => {
          if (!intersection.isIntersecting) return;

          if (intersection.target === bottomSentinelRef.current) {
            setVisibleRange((current) => ({
              end: Math.min(current.end + timelineEntryBatchSize, entries.length),
              start: current.start,
            }));
          }

          if (intersection.target === topSentinelRef.current) {
            setVisibleRange((current) => ({
              end: current.end,
              start: Math.max(0, current.start - timelineEntryBatchSize),
            }));
          }
        });
      },
      { root: list, rootMargin: "80px 0px", threshold: 0.01 },
    );

    if (topSentinelRef.current) observer.observe(topSentinelRef.current);
    if (bottomSentinelRef.current) observer.observe(bottomSentinelRef.current);

    return () => observer.disconnect();
  }, [entries.length]);

  useEffect(() => {
    if (!targetEntryId) return;
    const targetIndex = entries.findIndex((entry) => entry.id === targetEntryId);
    if (targetIndex === -1) return;

    setExpandedEntryId(targetEntryId);
    setVisibleRange({
      end: Math.min(entries.length, targetIndex + timelineTargetContextCount + 1),
      start: Math.max(0, targetIndex - timelineTargetContextCount),
    });
  }, [entries, targetEntryId, targetEntrySignal]);

  useEffect(() => {
    if (!targetEntryId) return;

    window.requestAnimationFrame(() => {
      entryRefs.current.get(targetEntryId)?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    });
  }, [targetEntryId, targetEntrySignal, visibleRange]);

  return (
    <div className="timeline-panel">

      <div
        ref={listRef}
        className="timeline-list"
        aria-label="Chronological locations and legs"
      >
        {entries.length === 0 && (
          <div className="timeline-empty">No locations or legs yet.</div>
        )}

        {visibleRange.start > 0 && (
          <div ref={topSentinelRef} className="timeline-sentinel">
            Loading newer timeline entries
          </div>
        )}

        {visibleEntries.map((entry) => {
          const properties = entry.feature.properties ?? {};
          const isExpanded = expandedEntryId === entry.id;
          const isTargeted = targetEntryId === entry.id;
          const setEntryRef = (element: HTMLElement | null) => {
            if (element) {
              entryRefs.current.set(entry.id, element);
              return;
            }

            entryRefs.current.delete(entry.id);
          };

          if (entry.kind === "leg") {
            const transport = propertyString(properties, "transport");
            const color = colorForTransport(transport);
            const distanceKm = propertyNumber(properties, "distance_m") / 1000;
            const fromName = propertyString(properties, "from_name") ?? "Unknown";
            const toName = propertyString(properties, "to_name") ?? "Unknown";

            return (
              <article
                ref={setEntryRef}
                className={`timeline-entry leg ${isTargeted ? "targeted" : ""}`}
                data-entry-id={entry.id}
                key={entry.id}
              >
                <div
                  className="timeline-rail"
                  style={{ "--line-color": color } as CSSProperties}
                >
                  <span
                    className="timeline-line"
                    style={{ minHeight: `${entry.gap}px` }}
                  />
                </div>
                <div className="timeline-content">
                  <button
                    type="button"
                    className="timeline-trigger"
                    aria-expanded={isExpanded}
                    onClick={() =>
                      setExpandedEntryId(isExpanded ? null : entry.id)
                    }
                  >
                    <span className="timeline-icon leg-icon">
                      <Navigation size={13} />
                    </span>
                    <span className="timeline-main">
                      <strong>
                        {fromName} to {toName}
                      </strong>
                      <span>
                        {formatTimelineDate(entry.date)} -{" "}
                        {transportLabel(transport)} - {formatKm(distanceKm)} km
                      </span>
                    </span>
                    <ChevronDown size={16} />
                  </button>
                  {isExpanded && <TimelineDetails entry={entry} />}
                </div>
              </article>
            );
          }

          const pointType = propertyString(properties, "pointtype");
          const isSleep = pointType === "sleep";
          const transport = propertyString(properties, "transport");
          const name = propertyString(properties, "name") ?? "Unnamed location";

          return (
            <article
              ref={setEntryRef}
              className={`timeline-entry location ${
                isTargeted ? "targeted" : ""
              }`}
              data-entry-id={entry.id}
              key={entry.id}
            >
              <div
                className="timeline-rail"
                style={
                  {
                    "--line-color": colorForTransport(transport),
                  } as CSSProperties
                }
              >
                <span className="timeline-line" />
                <span className={`timeline-marker ${isSleep ? "sleep" : "waypoint"}`}>
                  {isSleep ? <BedDouble size={14} /> : <MapPin size={14} />}
                </span>
              </div>
              <div className="timeline-content">
                <button
                  type="button"
                  className="timeline-trigger"
                  aria-expanded={isExpanded}
                  onClick={() => setExpandedEntryId(isExpanded ? null : entry.id)}
                >
                  <span className="timeline-main">
                    <strong>{name}</strong>
                    <span>
                      {formatTimelineDate(entry.date)} -{" "}
                      {isSleep ? "sleep" : "waypoint"}
                    </span>
                  </span>
                  <ChevronDown size={16} />
                </button>
                <button
                  type="button"
                  className="timeline-edit-button"
                    onClick={() =>
                      onEditLocation(
                        Number(featureRecordId(entry.feature)),
                        formFromFeature(entry.feature),
                      )
                    }
                  title="Edit location"
                >
                  <SquarePen size={15} />
                </button>
                {isExpanded && <TimelineDetails entry={entry} />}
              </div>
            </article>
          );
        })}

        {visibleRange.end < entries.length && (
          <div ref={bottomSentinelRef} className="timeline-sentinel">
            Loading older timeline entries
          </div>
        )}
      </div>
    </div>
  );
}
