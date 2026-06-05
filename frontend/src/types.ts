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

export type SleepStat = {
  sleepcategory: string | null;
  night_count: number;
};

export type PeopleStory = {
  coordinates: { lat: number; lng: number } | null;
  date: Date | null;
  description: string;
  id: string;
  locationName: string;
  people: string;
  randomOrder: number;
  timelineEntryId: string;
  transport: string | null;
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

export type TimelineMapPosition = {
  coordinates: [number, number] | null;
  entryId: string;
  kind: "leg" | "location";
  routeProgress: number;
};

export type SelectedChartPart = {
  color: string;
  id: string;
  label: string;
  value: number;
};

export type GeneralStats = {
  rideCount: number;
  sleepCostTotal: number;
  totalDistanceKm: number;
  totalDays: number;
  transportCostTotal: number;
  travelDayCount: number;
};

export type TravelTimeRange = {
  endMs: number;
  startMs: number;
};

export type MonthlyTransportDistance = {
  distance_km: number | string;
  distance_m: number | string;
  transport: string | null;
};

export type MonthlyTransportDistanceBucket = {
  month_end: string;
  month_start: string;
  total_km: number | string;
  transports: MonthlyTransportDistance[];
};
