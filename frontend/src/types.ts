export type FeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Geometry,
  Record<string, unknown>
>;

export type TransportStat = {
  transport: string | null;
  leg_count: number;
  distance_m: number;
  distance_km: number | string;
};

export type LocationFormState = {
  lng: number;
  lat: number;
  name: string;
  transport: string;
  travelDateTime: string;
  people: string;
  description: string;
  pointtype: "waypoint" | "sleep";
  sleepcategory: string;
  boat: string;
  nonights: string;
  travelcost: string;
  sleepcost: string;
};

export type TimelineLocationEntry = {
  date: Date | null;
  feature: GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>;
  id: string;
  kind: "location";
};

export type TimelineLegEntry = {
  date: Date | null;
  feature: GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>;
  gap: number;
  id: string;
  kind: "leg";
};

export type TimelineEntry = TimelineLocationEntry | TimelineLegEntry;

export type SelectedChartPart = {
  color: string;
  id: string;
  label: string;
  value: number;
};

export type GeneralStats = {
  rideCount: number;
  sleepCostTotal: number;
  totalDays: number;
  transportCostTotal: number;
  travelDayCount: number;
};
