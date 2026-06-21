import fs from "node:fs";
import path from "node:path";

const COUNTRY_GEOJSON_URL =
  "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson";

const DEFAULT_INPUT = fs.existsSync("hosted-locations-current.json")
  ? "hosted-locations-current.json"
  : "hosted-locations.json";
const DEFAULT_SUMMARY = "nights-by-country.csv";
const DEFAULT_AUDIT = "country-assignment-audit.csv";

const args = parseArgs(process.argv.slice(2));
const inputPath = args.input ?? DEFAULT_INPUT;
const summaryPath = args.summary ?? DEFAULT_SUMMARY;
const auditPath = args.audit ?? DEFAULT_AUDIT;

const manualRules = [
  {
    country: "At sea",
    reason: "Bay of Biscay boat transit night",
    test: ({ category, name }) => category === "boat" && /bay of biscay/i.test(name),
  },
  {
    country: "Spain",
    reason: "Canary Islands / Spanish island points not covered by source polygons",
    test: ({ point }) =>
      inBox(point, {
        minLng: -18.3,
        maxLng: -13.2,
        minLat: 27.4,
        maxLat: 29.5,
      }),
  },
  {
    country: "France",
    reason: "French coastal/island points not covered by source polygons",
    test: ({ point }) =>
      inBox(point, {
        minLng: -5.2,
        maxLng: -2.8,
        minLat: 48.0,
        maxLat: 49.0,
      }),
  },
  {
    country: "Iceland",
    reason: "Reykjavik-area points not covered by source polygons",
    test: ({ point }) =>
      inBox(point, {
        minLng: -22.5,
        maxLng: -21.0,
        minLat: 63.8,
        maxLat: 64.6,
      }),
  },
  {
    country: "Portugal",
    reason: "Portuguese coastal points not covered by source polygons",
    test: ({ point }) =>
      inBox(point, {
        minLng: -9.0,
        maxLng: -7.8,
        minLat: 36.8,
        maxLat: 37.4,
      }),
  },
  {
    country: "Spain",
    reason: "Spanish coastal points not covered by source polygons",
    test: ({ point }) =>
      inBox(point, {
        minLng: -6.5,
        maxLng: -3.8,
        minLat: 36.4,
        maxLat: 36.9,
      }),
  },
  {
    country: "Spain",
    reason: "Spanish Galician coastal point not covered by source polygons",
    test: ({ point, name }) =>
      /camarinas/i.test(name) &&
      inBox(point, {
        minLng: -9.4,
        maxLng: -8.8,
        minLat: 42.9,
        maxLat: 43.4,
      }),
  },
  {
    country: "Cabo Verde",
    reason: "Cabo Verde island points not covered by source polygons",
    test: ({ point, name }) =>
      inBox(point, {
        minLng: -24.6,
        maxLng: -22.5,
        minLat: 14.6,
        maxLat: 17.4,
      }) && !/\bday\b/i.test(name),
  },
  {
    country: "Morocco",
    reason: "Dakhla point not covered by source polygons",
    test: ({ point, name }) =>
      /dakhla/i.test(name) &&
      inBox(point, {
        minLng: -16.2,
        maxLng: -15.6,
        minLat: 23.4,
        maxLat: 24.0,
      }),
  },
  {
    country: "Chile",
    reason: "Chilean lake/coastal island points not covered by source polygons",
    test: ({ point }) =>
      inBox(point, {
        minLng: -74.2,
        maxLng: -72.0,
        minLat: -43.0,
        maxLat: -41.0,
      }),
  },
  {
    country: "At sea",
    reason: "Boat transit night outside a country polygon",
    test: ({ category, name }) =>
      category === "boat" &&
      (/\bday\s*\d*\b/i.test(name) ||
        /\bbay\b/i.test(name) ||
        /\bsea\b/i.test(name) ||
        /\bcoast\b/i.test(name) ||
        /\banchorage\b/i.test(name)),
  },
];

const locations = await readJsonInput(inputPath);
const countries = await fetchJson(COUNTRY_GEOJSON_URL);
const indexedCountries = countries.features.map((feature) => ({
  feature,
  bbox: bboxFor(feature.geometry),
  name:
    feature.properties.ADMIN ??
    feature.properties.NAME ??
    feature.properties.name ??
    "Unknown",
  iso3:
    feature.properties.ISO_A3 ??
    feature.properties.ISO3166_1_ALPHA_3 ??
    feature.properties.ISO_A3_EH ??
    "",
}));

const rows = [];
const totals = new Map();

for (const feature of locations.features ?? []) {
  const props = feature.properties ?? {};
  if (props.pointtype !== "sleep") continue;

  const nights = Number(props.nonights ?? 0);
  if (!Number.isFinite(nights) || nights <= 0) continue;

  const point = feature.geometry?.coordinates?.slice(0, 2) ?? null;
  const assignment = assignCountry({
    point,
    name: props.name ?? "",
    category: props.sleepcategory ?? "",
  });

  const row = {
    id: props.id ?? feature.id ?? "",
    travel_date: props.travel_date ?? "",
    name: props.name ?? "",
    sleepcategory: props.sleepcategory ?? "",
    nights,
    lng: point?.[0] ?? "",
    lat: point?.[1] ?? "",
    country: assignment.country,
    method: assignment.method,
    reason: assignment.reason,
  };
  rows.push(row);

  if (assignment.country !== "Unassigned") {
    const total = totals.get(assignment.country) ?? {
      country: assignment.country,
      nights: 0,
      sleep_points: 0,
      auto_points: 0,
      manual_points: 0,
    };
    total.nights += nights;
    total.sleep_points += 1;
    if (assignment.method === "auto") total.auto_points += 1;
    if (assignment.method === "manual") total.manual_points += 1;
    totals.set(assignment.country, total);
  }
}

const summaryRows = [...totals.values()].sort(
  (a, b) => b.nights - a.nights || a.country.localeCompare(b.country),
);
const auditRows = rows.sort((a, b) => Number(a.id) - Number(b.id));

writeCsv(summaryPath, summaryRows, [
  "country",
  "nights",
  "sleep_points",
  "auto_points",
  "manual_points",
]);
writeCsv(auditPath, auditRows, [
  "id",
  "travel_date",
  "name",
  "sleepcategory",
  "nights",
  "lng",
  "lat",
  "country",
  "method",
  "reason",
]);

const totalNights = summaryRows.reduce((sum, row) => sum + row.nights, 0);
const unassignedNights = auditRows
  .filter((row) => row.country === "Unassigned")
  .reduce((sum, row) => sum + row.nights, 0);

console.log(`Read ${path.resolve(inputPath)}`);
console.log(`Wrote ${path.resolve(summaryPath)}`);
console.log(`Wrote ${path.resolve(auditPath)}`);
console.log(
  `Assigned ${totalNights} nights across ${summaryRows.length} countries/buckets.`,
);
if (unassignedNights > 0) {
  console.log(`Review needed: ${unassignedNights} unassigned nights.`);
}

function assignCountry({ point, name, category }) {
  if (!point) {
    return {
      country: "Unassigned",
      method: "unassigned",
      reason: "Missing coordinates",
    };
  }

  const autoCountry = countryFor(point);
  if (autoCountry) {
    return {
      country: autoCountry.name,
      method: "auto",
      reason: "Matched source country polygon",
    };
  }

  for (const rule of manualRules) {
    if (rule.test({ point, name, category })) {
      return {
        country: rule.country,
        method: "manual",
        reason: rule.reason,
      };
    }
  }

  return {
    country: "Unassigned",
    method: "unassigned",
    reason: "Outside source polygons and no manual rule matched",
  };
}

function countryFor(point) {
  for (const country of indexedCountries) {
    const [minLng, minLat, maxLng, maxLat] = country.bbox;
    if (
      point[0] < minLng ||
      point[0] > maxLng ||
      point[1] < minLat ||
      point[1] > maxLat
    ) {
      continue;
    }
    if (geometryContains(point, country.feature.geometry)) return country;
  }
  return null;
}

function geometryContains(point, geometry) {
  if (!geometry) return false;
  if (geometry.type === "Polygon") {
    return polygonContains(point, geometry.coordinates);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => polygonContains(point, polygon));
  }
  return false;
}

function polygonContains(point, polygon) {
  if (!ringContains(point, polygon[0])) return false;
  for (let i = 1; i < polygon.length; i += 1) {
    if (ringContains(point, polygon[i])) return false;
  }
  return true;
}

function ringContains(point, ring) {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
}

function bboxFor(geometry) {
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];

  function visit(coords) {
    if (typeof coords[0] === "number") {
      const [lng, lat] = coords;
      bbox[0] = Math.min(bbox[0], lng);
      bbox[1] = Math.min(bbox[1], lat);
      bbox[2] = Math.max(bbox[2], lng);
      bbox[3] = Math.max(bbox[3], lat);
      return;
    }
    coords.forEach(visit);
  }

  visit(geometry.coordinates);
  return bbox;
}

function inBox(point, { minLng, maxLng, minLat, maxLat }) {
  if (!point) return false;
  return (
    point[0] >= minLng &&
    point[0] <= maxLng &&
    point[1] >= minLat &&
    point[1] <= maxLat
  );
}

async function readJsonInput(input) {
  if (/^https?:\/\//i.test(input)) return fetchJson(input);
  return readJson(input);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function writeCsv(filePath, records, columns) {
  const lines = [columns.map(csvCell).join(",")];
  for (const record of records) {
    lines.push(columns.map((column) => csvCell(record[column])).join(","));
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function parseArgs(rawArgs) {
  const parsed = {};
  for (let i = 0; i < rawArgs.length; i += 1) {
    const arg = rawArgs[i];
    if (arg === "--input") parsed.input = rawArgs[++i];
    else if (arg === "--summary") parsed.summary = rawArgs[++i];
    else if (arg === "--audit") parsed.audit = rawArgs[++i];
    else if (arg === "--help") {
      console.log(
        [
          "Usage: node scripts/nights-by-country.mjs [options]",
          "",
          "Options:",
          "  --input <path>    Location GeoJSON input",
          "  --summary <path>  Summary CSV output",
          "  --audit <path>    Per-sleep-point audit CSV output",
        ].join("\n"),
      );
      process.exit(0);
    }
  }
  return parsed;
}
