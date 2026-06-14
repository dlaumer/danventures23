import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl, {
  GeoJSONSource,
  Map as MapLibreMap,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  CalendarDays,
  Check,
  Crosshair,
  MapPin,
  MapPinPlus,
  Route,
  X,
} from "lucide-react";
import {
  freeTransportModes,
  paidSleepCategories,
  sleepCategoryOptions,
  transportOptions,
  globeSky,
  IMAGERY_MAP_STYLE,
  type MapBasemap,
  API_BASE_URL,
  MAP_STYLE_URL,
} from "../constants";
import type {
  FeatureCollection,
  EditableLeg,
  LocationFormState,
  TimelineMapPosition,
} from "../types";
import {
  buildEmptyLocationForm,
  buildTransportColorExpression,
  coordinateAlongLine,
  featureRecordId,
  formatTimelineDateTime,
  normalizeLngLat,
  parseTravelDate,
  positionDistanceKm,
  propertyString,
  timelineEntryId,
  transportLabel,
} from "../utils";

type TravelMapProps = {
  error: string | null;
  isLoading: boolean;
  isPlacingLocation: boolean;
  legs: FeatureCollection | null;
  locationForm: LocationFormState | null;
  isMovingLocation: boolean;
  locations: FeatureCollection | null;
  focusedLocation: { lat: number; lng: number; signal: number } | null;
  timelinePosition: TimelineMapPosition | null;
  initialViewSignal: number;
  selectedTransport: string | null;
  selectedTransportCostGroup: "free" | "paid" | null;
  isTransportLayerVisible: boolean;
  selectedSleepCategory: string | null;
  selectedSleepCostGroup: "free" | "paid" | null;
  isSleepLayerVisible: boolean;
  basemap: MapBasemap;
  editableLeg: EditableLeg | null;
  isSavingLegGeometry: boolean;
  onCancelPlacingLocation: () => void;
  onCancelMovingLocation: () => void;
  onCancelLegGeometryEdit: () => void;
  onMapError: (message: string) => void;
  onNewLocationForm: (form: LocationFormState) => void;
  onMoveLocationForm: (coordinates: { lat: number; lng: number }) => void;
  onSaveLegGeometry: (id: number, coordinates: [number, number][]) => void;
  onSelectTimelineEntry: (id: string, expandEntryId?: string) => void;
};

const freeTransportValues = transportOptions.filter((option) =>
  freeTransportModes.has(option),
);
const paidTransportValues = transportOptions.filter(
  (option) => !freeTransportModes.has(option),
);
const paidSleepValues = sleepCategoryOptions.filter((option) =>
  paidSleepCategories.has(option),
);
const freeSleepValues = sleepCategoryOptions.filter(
  (option) => !paidSleepCategories.has(option),
);
const travelSourceIds = [
  "legs",
  "detailed-legs",
  "flight-lines",
  "locations",
  "timeline-position",
  "draft-location",
  "editable-leg",
  "editable-leg-points",
] as const;

const INITIAL_MAP_VIEW = {
  center: [-10, 40] as [number, number],
  zoom: 2,
  bearing: -18,
  pitch: 12,
};
const travelLayerIds = [
  "locations-waypoints",
  "legs-paid-shadow",
  "legs-paid-main",
  "detailed-legs-paid-shadow",
  "detailed-legs-paid-main",
  "legs-flights",
  "legs-free-shadow",
  "legs-free-main",
  "detailed-legs-free-shadow",
  "detailed-legs-free-main",
  "legs-flights-hit",
  "locations-main",
  "locations-hit",
  "timeline-position-pulse",
  "timeline-position",
  "draft-location",
  "editable-leg-shadow",
  "editable-leg-line",
  "editable-leg-points",
] as const;
const legMainLayerIds = ["legs-paid-main", "legs-free-main"] as const;
const legShadowLayerIds = ["legs-paid-shadow", "legs-free-shadow"] as const;
const detailedLegMainLayerIds = [
  "detailed-legs-paid-main",
  "detailed-legs-free-main",
] as const;
const detailedLegShadowLayerIds = [
  "detailed-legs-paid-shadow",
  "detailed-legs-free-shadow",
] as const;
const legRouteLayerIds = [
  ...legShadowLayerIds,
  ...legMainLayerIds,
  ...detailedLegShadowLayerIds,
  ...detailedLegMainLayerIds,
  "legs-flights",
  "legs-flights-hit",
] as const;
const visibleLegHitLayerIds = [
  ...legMainLayerIds,
  "legs-flights-hit",
] as const;
type MapFeatureCandidate = {
  date: Date | null;
  expandEntryId?: string;
  key: string;
  kind: "leg" | "location";
  label: string;
  targetEntryId: string;
};

type FeatureChoiceDialog = {
  candidates: MapFeatureCandidate[];
  maxHeight: number;
  width: number;
  x: number;
  y: number;
};

type EditableLegPointProperties = {
  index: number;
};

const featureChoiceMargin = 12;
const featureChoicePreferredWidth = 280;
const featureChoicePreferredMaxHeight = 320;
const pointSnapRadiusPx = 18;
const detailedLegsMinZoom = 9.5;
const detailedLegsBboxPaddingRatio = 0.75;
const detailedLegsFetchDelayMs = 350;
const emptyFeatureCollection: FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

function preserveTravelLayers(
  previousStyle: maplibregl.StyleSpecification | undefined,
  nextStyle: maplibregl.StyleSpecification,
): maplibregl.StyleSpecification {
  if (!previousStyle) return nextStyle;

  const preservedSources = travelSourceIds.reduce<
    maplibregl.StyleSpecification["sources"]
  >(
    (sources, sourceId) => {
      const source = previousStyle.sources[sourceId];
      return source ? { ...sources, [sourceId]: source } : sources;
    },
    { ...nextStyle.sources },
  );
  const preservedLayerIds = new Set<string>(travelLayerIds);
  const preservedLayers = travelLayerIds
    .map((layerId) => previousStyle.layers.find((layer) => layer.id === layerId))
    .filter(
      (layer): layer is maplibregl.LayerSpecification => Boolean(layer),
    );

  return {
    ...nextStyle,
    sources: preservedSources,
    layers: [
      ...nextStyle.layers.filter((layer) => !preservedLayerIds.has(layer.id)),
      ...preservedLayers,
    ],
  };
}

function moveTravelLayersToTop(map: MapLibreMap) {
  travelLayerIds.forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.moveLayer(layerId);
    }
  });
}

const overlappingFlightEndpointToleranceKm = 75;

type FlightEndpoints = {
  from: GeoJSON.Position;
  to: GeoJSON.Position;
};

function legEndpoints(feature: GeoJSON.Feature): FlightEndpoints | null {
  const geometry = feature.geometry;
  const lines =
    geometry?.type === "LineString"
      ? [geometry.coordinates]
      : geometry?.type === "MultiLineString"
        ? geometry.coordinates
        : [];
  const coordinates = lines.flat().filter((position) => position.length >= 2);
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];

  if (!first || !last) return null;

  return { from: first, to: last };
}

function findTimelineFeature(
  collection: FeatureCollection | null,
  kind: "leg" | "location",
  entryId: string,
) {
  return (
    collection?.features.find((feature, index) => {
      return timelineEntryId(kind, feature, index) === entryId;
    }) ?? null
  );
}

function coordinateForTimelinePosition(
  position: TimelineMapPosition | null,
  locations: FeatureCollection | null,
  legs: FeatureCollection | null,
): GeoJSON.Position | null {
  if (!position) return null;
  if (position.coordinates) return position.coordinates;

  if (position.kind === "location") {
    const feature = findTimelineFeature(locations, "location", position.entryId);
    return feature?.geometry?.type === "Point"
      ? feature.geometry.coordinates
      : null;
  }

  const feature = findTimelineFeature(legs, "leg", position.entryId);
  return coordinateAlongLine(feature?.geometry ?? null, position.routeProgress);
}

function areOverlappingFlightEndpoints(
  a: FlightEndpoints,
  b: FlightEndpoints,
) {
  const sameDirection =
    positionDistanceKm(a.from, b.from) <= overlappingFlightEndpointToleranceKm &&
    positionDistanceKm(a.to, b.to) <= overlappingFlightEndpointToleranceKm;
  const oppositeDirection =
    positionDistanceKm(a.from, b.to) <= overlappingFlightEndpointToleranceKm &&
    positionDistanceKm(a.to, b.from) <= overlappingFlightEndpointToleranceKm;

  return sameDirection || oppositeDirection;
}

function buildVisibleFlightCollection(legs: FeatureCollection): FeatureCollection {
  const flightEntries: {
    endpoints: FlightEndpoints;
    feature: FeatureCollection["features"][number];
  }[] = [];

  legs.features.forEach((feature) => {
    if (feature.properties?.transport !== "plane") return;

    const endpoints = legEndpoints(feature);
    if (endpoints) {
      flightEntries.push({ endpoints, feature });
    }
  });
  const flightGroups: {
    endpoints: FlightEndpoints;
    features: FeatureCollection["features"];
  }[] = [];

  flightEntries.forEach(({ endpoints, feature }) => {
    const existingGroup = flightGroups.find((group) =>
      areOverlappingFlightEndpoints(group.endpoints, endpoints),
    );

    if (existingGroup) {
      existingGroup.features.push(feature);
      return;
    }

    flightGroups.push({ endpoints, features: [feature] });
  });

  return {
    type: "FeatureCollection",
    features: flightGroups.map((group) => {
      const [representative] = group.features;
      return {
        ...representative,
        properties: {
          ...representative.properties,
          duplicate_leg_count: group.features.length,
        },
      };
    }),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function paddedMapBbox(map: MapLibreMap) {
  const bounds = map.getBounds();
  const west = bounds.getWest();
  const south = bounds.getSouth();
  const east = bounds.getEast();
  const north = bounds.getNorth();
  const lngPadding = (east - west) * detailedLegsBboxPaddingRatio;
  const latPadding = (north - south) * detailedLegsBboxPaddingRatio;

  return [
    clamp(west - lngPadding, -180, 180),
    clamp(south - latPadding, -90, 90),
    clamp(east + lngPadding, -180, 180),
    clamp(north + latPadding, -90, 90),
  ] as const;
}

function detailedLegsSimplifyForZoom(zoom: number) {
  if (zoom >= 14) return null;
  if (zoom >= 12) return "0.00003";
  if (zoom >= 10.75) return "0.00008";
  return "0.0002";
}

function getMapFocusOffset(): [number, number] {
  if (typeof window === "undefined") return [0, -70];

  if (window.matchMedia("(max-width: 560px)").matches) return [0, -92];
  if (window.matchMedia("(max-width: 900px)").matches) return [0, -84];
  return [0, -70];
}

function editableCoordinatesForLeg(
  feature: GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>,
): [number, number][] {
  const geometry = feature.geometry;
  const lines =
    geometry?.type === "LineString"
      ? [geometry.coordinates]
      : geometry?.type === "MultiLineString"
        ? geometry.coordinates
        : [];

  return lines
    .flat()
    .map((position) => normalizeLngLat(position))
    .filter((position): position is [number, number] => Boolean(position));
}

function boundsForCoordinates(coordinates: [number, number][]) {
  const [first, ...rest] = coordinates;
  if (!first) return null;

  const bounds = new maplibregl.LngLatBounds(first, first);
  rest.forEach((coordinate) => bounds.extend(coordinate));
  return bounds;
}

function closestPointOnSegment(
  point: maplibregl.Point,
  start: maplibregl.Point,
  end: maplibregl.Point,
) {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;

  if (lengthSquared === 0) {
    return {
      distance: Math.hypot(point.x - start.x, point.y - start.y),
      x: start.x,
      y: start.y,
    };
  }

  const progress = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) /
        lengthSquared,
    ),
  );
  const x = start.x + progress * segmentX;
  const y = start.y + progress * segmentY;

  return {
    distance: Math.hypot(point.x - x, point.y - y),
    x,
    y,
  };
}

function insertionPointForEditableLeg(
  coordinates: [number, number][],
  map: MapLibreMap,
  point: maplibregl.Point,
) {
  return coordinates.reduce<{
    coordinate: [number, number];
    distance: number;
    insertAt: number;
  } | null>((closest, coordinate, index) => {
    if (index === 0) return closest;

    const start = map.project(coordinates[index - 1]);
    const end = map.project(coordinate);
    const projected = closestPointOnSegment(point, start, end);
    if (projected.distance > 22 || (closest && closest.distance <= projected.distance)) {
      return closest;
    }

    const lngLat = map.unproject([projected.x, projected.y]);
    return {
      coordinate: [lngLat.lng, lngLat.lat],
      distance: projected.distance,
      insertAt: index,
    };
  }, null);
}

export function TravelMap({
  error,
  isLoading,
  isPlacingLocation,
  legs,
  locationForm,
  isMovingLocation,
  locations,
  focusedLocation,
  timelinePosition,
  initialViewSignal,
  selectedTransport,
  selectedTransportCostGroup,
  isTransportLayerVisible,
  selectedSleepCategory,
  selectedSleepCostGroup,
  isSleepLayerVisible,
  basemap,
  editableLeg,
  isSavingLegGeometry,
  onCancelPlacingLocation,
  onCancelMovingLocation,
  onCancelLegGeometryEdit,
  onMapError,
  onNewLocationForm,
  onMoveLocationForm,
  onSaveLegGeometry,
  onSelectTimelineEntry,
}: TravelMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const isMapReadyRef = useRef(false);
  const initialBasemapRef = useRef(basemap);
  const [isMapReady, setIsMapReady] = useState(false);
  const [featureChoiceDialog, setFeatureChoiceDialog] =
    useState<FeatureChoiceDialog | null>(null);
  const [editableLegCoordinates, setEditableLegCoordinates] = useState<
    [number, number][]
  >([]);
  const isMapLoading = !error && (isLoading || !isMapReady);

  const loadBasemapStyle = useCallback(
    async (nextBasemap: MapBasemap): Promise<maplibregl.StyleSpecification> => {
      if (nextBasemap === "imagery") {
        return {
          ...IMAGERY_MAP_STYLE,
          projection: { type: "globe" },
          sky: globeSky,
        };
      }

      const styleResponse = await fetch(MAP_STYLE_URL);
      if (!styleResponse.ok) throw new Error("Map style request failed.");
      const style = (await styleResponse.json()) as maplibregl.StyleSpecification;

      return {
        ...style,
        projection: { type: "globe" },
        sky: globeSky,
      };
    },
    [],
  );

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    let isMounted = true;

    async function initializeMap() {
      try {
        const style = await loadBasemapStyle(initialBasemapRef.current);

        if (!isMounted || !mapContainerRef.current || mapRef.current) return;

        mapRef.current = new maplibregl.Map({
          container: mapContainerRef.current,
          style,
          center: INITIAL_MAP_VIEW.center,
          zoom: INITIAL_MAP_VIEW.zoom,
          bearing: INITIAL_MAP_VIEW.bearing,
          pitch: INITIAL_MAP_VIEW.pitch,
          maxPitch: 85,
          renderWorldCopies: false,
        });
        window.danventuresMap = mapRef.current;

        
        mapRef.current.once("load", () => {
          mapRef.current?.resize();
          isMapReadyRef.current = true;
          setIsMapReady(true);
        });
      } catch (caught) {
        if (isMounted) {
          onMapError(
            caught instanceof Error ? caught.message : "Could not load the map.",
          );
        }
      }
    }

    initializeMap();

    return () => {
      isMounted = false;
      isMapReadyRef.current = false;
      setIsMapReady(false);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        window.danventuresMap = undefined;
      }
    };
  }, [loadBasemapStyle, onMapError]);

  useEffect(() => {
    const container = mapContainerRef.current;
    const map = mapRef.current;
    if (!container || !map) return;

    const resizeMap = () => {
      if (mapRef.current === map) map.resize();
    };
    const resizeObserver = new ResizeObserver(resizeMap);
    resizeObserver.observe(container);
    window.addEventListener("orientationchange", resizeMap);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("orientationchange", resizeMap);
    };
  }, [isMapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReadyRef.current) return;

    const activeMap = map;
    let isMounted = true;
    let handleStyleLoad: (() => void) | null = null;

    async function switchBasemap() {
      try {
        const style = await loadBasemapStyle(basemap);
        if (!isMounted) return;

        isMapReadyRef.current = false;
        setIsMapReady(false);
        handleStyleLoad = () => {
          if (!isMounted) return;
          activeMap.resize();
          moveTravelLayersToTop(activeMap);
          isMapReadyRef.current = true;
          setIsMapReady(true);
        };
        activeMap.once("style.load", handleStyleLoad);
        activeMap.setStyle(style, { transformStyle: preserveTravelLayers });
      } catch (caught) {
        if (isMounted) {
          onMapError(
            caught instanceof Error ? caught.message : "Could not switch basemap.",
          );
        }
      }
    }

    switchBasemap();

    return () => {
      isMounted = false;
      if (handleStyleLoad) {
        activeMap.off("style.load", handleStyleLoad);
      }
    };
  }, [basemap, loadBasemapStyle, onMapError]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady) return;

    if (!map.getSource("timeline-position")) {
      map.addSource("timeline-position", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });

      map.addLayer({
        id: "timeline-position-pulse",
        type: "circle",
        source: "timeline-position",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            1,
            8,
            6,
            13,
            10,
            18,
          ],
          "circle-color": "#ff4d2d",
          "circle-opacity": 0.24,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-opacity": 0.72,
          "circle-stroke-width": 2,
        },
      });

      map.addLayer({
        id: "timeline-position",
        type: "circle",
        source: "timeline-position",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            1,
            5,
            6,
            7,
            10,
            10,
          ],
          "circle-color": "#ff4d2d",
          "circle-opacity": 0.98,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
    }

    if (!map.getSource("draft-location")) {
      map.addSource("draft-location", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });

      map.addLayer({
        id: "draft-location",
        type: "circle",
        source: "draft-location",
        paint: {
          "circle-radius": 7,
          "circle-color": "#f35b2f",
          "circle-opacity": 0.95,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
    }

    if (!map.getSource("editable-leg")) {
      map.addSource("editable-leg", {
        type: "geojson",
        data: emptyFeatureCollection,
      });

      map.addLayer({
        id: "editable-leg-shadow",
        type: "line",
        source: "editable-leg",
        paint: {
          "line-color": "#12202b",
          "line-opacity": 0.58,
          "line-width": 9,
        },
      });

      map.addLayer({
        id: "editable-leg-line",
        type: "line",
        source: "editable-leg",
        paint: {
          "line-color": "#ff4d2d",
          "line-opacity": 0.98,
          "line-width": 5,
        },
      });
    }

    if (!map.getSource("editable-leg-points")) {
      map.addSource("editable-leg-points", {
        type: "geojson",
        data: emptyFeatureCollection,
      });

      map.addLayer({
        id: "editable-leg-points",
        type: "circle",
        source: "editable-leg-points",
        paint: {
          "circle-radius": 7,
          "circle-color": "#ffffff",
          "circle-stroke-color": "#ff4d2d",
          "circle-stroke-width": 3,
        },
      });
    }

    moveTravelLayersToTop(map);
  }, [isMapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady) return;

    const coordinates = normalizeLngLat(
      coordinateForTimelinePosition(timelinePosition, locations, legs),
    );
    const source = map.getSource("timeline-position") as GeoJSONSource | undefined;
    if (!source) return;

    source.setData({
      type: "FeatureCollection",
      features: coordinates
        ? [
            {
              type: "Feature",
              properties: {},
              geometry: {
                type: "Point",
                coordinates,
              },
            },
          ]
        : [],
    });
  }, [isMapReady, legs, locations, timelinePosition]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady) return;

    const source = map.getSource("draft-location") as GeoJSONSource | undefined;
    if (!source) return;

    source.setData({
      type: "FeatureCollection",
      features: locationForm
        ? [
            {
              type: "Feature",
              properties: {},
              geometry: {
                type: "Point",
                coordinates: [locationForm.lng, locationForm.lat],
              },
            },
          ]
        : [],
    });
  }, [isMapReady, locationForm]);

  useEffect(() => {
    if (!editableLeg) {
      setEditableLegCoordinates([]);
      return;
    }

    const coordinates = editableCoordinatesForLeg(editableLeg.feature);
    setEditableLegCoordinates(coordinates);
    setFeatureChoiceDialog(null);

    const map = mapRef.current;
    const bounds = boundsForCoordinates(coordinates);
    if (!map || !isMapReady || !bounds) return;

    map.fitBounds(bounds, {
      duration: 850,
      essential: true,
      maxZoom: 13,
      padding: {
        bottom: 120,
        left: 70,
        right: 70,
        top: 90,
      },
    });
  }, [editableLeg, isMapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady) return;

    const lineSource = map.getSource("editable-leg") as GeoJSONSource | undefined;
    const pointSource = map.getSource("editable-leg-points") as
      | GeoJSONSource
      | undefined;
    if (!lineSource || !pointSource) return;

    const hasEditableLine = editableLeg && editableLegCoordinates.length >= 2;

    lineSource.setData({
      type: "FeatureCollection",
      features: hasEditableLine
        ? [
            {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: editableLegCoordinates,
              },
            },
          ]
        : [],
    });

    pointSource.setData({
      type: "FeatureCollection",
      features: hasEditableLine
        ? editableLegCoordinates.map((coordinates, index) => ({
            type: "Feature",
            properties: { index } satisfies EditableLegPointProperties,
            geometry: {
              type: "Point",
              coordinates,
            },
          }))
        : [],
    });
  }, [editableLeg, editableLegCoordinates, isMapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady || !editableLeg || !map.getLayer("editable-leg-points")) {
      return;
    }

    let activePointIndex: number | null = null;
    let shouldIgnoreNextLineClick = false;

    const setPointer = () => {
      map.getCanvas().style.cursor = "grab";
    };
    const setLinePointer = () => {
      if (activePointIndex === null) map.getCanvas().style.cursor = "copy";
    };
    const clearPointer = () => {
      if (activePointIndex === null) map.getCanvas().style.cursor = "";
    };
    const stopDragging = () => {
      if (activePointIndex === null) return;
      activePointIndex = null;
      map.dragPan.enable();
      map.getCanvas().style.cursor = "grab";
    };
    const startDragging = (
      event: maplibregl.MapLayerMouseEvent | maplibregl.MapLayerTouchEvent,
    ) => {
      const feature = event.features?.[0];
      const index = Number(feature?.properties?.index);
      if (!Number.isInteger(index)) return;

      event.preventDefault();
      shouldIgnoreNextLineClick = true;
      activePointIndex = index;
      map.dragPan.disable();
      map.getCanvas().style.cursor = "grabbing";
    };
    const movePoint = (
      event: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent,
    ) => {
      if (activePointIndex === null) return;

      setEditableLegCoordinates((current) =>
        current.map((coordinate, index) =>
          index === activePointIndex
            ? [event.lngLat.lng, event.lngLat.lat]
            : coordinate,
        ),
      );
    };
    const insertPoint = (event: maplibregl.MapMouseEvent) => {
      if (activePointIndex !== null) return;
      if (shouldIgnoreNextLineClick) {
        shouldIgnoreNextLineClick = false;
        return;
      }

      const pointFeatures = map.queryRenderedFeatures(
        [
          [event.point.x - 10, event.point.y - 10],
          [event.point.x + 10, event.point.y + 10],
        ],
        { layers: ["editable-leg-points"] },
      );
      if (pointFeatures.length > 0) return;

      setEditableLegCoordinates((current) => {
        const insertion = insertionPointForEditableLeg(current, map, event.point);
        if (!insertion) return current;

        return [
          ...current.slice(0, insertion.insertAt),
          insertion.coordinate,
          ...current.slice(insertion.insertAt),
        ];
      });
    };

    map.on("mouseenter", "editable-leg-points", setPointer);
    map.on("mouseleave", "editable-leg-points", clearPointer);
    map.on("mouseenter", "editable-leg-line", setLinePointer);
    map.on("mouseleave", "editable-leg-line", clearPointer);
    map.on("mouseenter", "editable-leg-shadow", setLinePointer);
    map.on("mouseleave", "editable-leg-shadow", clearPointer);
    map.on("mousedown", "editable-leg-points", startDragging);
    map.on("touchstart", "editable-leg-points", startDragging);
    map.on("click", insertPoint);
    map.on("mousemove", movePoint);
    map.on("touchmove", movePoint);
    map.on("mouseup", stopDragging);
    map.on("touchend", stopDragging);
    map.on("touchcancel", stopDragging);

    return () => {
      map.off("mouseenter", "editable-leg-points", setPointer);
      map.off("mouseleave", "editable-leg-points", clearPointer);
      map.off("mouseenter", "editable-leg-line", setLinePointer);
      map.off("mouseleave", "editable-leg-line", clearPointer);
      map.off("mouseenter", "editable-leg-shadow", setLinePointer);
      map.off("mouseleave", "editable-leg-shadow", clearPointer);
      map.off("mousedown", "editable-leg-points", startDragging);
      map.off("touchstart", "editable-leg-points", startDragging);
      map.off("click", insertPoint);
      map.off("mousemove", movePoint);
      map.off("touchmove", movePoint);
      map.off("mouseup", stopDragging);
      map.off("touchend", stopDragging);
      map.off("touchcancel", stopDragging);
      if (activePointIndex !== null) map.dragPan.enable();
    };
  }, [editableLeg, isMapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady || !focusedLocation) return;

    map.flyTo({
      center: [focusedLocation.lng, focusedLocation.lat],
      duration: 850,
      essential: true,
      offset: getMapFocusOffset(),
      zoom: Math.max(map.getZoom(), 9),
    });
  }, [focusedLocation, isMapReady]);

  useEffect(() => {
    if (!initialViewSignal || !mapRef.current) return;

    mapRef.current.easeTo({
      ...INITIAL_MAP_VIEW,
      duration: 800,
    });
  }, [initialViewSignal]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady || !isPlacingLocation) return;

    setFeatureChoiceDialog(null);

    const canvas = map.getCanvas();
    const previousCursor = canvas.style.cursor;
    canvas.style.cursor = "default";

    const snappedVisibleLocationCoordinates = (
      event: maplibregl.MapMouseEvent,
    ): [number, number] | null => {
      if (!map.getLayer("locations-hit")) return null;

      const visibleLocationFeatures = map.queryRenderedFeatures(
        [
          [event.point.x - pointSnapRadiusPx, event.point.y - pointSnapRadiusPx],
          [event.point.x + pointSnapRadiusPx, event.point.y + pointSnapRadiusPx],
        ],
        { layers: ["locations-hit"] },
      );

      const nearest = visibleLocationFeatures.reduce<{
        coordinates: [number, number];
        distance: number;
      } | null>((closest, feature) => {
        if (feature.geometry.type !== "Point") return closest;

        const coordinates = normalizeLngLat(feature.geometry.coordinates);
        if (!coordinates) return closest;

        const point = map.project(coordinates);
        const distance = Math.hypot(
          point.x - event.point.x,
          point.y - event.point.y,
        );

        if (distance > pointSnapRadiusPx || (closest && closest.distance <= distance)) {
          return closest;
        }

        return {
          coordinates: [coordinates[0], coordinates[1]],
          distance,
        };
      }, null);

      return nearest?.coordinates ?? null;
    };

    const handleClick = (event: maplibregl.MapMouseEvent) => {
      const [lng, lat] = snappedVisibleLocationCoordinates(event) ?? [
        event.lngLat.lng,
        event.lngLat.lat,
      ];

      onNewLocationForm(
        buildEmptyLocationForm(lng, lat, locations),
      );
    };

    map.on("click", handleClick);

    return () => {
      map.off("click", handleClick);
      canvas.style.cursor = previousCursor;
    };
  }, [isMapReady, isPlacingLocation, locations, onNewLocationForm]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady || !isMovingLocation || !locationForm) return;

    setFeatureChoiceDialog(null);

    const canvas = map.getCanvas();
    const previousCursor = canvas.style.cursor;
    canvas.style.cursor = "crosshair";

    const snappedVisibleLocationCoordinates = (
      event: maplibregl.MapMouseEvent,
    ): [number, number] | null => {
      if (!map.getLayer("locations-hit")) return null;

      const visibleLocationFeatures = map.queryRenderedFeatures(
        [
          [event.point.x - pointSnapRadiusPx, event.point.y - pointSnapRadiusPx],
          [event.point.x + pointSnapRadiusPx, event.point.y + pointSnapRadiusPx],
        ],
        { layers: ["locations-hit"] },
      );

      const nearest = visibleLocationFeatures.reduce<{
        coordinates: [number, number];
        distance: number;
      } | null>((closest, feature) => {
        if (feature.geometry.type !== "Point") return closest;

        const coordinates = normalizeLngLat(feature.geometry.coordinates);
        if (!coordinates) return closest;

        const point = map.project(coordinates);
        const distance = Math.hypot(
          point.x - event.point.x,
          point.y - event.point.y,
        );

        if (distance > pointSnapRadiusPx || (closest && closest.distance <= distance)) {
          return closest;
        }

        return {
          coordinates: [coordinates[0], coordinates[1]],
          distance,
        };
      }, null);

      return nearest?.coordinates ?? null;
    };

    const handleClick = (event: maplibregl.MapMouseEvent) => {
      const [lng, lat] = snappedVisibleLocationCoordinates(event) ?? [
        event.lngLat.lng,
        event.lngLat.lat,
      ];

      onMoveLocationForm({ lat, lng });
      onCancelMovingLocation();
    };

    map.on("click", handleClick);

    return () => {
      map.off("click", handleClick);
      canvas.style.cursor = previousCursor;
    };
  }, [
    isMapReady,
    isMovingLocation,
    locationForm,
    onCancelMovingLocation,
    onMoveLocationForm,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady || !locations || !legs) return;
    const visibleFlights = buildVisibleFlightCollection(legs);

    const addTravelLayers = () => {
      if (!map.getSource("locations")) {
        map.addSource("locations", {
          type: "geojson",
          data: locations,
        });
      } else {
        (map.getSource("locations") as GeoJSONSource).setData(locations);
      }

      if (!map.getSource("legs")) {
        map.addSource("legs", {
          type: "geojson",
          data: legs,
        });

        map.addSource("detailed-legs", {
          type: "geojson",
          data: emptyFeatureCollection,
        });

        map.addSource("flight-lines", {
          type: "geojson",
          data: visibleFlights,
        });

        map.addLayer({
          id: "locations-waypoints",
          type: "circle",
          source: "locations",
          filter: ["==", ["get", "pointtype"], "waypoint"],
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              1,
              4,
              5,
              4.8,
              10,
              6,
            ],
            "circle-color": buildTransportColorExpression(),
            "circle-opacity": 0.82,
            "circle-stroke-width": 0,
          },
        });

        map.addLayer({
          id: "legs-paid-shadow",
          type: "line",
          source: "legs",
          filter: [
            "all",
            ["!=", ["get", "transport"], "plane"],
            ["in", ["get", "transport"], ["literal", paidTransportValues]],
          ],
          maxzoom: detailedLegsMinZoom,
          paint: {
            "line-color": "#12202b",
            "line-opacity": 0.42,
            "line-width": 5.2,
          },
        });

        map.addLayer({
          id: "legs-paid-main",
          type: "line",
          source: "legs",
          filter: [
            "all",
            ["!=", ["get", "transport"], "plane"],
            ["in", ["get", "transport"], ["literal", paidTransportValues]],
          ],
          maxzoom: detailedLegsMinZoom,
          paint: {
            "line-color": buildTransportColorExpression(),
            "line-opacity": 0.92,
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              1,
              4,
              5,
              4.8,
              10,
              6,
            ],
          },
        });

        map.addLayer({
          id: "detailed-legs-paid-shadow",
          type: "line",
          source: "detailed-legs",
          filter: [
            "all",
            ["!=", ["get", "transport"], "plane"],
            ["in", ["get", "transport"], ["literal", paidTransportValues]],
          ],
          minzoom: detailedLegsMinZoom,
          paint: {
            "line-color": "#12202b",
            "line-opacity": 0.46,
            "line-width": 5.8,
          },
        });

        map.addLayer({
          id: "detailed-legs-paid-main",
          type: "line",
          source: "detailed-legs",
          filter: [
            "all",
            ["!=", ["get", "transport"], "plane"],
            ["in", ["get", "transport"], ["literal", paidTransportValues]],
          ],
          minzoom: detailedLegsMinZoom,
          paint: {
            "line-color": buildTransportColorExpression(),
            "line-opacity": 0.96,
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              detailedLegsMinZoom,
              5.4,
              14,
              7,
            ],
          },
        });

        map.addLayer({
          id: "legs-flights",
          type: "line",
          source: "flight-lines",
          paint: {
            "line-color": buildTransportColorExpression(),
            "line-dasharray": [3.2, 2.4],
            "line-opacity": 0.88,
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              1,
              2,
              5,
              2.4,
              10,
              3,
            ],
          },
        });

        map.addLayer({
          id: "legs-free-shadow",
          type: "line",
          source: "legs",
          filter: [
            "all",
            ["!=", ["get", "transport"], "plane"],
            ["in", ["get", "transport"], ["literal", freeTransportValues]],
          ],
          maxzoom: detailedLegsMinZoom,
          paint: {
            "line-color": "#12202b",
            "line-opacity": 0.42,
            "line-width": 5.2,
          },
        });

        map.addLayer({
          id: "legs-free-main",
          type: "line",
          source: "legs",
          filter: [
            "all",
            ["!=", ["get", "transport"], "plane"],
            ["in", ["get", "transport"], ["literal", freeTransportValues]],
          ],
          maxzoom: detailedLegsMinZoom,
          paint: {
            "line-color": buildTransportColorExpression(),
            "line-opacity": 0.92,
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              1,
              4,
              5,
              4.8,
              10,
              6,
            ],
          },
        });

        map.addLayer({
          id: "detailed-legs-free-shadow",
          type: "line",
          source: "detailed-legs",
          filter: [
            "all",
            ["!=", ["get", "transport"], "plane"],
            ["in", ["get", "transport"], ["literal", freeTransportValues]],
          ],
          minzoom: detailedLegsMinZoom,
          paint: {
            "line-color": "#12202b",
            "line-opacity": 0.46,
            "line-width": 5.8,
          },
        });

        map.addLayer({
          id: "detailed-legs-free-main",
          type: "line",
          source: "detailed-legs",
          filter: [
            "all",
            ["!=", ["get", "transport"], "plane"],
            ["in", ["get", "transport"], ["literal", freeTransportValues]],
          ],
          minzoom: detailedLegsMinZoom,
          paint: {
            "line-color": buildTransportColorExpression(),
            "line-opacity": 0.96,
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              detailedLegsMinZoom,
              5.4,
              14,
              7,
            ],
          },
        });

        map.addLayer({
          id: "legs-flights-hit",
          type: "line",
          source: "legs",
          filter: ["==", ["get", "transport"], "plane"],
          paint: {
            "line-color": "#000000",
            "line-opacity": 0.001,
            "line-width": 18,
          },
        });
      } else {
        (map.getSource("legs") as GeoJSONSource).setData(legs);
        if (!map.getSource("detailed-legs")) {
          map.addSource("detailed-legs", {
            type: "geojson",
            data: emptyFeatureCollection,
          });
        }
        if (!map.getSource("flight-lines")) {
          map.addSource("flight-lines", {
            type: "geojson",
            data: visibleFlights,
          });
        } else {
          (map.getSource("flight-lines") as GeoJSONSource).setData(
            visibleFlights,
          );
        }
      }

      if (!map.getLayer("locations-waypoints")) {
        map.addLayer(
          {
            id: "locations-waypoints",
            type: "circle",
            source: "locations",
            filter: ["==", ["get", "pointtype"], "waypoint"],
            paint: {
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                1,
                4,
                5,
                4.8,
                10,
                6,
              ],
              "circle-color": buildTransportColorExpression(),
              "circle-opacity": 0.82,
              "circle-stroke-width": 0,
            },
          },
          map.getLayer("legs-paid-shadow") ? "legs-paid-shadow" : undefined,
        );
      }

      if (!map.getLayer("locations-main")) {
        map.addLayer({
          id: "locations-main",
          type: "circle",
          source: "locations",
          filter: ["==", ["get", "pointtype"], "sleep"],
          paint: {
            "circle-radius": 4.2,
            "circle-color": "#ffd84a",
            "circle-opacity": 0.9,
            "circle-stroke-width": 0,
          },
        });
      }

      if (!map.getLayer("locations-hit")) {
        map.addLayer({
          id: "locations-hit",
          type: "circle",
          source: "locations",
          paint: {
            "circle-radius": 12,
            "circle-color": "#ffffff",
            "circle-opacity": 0.001,
            "circle-stroke-width": 0,
          },
        });
      }

      moveTravelLayersToTop(map);

    };

    addTravelLayers();
  }, [isMapReady, locations, legs]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady || !legs) return;

    let fetchTimeout: number | undefined;
    let abortController: AbortController | null = null;
    let lastRequestKey = "";

    const setDetailedLegs = (data: FeatureCollection) => {
      const source = map.getSource("detailed-legs") as GeoJSONSource | undefined;
      source?.setData(data);
    };

    const clearDetailedLegs = () => {
      abortController?.abort();
      abortController = null;
      lastRequestKey = "";
      setDetailedLegs(emptyFeatureCollection);
    };

    const loadDetailedLegs = () => {
      window.clearTimeout(fetchTimeout);

      fetchTimeout = window.setTimeout(async () => {
        if (!map.getSource("detailed-legs")) return;

        if (map.getZoom() < detailedLegsMinZoom) {
          clearDetailedLegs();
          return;
        }

        const bbox = paddedMapBbox(map);
        if (bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) {
          clearDetailedLegs();
          return;
        }

        const bboxKey = bbox.map((value) => value.toFixed(5)).join(",");
        const simplify = detailedLegsSimplifyForZoom(map.getZoom());
        const requestKey = `${bboxKey}|${simplify ?? "full"}`;
        if (requestKey === lastRequestKey) return;
        lastRequestKey = requestKey;

        abortController?.abort();
        abortController = new AbortController();
        const currentController = abortController;

        const params = new URLSearchParams({
          bbox: bboxKey,
          clip_to_bbox: "true",
          exclude_transport: "plane",
        });
        if (simplify !== null) {
          params.set("simplify", simplify);
        }

        try {
          const response = await fetch(`${API_BASE_URL}/legs?${params}`, {
            signal: currentController.signal,
          });
          if (!response.ok) throw new Error("Detailed legs request failed.");

          const detailedLegs = (await response.json()) as FeatureCollection;
          if (!currentController.signal.aborted) {
            setDetailedLegs(detailedLegs);
          }
        } catch (caught) {
          if (caught instanceof DOMException && caught.name === "AbortError") {
            return;
          }
          console.error(caught);
        }
      }, detailedLegsFetchDelayMs);
    };

    loadDetailedLegs();
    map.on("moveend", loadDetailedLegs);

    return () => {
      window.clearTimeout(fetchTimeout);
      abortController?.abort();
      map.off("moveend", loadDetailedLegs);
    };
  }, [isMapReady, legs]);

  useEffect(() => {
    const map = mapRef.current;
    if (
      !map ||
      !isMapReady ||
      !locations ||
      !legs ||
      !map.getLayer("locations-hit")
    ) {
      return;
    }

    const currentLocations = locations;
    const currentLegs = legs;
    const locationEntryIdForFeature = (feature: GeoJSON.Feature) => {
      const index = currentLocations.features.findIndex(
        (location) => location === feature,
      );
      return timelineEntryId(
        "location",
        feature,
        index === -1 ? undefined : index,
      );
    };
    const legEntryIdForFeature = (feature: GeoJSON.Feature) => {
      const index = currentLegs.features.findIndex((leg) => leg === feature);
      return timelineEntryId("leg", feature, index === -1 ? undefined : index);
    };
    const destinationLocationForLeg = (feature: GeoJSON.Feature) => {
      const endpoints = legEndpoints(feature);
      const destination = endpoints ? normalizeLngLat(endpoints.to) : null;
      if (!destination) return null;

      const legTime = parseTravelDate(feature.properties?.travel_date)?.getTime();
      const candidates: {
        distanceKm: number;
        feature: FeatureCollection["features"][number];
        isSameTime: boolean;
      }[] = [];

      currentLocations.features.forEach((location) => {
          if (location.geometry?.type !== "Point") return null;

          const coordinates = normalizeLngLat(location.geometry.coordinates);
          if (!coordinates) return;

          const distanceKm = positionDistanceKm(destination, coordinates);
          if (distanceKm > 0.1) return;

          const locationTime = parseTravelDate(
            location.properties?.travel_date,
          )?.getTime();

          candidates.push({
            distanceKm,
            feature: location,
            isSameTime: Boolean(
              legTime !== undefined &&
                locationTime !== undefined &&
                legTime === locationTime,
            ),
          });
        });

      candidates.sort((a, b) => {
          if (a.isSameTime !== b.isSameTime) return a.isSameTime ? -1 : 1;
          return a.distanceKm - b.distanceKm;
        });

      return candidates[0]?.feature ?? null;
    };
    const distanceToSegment = (
      point: maplibregl.Point,
      start: maplibregl.Point,
      end: maplibregl.Point,
    ) => {
      const segmentX = end.x - start.x;
      const segmentY = end.y - start.y;
      const lengthSquared = segmentX * segmentX + segmentY * segmentY;
      if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);

      const progress = Math.max(
        0,
        Math.min(
          1,
          ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) /
            lengthSquared,
        ),
      );
      const closestX = start.x + progress * segmentX;
      const closestY = start.y + progress * segmentY;

      return Math.hypot(point.x - closestX, point.y - closestY);
    };
    const isVisibleTransport = (transport: string | null) => {
      if (!isTransportLayerVisible) return false;
      if (selectedTransport) return transport === selectedTransport;
      if (selectedTransportCostGroup === "free") {
        return Boolean(transport && freeTransportModes.has(transport));
      }
      if (selectedTransportCostGroup === "paid") {
        return Boolean(transport && !freeTransportModes.has(transport));
      }
      return true;
    };
    const isVisibleLocation = (feature: GeoJSON.Feature) => {
      const pointType = propertyString(feature.properties, "pointtype");
      if (pointType === "waypoint") {
        const transport = propertyString(feature.properties, "transport");
        return isVisibleTransport(transport);
      }
      if (pointType !== "sleep") return false;
      if (!isSleepLayerVisible) return false;
      const sleepCategory = propertyString(feature.properties, "sleepcategory");
      if (selectedSleepCategory) return sleepCategory === selectedSleepCategory;
      if (selectedSleepCostGroup === "free") {
        return Boolean(sleepCategory && !paidSleepCategories.has(sleepCategory));
      }
      if (selectedSleepCostGroup === "paid") {
        return Boolean(sleepCategory && paidSleepCategories.has(sleepCategory));
      }
      return true;
    };
    const nearestLegForPoint = (point: maplibregl.Point) => {
      return currentLegs.features.reduce<{
        distance: number;
        feature: GeoJSON.Feature;
      } | null>((nearest, feature) => {
        const geometry = feature.geometry;
        if (!geometry) return nearest;
        const transport = propertyString(feature.properties, "transport");
        if (!isVisibleTransport(transport)) return nearest;

        const lines =
          geometry.type === "LineString"
            ? [geometry.coordinates]
            : geometry.type === "MultiLineString"
              ? geometry.coordinates
              : [];

        const distance = lines.reduce((closestDistance, line) => {
          for (let index = 1; index < line.length; index += 1) {
            const [startLng, startLat] = line[index - 1];
            const [endLng, endLat] = line[index];
            const start = map.project([Number(startLng), Number(startLat)]);
            const end = map.project([Number(endLng), Number(endLat)]);
            closestDistance = Math.min(
              closestDistance,
              distanceToSegment(point, start, end),
            );
          }

          return closestDistance;
        }, Number.POSITIVE_INFINITY);

        if (distance > 28 || (nearest && nearest.distance <= distance)) {
          return nearest;
        }

        return { distance, feature };
      }, null);
    };
    const buildLocationCandidate = (
      feature: GeoJSON.Feature,
    ): MapFeatureCandidate => {
      const locationEntryId = locationEntryIdForFeature(feature);
      const properties = feature.properties ?? {};

      return {
        date: parseTravelDate(properties.travel_date),
        key: locationEntryId,
        kind: "location",
        label: propertyString(properties, "name") ?? "Unnamed location",
        targetEntryId: locationEntryId,
        expandEntryId: locationEntryId,
      };
    };

    const canonicalLegFeature = (feature: GeoJSON.Feature) => {
      const recordId = featureRecordId(feature);
      const fromKey = propertyString(feature.properties, "from_key");
      const toKey = propertyString(feature.properties, "to_key");
      const travelDate = propertyString(feature.properties, "travel_date");

      return (
        currentLegs.features.find(
          (leg) => recordId && featureRecordId(leg) === recordId,
        ) ??
        currentLegs.features.find(
          (leg) =>
            fromKey &&
            toKey &&
            travelDate &&
            propertyString(leg.properties, "from_key") === fromKey &&
            propertyString(leg.properties, "to_key") === toKey &&
            propertyString(leg.properties, "travel_date") === travelDate,
        ) ??
        feature
      );
    };

    const buildLegCandidate = (feature: GeoJSON.Feature): MapFeatureCandidate => {
      const legFeature = canonicalLegFeature(feature);
      const destinationLocation = destinationLocationForLeg(legFeature);
      const destinationName = propertyString(legFeature.properties, "to_name");
      const targetEntryId = destinationLocation
        ? locationEntryIdForFeature(destinationLocation)
        : legEntryIdForFeature(legFeature);
      const transport = propertyString(legFeature.properties, "transport");

      return {
        date: parseTravelDate(legFeature.properties?.travel_date),
        key: targetEntryId,
        kind: "leg",
        label: [
          transportLabel(transport),
          destinationName ? `to ${destinationName}` : null,
        ]
          .filter(Boolean)
          .join(" "),
        targetEntryId,
        expandEntryId: destinationLocation ? targetEntryId : undefined,
      };
    };

    const selectCandidate = (candidate: MapFeatureCandidate) => {
      setFeatureChoiceDialog(null);
      onSelectTimelineEntry(candidate.targetEntryId, candidate.expandEntryId);
    };

    const dedupeCandidates = (candidates: MapFeatureCandidate[]) => {
      const seen = new Set<string>();
      return candidates.filter((candidate) => {
        if (seen.has(candidate.key)) return false;
        seen.add(candidate.key);
        return true;
      });
    };

    const selectMapFeature = (event: maplibregl.MapMouseEvent) => {
      if (editableLeg) return;
      if (isPlacingLocation) return;
      if (isMovingLocation) return;

      const nearbyLocations = currentLocations.features.reduce<
        {
          distance: number;
          feature: GeoJSON.Feature;
        }[]
      >((matches, feature) => {
        if (feature.geometry?.type !== "Point") return matches;
        if (!isVisibleLocation(feature)) return matches;
        const [lng, lat] = feature.geometry.coordinates;
        const point = map.project([Number(lng), Number(lat)]);
        const distance = Math.hypot(
          point.x - event.point.x,
          point.y - event.point.y,
        );

        if (distance <= 14) matches.push({ distance, feature });
        return matches;
      }, []);

      const nearestLeg = nearestLegForPoint(event.point);
      const legLayers = visibleLegHitLayerIds.filter((layer) =>
        map.getLayer(layer),
      );
      const renderedLegFeatures =
        legLayers.length > 0
          ? map.queryRenderedFeatures(
              [
                [event.point.x - 18, event.point.y - 18],
                [event.point.x + 18, event.point.y + 18],
              ],
              { layers: legLayers },
            )
          : [];
      const candidates = dedupeCandidates([
        ...nearbyLocations
          .sort((a, b) => a.distance - b.distance)
          .map(({ feature }) => buildLocationCandidate(feature)),
        ...(nearestLeg ? [buildLegCandidate(nearestLeg.feature)] : []),
        ...renderedLegFeatures.map((feature) => buildLegCandidate(feature)),
      ]).sort((a, b) => {
        const aTime = a.date?.getTime() ?? 0;
        const bTime = b.date?.getTime() ?? 0;
        if (aTime !== bTime) return bTime - aTime;
        return a.label.localeCompare(b.label);
      });

      if (candidates.length === 0) {
        setFeatureChoiceDialog(null);
        return;
      }

      if (candidates.length === 1) {
        selectCandidate(candidates[0]);
        return;
      }

      const container = map.getContainer();
      const containerRect = container.getBoundingClientRect();
      const visibleViewport = window.visualViewport;
      const visibleLeft = visibleViewport?.offsetLeft ?? 0;
      const visibleTop = visibleViewport?.offsetTop ?? 0;
      const visibleRight =
        visibleLeft +
        (visibleViewport?.width ?? document.documentElement.clientWidth);
      const visibleBottom =
        visibleTop +
        (visibleViewport?.height ?? document.documentElement.clientHeight);
      const visibleLeftInContainer = Math.max(
        0,
        visibleLeft - containerRect.left,
      );
      const visibleTopInContainer = Math.max(0, visibleTop - containerRect.top);
      const visibleRightInContainer = Math.min(
        containerRect.width,
        visibleRight - containerRect.left,
      );
      const visibleBottomInContainer = Math.min(
        containerRect.height,
        visibleBottom - containerRect.top,
      );
      const availableWidth = Math.max(
        0,
        visibleRightInContainer - visibleLeftInContainer,
      );
      const availableHeight = Math.max(
        0,
        visibleBottomInContainer - visibleTopInContainer,
      );
      const dialogWidth = Math.max(
        120,
        Math.min(
          featureChoicePreferredWidth,
          availableWidth - featureChoiceMargin * 2,
        ),
      );
      const dialogMaxHeight = Math.max(
        96,
        Math.min(
          featureChoicePreferredMaxHeight,
          availableHeight - featureChoiceMargin * 2,
        ),
      );
      const minDialogLeft = visibleLeftInContainer + featureChoiceMargin;
      const minDialogTop = visibleTopInContainer + featureChoiceMargin;
      const maxDialogLeft = Math.max(
        minDialogLeft,
        visibleRightInContainer - dialogWidth - featureChoiceMargin,
      );
      const maxDialogTop = Math.max(
        minDialogTop,
        visibleBottomInContainer - dialogMaxHeight - featureChoiceMargin,
      );
      setFeatureChoiceDialog({
        candidates,
        maxHeight: dialogMaxHeight,
        width: dialogWidth,
        x: Math.min(Math.max(event.point.x, minDialogLeft), maxDialogLeft),
        y: Math.min(Math.max(event.point.y, minDialogTop), maxDialogTop),
      });
    };
    const setPointer = () => {
      if (editableLeg) {
        map.getCanvas().style.cursor = "";
        return;
      }
      if (isPlacingLocation) {
        map.getCanvas().style.cursor = "default";
        return;
      }
      if (isMovingLocation) {
        map.getCanvas().style.cursor = "crosshair";
        return;
      }

      map.getCanvas().style.cursor = "pointer";
    };
    const clearPointer = () => {
      if (editableLeg) {
        map.getCanvas().style.cursor = "";
        return;
      }
      if (isMovingLocation) {
        map.getCanvas().style.cursor = "crosshair";
        return;
      }
      map.getCanvas().style.cursor = isPlacingLocation ? "default" : "";
    };

    map.on("click", selectMapFeature);
    map.on("mouseenter", "locations-hit", setPointer);
    map.on("mouseleave", "locations-hit", clearPointer);
    const pointerLegLayers = visibleLegHitLayerIds.filter((layer) =>
      map.getLayer(layer),
    );
    pointerLegLayers.forEach((layer) => {
      map.on("mouseenter", layer, setPointer);
      map.on("mouseleave", layer, clearPointer);
    });

    return () => {
      map.off("click", selectMapFeature);
      map.off("mouseenter", "locations-hit", setPointer);
      map.off("mouseleave", "locations-hit", clearPointer);
      pointerLegLayers.forEach((layer) => {
        map.off("mouseenter", layer, setPointer);
        map.off("mouseleave", layer, clearPointer);
      });
    };
  }, [
    isMapReady,
    editableLeg,
    isPlacingLocation,
    isMovingLocation,
    isSleepLayerVisible,
    isTransportLayerVisible,
    locations,
    legs,
    onSelectTimelineEntry,
    selectedSleepCategory,
    selectedSleepCostGroup,
    selectedTransport,
    selectedTransportCostGroup,
  ]);

  useEffect(() => {
    setFeatureChoiceDialog(null);
  }, [locations, legs, basemap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const selected = selectedTransport ?? "";
    const visibility = isTransportLayerVisible ? "visible" : "none";
    const paidFilterClauses: maplibregl.ExpressionSpecification[] = [
      ["!=", ["get", "transport"], "plane"],
      ["in", ["get", "transport"], ["literal", paidTransportValues]],
    ];
    const freeFilterClauses: maplibregl.ExpressionSpecification[] = [
      ["!=", ["get", "transport"], "plane"],
      ["in", ["get", "transport"], ["literal", freeTransportValues]],
    ];
    const flightFilterClauses: maplibregl.ExpressionSpecification[] = [[
      "==",
      ["get", "transport"],
      "plane",
    ]];

    const transportFilter = selectedTransport
      ? ([
          "==",
          ["get", "transport"],
          selected,
        ] as maplibregl.ExpressionSpecification)
      : null;
    const groupFilter =
      selectedTransportCostGroup === "free"
        ? ([
            "in",
            ["get", "transport"],
            ["literal", freeTransportValues],
          ] as maplibregl.ExpressionSpecification)
        : selectedTransportCostGroup === "paid"
          ? ([
              "in",
              ["get", "transport"],
              ["literal", paidTransportValues],
            ] as maplibregl.ExpressionSpecification)
          : null;
    const activeFilter = transportFilter ?? groupFilter;
    const combineFilter = (
      baseClauses: maplibregl.ExpressionSpecification[],
    ): maplibregl.FilterSpecification =>
      [
        "all",
        ...baseClauses,
        ...(activeFilter ? [activeFilter] : []),
      ] as maplibregl.FilterSpecification;
    const waypointFilter = combineFilter([
      ["==", ["get", "pointtype"], "waypoint"],
    ]);

    const layerFilters: Partial<
      Record<(typeof legRouteLayerIds)[number], maplibregl.FilterSpecification>
    > = {
      "legs-paid-shadow": combineFilter(paidFilterClauses),
      "legs-paid-main": combineFilter(paidFilterClauses),
      "detailed-legs-paid-shadow": combineFilter(paidFilterClauses),
      "detailed-legs-paid-main": combineFilter(paidFilterClauses),
      "legs-free-shadow": combineFilter(freeFilterClauses),
      "legs-free-main": combineFilter(freeFilterClauses),
      "detailed-legs-free-shadow": combineFilter(freeFilterClauses),
      "detailed-legs-free-main": combineFilter(freeFilterClauses),
      "legs-flights": combineFilter(flightFilterClauses),
      "legs-flights-hit": combineFilter(flightFilterClauses),
    };

    legRouteLayerIds.forEach((layer) => {
      if (!map.getLayer(layer)) return;
      map.setLayoutProperty(layer, "visibility", visibility);
      const filter = layerFilters[layer];
      if (filter) map.setFilter(layer, filter);
    });

    if (map.getLayer("locations-waypoints")) {
      map.setLayoutProperty("locations-waypoints", "visibility", visibility);
      map.setFilter("locations-waypoints", waypointFilter);
    }
  }, [isTransportLayerVisible, selectedTransport, selectedTransportCostGroup]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const sleepVisibility = isSleepLayerVisible ? "visible" : "none";
    const sleepFilterClauses: maplibregl.ExpressionSpecification[] = [
      ["==", ["get", "pointtype"], "sleep"],
    ];

    if (selectedSleepCategory) {
      sleepFilterClauses.push([
        "==",
        ["get", "sleepcategory"],
        selectedSleepCategory,
      ]);
    } else if (selectedSleepCostGroup === "free") {
      sleepFilterClauses.push([
        "in",
        ["get", "sleepcategory"],
        ["literal", freeSleepValues],
      ]);
    } else if (selectedSleepCostGroup === "paid") {
      sleepFilterClauses.push([
        "in",
        ["get", "sleepcategory"],
        ["literal", paidSleepValues],
      ]);
    }

    const sleepFilterExpression = [
      "all",
      ...sleepFilterClauses,
    ] as maplibregl.ExpressionSpecification;
    const sleepFilter =
      sleepFilterExpression as maplibregl.FilterSpecification;

    if (map.getLayer("locations-main")) {
      map.setLayoutProperty("locations-main", "visibility", sleepVisibility);
      map.setFilter("locations-main", sleepFilter);
      map.setPaintProperty("locations-main", "circle-opacity", 0.9);
    }

    if (map.getLayer("locations-hit")) {
      const visiblePointFilters: maplibregl.ExpressionSpecification[] = [];
      if (isTransportLayerVisible) {
        const waypointFilterClauses: maplibregl.ExpressionSpecification[] = [
          ["==", ["get", "pointtype"], "waypoint"],
        ];
        if (selectedTransport) {
          waypointFilterClauses.push([
            "==",
            ["get", "transport"],
            selectedTransport,
          ]);
        } else if (selectedTransportCostGroup === "free") {
          waypointFilterClauses.push([
            "in",
            ["get", "transport"],
            ["literal", freeTransportValues],
          ]);
        } else if (selectedTransportCostGroup === "paid") {
          waypointFilterClauses.push([
            "in",
            ["get", "transport"],
            ["literal", paidTransportValues],
          ]);
        }

        visiblePointFilters.push([
          "all",
          ...waypointFilterClauses,
        ] as maplibregl.ExpressionSpecification);
      }
      if (isSleepLayerVisible) {
        visiblePointFilters.push(sleepFilterExpression);
      }

      map.setFilter(
        "locations-hit",
        visiblePointFilters.length > 0
          ? (["any", ...visiblePointFilters] as maplibregl.FilterSpecification)
          : (["in", ["get", "pointtype"], ["literal", []]] as maplibregl.FilterSpecification),
      );
    }
  }, [
    isSleepLayerVisible,
    isTransportLayerVisible,
    selectedSleepCategory,
    selectedSleepCostGroup,
    selectedTransport,
    selectedTransportCostGroup,
  ]);

  return (
    <section className="map-wrap">
      <div
        ref={mapContainerRef}
        className={isMapLoading ? "map map-loading" : "map"}
      />
      <div className="topbar">
        <div>
          <p className="eyebrow">Danventures</p>
        </div>
      </div>
      {isMapLoading && (
        <div className="map-loading-overlay" role="status" aria-live="polite">
          <span className="map-loading-spinner" aria-hidden="true" />
          <span className="map-loading-label">Loading data</span>
        </div>
      )}
      {error && (
        <div className="status-panel error">
          <span>{error}</span>
        </div>
      )}
      {isPlacingLocation && (
        <div className="placement-panel">
          <MapPinPlus size={18} />
          <span>Click the map to place the new point.</span>
          <button type="button" onClick={onCancelPlacingLocation}>
            <X size={15} />
          </button>
        </div>
      )}
      {isMovingLocation && (
        <div className="placement-panel">
          <Crosshair size={18} />
          <span>Click the map to move this point.</span>
          <button type="button" onClick={onCancelMovingLocation}>
            <X size={15} />
          </button>
        </div>
      )}
      {editableLeg && (
        <div className="leg-edit-panel">
          <Route size={18} />
          <span>Click a segment to add a point, then drag points to reshape.</span>
          <button
            type="button"
            className="leg-edit-cancel"
            onClick={onCancelLegGeometryEdit}
            disabled={isSavingLegGeometry}
          >
            <X size={15} />
            Cancel
          </button>
          <button
            type="button"
            className="leg-edit-save"
            onClick={() => onSaveLegGeometry(editableLeg.id, editableLegCoordinates)}
            disabled={isSavingLegGeometry || editableLegCoordinates.length < 2}
          >
            <Check size={15} />
            {isSavingLegGeometry ? "Saving" : "Save"}
          </button>
        </div>
      )}
      {featureChoiceDialog && (
        <div
          className="feature-choice-dialog"
          role="dialog"
          aria-label="Choose timeline feature"
          style={{
            left: featureChoiceDialog.x,
            maxHeight: featureChoiceDialog.maxHeight,
            top: featureChoiceDialog.y,
            width: featureChoiceDialog.width,
          }}
        >
          <div className="feature-choice-heading">
            <span>Choose date</span>
            <button
              type="button"
              aria-label="Close feature choices"
              onClick={() => setFeatureChoiceDialog(null)}
            >
              <X size={14} />
            </button>
          </div>
          <div className="feature-choice-list">
            {featureChoiceDialog.candidates.map((candidate) => (
              <button
                type="button"
                className="feature-choice-option"
                key={candidate.key}
                onClick={() => {
                  setFeatureChoiceDialog(null);
                  onSelectTimelineEntry(
                    candidate.targetEntryId,
                    candidate.expandEntryId,
                  );
                }}
              >
                <span className={`feature-choice-icon ${candidate.kind}`}>
                  {candidate.kind === "location" ? (
                    <MapPin size={14} />
                  ) : (
                    <Route size={14} />
                  )}
                </span>
                <span className="feature-choice-text">
                  <strong>{formatTimelineDateTime(candidate.date)}</strong>
                  <span>{candidate.label}</span>
                </span>
                <CalendarDays size={14} />
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
