import type { FilterSpecification, StyleSpecification, SymbolLayerSpecification, ExpressionSpecification } from "maplibre-gl";
import type { FeatureCollection } from "./types";

export const journeyPalette = {
  land: "#f8f9f3",
  water: "#eef4f2",
  visited: "#dce7d5",
  border: "#b6c7b6",
  text: "#355b3d",
};

const emptyCountries: FeatureCollection = { type: "FeatureCollection", features: [] };
const placeName: ExpressionSpecification = [
  "coalesce", ["get", "name:en"], ["get", "name_en"], ["get", "name:latin"], ["get", "name"],
];

// Public geographic stops from the carousel. Home and host names stay in the timeline.
const importantStops = [
  { name: "Reykjavík", lng: -21.94, lat: 64.146 },
  { name: "Brest", lng: -4.488, lat: 48.377 },
  { name: "Baiona", lng: -8.846, lat: 42.122 },
  { name: "Barcelona", lng: 2.148, lat: 41.410 },
  { name: "Berlin", lng: 13.45, lat: 52.55 },
  { name: "Malmö", lng: 13.01, lat: 55.59 },
  { name: "Ceuta", lng: -5.314, lat: 35.89 },
  { name: "Santa Cruz de Tenerife", lng: -16.244, lat: 28.467 },
  { name: "Las Palmas", lng: -15.429, lat: 28.129 },
  { name: "Mindelo", lng: -24.995, lat: 16.887 },
  { name: "Dakar", lng: -17.36, lat: 14.75 },
  { name: "Nouakchott", lng: -15.99, lat: 18.085 },
  { name: "Dakhla", lng: -15.916, lat: 23.735 },
  { name: "Bogotá", lng: -74.0965, lat: 4.642 },
  { name: "Caracas", lng: -66.911, lat: 10.496 },
  { name: "Manaus", lng: -60.027, lat: -3.138 },
  { name: "Lima", lng: -77.036, lat: -12.060 },
  { name: "Cusco", lng: -71.965, lat: -13.526 },
  { name: "Santiago", lng: -70.63, lat: -33.44 },
  { name: "Ushuaia", lng: -68.298, lat: -54.799 },
];

export function importantTripStops(locations: FeatureCollection | null): FeatureCollection {
  const points = locations?.features.flatMap(({ geometry }) => geometry.type === "Point" ? [geometry.coordinates] : []) ?? [];
  return {
    type: "FeatureCollection",
    features: importantStops.filter(({ lng, lat }) => points.some(([x, y]) => {
      const dx = (x - lng) * Math.cos(lat * Math.PI / 180);
      return Math.hypot(dx, y - lat) * 111.2 < 18;
    })).map(({ name, lng, lat }, priority) => ({
      type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties: { name, priority },
    })),
  };
}

// Use public map labels near recorded stops, never private names from the trip log.
// Merge adjacent grid cells into strips to keep the spatial filter small.
export function tripLabelArea(locations: FeatureCollection | null): GeoJSON.MultiPolygon {
  const cellSize = 0.25;
  const rows = new Map<number, Set<number>>();
  locations?.features.forEach(({ geometry }) => {
    if (geometry.type !== "Point") return;
    const [lng, lat] = geometry.coordinates;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    const column = Math.floor(lng / cellSize);
    const row = Math.floor(lat / cellSize);
    for (let dy = -1; dy <= 1; dy += 1) {
      const columns = rows.get(row + dy) ?? new Set<number>();
      for (let dx = -1; dx <= 1; dx += 1) columns.add(column + dx);
      rows.set(row + dy, columns);
    }
  });
  const coordinates: GeoJSON.Position[][][] = [];
  rows.forEach((columns, row) => {
    const sorted = [...columns].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i += 1) {
      const start = sorted[i];
      let end = start;
      while (i + 1 < sorted.length && sorted[i + 1] === end + 1) end = sorted[++i];
      const west = Math.max(-180, start * cellSize);
      const east = Math.min(180, (end + 1) * cellSize);
      const south = Math.max(-85, row * cellSize);
      const north = Math.min(85, (row + 1) * cellSize);
      if (west >= east || south >= north) continue;
      coordinates.push([[[west, south], [east, south], [east, north], [west, north], [west, south]]]);
    }
  });
  return { type: "MultiPolygon", coordinates };
}

export const journeyPlaceLevels = [
  { name: "city", zoom: 4, size: 13 },
  { name: "town", zoom: 7, size: 12 },
  { name: "village", zoom: 10, size: 11 },
  { name: "hamlet", zoom: 13, size: 11 },
] as const;

export function tripPlaceFilter(name: string, area: GeoJSON.MultiPolygon): FilterSpecification {
  return ["all", ["==", ["get", "class"], name],
    ["!=", placeName, "Wald"],
    area.coordinates.length ? ["within", area] : ["==", ["get", "class"], "__no_trip_locations__"],
  ];
}

export function createJourneyMapStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      openmaptiles: { type: "vector", url: "https://tiles.openfreemap.org/planet" },
      "journey-countries": {
        type: "geojson", data: emptyCountries,
        attribution: "Country outlines: Natural Earth", tolerance: 0.5,
      },
      "journey-stops": { type: "geojson", data: emptyCountries },
    },
    layers: [
      { id: "journey-background", type: "background", paint: { "background-color": journeyPalette.land } },
      { id: "journey-visited", type: "fill", source: "journey-countries", paint: { "fill-color": journeyPalette.visited } },
      {
        id: "journey-water", type: "fill", source: "openmaptiles", "source-layer": "water",
        filter: ["!=", ["get", "brunnel"], "tunnel"], paint: { "fill-color": journeyPalette.water },
      },
      {
        id: "journey-rivers", type: "line", source: "openmaptiles", "source-layer": "waterway", minzoom: 8,
        filter: ["==", ["get", "class"], "river"],
        paint: { "line-color": "#d1e1df", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 15, 2] },
      },
      {
        id: "journey-borders", type: "line", source: "openmaptiles", "source-layer": "boundary",
        filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1], ["!=", ["get", "disputed"], 1]],
        paint: { "line-color": journeyPalette.border, "line-width": 0.8 },
      },
      {
        id: "journey-disputed-borders", type: "line", source: "openmaptiles", "source-layer": "boundary",
        filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1], ["==", ["get", "disputed"], 1]],
        paint: { "line-color": journeyPalette.border, "line-width": 0.8, "line-dasharray": [3, 3] },
      },
      {
        id: "journey-local-roads", type: "line", source: "openmaptiles", "source-layer": "transportation", minzoom: 11,
        filter: ["match", ["get", "class"], ["motorway", "trunk", "primary", "secondary", "tertiary", "minor"], true, false],
        paint: { "line-color": "#c9d3c4", "line-opacity": 0.65, "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.4, 16, 1.5] },
      },
      {
        id: "journey-country-labels", type: "symbol", source: "openmaptiles", "source-layer": "place", minzoom: 1, maxzoom: 7,
        filter: ["all", ["==", ["get", "class"], "country"], ["!=", placeName, "Switzerland"]],
        layout: {
          "text-field": placeName, "text-font": ["Noto Sans Regular"], "text-transform": "uppercase",
          "text-size": ["interpolate", ["linear"], ["zoom"], 1, 10, 5, 14],
          "text-letter-spacing": 0.08, "text-padding": 12,
          "symbol-sort-key": ["coalesce", ["get", "rank"], 10],
        },
        paint: { "text-color": "#75877b", "text-halo-color": journeyPalette.land, "text-halo-width": 1.5 },
      },
      ...journeyPlaceLevels.map<SymbolLayerSpecification>(({ name, zoom, size }) => ({
        id: `journey-place-${name}`, type: "symbol" as const,
        source: "openmaptiles", "source-layer": "place", minzoom: zoom,
        filter: tripPlaceFilter(name, { type: "MultiPolygon", coordinates: [] }),
        layout: {
          "text-field": placeName, "text-font": ["Noto Sans Regular"],
          "text-size": size, "text-padding": 8, "text-max-width": 8,
          "text-anchor": "bottom" as const, "text-offset": [0, -0.7],
          "symbol-sort-key": ["coalesce", ["get", "rank"], 100] as ExpressionSpecification,
        },
        paint: { "text-color": journeyPalette.text, "text-halo-color": journeyPalette.land, "text-halo-width": 1.5 },
      })),
      {
        id: "journey-stop-dots", type: "circle", source: "journey-stops", minzoom: 2,
        paint: { "circle-radius": 3, "circle-color": journeyPalette.text, "circle-stroke-color": journeyPalette.land, "circle-stroke-width": 1.5 },
      },
      {
        id: "journey-stop-labels", type: "symbol", source: "journey-stops", minzoom: 2,
        layout: {
          "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 2, 11, 4, 12, 8, 15],
          "text-variable-anchor": ["top-left", "bottom-left", "top-right", "bottom-right"],
          "text-radial-offset": 0.7, "text-padding": 8, "text-max-width": 9,
          "symbol-sort-key": ["get", "priority"],
        },
        paint: { "text-color": journeyPalette.text, "text-halo-color": journeyPalette.land, "text-halo-width": 2 },
      },
    ],
  };
}
