import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ChartPie,
  Clock3,
  LocateFixed,
  MapPinPlus,
  Moon,
  ListChecks,
  Satellite,
} from "lucide-react";
import "./App.css";
import {
  API_BASE_URL,
  paidSleepCategories,
  transportDisplayOrder,
  type MapBasemap,
} from "./constants";
import { GeneralStatsPanel } from "./components/GeneralStatsPanel";
import { LocationDialog } from "./components/LocationDialog";
import { SleepCategoryPanel } from "./components/SleepCategoryPanel";
import { TransportDistancePanel } from "./components/TransportDistancePanel";
import { TravelMap } from "./components/TravelMap";
import { TravelTimeline } from "./components/TravelTimeline";
import type {
  FeatureCollection,
  GeneralStats,
  LocationFormState,
  SelectedChartPart,
  SleepStat,
  TransportStat,
} from "./types";
import {
  formToPayload,
  formatLocalDate,
  isDisplayedFreeRide,
  isFreeTransport,
  normalizeFeatureCollection,
  numberFromKm,
  numberFromValue,
  parseTravelDate,
} from "./utils";

type PanelState = {
  timeline: boolean;
};

type AnalysisPanel = "general" | "sleep" | "transport";

async function fetchTravelData() {
  const [locationsResponse, legsResponse, statsResponse] = await Promise.all([
    fetch(`${API_BASE_URL}/locations`),
    fetch(`${API_BASE_URL}/legs?simplify=0.01`),
    fetch(`${API_BASE_URL}/stats/transport-distance`),
  ]);

  if (!locationsResponse.ok || !legsResponse.ok || !statsResponse.ok) {
    throw new Error("One of the API requests failed.");
  }

  const [locationsJson, legsJson, statsJson] = await Promise.all([
    locationsResponse.json(),
    legsResponse.json(),
    statsResponse.json(),
  ]);

  return {
    locations: normalizeFeatureCollection(locationsJson),
    legs: normalizeFeatureCollection(legsJson),
    stats: statsJson as TransportStat[],
  };
}

function calculateGeneralStats(
  locations: FeatureCollection | null,
  freeTransportRides: number,
  totalKm: number,
): GeneralStats {
  const locationDateKeys = new Set<string>();
  let earliestDate: Date | null = null;
  let latestDate: Date | null = null;
  let sleepCostTotal = 0;
  let transportCostTotal = 0;

  locations?.features.forEach((feature) => {
    const properties = feature.properties ?? {};
    const travelDate = parseTravelDate(properties.travel_date);

    if (travelDate) {
      locationDateKeys.add(formatLocalDate(travelDate));
      earliestDate =
        !earliestDate || travelDate.getTime() < earliestDate.getTime()
          ? travelDate
          : earliestDate;
      latestDate =
        !latestDate || travelDate.getTime() > latestDate.getTime()
          ? travelDate
          : latestDate;
    }

    sleepCostTotal += numberFromValue(properties.sleepcost);
    transportCostTotal += numberFromValue(properties.travelcost);
  });

  const totalDays =
    earliestDate && latestDate
      ? Math.round(
          (new Date(formatLocalDate(latestDate)).getTime() -
            new Date(formatLocalDate(earliestDate)).getTime()) /
            (24 * 60 * 60 * 1000),
        )
      : 0;

  return {
    rideCount: freeTransportRides,
    sleepCostTotal,
    totalDistanceKm: totalKm,
    totalDays,
    transportCostTotal,
    travelDayCount: locationDateKeys.size,
  };
}

function calculateSleepStats(locations: FeatureCollection | null): SleepStat[] {
  const statsByCategory = new Map<string, number>();

  locations?.features.forEach((feature) => {
    const properties = feature.properties ?? {};
    if (properties.pointtype !== "sleep") return;

    const sleepCategory =
      properties.sleepcategory === null ||
      properties.sleepcategory === undefined ||
      properties.sleepcategory === ""
        ? "unknown"
        : String(properties.sleepcategory);
    const nights = numberFromValue(properties.nonights);

    statsByCategory.set(
      sleepCategory,
      (statsByCategory.get(sleepCategory) ?? 0) + (nights > 0 ? nights : 1),
    );
  });

  return Array.from(statsByCategory.entries()).map(
    ([sleepcategory, night_count]) => ({
      sleepcategory,
      night_count,
    }),
  );
}

function App() {
  const [locations, setLocations] = useState<FeatureCollection | null>(null);
  const [legs, setLegs] = useState<FeatureCollection | null>(null);
  const [stats, setStats] = useState<TransportStat[]>([]);
  const [selectedTransport, setSelectedTransport] = useState<string | null>(
    null,
  );
  const [selectedChartPart, setSelectedChartPart] =
    useState<SelectedChartPart | null>(null);
  const [selectedSleepCategory, setSelectedSleepCategory] = useState<
    string | null
  >(null);
  const [selectedSleepChartPart, setSelectedSleepChartPart] =
    useState<SelectedChartPart | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlacingLocation, setIsPlacingLocation] = useState(false);
  const [panels, setPanels] = useState<PanelState>({
    timeline:
      typeof window === "undefined"
        ? true
        : !window.matchMedia("(max-width: 900px)").matches,
  });
  const [activeAnalysisPanel, setActiveAnalysisPanel] =
    useState<AnalysisPanel | null>(() =>
      typeof window === "undefined" ||
      !window.matchMedia("(max-width: 900px)").matches
        ? "general"
        : null,
    );
  const [timelineTargetEntryId, setTimelineTargetEntryId] = useState<
    string | null
  >(null);
  const [timelineExpandEntryId, setTimelineExpandEntryId] = useState<
    string | null
  >(null);
  const [timelineTargetSignal, setTimelineTargetSignal] = useState(0);
  const [fitMapSignal, setFitMapSignal] = useState(0);
  const [basemap, setBasemap] = useState<MapBasemap>("standard");
  const [focusedLocation, setFocusedLocation] = useState<{
    lat: number;
    lng: number;
    signal: number;
  } | null>(null);
  const [locationForm, setLocationForm] = useState<LocationFormState | null>(
    null,
  );
  const [editingLocationId, setEditingLocationId] = useState<number | null>(
    null,
  );
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTravelData = useCallback(async () => {
    const travelData = await fetchTravelData();
    setLocations(travelData.locations);
    setLegs(travelData.legs);
    setStats(travelData.stats);
    return travelData;
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setIsLoading(true);
      setError(null);

      try {
        const travelData = await fetchTravelData();
        if (!isMounted) return;
        setLocations(travelData.locations);
        setLegs(travelData.legs);
        setStats(travelData.stats);
      } catch (caught) {
        if (!isMounted) return;
        setError(caught instanceof Error ? caught.message : "Could not load data.");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const query = window.matchMedia("(max-width: 900px)");
    const applyLayoutDefaults = (isMobile: boolean) => {
      setPanels({ timeline: !isMobile });
      setActiveAnalysisPanel((current) => {
        if (isMobile) return null;
        return current ?? "general";
      });
    };

    applyLayoutDefaults(query.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      applyLayoutDefaults(event.matches);
    };

    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  const totalKm = useMemo(
    () =>
      stats.reduce((sum, item) => {
        return sum + numberFromKm(item.distance_km);
      }, 0),
    [stats],
  );

  const freeTransportRides = useMemo(
    () =>
      stats.reduce((sum, item) => {
        return isDisplayedFreeRide(item.transport) ? sum + item.leg_count : sum;
      }, 0),
    [stats],
  );

  const generalStats = useMemo(
    () => calculateGeneralStats(locations, freeTransportRides, totalKm),
    [freeTransportRides, locations, totalKm],
  );

  const sleepStats = useMemo(() => calculateSleepStats(locations), [locations]);

  const orderedStats = useMemo(
    () =>
      [...stats].sort((a, b) => {
        const aIndex = transportDisplayOrder.indexOf(a.transport ?? "");
        const bIndex = transportDisplayOrder.indexOf(b.transport ?? "");

        return (
          (aIndex === -1 ? transportDisplayOrder.length : aIndex) -
          (bIndex === -1 ? transportDisplayOrder.length : bIndex)
        );
      }),
    [stats],
  );
  const selectedTransportCostGroup =
    selectedChartPart?.id === "cost:free"
      ? "free"
      : selectedChartPart?.id === "cost:paid"
        ? "paid"
        : null;
  const selectedSleepCostGroup =
    selectedSleepChartPart?.id === "sleep-cost:free"
      ? "free"
      : selectedSleepChartPart?.id === "sleep-cost:paid"
        ? "paid"
        : null;

  function isMobileLayout() {
    return (
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 900px)").matches
    );
  }

  function selectAnalysisPanel(panel: AnalysisPanel) {
    setActiveAnalysisPanel((current) => (current === panel ? null : panel));
    if (isMobileLayout()) {
      setPanels((current) => ({ ...current, timeline: false }));
    }
  }

  function closeLocationDialog() {
    setLocationForm(null);
    setEditingLocationId(null);
    setIsPlacingLocation(false);
  }

  function updateLocationForm(update: Partial<LocationFormState>) {
    setLocationForm((current) => (current ? { ...current, ...update } : current));
  }

  async function saveLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!locationForm) return;

    setIsSavingLocation(true);
    setError(null);

    try {
      const isPaidTransport = !isFreeTransport(locationForm.transport);
      const isPaidSleep =
        locationForm.pointtype === "sleep" &&
        paidSleepCategories.has(locationForm.sleepcategory);
      const response = await fetch(
        editingLocationId
          ? `${API_BASE_URL}/locations/${editingLocationId}`
          : `${API_BASE_URL}/locations`,
        {
          method: editingLocationId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...formToPayload(locationForm),
            travelcost:
              isPaidTransport && locationForm.travelcost
                ? Number(locationForm.travelcost)
                : null,
            sleepcost:
              isPaidSleep && locationForm.sleepcost
                ? Number(locationForm.sleepcost)
                : null,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Saving the location failed.");
      }

      await loadTravelData();
      closeLocationDialog();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Saving failed.");
    } finally {
      setIsSavingLocation(false);
    }
  }

  async function deleteLocation() {
    if (!editingLocationId) return;
    const shouldDelete = window.confirm("Delete this location?");
    if (!shouldDelete) return;

    setIsSavingLocation(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/locations/${editingLocationId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Deleting the location failed.");
      }

      await loadTravelData();
      closeLocationDialog();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Deleting failed.");
    } finally {
      setIsSavingLocation(false);
    }
  }

  return (
    <main className="app-shell">
      <TravelMap
        error={error}
        isLoading={isLoading}
        isPlacingLocation={isPlacingLocation}
        legs={legs}
        locationForm={locationForm}
        locations={locations}
        focusedLocation={focusedLocation}
        fitMapSignal={fitMapSignal}
        selectedTransport={selectedTransport}
        selectedTransportCostGroup={selectedTransportCostGroup}
        selectedSleepCategory={selectedSleepCategory}
        selectedSleepCostGroup={selectedSleepCostGroup}
        basemap={basemap}
        onCancelPlacingLocation={() => setIsPlacingLocation(false)}
        onMapError={setError}
        onNewLocationForm={(form) => {
          setEditingLocationId(null);
          setLocationForm(form);
          setIsPlacingLocation(false);
        }}
        onSelectTimelineEntry={(id, expandEntryId) => {
          setPanels((current) => ({ ...current, timeline: true }));
          if (isMobileLayout()) setActiveAnalysisPanel(null);
          setTimelineTargetEntryId(id);
          setTimelineExpandEntryId(expandEntryId ?? id);
          setTimelineTargetSignal((current) => current + 1);
        }}
      />

      <div className="map-button-row" aria-label="Map controls">
        <button
          type="button"
          className="map-action-button"
          onClick={() => {
            setLocationForm(null);
            setEditingLocationId(null);
            setIsPlacingLocation(true);
          }}
          title="Add new point"
        >
          <MapPinPlus size={18} />
        </button>
        <button
          type="button"
          className={
            basemap === "imagery"
              ? "map-action-button active"
              : "map-action-button"
          }
          onClick={() =>
            setBasemap((current) =>
              current === "standard" ? "imagery" : "standard",
            )
          }
          title={
            basemap === "standard"
              ? "Switch to imagery basemap"
              : "Switch to standard basemap"
          }
          aria-pressed={basemap === "imagery"}
          aria-label={
            basemap === "standard"
              ? "Switch to imagery basemap"
              : "Switch to standard basemap"
          }
        >
          <Satellite size={18} />
        </button>
        <button
          type="button"
          className="map-action-button"
          onClick={() => setFitMapSignal((current) => current + 1)}
          title="Fit routes"
        >
          <LocateFixed size={18} />
        </button>
      </div>

      <div className="floating-panels">
        <section className="analysis-shell" aria-label="Analysis panels">
          <nav className="analysis-action-bar" aria-label="Analysis actions">
            <button
              type="button"
              className={activeAnalysisPanel === "general" ? "active" : ""}
              onClick={() => selectAnalysisPanel("general")}
              title="General statistics"
            >
              <ListChecks size={18} />
              <span>Info</span>
            </button>
            <button
              type="button"
              className={activeAnalysisPanel === "transport" ? "active" : ""}
              onClick={() => selectAnalysisPanel("transport")}
              title="Transport distance"
            >
              <ChartPie size={18} />
              <span>Transport</span>
            </button>
            <button
              type="button"
              className={activeAnalysisPanel === "sleep" ? "active" : ""}
              onClick={() => selectAnalysisPanel("sleep")}
              title="Sleep categories"
            >
              <Moon size={18} />
              <span>Sleep</span>
            </button>
            <button
              type="button"
              className={panels.timeline ? "active mobile-only" : "mobile-only"}
              onClick={() =>
                setPanels((current) => {
                  const nextTimeline = !current.timeline;
                  if (nextTimeline) setActiveAnalysisPanel(null);
                  return {
                    ...current,
                    timeline: nextTimeline,
                  };
                })
              }
              title="Journey timeline"
            >
              <Clock3 size={18} />
              <span>Timeline</span>
            </button>
          </nav>

          {activeAnalysisPanel && (
            <div className="analysis-panel">
              {activeAnalysisPanel === "general" && (
                <>
                  <div className="panel-heading">
                    <div>
                      <h2>General statistics</h2>
                    </div>
                  </div>
                  <GeneralStatsPanel generalStats={generalStats} />
                </>
              )}

              {activeAnalysisPanel === "transport" && (
                <TransportDistancePanel
                  orderedStats={orderedStats}
                  selectedChartPart={selectedChartPart}
                  selectedTransport={selectedTransport}
                  onSelectChartPart={setSelectedChartPart}
                  onSelectTransport={setSelectedTransport}
                />
              )}

              {activeAnalysisPanel === "sleep" && (
                <SleepCategoryPanel
                  selectedChartPart={selectedSleepChartPart}
                  selectedSleepCategory={selectedSleepCategory}
                  stats={sleepStats}
                  onSelectChartPart={setSelectedSleepChartPart}
                  onSelectSleepCategory={setSelectedSleepCategory}
                />
              )}
            </div>
          )}
        </section>

        {panels.timeline && (
          <section className="timeline-shell">
            <div className="panel-heading">
              <div>
                <h2>Journey timeline</h2>
              </div>
            </div>
            <TravelTimeline
              locations={locations}
              legs={legs}
              expandEntryId={timelineExpandEntryId}
              targetEntryId={timelineTargetEntryId}
              targetEntrySignal={timelineTargetSignal}
              onFocusLocation={(coordinates) =>
                setFocusedLocation((current) => ({
                  ...coordinates,
                  signal: (current?.signal ?? 0) + 1,
                }))
              }
              onEditLocation={(id, form) => {
                setEditingLocationId(id);
                setLocationForm(form);
              }}
            />
          </section>
        )}
      </div>

      {locationForm && (
        <LocationDialog
          editingLocationId={editingLocationId}
          isSavingLocation={isSavingLocation}
          locationForm={locationForm}
          locations={locations}
          onClose={closeLocationDialog}
          onDelete={deleteLocation}
          onSubmit={saveLocation}
          onUpdate={updateLocationForm}
        />
      )}
    </main>
  );
}

export default App;
