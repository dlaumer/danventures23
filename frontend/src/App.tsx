import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, {
  GeoJSONSource,
  LngLatBounds,
  Map as MapLibreMap,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { LocateFixed, RefreshCw, Route, X } from "lucide-react";
import "./App.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

type FeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Geometry,
  Record<string, unknown>
>;

type TransportStat = {
  transport: string | null;
  leg_count: number;
  distance_m: number;
  distance_km: number | string;
};

const transportColors: Record<string, string> = {
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

const freeTransportModes = new Set([
  "car",
  "truck",
  "boat",
  "friends",
  "bike",
  "foot",
]);

const costGroupColors = {
  free: "#007900",
  paid: "#c60000",
};

const transportDisplayOrder = [
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

function colorForTransport(value: string | null) {
  if (!value) return "#6f7782";
  return transportColors[value] ?? "#6f7782";
}

function transportLabel(value: string | null) {
  if (!value) return "unknown";
  return value.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function formatKm(value: number | string) {
  const numberValue = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(
    numberValue,
  );
}

function numberFromKm(value: number | string) {
  return typeof value === "string" ? Number(value) : value;
}

function isFreeTransport(value: string | null) {
  return Boolean(value && freeTransportModes.has(value));
}

function polarToCartesian(
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

function describeArc(
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

function describeDonutSegment(
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

function addFeatureCoordinatesToBounds(
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

function normalizeFeatureCollection(data: FeatureCollection): FeatureCollection {
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

function buildTransportColorExpression(): maplibregl.ExpressionSpecification {
  const expression: unknown[] = ["match", ["get", "transport"]];

  Object.entries(transportColors).forEach(([transport, color]) => {
    expression.push(transport, color);
  });

  expression.push("#6f7782");
  return expression as maplibregl.ExpressionSpecification;
}

type TransportPieChartProps = {
  selectedPart: SelectedChartPart | null;
  stats: TransportStat[];
  selectedTransport: string | null;
  onSelectPart: (part: SelectedChartPart | null) => void;
  onSelectTransport: (transport: string | null) => void;
};

type ChartSegment = TransportStat & {
  distanceValue: number;
  endAngle: number;
  isRightSide: boolean;
  labelEndX: number;
  labelY: number;
  midAngle: number;
  startAngle: number;
  textX: number;
};

type SelectedChartPart = {
  color: string;
  id: string;
  label: string;
  value: number;
};

function TransportPieChart({
  selectedPart,
  stats,
  selectedTransport,
  onSelectPart,
  onSelectTransport,
}: TransportPieChartProps) {
  const chartStats = stats
    .map((item) => ({
      ...item,
      distanceValue: numberFromKm(item.distance_km),
    }))
    .filter((item) => item.distanceValue > 0)
    .sort((a, b) => {
      const aIndex = transportDisplayOrder.indexOf(a.transport ?? "");
      const bIndex = transportDisplayOrder.indexOf(b.transport ?? "");

      return (
        (aIndex === -1 ? transportDisplayOrder.length : aIndex) -
        (bIndex === -1 ? transportDisplayOrder.length : bIndex)
      );
    });
  const total = chartStats.reduce((sum, item) => sum + item.distanceValue, 0);
  const freeTotal = chartStats
    .filter((item) => isFreeTransport(item.transport))
    .reduce((sum, item) => sum + item.distanceValue, 0);
  const paidTotal = Math.max(total - freeTotal, 0);
  const center = 150;
  const innerPieRadius = 58;
  const donutInnerRadius = 72;
  const donutOuterRadius = 112;
  const labelRadius = 121;
  const labelColumnX = { left: 34, right: 266 };
  const minLabelGap = 13;

  if (!total) {
    return <div className="transport-chart empty">No distance data</div>;
  }

  let outerAngle = 0;
  let innerAngle = 0;
  const costGroups = [
    { key: "free", label: "Free", value: freeTotal, color: costGroupColors.free },
    { key: "paid", label: "Paid", value: paidTotal, color: costGroupColors.paid },
  ].filter((item) => item.value > 0);
  const outerSegments: ChartSegment[] = chartStats.map((item) => {
    const startAngle = outerAngle;
    const endAngle = outerAngle + (item.distanceValue / total) * 360;
    const midAngle = startAngle + (endAngle - startAngle) / 2;
    const labelPoint = polarToCartesian(center, center, labelRadius, midAngle);
    const isRightSide = labelPoint.x >= center;
    outerAngle = endAngle;

    return {
      ...item,
      endAngle,
      isRightSide,
      labelEndX: isRightSide ? 260 : 40,
      labelY: labelPoint.y,
      midAngle,
      startAngle,
      textX: isRightSide ? labelColumnX.right : labelColumnX.left,
    };
  });

  (["left", "right"] as const).forEach((side) => {
    const sideSegments = outerSegments
      .filter((item) => item.isRightSide === (side === "right"))
      .sort((a, b) => a.labelY - b.labelY);

    sideSegments.forEach((item, index) => {
      if (index === 0) {
        item.labelY = Math.max(item.labelY, 22);
        return;
      }

      item.labelY = Math.max(
        item.labelY,
        sideSegments[index - 1].labelY + minLabelGap,
      );
    });

    const overflow = sideSegments.length
      ? sideSegments[sideSegments.length - 1].labelY - 278
      : 0;

    if (overflow > 0) {
      sideSegments.forEach((item) => {
        item.labelY -= overflow;
      });
    }
  });

  return (
    <div className="transport-chart" aria-label="Kilometers by transport">
      <svg viewBox="0 0 300 300" role="img">
        <title>Kilometers by transport and cost type</title>
        {costGroups.map((group) => {
          const startAngle = innerAngle;
          const endAngle = innerAngle + (group.value / total) * 360;
          innerAngle = endAngle;
          const isSelected = selectedPart?.id === `cost:${group.key}`;

          return (
            <g
              className={`chart-segment chart-inner-segment ${
                isSelected ? "selected" : ""
              }`}
              key={group.key}
              onClick={() => {
                onSelectTransport(null);
                onSelectPart(
                  isSelected
                    ? null
                    : {
                        color: group.color,
                        id: `cost:${group.key}`,
                        label: group.label,
                        value: group.value,
                      },
                );
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectTransport(null);
                  onSelectPart(
                    isSelected
                      ? null
                      : {
                          color: group.color,
                          id: `cost:${group.key}`,
                          label: group.label,
                          value: group.value,
                        },
                  );
                }
              }}
              role="button"
              tabIndex={0}
            >
              <path
                d={`${describeArc(
                  center,
                  center,
                  innerPieRadius,
                  startAngle,
                  endAngle,
                )} L ${center} ${center} Z`}
                fill={group.color}
                stroke="#fbfaf5"
                strokeWidth="1.5"
              />
            </g>
          );
        })}

        {outerSegments.map((item) => {
          const labelStart = polarToCartesian(
            center,
            center,
            116,
            item.midAngle,
          );
          const isSelected = selectedTransport === item.transport;

          return (
            <g
              className={`chart-segment ${isSelected ? "selected" : ""}`}
              key={item.transport ?? "unknown"}
              onClick={() => {
                onSelectTransport(isSelected ? null : item.transport);
                onSelectPart(
                  isSelected
                    ? null
                    : {
                        color: colorForTransport(item.transport),
                        id: `transport:${item.transport ?? "unknown"}`,
                        label: transportLabel(item.transport),
                        value: item.distanceValue,
                      },
                );
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectTransport(isSelected ? null : item.transport);
                  onSelectPart(
                    isSelected
                      ? null
                      : {
                          color: colorForTransport(item.transport),
                          id: `transport:${item.transport ?? "unknown"}`,
                          label: transportLabel(item.transport),
                          value: item.distanceValue,
                        },
                  );
                }
              }}
              role="button"
              tabIndex={0}
            >
              <path
                d={describeDonutSegment(
                  center,
                  center,
                  donutInnerRadius,
                  donutOuterRadius,
                  item.startAngle,
                  item.endAngle,
                )}
                fill={colorForTransport(item.transport)}
                stroke="#fbfaf5"
                strokeWidth="1.4"
              />
              <polyline
                fill="none"
                points={`${labelStart.x},${labelStart.y} ${item.labelEndX},${item.labelY}`}
                stroke={colorForTransport(item.transport)}
                strokeWidth="1.1"
              />
              <text
                dominantBaseline="middle"
                fill={colorForTransport(item.transport)}
                fontSize="12"
                fontWeight="650"
                textAnchor={item.isRightSide ? "start" : "end"}
                x={item.textX}
                y={item.labelY}
              >
                {transportLabel(item.transport)}
              </text>
          </g>
        );
      })}
        <circle
          cx={center}
          cy={center}
          fill="none"
          r={donutInnerRadius}
          stroke="#fbfaf5"
          strokeWidth="10"
        />
      </svg>
      <div className="chart-cost-legend" aria-label="Free versus paid">
        <span>
          <i style={{ backgroundColor: costGroupColors.free }} />
          Free {formatKm(freeTotal)} km
        </span>
        <span>
          <i style={{ backgroundColor: costGroupColors.paid }} />
          Paid {formatKm(paidTotal)} km
        </span>
      </div>
      {selectedPart && (
        <div className="chart-selection">
          <span>
            <i style={{ backgroundColor: selectedPart.color }} />
            {selectedPart.label}
          </span>
          <strong>{formatKm(selectedPart.value)} km</strong>
        </div>
      )}
    </div>
  );
}

function App() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [locations, setLocations] = useState<FeatureCollection | null>(null);
  const [legs, setLegs] = useState<FeatureCollection | null>(null);
  const [stats, setStats] = useState<TransportStat[]>([]);
  const [selectedTransport, setSelectedTransport] = useState<string | null>(
    null,
  );
  const [selectedChartPart, setSelectedChartPart] =
    useState<SelectedChartPart | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const totalKm = useMemo(
    () =>
      stats.reduce((sum, item) => {
        return sum + numberFromKm(item.distance_km);
      }, 0),
    [stats],
  );

  const orderedStats = useMemo(
    () =>
      [...stats].sort((a, b) => {
        const aIndex = transportDisplayOrder.indexOf(a.transport ?? "");
        const bIndex = transportDisplayOrder.indexOf(b.transport ?? "");

        return (
          (aIndex === -1 ? transportDisplayOrder.length : aIndex) -
          (bIndex === -1 ? transportDisplayOrder.length : bIndex)
        );
      }),
    [stats],
  );

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setIsLoading(true);
      setError(null);

      try {
        const [locationsResponse, legsResponse, statsResponse] =
          await Promise.all([
            fetch(`${API_BASE_URL}/locations`),
            fetch(`${API_BASE_URL}/legs?simplify=0.01`),
            fetch(`${API_BASE_URL}/stats/transport-distance`),
          ]);

        if (!locationsResponse.ok || !legsResponse.ok || !statsResponse.ok) {
          throw new Error("One of the API requests failed.");
        }

        const [locationsJson, legsJson, statsJson] = await Promise.all([
          locationsResponse.json(),
          legsResponse.json(),
          statsResponse.json(),
        ]);

        if (!isMounted) return;

        setLocations(normalizeFeatureCollection(locationsJson));
        setLegs(normalizeFeatureCollection(legsJson));
        setStats(statsJson);
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
    if (!mapContainerRef.current || mapRef.current) return;

    mapRef.current = new maplibregl.Map({
      container: mapContainerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [-15, 20],
      zoom: 1.4,
      attributionControl: false,
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
    mapRef.current.once("load", () => setIsMapReady(true));

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      setIsMapReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady || !locations || !legs) return;

    if (!map.getSource("legs")) {
      map.addSource("legs", {
        type: "geojson",
        data: legs,
      });

      map.addLayer({
        id: "legs-shadow",
        type: "line",
        source: "legs",
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
    } else {
      (map.getSource("legs") as GeoJSONSource).setData(legs);
    }

    if (!map.getSource("locations")) {
      map.addSource("locations", {
        type: "geojson",
        data: locations,
      });

      map.addLayer({
        id: "locations-halo",
        type: "circle",
        source: "locations",
        filter: ["==", ["get", "pointtype"], "sleep"],
        paint: {
          "circle-radius": 5.5,
          "circle-color": "#fff9ed",
          "circle-opacity": 0.9,
        },
      });

      map.addLayer({
        id: "locations-main",
        type: "circle",
        source: "locations",
        filter: ["==", ["get", "pointtype"], "sleep"],
        paint: {
          "circle-radius": 3.4,
          "circle-color": "#1c6f62",
          "circle-opacity": 0.95,
          "circle-stroke-color": "#1f2b33",
          "circle-stroke-width": 0.5,
        },
      });
    } else {
      (map.getSource("locations") as GeoJSONSource).setData(locations);
    }

    const bounds = new LngLatBounds();
    legs.features.forEach((feature) =>
      addFeatureCoordinatesToBounds(feature.geometry, bounds),
    );

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 44, duration: 900, maxZoom: 4.5 });
    }
  }, [locations, legs, isMapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("legs-main")) return;

    const selected = selectedTransport ?? "";

    if (!selectedTransport) {
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
      map.setPaintProperty("legs-shadow", "line-opacity", 0.28);
      return;
    }

    map.setPaintProperty("legs-main", "line-opacity", [
      "case",
      ["==", ["get", "transport"], selected],
      0.98,
      0.09,
    ]);
    map.setPaintProperty("legs-main", "line-width", [
      "case",
      ["==", ["get", "transport"], selected],
      5.2,
      1.1,
    ]);
    map.setPaintProperty("legs-shadow", "line-opacity", 0.08);
  }, [selectedTransport]);

  function refitMap() {
    if (!legs || !mapRef.current) return;

    const bounds = new LngLatBounds();
    legs.features.forEach((feature) =>
      addFeatureCoordinatesToBounds(feature.geometry, bounds),
    );
    if (!bounds.isEmpty()) {
      mapRef.current.fitBounds(bounds, { padding: 44, duration: 800 });
    }
  }

  return (
    <main className="app-shell">
      <section className="map-wrap">
        <div ref={mapContainerRef} className="map" />
        <div className="topbar">
          <div>
            <p className="eyebrow">Danventures</p>
            <h1>Travel atlas</h1>
          </div>
          <div className="topbar-actions">
            <button type="button" onClick={refitMap} title="Fit routes">
              <LocateFixed size={18} />
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              title="Reload data"
            >
              <RefreshCw size={18} />
            </button>
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
      </section>

      <aside className="dashboard">
        <div className="summary">
          <p className="eyebrow">Distance</p>
          <strong>{formatKm(totalKm)} km</strong>
          <span>{stats.length} transport types</span>
        </div>

        <div className="panel-heading">
          <div>
            <h2>Transport distance</h2>
            <p>Click a mode to highlight its tracks.</p>
          </div>
          {selectedTransport && (
            <button
              type="button"
              className="clear-button"
              onClick={() => {
                setSelectedTransport(null);
                setSelectedChartPart(null);
              }}
              title="Clear selection"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <TransportPieChart
          stats={orderedStats}
          selectedPart={selectedChartPart}
          selectedTransport={selectedTransport}
          onSelectPart={setSelectedChartPart}
          onSelectTransport={setSelectedTransport}
        />
      </aside>
    </main>
  );
}

export default App;
