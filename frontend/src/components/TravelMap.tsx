import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl, {
  GeoJSONSource,
  LngLatBounds,
  Map as MapLibreMap,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapPinPlus, Route, X } from "lucide-react";
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
import type { FeatureCollection, LocationFormState } from "../types";
import {
  addFeatureCoordinatesToBounds,
  buildEmptyLocationForm,
  buildTransportColorExpression,
  featureRecordId,
  propertyString,
  timelineEntryId,
} from "../utils";

type TravelMapProps = {
  error: string | null;
  isLoading: boolean;
  isPlacingLocation: boolean;
  legs: FeatureCollection | null;
  locationForm: LocationFormState | null;
  locations: FeatureCollection | null;
  focusedLocation: { lat: number; lng: number; signal: number } | null;
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
const travelSourceIds = ["legs", "locations", "draft-location"] as const;
const travelLayerIds = [
  "legs-shadow",
  "legs-main",
  "legs-flights",
  "locations-main",
  "locations-hit",
  "draft-location",
] as const;

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

function getMapFitPadding(): maplibregl.PaddingOptions {
  const defaultPadding = { top: 44, right: 44, bottom: 44, left: 44 };

  if (typeof window === "undefined") return defaultPadding;

  if (window.matchMedia("(max-width: 560px)").matches) {
    return { top: 132, right: 32, bottom: 122, left: 32 };
  }

  if (window.matchMedia("(max-width: 900px)").matches) {
    return { top: 106, right: 32, bottom: 116, left: 32 };
  }

  return defaultPadding;
}

export function TravelMap({
  error,
  isLoading,
  isPlacingLocation,
  legs,
  locationForm,
  locations,
  focusedLocation,
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
  const isMapReadyRef = useRef(false);
  const hasFitInitialDataRef = useRef(false);
  const initialBasemapRef = useRef(basemap);
  const [isMapReady, setIsMapReady] = useState(false);

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
          center: [10, 50],
          zoom: 1.25,
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

    const resizeMap = () => map.resize();
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
      zoom: Math.max(map.getZoom(), 6),
    });
  }, [focusedLocation, isMapReady]);

  useEffect(() => {
    if (!fitMapSignal) return;
    refitMap();
  }, [fitMapSignal, refitMap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady || !isPlacingLocation) return;

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

    const addTravelLayers = () => {
      const isInitialDataRender = !map.getSource("legs");

      if (!map.getSource("legs")) {
        map.addSource("legs", {
          type: "geojson",
          data: legs,
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
          source: "legs",
          filter: ["==", ["get", "transport"], "plane"],
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
      } else {
        (map.getSource("legs") as GeoJSONSource).setData(legs);
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

      const bounds = new LngLatBounds();
      legs.features.forEach((feature) =>
        addFeatureCoordinatesToBounds(feature.geometry, bounds),
      );

      if (isInitialDataRender && !hasFitInitialDataRef.current && !bounds.isEmpty()) {
        hasFitInitialDataRef.current = true;
        map.fitBounds(bounds, {
          padding: getMapFitPadding(),
          duration: 900,
          maxZoom: 3.2,
        });
      }
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
    const selectLocationFeature = (feature: GeoJSON.Feature) => {
      const locationEntryId = timelineEntryId("location", feature);
      onSelectTimelineEntry(locationEntryId, locationEntryId);
    };
    const selectLegFeature = (feature: GeoJSON.Feature) => {
      const destinationLocationId = propertyString(feature.properties, "to_key");
      const destinationName = propertyString(feature.properties, "to_name");
      const destinationLocation =
        currentLocations.features.find(
          (location) => featureRecordId(location) === destinationLocationId,
        ) ??
        currentLocations.features.find(
          (location) =>
            destinationName &&
            propertyString(location.properties, "name") === destinationName,
        );
      const destinationEntryId =
        (destinationLocation ? featureRecordId(destinationLocation) : null) ??
        destinationLocationId;

      onSelectTimelineEntry(
        destinationEntryId
          ? `location:${destinationEntryId}`
          : timelineEntryId("leg", feature),
        destinationEntryId ? `location:${destinationEntryId}` : undefined,
      );
    };
    const selectMapFeature = (event: maplibregl.MapMouseEvent) => {
      if (isPlacingLocation) return;

      const nearestLocation = currentLocations.features.reduce<{
        distance: number;
        feature: GeoJSON.Feature;
      } | null>((nearest, feature) => {
        if (feature.geometry?.type !== "Point") return nearest;
        const [lng, lat] = feature.geometry.coordinates;
        const point = map.project([Number(lng), Number(lat)]);
        const distance = Math.hypot(
          point.x - event.point.x,
          point.y - event.point.y,
        );

        if (distance > 14 || (nearest && nearest.distance <= distance)) {
          return nearest;
        }

        return { distance, feature };
      }, null);

      if (nearestLocation) {
        selectLocationFeature(nearestLocation.feature);
        return;
      }

      const nearestLeg = nearestLegForPoint(event.point);
      if (nearestLeg) {
        selectLegFeature(nearestLeg.feature);
        return;
      }

      const legLayers = ["legs-main", "legs-flights"].filter((layer) =>
        map.getLayer(layer),
      );
      if (legLayers.length === 0) return;

      const legFeature = map.queryRenderedFeatures(
        [
          [event.point.x - 18, event.point.y - 18],
          [event.point.x + 18, event.point.y + 18],
        ],
        { layers: legLayers },
      )[0];

      if (legFeature) selectLegFeature(legFeature);
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
    if (map.getLayer("legs-flights")) {
      map.on("mouseenter", "legs-flights", setPointer);
      map.on("mouseleave", "legs-flights", clearPointer);
    }

    return () => {
      map.off("click", selectMapFeature);
      map.off("mouseenter", "locations-hit", setPointer);
      map.off("mouseleave", "locations-hit", clearPointer);
      map.off("mouseenter", "legs-main", setPointer);
      map.off("mouseleave", "legs-main", clearPointer);
      if (map.getLayer("legs-flights")) {
        map.off("mouseenter", "legs-flights", setPointer);
        map.off("mouseleave", "legs-flights", clearPointer);
      }
    };
  }, [isMapReady, isPlacingLocation, locations, legs, onSelectTimelineEntry]);

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
      map.setPaintProperty("locations-main", "circle-opacity", 0.9);
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
      <div ref={mapContainerRef} className="map" />
      <div className="topbar">
        <div>
          <p className="eyebrow">Danventures</p>
        </div>
      </div>
      {isLoading && (
        <div className="status-panel">
          <Route size={18} />
          <span>Loading routes and stops</span>
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
    </section>
  );
}
