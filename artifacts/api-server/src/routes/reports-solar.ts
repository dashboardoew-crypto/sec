import { Router, type IRouter, type Request, type Response } from "express";
import { desc, eq } from "drizzle-orm";
import { db, registerRecordsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/authMiddleware";
import { parseTimeMinutes, formatDuration } from "../lib/time-utils";

const router: IRouter = Router();
router.use("/reports/solar", requireAuth);

const parseSavedManPower = (val: unknown): number => {
  if (typeof val === "number" && !isNaN(val)) return val;
  if (typeof val === "string") {
    const str = val.trim();
    const hmMatch = str.match(/(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?/i);
    if (hmMatch && (hmMatch[1] || hmMatch[2])) {
      const h = parseInt(hmMatch[1] || "0", 10);
      const m = parseInt(hmMatch[2] || "0", 10);
      if (h > 0 || m > 0) return h * 60 + m;
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
  const match = iso.match(/^(\d{4})-(\d{2})/);
  if (match) {
    const year = match[1];
    const monthIdx = parseInt(match[2], 10) - 1;
    const monthName = MONTH_NAMES[monthIdx] || match[2];
    return {
      key: `${year}-${match[2]}`,
      label: `${monthName} ${year}`,
    };
  }
  return { key: "Unknown", label: "Unknown" };
};

export type SolarCleaningRecordItem = {
  id: string;
  date: string;
  monthKey: string;
  monthLabel: string;
  name: string;
  inTime: string;
  outTime: string;
  manPowerFormatted: string;
  manPowerMinutes: number;
  manPowerHours: number;
  yard: string;
  canopyZoneI: string;
  foundryZoneII: string;
  machineShopIII: string;
  remark: string;
};

export type MonthlySolarSummary = {
  monthKey: string;
  monthLabel: string;
  totalShifts: number;
  totalMinutes: number;
  totalManPowerFormatted: string;
  totalManPowerHours: number;
  avgMinutesPerShift: number;
  avgManPowerFormatted: string;
  workerCount: number;
  workers: string[];
  zonesSummary: {
    yard: number;
    canopyZoneI: number;
    foundryZoneII: number;
    machineShopIII: number;
  };
};

export type WorkerSolarSummary = {
  name: string;
  totalShifts: number;
  totalMinutes: number;
  totalManPowerFormatted: string;
  totalManPowerHours: number;
  avgMinutesPerShift: number;
  avgManPowerFormatted: string;
  activeMonths: string[];
  lastActiveDate: string;
};

router.get("/reports/solar-cleaning", async (req: Request, res: Response) => {
  if (!["admin", "manager", "hr", "security"].includes(req.user?.role ?? "")) {
    return res.status(403).json({ error: "Only HR, managers, admins, and security can view solar cleaning reports" });
  }

  const filterMonth = typeof req.query.month === "string" ? req.query.month.trim() : undefined;
  const filterWorker = typeof req.query.worker === "string" ? req.query.worker.trim() : undefined;
  const filterFrom = typeof req.query.from === "string" ? req.query.from.trim() : undefined;
  const filterTo = typeof req.query.to === "string" ? req.query.to.trim() : undefined;
  const filterSearch = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : undefined;

  const rows = await db
    .select()
    .from(registerRecordsTable)
    .where(eq(registerRecordsTable.registerSlug, "solar-panel-cleaning"))
    .orderBy(desc(registerRecordsTable.createdAt));

  const allRecords: SolarCleaningRecordItem[] = [];
  const allMonthsMap = new Map<string, string>();
  const allWorkersSet = new Set<string>();

  for (const row of rows) {
    const data = (row.data ?? {}) as Record<string, unknown>;
    const rawDate = typeof data.date === "string" && data.date
      ? data.date
      : row.createdAt.toISOString().slice(0, 10);
    const date = normalizeToIsoDate(rawDate);
    const { key: monthKey, label: monthLabel } = getMonthInfo(date);

    if (monthKey !== "Unknown") {
      allMonthsMap.set(monthKey, monthLabel);
    }

    const name = String(data.name ?? "").trim();
    if (name) allWorkersSet.add(name);

    const inTime = String(data.in_time ?? "").trim();
    const outTime = String(data.out_time ?? "").trim();

    let manPowerMinutes = 0;
    const inM = parseTimeMinutes(inTime);
    const outM = parseTimeMinutes(outTime);
    if (inM !== undefined && outM !== undefined) {
      manPowerMinutes = (outM - inM + 1440) % 1440;
    } else if (data.man_power) {
      manPowerMinutes = parseSavedManPower(data.man_power);
    }

    allRecords.push({
      id: row.id,
      date,
      monthKey,
      monthLabel,
      name,
      inTime,
      outTime,
      manPowerFormatted: formatDuration(manPowerMinutes),
      manPowerMinutes,
      manPowerHours: Math.round((manPowerMinutes / 60) * 10) / 10,
      yard: String(data.yard ?? "").trim(),
      canopyZoneI: String(data.canopy_zone_i ?? "").trim(),
      foundryZoneII: String(data.foundry_zone_ii ?? "").trim(),
      machineShopIII: String(data.machine_shop_iii ?? "").trim(),
      remark: String(data.remark ?? "").trim(),
    });
  }

  // Filter records
  const filtered = allRecords.filter((rec) => {
    if (filterMonth && filterMonth !== "all" && rec.monthKey !== filterMonth) return false;
    if (filterWorker && filterWorker !== "all" && rec.name.toLowerCase() !== filterWorker.toLowerCase()) return false;
    if (filterFrom && rec.date < filterFrom) return false;
    if (filterTo && rec.date > filterTo) return false;
    if (filterSearch) {
      const matchSearch =
        rec.name.toLowerCase().includes(filterSearch) ||
        rec.yard.toLowerCase().includes(filterSearch) ||
        rec.canopyZoneI.toLowerCase().includes(filterSearch) ||
        rec.foundryZoneII.toLowerCase().includes(filterSearch) ||
        rec.machineShopIII.toLowerCase().includes(filterSearch) ||
        rec.remark.toLowerCase().includes(filterSearch);
      if (!matchSearch) return false;
    }
    return true;
  });

  // Calculate monthly summaries
  const monthGroupMap = new Map<
    string,
    {
      monthKey: string;
      monthLabel: string;
      totalShifts: number;
      totalMinutes: number;
      workers: Set<string>;
      yardCount: number;
      canopyCount: number;
      foundryCount: number;
      machineCount: number;
    }
  >();

  for (const rec of filtered) {
    let existing = monthGroupMap.get(rec.monthKey);
    if (!existing) {
      existing = {
        monthKey: rec.monthKey,
        monthLabel: rec.monthLabel,
        totalShifts: 0,
        totalMinutes: 0,
        workers: new Set<string>(),
        yardCount: 0,
        canopyCount: 0,
        foundryCount: 0,
        machineCount: 0,
      };
      monthGroupMap.set(rec.monthKey, existing);
    }

    existing.totalShifts += 1;
    existing.totalMinutes += rec.manPowerMinutes;
    if (rec.name) existing.workers.add(rec.name);
    if (rec.yard) existing.yardCount += 1;
    if (rec.canopyZoneI) existing.canopyCount += 1;
    if (rec.foundryZoneII) existing.foundryCount += 1;
    if (rec.machineShopIII) existing.machineCount += 1;
  }

  const monthlySummaries: MonthlySolarSummary[] = Array.from(monthGroupMap.values())
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
    .map((item) => ({
      monthKey: item.monthKey,
      monthLabel: item.monthLabel,
      totalShifts: item.totalShifts,
      totalMinutes: item.totalMinutes,
      totalManPowerFormatted: formatDuration(item.totalMinutes),
      totalManPowerHours: Math.round((item.totalMinutes / 60) * 10) / 10,
      avgMinutesPerShift: item.totalShifts > 0 ? Math.round(item.totalMinutes / item.totalShifts) : 0,
      avgManPowerFormatted: formatDuration(item.totalShifts > 0 ? Math.round(item.totalMinutes / item.totalShifts) : 0),
      workerCount: item.workers.size,
      workers: Array.from(item.workers).sort(),
      zonesSummary: {
        yard: item.yardCount,
        canopyZoneI: item.canopyCount,
        foundryZoneII: item.foundryCount,
        machineShopIII: item.machineCount,
      },
    }));

  // Calculate worker summaries
  const workerGroupMap = new Map<
    string,
    {
      name: string;
      totalShifts: number;
      totalMinutes: number;
      months: Set<string>;
      lastDate: string;
    }
  >();

  for (const rec of filtered) {
    const workerName = rec.name || "Unknown Worker";
    let existing = workerGroupMap.get(workerName);
    if (!existing) {
      existing = {
        name: workerName,
        totalShifts: 0,
        totalMinutes: 0,
        months: new Set<string>(),
        lastDate: rec.date,
      };
      workerGroupMap.set(workerName, existing);
    }

    existing.totalShifts += 1;
    existing.totalMinutes += rec.manPowerMinutes;
    if (rec.monthLabel) existing.months.add(rec.monthLabel);
    if (rec.date > existing.lastDate) existing.lastDate = rec.date;
  }

  const workerSummaries: WorkerSolarSummary[] = Array.from(workerGroupMap.values())
    .sort((a, b) => b.totalMinutes - a.totalMinutes)
    .map((item) => ({
      name: item.name,
      totalShifts: item.totalShifts,
      totalMinutes: item.totalMinutes,
      totalManPowerFormatted: formatDuration(item.totalMinutes),
      totalManPowerHours: Math.round((item.totalMinutes / 60) * 10) / 10,
      avgMinutesPerShift: item.totalShifts > 0 ? Math.round(item.totalMinutes / item.totalShifts) : 0,
      avgManPowerFormatted: formatDuration(item.totalShifts > 0 ? Math.round(item.totalMinutes / item.totalShifts) : 0),
      activeMonths: Array.from(item.months).sort(),
      lastActiveDate: item.lastDate,
    }));

  const totalShifts = filtered.length;
  const totalMinutes = filtered.reduce((acc, r) => acc + r.manPowerMinutes, 0);

  const availableMonths = Array.from(allMonthsMap.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, label]) => ({ key, label }));

  const availableWorkers = Array.from(allWorkersSet).sort();

  return res.json({
    overall: {
      totalShifts,
      totalMinutes,
      totalManPowerFormatted: formatDuration(totalMinutes),
      totalManPowerHours: Math.round((totalMinutes / 60) * 10) / 10,
      uniqueWorkers: new Set(filtered.map((r) => r.name).filter(Boolean)).size,
      activeMonthsCount: new Set(filtered.map((r) => r.monthKey)).size,
      avgMinutesPerShift: totalShifts > 0 ? Math.round(totalMinutes / totalShifts) : 0,
      avgManPowerFormatted: formatDuration(totalShifts > 0 ? Math.round(totalMinutes / totalShifts) : 0),
    },
    monthlySummaries,
    workerSummaries,
    records: filtered,
    availableMonths,
    availableWorkers,
  });
});

export default router;

