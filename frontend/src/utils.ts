import maplibregl, { LngLatBounds } from "maplibre-gl";
import {
  displayedFreeRideModes,
  freeTransportModes,
  paidSleepCategories,
  sleepCategoryColors,
  transportColors,
} from "./constants";
import type { FeatureCollection, LocationFormState, LocationPicture } from "./types";

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

export function formatMoney(value: number | string) {
  const numberValue = typeof value === "string" ? Number(value) : value;
  return `€${new Intl.NumberFormat("en").format(numberValue)}`;
}

export function formatWaitingTime(value: number | string) {
  const minutes = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0
    ? `${hours} h ${remainingMinutes} min`
    : `${hours} h`;
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

export function locationPicturesFromValue(value: unknown): LocationPicture[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const picture = item as Record<string, unknown>;
    const dataUrl = picture.dataUrl;
    const mimeType = picture.mimeType;
    const name = picture.name;

    if (
      typeof dataUrl !== "string" ||
      typeof mimeType !== "string" ||
      typeof name !== "string" ||
      !dataUrl.startsWith("data:image/")
    ) {
      return [];
    }

    return [{ dataUrl, mimeType, name }];
  });
}

export function isFreeTransport(value: string | null) {
  return Boolean(value && freeTransportModes.has(value));
}

export function transportSupportsWaitingTime(value: string | null) {
  return value === "car" || value === "truck";
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

export function propertyBoolean(
  properties: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = properties?.[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
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

export function normalizeLngLat(coordinates: GeoJSON.Position | null) {
  if (!coordinates || coordinates.length < 2) return null;

  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return [lng, lat] as [number, number];
}

export function positionDistanceKm(a: GeoJSON.Position, b: GeoJSON.Position) {
  const [aLng, aLat] = a.map(Number);
  const [bLng, bLat] = b.map(Number);
  const earthRadiusKm = 6371;
  const latDistance = ((bLat - aLat) * Math.PI) / 180;
  const lngDistance = ((bLng - aLng) * Math.PI) / 180;
  const startLat = (aLat * Math.PI) / 180;
  const endLat = (bLat * Math.PI) / 180;
  const haversine =
    Math.sin(latDistance / 2) ** 2 +
    Math.cos(startLat) *
      Math.cos(endLat) *
      Math.sin(lngDistance / 2) ** 2;

  return (
    earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function interpolatePosition(
  start: GeoJSON.Position,
  end: GeoJSON.Position,
  progress: number,
): GeoJSON.Position {
  const [startLng, startLat] = start.map(Number);
  const [endLng, endLat] = end.map(Number);

  return [
    startLng + (endLng - startLng) * progress,
    startLat + (endLat - startLat) * progress,
  ];
}

export function coordinateAlongLine(
  geometry: GeoJSON.Geometry | null,
  progress: number,
) {
  const lines =
    geometry?.type === "LineString"
      ? [geometry.coordinates]
      : geometry?.type === "MultiLineString"
        ? geometry.coordinates
        : [];
  const coordinates = lines.flat().filter((position) => position.length >= 2);

  if (coordinates.length === 0) return null;
  if (coordinates.length === 1) return normalizeLngLat(coordinates[0]);

  const segments = coordinates.slice(1).map((position, index) => ({
    distanceKm: positionDistanceKm(coordinates[index], position),
    end: position,
    start: coordinates[index],
  }));
  const totalDistanceKm = segments.reduce(
    (sum, segment) => sum + segment.distanceKm,
    0,
  );
  if (totalDistanceKm <= 0) return normalizeLngLat(coordinates[0]);

  const targetDistanceKm =
    Math.max(0, Math.min(1, progress)) * totalDistanceKm;
  let traversedDistanceKm = 0;

  for (const segment of segments) {
    const nextDistanceKm = traversedDistanceKm + segment.distanceKm;

    if (targetDistanceKm <= nextDistanceKm) {
      const segmentProgress =
        segment.distanceKm > 0
          ? (targetDistanceKm - traversedDistanceKm) / segment.distanceKm
          : 0;
      return normalizeLngLat(
        interpolatePosition(segment.start, segment.end, segmentProgress),
      );
    }

    traversedDistanceKm = nextDistanceKm;
  }

  return normalizeLngLat(coordinates[coordinates.length - 1]);
}

export function formatCoordinate(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 5,
    minimumFractionDigits: 0,
  }).format(value);
}

function getLatestTravelEntry(locations: FeatureCollection | null) {
  if (!locations) return null;

  return locations.features.reduce<{
    date: Date;
    feature: FeatureCollection["features"][number];
  } | null>((latest, feature) => {
    const date = parseTravelDate(feature.properties?.travel_date);
    if (!date) return latest;

    return !latest || date.getTime() >= latest.date.getTime()
      ? { date, feature }
      : latest;
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

function buildLocationFormWithDateTime(
  lng: number,
  lat: number,
  travelDateTime: string,
): LocationFormState {
  return {
    lng,
    lat,
    name: "",
    transport: "car",
    travelDateTime,
    people: "",
    description: "",
    pointtype: "waypoint",
    sleepcategory: "camping",
    boat: "",
    nonights: "1",
    waitingtime: "",
    pictures: [],
    travelcost: "",
    sleepcost: "",
    favorite: false,
  };
}

export function buildEmptyLocationForm(
  lng: number,
  lat: number,
  locations: FeatureCollection | null,
): LocationFormState {
  const latestEntry = getLatestTravelEntry(locations);
  const latestDate = latestEntry?.date ?? null;
  const latestPointType = latestEntry?.feature.properties?.pointtype;
  if (latestDate && latestPointType === "sleep") {
    const nextDay = new Date(latestDate);
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(0, 0, 0, 0);

    return buildLocationFormWithDateTime(
      lng,
      lat,
      formatDateTimeLocal(nextDay),
    );
  }

  const dateValue = latestDate
    ? formatLocalDate(latestDate)
    : formatLocalDate(new Date());

  return buildLocationFormWithDateTime(
    lng,
    lat,
    suggestedDateTimeForDate(dateValue, locations),
  );
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
    waitingtime:
      properties.waitingtime == null ? "" : String(properties.waitingtime),
    pictures: locationPicturesFromValue(properties.pictures),
    travelcost:
      properties.travelcost == null ? "" : String(properties.travelcost),
    sleepcost: properties.sleepcost == null ? "" : String(properties.sleepcost),
    favorite: propertyBoolean(properties, "favorite"),
  };
}

export function formToPayload(form: LocationFormState) {
  const isSleep = form.pointtype === "sleep";
  const isBoatTransport = form.transport === "boat";
  const canSaveWaitingTime = transportSupportsWaitingTime(form.transport);
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
    waitingtime:
      canSaveWaitingTime && form.waitingtime ? Number(form.waitingtime) : null,
    pictures: form.pictures,
    travelcost:
      isPaidTransport && form.travelcost ? Number(form.travelcost) : null,
    sleepcost: isPaidSleep && form.sleepcost ? Number(form.sleepcost) : null,
    favorite: form.favorite,
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
