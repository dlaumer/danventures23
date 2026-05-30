import maplibregl, { LngLatBounds } from "maplibre-gl";
import {
  displayedFreeRideModes,
  freeTransportModes,
  paidSleepCategories,
  sleepCategoryColors,
  transportColors,
} from "./constants";
import type { FeatureCollection, LocationFormState } from "./types";

export function colorForTransport(value: string | null) {
  if (!value) return "#6f7782";
  return transportColors[value] ?? "#6f7782";
}

export function colorForSleepCategory(value: string | null) {
  if (!value) return "#6f7782";
  return sleepCategoryColors[value] ?? "#6f7782";
}

export function transportLabel(value: string | null) {
  if (!value) return "unknown";
  return value.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function sleepCategoryLabel(value: string | null) {
  if (!value) return "unknown";
  return optionLabel(value);
}

export function optionLabel(value: string) {
  if (value === "campingPaid") return "paid camping";
  if (value === "rentalCar") return "rental car";
  return value.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function formatKm(value: number | string) {
  const numberValue = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(
    numberValue,
  );
}

export function formatCount(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

export function numberFromKm(value: number | string) {
  return typeof value === "string" ? Number(value) : value;
}

export function numberFromValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function isFreeTransport(value: string | null) {
  return Boolean(value && freeTransportModes.has(value));
}

export function isDisplayedFreeRide(value: string | null) {
  return Boolean(value && displayedFreeRideModes.has(value));
}

export function isPaidSleepCategory(value: string | null) {
  return Boolean(value && paidSleepCategories.has(value));
}

export function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number,
) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;

  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

export function describeArc(
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number,
) {
  const start = polarToCartesian(centerX, centerY, radius, endAngle);
  const end = polarToCartesian(centerX, centerY, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    "M",
    start.x,
    start.y,
    "A",
    radius,
    radius,
    0,
    largeArcFlag,
    0,
    end.x,
    end.y,
  ].join(" ");
}

export function describeDonutSegment(
  centerX: number,
  centerY: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
) {
  const outerStart = polarToCartesian(centerX, centerY, outerRadius, endAngle);
  const outerEnd = polarToCartesian(centerX, centerY, outerRadius, startAngle);
  const innerStart = polarToCartesian(centerX, centerY, innerRadius, startAngle);
  const innerEnd = polarToCartesian(centerX, centerY, innerRadius, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    "M",
    outerStart.x,
    outerStart.y,
    "A",
    outerRadius,
    outerRadius,
    0,
    largeArcFlag,
    0,
    outerEnd.x,
    outerEnd.y,
    "L",
    innerStart.x,
    innerStart.y,
    "A",
    innerRadius,
    innerRadius,
    0,
    largeArcFlag,
    1,
    innerEnd.x,
    innerEnd.y,
    "Z",
  ].join(" ");
}

export function addFeatureCoordinatesToBounds(
  geometry: GeoJSON.Geometry | null,
  bounds: LngLatBounds,
) {
  if (!geometry) return;

  const visit = (coords: GeoJSON.Position | GeoJSON.Position[]) => {
    if (typeof coords[0] === "number") {
      const [lng, lat] = coords as GeoJSON.Position;
      bounds.extend([lng, lat]);
      return;
    }

    for (const coord of coords as GeoJSON.Position[]) {
      visit(coord);
    }
  };

  if (geometry.type === "GeometryCollection") {
    geometry.geometries.forEach((child) =>
      addFeatureCoordinatesToBounds(child, bounds),
    );
    return;
  }

  visit(geometry.coordinates as GeoJSON.Position | GeoJSON.Position[]);
}

function stripAltitudeFromGeometry(geometry: GeoJSON.Geometry): GeoJSON.Geometry {
  if (geometry.type === "GeometryCollection") {
    return {
      ...geometry,
      geometries: geometry.geometries.map(stripAltitudeFromGeometry),
    };
  }

  const strip = (coords: unknown): unknown => {
    const coordArray = coords as unknown[];

    if (typeof coordArray[0] === "number") {
      const [lng, lat] = coords as GeoJSON.Position;
      return [lng, lat];
    }

    return coordArray.map(strip);
  };

  return {
    ...geometry,
    coordinates: strip(geometry.coordinates),
  } as GeoJSON.Geometry;
}

export function normalizeFeatureCollection(data: FeatureCollection): FeatureCollection {
  return {
    ...data,
    features: data.features.map((feature) => ({
      ...feature,
      geometry: feature.geometry
        ? stripAltitudeFromGeometry(feature.geometry)
        : feature.geometry,
    })),
  };
}

function padTimePart(value: number) {
  return String(value).padStart(2, "0");
}

export function formatLocalDate(date: Date) {
  return [
    date.getFullYear(),
    padTimePart(date.getMonth() + 1),
    padTimePart(date.getDate()),
  ].join("-");
}

export function formatDateTimeLocal(date: Date) {
  return `${formatLocalDate(date)}T${padTimePart(date.getHours())}:${padTimePart(
    date.getMinutes(),
  )}:${padTimePart(date.getSeconds())}`;
}

export function parseTravelDate(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatTimelineDate(date: Date | null) {
  if (!date) return "No date";

  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatTimelineDateTime(date: Date | null) {
  if (!date) return "No date";

  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function propertyString(
  properties: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = properties?.[key];
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

export function propertyNumber(
  properties: Record<string, unknown> | null | undefined,
  key: string,
) {
  return numberFromValue(properties?.[key]);
}

export function featureRecordId(feature: GeoJSON.Feature) {
  const value = feature.id ?? feature.properties?.id;
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

export function timelineEntryId(
  kind: "leg" | "location",
  feature: GeoJSON.Feature,
  fallbackIndex?: number,
) {
  const recordId = featureRecordId(feature);
  return `${kind}:${recordId ?? `fallback-${fallbackIndex ?? 0}`}`;
}

export function coordinatesForFeature(feature: GeoJSON.Feature) {
  if (feature.geometry?.type !== "Point") return null;
  const [lng, lat] = feature.geometry.coordinates;
  return { lat: Number(lat), lng: Number(lng) };
}

export function formatCoordinate(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 5,
    minimumFractionDigits: 0,
  }).format(value);
}

function getLatestTravelDate(locations: FeatureCollection | null) {
  if (!locations) return null;

  return locations.features.reduce<Date | null>((latest, feature) => {
    const date = parseTravelDate(feature.properties?.travel_date);
    if (!date) return latest;
    return !latest || date.getTime() > latest.getTime() ? date : latest;
  }, null);
}

export function suggestedDateTimeForDate(
  dateValue: string,
  locations: FeatureCollection | null,
) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const midnight = new Date(year, month - 1, day, 0, 0, 0);
  let latestOnDate: Date | null = null;

  locations?.features.forEach((feature) => {
    const date = parseTravelDate(feature.properties?.travel_date);
    if (!date || formatLocalDate(date) !== dateValue) return;
    if (!latestOnDate || date.getTime() > latestOnDate.getTime()) {
      latestOnDate = date;
    }
  });

  if (!latestOnDate) return formatDateTimeLocal(midnight);

  const next = new Date(latestOnDate);
  next.setMinutes(next.getMinutes() + 1);
  return formatDateTimeLocal(next);
}

export function buildEmptyLocationForm(
  lng: number,
  lat: number,
  locations: FeatureCollection | null,
): LocationFormState {
  const latestDate = getLatestTravelDate(locations);
  const dateValue = latestDate
    ? formatLocalDate(latestDate)
    : formatLocalDate(new Date());

  return {
    lng,
    lat,
    name: "",
    transport: "foot",
    travelDateTime: suggestedDateTimeForDate(dateValue, locations),
    people: "",
    description: "",
    pointtype: "waypoint",
    sleepcategory: "camping",
    boat: "",
    nonights: "1",
    travelcost: "",
    sleepcost: "",
  };
}

export function formFromFeature(feature: GeoJSON.Feature): LocationFormState {
  const properties = feature.properties ?? {};
  const coordinates =
    feature.geometry?.type === "Point" ? feature.geometry.coordinates : [0, 0];
  const travelDate = parseTravelDate(properties.travel_date);

  return {
    lng: Number(coordinates[0]),
    lat: Number(coordinates[1]),
    name: String(properties.name ?? ""),
    transport: String(properties.transport ?? "foot"),
    travelDateTime: travelDate
      ? formatDateTimeLocal(travelDate)
      : formatDateTimeLocal(new Date()),
    people: String(properties.people ?? ""),
    description: String(properties.description ?? ""),
    pointtype: properties.pointtype === "sleep" ? "sleep" : "waypoint",
    sleepcategory: String(properties.sleepcategory ?? "camping"),
    boat: String(properties.boat ?? ""),
    nonights: properties.nonights == null ? "1" : String(properties.nonights),
    travelcost:
      properties.travelcost == null ? "" : String(properties.travelcost),
    sleepcost: properties.sleepcost == null ? "" : String(properties.sleepcost),
  };
}

export function formToPayload(form: LocationFormState) {
  const isSleep = form.pointtype === "sleep";
  const isBoatTransport = form.transport === "boat";
  const isPaidTransport = !isFreeTransport(form.transport);
  const isPaidSleep = isSleep && paidSleepCategories.has(form.sleepcategory);

  return {
    lng: form.lng,
    lat: form.lat,
    name: form.name.trim(),
    transport: form.transport,
    travel_date: new Date(form.travelDateTime).toUTCString(),
    people: form.people.trim() || null,
    description: form.description.trim() || null,
    pointtype: form.pointtype,
    sleepcategory: isSleep ? form.sleepcategory : null,
    boat: isBoatTransport ? form.boat.trim() || null : null,
    nonights: isSleep && form.nonights ? Number(form.nonights) : null,
    travelcost:
      isPaidTransport && form.travelcost ? Number(form.travelcost) : null,
    sleepcost: isPaidSleep && form.sleepcost ? Number(form.sleepcost) : null,
  };
}

export function buildTransportColorExpression(): maplibregl.ExpressionSpecification {
  const expression: unknown[] = ["match", ["get", "transport"]];

  Object.entries(transportColors).forEach(([transport, color]) => {
    expression.push(transport, color);
  });

  expression.push("#6f7782");
  return expression as maplibregl.ExpressionSpecification;
}
