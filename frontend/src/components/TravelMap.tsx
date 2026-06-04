import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl, {
  GeoJSONSource,
  LngLatBounds,
  Map as MapLibreMap,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CalendarDays, MapPin, MapPinPlus, Route, X } from "lucide-react";
import {
  freeTransportModes,
  paidSleepCategories,
  sleepCategoryOptions,
  transportOptions,
  globeSky,
  IMAGERY_MAP_STYLE,
  type MapBasemap,
  MAP_STYLE_URL,
} from "../constants";
import type {
  FeatureCollection,
  LocationFormState,
  TimelineMapPosition,
} from "../types";
import {
  addFeatureCoordinatesToBounds,
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
  locations: FeatureCollection | null;
  focusedLocation: { lat: number; lng: number; signal: number } | null;
  timelinePosition: TimelineMapPosition | null;
  fitMapSignal: number;
  selectedTransport: string | null;
  selectedTransportCostGroup: "free" | "paid" | null;
  selectedSleepCategory: string | null;
  selectedSleepCostGroup: "free" | "paid" | null;
  basemap: MapBasemap;
  onCancelPlacingLocation: () => void;
  onMapError: (message: string) => void;
  onNewLocationForm: (form: LocationFormState) => void;
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
  "flight-lines",
  "locations",
  "draft-location",
] as const;
const travelLayerIds = [
  "locations-waypoints",
  "legs-shadow",
  "legs-main",
  "legs-flights",
  "legs-flights-hit",
  "locations-main",
  "locations-hit",
  "draft-location",
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
  x: number;
  y: number;
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

function createTimelineMarkerElement() {
  const element = document.createElement("div");
  element.className = "timeline-map-marker";
  element.setAttribute("aria-hidden", "true");

  const core = document.createElement("span");
  element.append(core);

  return element;
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

function getMapFitPadding(): maplibregl.PaddingOptions {
  const defaultPadding = { top: 44, right: 44, bottom: 180, left: 44 };

  if (typeof window === "undefined") return defaultPadding;

  if (window.matchMedia("(max-width: 560px)").matches) {
    return { top: 132, right: 32, bottom: 206, left: 32 };
  }

  if (window.matchMedia("(max-width: 900px)").matches) {
    return { top: 106, right: 32, bottom: 198, left: 32 };
  }

  return defaultPadding;
}

function getMapFocusOffset(): [number, number] {
  if (typeof window === "undefined") return [0, -70];

  if (window.matchMedia("(max-width: 560px)").matches) return [0, -92];
  if (window.matchMedia("(max-width: 900px)").matches) return [0, -84];
  return [0, -70];
}

export function TravelMap({
  error,
  isLoading,
  isPlacingLocation,
  legs,
  locationForm,
  locations,
  focusedLocation,
  timelinePosition,
  fitMapSignal,
  selectedTransport,
  selectedTransportCostGroup,
  selectedSleepCategory,
  selectedSleepCostGroup,
  basemap,
  onCancelPlacingLocation,
  onMapError,
  onNewLocationForm,
  onSelectTimelineEntry,
}: TravelMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const timelineMarkerRef = useRef<maplibregl.Marker | null>(null);
  const isMapReadyRef = useRef(false);
  const initialBasemapRef = useRef(basemap);
  const [isMapReady, setIsMapReady] = useState(false);
  const [featureChoiceDialog, setFeatureChoiceDialog] =
    useState<FeatureChoiceDialog | null>(null);
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

  const refitMap = useCallback(() => {
    if (!legs || !mapRef.current) return;

    const bounds = new LngLatBounds();
    legs.features.forEach((feature) =>
      addFeatureCoordinatesToBounds(feature.geometry, bounds),
    );
    if (!bounds.isEmpty()) {
      mapRef.current.fitBounds(bounds, {
        padding: getMapFitPadding(),
        duration: 800,
        maxZoom: 3.2,
      });
    }
  }, [legs]);

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
          center: [-10, 40],
          zoom: 2,
          bearing: -18,
          pitch: 12,
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
        timelineMarkerRef.current?.remove();
        timelineMarkerRef.current = null;
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

    moveTravelLayersToTop(map);
  }, [isMapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady) return;

    const coordinates = normalizeLngLat(
      coordinateForTimelinePosition(timelinePosition, locations, legs),
    );

    if (!coordinates) {
      timelineMarkerRef.current?.remove();
      timelineMarkerRef.current = null;
    } else {
      if (!timelineMarkerRef.current) {
        timelineMarkerRef.current = new maplibregl.Marker({
          element: createTimelineMarkerElement(),
          offset: [0, 0],
        });
      }

      timelineMarkerRef.current.setLngLat(coordinates).addTo(map);
    }
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
    if (!fitMapSignal) return;
    refitMap();
  }, [fitMapSignal, refitMap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady || !isPlacingLocation) return;

    setFeatureChoiceDialog(null);

    const canvas = map.getCanvas();
    const previousCursor = canvas.style.cursor;
    canvas.style.cursor = "crosshair";

    const handleClick = (event: maplibregl.MapMouseEvent) => {
      onNewLocationForm(
        buildEmptyLocationForm(event.lngLat.lng, event.lngLat.lat, locations),
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
    if (!map || !isMapReady || !locations || !legs) return;
    const visibleFlights = buildVisibleFlightCollection(legs);

    const addTravelLayers = () => {
      if (!map.getSource("legs")) {
        map.addSource("legs", {
          type: "geojson",
          data: legs,
        });

        map.addSource("flight-lines", {
          type: "geojson",
          data: visibleFlights,
        });

        map.addLayer({
          id: "legs-shadow",
          type: "line",
          source: "legs",
          filter: ["!=", ["get", "transport"], "plane"],
          paint: {
            "line-color": "#12202b",
            "line-opacity": 0.42,
            "line-width": 5.2,
          },
        });

        map.addLayer({
          id: "legs-main",
          type: "line",
          source: "legs",
          filter: ["!=", ["get", "transport"], "plane"],
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

      if (!map.getSource("locations")) {
        map.addSource("locations", {
          type: "geojson",
          data: locations,
        });
      } else {
        (map.getSource("locations") as GeoJSONSource).setData(locations);
      }

      if (!map.getLayer("locations-main")) {
        map.addLayer({
          id: "locations-main",
          type: "circle",
          source: "locations",
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              1,
              [
                "case",
                ["==", ["get", "pointtype"], "sleep"],
                4.2,
                2.4,
              ],
              5,
              [
                "case",
                ["==", ["get", "pointtype"], "sleep"],
                4.2,
                2.7,
              ],
              10,
              [
                "case",
                ["==", ["get", "pointtype"], "sleep"],
                4.2,
                3.4,
              ],
            ],
            "circle-color": [
              "case",
              ["==", ["get", "pointtype"], "sleep"],
              "#ffd84a",
              buildTransportColorExpression(),
            ],
            "circle-opacity": [
              ...locationCircleOpacityExpression,
            ],
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

      const bounds = new LngLatBounds();
      legs.features.forEach((feature) =>
        addFeatureCoordinatesToBounds(feature.geometry, bounds),
      );

    };

    addTravelLayers();
  }, [isMapReady, locations, legs]);

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
    const nearestLegForPoint = (point: maplibregl.Point) => {
      return currentLegs.features.reduce<{
        distance: number;
        feature: GeoJSON.Feature;
      } | null>((nearest, feature) => {
        const geometry = feature.geometry;
        if (!geometry) return nearest;

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
      if (isPlacingLocation) return;

      const nearbyLocations = currentLocations.features.reduce<
        {
          distance: number;
          feature: GeoJSON.Feature;
        }[]
      >((matches, feature) => {
        if (feature.geometry?.type !== "Point") return matches;
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
      const legLayers = ["legs-main", "legs-flights-hit"].filter((layer) =>
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
      const maxDialogLeft = Math.max(14, container.clientWidth - 294);
      const maxDialogTop = Math.max(14, container.clientHeight - 244);
      setFeatureChoiceDialog({
        candidates,
        x: Math.min(Math.max(event.point.x, 14), maxDialogLeft),
        y: Math.min(Math.max(event.point.y, 14), maxDialogTop),
      });
    };
    const setPointer = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const clearPointer = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("click", selectMapFeature);
    map.on("mouseenter", "locations-hit", setPointer);
    map.on("mouseleave", "locations-hit", clearPointer);
    map.on("mouseenter", "legs-main", setPointer);
    map.on("mouseleave", "legs-main", clearPointer);
    const hasFlightHitLayer = Boolean(map.getLayer("legs-flights-hit"));
    if (hasFlightHitLayer) {
      map.on("mouseenter", "legs-flights-hit", setPointer);
      map.on("mouseleave", "legs-flights-hit", clearPointer);
    }

    return () => {
      map.off("click", selectMapFeature);
      map.off("mouseenter", "locations-hit", setPointer);
      map.off("mouseleave", "locations-hit", clearPointer);
      map.off("mouseenter", "legs-main", setPointer);
      map.off("mouseleave", "legs-main", clearPointer);
      if (hasFlightHitLayer) {
        map.off("mouseenter", "legs-flights-hit", setPointer);
        map.off("mouseleave", "legs-flights-hit", clearPointer);
      }
    };
  }, [isMapReady, isPlacingLocation, locations, legs, onSelectTimelineEntry]);

  useEffect(() => {
    setFeatureChoiceDialog(null);
  }, [locations, legs, basemap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("legs-main")) return;

    const selected = selectedTransport ?? "";
    const groupTransports =
      selectedTransportCostGroup === "free"
        ? freeTransportValues
        : selectedTransportCostGroup === "paid"
          ? paidTransportValues
          : [];

    if (!selectedTransport && !selectedTransportCostGroup) {
      map.setPaintProperty("legs-main", "line-opacity", 0.78);
      map.setPaintProperty("legs-main", "line-width", [
        "interpolate",
        ["linear"],
        ["zoom"],
        1,
        4,
        5,
        4.8,
        10,
        6,
      ]);
      if (map.getLayer("legs-flights")) {
        map.setPaintProperty("legs-flights", "line-opacity", 0.88);
        map.setPaintProperty("legs-flights", "line-width", [
          "interpolate",
          ["linear"],
          ["zoom"],
          1,
          2,
          5,
          2.4,
          10,
          3,
        ]);
      }
      map.setPaintProperty("legs-shadow", "line-opacity", 0.28);
      return;
    }

    map.setPaintProperty("legs-main", "line-opacity", [
      "case",
      selectedTransport
        ? ["==", ["get", "transport"], selected]
        : ["in", ["get", "transport"], ["literal", groupTransports]],
      0.98,
      0.09,
    ]);
    map.setPaintProperty("legs-main", "line-width", [
      "case",
      selectedTransport
        ? ["==", ["get", "transport"], selected]
        : ["in", ["get", "transport"], ["literal", groupTransports]],
      5.2,
      1.1,
    ]);
    if (map.getLayer("legs-flights")) {
      map.setPaintProperty("legs-flights", "line-opacity", [
        "case",
        selectedTransport
          ? ["==", ["get", "transport"], selected]
          : ["in", ["get", "transport"], ["literal", groupTransports]],
        0.95,
        0.08,
      ]);
      map.setPaintProperty("legs-flights", "line-width", [
        "case",
        selectedTransport
          ? ["==", ["get", "transport"], selected]
          : ["in", ["get", "transport"], ["literal", groupTransports]],
        3,
        1,
      ]);
    }
    map.setPaintProperty("legs-shadow", "line-opacity", 0.08);
  }, [selectedTransport, selectedTransportCostGroup]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("locations-main")) return;

    const groupSleepCategories =
      selectedSleepCostGroup === "free"
        ? freeSleepValues
        : selectedSleepCostGroup === "paid"
          ? paidSleepValues
          : [];

    if (!selectedSleepCategory && !selectedSleepCostGroup) {
      map.setPaintProperty(
        "locations-main",
        "circle-opacity",
        locationCircleOpacityExpression,
      );
      return;
    }

    map.setPaintProperty("locations-main", "circle-opacity", [
      "case",
      selectedSleepCategory
        ? ["==", ["get", "sleepcategory"], selectedSleepCategory]
        : ["in", ["get", "sleepcategory"], ["literal", groupSleepCategories]],
      0.96,
      0.08,
    ]);
  }, [selectedSleepCategory, selectedSleepCostGroup]);

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
      {featureChoiceDialog && (
        <div
          className="feature-choice-dialog"
          role="dialog"
          aria-label="Choose timeline feature"
          style={{
            left: featureChoiceDialog.x,
            top: featureChoiceDialog.y,
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
