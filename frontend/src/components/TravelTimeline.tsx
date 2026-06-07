import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  BedDouble,
  Bike,
  Bus,
  Car,
  ChevronDown,
  CircleDollarSign,
  Footprints,
  LocateFixed,
  MapPin,
  MessageSquareText,
  Plane,
  Ship,
  SquarePen,
  Train,
  Truck,
  Users,
} from "lucide-react";
import {
  initialTimelineEntryCount,
  timelineEntryBatchSize,
  timelineTargetContextCount,
} from "../constants";
import type {
  FeatureCollection,
  LocationFormState,
  TimelineMapPosition,
  TimelineLegEntry,
  TimelineLocationEntry,
} from "../types";
import {
  colorForTransport,
  coordinateAlongLine,
  coordinatesForFeature,
  formatKm,
  formatMoney,
  formatTimelineDate,
  formFromFeature,
  featureRecordId,
  normalizeLngLat,
  optionLabel,
  parseTravelDate,
  propertyNumber,
  propertyString,
  timelineEntryId,
  transportLabel,
} from "../utils";

type TravelTimelineProps = {
  collapsed: boolean;
  isAdmin: boolean;
  legs: FeatureCollection | null;
  locations: FeatureCollection | null;
  expandEntryId: string | null;
  targetEntryId: string | null;
  targetEntrySignal: number;
  onEditLocation: (id: number, form: LocationFormState) => void;
  onFocusLocation: (coordinates: { lat: number; lng: number }) => void;
  onTimelinePositionChange: (position: TimelineMapPosition | null) => void;
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

type DetailItem = {
  icon: ReactNode;
  label: string;
  value: string | null;
};

function LocationDetails({
  entry,
  onZoomToLocation,
}: {
  entry: TimelineLocationEntry;
  onZoomToLocation: () => void;
}) {
  const properties = entry.feature.properties ?? {};
  const pointType = propertyString(properties, "pointtype") ?? "waypoint";
  const transport = propertyString(properties, "transport");
  const people = propertyString(properties, "people");
  const description = propertyString(properties, "description");
  const metaItems: DetailItem[] = [
    {
      icon: transportIconFor(transport),
      label: "Transport",
      value: transport ? optionLabel(transport) : null,
    },
    {
      icon: <BedDouble size={14} />,
      label: "Sleep",
      value:
        pointType === "sleep"
          ? [
              propertyString(properties, "sleepcategory")
                ? optionLabel(propertyString(properties, "sleepcategory") ?? "")
                : null,
              propertyString(properties, "nonights")
                ? `${propertyString(properties, "nonights")} nights`
                : null,
            ]
              .filter(Boolean)
              .join(", ")
          : null,
    },
    {
      icon: <Ship size={14} />,
      label: "Boat",
      value: propertyString(properties, "boat"),
    },
    {
      icon: <CircleDollarSign size={14} />,
      label: "Costs",
      value: [
        propertyString(properties, "travelcost")
          ? `travel ${formatMoney(propertyString(properties, "travelcost") ?? 0)}`
          : null,
        propertyString(properties, "sleepcost")
          ? `sleep ${formatMoney(propertyString(properties, "sleepcost") ?? 0)}`
          : null,
      ]
        .filter(Boolean)
        .join(", "),
    },
  ].filter((item) => item.value);

  return (
    <div className="timeline-details">
      <div className="timeline-detail-meta">
        {metaItems.map((item) => (
          <span className="timeline-meta-pill" key={item.label}>
            {item.icon}
            <span>{item.value}</span>
          </span>
        ))}
        <button
          type="button"
          className="timeline-zoom-button"
          onClick={onZoomToLocation}
          title="Zoom to location"
          aria-label="Zoom to location"
        >
          <LocateFixed size={15} />
        </button>
      </div>

      {people && (
        <div className="timeline-detail-primary">
          <Users size={15} />
          <span>{people}</span>
        </div>
      )}

      {description && (
        <div className="timeline-detail-note">
          <MessageSquareText size={15} />
          <p>{description}</p>
        </div>
      )}
    </div>
  );
}

function coordinateForTimelineEntry(
  entry: TimelineLegEntry | TimelineLocationEntry,
  routeProgress: number,
) {
  if (entry.kind === "location") {
    const coordinates = coordinatesForFeature(entry.feature);
    return coordinates
      ? normalizeLngLat([coordinates.lng, coordinates.lat])
      : null;
  }

  return coordinateAlongLine(entry.feature.geometry, routeProgress);
}

type TimelineRange = {
  end: number;
  start: number;
};

export function TravelTimeline({
  collapsed,
  isAdmin,
  legs,
  locations,
  expandEntryId,
  targetEntryId,
  targetEntrySignal,
  onEditLocation,
  onFocusLocation,
  onTimelinePositionChange,
}: TravelTimelineProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const entryRefs = useRef(new Map<string, HTMLElement>());
  const lastTimelinePositionRef = useRef<TimelineMapPosition | null>(null);
  const pendingTargetScrollSignalRef = useRef<number | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const [visibleRange, setVisibleRange] = useState<TimelineRange>({
    end: initialTimelineEntryCount,
    start: 0,
  });
  const entries = useMemo(
    () => buildTimelineEntries(locations, legs),
    [locations, legs],
  );
  const visibleEntries = useMemo(
    () => entries.slice(visibleRange.start, visibleRange.end),
    [entries, visibleRange.end, visibleRange.start],
  );

  const reportTimelinePosition = useCallback(() => {
    const list = listRef.current;
    if (!list || entries.length === 0) {
      onTimelinePositionChange(null);
      return;
    }

    const listTop = list.getBoundingClientRect().top;
    let topEntry: {
      progress: number;
      entry: TimelineLegEntry | TimelineLocationEntry;
      top: number;
    } | null = null;

    for (const entry of visibleEntries) {
      const element = entryRefs.current.get(entry.id);
      if (!element) continue;

      const rect = element.getBoundingClientRect();
      if (rect.bottom <= listTop) continue;

      const localProgress =
        rect.height > 0
          ? Math.max(0, Math.min(1, (listTop - rect.top) / rect.height))
          : 0;

      if (!topEntry || rect.top < topEntry.top) {
        topEntry = {
          entry,
          progress: entry.kind === "leg" ? 1 - localProgress : 0,
          top: rect.top,
        };
      }
    }

    const nextPosition = topEntry
      ? {
          coordinates: coordinateForTimelineEntry(
            topEntry.entry,
            topEntry.progress,
          ),
          entryId: topEntry.entry.id,
          kind: topEntry.entry.kind,
          routeProgress: topEntry.progress,
        }
      : null;
    const previousPosition = lastTimelinePositionRef.current;
    const hasChanged =
      previousPosition?.entryId !== nextPosition?.entryId ||
      previousPosition?.kind !== nextPosition?.kind ||
      previousPosition?.coordinates?.[0] !== nextPosition?.coordinates?.[0] ||
      previousPosition?.coordinates?.[1] !== nextPosition?.coordinates?.[1] ||
      Math.abs(
        (previousPosition?.routeProgress ?? -1) -
          (nextPosition?.routeProgress ?? -1),
      ) > 0.01;

    if (hasChanged) {
      lastTimelinePositionRef.current = nextPosition;
      onTimelinePositionChange(nextPosition);
    }
  }, [entries.length, onTimelinePositionChange, visibleEntries]);

  const scheduleTimelinePositionReport = useCallback(() => {
    if (scrollFrameRef.current !== null) return;

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      reportTimelinePosition();
    });
  }, [reportTimelinePosition]);

  useEffect(() => {
    setVisibleRange({ end: initialTimelineEntryCount, start: 0 });
    setExpandedEntryId(null);
  }, [entries.length]);

  const loadMoreNewer = useCallback(() => {
    setVisibleRange((current) => ({
      end: current.end,
      start: Math.max(0, current.start - timelineEntryBatchSize),
    }));
  }, []);

  const loadMoreOlder = useCallback(() => {
    setVisibleRange((current) => ({
      end: Math.min(current.end + timelineEntryBatchSize, entries.length),
      start: current.start,
    }));
  }, [entries.length]);

  const handleTimelineScroll = useCallback(() => {
    const list = listRef.current;
    if (!list) return;

    if (list.scrollTop < 90 && visibleRange.start > 0) {
      loadMoreNewer();
    }

    const remainingScroll =
      list.scrollHeight - list.scrollTop - list.clientHeight;
    if (remainingScroll < 90 && visibleRange.end < entries.length) {
      loadMoreOlder();
    }

    scheduleTimelinePositionReport();
  }, [
    entries.length,
    loadMoreNewer,
    loadMoreOlder,
    scheduleTimelinePositionReport,
    visibleRange.end,
    visibleRange.start,
  ]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    list.addEventListener("scroll", handleTimelineScroll, { passive: true });
    return () => list.removeEventListener("scroll", handleTimelineScroll);
  }, [handleTimelineScroll]);

  useLayoutEffect(() => {
    reportTimelinePosition();
  }, [reportTimelinePosition]);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!targetEntryId) return;
    const targetIndex = entries.findIndex((entry) => entry.id === targetEntryId);
    if (targetIndex === -1) return;

    setExpandedEntryId(expandEntryId ?? targetEntryId);
    pendingTargetScrollSignalRef.current = targetEntrySignal;
    setVisibleRange({
      end: Math.min(entries.length, targetIndex + timelineTargetContextCount + 1),
      start: Math.max(0, targetIndex - timelineTargetContextCount),
    });
  }, [entries, expandEntryId, targetEntryId, targetEntrySignal]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !targetEntryId) return;
    if (pendingTargetScrollSignalRef.current !== targetEntrySignal) return;

    const target = entryRefs.current.get(targetEntryId);
    if (!target) return;

    const listRect = list.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    list.scrollTop += targetRect.top - listRect.top;
    pendingTargetScrollSignalRef.current = null;
    reportTimelinePosition();
  }, [reportTimelinePosition, targetEntryId, targetEntrySignal, visibleRange]);

  return (
    <div className={`timeline-panel ${collapsed ? "collapsed" : ""}`}>

      <div
        ref={listRef}
        className="timeline-list"
        aria-label="Chronological locations and legs"
        onScroll={handleTimelineScroll}
      >
        {entries.length === 0 && (
          <div className="timeline-empty">No locations or legs yet.</div>
        )}

        {visibleRange.start > 0 && (
          <div className="timeline-sentinel">
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

            return (
              <article
                ref={setEntryRef}
                className={`timeline-entry leg compact ${
                  isTargeted ? "targeted" : ""
                }`}
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
                {!collapsed && (
                  <div className="timeline-content">
                    <div
                      className="timeline-leg-summary"
                      title={transportLabel(transport)}
                    >
                      <span
                        className="timeline-icon leg-icon"
                        style={{ color }}
                        aria-hidden="true"
                      >
                        {transportIconFor(transport)}
                      </span>
                      <strong>{formatKm(distanceKm)} km</strong>
                    </div>
                  </div>
                )}
              </article>
            );
          }

          const pointType = propertyString(properties, "pointtype");
          const isSleep = pointType === "sleep";
          const transport = propertyString(properties, "transport");
          const name = propertyString(properties, "name") ?? "Unnamed location";
          const coordinates = coordinatesForFeature(entry.feature);

          const toggleLocation = () => {
            setExpandedEntryId(isExpanded ? null : entry.id);
            window.requestAnimationFrame(() => {
              entryRefs.current.get(entry.id)?.scrollIntoView({
                block: "start",
                behavior: "smooth",
              });
            });
          };

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
              {!collapsed && (
                <div className="timeline-content">
                  <button
                    type="button"
                    className="timeline-trigger"
                    aria-expanded={isExpanded}
                    onClick={toggleLocation}
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
                  {isAdmin && (
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
                  )}
                  {isExpanded && (
                    <LocationDetails
                      entry={entry}
                      onZoomToLocation={() => {
                        if (coordinates) onFocusLocation(coordinates);
                      }}
                    />
                  )}
                </div>
              )}
            </article>
          );
        })}

        {visibleRange.end < entries.length && (
          <div className="timeline-sentinel">
            Loading older timeline entries
          </div>
        )}
      </div>
    </div>
  );
}
