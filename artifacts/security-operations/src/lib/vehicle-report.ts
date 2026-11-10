export type TripDetail = {
  id: string;
  registerSlug: "outgoing-vehicles" | "outgoing-vehicle-log";
  type: "unit-2" | "local" | "out-station";
  typeLabel: "Unit 2" | "Local" | "Out of Station";
  date: string;
  month: string;
  monthLabel: string;
  driverName: string;
  carName: string;
  station: string;
  outTime: string;
  inTime: string;
  durationMinutes: number;
  durationFormatted: string;
  initialReading: number;
  finalReading: number;
  kmRun: number;
  personInCar: string;
  requestedByWhom: string;
  signature: string;
};

export type DriverLocalTimeSummary = {
  driverName: string;
  tripCount: number;
  totalMinutes: number;
  totalHoursFormatted: string;
  avgMinutesPerTrip: number;
  avgHoursFormatted: string;
  totalKm: number;
  lastTripDate: string;
};

export type DriverKmSummary = {
  driverName: string;
  totalKm: number;
  unit2Km: number;
  localKm: number;
  outStationKm: number;
  totalTrips: number;
  unit2Trips: number;
  localTrips: number;
  outStationTrips: number;
  avgKmPerTrip: number;
  totalMinutes: number;
  totalHoursFormatted: string;
  lastTripDate: string;
};

export type TripTypeBreakdown = {
  type: "unit-2" | "local" | "out-station";
  typeLabel: string;
  tripCount: number;
  totalKm: number;
  avgKmPerTrip: number;
  totalMinutes: number;
  totalHoursFormatted: string;
  avgMinutesPerTrip: number;
  avgHoursFormatted: string;
};

export type StationDriverSummary = {
  station: string;
  driverName: string;
  type: "unit-2" | "local" | "out-station";
  typeLabel: string;
  tripCount: number;
  totalKm: number;
  avgKmPerTrip: number;
  totalMinutes: number;
  totalHoursFormatted: string;
};

// 1. No of hours per driver per month
export type DriverMonthlyHoursSummary = {
  month: string;
  monthLabel: string;
  driverName: string;
  totalMinutes: number;
  totalHoursFormatted: string;
  totalHoursDecimal: number;
  localMinutes: number;
  localHoursFormatted: string;
  outStationMinutes: number;
  outStationHoursFormatted: string;
  totalTrips: number;
  localTrips: number;
  outStationTrips: number;
  totalKm: number;
  avgHoursFormatted: string;
};

// 2. Car wise report per month
export type CarMonthlySummary = {
  month: string;
  monthLabel: string;
  carName: string;
  totalKm: number;
  totalTrips: number;
  localTrips: number;
  outStationTrips: number;
  totalMinutes: number;
  totalHoursFormatted: string;
  avgKmPerTrip: number;
  drivers: string[];
  destinations: string[];
};

// Consolidated Car Summary (Joins all months per car)
export type CarConsolidatedSummary = {
  carName: string;
  totalKm: number;
  totalTrips: number;
  localTrips: number;
  outStationTrips: number;
  totalMinutes: number;
  totalHoursFormatted: string;
  avgKmPerTrip: number;
  months: string[];
  monthsFormatted: string;
  monthlyBreakdown: Array<{
    month: string;
    monthLabel: string;
    totalKm: number;
    totalTrips: number;
    localTrips: number;
    outStationTrips: number;
    totalMinutes: number;
    totalHoursFormatted: string;
  }>;
};

// Consolidated Location Summary (Joins all months per location)
export type LocationConsolidatedSummary = {
  location: string;
  totalKm: number;
  totalTrips: number;
  localTrips: number;
  outStationTrips: number;
  totalMinutes: number;
  totalHoursFormatted: string;
  avgKmPerTrip: number;
  months: string[];
  monthsFormatted: string;
  monthlyBreakdown: Array<{
    month: string;
    monthLabel: string;
    totalKm: number;
    totalTrips: number;
    localTrips: number;
    outStationTrips: number;
    totalMinutes: number;
    totalHoursFormatted: string;
  }>;
};

// 3. Location wise report per month
export type LocationMonthlySummary = {
  month: string;
  monthLabel: string;
  location: string;
  totalKm: number;
  totalTrips: number;
  localTrips: number;
  outStationTrips: number;
  totalMinutes: number;
  totalHoursFormatted: string;
  avgKmPerTrip: number;
  cars: string[];
  drivers: string[];
};

// 4. Destination covered in month by car
export type CarDestinationMonthlySummary = {
  month: string;
  monthLabel: string;
  carName: string;
  destination: string;
  totalTrips: number;
  totalKm: number;
  totalMinutes: number;
  totalHoursFormatted: string;
  avgKmPerTrip: number;
  drivers: string[];
};

export type VehicleAnalyticsReport = {
  from: string;
  to: string;
  filterDriver?: string;
  filterType?: string;
  filterMonth?: string;
  filterCar?: string;
  availableDrivers: string[];
  availableStations: string[];
  availableCars: string[];
  availableMonths: Array<{ key: string; label: string }>;
  totals: {
    totalTrips: number;
    totalKm: number;
    totalMinutes: number;
    totalHoursFormatted: string;
    unit2Trips: number;
    unit2Km: number;
    unit2Minutes: number;
    unit2HoursFormatted: string;
    localTrips: number;
    localKm: number;
    localMinutes: number;
    localHoursFormatted: string;
    outStationTrips: number;
    outStationKm: number;
    outStationMinutes: number;
    outStationHoursFormatted: string;
  };
  localTimeSummary: DriverLocalTimeSummary[];
  driverKmSummary: DriverKmSummary[];
  typeSummary: TripTypeBreakdown[];
  stationDriverSummary: StationDriverSummary[];
  driverMonthlyHours: DriverMonthlyHoursSummary[];
  carMonthlySummary: CarMonthlySummary[];
  carSummary?: CarConsolidatedSummary[];
  locationMonthlySummary: LocationMonthlySummary[];
  locationSummary?: LocationConsolidatedSummary[];
  carDestinationMonthlySummary: CarDestinationMonthlySummary[];
  trips: TripDetail[];
};

export async function fetchVehicleAnalytics(params: {
  from?: string;
  to?: string;
  driver?: string;
  type?: string;
  month?: string;
  car?: string;
}): Promise<VehicleAnalyticsReport> {
  const searchParams = new URLSearchParams();
  if (params.from) searchParams.set("from", params.from);
  if (params.to) searchParams.set("to", params.to);
  if (params.driver && params.driver !== "ALL") searchParams.set("driver", params.driver);
  if (params.type && params.type !== "all") searchParams.set("type", params.type);
  if (params.month && params.month !== "ALL") searchParams.set("month", params.month);
  if (params.car && params.car !== "ALL") searchParams.set("car", params.car);

  try {
    const response = await fetch(`/api/reports/vehicle-analytics?${searchParams.toString()}`, {
      credentials: "include",
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      if (typeof payload.error === "string") {
        throw new Error(payload.error);
      }
      if (response.status === 404) {
        throw new Error(
          "API endpoint not found (404). Please restart your development server (pnpm run dev) so the new backend routes are active."
        );
      }
      if (response.status === 401) {
        throw new Error("Session expired. Please log in again.");
      }
      if (response.status === 403) {
        throw new Error("Access denied (403). Your account does not have permission to view vehicle reports.");
      }
      throw new Error(`Server returned error ${response.status}: ${response.statusText}`);
    }
    return (await response.json()) as VehicleAnalyticsReport;
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error("Failed to load vehicle analytics");
  }
}

export type DriverLivePresenceItem = {
  driverName: string;
  phone: string;
  workLocation: string;
  supervisor: string;
  liveStatus: "available" | "on_trip" | "on_station" | "punched_out" | "not_reported";
  liveStatusLabel: string;
  inTime?: string;
  outTime?: string;
  stationTrip?: boolean;
  stationName?: string;
  activeTrip?: {
    carName: string;
    station: string;
    outTime: string;
    personInCar: string;
    tripType: "unit-2" | "local" | "out-station";
  };
  scheduledTrip?: {
    carName: string;
    location: string;
    scheduleTime: string;
  };
  todayTripsCount: number;
  todayKm: number;
};

export type ActiveVehicleItem = {
  recordId: string;
  registerSlug: "outgoing-vehicles" | "outgoing-vehicle-log";
  carName: string;
  driverName: string;
  station: string;
  outTime: string;
  personInCar: string;
  tripType: "unit-2" | "local" | "out-station";
  date: string;
};

export type ServiceVehicleItem = {
  recordId: string;
  carName: string;
  outDate: string;
  outTime: string;
  inDate?: string;
  inTime?: string;
  totalTimeConsumed?: string;
  isCompleted: boolean;
};

export type DriverLivePresenceReport = {
  targetDate: string;
  summary: {
    totalRegistered: number;
    totalPresentToday: number;
    availableNow: number;
    onTripNow: number;
    onStationNow: number;
    punchedOutToday: number;
    notReportedToday: number;
    vehiclesOnRoad: number;
    vehiclesInService: number;
  };
  drivers: DriverLivePresenceItem[];
  activeVehicles: ActiveVehicleItem[];
  serviceVehicles: ServiceVehicleItem[];
};

export async function fetchLiveDriverPresence(date?: string): Promise<DriverLivePresenceReport> {
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  const response = await fetch(`/api/reports/vehicle/drivers-live${query}`, {
    credentials: "include",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Failed to fetch live driver presence (${response.status})`);
  }
  return response.json();
}
