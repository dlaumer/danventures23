import maplibregl from "maplibre-gl";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export const globeSky: maplibregl.SkySpecification = {
  "atmosphere-blend": [
    "interpolate",
    ["linear"],
    ["zoom"],
    0,
    0.9,
    5,
    0.4,
  ],
  "horizon-color": "#d8efe9",
  "sky-color": "#8fb9d4",
  "sky-horizon-blend": 0.85,
};

export const transportOptions = [
  "car",
  "boat",
  "bus",
  "truck",
  "rentalCar",
  "plane",
  "train",
  "foot",
  "taxi",
  "ferry",
  "friends",
  "bike",
];

export const sleepCategoryOptions = [
  "camping",
  "campingPaid",
  "couchsurfing",
  "boat",
  "house",
  "airbnb",
  "hostel",
  "renting",
  "volunteering",
  "friends",
];

export const transportColors: Record<string, string> = {
  car: "#68a7ff",
  truck: "#6ed6f1",
  friends: "#79a6ff",
  boat: "#ff7373",
  foot: "#ff4bd8",
  bike: "#f300ff",
  plane: "#050505",
  rentalCar: "#ffea00",
  ferry: "#ff9f00",
  taxi: "#00b95a",
  train: "#0d8f20",
  bus: "#a8cf35",
};

export const freeTransportModes = new Set([
  "car",
  "truck",
  "boat",
  "friends",
  "bike",
  "foot",
]);

export const displayedFreeRideModes = new Set(["car", "truck", "boat", "bike"]);

export const paidSleepCategories = new Set([
  "airbnb",
  "hostel",
  "renting",
  "campingPaid",
]);

export const costGroupColors = {
  free: "#007900",
  paid: "#c60000",
};

export const transportDisplayOrder = [
  "car",
  "truck",
  "boat",
  "friends",
  "bike",
  "foot",
  "plane",
  "bus",
  "ferry",
  "rentalCar",
  "taxi",
  "train",
];

export const initialTimelineEntryCount = 80;
export const timelineEntryBatchSize = 80;
export const timelineTargetContextCount = 40;
