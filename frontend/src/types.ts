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

export type SleepCountryStat = {
  country: string;
  iso2: string | null;
  night_count: number;
  sleep_points: number;
};

export type SleepCountryAssignment = {
  country: string;
  iso2: string | null;
};

export type SleepCountryAssignments = Map<string, SleepCountryAssignment>;

export type PeopleStory = {
  coordinates: { lat: number; lng: number } | null;
  date: Date | null;
  description: string;
  favorite: boolean;
  id: string;
  locationId: number | null;
  locationName: string;
  people: string;
  randomOrder: number;
  timelineEntryId: string;
  transport: string | null;
};

export type LocationPicture = {
  dataUrl: string;
  mimeType: string;
  name: string;
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
  waitingtime: string;
  pictures: LocationPicture[];
  travelcost: string;
  sleepcost: string;
  favorite: boolean;
};

export type LegAttributeFormState = {
  fromKey: string;
  toKey: string;
  fromName: string;
  toName: string;
  transport: string;
  travelDateTime: string;
  travelCost: string;
  routeSource: string;
  routeConfidence: string;
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

export type EditableLeg = {
  feature: GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>;
  id: number;
  signal: number;
};

export type SelectedChartPart = {
  color: string;
  id: string;
  label: string;
  value: number;
};

export type ChartCostSummary = {
  amount: number;
  label: string;
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
