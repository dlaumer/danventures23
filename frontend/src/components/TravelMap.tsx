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
  MAP_STYLE_URL,
} from "../constants";
import type { FeatureCollection, LocationFormState } from "../types";
import {
  addFeatureCoordinatesToBounds,
  buildEmptyLocationForm,
  buildTransportColorExpression,
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
  onCancelPlacingLocation: () => void;
  onMapError: (message: string) => void;
  onNewLocationForm: (form: LocationFormState) => void;
  onSelectTimelineEntry: (id: string) => void;
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
  onCancelPlacingLocation,
  onMapError,
  onNewLocationForm,
  onSelectTimelineEntry,
}: TravelMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const isMapReadyRef = useRef(false);
  const [isMapReady, setIsMapReady] = useState(false);


  const refitMap = useCallback(() => {
    if (!legs || !mapRef.current) return;

    const bounds = new LngLatBounds();
    legs.features.forEach((feature) =>
      addFeatureCoordinatesToBounds(feature.geometry, bounds),
    );
    if (!bounds.isEmpty()) {
      mapRef.current.fitBounds(bounds, {
        padding: 44,
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
        const styleResponse = await fetch(MAP_STYLE_URL);
        if (!styleResponse.ok) throw new Error("Map style request failed.");
        const style = (await styleResponse.json()) as maplibregl.StyleSpecification;

        if (!isMounted || !mapContainerRef.current || mapRef.current) return;

        mapRef.current = new maplibregl.Map({
          container: mapContainerRef.current,
          style: {
            ...style,
            projection: { type: "globe" },
            sky: globeSky,
          },
          center: [-15, 20],
          zoom: 1.25,
          bearing: -18,
          pitch: 12,
          maxPitch: 85,
          renderWorldCopies: false,
        });
        window.danventuresMap = mapRef.current;

        mapRef.current.addControl(
          new maplibregl.NavigationControl({ visualizePitch: true }),
          "bottom-right",
        );
        mapRef.current.addControl(
          new maplibregl.AttributionControl({ compact: true }),
          "bottom-left",
        );
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
  }, [onMapError]);

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
            "circle-opacity": 0.01,
            "circle-stroke-width": 0,
          },
        });
      }

      if (map.getLayer("draft-location")) {
        map.moveLayer("draft-location");
      }

      const bounds = new LngLatBounds();
      legs.features.forEach((feature) =>
        addFeatureCoordinatesToBounds(feature.geometry, bounds),
      );

      if (isInitialDataRender && !bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 44, duration: 900, maxZoom: 3.2 });
      }
    };

    addTravelLayers();
  }, [isMapReady, locations, legs]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady || !map.getLayer("locations-hit")) {
      return;
    }

    const selectLocation = (event: maplibregl.MapLayerMouseEvent) => {
      if (isPlacingLocation) return;
      const feature = event.features?.[0];
      if (!feature) return;

      onSelectTimelineEntry(timelineEntryId("location", feature));
    };
    const selectLeg = (event: maplibregl.MapLayerMouseEvent) => {
      if (isPlacingLocation) return;
      const feature = event.features?.[0];
      if (!feature) return;

      onSelectTimelineEntry(timelineEntryId("leg", feature));
    };
    const setPointer = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const clearPointer = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("click", "locations-hit", selectLocation);
    map.on("mouseenter", "locations-hit", setPointer);
    map.on("mouseleave", "locations-hit", clearPointer);
    map.on("click", "legs-main", selectLeg);
    map.on("mouseenter", "legs-main", setPointer);
    map.on("mouseleave", "legs-main", clearPointer);
    if (map.getLayer("legs-flights")) {
      map.on("click", "legs-flights", selectLeg);
      map.on("mouseenter", "legs-flights", setPointer);
      map.on("mouseleave", "legs-flights", clearPointer);
    }

    return () => {
      map.off("click", "locations-hit", selectLocation);
      map.off("mouseenter", "locations-hit", setPointer);
      map.off("mouseleave", "locations-hit", clearPointer);
      map.off("click", "legs-main", selectLeg);
      map.off("mouseenter", "legs-main", setPointer);
      map.off("mouseleave", "legs-main", clearPointer);
      if (map.getLayer("legs-flights")) {
        map.off("click", "legs-flights", selectLeg);
        map.off("mouseenter", "legs-flights", setPointer);
        map.off("mouseleave", "legs-flights", clearPointer);
      }
    };
  }, [isMapReady, isPlacingLocation, locations, onSelectTimelineEntry]);

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
