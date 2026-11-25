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

export const formatDays = (days: number): string => {
  if (Number.isInteger(days)) {
    return `${days} Days`;
  }
  return `${days.toFixed(1)} Days`;
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
  dayValue: number; // 1.0 (both shifts), 0.5 (one shift), 0.0 (none)
  dayLabel: string; // "1.0 Day" | "0.5 Day" | "0 Days"
  attendanceType: "Full Day (1.0)" | "Half Day (0.5)" | "Incomplete";
  signOfSecurity: string;
  hasMorning: boolean;
  hasEvening: boolean;
  createdAt: string;
};

export type KothiPersonSummary = {
  name: string;
  totalDays: number; // e.g. 14.5
  totalDaysFormatted: string; // e.g. "14.5 Days"
  fullDays: number; // count of 1.0 days
  halfDays: number; // count of 0.5 days
  totalEntries: number;
  totalMinutes: number;
  totalHoursFormatted: string;
  totalHours: number;
  firstDate: string;
  lastDate: string;
  activeMonths: string[];
};

export type KothiMonthlySummary = {
  monthKey: string;
  monthLabel: string;
  totalRecords: number;
  totalDays: number;
  totalDaysFormatted: string;
  uniquePersons: number;
  fullDaysCount: number;
  halfDaysCount: number;
  totalMinutes: number;
  totalHoursFormatted: string;
  totalHours: number;
};

export type KothiOverallMetrics = {
  totalRecords: number;
  uniquePersons: number;
  totalDays: number;
  totalDaysFormatted: string;
  totalFullDays: number;
  totalHalfDays: number;
  totalMinutes: number;
  totalHoursFormatted: string;
  totalHours: number;
};

export type KothiAttendanceReportResponse = {
  overall: KothiOverallMetrics;
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

    // Day attendance calculation:
    // Morning + Evening shift = 1 day
    // Any day any shift is there other is not there = 0.5 days
    let dayValue = 0;
    let dayLabel = "0 Days";
    let attendanceType: KothiAttendanceRecordItem["attendanceType"] = "Incomplete";

    if (hasMorningCompleted && hasEveningCompleted) {
      dayValue = 1.0;
      dayLabel = "1.0 Day";
      attendanceType = "Full Day (1.0)";
    } else if (hasMorningCompleted || hasEveningCompleted) {
      dayValue = 0.5;
      dayLabel = "0.5 Day";
      attendanceType = "Half Day (0.5)";
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
      dayValue,
      dayLabel,
      attendanceType,
      signOfSecurity,
      hasMorning: hasMorningCompleted,
      hasEvening: hasEveningCompleted,
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
        rec.dayLabel.toLowerCase().includes(filterSearch) ||
        rec.attendanceType.toLowerCase().includes(filterSearch) ||
        rec.signOfSecurity.toLowerCase().includes(filterSearch);
      if (!matchSearch) return false;
    }
    return true;
  });

  // Calculate Person-wise summary (Day Count & Hours)
  // Per person per date: determine whether that date has morning and evening
  const personMap = new Map<
    string,
    {
      name: string;
      totalEntries: number;
      datesMap: Map<string, { hasMorning: boolean; hasEvening: boolean; minutes: number }>;
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
        totalEntries: 0,
        datesMap: new Map(),
        firstDate: rec.date,
        lastDate: rec.date,
        activeMonths: new Set<string>(),
      };
      personMap.set(personName, summary);
    }

    summary.totalEntries += 1;
    if (rec.date) {
      if (!summary.firstDate || rec.date < summary.firstDate) summary.firstDate = rec.date;
      if (!summary.lastDate || rec.date > summary.lastDate) summary.lastDate = rec.date;

      let dateObj = summary.datesMap.get(rec.date);
      if (!dateObj) {
        dateObj = { hasMorning: false, hasEvening: false, minutes: 0 };
        summary.datesMap.set(rec.date, dateObj);
      }
      if (rec.hasMorning) dateObj.hasMorning = true;
      if (rec.hasEvening) dateObj.hasEvening = true;
      dateObj.minutes += rec.totalMinutes;
    }
    if (rec.monthLabel) summary.activeMonths.add(rec.monthLabel);
  }

  const personSummaries: KothiPersonSummary[] = Array.from(personMap.values())
    .map((item) => {
      let fullDays = 0;
      let halfDays = 0;
      let totalMinutes = 0;

      for (const dateObj of item.datesMap.values()) {
        totalMinutes += dateObj.minutes;
        if (dateObj.hasMorning && dateObj.hasEvening) {
          fullDays += 1; // 1.0 day
        } else if (dateObj.hasMorning || dateObj.hasEvening) {
          halfDays += 1; // 0.5 day
        }
      }

      const totalDays = fullDays * 1.0 + halfDays * 0.5;
      const totalHours = Math.round((totalMinutes / 60) * 10) / 10;

      return {
        name: item.name,
        totalDays, // Sum of 1.0 days + 0.5 days
        totalDaysFormatted: formatDays(totalDays),
        fullDays,
        halfDays,
        totalEntries: item.totalEntries,
        totalMinutes,
        totalHoursFormatted: formatDuration(totalMinutes),
        totalHours,
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
      personDatesMap: Map<string, Map<string, { hasMorning: boolean; hasEvening: boolean; minutes: number }>>;
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
        totalMinutes: 0,
      };
      monthMap.set(rec.monthKey, mSummary);
    }

    mSummary.totalRecords += 1;
    mSummary.totalMinutes += rec.totalMinutes;

    if (rec.name && rec.date) {
      let pDates = mSummary.personDatesMap.get(rec.name);
      if (!pDates) {
        pDates = new Map();
        mSummary.personDatesMap.set(rec.name, pDates);
      }
      let dObj = pDates.get(rec.date);
      if (!dObj) {
        dObj = { hasMorning: false, hasEvening: false, minutes: 0 };
        pDates.set(rec.date, dObj);
      }
      if (rec.hasMorning) dObj.hasMorning = true;
      if (rec.hasEvening) dObj.hasEvening = true;
      dObj.minutes += rec.totalMinutes;
    }
  }

  const monthlySummaries: KothiMonthlySummary[] = Array.from(monthMap.values())
    .map((m) => {
      let fullDaysCount = 0;
      let halfDaysCount = 0;

      for (const pDates of m.personDatesMap.values()) {
        for (const dObj of pDates.values()) {
          if (dObj.hasMorning && dObj.hasEvening) {
            fullDaysCount += 1;
          } else if (dObj.hasMorning || dObj.hasEvening) {
            halfDaysCount += 1;
          }
        }
      }

      const totalDays = fullDaysCount * 1.0 + halfDaysCount * 0.5;
      const uniquePersons = m.personDatesMap.size;
      const totalHours = Math.round((m.totalMinutes / 60) * 10) / 10;

      return {
        monthKey: m.monthKey,
        monthLabel: m.monthLabel,
        totalRecords: m.totalRecords,
        totalDays,
        totalDaysFormatted: formatDays(totalDays),
        uniquePersons,
        fullDaysCount,
        halfDaysCount,
        totalMinutes: m.totalMinutes,
        totalHoursFormatted: formatDuration(m.totalMinutes),
        totalHours,
      };
    })
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));

  // Overall Statistics
  const totalRecords = filtered.length;
  let totalDays = 0;
  let totalFullDays = 0;
  let totalHalfDays = 0;
  let totalMinutes = 0;

  for (const s of personSummaries) {
    totalDays += s.totalDays;
    totalFullDays += s.fullDays;
    totalHalfDays += s.halfDays;
    totalMinutes += s.totalMinutes;
  }

  const uniquePersons = personSummaries.length;
  const totalHours = Math.round((totalMinutes / 60) * 10) / 10;

  const availableMonths = Array.from(allMonthsMap.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, label]) => ({ key, label }));

  const availablePersons = Array.from(allPersonsSet).sort();

  const response: KothiAttendanceReportResponse = {
    overall: {
      totalRecords,
      uniquePersons,
      totalDays,
      totalDaysFormatted: formatDays(totalDays),
      totalFullDays,
      totalHalfDays,
      totalMinutes,
      totalHoursFormatted: formatDuration(totalMinutes),
      totalHours,
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
