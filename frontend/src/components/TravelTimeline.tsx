import { useMemo, useState, type CSSProperties } from "react";
import { BedDouble, ChevronDown, MapPin, Navigation } from "lucide-react";
import {
  initialTimelineEntryCount,
  timelineEntryBatchSize,
} from "../constants";
import type {
  FeatureCollection,
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
  optionLabel,
  parseTravelDate,
  propertyNumber,
  propertyString,
  transportLabel,
} from "../utils";

type TravelTimelineProps = {
  legs: FeatureCollection | null;
  locations: FeatureCollection | null;
};

function buildTimelineEntries(
  locations: FeatureCollection | null,
  legs: FeatureCollection | null,
) {
  const locationEntries: TimelineLocationEntry[] =
    locations?.features.map((feature, index) => ({
      date: parseTravelDate(feature.properties?.travel_date),
      feature,
      id: `location:${feature.id ?? index}`,
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
        id: `leg:${feature.id ?? index}`,
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

export function TravelTimeline({ legs, locations }: TravelTimelineProps) {
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const [visibleEntryCount, setVisibleEntryCount] = useState(
    initialTimelineEntryCount,
  );
  const entries = useMemo(
    () => buildTimelineEntries(locations, legs),
    [locations, legs],
  );
  const visibleEntries = entries.slice(0, visibleEntryCount);
  const remainingEntryCount = Math.max(entries.length - visibleEntryCount, 0);

  return (
    <div className="timeline-panel">
      <div className="panel-heading">
        <div>
          <h2>Journey timeline</h2>
          <p>Newest locations first, with every leg in between.</p>
        </div>
      </div>

      <div className="timeline-list" aria-label="Chronological locations and legs">
        {entries.length === 0 && (
          <div className="timeline-empty">No locations or legs yet.</div>
        )}

        {visibleEntries.map((entry) => {
          const properties = entry.feature.properties ?? {};
          const isExpanded = expandedEntryId === entry.id;

          if (entry.kind === "leg") {
            const transport = propertyString(properties, "transport");
            const color = colorForTransport(transport);
            const distanceKm = propertyNumber(properties, "distance_m") / 1000;
            const fromName = propertyString(properties, "from_name") ?? "Unknown";
            const toName = propertyString(properties, "to_name") ?? "Unknown";

            return (
              <article className="timeline-entry leg" key={entry.id}>
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
                        {formatTimelineDate(entry.date)} ·{" "}
                        {transportLabel(transport)} · {formatKm(distanceKm)} km
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
            <article className="timeline-entry location" key={entry.id}>
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
                      {formatTimelineDate(entry.date)} ·{" "}
                      {isSleep ? "sleep" : "waypoint"}
                    </span>
                  </span>
                  <ChevronDown size={16} />
                </button>
                {isExpanded && <TimelineDetails entry={entry} />}
              </div>
            </article>
          );
        })}

        {remainingEntryCount > 0 && (
          <button
            type="button"
            className="timeline-load-more"
            onClick={() =>
              setVisibleEntryCount((current) =>
                Math.min(current + timelineEntryBatchSize, entries.length),
              )
            }
          >
            Load {Math.min(timelineEntryBatchSize, remainingEntryCount)} more
          </button>
        )}
      </div>
    </div>
  );
}
