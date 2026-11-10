import { Router, type IRouter, type Request, type Response } from "express";
import { desc, inArray } from "drizzle-orm";
import { db, registerRecordsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/authMiddleware";
import { parseTimeMinutes } from "../lib/time-utils";

const router: IRouter = Router();
router.use("/reports/car-breakdowns", requireAuth);

const parseToUtc = (dStr: string, tStr: string): number | undefined => {

  let y = 0, m = 0, d = 0;
  const isoMatch = dStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const dmyMatch = dStr.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (isoMatch) {
    y = Number(isoMatch[1]);
    m = Number(isoMatch[2]);
    d = Number(isoMatch[3]);
  } else if (dmyMatch) {
    d = Number(dmyMatch[1]);
    m = Number(dmyMatch[2]);
    y = Number(dmyMatch[3]);
  } else {
    return undefined;
  }
  const tMatch = tStr.match(/^(\d{1,2}):(\d{2})/);
  if (!tMatch) return undefined;
  const hours = Number(tMatch[1]);
  const minutes = Number(tMatch[2]);
  if (![y, m, d, hours, minutes].every(Number.isFinite)) return undefined;
  return Date.UTC(y, m - 1, d, hours, minutes);
};

const formatDuration = (totalMinutes: number): string => {
  if (!totalMinutes || totalMinutes <= 0) return "0m";
  const days = Math.floor(totalMinutes / 1440);
  const remMin = totalMinutes % 1440;
  const hours = Math.floor(remMin / 60);
  const mins = remMin % 60;
  if (days > 0) {
    return `${days}d ${hours}h ${mins}m`;
  }
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
};

const parseSavedDuration = (val: unknown): number => {
  if (typeof val === "number" && !isNaN(val)) return val;
  if (typeof val === "string") {
    const str = val.trim();
    const dMatch = str.match(/(\d+)\s*d/i);
    const hMatch = str.match(/(\d+)\s*h/i);
    const mMatch = str.match(/(\d+)\s*m/i);
    if (dMatch || hMatch || mMatch) {
      const d = parseInt(dMatch?.[1] || "0", 10);
      const h = parseInt(hMatch?.[1] || "0", 10);
      const m = parseInt(mMatch?.[1] || "0", 10);
      return (d * 1440) + (h * 60) + m;
    }
    const colonMatch = str.match(/^(\d{1,2}):(\d{2})$/);
    if (colonMatch) {
      return parseInt(colonMatch[1], 10) * 60 + parseInt(colonMatch[2], 10);
    }
  }
  return 0;
};

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const normalizeToIsoDate = (dateVal: unknown): string => {
  if (!dateVal) return "";
  const str = String(dateVal).trim();
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const dmyMatch = str.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
  return str.slice(0, 10);
};

const getMonthInfo = (dateStr: string): { key: string; label: string } => {
  const iso = normalizeToIsoDate(dateStr);
  if (!iso) return { key: "Unknown", label: "Unknown" };
  const isoMatch = iso.match(/^(\d{4})-(\d{2})/);
  if (isoMatch) {
    const year = isoMatch[1];
    const monthIdx = parseInt(isoMatch[2], 10) - 1;
    const monthName = MONTH_NAMES[monthIdx] || isoMatch[2];
    return {
      key: `${year}-${isoMatch[2]}`,
      label: `${monthName} ${year}`,
    };
  }
  return { key: "Unknown", label: "Unknown" };
};

export type CarBreakdownRecordItem = {
  id: string;
  date: string;
  monthKey: string;
  monthLabel: string;
  carName: string;
  outTime: string;
  inDate: string;
  inTime: string;
  durationMinutes: number;
  durationFormatted: string;
  durationHours: number;
  status: "completed" | "in_service";
  remark: string;
};

export type MonthlyCarBreakdownSummary = {
  monthKey: string;
  monthLabel: string;
  totalIncidents: number;
  completedCount: number;
  inServiceCount: number;
  totalMinutes: number;
  totalDurationFormatted: string;
  totalDurationHours: number;
  avgMinutesPerIncident: number;
  avgDurationFormatted: string;
  uniqueCarsCount: number;
  cars: string[];
};

export type CarBreakdownVehicleSummary = {
  carName: string;
  totalIncidents: number;
  completedCount: number;
  inServiceCount: number;
  totalMinutes: number;
  totalDurationFormatted: string;
  totalDurationHours: number;
  avgMinutesPerIncident: number;
  avgDurationFormatted: string;
  activeMonths: string[];
  lastBreakdownDate: string;
};

export type CarBreakdownAnalyticsOverall = {
  totalIncidents: number;
  completedIncidents: number;
  currentlyInService: number;
  totalMinutes: number;
  totalDurationFormatted: string;
  totalDurationHours: number;
  avgMinutesPerIncident: number;
  avgDurationFormatted: string;
  uniqueCars: number;
  activeMonthsCount: number;
};

export type CarBreakdownReport = {
  overall: CarBreakdownAnalyticsOverall;
  monthlySummaries: MonthlyCarBreakdownSummary[];
  vehicleSummaries: CarBreakdownVehicleSummary[];
  records: CarBreakdownRecordItem[];
  availableMonths: Array<{ key: string; label: string }>;
  availableCars: string[];
};

router.get("/reports/car-breakdowns", async (req: Request, res: Response) => {
  try {
    const monthFilter = typeof req.query.month === "string" ? req.query.month.trim() : "all";
    const carFilter = typeof req.query.car === "string" ? req.query.car.trim() : "all";
    const statusFilter = typeof req.query.status === "string" ? req.query.status.trim() : "all";
    const fromFilter = typeof req.query.from === "string" && req.query.from.trim() ? normalizeToIsoDate(req.query.from) : undefined;
    const toFilter = typeof req.query.to === "string" && req.query.to.trim() ? normalizeToIsoDate(req.query.to) : undefined;
    const searchFilter = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";

    const rows = await db
      .select()
      .from(registerRecordsTable)
      .where(inArray(registerRecordsTable.registerSlug, ["car-breakdowns", "car-breakdown"]))
      .orderBy(desc(registerRecordsTable.recordDate), desc(registerRecordsTable.createdAt));

    const records: CarBreakdownRecordItem[] = [];
    const monthsMap = new Map<string, string>();
    const carsSet = new Set<string>();

    for (const row of rows) {
      const data = (row.data as Record<string, unknown>) || {};
      const rawDate = String(data.date || row.recordDate || "").trim();
      const dateStr = normalizeToIsoDate(rawDate) || row.createdAt.toISOString().slice(0, 10);
      const carName = String(data.car_name || "").trim() || "Unspecified Vehicle";
      const outTime = String(data.car_out_time_for_service || "").trim();
      const rawInDate = String(data.car_in_date || "").trim();
      const inDate = normalizeToIsoDate(rawInDate);
      const inTime = String(data.car_in_time_after_service || "").trim();
      const remark = String(data.remark || "").trim();

      const monthInfo = getMonthInfo(dateStr);
      if (monthInfo.key !== "Unknown") {
        monthsMap.set(monthInfo.key, monthInfo.label);
      }
      if (carName) {
        carsSet.add(carName);
      }

      let durationMinutes = 0;
      const isCompleted = Boolean(inTime);

      if (isCompleted) {
        // Calculate from dates and times
        const effectiveInDate = inDate || dateStr;
        const startUtc = parseToUtc(dateStr, outTime);
        const endUtc = parseToUtc(effectiveInDate, inTime);

        if (startUtc !== undefined && endUtc !== undefined && endUtc >= startUtc) {
          durationMinutes = Math.floor((endUtc - startUtc) / 60000);
        } else {
          // Fallback to saved duration or out/in time difference
          const savedDuration = parseSavedDuration(data.total_time_consumed_in_service);
          if (savedDuration > 0) {
            durationMinutes = savedDuration;
          } else {
            const outM = parseTimeMinutes(outTime);
            const inM = parseTimeMinutes(inTime);
            if (outM !== undefined && inM !== undefined) {
              durationMinutes = (inM - outM + 1440) % 1440;
            }
          }
        }
      }

      const durationFormatted = isCompleted
        ? (String(data.total_time_consumed_in_service || "").trim() || formatDuration(durationMinutes))
        : "In Service (Pending)";

      const durationHours = isCompleted
        ? Math.round((durationMinutes / 60) * 100) / 100
        : 0;

      records.push({
        id: row.id,
        date: dateStr,
        monthKey: monthInfo.key,
        monthLabel: monthInfo.label,
        carName,
        outTime,
        inDate,
        inTime,
        durationMinutes,
        durationFormatted,
        durationHours,
        status: isCompleted ? "completed" : "in_service",
        remark,
      });
    }

    // Available filters
    const availableMonths = Array.from(monthsMap.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => b.key.localeCompare(a.key));

    const availableCars = Array.from(carsSet).sort((a, b) => a.localeCompare(b));

    // Apply filtering
    let filtered = records;

    if (monthFilter && monthFilter !== "all") {
      filtered = filtered.filter((r) => r.monthKey === monthFilter);
    }

    if (carFilter && carFilter !== "all") {
      filtered = filtered.filter((r) => r.carName.toLowerCase() === carFilter.toLowerCase());
    }

    if (statusFilter && statusFilter !== "all") {
      filtered = filtered.filter((r) => r.status === statusFilter);
    }

    if (fromFilter) {
      filtered = filtered.filter((r) => r.date >= fromFilter);
    }

    if (toFilter) {
      filtered = filtered.filter((r) => r.date <= toFilter);
    }

    if (searchFilter) {
      filtered = filtered.filter(
        (r) =>
          r.carName.toLowerCase().includes(searchFilter) ||
          r.remark.toLowerCase().includes(searchFilter) ||
          r.date.includes(searchFilter)
      );
    }

    // Monthly aggregation
    const monthGroups = new Map<string, CarBreakdownRecordItem[]>();
    for (const record of filtered) {
      const key = record.monthKey || "Unknown";
      if (!monthGroups.has(key)) {
        monthGroups.set(key, []);
      }
      monthGroups.get(key)!.push(record);
    }

    const monthlySummaries: MonthlyCarBreakdownSummary[] = [];
    for (const [mKey, mRecords] of monthGroups.entries()) {
      const totalIncidents = mRecords.length;
      const completedList = mRecords.filter((r) => r.status === "completed");
      const inServiceCount = totalIncidents - completedList.length;
      const totalMinutes = completedList.reduce((sum, r) => sum + r.durationMinutes, 0);
      const totalDurationHours = Math.round((totalMinutes / 60) * 100) / 100;
      const avgMinutesPerIncident = completedList.length > 0
        ? Math.round(totalMinutes / completedList.length)
        : 0;

      const carsInMonth = Array.from(new Set(mRecords.map((r) => r.carName))).sort();

      monthlySummaries.push({
        monthKey: mKey,
        monthLabel: mRecords[0]?.monthLabel || mKey,
        totalIncidents,
        completedCount: completedList.length,
        inServiceCount,
        totalMinutes,
        totalDurationFormatted: formatDuration(totalMinutes),
        totalDurationHours,
        avgMinutesPerIncident,
        avgDurationFormatted: formatDuration(avgMinutesPerIncident),
        uniqueCarsCount: carsInMonth.length,
        cars: carsInMonth,
      });
    }

    monthlySummaries.sort((a, b) => b.monthKey.localeCompare(a.monthKey));

    // Vehicle aggregation
    const vehicleGroups = new Map<string, CarBreakdownRecordItem[]>();
    for (const record of filtered) {
      const key = record.carName || "Unspecified";
      if (!vehicleGroups.has(key)) {
        vehicleGroups.set(key, []);
      }
      vehicleGroups.get(key)!.push(record);
    }

    const vehicleSummaries: CarBreakdownVehicleSummary[] = [];
    for (const [cName, cRecords] of vehicleGroups.entries()) {
      const totalIncidents = cRecords.length;
      const completedList = cRecords.filter((r) => r.status === "completed");
      const inServiceCount = totalIncidents - completedList.length;
      const totalMinutes = completedList.reduce((sum, r) => sum + r.durationMinutes, 0);
      const totalDurationHours = Math.round((totalMinutes / 60) * 100) / 100;
      const avgMinutesPerIncident = completedList.length > 0
        ? Math.round(totalMinutes / completedList.length)
        : 0;

      const activeMonths = Array.from(new Set(cRecords.map((r) => r.monthLabel))).filter(Boolean);
      const sortedByDate = [...cRecords].sort((a, b) => b.date.localeCompare(a.date));
      const lastBreakdownDate = sortedByDate[0]?.date || "—";

      vehicleSummaries.push({
        carName: cName,
        totalIncidents,
        completedCount: completedList.length,
        inServiceCount,
        totalMinutes,
        totalDurationFormatted: formatDuration(totalMinutes),
        totalDurationHours,
        avgMinutesPerIncident,
        avgDurationFormatted: formatDuration(avgMinutesPerIncident),
        activeMonths,
        lastBreakdownDate,
      });
    }

    vehicleSummaries.sort((a, b) => b.totalIncidents - a.totalIncidents || b.totalMinutes - a.totalMinutes);

    // Overall metrics
    const totalIncidents = filtered.length;
    const completedList = filtered.filter((r) => r.status === "completed");
    const currentlyInService = totalIncidents - completedList.length;
    const overallMinutes = completedList.reduce((sum, r) => sum + r.durationMinutes, 0);
    const overallHours = Math.round((overallMinutes / 60) * 100) / 100;
    const overallAvgMinutes = completedList.length > 0
      ? Math.round(overallMinutes / completedList.length)
      : 0;
    const uniqueCars = new Set(filtered.map((r) => r.carName)).size;
    const activeMonthsCount = monthGroups.size;

    const overall: CarBreakdownAnalyticsOverall = {
      totalIncidents,
      completedIncidents: completedList.length,
      currentlyInService,
      totalMinutes: overallMinutes,
      totalDurationFormatted: formatDuration(overallMinutes),
      totalDurationHours: overallHours,
      avgMinutesPerIncident: overallAvgMinutes,
      avgDurationFormatted: formatDuration(overallAvgMinutes),
      uniqueCars,
      activeMonthsCount,
    };

    const report: CarBreakdownReport = {
      overall,
      monthlySummaries,
      vehicleSummaries,
      records: filtered,
      availableMonths,
      availableCars,
    };

    return res.json(report);
  } catch (error) {
    console.error("Error generating car breakdowns report:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load car breakdowns report",
    });
  }
});

export default router;

