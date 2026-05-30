import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import "./App.css";
import { API_BASE_URL, paidSleepCategories, transportDisplayOrder } from "./constants";
import { FloatingPanel } from "./components/FloatingPanel";
import { GeneralStatsPanel } from "./components/GeneralStatsPanel";
import { LocationDialog } from "./components/LocationDialog";
import { TransportDistancePanel } from "./components/TransportDistancePanel";
import { TravelMap } from "./components/TravelMap";
import { TravelTimeline } from "./components/TravelTimeline";
import type {
  FeatureCollection,
  GeneralStats,
  LocationFormState,
  SelectedChartPart,
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
  general: boolean;
  timeline: boolean;
  transport: boolean;
};

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
    totalDays,
    transportCostTotal,
    travelDayCount: locationDateKeys.size,
  };
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
  const [isLoading, setIsLoading] = useState(true);
  const [isPlacingLocation, setIsPlacingLocation] = useState(false);
  const [panels, setPanels] = useState<PanelState>({
    general: true,
    timeline: true,
    transport: true,
  });
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
    () => calculateGeneralStats(locations, freeTransportRides),
    [freeTransportRides, locations],
  );

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

  function togglePanel(panel: keyof PanelState) {
    setPanels((current) => ({ ...current, [panel]: !current[panel] }));
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
        selectedTransport={selectedTransport}
        onCancelPlacingLocation={() => setIsPlacingLocation(false)}
        onEditLocation={(id, form) => {
          setEditingLocationId(id);
          setLocationForm(form);
        }}
        onMapError={setError}
        onNewLocationForm={(form) => {
          setEditingLocationId(null);
          setLocationForm(form);
          setIsPlacingLocation(false);
        }}
        onStartPlacingLocation={() => {
          setLocationForm(null);
          setEditingLocationId(null);
          setIsPlacingLocation(true);
        }}
      />

      <div className="floating-panels">
        <div className="floating-column floating-column-left">
          <FloatingPanel
            className="transport-floating-panel"
            isOpen={panels.transport}
            onToggle={() => togglePanel("transport")}
            title="Transport distance"
          >
            <TransportDistancePanel
              orderedStats={orderedStats}
              selectedChartPart={selectedChartPart}
              selectedTransport={selectedTransport}
              onSelectChartPart={setSelectedChartPart}
              onSelectTransport={setSelectedTransport}
            />
          </FloatingPanel>
        </div>

        <div className="floating-column floating-column-right">
          <FloatingPanel
            className="general-floating-panel"
            isOpen={panels.general}
            onToggle={() => togglePanel("general")}
            title="General statistics"
          >
            <GeneralStatsPanel
              freeTransportRides={freeTransportRides}
              generalStats={generalStats}
              statsCount={stats.length}
              totalKm={totalKm}
            />
          </FloatingPanel>

          <FloatingPanel
            className="timeline-floating-panel"
            isOpen={panels.timeline}
            onToggle={() => togglePanel("timeline")}
            title="Journey timeline"
          >
            <TravelTimeline locations={locations} legs={legs} />
          </FloatingPanel>
        </div>
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
