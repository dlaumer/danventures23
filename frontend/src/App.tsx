import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent,
} from "react";
import {
  ChartPie,
  Clock3,
  Globe2,
  PanelLeftClose,
  PanelLeftOpen,
  MapPinPlus,
  Moon,
  ListChecks,
  Satellite,
  SlidersHorizontal,
  UsersRound,
  X,
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
import { PeopleExplorerPanel } from "./components/PeopleExplorerPanel";
import { SleepCategoryPanel } from "./components/SleepCategoryPanel";
import { TransportDistancePanel } from "./components/TransportDistancePanel";
import { TimeRangeSlider } from "./components/TimeRangeSlider";
import { TravelMap } from "./components/TravelMap";
import { TravelTimeline } from "./components/TravelTimeline";
import type {
  FeatureCollection,
  EditableLeg,
  GeneralStats,
  LocationFormState,
  SelectedChartPart,
  SleepStat,
  TransportStat,
  TimelineMapPosition,
  TravelTimeRange,
  MonthlyTransportDistanceBucket,
  PeopleStory,
} from "./types";
import {
  coordinatesForFeature,
  featureRecordId,
  formToPayload,
  formatLocalDate,
  isDisplayedFreeRide,
  isFreeTransport,
  normalizeFeatureCollection,
  numberFromKm,
  numberFromValue,
  propertyBoolean,
  parseTravelDate,
  propertyString,
  timelineEntryId,
} from "./utils";

type PanelState = {
  timeRange: boolean;
  timeline: boolean;
};

type AnalysisPanel = "general" | "people" | "sleep" | "transport";

async function fetchTravelData() {
  const [
    locationsResponse,
    legsResponse,
    statsResponse,
    monthlyTransportResponse,
  ] = await Promise.all([
    fetch(`${API_BASE_URL}/locations`),
    fetch(`${API_BASE_URL}/legs?simplify=0.01`),
    fetch(`${API_BASE_URL}/stats/transport-distance`),
    fetch(`${API_BASE_URL}/stats/monthly-transport-distance`),
  ]);

  if (
    !locationsResponse.ok ||
    !legsResponse.ok ||
    !statsResponse.ok ||
    !monthlyTransportResponse.ok
  ) {
    throw new Error("One of the API requests failed.");
  }

  const [locationsJson, legsJson, statsJson, monthlyTransportJson] =
    await Promise.all([
      locationsResponse.json(),
      legsResponse.json(),
      statsResponse.json(),
      monthlyTransportResponse.json(),
    ]);

  return {
    locations: normalizeFeatureCollection(locationsJson),
    legs: normalizeFeatureCollection(legsJson),
    stats: statsJson as TransportStat[],
    monthlyTransportStats:
      monthlyTransportJson as MonthlyTransportDistanceBucket[],
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

function calculateTransportStats(legs: FeatureCollection | null): TransportStat[] {
  const statsByTransport = new Map<
    string,
    {
      distance_m: number;
      leg_count: number;
      transport: string | null;
    }
  >();

  legs?.features.forEach((feature) => {
    const properties = feature.properties ?? {};
    const transport =
      properties.transport === null || properties.transport === undefined
        ? null
        : String(properties.transport);
    const key = transport ?? "unknown";
    const current = statsByTransport.get(key) ?? {
      distance_m: 0,
      leg_count: 0,
      transport,
    };

    current.distance_m += numberFromValue(properties.distance_m);
    current.leg_count += 1;
    statsByTransport.set(key, current);
  });

  return Array.from(statsByTransport.values()).map((item) => ({
    ...item,
    distance_km: Number((item.distance_m / 1000).toFixed(2)),
  }));
}

function randomOrderForStory(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 4294967295;
}

function App() {
  const [locations, setLocations] = useState<FeatureCollection | null>(null);
  const [legs, setLegs] = useState<FeatureCollection | null>(null);
  const [stats, setStats] = useState<TransportStat[]>([]);
  const [monthlyTransportStats, setMonthlyTransportStats] = useState<
    MonthlyTransportDistanceBucket[]
  >([]);
  const [selectedTransport, setSelectedTransport] = useState<string | null>(
    null,
  );
  const [selectedChartPart, setSelectedChartPart] =
    useState<SelectedChartPart | null>(null);
  const [isTransportLayerVisible, setIsTransportLayerVisible] = useState(true);
  const [selectedSleepCategory, setSelectedSleepCategory] = useState<
    string | null
  >(null);
  const [selectedSleepChartPart, setSelectedSleepChartPart] =
    useState<SelectedChartPart | null>(null);
  const [isSleepLayerVisible, setIsSleepLayerVisible] = useState(true);
  const [peopleExplorerQuery, setPeopleExplorerQuery] = useState("");
  const [peopleExplorerSelectedIndex, setPeopleExplorerSelectedIndex] =
    useState(-1);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlacingLocation, setIsPlacingLocation] = useState(false);
  const [panels, setPanels] = useState<PanelState>({
    timeRange:
      typeof window === "undefined"
        ? true
        : !window.matchMedia("(max-width: 900px)").matches,
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
  const [timelineMapPosition, setTimelineMapPosition] =
    useState<TimelineMapPosition | null>(null);
  const [isTimelineCollapsed, setIsTimelineCollapsed] = useState(false);
  const [initialViewSignal, setInitialViewSignal] = useState(0);
  const [basemap, setBasemap] = useState<MapBasemap>("standard");
  const [selectedTimeRange, setSelectedTimeRange] =
    useState<TravelTimeRange | null>(null);
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
  const [editableLeg, setEditableLeg] = useState<EditableLeg | null>(null);
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [isSavingLegGeometry, setIsSavingLegGeometry] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAdmin =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("admin") === "true";
  const panelSwipeRef = useRef<{
    hasClosed: boolean;
    startX: number;
    startY: number;
    startedAtTop: boolean;
  } | null>(null);

  const loadTravelData = useCallback(async () => {
    const travelData = await fetchTravelData();
    setLocations(travelData.locations);
    setLegs(travelData.legs);
    setStats(travelData.stats);
    setMonthlyTransportStats(travelData.monthlyTransportStats);
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
        setMonthlyTransportStats(travelData.monthlyTransportStats);
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

    const applyViewportHeight = () => {
      const height = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--app-height", `${height}px`);
    };

    applyViewportHeight();
    window.visualViewport?.addEventListener("resize", applyViewportHeight);
    window.visualViewport?.addEventListener("scroll", applyViewportHeight);
    window.addEventListener("resize", applyViewportHeight);
    window.addEventListener("orientationchange", applyViewportHeight);

    return () => {
      window.visualViewport?.removeEventListener("resize", applyViewportHeight);
      window.visualViewport?.removeEventListener("scroll", applyViewportHeight);
      window.removeEventListener("resize", applyViewportHeight);
      window.removeEventListener("orientationchange", applyViewportHeight);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const query = window.matchMedia("(max-width: 900px)");
    const applyLayoutDefaults = (isMobile: boolean) => {
      setPanels({ timeline: !isMobile, timeRange: !isMobile });
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

  const filteredLegs = useMemo(() => {
    if (!legs || !selectedTimeRange) return legs;

    return {
      ...legs,
      features: legs.features.filter((feature) => {
        const travelDate = parseTravelDate(feature.properties?.travel_date);
        if (!travelDate) return false;

        const time = travelDate.getTime();
        return (
          time >= selectedTimeRange.startMs && time <= selectedTimeRange.endMs
        );
      }),
    };
  }, [legs, selectedTimeRange]);
  const filteredLocations = useMemo(() => {
    if (!locations || !selectedTimeRange) return locations;

    return {
      ...locations,
      features: locations.features.filter((feature) => {
        const travelDate = parseTravelDate(feature.properties?.travel_date);
        if (!travelDate) return false;

        const time = travelDate.getTime();
        return (
          time >= selectedTimeRange.startMs && time <= selectedTimeRange.endMs
        );
      }),
    };
  }, [locations, selectedTimeRange]);
  const activeTransportStats = useMemo(
    () => (filteredLegs ? calculateTransportStats(filteredLegs) : stats),
    [filteredLegs, stats],
  );

  const totalKm = useMemo(
    () =>
      activeTransportStats.reduce((sum, item) => {
        return sum + numberFromKm(item.distance_km);
      }, 0),
    [activeTransportStats],
  );

  const freeTransportRides = useMemo(
    () =>
      activeTransportStats.reduce((sum, item) => {
        return isDisplayedFreeRide(item.transport) ? sum + item.leg_count : sum;
      }, 0),
    [activeTransportStats],
  );

  const generalStats = useMemo(
    () => calculateGeneralStats(filteredLocations, freeTransportRides, totalKm),
    [filteredLocations, freeTransportRides, totalKm],
  );

  const sleepStats = useMemo(
    () => calculateSleepStats(filteredLocations),
    [filteredLocations],
  );

  const peopleStories = useMemo<PeopleStory[]>(() => {
    if (!filteredLocations) return [];

    return filteredLocations.features
      .map((feature, index) => {
        const properties = feature.properties ?? {};
        const transport = propertyString(properties, "transport");
        const people = propertyString(properties, "people");
        const description = propertyString(properties, "description") ?? "";

        if (!people || !isFreeTransport(transport) || transport === "foot") {
          return null;
        }

        const recordId = featureRecordId(feature) ?? String(index);

        return {
          coordinates: coordinatesForFeature(feature),
          date: parseTravelDate(properties.travel_date),
          description,
          favorite: propertyBoolean(properties, "favorite"),
          id: `people:${recordId}`,
          locationId: Number.isFinite(Number(recordId)) ? Number(recordId) : null,
          locationName: propertyString(properties, "name") ?? "Unknown place",
          people,
          randomOrder: randomOrderForStory(
            `${recordId}:${people}:${description}:${properties.travel_date ?? ""}`,
          ),
          timelineEntryId: timelineEntryId("location", feature, index),
          transport,
        };
      })
      .filter((story): story is PeopleStory => Boolean(story))
      .sort((a, b) => {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;

        const aHasDescription = a.description.trim().length > 0 ? 0 : 1;
        const bHasDescription = b.description.trim().length > 0 ? 0 : 1;
        if (aHasDescription !== bHasDescription) {
          return aHasDescription - bHasDescription;
        }

        return a.randomOrder - b.randomOrder;
      });
  }, [filteredLocations]);

  const orderedStats = useMemo(
    () =>
      [...activeTransportStats].sort((a, b) => {
        const aIndex = transportDisplayOrder.indexOf(a.transport ?? "");
        const bIndex = transportDisplayOrder.indexOf(b.transport ?? "");

        return (
          (aIndex === -1 ? transportDisplayOrder.length : aIndex) -
          (bIndex === -1 ? transportDisplayOrder.length : bIndex)
        );
      }),
    [activeTransportStats],
  );

  useEffect(() => {
    setSelectedTransport((current) => {
      if (
        current &&
        !activeTransportStats.some((item) => item.transport === current)
      ) {
        return null;
      }

      return current;
    });
    setSelectedChartPart((current) => {
      if (!current) return current;

      if (current.id === "cost:free" || current.id === "cost:paid") {
        const group = current.id === "cost:free" ? "free" : "paid";
        const value = activeTransportStats
          .filter((item) =>
            group === "free"
              ? isFreeTransport(item.transport)
              : !isFreeTransport(item.transport),
          )
          .reduce((sum, item) => sum + numberFromKm(item.distance_km), 0);

        return value > 0 ? { ...current, value } : null;
      }

      if (current.id.startsWith("transport:")) {
        const transport = current.id.replace("transport:", "");
        const matchingStat = activeTransportStats.find(
          (item) => (item.transport ?? "unknown") === transport,
        );
        const value = matchingStat ? numberFromKm(matchingStat.distance_km) : 0;

        return value > 0 ? { ...current, value } : null;
      }

      return current;
    });
  }, [activeTransportStats]);

  useEffect(() => {
    setSelectedSleepCategory((current) => {
      if (
        current &&
        !sleepStats.some((item) => item.sleepcategory === current)
      ) {
        return null;
      }

      return current;
    });
    setSelectedSleepChartPart((current) => {
      if (!current) return current;

      if (current.id === "sleep-cost:free" || current.id === "sleep-cost:paid") {
        const group = current.id === "sleep-cost:free" ? "free" : "paid";
        const value = sleepStats
          .filter((item) =>
            group === "paid"
              ? paidSleepCategories.has(item.sleepcategory ?? "")
              : !paidSleepCategories.has(item.sleepcategory ?? ""),
          )
          .reduce((sum, item) => sum + item.night_count, 0);

        return value > 0 ? { ...current, value } : null;
      }

      if (current.id.startsWith("sleep:")) {
        const sleepCategory = current.id.replace("sleep:", "");
        const matchingStat = sleepStats.find(
          (item) => (item.sleepcategory ?? "unknown") === sleepCategory,
        );
        const value = matchingStat?.night_count ?? 0;

        return value > 0 ? { ...current, value } : null;
      }

      return current;
    });
  }, [sleepStats]);

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
      setPanels((current) => ({
        ...current,
        timeRange: false,
        timeline: false,
      }));
    }
  }

  function closeAnalysisPanel() {
    setActiveAnalysisPanel(null);
  }

  function closeTimelinePanel() {
    setPanels((current) => ({ ...current, timeline: false }));
  }

  function focusPeopleStory(story: PeopleStory) {
    if (story.coordinates) {
      const coordinates = story.coordinates;
      setFocusedLocation((current) => ({
        lat: coordinates.lat,
        lng: coordinates.lng,
        signal: (current?.signal ?? 0) + 1,
      }));
    }

    setPanels((current) => ({
      ...current,
      timeRange: isMobileLayout() ? false : current.timeRange,
      timeline: true,
    }));
    setIsTimelineCollapsed(false);
    setTimelineTargetEntryId(story.timelineEntryId);
    setTimelineExpandEntryId(story.timelineEntryId);
    setTimelineTargetSignal((current) => current + 1);

    if (isMobileLayout()) setActiveAnalysisPanel(null);
  }

  async function toggleLocationFavorite(locationId: number, favorite: boolean) {
    setError(null);
    setLocations((current) =>
      current
        ? {
            ...current,
            features: current.features.map((feature) =>
              Number(featureRecordId(feature)) === locationId
                ? {
                    ...feature,
                    properties: {
                      ...(feature.properties ?? {}),
                      favorite,
                    },
                  }
                : feature,
            ),
          }
        : current,
    );

    try {
      const response = await fetch(
        `${API_BASE_URL}/locations/${locationId}/favorite`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ favorite }),
        },
      );

      if (!response.ok) {
        throw new Error("Updating the favorite failed.");
      }

      await loadTravelData();
    } catch (caught) {
      await loadTravelData();
      setError(
        caught instanceof Error
          ? caught.message
          : "Updating the favorite failed.",
      );
    }
  }

  function panelSwipeCloseHandlers(onClose: () => void) {
    return {
      onPointerDown(event: PointerEvent<HTMLElement>) {
        if (!isMobileLayout()) return;

        const panelTop = event.currentTarget.getBoundingClientRect().top;
        panelSwipeRef.current = {
          hasClosed: false,
          startX: event.clientX,
          startY: event.clientY,
          startedAtTop: event.clientY - panelTop <= 76,
        };
      },
      onPointerMove(event: PointerEvent<HTMLElement>) {
        const state = panelSwipeRef.current;
        if (!state || !state.startedAtTop || state.hasClosed) return;

        const deltaX = event.clientX - state.startX;
        const deltaY = event.clientY - state.startY;
        if (deltaY > 72 && deltaY > Math.abs(deltaX) * 1.25) {
          state.hasClosed = true;
          onClose();
        }
      },
      onPointerUp() {
        panelSwipeRef.current = null;
      },
      onPointerCancel() {
        panelSwipeRef.current = null;
      },
    };
  }

  function closeLocationDialog() {
    setLocationForm(null);
    setEditingLocationId(null);
    setIsPlacingLocation(false);
  }

  function startLegGeometryEdit(
    feature: GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>,
  ) {
    const id = Number(featureRecordId(feature));
    if (!Number.isFinite(id)) return;

    setIsPlacingLocation(false);
    setLocationForm(null);
    setEditingLocationId(null);
    setEditableLeg((current) => ({
      feature,
      id,
      signal: (current?.signal ?? 0) + 1,
    }));
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

  async function saveLegGeometry(id: number, coordinates: [number, number][]) {
    const cleanCoordinates = coordinates
      .map(([lng, lat]) => [Number(lng), Number(lat)] as [number, number])
      .filter(
        ([lng, lat]) =>
          Number.isFinite(lng) &&
          Number.isFinite(lat) &&
          lng >= -180 &&
          lng <= 180 &&
          lat >= -90 &&
          lat <= 90,
      );

    if (cleanCoordinates.length < 2) {
      setError("The leg needs at least two valid points before it can be saved.");
      return;
    }

    setIsSavingLegGeometry(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/legs/${id}/geometry`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coordinates: cleanCoordinates }),
      });

      if (!response.ok) {
        throw new Error("Saving the leg geometry failed.");
      }

      await loadTravelData();
      setEditableLeg(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Saving leg geometry failed.",
      );
    } finally {
      setIsSavingLegGeometry(false);
    }
  }

  return (
    <main className="app-shell">
      <TravelMap
        error={error}
        isLoading={isLoading}
        isPlacingLocation={isPlacingLocation}
        legs={filteredLegs}
        locationForm={locationForm}
        locations={filteredLocations}
        focusedLocation={focusedLocation}
        timelinePosition={timelineMapPosition}
        initialViewSignal={initialViewSignal}
        selectedTransport={selectedTransport}
        selectedTransportCostGroup={selectedTransportCostGroup}
        isTransportLayerVisible={isTransportLayerVisible}
        selectedSleepCategory={selectedSleepCategory}
        selectedSleepCostGroup={selectedSleepCostGroup}
        isSleepLayerVisible={isSleepLayerVisible}
        basemap={basemap}
        editableLeg={editableLeg}
        isSavingLegGeometry={isSavingLegGeometry}
        onCancelPlacingLocation={() => setIsPlacingLocation(false)}
        onCancelLegGeometryEdit={() => setEditableLeg(null)}
        onMapError={setError}
        onNewLocationForm={(form) => {
          setEditingLocationId(null);
          setLocationForm(form);
          setIsPlacingLocation(false);
        }}
        onSelectTimelineEntry={(id, expandEntryId) => {
          const isMobile = isMobileLayout();
          setPanels((current) => ({
            ...current,
            timeRange: isMobile ? false : current.timeRange,
            timeline: true,
          }));
          if (isMobile) setActiveAnalysisPanel(null);
          setTimelineTargetEntryId(id);
          setTimelineExpandEntryId(expandEntryId ?? id);
          setTimelineTargetSignal((current) => current + 1);
        }}
        onSaveLegGeometry={saveLegGeometry}
      />

      <div className="map-button-row" aria-label="Map controls">
        {isAdmin && (
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
        )}
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
          onClick={() => setInitialViewSignal((current) => current + 1)}
          title="Zoom to globe view"
          aria-label="Zoom to globe view"
        >
          <Globe2 size={18} />
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
              className={activeAnalysisPanel === "people" ? "active" : ""}
              onClick={() => selectAnalysisPanel("people")}
              title="People explorer"
            >
              <UsersRound size={18} />
              <span>People</span>
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
                    timeRange: false,
                    timeline: nextTimeline,
                  };
                })
              }
              title="Journey timeline"
            >
              <Clock3 size={18} />
              <span>Timeline</span>
            </button>
            <button
              type="button"
              className={
                panels.timeRange
                  ? "active time-action-button"
                  : "time-action-button"
              }
              onClick={() =>
                setPanels((current) => {
                  const isMobile = isMobileLayout();
                  const nextTimeRange = !current.timeRange;
                  if (isMobile && nextTimeRange) setActiveAnalysisPanel(null);
                  return {
                    ...current,
                    timeRange: nextTimeRange,
                    timeline: isMobile ? false : current.timeline,
                  };
                })
              }
              title="Travel time range"
            >
              <SlidersHorizontal size={18} />
              <span>Time</span>
            </button>
          </nav>

          {activeAnalysisPanel && (
            <div
              className="analysis-panel"
              {...panelSwipeCloseHandlers(closeAnalysisPanel)}
            >
              {activeAnalysisPanel === "general" && (
                <>
                  <div className="panel-heading">
                    <div>
                      <h2>General statistics</h2>
                    </div>
                    <button
                      type="button"
                      className="panel-close-button"
                      onClick={closeAnalysisPanel}
                      title="Close panel"
                      aria-label="Close panel"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <GeneralStatsPanel generalStats={generalStats} />
                </>
              )}

              {activeAnalysisPanel === "transport" && (
                <TransportDistancePanel
                  orderedStats={orderedStats}
                  selectedChartPart={selectedChartPart}
                  selectedTransport={selectedTransport}
                  isTransportLayerVisible={isTransportLayerVisible}
                  onClose={closeAnalysisPanel}
                  onSelectChartPart={setSelectedChartPart}
                  onSelectTransport={setSelectedTransport}
                  onToggleTransportLayer={() =>
                    setIsTransportLayerVisible((current) => !current)
                  }
                />
              )}

              {activeAnalysisPanel === "people" && (
                <PeopleExplorerPanel
                  isAdmin={isAdmin}
                  query={peopleExplorerQuery}
                  selectedIndex={peopleExplorerSelectedIndex}
                  stories={peopleStories}
                  onClose={closeAnalysisPanel}
                  onFocusStory={focusPeopleStory}
                  onToggleFavorite={toggleLocationFavorite}
                  onQueryChange={(nextQuery) => {
                    setPeopleExplorerQuery(nextQuery);
                    setPeopleExplorerSelectedIndex(-1);
                  }}
                  onSelectedIndexChange={setPeopleExplorerSelectedIndex}
                />
              )}

              {activeAnalysisPanel === "sleep" && (
                <SleepCategoryPanel
                  selectedChartPart={selectedSleepChartPart}
                  selectedSleepCategory={selectedSleepCategory}
                  isSleepLayerVisible={isSleepLayerVisible}
                  stats={sleepStats}
                  onClose={closeAnalysisPanel}
                  onSelectChartPart={setSelectedSleepChartPart}
                  onSelectSleepCategory={setSelectedSleepCategory}
                  onToggleSleepLayer={() =>
                    setIsSleepLayerVisible((current) => !current)
                  }
                />
              )}
            </div>
          )}
        </section>

        {panels.timeline && (
          <section
            className={`timeline-shell ${
              isTimelineCollapsed ? "collapsed" : ""
            }`}
            {...panelSwipeCloseHandlers(closeTimelinePanel)}
          >
            <div className="panel-heading">
              <div className="panel-title-row">
                <button
                  type="button"
                  className="panel-icon-button"
                  onClick={() => setIsTimelineCollapsed((current) => !current)}
                  title={
                    isTimelineCollapsed
                      ? "Expand timeline"
                      : "Collapse timeline"
                  }
                  aria-label={
                    isTimelineCollapsed
                      ? "Expand timeline"
                      : "Collapse timeline"
                  }
                  aria-pressed={isTimelineCollapsed}
                >
                  {isTimelineCollapsed ? (
                    <PanelLeftOpen size={18} />
                  ) : (
                    <PanelLeftClose size={18} />
                  )}
                </button>
                {!isTimelineCollapsed && <h2>Journey timeline</h2>}
              </div>
              {!isTimelineCollapsed && (
                <button
                  type="button"
                  className="panel-close-button"
                  onClick={closeTimelinePanel}
                  title="Close panel"
                  aria-label="Close panel"
                >
                  <X size={18} />
                </button>
              )}
            </div>
            <TravelTimeline
              locations={filteredLocations}
              legs={filteredLegs}
              collapsed={isTimelineCollapsed}
              isAdmin={isAdmin}
              expandEntryId={timelineExpandEntryId}
              targetEntryId={timelineTargetEntryId}
              targetEntrySignal={timelineTargetSignal}
              onFocusLocation={(coordinates) =>
                setFocusedLocation((current) => ({
                  ...coordinates,
                  signal: (current?.signal ?? 0) + 1,
                }))
              }
              onTimelinePositionChange={setTimelineMapPosition}
              onToggleFavorite={toggleLocationFavorite}
              onEditLocation={(id, form) => {
                if (!isAdmin) return;
                setEditableLeg(null);
                setEditingLocationId(id);
                setLocationForm(form);
              }}
              onEditLeg={(feature) => {
                if (!isAdmin) return;
                startLegGeometryEdit(feature);
              }}
            />
          </section>
        )}
      </div>

      {panels.timeRange && (
        <TimeRangeSlider
          className={isMobileLayout() ? "mobile-time-slider" : ""}
          monthlyStats={monthlyTransportStats}
          range={selectedTimeRange}
          selectedDistanceKm={totalKm}
          onChange={setSelectedTimeRange}
        />
      )}

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
