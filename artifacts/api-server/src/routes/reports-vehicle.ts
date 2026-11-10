import { Router, type IRouter, type Request, type Response } from "express";
import { inArray, desc } from "drizzle-orm";
import { db, registerRecordsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/authMiddleware";
import { parseTimeMinutes, formatDuration, parseNum } from "../lib/time-utils";

const router: IRouter = Router();

const normalizeToIsoDate = (dateVal: unknown): string => {
  if (!dateVal) return "";
  const str = String(dateVal).trim();
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const dmyMatch = str.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
  return str.slice(0, 10);
};

const getMonthKey = (dateStr: string): string => {
  const iso = normalizeToIsoDate(dateStr);
  if (!iso) return "Unknown";
  const match = iso.match(/^(\d{4})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}`;
  return "Unknown";
};

const formatMonthLabel = (monthKey: string): string => {
  if (!monthKey || monthKey === "Unknown") return "Unspecified Month";
  const [yearStr, monthStr] = monthKey.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (!year || !month) return monthKey;
  const d = new Date(Date.UTC(year, month - 1, 1));
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
};

const normalizeName = (raw: unknown): string => {
  const str = String(raw ?? "").trim();
  if (!str) return "Unspecified";
  return str
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
};

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

export const getVehicleAnalytics = async (filters: {
  from?: string;
  to?: string;
  driver?: string;
  type?: string;
  month?: string;
  car?: string;
}) => {
  const rows = await db
    .select()
    .from(registerRecordsTable)
    .where(
      inArray(registerRecordsTable.registerSlug, [
        "outgoing-vehicles",
        "outgoing-vehicle-log",
      ])
    )
    .orderBy(desc(registerRecordsTable.createdAt));

  const allDriversSet = new Set<string>();
  const allStationsSet = new Set<string>();
  const allCarsSet = new Set<string>();
  const allMonthsMap = new Map<string, string>();

  const parsedTrips: TripDetail[] = [];

  for (const row of rows) {
    const data = (row.data ?? {}) as Record<string, unknown>;
    const rawChoice = String(data.station ?? data.station_choice ?? "").trim().toLowerCase();
    let type: "unit-2" | "local" | "out-station" = "local";
    let typeLabel: "Unit 2" | "Local" | "Out of Station" = "Local";

    if (rawChoice === "unit 2" || rawChoice === "unit-2" || rawChoice === "unit2") {
      type = "unit-2";
      typeLabel = "Unit 2";
    } else if (rawChoice === "out of station" || rawChoice === "out-station" || (!rawChoice && row.registerSlug === "outgoing-vehicles")) {
      type = "out-station";
      typeLabel = "Out of Station";
    } else {
      type = "local";
      typeLabel = "Local";
    }

    const rawDriver = String(data.driver_name ?? data.driver ?? "").trim();
    const driverName = rawDriver ? rawDriver.toUpperCase() : "UNKNOWN";
    if (driverName !== "UNKNOWN") allDriversSet.add(driverName);

    const rawStation = String(
      (data.station_name && !["unit 2", "other", "local", "out of station"].includes(String(data.station_name).trim().toLowerCase()) ? data.station_name : undefined)
      ?? (data.location && !["unit 2", "other", "local", "out of station"].includes(String(data.location).trim().toLowerCase()) ? data.location : undefined)
      ?? data.station_name
      ?? data.location
      ?? data.destination
      ?? (type === "unit-2" ? "Unit 2" : type === "local" ? "Local" : "Out of Station")
    ).trim();
    const station = rawStation ? normalizeName(rawStation) : (type === "unit-2" ? "Unit 2" : "Unspecified");
    if (station !== "Unspecified") allStationsSet.add(station);

    const date = normalizeToIsoDate(data.date ?? row.recordDate);
    const monthKey = getMonthKey(date);
    const monthLabel = formatMonthLabel(monthKey);
    if (monthKey !== "Unknown") allMonthsMap.set(monthKey, monthLabel);

    const rawCar = String(
      data.car_name ?? data.vehicle_name ?? data.car ?? ""
    ).trim();
    const carName = rawCar ? normalizeName(rawCar) : "—";
    if (carName !== "—") allCarsSet.add(carName);

    const outTime = String(data.out_time ?? "").trim();
    const inTime = String(data.in_time ?? "").trim();
    const personInCar = String(
      data.name_of_the_person_in_car ?? data.person_in_car ?? data.passenger ?? ""
    ).trim() || "—";
    const requestedByWhom = String(
      data.requested_by_whom ?? data.requested_by ?? data.requested_by_who ?? ""
    ).trim() || "—";
    const signature = String(
      data.signature ?? data.sign ?? data.security_sign ?? ""
    ).trim();

    const initialReading = parseNum(data.initial_reading ?? data.initialReading);
    const finalReading = parseNum(data.final_reading ?? data.finalReading);
    let kmRun = parseNum(
      data.total_km_car_run ?? data.totalKmCarRun ?? data.total_km
    );
    if (!kmRun && finalReading > initialReading && initialReading > 0) {
      kmRun = finalReading - initialReading;
    }

    const outMinutes = parseTimeMinutes(outTime);
    const inMinutes = parseTimeMinutes(inTime);
    let durationMinutes = 0;
    let durationFormatted = "—";

    if (outMinutes !== undefined && inMinutes !== undefined) {
      durationMinutes = (inMinutes - outMinutes + 1440) % 1440;
      durationFormatted = formatDuration(durationMinutes);
    } else if (outMinutes !== undefined && !inTime) {
      durationFormatted = "Trip in progress";
    }

    parsedTrips.push({
      id: row.id,
      registerSlug: row.registerSlug as "outgoing-vehicles" | "outgoing-vehicle-log",
      type,
      typeLabel,
      date,
      month: monthKey,
      monthLabel,
      driverName,
      carName,
      station,
      outTime,
      inTime,
      durationMinutes,
      durationFormatted,
      initialReading,
      finalReading,
      kmRun: Math.max(0, kmRun),
      personInCar,
      requestedByWhom,
      signature,
    });
  }

  // Filter trips according to request query
  const from = filters.from?.trim();
  const to = filters.to?.trim();
  const filterDriver = filters.driver?.trim().toUpperCase();
  const filterType = filters.type?.trim().toLowerCase();
  const filterMonth = filters.month?.trim();
  const filterCar = filters.car?.trim().toUpperCase();

  const filteredTrips = parsedTrips.filter((trip) => {
    if (from && trip.date && trip.date < from) return false;
    if (to && trip.date && trip.date > to) return false;
    if (filterDriver && filterDriver !== "ALL" && trip.driverName !== filterDriver) return false;
    if (filterType && filterType !== "all" && trip.type !== filterType) return false;
    if (filterMonth && filterMonth !== "ALL" && trip.month !== filterMonth) return false;
    if (filterCar && filterCar !== "ALL" && trip.carName.toUpperCase() !== filterCar) return false;
    return true;
  });

  // Sort by date descending
  filteredTrips.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  // 1. Time spent by driver in local (specifically outgoing-vehicle-log)
  const localTrips = filteredTrips.filter((t) => t.type === "local");
  const localDriverMap = new Map<string, {
    tripCount: number;
    totalMinutes: number;
    totalKm: number;
    lastTripDate: string;
  }>();

  for (const t of localTrips) {
    const existing = localDriverMap.get(t.driverName) || {
      tripCount: 0,
      totalMinutes: 0,
      totalKm: 0,
      lastTripDate: t.date,
    };
    existing.tripCount += 1;
    existing.totalMinutes += t.durationMinutes;
    existing.totalKm += t.kmRun;
    if (t.date && (!existing.lastTripDate || t.date > existing.lastTripDate)) {
      existing.lastTripDate = t.date;
    }
    localDriverMap.set(t.driverName, existing);
  }

  const localTimeSummary: DriverLocalTimeSummary[] = Array.from(localDriverMap.entries())
    .map(([driverName, stat]) => {
      const avgMin = stat.tripCount > 0 ? Math.round(stat.totalMinutes / stat.tripCount) : 0;
      return {
        driverName,
        tripCount: stat.tripCount,
        totalMinutes: stat.totalMinutes,
        totalHoursFormatted: formatDuration(stat.totalMinutes),
        avgMinutesPerTrip: avgMin,
        avgHoursFormatted: formatDuration(avgMin),
        totalKm: Math.round(stat.totalKm * 10) / 10,
        lastTripDate: stat.lastTripDate,
      };
    })
    .sort((a, b) => b.totalMinutes - a.totalMinutes);

  // 2.a Total KM per driver (both local and out-of-station)
  const driverKmMap = new Map<string, {
    totalKm: number;
    unit2Km: number;
    localKm: number;
    outStationKm: number;
    totalTrips: number;
    unit2Trips: number;
    localTrips: number;
    outStationTrips: number;
    totalMinutes: number;
    lastTripDate: string;
  }>();

  for (const t of filteredTrips) {
    const existing = driverKmMap.get(t.driverName) || {
      totalKm: 0,
      unit2Km: 0,
      localKm: 0,
      outStationKm: 0,
      totalTrips: 0,
      unit2Trips: 0,
      localTrips: 0,
      outStationTrips: 0,
      totalMinutes: 0,
      lastTripDate: t.date,
    };
    existing.totalTrips += 1;
    existing.totalKm += t.kmRun;
    existing.totalMinutes += t.durationMinutes;
    if (t.type === "unit-2") {
      existing.unit2Km += t.kmRun;
      existing.unit2Trips += 1;
    } else if (t.type === "local") {
      existing.localKm += t.kmRun;
      existing.localTrips += 1;
    } else {
      existing.outStationKm += t.kmRun;
      existing.outStationTrips += 1;
    }
    if (t.date && (!existing.lastTripDate || t.date > existing.lastTripDate)) {
      existing.lastTripDate = t.date;
    }
    driverKmMap.set(t.driverName, existing);
  }

  const driverKmSummary: DriverKmSummary[] = Array.from(driverKmMap.entries())
    .map(([driverName, stat]) => ({
      driverName,
      totalKm: Math.round(stat.totalKm * 10) / 10,
      unit2Km: Math.round(stat.unit2Km * 10) / 10,
      localKm: Math.round(stat.localKm * 10) / 10,
      outStationKm: Math.round(stat.outStationKm * 10) / 10,
      totalTrips: stat.totalTrips,
      unit2Trips: stat.unit2Trips,
      localTrips: stat.localTrips,
      outStationTrips: stat.outStationTrips,
      avgKmPerTrip: stat.totalTrips > 0 ? Math.round((stat.totalKm / stat.totalTrips) * 10) / 10 : 0,
      totalMinutes: stat.totalMinutes,
      totalHoursFormatted: formatDuration(stat.totalMinutes),
      lastTripDate: stat.lastTripDate,
    }))
    .sort((a, b) => b.totalKm - a.totalKm);

  // 2.b Total KM trips by Unit 2, Local or Out of Station (Trip type breakdown)
  const computeTypeBreakdown = (type: "unit-2" | "local" | "out-station", label: string): TripTypeBreakdown => {
    const trips = filteredTrips.filter((t) => t.type === type);
    const count = trips.length;
    const totalKm = trips.reduce((acc, t) => acc + t.kmRun, 0);
    const totalMinutes = trips.reduce((acc, t) => acc + t.durationMinutes, 0);
    const avgKm = count > 0 ? Math.round((totalKm / count) * 10) / 10 : 0;
    const avgMin = count > 0 ? Math.round(totalMinutes / count) : 0;
    return {
      type,
      typeLabel: label,
      tripCount: count,
      totalKm: Math.round(totalKm * 10) / 10,
      avgKmPerTrip: avgKm,
      totalMinutes,
      totalHoursFormatted: formatDuration(totalMinutes),
      avgMinutesPerTrip: avgMin,
      avgHoursFormatted: formatDuration(avgMin),
    };
  };

  const typeSummary: TripTypeBreakdown[] = [
    computeTypeBreakdown("unit-2", "Unit 2 Transfers"),
    computeTypeBreakdown("local", "Local Trips"),
    computeTypeBreakdown("out-station", "Out of Station Trips"),
  ];

  // 2.c Total KM station wise by driver
  const stationDriverMap = new Map<string, {
    station: string;
    driverName: string;
    type: "unit-2" | "local" | "out-station";
    tripCount: number;
    totalKm: number;
    totalMinutes: number;
  }>();

  for (const t of filteredTrips) {
    const key = `${t.station}__${t.driverName}__${t.type}`;
    const existing = stationDriverMap.get(key) || {
      station: t.station,
      driverName: t.driverName,
      type: t.type,
      tripCount: 0,
      totalKm: 0,
      totalMinutes: 0,
    };
    existing.tripCount += 1;
    existing.totalKm += t.kmRun;
    existing.totalMinutes += t.durationMinutes;
    stationDriverMap.set(key, existing);
  }

  const stationDriverSummary: StationDriverSummary[] = Array.from(stationDriverMap.values())
    .map((item) => ({
      station: item.station,
      driverName: item.driverName,
      type: item.type,
      typeLabel: item.type === "local" ? "Local" : "Out of Station",
      tripCount: item.tripCount,
      totalKm: Math.round(item.totalKm * 10) / 10,
      avgKmPerTrip: item.tripCount > 0 ? Math.round((item.totalKm / item.tripCount) * 10) / 10 : 0,
      totalMinutes: item.totalMinutes,
      totalHoursFormatted: formatDuration(item.totalMinutes),
    }))
    .sort((a, b) => b.totalKm - a.totalKm || a.station.localeCompare(b.station));

  // 3. No of hours per driver per month
  const driverMonthMap = new Map<string, {
    month: string;
    monthLabel: string;
    driverName: string;
    totalMinutes: number;
    localMinutes: number;
    outStationMinutes: number;
    totalTrips: number;
    localTrips: number;
    outStationTrips: number;
    totalKm: number;
  }>();

  for (const t of filteredTrips) {
    const key = `${t.month}__${t.driverName}`;
    const existing = driverMonthMap.get(key) || {
      month: t.month,
      monthLabel: t.monthLabel,
      driverName: t.driverName,
      totalMinutes: 0,
      localMinutes: 0,
      outStationMinutes: 0,
      totalTrips: 0,
      localTrips: 0,
      outStationTrips: 0,
      totalKm: 0,
    };
    existing.totalTrips += 1;
    existing.totalKm += t.kmRun;
    existing.totalMinutes += t.durationMinutes;
    if (t.type === "local") {
      existing.localTrips += 1;
      existing.localMinutes += t.durationMinutes;
    } else {
      existing.outStationTrips += 1;
      existing.outStationMinutes += t.durationMinutes;
    }
    driverMonthMap.set(key, existing);
  }

  const driverMonthlyHours: DriverMonthlyHoursSummary[] = Array.from(driverMonthMap.values())
    .map((item) => {
      const avgMin = item.totalTrips > 0 ? Math.round(item.totalMinutes / item.totalTrips) : 0;
      return {
        month: item.month,
        monthLabel: item.monthLabel,
        driverName: item.driverName,
        totalMinutes: item.totalMinutes,
        totalHoursFormatted: formatDuration(item.totalMinutes),
        totalHoursDecimal: Math.round((item.totalMinutes / 60) * 100) / 100,
        localMinutes: item.localMinutes,
        localHoursFormatted: formatDuration(item.localMinutes),
        outStationMinutes: item.outStationMinutes,
        outStationHoursFormatted: formatDuration(item.outStationMinutes),
        totalTrips: item.totalTrips,
        localTrips: item.localTrips,
        outStationTrips: item.outStationTrips,
        totalKm: Math.round(item.totalKm * 10) / 10,
        avgHoursFormatted: formatDuration(avgMin),
      };
    })
    .sort((a, b) => b.month.localeCompare(a.month) || b.totalMinutes - a.totalMinutes);

  // 4. Car wise report per month
  const carMonthMap = new Map<string, {
    month: string;
    monthLabel: string;
    carName: string;
    totalKm: number;
    totalTrips: number;
    localTrips: number;
    outStationTrips: number;
    totalMinutes: number;
    drivers: Set<string>;
    destinations: Set<string>;
  }>();

  for (const t of filteredTrips) {
    const key = `${t.month}__${t.carName}`;
    const existing = carMonthMap.get(key) || {
      month: t.month,
      monthLabel: t.monthLabel,
      carName: t.carName,
      totalKm: 0,
      totalTrips: 0,
      localTrips: 0,
      outStationTrips: 0,
      totalMinutes: 0,
      drivers: new Set<string>(),
      destinations: new Set<string>(),
    };
    existing.totalTrips += 1;
    existing.totalKm += t.kmRun;
    existing.totalMinutes += t.durationMinutes;
    if (t.type === "local") {
      existing.localTrips += 1;
    } else {
      existing.outStationTrips += 1;
    }
    if (t.driverName && t.driverName !== "UNKNOWN") existing.drivers.add(t.driverName);
    if (t.station && t.station !== "Unspecified") existing.destinations.add(t.station);
    carMonthMap.set(key, existing);
  }

  const carMonthlySummary: CarMonthlySummary[] = Array.from(carMonthMap.values())
    .map((item) => ({
      month: item.month,
      monthLabel: item.monthLabel,
      carName: item.carName,
      totalKm: Math.round(item.totalKm * 10) / 10,
      totalTrips: item.totalTrips,
      localTrips: item.localTrips,
      outStationTrips: item.outStationTrips,
      totalMinutes: item.totalMinutes,
      totalHoursFormatted: formatDuration(item.totalMinutes),
      avgKmPerTrip: item.totalTrips > 0 ? Math.round((item.totalKm / item.totalTrips) * 10) / 10 : 0,
      drivers: Array.from(item.drivers).sort(),
      destinations: Array.from(item.destinations).sort(),
    }))
    .sort((a, b) => b.month.localeCompare(a.month) || b.totalKm - a.totalKm);

  // 4.b Consolidated Car Summary (Joins all trips/months per car)
  const carConsolidatedMap = new Map<string, {
    carName: string;
    totalKm: number;
    totalTrips: number;
    localTrips: number;
    outStationTrips: number;
    totalMinutes: number;
    monthlyMap: Map<string, {
      month: string;
      monthLabel: string;
      totalKm: number;
      totalTrips: number;
      localTrips: number;
      outStationTrips: number;
      totalMinutes: number;
    }>;
  }>();

  for (const t of filteredTrips) {
    const existing = carConsolidatedMap.get(t.carName) || {
      carName: t.carName,
      totalKm: 0,
      totalTrips: 0,
      localTrips: 0,
      outStationTrips: 0,
      totalMinutes: 0,
      monthlyMap: new Map(),
    };
    existing.totalTrips += 1;
    existing.totalKm += t.kmRun;
    existing.totalMinutes += t.durationMinutes;
    if (t.type === "local") {
      existing.localTrips += 1;
    } else {
      existing.outStationTrips += 1;
    }

    const monthItem = existing.monthlyMap.get(t.month) || {
      month: t.month,
      monthLabel: t.monthLabel,
      totalKm: 0,
      totalTrips: 0,
      localTrips: 0,
      outStationTrips: 0,
      totalMinutes: 0,
    };
    monthItem.totalTrips += 1;
    monthItem.totalKm += t.kmRun;
    monthItem.totalMinutes += t.durationMinutes;
    if (t.type === "local") {
      monthItem.localTrips += 1;
    } else {
      monthItem.outStationTrips += 1;
    }
    existing.monthlyMap.set(t.month, monthItem);

    carConsolidatedMap.set(t.carName, existing);
  }

  const carSummary: CarConsolidatedSummary[] = Array.from(carConsolidatedMap.values())
    .map((item) => {
      const monthlyBreakdown = Array.from(item.monthlyMap.values())
        .map((m) => ({
          month: m.month,
          monthLabel: m.monthLabel,
          totalKm: Math.round(m.totalKm * 10) / 10,
          totalTrips: m.totalTrips,
          localTrips: m.localTrips,
          outStationTrips: m.outStationTrips,
          totalMinutes: m.totalMinutes,
          totalHoursFormatted: formatDuration(m.totalMinutes),
        }))
        .sort((a, b) => b.month.localeCompare(a.month));

      const months = monthlyBreakdown.map((m) => m.monthLabel);
      const monthsFormatted = monthlyBreakdown
        .map((m) => `${m.monthLabel} (${m.totalKm} km)`)
        .join(", ");

      return {
        carName: item.carName,
        totalKm: Math.round(item.totalKm * 10) / 10,
        totalTrips: item.totalTrips,
        localTrips: item.localTrips,
        outStationTrips: item.outStationTrips,
        totalMinutes: item.totalMinutes,
        totalHoursFormatted: formatDuration(item.totalMinutes),
        avgKmPerTrip: item.totalTrips > 0 ? Math.round((item.totalKm / item.totalTrips) * 10) / 10 : 0,
        months,
        monthsFormatted,
        monthlyBreakdown,
      };
    })
    .sort((a, b) => b.totalKm - a.totalKm);

  // 5. Location wise report per month
  const locationMonthMap = new Map<string, {
    month: string;
    monthLabel: string;
    location: string;
    totalKm: number;
    totalTrips: number;
    localTrips: number;
    outStationTrips: number;
    totalMinutes: number;
    cars: Set<string>;
    drivers: Set<string>;
  }>();

  for (const t of filteredTrips) {
    const key = `${t.month}__${t.station}`;
    const existing = locationMonthMap.get(key) || {
      month: t.month,
      monthLabel: t.monthLabel,
      location: t.station,
      totalKm: 0,
      totalTrips: 0,
      localTrips: 0,
      outStationTrips: 0,
      totalMinutes: 0,
      cars: new Set<string>(),
      drivers: new Set<string>(),
    };
    existing.totalTrips += 1;
    existing.totalKm += t.kmRun;
    existing.totalMinutes += t.durationMinutes;
    if (t.type === "local") {
      existing.localTrips += 1;
    } else {
      existing.outStationTrips += 1;
    }
    if (t.carName && t.carName !== "—") existing.cars.add(t.carName);
    if (t.driverName && t.driverName !== "UNKNOWN") existing.drivers.add(t.driverName);
    locationMonthMap.set(key, existing);
  }

  const locationMonthlySummary: LocationMonthlySummary[] = Array.from(locationMonthMap.values())
    .map((item) => ({
      month: item.month,
      monthLabel: item.monthLabel,
      location: item.location,
      totalKm: Math.round(item.totalKm * 10) / 10,
      totalTrips: item.totalTrips,
      localTrips: item.localTrips,
      outStationTrips: item.outStationTrips,
      totalMinutes: item.totalMinutes,
      totalHoursFormatted: formatDuration(item.totalMinutes),
      avgKmPerTrip: item.totalTrips > 0 ? Math.round((item.totalKm / item.totalTrips) * 10) / 10 : 0,
      cars: Array.from(item.cars).sort(),
      drivers: Array.from(item.drivers).sort(),
    }))
    .sort((a, b) => b.month.localeCompare(a.month) || b.totalTrips - a.totalTrips);

  // 5.b Consolidated Location Summary (Joins all trips/months per location)
  const locationConsolidatedMap = new Map<string, {
    location: string;
    totalKm: number;
    totalTrips: number;
    localTrips: number;
    outStationTrips: number;
    totalMinutes: number;
    monthlyMap: Map<string, {
      month: string;
      monthLabel: string;
      totalKm: number;
      totalTrips: number;
      localTrips: number;
      outStationTrips: number;
      totalMinutes: number;
    }>;
  }>();

  for (const t of filteredTrips) {
    const existing = locationConsolidatedMap.get(t.station) || {
      location: t.station,
      totalKm: 0,
      totalTrips: 0,
      localTrips: 0,
      outStationTrips: 0,
      totalMinutes: 0,
      monthlyMap: new Map(),
    };
    existing.totalTrips += 1;
    existing.totalKm += t.kmRun;
    existing.totalMinutes += t.durationMinutes;
    if (t.type === "local") {
      existing.localTrips += 1;
    } else {
      existing.outStationTrips += 1;
    }

    const monthItem = existing.monthlyMap.get(t.month) || {
      month: t.month,
      monthLabel: t.monthLabel,
      totalKm: 0,
      totalTrips: 0,
      localTrips: 0,
      outStationTrips: 0,
      totalMinutes: 0,
    };
    monthItem.totalTrips += 1;
    monthItem.totalKm += t.kmRun;
    monthItem.totalMinutes += t.durationMinutes;
    if (t.type === "local") {
      monthItem.localTrips += 1;
    } else {
      monthItem.outStationTrips += 1;
    }
    existing.monthlyMap.set(t.month, monthItem);

    locationConsolidatedMap.set(t.station, existing);
  }

  const locationSummary: LocationConsolidatedSummary[] = Array.from(locationConsolidatedMap.values())
    .map((item) => {
      const monthlyBreakdown = Array.from(item.monthlyMap.values())
        .map((m) => ({
          month: m.month,
          monthLabel: m.monthLabel,
          totalKm: Math.round(m.totalKm * 10) / 10,
          totalTrips: m.totalTrips,
          localTrips: m.localTrips,
          outStationTrips: m.outStationTrips,
          totalMinutes: m.totalMinutes,
          totalHoursFormatted: formatDuration(m.totalMinutes),
        }))
        .sort((a, b) => b.month.localeCompare(a.month));

      const months = monthlyBreakdown.map((m) => m.monthLabel);
      const monthsFormatted = monthlyBreakdown
        .map((m) => `${m.monthLabel} (${m.totalKm} km)`)
        .join(", ");

      return {
        location: item.location,
        totalKm: Math.round(item.totalKm * 10) / 10,
        totalTrips: item.totalTrips,
        localTrips: item.localTrips,
        outStationTrips: item.outStationTrips,
        totalMinutes: item.totalMinutes,
        totalHoursFormatted: formatDuration(item.totalMinutes),
        avgKmPerTrip: item.totalTrips > 0 ? Math.round((item.totalKm / item.totalTrips) * 10) / 10 : 0,
        months,
        monthsFormatted,
        monthlyBreakdown,
      };
    })
    .sort((a, b) => b.totalTrips - a.totalTrips);

  // 6. Destination covered in month by car
  const carDestMonthMap = new Map<string, {
    month: string;
    monthLabel: string;
    carName: string;
    destination: string;
    totalTrips: number;
    totalKm: number;
    totalMinutes: number;
    drivers: Set<string>;
  }>();

  for (const t of filteredTrips) {
    const key = `${t.month}__${t.carName}__${t.station}`;
    const existing = carDestMonthMap.get(key) || {
      month: t.month,
      monthLabel: t.monthLabel,
      carName: t.carName,
      destination: t.station,
      totalTrips: 0,
      totalKm: 0,
      totalMinutes: 0,
      drivers: new Set<string>(),
    };
    existing.totalTrips += 1;
    existing.totalKm += t.kmRun;
    existing.totalMinutes += t.durationMinutes;
    if (t.driverName && t.driverName !== "UNKNOWN") existing.drivers.add(t.driverName);
    carDestMonthMap.set(key, existing);
  }

  const carDestinationMonthlySummary: CarDestinationMonthlySummary[] = Array.from(carDestMonthMap.values())
    .map((item) => ({
      month: item.month,
      monthLabel: item.monthLabel,
      carName: item.carName,
      destination: item.destination,
      totalTrips: item.totalTrips,
      totalKm: Math.round(item.totalKm * 10) / 10,
      totalMinutes: item.totalMinutes,
      totalHoursFormatted: formatDuration(item.totalMinutes),
      avgKmPerTrip: item.totalTrips > 0 ? Math.round((item.totalKm / item.totalTrips) * 10) / 10 : 0,
      drivers: Array.from(item.drivers).sort(),
    }))
    .sort((a, b) => b.month.localeCompare(a.month) || a.carName.localeCompare(b.carName) || b.totalTrips - a.totalTrips);

  // Overall totals across filtered set
  const totalTrips = filteredTrips.length;
  const totalKm = Math.round(filteredTrips.reduce((acc, t) => acc + t.kmRun, 0) * 10) / 10;
  const totalMinutes = filteredTrips.reduce((acc, t) => acc + t.durationMinutes, 0);

  const unit2TripsSubset = filteredTrips.filter((t) => t.type === "unit-2");
  const localTripsSubset = filteredTrips.filter((t) => t.type === "local");
  const outStationTripsSubset = filteredTrips.filter((t) => t.type === "out-station");

  const unit2Km = Math.round(unit2TripsSubset.reduce((acc, t) => acc + t.kmRun, 0) * 10) / 10;
  const unit2Minutes = unit2TripsSubset.reduce((acc, t) => acc + t.durationMinutes, 0);

  const localKm = Math.round(localTripsSubset.reduce((acc, t) => acc + t.kmRun, 0) * 10) / 10;
  const localMinutes = localTripsSubset.reduce((acc, t) => acc + t.durationMinutes, 0);

  const outStationKm = Math.round(outStationTripsSubset.reduce((acc, t) => acc + t.kmRun, 0) * 10) / 10;
  const outStationMinutes = outStationTripsSubset.reduce((acc, t) => acc + t.durationMinutes, 0);

  const availableMonths = Array.from(allMonthsMap.entries())
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => b.key.localeCompare(a.key));

  return {
    from: from || "",
    to: to || "",
    filterDriver: filterDriver || "ALL",
    filterType: filterType || "all",
    filterMonth: filterMonth || "ALL",
    filterCar: filterCar || "ALL",
    availableDrivers: Array.from(allDriversSet).sort(),
    availableStations: Array.from(allStationsSet).sort(),
    availableCars: Array.from(allCarsSet).sort(),
    availableMonths,
    totals: {
      totalTrips,
      totalKm,
      totalMinutes,
      totalHoursFormatted: formatDuration(totalMinutes),
      unit2Trips: unit2TripsSubset.length,
      unit2Km,
      unit2Minutes,
      unit2HoursFormatted: formatDuration(unit2Minutes),
      localTrips: localTripsSubset.length,
      localKm,
      localMinutes,
      localHoursFormatted: formatDuration(localMinutes),
      outStationTrips: outStationTripsSubset.length,
      outStationKm,
      outStationMinutes,
      outStationHoursFormatted: formatDuration(outStationMinutes),
    },
    localTimeSummary,
    driverKmSummary,
    typeSummary,
    stationDriverSummary,
    driverMonthlyHours,
    carMonthlySummary,
    carSummary,
    locationMonthlySummary,
    locationSummary,
    carDestinationMonthlySummary,
    trips: filteredTrips,
  };
};

const dateInIndiaStr = (value: Date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
};

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

export const getLiveDriverPresence = async (customDate?: string): Promise<DriverLivePresenceReport> => {
  const targetDate = customDate ? normalizeToIsoDate(customDate) : dateInIndiaStr();

  const rows = await db
    .select()
    .from(registerRecordsTable)
    .where(
      inArray(registerRecordsTable.registerSlug, [
        "driver-master",
        "driver-attendance",
        "outgoing-vehicle-log",
        "outgoing-vehicles",
        "driver-schedule",
        "car-breakdowns",
        "car-breakdown",
      ])
    )
    .orderBy(desc(registerRecordsTable.createdAt));

  type MasterInfo = {
    name: string;
    phone: string;
    workLocation: string;
    supervisor: string;
  };
  const masterDrivers = new Map<string, MasterInfo>();

  type AttendanceInfo = {
    inTime: string;
    outTime: string;
    station: boolean;
    stationName: string;
  };
  const attendanceToday = new Map<string, AttendanceInfo>();

  type ActiveTripInfo = {
    carName: string;
    station: string;
    outTime: string;
    personInCar: string;
    tripType: "unit-2" | "local" | "out-station";
  };
  const activeTrips = new Map<string, ActiveTripInfo>();
  const tripsCompletedToday = new Map<string, { count: number; km: number }>();

  type ScheduledInfo = {
    carName: string;
    location: string;
    scheduleTime: string;
  };
  const scheduledToday = new Map<string, ScheduledInfo>();

  const activeVehiclesList: ActiveVehicleItem[] = [];
  const serviceVehiclesList: ServiceVehicleItem[] = [];
  const allDriverNames = new Map<string, string>();

  for (const row of rows) {
    const data = (row.data ?? {}) as Record<string, unknown>;

    if (row.registerSlug === "car-breakdowns" || row.registerSlug === "car-breakdown") {
      const carName = String(data.car_name ?? "").trim();
      if (!carName) continue;
      const outDate = normalizeToIsoDate(data.date ?? row.recordDate);
      const outTime = String(data.car_out_time_for_service ?? "").trim();
      const inDate = normalizeToIsoDate(data.car_in_date);
      const inTime = String(data.car_in_time_after_service ?? "").trim();
      const totalTimeConsumed = String(data.total_time_consumed_in_service ?? "").trim();
      const isCompleted = Boolean(inTime && inDate);

      serviceVehiclesList.push({
        recordId: row.id,
        carName,
        outDate,
        outTime,
        inDate: inDate || undefined,
        inTime: inTime || undefined,
        totalTimeConsumed: totalTimeConsumed || undefined,
        isCompleted,
      });
      continue;
    }

    if (row.registerSlug === "driver-master") {
      const name = String(data.name ?? "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      allDriverNames.set(key, name);
      masterDrivers.set(key, {
        name,
        phone: String(data.mobile_no ?? data.mobile ?? data.phone ?? "").trim(),
        workLocation: String(data.work_location ?? "").trim(),
        supervisor: String(data.supervisor ?? "").trim(),
      });
      continue;
    }

    if (row.registerSlug === "driver-attendance") {
      const name = String(data.name ?? "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      allDriverNames.set(key, name);

      const recDate = normalizeToIsoDate(data.date_of_in_time ?? data.date ?? row.recordDate);
      if (recDate === targetDate && !attendanceToday.has(key)) {
        attendanceToday.set(key, {
          inTime: String(data.in_time ?? "").trim(),
          outTime: String(data.out_time ?? "").trim(),
          station: String(data.station ?? "").trim().toLowerCase() === "yes",
          stationName: String(data.station_name ?? "").trim(),
        });
      }
      continue;
    }

    if (row.registerSlug === "driver-schedule") {
      const name = String(data.choosen_driver ?? data.name ?? "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      allDriverNames.set(key, name);

      const recDate = normalizeToIsoDate(data.date ?? row.recordDate);
      if (recDate === targetDate && !scheduledToday.has(key)) {
        scheduledToday.set(key, {
          carName: String(data.car_name ?? "").trim(),
          location: String(data.location ?? "").trim(),
          scheduleTime: String(data.schedule_time ?? "").trim(),
        });
      }
      continue;
    }

    if (row.registerSlug === "outgoing-vehicle-log" || row.registerSlug === "outgoing-vehicles") {
      const name = String(data.driver_name ?? data.driver ?? "").trim();
      if (name) {
        const key = name.toLowerCase();
        allDriverNames.set(key, name);
      }

      const recDate = normalizeToIsoDate(data.date ?? row.recordDate);
      const outTime = String(data.out_time ?? "").trim();
      const inTime = String(data.in_time ?? "").trim();

      const rawChoice = String(data.station ?? data.station_choice ?? "").trim().toLowerCase();
      let tripType: "unit-2" | "local" | "out-station" = "local";
      if (rawChoice === "unit 2" || rawChoice === "unit-2") {
        tripType = "unit-2";
      } else if (rawChoice === "out of station" || rawChoice === "out-station" || (!rawChoice && row.registerSlug === "outgoing-vehicles")) {
        tripType = "out-station";
      } else {
        tripType = "local";
      }

      const carName = String(data.car_name ?? data.vehicle_name ?? data.car ?? "Car").trim();

      const rawStation = String(
        (data.station_name && !["unit 2", "other", "local", "out of station"].includes(String(data.station_name).trim().toLowerCase()) ? data.station_name : undefined)
        ?? (data.location && !["unit 2", "other", "local", "out of station"].includes(String(data.location).trim().toLowerCase()) ? data.location : undefined)
        ?? data.station_name
        ?? data.location
        ?? data.destination
        ?? (tripType === "unit-2" ? "Unit 2" : tripType === "local" ? "Local" : "Out of Station")
      ).trim();

      const initial = parseNum(data.initial_reading ?? data.initialReading);
      const final = parseNum(data.final_reading ?? data.finalReading);
      const hasReturned = Boolean(inTime || (final > 0));

      if (outTime && !hasReturned) {
        activeVehiclesList.push({
          recordId: row.id,
          registerSlug: row.registerSlug as "outgoing-vehicles" | "outgoing-vehicle-log",
          carName,
          driverName: name || "Unassigned",
          station: rawStation || "On Duty",
          outTime,
          personInCar: String(data.name_of_the_person_in_car ?? data.person_in_car ?? data.passenger ?? "—").trim(),
          tripType,
          date: recDate || targetDate,
        });

        if (name && !activeTrips.has(name.toLowerCase())) {
          activeTrips.set(name.toLowerCase(), {
            carName,
            station: rawStation || "On Duty",
            outTime,
            personInCar: String(data.name_of_the_person_in_car ?? data.person_in_car ?? data.passenger ?? "—").trim(),
            tripType,
          });
        }
      }

      if (recDate === targetDate && hasReturned) {
        const key = name.toLowerCase();
        const prev = tripsCompletedToday.get(key) || { count: 0, km: 0 };
        let km = parseNum(data.total_km_car_run ?? data.totalKmCarRun ?? data.total_km);
        if (!km && final > initial && initial > 0) km = final - initial;
        tripsCompletedToday.set(key, { count: prev.count + 1, km: prev.km + Math.max(0, km) });
      }
    }
  }

  const driversList: DriverLivePresenceItem[] = [];

  for (const [key, displayName] of allDriverNames.entries()) {
    const master = masterDrivers.get(key);
    const attendance = attendanceToday.get(key);
    const activeTrip = activeTrips.get(key);
    const schedule = scheduledToday.get(key);
    const tripsStats = tripsCompletedToday.get(key) || { count: 0, km: 0 };

    let liveStatus: DriverLivePresenceItem["liveStatus"] = "not_reported";
    let liveStatusLabel = "Not Logged Today";

    if (attendance) {
      if (attendance.inTime && !attendance.outTime) {
        if (activeTrip) {
          liveStatus = activeTrip.tripType === "out-station" ? "on_station" : "on_trip";
          liveStatusLabel = activeTrip.tripType === "out-station"
            ? `On Out-Station (${activeTrip.carName} → ${activeTrip.station})`
            : `On Trip (${activeTrip.carName} → ${activeTrip.station})`;
        } else if (attendance.station) {
          liveStatus = "on_station";
          liveStatusLabel = `On Out-Station (${attendance.stationName || "Assigned"})`;
        } else {
          liveStatus = "available";
          liveStatusLabel = "Present & Available on Premises";
        }
      } else if (attendance.outTime) {
        liveStatus = "punched_out";
        liveStatusLabel = `Shift Ended (Out: ${attendance.outTime})`;
      } else {
        liveStatus = "available";
        liveStatusLabel = "Present on Duty";
      }
    } else if (activeTrip) {
      liveStatus = activeTrip.tripType === "out-station" ? "on_station" : "on_trip";
      liveStatusLabel = activeTrip.tripType === "out-station"
        ? `On Out-Station (${activeTrip.carName} → ${activeTrip.station})`
        : `On Trip (${activeTrip.carName} → ${activeTrip.station})`;
    }

    driversList.push({
      driverName: master?.name || displayName,
      phone: master?.phone || "",
      workLocation: master?.workLocation || "",
      supervisor: master?.supervisor || "",
      liveStatus,
      liveStatusLabel,
      inTime: attendance?.inTime || undefined,
      outTime: attendance?.outTime || undefined,
      stationTrip: attendance?.station,
      stationName: attendance?.stationName || undefined,
      activeTrip,
      scheduledTrip: schedule,
      todayTripsCount: tripsStats.count,
      todayKm: Math.round(tripsStats.km * 10) / 10,
    });
  }

  const statusRank: Record<string, number> = {
    available: 1,
    on_trip: 2,
    on_station: 3,
    punched_out: 4,
    not_reported: 5,
  };

  driversList.sort((a, b) => {
    const rankDiff = (statusRank[a.liveStatus] || 99) - (statusRank[b.liveStatus] || 99);
    if (rankDiff !== 0) return rankDiff;
    return a.driverName.localeCompare(b.driverName);
  });

  const availableNow = driversList.filter((d) => d.liveStatus === "available").length;
  const onTripNow = driversList.filter((d) => d.liveStatus === "on_trip").length;
  const onStationNow = driversList.filter((d) => d.liveStatus === "on_station").length;
  const punchedOutToday = driversList.filter((d) => d.liveStatus === "punched_out").length;
  const notReportedToday = driversList.filter((d) => d.liveStatus === "not_reported").length;
  const totalPresentToday = availableNow + onTripNow + onStationNow;
  const vehiclesOnRoad = activeVehiclesList.length;
  const vehiclesInService = serviceVehiclesList.filter((s) => !s.isCompleted).length;

  return {
    targetDate,
    summary: {
      totalRegistered: masterDrivers.size || driversList.length,
      totalPresentToday,
      availableNow,
      onTripNow,
      onStationNow,
      punchedOutToday,
      notReportedToday,
      vehiclesOnRoad,
      vehiclesInService,
    },
    drivers: driversList,
    activeVehicles: activeVehiclesList,
    serviceVehicles: serviceVehiclesList,
  };
};

export type DriverDailyTripItem = {
  recordId: string;
  tripNumber: number;
  carName: string;
  station: "Unit 2" | "Local" | "Out of Station";
  stationName: string;
  outTime: string;
  inTime: string;
  durationMinutes: number;
  durationFormatted: string;
  initialReading: number;
  finalReading: number;
  kmRun: number;
  personInCar: string;
  requestedBy: string;
  isActive: boolean;
};

export type DriverDayRecord = {
  date: string;
  dateFormatted: string;
  driverName: string;
  phone: string;
  isPresent: boolean;
  attendanceRecordId?: string;
  inTime?: string;
  dateOfInTime?: string;
  outTime?: string;
  dateOfOutTime?: string;
  presenceMinutes: number;
  presenceFormatted: string;
  isClockedOut: boolean;
  isOnDuty: boolean;
  tripCount: number;
  trips: DriverDailyTripItem[];
  totalKm: number;
  drivingMinutes: number;
  drivingFormatted: string;
  status: "idle_in_company" | "active_on_trip" | "completed_trips" | "trips_no_attendance" | "absent";
  statusLabel: string;
};

export type DriverConsolidatedSummary = {
  driverName: string;
  phone: string;
  workLocation: string;
  supervisor: string;
  daysPresent: number;
  daysWithTrips: number;
  daysIdleNoTrips: number;
  days1Trip: number;
  days2Trips: number;
  days3PlusTrips: number;
  totalTrips: number;
  localTrips: number;
  localKm: number;
  outStationTrips: number;
  outStationKm: number;
  unit2Trips: number;
  unit2Km: number;
  totalKm: number;
  totalPresenceMinutes: number;
  totalPresenceFormatted: string;
  totalDrivingMinutes: number;
  totalDrivingFormatted: string;
  avgKmPerTrip: number;
  avgTripsPerPresentDay: number;
  utilizationRate: number;
  days: DriverDayRecord[];
};

export type DriverComprehensiveReport = {
  range: { from: string; to: string };
  summary: {
    totalRegisteredDrivers: number;
    totalActiveDriversInRange: number;
    totalDutyDays: number;
    totalTripsDone: number;
    totalIdleDays: number;
    totalCombinedKm: number;
    driversWithZeroTripsCount: number;
  };
  availableDrivers: string[];
  driverSummaries: DriverConsolidatedSummary[];
  allDailyRecords: DriverDayRecord[];
};

export const getDriverComprehensiveReport = async ({
  from: rawFrom,
  to: rawTo,
  driver: selectedDriver,
}: {
  from?: string;
  to?: string;
  driver?: string;
}): Promise<DriverComprehensiveReport> => {
  const todayStr = dateInIndiaStr();
  const to = rawTo ? normalizeToIsoDate(rawTo) : todayStr;
  const from = rawFrom ? normalizeToIsoDate(rawFrom) : `${to.slice(0, 7)}-01`;

  const rows = await db
    .select()
    .from(registerRecordsTable)
    .where(
      inArray(registerRecordsTable.registerSlug, [
        "driver-master",
        "driver-attendance",
        "outgoing-vehicles",
        "outgoing-vehicle-log",
      ])
    )
    .orderBy(desc(registerRecordsTable.createdAt));

  type MasterInfo = {
    name: string;
    phone: string;
    workLocation: string;
    supervisor: string;
  };
  const masterDrivers = new Map<string, MasterInfo>();
  const allDriverNames = new Map<string, string>();

  // 1. Collect master drivers
  for (const row of rows) {
    if (row.registerSlug === "driver-master") {
      const data = (row.data ?? {}) as Record<string, unknown>;
      const name = String(data.name ?? "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      allDriverNames.set(key, name);
      masterDrivers.set(key, {
        name,
        phone: String(data.mobile_no ?? data.mobile ?? data.phone ?? "").trim(),
        workLocation: String(data.work_location ?? "").trim(),
        supervisor: String(data.supervisor ?? "").trim(),
      });
    }
  }

  type AttendanceItem = {
    recordId: string;
    inTime: string;
    dateOfInTime: string;
    outTime: string;
    dateOfOutTime: string;
    presenceMinutes: number;
    station: boolean;
    stationName: string;
  };
  const attendanceMap = new Map<string, Map<string, AttendanceItem>>();
  const tripsMap = new Map<string, Map<string, DriverDailyTripItem[]>>();

  // Process rows
  for (const row of rows) {
    const data = (row.data ?? {}) as Record<string, unknown>;

    if (row.registerSlug === "driver-attendance") {
      const name = String(data.name ?? data.driver_name ?? data.driver ?? "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!allDriverNames.has(key)) allDriverNames.set(key, name);

      const inDate = normalizeToIsoDate(data.date_of_in_time ?? data.date ?? row.recordDate);
      if (!inDate || inDate < from || inDate > to) continue;

      const inTime = String(data.in_time ?? "").trim();
      const outTime = String(data.out_time ?? "").trim();
      const dateOfInTime = String(data.date_of_in_time ?? inDate).trim();
      const dateOfOutTime = String(data.date_of_out_time ?? (outTime ? inDate : "")).trim();

      let presenceMinutes = 0;
      const inM = parseTimeMinutes(inTime);
      const outM = parseTimeMinutes(outTime);
      if (inM !== undefined && outM !== undefined) {
        presenceMinutes = (outM - inM + 1440) % 1440;
      }

      if (!attendanceMap.has(key)) attendanceMap.set(key, new Map());
      const driverAtts = attendanceMap.get(key)!;
      if (!driverAtts.has(inDate)) {
        driverAtts.set(inDate, {
          recordId: row.id,
          inTime,
          dateOfInTime,
          outTime,
          dateOfOutTime,
          presenceMinutes,
          station: String(data.station ?? "").trim().toLowerCase() === "yes",
          stationName: String(data.station_name ?? "").trim(),
        });
      }
    }

    if (row.registerSlug === "outgoing-vehicles" || row.registerSlug === "outgoing-vehicle-log") {
      const name = String(data.driver_name ?? data.driver ?? "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!allDriverNames.has(key)) allDriverNames.set(key, name);

      const tripDate = normalizeToIsoDate(data.date ?? row.recordDate);
      if (!tripDate || tripDate < from || tripDate > to) continue;

      const outTime = String(data.out_time ?? "").trim();
      const inTime = String(data.in_time ?? "").trim();
      const initial = parseNum(data.initial_reading ?? data.initialReading);
      const final = parseNum(data.final_reading ?? data.finalReading);
      let kmRun = parseNum(data.total_km_car_run ?? data.totalKmCarRun ?? data.total_km);
      if (!kmRun && final > initial && initial > 0) kmRun = final - initial;
      kmRun = Math.max(0, kmRun);

      let durationMinutes = 0;
      const outM = parseTimeMinutes(outTime);
      const inM = parseTimeMinutes(inTime);
      if (outM !== undefined && inM !== undefined) {
        durationMinutes = (inM - outM + 1440) % 1440;
      }

      const rawChoice = String(data.station ?? data.station_choice ?? "").trim().toLowerCase();
      let stationType: "Unit 2" | "Local" | "Out of Station" = "Local";
      if (rawChoice === "unit 2" || rawChoice === "unit-2") {
        stationType = "Unit 2";
      } else if (rawChoice === "out of station" || rawChoice === "out-station" || (!rawChoice && row.registerSlug === "outgoing-vehicles")) {
        stationType = "Out of Station";
      } else {
        stationType = "Local";
      }

      const stationName = String(data.station_name ?? data.location ?? data.destination ?? stationType).trim();
      const carName = String(data.car_name ?? data.vehicle_name ?? data.car ?? "Car").trim();
      const isActive = Boolean(outTime && !inTime && (!final || final <= 0));

      if (!tripsMap.has(key)) tripsMap.set(key, new Map());
      const driverTripsByDate = tripsMap.get(key)!;
      if (!driverTripsByDate.has(tripDate)) driverTripsByDate.set(tripDate, []);

      const list = driverTripsByDate.get(tripDate)!;
      list.push({
        recordId: row.id,
        tripNumber: list.length + 1,
        carName,
        station: stationType,
        stationName,
        outTime,
        inTime,
        durationMinutes,
        durationFormatted: formatDuration(durationMinutes),
        initialReading: initial,
        finalReading: final,
        kmRun: Math.round(kmRun * 10) / 10,
        personInCar: String(data.name_of_the_person_in_car ?? data.person_in_car ?? data.passenger ?? "—").trim(),
        requestedBy: String(data.requested_by_whom ?? data.requested_by ?? "—").trim(),
        isActive,
      });
    }
  }

  // Filter target drivers
  const targetDriverKeys = selectedDriver && selectedDriver !== "ALL"
    ? [selectedDriver.toLowerCase()]
    : Array.from(allDriverNames.keys());

  const driverSummaries: DriverConsolidatedSummary[] = [];
  const allDailyRecords: DriverDayRecord[] = [];

  let totalDutyDaysCount = 0;
  let totalTripsDoneCount = 0;
  let totalIdleDaysCount = 0;
  let totalCombinedKmCount = 0;
  let driversWithZeroTripsCount = 0;

  for (const key of targetDriverKeys) {
    const displayName = allDriverNames.get(key) || masterDrivers.get(key)?.name || key.toUpperCase();
    const master = masterDrivers.get(key);
    const phone = master?.phone || "";
    const workLocation = master?.workLocation || "";
    const supervisor = master?.supervisor || "";

    const driverAtts = attendanceMap.get(key) || new Map<string, AttendanceItem>();
    const driverTrips = tripsMap.get(key) || new Map<string, DriverDailyTripItem[]>();

    const dateSet = new Set<string>();
    for (const d of driverAtts.keys()) dateSet.add(d);
    for (const d of driverTrips.keys()) dateSet.add(d);

    if (from === to && master) {
      dateSet.add(from);
    }

    const sortedDates = Array.from(dateSet).sort();

    const dailyRecordsForDriver: DriverDayRecord[] = [];
    let driverTotalTrips = 0;
    let driverLocalTrips = 0;
    let driverLocalKm = 0;
    let driverOutStationTrips = 0;
    let driverOutStationKm = 0;
    let driverUnit2Trips = 0;
    let driverUnit2Km = 0;
    let driverTotalKm = 0;
    let driverPresenceMinutes = 0;
    let driverDrivingMinutes = 0;
    let driverDaysPresent = 0;
    let driverDaysWithTrips = 0;
    let driverDaysIdleNoTrips = 0;
    let driverDays1Trip = 0;
    let driverDays2Trips = 0;
    let driverDays3PlusTrips = 0;

    for (const d of sortedDates) {
      const att = driverAtts.get(d);
      const dayTrips = (driverTrips.get(d) || []).map((t, idx) => ({ ...t, tripNumber: idx + 1 }));
      const isPresent = Boolean(att);
      const tripCount = dayTrips.length;

      let dayKm = 0;
      let dayDrivingMinutes = 0;
      for (const t of dayTrips) {
        dayKm += t.kmRun;
        dayDrivingMinutes += t.durationMinutes;
        driverTotalTrips += 1;
        if (t.station === "Unit 2") {
          driverUnit2Trips += 1;
          driverUnit2Km += t.kmRun;
        } else if (t.station === "Out of Station") {
          driverOutStationTrips += 1;
          driverOutStationKm += t.kmRun;
        } else {
          driverLocalTrips += 1;
          driverLocalKm += t.kmRun;
        }
      }

      driverTotalKm += dayKm;
      driverDrivingMinutes += dayDrivingMinutes;
      if (isPresent && att) {
        driverDaysPresent += 1;
        driverPresenceMinutes += att.presenceMinutes;
        totalDutyDaysCount += 1;
      }

      if (tripCount > 0) {
        driverDaysWithTrips += 1;
        if (tripCount === 1) driverDays1Trip += 1;
        else if (tripCount === 2) driverDays2Trips += 1;
        else driverDays3PlusTrips += 1;
      } else if (isPresent) {
        driverDaysIdleNoTrips += 1;
        totalIdleDaysCount += 1;
      }

      totalTripsDoneCount += tripCount;
      totalCombinedKmCount += dayKm;

      let status: DriverDayRecord["status"] = "absent";
      let statusLabel = "Absent / Not Punched In";

      if (dayTrips.some((t) => t.isActive)) {
        status = "active_on_trip";
        const act = dayTrips.find((t) => t.isActive)!;
        statusLabel = `On Trip (${act.carName} → ${act.stationName})`;
      } else if (isPresent && tripCount === 0) {
        status = "idle_in_company";
        statusLabel = "Present in Company (0 Trips)";
      } else if (isPresent && tripCount === 1) {
        status = "completed_trips";
        statusLabel = "1 Trip Completed";
      } else if (isPresent && tripCount === 2) {
        status = "completed_trips";
        statusLabel = "2 Trips Completed";
      } else if (isPresent && tripCount > 2) {
        status = "completed_trips";
        statusLabel = `${tripCount} Trips Completed`;
      } else if (!isPresent && tripCount > 0) {
        status = "trips_no_attendance";
        statusLabel = `${tripCount} Trip(s) Done (No Attendance)`;
      }

      const [y, m, dayNum] = d.split("-");
      const dateFormatted = `${dayNum}-${m}-${y}`;

      const dayRec: DriverDayRecord = {
        date: d,
        dateFormatted,
        driverName: displayName,
        phone,
        isPresent,
        attendanceRecordId: att?.recordId,
        inTime: att?.inTime || undefined,
        dateOfInTime: att?.dateOfInTime || undefined,
        outTime: att?.outTime || undefined,
        dateOfOutTime: att?.dateOfOutTime || undefined,
        presenceMinutes: att?.presenceMinutes || 0,
        presenceFormatted: formatDuration(att?.presenceMinutes || 0),
        isClockedOut: Boolean(att?.outTime && att.outTime !== "—"),
        isOnDuty: Boolean(att?.inTime && (!att.outTime || att.outTime === "—")),
        tripCount,
        trips: dayTrips,
        totalKm: Math.round(dayKm * 10) / 10,
        drivingMinutes: dayDrivingMinutes,
        drivingFormatted: formatDuration(dayDrivingMinutes),
        status,
        statusLabel,
      };

      dailyRecordsForDriver.push(dayRec);
      allDailyRecords.push(dayRec);
    }

    if (driverDaysPresent > 0 && driverTotalTrips === 0) {
      driversWithZeroTripsCount += 1;
    }

    const avgKmPerTrip = driverTotalTrips > 0 ? Math.round((driverTotalKm / driverTotalTrips) * 10) / 10 : 0;
    const avgTripsPerPresentDay = driverDaysPresent > 0 ? Math.round((driverTotalTrips / driverDaysPresent) * 10) / 10 : 0;
    const utilizationRate = driverDaysPresent > 0 ? Math.round((driverDaysWithTrips / driverDaysPresent) * 100) : 0;

    driverSummaries.push({
      driverName: displayName,
      phone,
      workLocation,
      supervisor,
      daysPresent: driverDaysPresent,
      daysWithTrips: driverDaysWithTrips,
      daysIdleNoTrips: driverDaysIdleNoTrips,
      days1Trip: driverDays1Trip,
      days2Trips: driverDays2Trips,
      days3PlusTrips: driverDays3PlusTrips,
      totalTrips: driverTotalTrips,
      localTrips: driverLocalTrips,
      localKm: Math.round(driverLocalKm * 10) / 10,
      outStationTrips: driverOutStationTrips,
      outStationKm: Math.round(driverOutStationKm * 10) / 10,
      unit2Trips: driverUnit2Trips,
      unit2Km: Math.round(driverUnit2Km * 10) / 10,
      totalKm: Math.round(driverTotalKm * 10) / 10,
      totalPresenceMinutes: driverPresenceMinutes,
      totalPresenceFormatted: formatDuration(driverPresenceMinutes),
      totalDrivingMinutes: driverDrivingMinutes,
      totalDrivingFormatted: formatDuration(driverDrivingMinutes),
      avgKmPerTrip,
      avgTripsPerPresentDay,
      utilizationRate,
      days: dailyRecordsForDriver.reverse(),
    });
  }

  driverSummaries.sort((a, b) => b.daysPresent - a.daysPresent || b.totalTrips - a.totalTrips || a.driverName.localeCompare(b.driverName));
  allDailyRecords.sort((a, b) => b.date.localeCompare(a.date) || a.driverName.localeCompare(b.driverName));

  return {
    range: { from, to },
    summary: {
      totalRegisteredDrivers: allDriverNames.size,
      totalActiveDriversInRange: driverSummaries.filter((d) => d.daysPresent > 0 || d.totalTrips > 0).length,
      totalDutyDays: totalDutyDaysCount,
      totalTripsDone: totalTripsDoneCount,
      totalIdleDays: totalIdleDaysCount,
      totalCombinedKm: Math.round(totalCombinedKmCount * 10) / 10,
      driversWithZeroTripsCount,
    },
    availableDrivers: Array.from(allDriverNames.values()).sort(),
    driverSummaries,
    allDailyRecords,
  };
};

router.get("/reports/driver-comprehensive", requireAuth, async (req: Request, res: Response) => {
  if (!["admin", "manager", "hr", "security"].includes(req.user?.role ?? "")) {
    return res.status(403).json({ error: "Only HR, managers, admins, and security can view driver reports" });
  }

  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  const driver = typeof req.query.driver === "string" ? req.query.driver : undefined;

  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return res.status(400).json({ error: "Invalid 'from' date format (YYYY-MM-DD)" });
  }
  if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return res.status(400).json({ error: "Invalid 'to' date format (YYYY-MM-DD)" });
  }
  if (from && to && from > to) {
    return res.status(400).json({ error: "'from' date cannot be after 'to' date" });
  }

  try {
    const report = await getDriverComprehensiveReport({ from, to, driver });
    return res.json(report);
  } catch (error) {
    req.log?.error({ err: error }, "Failed to generate driver comprehensive report");
    return res.status(500).json({ error: "Failed to generate driver comprehensive report" });
  }
});

router.get("/reports/vehicle/drivers-live", async (req: Request, res: Response) => {
  // Public live presence board: accessible to all viewers, staff, gate screens & logged-in roles
  try {
    const date = typeof req.query.date === "string" ? req.query.date : undefined;
    const report = await getLiveDriverPresence(date);
    return res.json(report);
  } catch (error) {
    req.log?.error({ err: error }, "Failed to generate live driver presence report");
    return res.status(500).json({ error: "Failed to generate live driver presence report" });
  }
});

router.get("/reports/vehicle-analytics", requireAuth, async (req: Request, res: Response) => {
  if (!["admin", "manager", "hr", "security"].includes(req.user?.role ?? "")) {
    return res.status(403).json({ error: "Only HR, managers, admins, and security can view vehicle reports" });
  }

  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  const driver = typeof req.query.driver === "string" ? req.query.driver : undefined;
  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  const month = typeof req.query.month === "string" ? req.query.month : undefined;
  const car = typeof req.query.car === "string" ? req.query.car : undefined;

  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return res.status(400).json({ error: "Invalid 'from' date format (YYYY-MM-DD)" });
  }
  if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return res.status(400).json({ error: "Invalid 'to' date format (YYYY-MM-DD)" });
  }
  if (from && to && from > to) {
    return res.status(400).json({ error: "'from' date cannot be after 'to' date" });
  }

  try {
    const report = await getVehicleAnalytics({ from, to, driver, type, month, car });
    return res.json(report);
  } catch (error) {
    req.log?.error({ err: error }, "Failed to generate vehicle analytics report");
    return res.status(500).json({ error: "Failed to generate vehicle analytics report" });
  }
});

export default router;
