import { Router, type IRouter, type Request, type Response } from "express";
import { desc, eq } from "drizzle-orm";
import { db, registerRecordsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/authMiddleware";
import { parseTimeMinutes, formatDuration } from "../lib/time-utils";

const router: IRouter = Router();
router.use("/reports/kothi-attendance", requireAuth);

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

export const normalizeToIsoDate = (dateVal: unknown): string => {
  if (!dateVal) return "";
  const str = String(dateVal).trim();
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const dmyMatch = str.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
  return str.slice(0, 10);
};

export const getMonthInfo = (dateStr: string): { key: string; label: string } => {
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

export type KothiAttendanceRecordItem = {
  id: string;
  date: string;
  monthKey: string;
  monthLabel: string;
  name: string;
  morningInTime: string;
  morningOutTime: string;
  morningMinutes: number;
  morningDurationFormatted: string;
  eveningInTime: string;
  eveningOutTime: string;
  eveningMinutes: number;
  eveningDurationFormatted: string;
  totalMinutes: number;
  totalHoursFormatted: string;
  totalHours: number;
  shiftStatus: "Both Shifts (Full Day)" | "Morning Only" | "Evening Only" | "Morning Incomplete" | "Evening Incomplete" | "Incomplete" | "Present";
  signOfSecurity: string;
  hasMorning: boolean;
  hasEvening: boolean;
  createdAt: string;
};

export type KothiPersonSummary = {
  name: string;
  totalDays: number;
  totalEntries: number;
  morningShifts: number;
  eveningShifts: number;
  bothShifts: number;
  singleShiftDays: number;
  totalMinutes: number;
  totalHoursFormatted: string;
  totalHours: number;
  avgMinutesPerDay: number;
  avgHoursPerDayFormatted: string;
  avgHoursPerDay: number;
  firstDate: string;
  lastDate: string;
  activeMonths: string[];
};

export type KothiMonthlySummary = {
  monthKey: string;
  monthLabel: string;
  totalRecords: number;
  totalPersonDays: number;
  uniquePersons: number;
  morningShiftsCount: number;
  eveningShiftsCount: number;
  totalMinutes: number;
  totalHoursFormatted: string;
  totalHours: number;
  avgHoursPerPerson: number;
};

export type KothiAttendanceReportResponse = {
  overall: {
    totalRecords: number;
    uniquePersons: number;
    totalPersonDays: number;
    totalMorningShifts: number;
    totalEveningShifts: number;
    totalBothShiftsDays: number;
    totalMinutes: number;
    totalHoursFormatted: string;
    totalHours: number;
    avgHoursPerDay: number;
    avgHoursPerDayFormatted: string;
  };
  personSummaries: KothiPersonSummary[];
  monthlySummaries: KothiMonthlySummary[];
  records: KothiAttendanceRecordItem[];
  availableMonths: Array<{ key: string; label: string }>;
  availablePersons: string[];
};

router.get("/reports/kothi-attendance", async (req: Request, res: Response) => {
  if (!["admin", "manager", "hr", "security"].includes(req.user?.role ?? "")) {
    return res.status(403).json({ error: "Only HR, managers, admins, and security can view Kothi attendance reports" });
  }

  const filterMonth = typeof req.query.month === "string" ? req.query.month.trim() : undefined;
  const filterPerson = typeof req.query.person === "string" ? req.query.person.trim() : undefined;
  const filterFrom = typeof req.query.from === "string" ? req.query.from.trim() : undefined;
  const filterTo = typeof req.query.to === "string" ? req.query.to.trim() : undefined;
  const filterSearch = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : undefined;

  const rows = await db
    .select()
    .from(registerRecordsTable)
    .where(eq(registerRecordsTable.registerSlug, "kothi-attendance"))
    .orderBy(desc(registerRecordsTable.createdAt));

  const allRecords: KothiAttendanceRecordItem[] = [];
  const allMonthsMap = new Map<string, string>();
  const allPersonsSet = new Set<string>();

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
    if (name) allPersonsSet.add(name);

    const morningInTime = String(data.morning_in_time ?? "").trim();
    const morningOutTime = String(data.morning_out_time ?? "").trim();
    const eveningInTime = String(data.evening_in_time ?? "").trim();
    const eveningOutTime = String(data.evening_out_time ?? "").trim();
    const signOfSecurity = String(data.sign_of_security ?? "").trim();

    // Calculate Morning Duration
    let morningMinutes = 0;
    const mIn = parseTimeMinutes(morningInTime);
    const mOut = parseTimeMinutes(morningOutTime);
    const hasMorningCompleted = mIn !== undefined && mOut !== undefined;
    if (hasMorningCompleted) {
      morningMinutes = (mOut - mIn + 1440) % 1440;
    }

    // Calculate Evening Duration
    let eveningMinutes = 0;
    const eIn = parseTimeMinutes(eveningInTime);
    const eOut = parseTimeMinutes(eveningOutTime);
    const hasEveningCompleted = eIn !== undefined && eOut !== undefined;
    if (hasEveningCompleted) {
      eveningMinutes = (eOut - eIn + 1440) % 1440;
    }

    const totalMinutes = morningMinutes + eveningMinutes;

    // Determine status
    let shiftStatus: KothiAttendanceRecordItem["shiftStatus"] = "Present";
    if (hasMorningCompleted && hasEveningCompleted) {
      shiftStatus = "Both Shifts (Full Day)";
    } else if (hasMorningCompleted && !eIn && !eOut) {
      shiftStatus = "Morning Only";
    } else if (hasEveningCompleted && !mIn && !mOut) {
      shiftStatus = "Evening Only";
    } else if (mIn !== undefined && mOut === undefined) {
      shiftStatus = "Morning Incomplete";
    } else if (eIn !== undefined && eOut === undefined) {
      shiftStatus = "Evening Incomplete";
    } else if (totalMinutes === 0 && (morningInTime || eveningInTime)) {
      shiftStatus = "Incomplete";
    }

    allRecords.push({
      id: row.id,
      date,
      monthKey,
      monthLabel,
      name,
      morningInTime,
      morningOutTime,
      morningMinutes,
      morningDurationFormatted: formatDuration(morningMinutes),
      eveningInTime,
      eveningOutTime,
      eveningMinutes,
      eveningDurationFormatted: formatDuration(eveningMinutes),
      totalMinutes,
      totalHoursFormatted: formatDuration(totalMinutes),
      totalHours: Math.round((totalMinutes / 60) * 10) / 10,
      shiftStatus,
      signOfSecurity,
      hasMorning: hasMorningCompleted || Boolean(morningInTime),
      hasEvening: hasEveningCompleted || Boolean(eveningInTime),
      createdAt: row.createdAt.toISOString(),
    });
  }

  // Filter records
  const filtered = allRecords.filter((rec) => {
    if (filterMonth && filterMonth !== "all" && rec.monthKey !== filterMonth) return false;
    if (filterPerson && filterPerson !== "all" && rec.name.toLowerCase() !== filterPerson.toLowerCase()) return false;
    if (filterFrom && rec.date < filterFrom) return false;
    if (filterTo && rec.date > filterTo) return false;
    if (filterSearch) {
      const matchSearch =
        rec.name.toLowerCase().includes(filterSearch) ||
        rec.date.toLowerCase().includes(filterSearch) ||
        rec.shiftStatus.toLowerCase().includes(filterSearch) ||
        rec.signOfSecurity.toLowerCase().includes(filterSearch);
      if (!matchSearch) return false;
    }
    return true;
  });

  // Calculate Person-wise summary (Day Count & Hours)
  const personMap = new Map<
    string,
    {
      name: string;
      dates: Set<string>;
      totalEntries: number;
      morningShifts: number;
      eveningShifts: number;
      bothShiftsDates: Set<string>;
      totalMinutes: number;
      firstDate: string;
      lastDate: string;
      activeMonths: Set<string>;
    }
  >();

  for (const rec of filtered) {
    const personName = rec.name || "Unknown";
    let summary = personMap.get(personName);
    if (!summary) {
      summary = {
        name: personName,
        dates: new Set<string>(),
        totalEntries: 0,
        morningShifts: 0,
        eveningShifts: 0,
        bothShiftsDates: new Set<string>(),
        totalMinutes: 0,
        firstDate: rec.date,
        lastDate: rec.date,
        activeMonths: new Set<string>(),
      };
      personMap.set(personName, summary);
    }

    summary.totalEntries += 1;
    if (rec.date) {
      summary.dates.add(rec.date);
      if (!summary.firstDate || rec.date < summary.firstDate) summary.firstDate = rec.date;
      if (!summary.lastDate || rec.date > summary.lastDate) summary.lastDate = rec.date;
    }
    if (rec.monthLabel) summary.activeMonths.add(rec.monthLabel);

    if (rec.morningInTime && rec.morningOutTime) {
      summary.morningShifts += 1;
    }
    if (rec.eveningInTime && rec.eveningOutTime) {
      summary.eveningShifts += 1;
    }
    if (rec.morningInTime && rec.morningOutTime && rec.eveningInTime && rec.eveningOutTime) {
      summary.bothShiftsDates.add(rec.date);
    }

    summary.totalMinutes += rec.totalMinutes;
  }

  const personSummaries: KothiPersonSummary[] = Array.from(personMap.values())
    .map((item) => {
      const totalDays = item.dates.size;
      const bothShifts = item.bothShiftsDates.size;
      const singleShiftDays = Math.max(0, totalDays - bothShifts);
      const totalHours = Math.round((item.totalMinutes / 60) * 10) / 10;
      const avgMinutesPerDay = totalDays > 0 ? Math.round(item.totalMinutes / totalDays) : 0;
      const avgHoursPerDay = Math.round((avgMinutesPerDay / 60) * 10) / 10;

      return {
        name: item.name,
        totalDays, // The crucial Day Count!
        totalEntries: item.totalEntries,
        morningShifts: item.morningShifts,
        eveningShifts: item.eveningShifts,
        bothShifts,
        singleShiftDays,
        totalMinutes: item.totalMinutes,
        totalHoursFormatted: formatDuration(item.totalMinutes),
        totalHours,
        avgMinutesPerDay,
        avgHoursPerDayFormatted: formatDuration(avgMinutesPerDay),
        avgHoursPerDay,
        firstDate: item.firstDate,
        lastDate: item.lastDate,
        activeMonths: Array.from(item.activeMonths).sort(),
      };
    })
    .sort((a, b) => b.totalDays - a.totalDays || b.totalMinutes - a.totalMinutes);

  // Calculate Monthly Summary
  const monthMap = new Map<
    string,
    {
      monthKey: string;
      monthLabel: string;
      totalRecords: number;
      personDatesMap: Map<string, Set<string>>;
      morningShiftsCount: number;
      eveningShiftsCount: number;
      totalMinutes: number;
    }
  >();

  for (const rec of filtered) {
    let mSummary = monthMap.get(rec.monthKey);
    if (!mSummary) {
      mSummary = {
        monthKey: rec.monthKey,
        monthLabel: rec.monthLabel,
        totalRecords: 0,
        personDatesMap: new Map(),
        morningShiftsCount: 0,
        eveningShiftsCount: 0,
        totalMinutes: 0,
      };
      monthMap.set(rec.monthKey, mSummary);
    }

    mSummary.totalRecords += 1;
    mSummary.totalMinutes += rec.totalMinutes;

    if (rec.morningInTime && rec.morningOutTime) mSummary.morningShiftsCount += 1;
    if (rec.eveningInTime && rec.eveningOutTime) mSummary.eveningShiftsCount += 1;

    if (rec.name && rec.date) {
      let dates = mSummary.personDatesMap.get(rec.name);
      if (!dates) {
        dates = new Set<string>();
        mSummary.personDatesMap.set(rec.name, dates);
      }
      dates.add(rec.date);
    }
  }

  const monthlySummaries: KothiMonthlySummary[] = Array.from(monthMap.values())
    .map((m) => {
      let totalPersonDays = 0;
      for (const dates of m.personDatesMap.values()) {
        totalPersonDays += dates.size;
      }
      const uniquePersons = m.personDatesMap.size;
      const totalHours = Math.round((m.totalMinutes / 60) * 10) / 10;
      const avgHoursPerPerson = uniquePersons > 0 ? Math.round((totalHours / uniquePersons) * 10) / 10 : 0;

      return {
        monthKey: m.monthKey,
        monthLabel: m.monthLabel,
        totalRecords: m.totalRecords,
        totalPersonDays,
        uniquePersons,
        morningShiftsCount: m.morningShiftsCount,
        eveningShiftsCount: m.eveningShiftsCount,
        totalMinutes: m.totalMinutes,
        totalHoursFormatted: formatDuration(m.totalMinutes),
        totalHours,
        avgHoursPerPerson,
      };
    })
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));

  // Overall Statistics
  const totalRecords = filtered.length;
  let totalPersonDays = 0;
  let totalBothShiftsDays = 0;
  let totalMorningShifts = 0;
  let totalEveningShifts = 0;
  let totalMinutes = 0;

  for (const s of personSummaries) {
    totalPersonDays += s.totalDays;
    totalBothShiftsDays += s.bothShifts;
    totalMorningShifts += s.morningShifts;
    totalEveningShifts += s.eveningShifts;
    totalMinutes += s.totalMinutes;
  }

  const uniquePersons = personSummaries.length;
  const totalHours = Math.round((totalMinutes / 60) * 10) / 10;
  const avgMinutesPerDay = totalPersonDays > 0 ? Math.round(totalMinutes / totalPersonDays) : 0;
  const avgHoursPerDay = Math.round((avgMinutesPerDay / 60) * 10) / 10;

  const availableMonths = Array.from(allMonthsMap.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, label]) => ({ key, label }));

  const availablePersons = Array.from(allPersonsSet).sort();

  const response: KothiAttendanceReportResponse = {
    overall: {
      totalRecords,
      uniquePersons,
      totalPersonDays,
      totalMorningShifts,
      totalEveningShifts,
      totalBothShiftsDays,
      totalMinutes,
      totalHoursFormatted: formatDuration(totalMinutes),
      totalHours,
      avgHoursPerDay,
      avgHoursPerDayFormatted: formatDuration(avgMinutesPerDay),
    },
    personSummaries,
    monthlySummaries,
    records: filtered,
    availableMonths,
    availablePersons,
  };

  return res.json(response);
});

export default router;
