import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, paymentAttendanceExclusionsTable, paymentBillsTable, paymentTransactionsTable, registerRecordsTable } from "@workspace/db";
import {
  CreateRegisterRecordBody,
  CreateRegisterRecordParams,
  DeleteRegisterRecordParams,
  GetActivityQueryParams,
  ListRegisterRecordsParams,
  ListRegisterRecordsQueryParams,
  UpdateRegisterRecordBody,
  UpdateRegisterRecordParams,
} from "@workspace/api-zod";
import {
  REGISTER_DEFINITIONS,
  getRegister,
  sampleRecords,
  type RegisterDefinition,
} from "../data/registers";
import { canAccessModule, canCreateRegisterRecord, requireAuth } from "../middlewares/authMiddleware";

const router: IRouter = Router();
router.use(requireAuth);
let seedPromise: Promise<void> | undefined;
const canAccessDefinition = (req: Request, definition: RegisterDefinition) =>
  canAccessModule(req.user?.role, definition.module);

const referenceMasterSlugs = ["labour-master", "driver-master", "security-master", "key-master", "kothi-master"];
const canReadDefinition = (req: Request, definition: RegisterDefinition) =>
  canAccessDefinition(req, definition) ||
  (req.user?.role === "security" && referenceMasterSlugs.includes(definition.slug));

const minutesBetween = (from: unknown, to: unknown) => {
  if (typeof from !== "string" || typeof to !== "string") return undefined;
  const parse = (value: string) => {
    const [hours, minutes] = value.split(":").map(Number);
    return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : undefined;
  };
  const start = parse(from);
  const end = parse(to);
  if (start === undefined || end === undefined) return undefined;
  return (end - start + 1440) % 1440;
};

const minutesFromTime = (value: unknown, _period?: "morning" | "evening") => {
  if (typeof value !== "string") return undefined;
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return undefined;
  return hours * 60 + minutes;
};

const timeFromMinutes = (value: number) => {
  const total = ((Math.round(value) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

const formatClockDuration = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const formatSignedClockDuration = (minutes: number) => {
  const sign = minutes < 0 ? "-" : "";
  const absolute = Math.abs(minutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
};

const totalDaysForMinutes = (minutes: number) => {
  if (minutes < 300) return 0;
  if (minutes < 480) return 0.5;
  return 1;
};

const overtimeMinutesFor = (minutes: number) => {
  if (minutes < 300) return Math.max(minutes, 0);
  if (minutes < 480) return minutes - 300;
  return Math.max(minutes - 480, 0);
};

const formatTotalDays = (minutes: number) => String(totalDaysForMinutes(minutes));

const trainingDurationMinutes = (data: Record<string, unknown>) => {
  const morningIn = minutesFromTime(data.morning_in, "morning");
  const morningOut = minutesFromTime(data.morning_out, "morning");
  const eveningIn = minutesFromTime(data.evening_in, "evening");
  const eveningOut = minutesFromTime(data.evening_out, "evening");
  const difference = (from: number, to: number) => (to - from + 1440) % 1440;

  if (
    morningIn !== undefined &&
    morningOut !== undefined &&
    eveningIn !== undefined &&
    eveningOut !== undefined
  ) {
    return difference(morningIn, morningOut) + difference(eveningIn, eveningOut);
  }

  if (
    morningIn !== undefined &&
    eveningOut !== undefined &&
    morningOut === undefined &&
    eveningIn === undefined
  ) {
    return Math.max(difference(morningIn, eveningOut) - 60, 0);
  }

  if (
    eveningIn !== undefined &&
    morningOut !== undefined &&
    morningIn === undefined &&
    eveningOut === undefined
  ) {
    return Math.max(difference(eveningIn, morningOut) - 60, 0);
  }

  const durations = [
    morningIn !== undefined && morningOut !== undefined ? difference(morningIn, morningOut) : undefined,
    eveningIn !== undefined && eveningOut !== undefined ? difference(eveningIn, eveningOut) : undefined,
  ].filter((value): value is number => value !== undefined);

  return durations.length ? durations.reduce((total, duration) => total + duration, 0) : undefined;
};

const driverAttendanceDate = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dayFirst = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  const year = Number(iso?.[1] ?? dayFirst?.[3]);
  const month = Number(iso?.[2] ?? dayFirst?.[2]);
  const day = Number(iso?.[3] ?? dayFirst?.[1]);
  if (![year, month, day].every(Number.isFinite)) return undefined;
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
    ? timestamp
    : undefined;
};

const driverAttendanceTotalDays = (data: Record<string, unknown>) => {
  if (typeof data.in_time !== "string" || !data.in_time.trim()) return undefined;
  const attendanceDate = driverAttendanceDate(data.date);
  if (attendanceDate === undefined) return undefined;
  const stationInDate = driverAttendanceDate(data.station_in_date);
  if (stationInDate === undefined) return 1;
  return Math.max(1, Math.floor((stationInDate - attendanceDate) / 86_400_000));
};

export const applyDerivedValues = (register: RegisterDefinition, input: Record<string, unknown>) => {
  const data = { ...input };
  const keys = new Set(register.fields.map((field) => field.key));
  const setIfKnown = (key: string, value: unknown) => {
    if (keys.has(key) && value !== undefined) data[key] = value;
  };

  const isMeterRegister = register.slug === "mango-tree-meter" || register.slug === "clinic-gate-meter";
  if (isMeterRegister) {
    const officeInitial = Number(data.office_initial);
    const officeFinal = Number(data.office_final);
    const minutesConsumed =
      Number.isFinite(officeInitial) && Number.isFinite(officeFinal)
        ? (officeFinal - officeInitial) / 1.6
        : undefined;
    if (minutesConsumed !== undefined && Number.isFinite(minutesConsumed)) {
      setIfKnown("minutes_consumed", Number(minutesConsumed.toFixed(2)));
      const onTime = minutesFromTime(data.on_time);
      if (onTime !== undefined) setIfKnown("off_time", timeFromMinutes(onTime + minutesConsumed));
    }

    const kothiInitial = Number(data.kothi_initial);
    const kothiFinal = Number(data.kothi_final);
    if (Number.isFinite(kothiInitial) && Number.isFinite(kothiFinal)) {
      const water = kothiFinal - kothiInitial;
      setIfKnown("total_water_consumed", Math.round(water));
      if (minutesConsumed) setIfKnown("per_minute_water_consumed", Math.round(water / minutesConsumed));
    }
  }

  if (register.slug === "daily-attendance" || register.slug === "chowk-labour") {
    delete data.payment_status;
    delete data.overtime_payment_status;
    const totalMinutes = trainingDurationMinutes(data);
    if (totalMinutes !== undefined) {
      setIfKnown("total_hours", formatClockDuration(totalMinutes));
      setIfKnown("total_days", formatTotalDays(totalMinutes));
      setIfKnown("overtime", formatClockDuration(overtimeMinutesFor(totalMinutes)));
    }
  }

  if (register.slug === "driver-attendance") {
    const isYes = (value: unknown) => String(value ?? "").trim().toLowerCase() === "yes";
    const hasValue = (value: unknown) => value !== undefined && value !== null && value !== "";
    if (data.day_allowance_applicable === undefined && hasValue(data.day_allowance)) {
      data.day_allowance_applicable = Number(data.day_allowance) > 0 ? "Yes" : "No";
    }
    if (data.night_allowance_applicable === undefined && hasValue(data.night_allowance)) {
      data.night_allowance_applicable = Number(data.night_allowance) > 0 ? "Yes" : "No";
    }
    if (!isYes(data.station)) {
      delete data.station_name;
      delete data.station_out_time;
      delete data.station_in_time;
      delete data.station_in_date;
    }
    if (!isYes(data.day_allowance_applicable)) delete data.day_allowance;
    if (!isYes(data.night_allowance_applicable)) delete data.night_allowance;
    setIfKnown("total_days", driverAttendanceTotalDays(data));
  }

  const initialReading = Number(data.initial_reading);
  const finalReading = Number(data.final_reading);
  if (Number.isFinite(initialReading) && Number.isFinite(finalReading)) {
    setIfKnown("total_km_car_run", finalReading - initialReading);
    setIfKnown("total_km_run", finalReading - initialReading);
  }

  if (register.slug !== "daily-attendance") {
    const durationPairs: Array<[string, string]> = [
      ["morning_in", "morning_out"],
      ["evening_in", "evening_out"],
      ["in_time", "out_time"],
      ["key_out", "key_returned"],
    ];
    const durations = durationPairs
      .map(([from, to]) => minutesBetween(data[from], data[to]))
      .filter((value): value is number => value !== undefined);
    if (durations.length) {
      const total = durations.reduce((sum, value) => sum + value, 0);
      setIfKnown("time_duration", `${Math.floor(total / 60)}h ${total % 60}m`);
      setIfKnown("total_hours", `${Math.floor(total / 60)}h ${total % 60}m`);
    }
  }

  const unit12 = minutesBetween(data.out_time_from_unit_1, data.in_time_in_unit_2);
  const unit21 = minutesBetween(data.out_time_from_unit_2, data.in_time_in_unit_1);
  if (unit12 !== undefined) setIfKnown("time_taken_to_travel_from_unit1_to_2", `${Math.floor(unit12 / 60)}h ${unit12 % 60}m`);
  if (unit21 !== undefined) setIfKnown("time_taken_to_travel_from_unit_2_to_1", `${Math.floor(unit21 / 60)}h ${unit21 % 60}m`);
  return data;
};

export const validateRequiredFields = (register: RegisterDefinition, recordDate: string | null, data: Record<string, unknown>) => {
  const missing = register.fields
    .filter((field) => field.required)
    .filter((field) => data[field.key] === undefined || data[field.key] === null || data[field.key] === "");
  return missing;
};

const responseDataForRole = (req: Request, definition: RegisterDefinition, data: Record<string, unknown>) => {
  const calculatedData = ["daily-attendance", "chowk-labour", "driver-attendance"].includes(definition.slug)
    ? applyDerivedValues(definition, data)
    : data;

  if (req.user?.role === "security" && referenceMasterSlugs.includes(definition.slug)) {
    return definition.slug === "key-master"
      ? { location: calculatedData.location }
      : { name: calculatedData.name };
  }

  if (req.user?.role === "security" && ["daily-attendance", "chowk-labour"].includes(definition.slug)) {
    const visible = { ...calculatedData };
    delete visible.payment_status;
    delete visible.overtime_payment_status;
    return visible;
  }

  return calculatedData;
};

const inputDataForRole = (req: Request, definition: RegisterDefinition, data: Record<string, unknown>) => {
  if (req.user?.role === "security" && ["daily-attendance", "chowk-labour"].includes(definition.slug)) {
    const sanitized = { ...data };
    delete sanitized.payment_status;
    delete sanitized.overtime_payment_status;
    return sanitized;
  }

  return data;
};

const toResponse = (row: typeof registerRecordsTable.$inferSelect, data = row.data) => ({
  id: row.id,
  registerSlug: row.registerSlug,
  recordDate: row.recordDate,
  data: row.recordDate && (data.date === undefined || data.date === null || data.date === "")
    ? { ...data, date: row.recordDate }
    : data,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const seedIfEmpty = async () => {
  if (!seedPromise) {
    seedPromise = (async () => {
      const existing = await db.select({ id: registerRecordsTable.id }).from(registerRecordsTable).limit(1);
      if (existing.length) return;
      for (const sample of sampleRecords) {
        const definition = getRegister(sample.registerSlug);
        if (!definition) continue;
        await db.insert(registerRecordsTable).values({
          id: randomUUID(),
          registerSlug: sample.registerSlug,
          recordDate: sample.recordDate,
          data: applyDerivedValues(definition, sample.data),
        });
      }
    })().catch((error) => {
      seedPromise = undefined;
      throw error;
    });
  }
  await seedPromise;
};

const recordSummary = (definition: RegisterDefinition, data: Record<string, unknown>) => {
  const preferred = ["name", "name_of_visitor", "labour_name", "driver_name", "party_name"];
  const subject = preferred.map((key) => data[key]).find((value) => value);
  return subject ? `${definition.title}: ${String(subject)}` : definition.title;
};

const calendarDate = (value: string | Date | null | undefined) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (!value) return null;
  const trimmed = value.trim();
  const dayFirst = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dayFirst) return `${dayFirst[3]}-${dayFirst[2]}-${dayFirst[1]}`;
  const isoDate = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  return isoDate?.[1] ?? trimmed;
};

const hrRegisterSlugs = ["driver-attendance", "daily-attendance", "chowk-labour"] as const;
const dateForRecord = (row: typeof registerRecordsTable.$inferSelect) => row.recordDate ?? (typeof row.data.date === "string" ? calendarDate(row.data.date) : null);
const parseRegisterRecordsQuery = (query: Request["query"]) => {
  const parseDateQuery = (value: unknown) => {
    if (value === undefined) return undefined;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  return ListRegisterRecordsQueryParams.parse({
    ...query,
    from: parseDateQuery(query.from),
    to: parseDateQuery(query.to),
  });
};
const parseDurationMinutes = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const clock = value.match(/^(-?)(\d+):(\d{2})$/);
  if (clock) return (clock[1] === "-" ? -1 : 1) * (Number(clock[2]) * 60 + Number(clock[3]));
  const text = value.match(/^(-?)(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/i);
  if (!text || (!text[2] && !text[3])) return undefined;
  return (text[1] === "-" ? -1 : 1) * (Number(text[2] ?? 0) * 60 + Number(text[3] ?? 0));
};
const personNameForRecord = (slug: string, data: Record<string, unknown>) =>
  String(data.labour_name ?? data.driver_name ?? data.choosen_driver ?? data.name ?? "").trim();
const numericValue = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};
const personKey = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const overtimeRateValue = (value: unknown) => {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) return undefined;
  const candidate = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/)?.[0] ?? Number.NaN)
      : Number(value);
  return Number.isFinite(candidate) && candidate >= 0 ? candidate : undefined;
};
const inclusiveDays = (from: string, to: string) =>
  Math.max(0, Math.floor((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000) + 1);

const paymentSourceSlugs = ["all", ...hrRegisterSlugs] as const;
const paymentMethods = ["Cash", "Bank transfer", "UPI", "Cheque", "Other"] as const;
const billKeyFor = (name: string, from: string, to: string, source: string) =>
  `${name.trim().toLowerCase()}|${from}|${to}|${source}`;
const attendanceReferenceFor = (id: string, date: string, registerSlug: string) =>
  `ATT-${date.replaceAll("-", "")}-${registerSlug.slice(0, 3).toUpperCase()}-${id.slice(0, 8).toUpperCase()}`;
const parseAttendanceReferences = (value: string | null | undefined) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
};
const uniqueTransactionBillNumbers = <T extends { billNumber: string; id: string }>(rows: T[]) => {
  const used = new Set<string>();
  return rows.map((row) => {
    if (!used.has(row.billNumber)) {
      used.add(row.billNumber);
      return row;
    }
    let billNumber = `${row.billNumber}-${row.id.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
    let suffix = 2;
    while (used.has(billNumber)) {
      billNumber = `${row.billNumber}-${row.id.replaceAll("-", "").slice(0, 8).toUpperCase()}-${suffix}`;
      suffix += 1;
    }
    used.add(billNumber);
    return { ...row, billNumber };
  });
};
const paymentStatusFor = (paidAmount: number, totalAmount: number) =>
  paidAmount >= totalAmount && totalAmount > 0 ? "paid" : paidAmount > 0 ? "partial" : "unpaid";
const sourceMatches = (paymentSource: string, reportSource: string) =>
  reportSource === "all"
    ? paymentSource === "all" || hrRegisterSlugs.includes(paymentSource as typeof hrRegisterSlugs[number])
    : paymentSource === reportSource;
const paymentOverlapsPeriod = (payment: { fromDate: string; toDate: string }, from: string, to: string) =>
  payment.toDate >= from && payment.fromDate <= to;

const hrReport = async (from: string, to: string, sourceScope = "all") => {
  const [rows, labourRows, chowkLabourMasterRows, driverMasterRows, bills, transactions, exclusions] = await Promise.all([
    db.select().from(registerRecordsTable).where(inArray(registerRecordsTable.registerSlug, [...hrRegisterSlugs])),
    db.select().from(registerRecordsTable).where(eq(registerRecordsTable.registerSlug, "labour-master")),
    db.select().from(registerRecordsTable).where(eq(registerRecordsTable.registerSlug, "chowk-labour-master")).orderBy(desc(registerRecordsTable.updatedAt)),
    db.select().from(registerRecordsTable).where(eq(registerRecordsTable.registerSlug, "driver-master")).orderBy(desc(registerRecordsTable.updatedAt)),
    db.select().from(paymentBillsTable),
    db.select().from(paymentTransactionsTable),
    db.select().from(paymentAttendanceExclusionsTable),
  ]);
  const excludedKeys = new Set(exclusions.map((item) => `${item.billKey}|${item.recordId}`));
  const billMap = new Map(bills.map((bill) => [bill.billKey, bill]));
  const wages = new Map(labourRows.map((row) => [
    String(row.data.name ?? "").trim().toLowerCase(),
    {
      wagePerDay: numericValue(row.data.wages_per_day),
      overtimeRate: overtimeRateValue(row.data.overtime_wages_per_hours) ?? 0,
    },
  ]));
  const chowkLabourSettings = chowkLabourMasterRows[0]?.data ?? {};
  const chowkLabourWageDetails = {
    wagePerDay: numericValue(chowkLabourSettings.wages_per_day),
    overtimeRate: overtimeRateValue(chowkLabourSettings.overtime_wages_per_hours) ?? 0,
  };
  const driverAllowances = new Map<string, { dayAllowance: number; nightAllowance: number }>();
  for (const row of driverMasterRows) {
    const key = personKey(row.data.name);
    if (!key || driverAllowances.has(key)) continue;
    driverAllowances.set(key, {
      dayAllowance: numericValue(row.data.day_allowance),
      nightAllowance: numericValue(row.data.night_allowance),
    });
  }
  const summary = new Map<string, {
    name: string; workedDays: number; leftDays: number; overtimeMinutes: number; shortfallMinutes: number;
    wagePerDay: number; overtimeRate: number;
    baseAmount: number; overtimeAmount: number; totalAmount: number; sources: Record<string, { days: number; overtimeMinutes: number; amount: number }>;
    dates: Set<string>;
  }>();
  const details: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    if (sourceScope !== "all" && row.registerSlug !== sourceScope) continue;
    const date = dateForRecord(row);
    if (!date || date < from || date > to) continue;
    const name = personNameForRecord(row.registerSlug, row.data);
    if (!name) continue;
    const definition = getRegister(row.registerSlug);
    const data = definition ? applyDerivedValues(definition, row.data) : row.data;
    const isDriverAttendance = row.registerSlug === "driver-attendance";
    const minutes = isDriverAttendance
      ? parseDurationMinutes(data.time_duration) ?? 480
      : ["daily-attendance", "chowk-labour"].includes(row.registerSlug)
        ? trainingDurationMinutes(data) ?? parseDurationMinutes(data.total_hours) ?? 0
        : parseDurationMinutes(data.time_duration) ?? 0;
    const workedDays = isDriverAttendance
      ? Math.max(1, numericValue(data.total_days) || 1)
      : totalDaysForMinutes(minutes);
    const overtimeMinutes = overtimeMinutesFor(minutes);
    const shortfallMinutes = Math.max(480 - minutes, 0);
    const wageDetails = row.registerSlug === "chowk-labour"
      ? chowkLabourWageDetails
      : wages.get(name.toLowerCase()) ?? { wagePerDay: 0, overtimeRate: 0 };
    const wage = wageDetails.wagePerDay;
    const overtimeRate = wageDetails.overtimeRate;
    const driverAllowance = isDriverAttendance
      ? driverAllowances.get(personKey(name)) ?? { dayAllowance: 0, nightAllowance: 0 }
      : { dayAllowance: 0, nightAllowance: 0 };
    const da = isDriverAttendance ? numericValue(data.day_allowance) : 0;
    const na = isDriverAttendance ? numericValue(data.night_allowance) : 0;
    const daAmount = da * driverAllowance.dayAllowance;
    const naAmount = na * driverAllowance.nightAllowance;
    const allowanceAmount = isDriverAttendance ? daAmount + naAmount : workedDays * wage;
    const overtimeAmount = isDriverAttendance ? 0 : (overtimeMinutes / 60) * overtimeRate;
    const rowAmount = allowanceAmount + overtimeAmount;
    const billKey = billKeyFor(name, from, to, sourceScope);
    const paymentIncluded = !excludedKeys.has(`${billKey}|${row.id}`);
    const existing = summary.get(name.toLowerCase()) ?? {
      name, workedDays: 0, leftDays: 0, overtimeMinutes: 0, shortfallMinutes: 0,
      wagePerDay: wage, overtimeRate,
      baseAmount: 0, overtimeAmount: 0, totalAmount: 0, sources: {}, dates: new Set<string>(),
    };
    summary.set(name.toLowerCase(), existing);
    details.push({
      id: row.id,
      referenceNo: attendanceReferenceFor(row.id, date, row.registerSlug),
      date, name, source: row.registerSlug, workedDays, minutes, overtimeMinutes,
      shortfallMinutes, da, na, daAmount, naAmount,
      baseAmount: allowanceAmount, overtimeAmount, totalAmount: rowAmount, paymentIncluded,
    });
    if (!paymentIncluded) {
      continue;
    }
    existing.wagePerDay = existing.wagePerDay || wage;
    existing.overtimeRate = existing.overtimeRate || overtimeRate;
    existing.workedDays += workedDays;
    existing.overtimeMinutes += overtimeMinutes;
    existing.shortfallMinutes += shortfallMinutes;
    existing.baseAmount += allowanceAmount;
    existing.overtimeAmount += overtimeAmount;
    existing.totalAmount += rowAmount;
    existing.dates.add(date);
    const source = existing.sources[row.registerSlug] ?? { days: 0, overtimeMinutes: 0, amount: 0 };
    source.days += workedDays;
    source.overtimeMinutes += overtimeMinutes;
    source.amount += rowAmount;
    existing.sources[row.registerSlug] = source;
  }
  const expectedDays = inclusiveDays(from, to);
  const summaries = Array.from(summary.values()).map(({ dates, ...item }) => {
    const exactBillKey = billKeyFor(item.name, from, to, sourceScope);
    const bill = billMap.get(exactBillKey);
    const subtotal = item.baseAmount + item.overtimeAmount;
    const payableAmount = Number(subtotal.toFixed(2));
    const matchingTransactions = transactions.filter((transaction) =>
      transaction.personName.trim().toLowerCase() === item.name.trim().toLowerCase() &&
      sourceMatches(transaction.sourceScope, sourceScope) &&
      paymentOverlapsPeriod(transaction, from, to),
    );
    const personDetails = details.filter((detail) =>
      String(detail["name"] ?? "").trim().toLowerCase() === item.name.trim().toLowerCase() &&
      detail["paymentIncluded"] !== false,
    );
    const transactionPaidAmount = matchingTransactions
      .filter((transaction) => {
        const targetedReferences = parseAttendanceReferences(transaction.attendanceReferences);
        if (!targetedReferences.length) return false;
        const references = new Set(personDetails.map((detail) => String(detail["referenceNo"] ?? "")));
        return targetedReferences.some((reference) => references.has(reference));
      })
      .reduce((sum, transaction) => sum + numericValue(transaction.amount), 0);
    const paidAmount = Math.min(
      Math.max(
        transactionPaidAmount > 0
          ? transactionPaidAmount
          : 0,
        0,
      ),
       Math.max(payableAmount, 0),
    );
    return {
        ...item,
        wageAmount: item.baseAmount,
        overtimeRate: item.overtimeRate,
      totalAmount: payableAmount,
      leftDays: Math.max(expectedDays - dates.size, 0),
      paidAmount,
      outstandingAmount: Math.max(payableAmount - paidAmount, 0),
      paymentStatus: paymentStatusFor(paidAmount, payableAmount),
      billNumber: bill?.billNumber ?? null,
      paidAt: bill?.paidAt?.toISOString() ?? null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const sortedDetails = details.slice().sort((a, b) =>
    String(a["date"] ?? "").localeCompare(String(b["date"] ?? "")),
  );
  const detailPayments = new Map<string, {
    paidAmount: number;
    paymentDates: Set<string>;
    paymentMethods: Set<string>;
    paymentReferences: Set<string>;
    paymentAllocations: Array<{ transactionId: string; amount: number }>;
  }>();
  const detailsByPerson = new Map<string, Array<Record<string, unknown>>>();
  for (const detail of sortedDetails) {
    const personKey = String(detail["name"] ?? "").trim().toLowerCase();
    const personDetails = detailsByPerson.get(personKey) ?? [];
    personDetails.push(detail);
    detailsByPerson.set(personKey, personDetails);
  }
  for (const [personKey, personDetails] of detailsByPerson) {
    const personName = String(personDetails[0]?.["name"] ?? "");
    const exactBillKey = billKeyFor(personName, from, to, sourceScope);
    const matchingTransactions = transactions
      .filter((transaction) =>
        transaction.personName.trim().toLowerCase() === personKey &&
      sourceMatches(transaction.sourceScope, sourceScope) &&
      paymentOverlapsPeriod(transaction, from, to),
      )
      .sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());
    const bill = billMap.get(exactBillKey);
    const paymentEvents = matchingTransactions.length
      ? matchingTransactions
      : bill && numericValue(bill.paidAmount) > 0
        ? [{
          amount: numericValue(bill.paidAmount),
          fromDate: from,
          toDate: to,
          paidAt: bill.paidAt ?? new Date(),
          paymentMethod: bill.paymentMethod ?? "Recorded payment",
          paymentReference: bill.paymentReference,
        }]
        : [];
    for (const payment of paymentEvents) {
      let remaining = Math.max(numericValue(payment.amount), 0);
      if (!remaining) continue;
      const targetedReferences = "attendanceReferences" in payment
        ? parseAttendanceReferences(payment.attendanceReferences)
        : [];
      const targetedReferenceSet = targetedReferences.length ? new Set(targetedReferences) : null;
      for (const detail of personDetails) {
        if (detail["paymentIncluded"] === false) continue;
        const detailReference = String(detail["referenceNo"] ?? "");
        if (!targetedReferenceSet || !targetedReferenceSet.has(detailReference)) continue;
        const detailId = String(detail["id"] ?? "");
        const existing = detailPayments.get(detailId) ?? {
          paidAmount: 0,
          paymentDates: new Set<string>(),
          paymentMethods: new Set<string>(),
          paymentReferences: new Set<string>(),
        paymentAllocations: [],
        };
        const due = Math.max(numericValue(detail["totalAmount"]), 0);
        const available = Math.max(due - existing.paidAmount, 0);
        const allocation = Math.min(available, remaining);
        if (!allocation) continue;
        existing.paidAmount += allocation;
        existing.paymentDates.add(payment.paidAt.toISOString());
        if (payment.paymentMethod) existing.paymentMethods.add(payment.paymentMethod);
        if (payment.paymentReference) existing.paymentReferences.add(payment.paymentReference);
        const paymentId = "id" in payment && typeof payment.id === "string" ? payment.id : undefined;
        if (paymentId) existing.paymentAllocations.push({ transactionId: paymentId, amount: allocation });
        detailPayments.set(detailId, existing);
        remaining -= allocation;
        if (remaining <= 0.005) break;
      }
    }
  }
  return {
    from, to, sourceScope, expectedDays, summaries,
    details: sortedDetails.map((item) => ({
      ...item,
      paidAmount: item["paymentIncluded"] === false ? 0 : Number((detailPayments.get(String(item["id"] ?? ""))?.paidAmount ?? 0).toFixed(2)),
      outstandingAmount: item["paymentIncluded"] === false ? 0 : Number(Math.max(numericValue(item["totalAmount"]) - (detailPayments.get(String(item["id"] ?? ""))?.paidAmount ?? 0), 0).toFixed(2)),
      paymentDates: Array.from(detailPayments.get(String(item["id"] ?? ""))?.paymentDates ?? []),
      paymentMethods: Array.from(detailPayments.get(String(item["id"] ?? ""))?.paymentMethods ?? []),
      paymentReferences: Array.from(detailPayments.get(String(item["id"] ?? ""))?.paymentReferences ?? []),
       paymentAllocations: detailPayments.get(String(item["id"] ?? ""))?.paymentAllocations ?? [],
      paymentStatus: item["paymentIncluded"] === false ? "excluded" : paymentStatusFor(
        detailPayments.get(String(item["id"] ?? ""))?.paidAmount ?? 0,
        numericValue(item["totalAmount"]),
      ),
    })),
  };
};

const dateInIndia = (value: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
};

const editWindowForRole = (role: string | undefined, definition?: RegisterDefinition) => {
  if (definition?.module === "master" && (role === "admin" || role === "manager" || role === "hr")) return null;
  if (role === "admin") return null;
  if (role === "manager") return 7;
  if (role === "security") return 7;
  return undefined;
};

const canEditRecord = (createdAt: Date, role: string | undefined, definition?: RegisterDefinition) => {
  const windowDays = editWindowForRole(role, definition);
  if (windowDays === null) return true;
  if (windowDays === undefined) return false;
  const createdDate = new Date(`${dateInIndia(createdAt)}T00:00:00Z`);
  const today = new Date(`${dateInIndia(new Date())}T00:00:00Z`);
  const daysSinceCreation = Math.floor((today.getTime() - createdDate.getTime()) / 86_400_000);
  return daysSinceCreation >= 0 && daysSinceCreation <= windowDays;
};

router.get("/dashboard", async (req: Request, res: Response) => {
  await seedIfEmpty();
  const allRows = await db.select().from(registerRecordsTable);
  const rows = allRows.filter((row) => {
    const definition = getRegister(row.registerSlug);
    return definition ? canAccessDefinition(req, definition) : false;
  });
  const definitions = REGISTER_DEFINITIONS.filter((definition) => canAccessDefinition(req, definition));
  const modules = ["security", "main-gate", "master"].map((module) => ({
    module,
    label: module === "security" ? "Security Operations" : module === "main-gate" ? "Main Gate Security" : "Master",
    totalRecords: rows.filter((row) => getRegister(row.registerSlug)?.module === module).length,
    registerCount: definitions.filter((item) => item.module === module).length,
  }));
  const latest = rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 5);
  const latestDate = rows.map(dateForRecord).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
  return res.json({
    totalRecords: rows.length,
    totalRegisters: definitions.length,
    modules,
    attentionItems: [
      "Open gate passes can be reviewed from their register",
      "Payment status is available on labour and driver records",
      "Derived time, water, and vehicle totals are calculated automatically",
    ],
    latestDate,
    latestActivity: latest.map((row) => recordSummary(getRegister(row.registerSlug)!, row.data)),
  });
});

router.get("/activity", async (req: Request, res: Response) => {
  await seedIfEmpty();
  const query = GetActivityQueryParams.parse(req.query);
  const allRows = await db.select().from(registerRecordsTable).orderBy(desc(registerRecordsTable.updatedAt));
  const rows = allRows
    .filter((row) => {
      const definition = getRegister(row.registerSlug);
      return definition ? canAccessDefinition(req, definition) : false;
    })
    .slice(0, query.limit ?? 100);
  return res.json(rows.map((row) => {
    const definition = getRegister(row.registerSlug)!;
    return {
      id: row.id,
      registerSlug: row.registerSlug,
      registerTitle: definition.title,
      summary: recordSummary(definition, row.data),
      timestamp: row.updatedAt.toISOString(),
    };
  }));
});

router.get("/registers", async (req: Request, res: Response) => {
  await seedIfEmpty();
  const counts = await db.select({ registerSlug: registerRecordsTable.registerSlug }).from(registerRecordsTable);
  const definitions = REGISTER_DEFINITIONS.filter((definition) => canAccessDefinition(req, definition));
  return res.json(definitions.map((definition) => ({
    ...definition,
    recordCount: counts.filter((row) => row.registerSlug === definition.slug).length,
  })));
});

router.get("/registers/:slug/records", async (req: Request, res: Response) => {
  await seedIfEmpty();
  const { slug } = ListRegisterRecordsParams.parse(req.params);
  const query = parseRegisterRecordsQuery(req.query);
  const definition = getRegister(slug);
  if (!definition) return res.status(404).json({ error: "Register not found" });
  if (!canReadDefinition(req, definition)) return res.status(403).json({ error: "This role cannot access that module" });
  let rows = await db.select().from(registerRecordsTable).where(eq(registerRecordsTable.registerSlug, slug)).orderBy(desc(registerRecordsTable.updatedAt));
  const search = query.search?.trim().toLowerCase();
  if (search) rows = rows.filter((row) => JSON.stringify(responseDataForRole(req, definition, row.data)).toLowerCase().includes(search));
  const name = query.name?.trim().toLowerCase();
  if (name) rows = rows.filter((row) => Object.entries(responseDataForRole(req, definition, row.data))
    .filter(([key]) => key.includes("name") || key === "labour_name")
    .some(([, value]) => String(value ?? "").toLowerCase().includes(name)));
  if (query.from) rows = rows.filter((row) => !dateForRecord(row) || dateForRecord(row)! >= calendarDate(query.from)!);
  if (query.to) rows = rows.filter((row) => !dateForRecord(row) || dateForRecord(row)! <= calendarDate(query.to)!);
  return res.json({
    records: rows.slice(0, query.limit ?? 100).map((row) => toResponse(row, responseDataForRole(req, definition, row.data))),
    total: rows.length,
  });
});

router.get("/registers/:slug/records/export", async (req: Request, res: Response) => {
  await seedIfEmpty();
  const { slug } = ListRegisterRecordsParams.parse(req.params);
  const query = parseRegisterRecordsQuery(req.query);
  const definition = getRegister(slug);
  if (!definition) return res.status(404).json({ error: "Register not found" });
  if (!canReadDefinition(req, definition)) return res.status(403).json({ error: "This role cannot access that module" });
  let rows = await db.select().from(registerRecordsTable).where(eq(registerRecordsTable.registerSlug, slug)).orderBy(desc(registerRecordsTable.updatedAt));
  const search = query.search?.trim().toLowerCase();
  if (search) rows = rows.filter((row) => JSON.stringify(responseDataForRole(req, definition, row.data)).toLowerCase().includes(search));
  const name = query.name?.trim().toLowerCase();
  if (name) rows = rows.filter((row) => Object.entries(responseDataForRole(req, definition, row.data))
    .filter(([key]) => key.includes("name") || key === "labour_name")
    .some(([, value]) => String(value ?? "").toLowerCase().includes(name)));
  if (query.from) rows = rows.filter((row) => !dateForRecord(row) || dateForRecord(row)! >= calendarDate(query.from)!);
  if (query.to) rows = rows.filter((row) => !dateForRecord(row) || dateForRecord(row)! <= calendarDate(query.to)!);
  return res.json({ records: rows.map((row) => toResponse(row, responseDataForRole(req, definition, row.data))), total: rows.length });
});

router.get("/hr/report", async (req: Request, res: Response) => {
  if (!["admin", "manager", "hr"].includes(req.user?.role ?? "")) {
    return res.status(403).json({ error: "Only HR, managers, and admins can view HR reports" });
  }
  const from = typeof req.query.from === "string" ? req.query.from : "";
  const to = typeof req.query.to === "string" ? req.query.to : "";
  const source = typeof req.query.source === "string" ? req.query.source : "all";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return res.status(400).json({ error: "Choose a valid report date range" });
  }
  if (!paymentSourceSlugs.includes(source as typeof paymentSourceSlugs[number])) {
    return res.status(400).json({ error: "Choose a valid payment register" });
  }
  return res.json(await hrReport(from, to, source));
});

router.post("/hr/attendance-inclusion", async (req: Request, res: Response) => {
  if (!["admin", "hr"].includes(req.user?.role ?? "")) {
    return res.status(403).json({ error: "Only HR and admins can change payment attendance inclusion" });
  }
  const body = req.body as Record<string, unknown>;
  const recordId = typeof body.recordId === "string" ? body.recordId.trim() : "";
  const fromDate = typeof body.fromDate === "string" ? body.fromDate : "";
  const toDate = typeof body.toDate === "string" ? body.toDate : "";
  const sourceScope = typeof body.sourceScope === "string" ? body.sourceScope : "all";
  const included = body.included === true;
  if (
    !recordId ||
    !/^\d{4}-\d{2}-\d{2}$/.test(fromDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(toDate) ||
    fromDate > toDate ||
    !paymentSourceSlugs.includes(sourceScope as typeof paymentSourceSlugs[number])
  ) {
    return res.status(400).json({ error: "Invalid attendance inclusion details" });
  }
  const row = (await db.select().from(registerRecordsTable).where(eq(registerRecordsTable.id, recordId)).limit(1))[0];
  if (!row || !hrRegisterSlugs.includes(row.registerSlug as typeof hrRegisterSlugs[number])) {
    return res.status(404).json({ error: "HR attendance record not found" });
  }
  const name = personNameForRecord(row.registerSlug, row.data);
  if (!name) return res.status(400).json({ error: "This attendance record has no person name" });
  const billKey = billKeyFor(name, fromDate, toDate, sourceScope);
  const existing = (await db.select().from(paymentAttendanceExclusionsTable)
    .where(and(eq(paymentAttendanceExclusionsTable.recordId, recordId), eq(paymentAttendanceExclusionsTable.billKey, billKey)))
    .limit(1))[0];
  if (included) {
    if (existing) {
      await db.delete(paymentAttendanceExclusionsTable).where(eq(paymentAttendanceExclusionsTable.id, existing.id));
    }
  } else if (!existing) {
    await db.insert(paymentAttendanceExclusionsTable).values({
      id: randomUUID(),
      recordId,
      billKey,
      excludedBy: req.user?.displayName ?? req.user?.email ?? null,
    });
  }
  return res.json({ included });
});

router.get("/payments/bills", async (req: Request, res: Response) => {
  if (!["admin", "manager", "hr"].includes(req.user?.role ?? "")) {
    return res.status(403).json({ error: "Only HR, managers, and admins can view payment history" });
  }
  const rows = await db.select().from(paymentBillsTable).orderBy(desc(paymentBillsTable.updatedAt));
  const from = typeof req.query.from === "string" ? req.query.from : "";
  const to = typeof req.query.to === "string" ? req.query.to : "";
  const source = typeof req.query.source === "string" ? req.query.source : "all";
  const name = typeof req.query.name === "string" ? req.query.name.trim().toLowerCase() : "";
  return res.json(rows.filter((bill) =>
    (!from || bill.fromDate >= from) &&
    (!to || bill.toDate <= to) &&
    sourceMatches(bill.sourceScope, source) &&
    (!name || bill.personName.toLowerCase().includes(name)),
  ));
});

router.get("/payments/transactions", async (req: Request, res: Response) => {
  if (!["admin", "manager", "hr"].includes(req.user?.role ?? "")) {
    return res.status(403).json({ error: "Only HR, managers, and admins can view payment transactions" });
  }
  const rows = await db.select().from(paymentTransactionsTable).orderBy(desc(paymentTransactionsTable.paidAt));
  const from = typeof req.query.from === "string" ? req.query.from : "";
  const to = typeof req.query.to === "string" ? req.query.to : "";
  const source = typeof req.query.source === "string" ? req.query.source : "all";
  const name = typeof req.query.name === "string" ? req.query.name.trim().toLowerCase() : "";
  const paidOn = typeof req.query.paidOn === "string" ? req.query.paidOn : "";
  return res.json(uniqueTransactionBillNumbers(rows).filter((transaction) =>
    (!from || transaction.toDate >= from) &&
    (!to || transaction.fromDate <= to) &&
    sourceMatches(transaction.sourceScope, source) &&
    (!paidOn || dateInIndia(transaction.paidAt) === paidOn) &&
    (!name || transaction.personName.toLowerCase().includes(name)),
  ).map((transaction) => ({
    ...transaction,
    attendanceReferences: parseAttendanceReferences(transaction.attendanceReferences),
  })));
});

router.post("/payments/bills", async (req: Request, res: Response) => {
  if (!["admin", "hr"].includes(req.user?.role ?? "")) {
    return res.status(403).json({ error: "Only HR and admins can change payment status" });
  }
  const body = req.body as Record<string, unknown>;
  const personName = typeof body.personName === "string" ? body.personName.trim() : "";
  const fromDate = typeof body.fromDate === "string" ? body.fromDate : "";
  const toDate = typeof body.toDate === "string" ? body.toDate : "";
  const sourceScope = typeof body.sourceScope === "string" ? body.sourceScope : "all";
  const attendanceRecordIds = Array.from(new Set(
    Array.isArray(body.attendanceRecordIds)
      ? body.attendanceRecordIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim())
      : [],
  ));
  const paymentMethod = paymentMethods.includes(body.paymentMethod as typeof paymentMethods[number])
    ? body.paymentMethod as typeof paymentMethods[number]
    : "Cash";
  const paymentReference = typeof body.paymentReference === "string" ? body.paymentReference.trim() : "";
  const paymentNote = typeof body.paymentNote === "string" ? body.paymentNote.trim() : "";
  if (
    !personName ||
    !/^\d{4}-\d{2}-\d{2}$/.test(fromDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(toDate) ||
    fromDate > toDate ||
    !paymentSourceSlugs.includes(sourceScope as typeof paymentSourceSlugs[number]) ||
    !attendanceRecordIds.length ||
    attendanceRecordIds.length > 500 ||
    paymentReference.length > 160 ||
    paymentNote.length > 500 ||
    (["Bank transfer", "UPI", "Cheque"].includes(paymentMethod) && !paymentReference)
  ) {
    return res.status(400).json({ error: "Invalid bill details" });
  }
  const report = await hrReport(fromDate, toDate, sourceScope);
  const summary = report.summaries.find((item) => item.name.trim().toLowerCase() === personName.toLowerCase());
  if (!summary) return res.status(404).json({ error: "No attendance or payable amount was found for this person and period" });
  const selectedDetails = (report.details as Array<Record<string, unknown>>).filter((detail) =>
    String(detail["name"] ?? "").trim().toLowerCase() === personName.toLowerCase() &&
    attendanceRecordIds.includes(String(detail["id"] ?? "")),
  );
  if (selectedDetails.length !== attendanceRecordIds.length) {
    return res.status(400).json({ error: "Each selected attendance entry must belong to this person and payment period" });
  }
  if (selectedDetails.some((detail) => detail["paymentIncluded"] === false || numericValue(detail["outstandingAmount"]) <= 0)) {
    return res.status(400).json({ error: "Only included attendance entries with an unpaid balance can be paid" });
  }
  const paymentAmount = Number(selectedDetails.reduce((sum, detail) => sum + numericValue(detail["outstandingAmount"]), 0).toFixed(2));
  if (!paymentAmount) return res.status(400).json({ error: "The selected attendance entries have no amount left to pay" });
  if (paymentAmount > summary.outstandingAmount + 0.005) {
    return res.status(400).json({ error: `Payment cannot exceed the outstanding amount of ${summary.outstandingAmount.toFixed(2)}` });
  }

  const billKey = billKeyFor(personName, fromDate, toDate, sourceScope);
  const result = await db.transaction(async (tx) => {
    const existing = await tx.select().from(paymentBillsTable).where(eq(paymentBillsTable.billKey, billKey)).limit(1);
    const current = existing[0];
    const totalAmount = summary.totalAmount;
    const nextPaidAmount = Math.min(summary.paidAmount + paymentAmount, totalAmount);
    const nextStatus = paymentStatusFor(nextPaidAmount, totalAmount);
    const billNumber = current?.billNumber ?? `PAY-${Date.now()}-${randomUUID().slice(0, 4).toUpperCase()}`;
    const transactionBillNumber = `PAY-${Date.now()}-${randomUUID().slice(0, 4).toUpperCase()}`;
    const paidAt = new Date();
    const payload = {
      personName: summary.name,
      fromDate,
      toDate,
      sourceScope,
      totalDays: summary.workedDays,
      wagePerDay: summary.wagePerDay,
      wageAmount: summary.wageAmount,
      overtimeMinutes: Math.round(summary.overtimeMinutes),
      overtimeRate: summary.overtimeRate,
      overtimeAmount: summary.overtimeAmount,
      totalAmount,
      paidAmount: nextPaidAmount,
      status: nextStatus,
      paymentMethod,
      paymentReference: paymentReference || null,
      paymentNote: paymentNote || null,
      paidAt,
      paidBy: req.user?.displayName ?? req.user?.email ?? null,
      updatedAt: paidAt,
    };
    const bill = current
      ? (await tx.update(paymentBillsTable).set(payload).where(eq(paymentBillsTable.billKey, billKey)).returning())[0]
      : (await tx.insert(paymentBillsTable).values({
        id: randomUUID(), billNumber, billKey, ...payload,
      }).returning())[0];
    await tx.insert(paymentTransactionsTable).values({
      id: randomUUID(),
      billKey,
      billNumber: transactionBillNumber,
      personName: summary.name,
      fromDate,
      toDate,
      sourceScope,
      amount: paymentAmount,
      paymentMethod,
      paymentReference: paymentReference || null,
      paymentNote: paymentNote || null,
      attendanceReferences: JSON.stringify(selectedDetails.map((detail) => String(detail["referenceNo"] ?? ""))),
      paidAt,
      paidBy: req.user?.displayName ?? req.user?.email ?? null,
    });
    return { bill, created: !current };
  });
  return res.status(result.created ? 201 : 200).json(result.bill);
});

router.post("/registers/:slug/records", async (req: Request, res: Response) => {
  await seedIfEmpty();
  if (!canCreateRegisterRecord(req.user?.role)) {
    return res.status(403).json({ error: "This role cannot add register records" });
  }
  const { slug } = CreateRegisterRecordParams.parse(req.params);
  const body = CreateRegisterRecordBody.parse(req.body);
  const definition = getRegister(slug);
  if (!definition) return res.status(404).json({ error: "Register not found" });
  if (!canAccessDefinition(req, definition)) return res.status(403).json({ error: "This role cannot access that module" });
  const recordDate = calendarDate(body.data.date as string | undefined) ?? dateInIndia(new Date());
  const data = applyDerivedValues(
    definition,
    inputDataForRole(req, definition, { ...body.data, date: recordDate }),
  );
  const missing = validateRequiredFields(definition, recordDate, data);
  if (missing.length) return res.status(400).json({ error: `Missing required fields: ${missing.map((field) => field.label).join(", ")}` });
  if (slug === "chowk-labour-master") {
    const existing = await db.select().from(registerRecordsTable)
      .where(eq(registerRecordsTable.registerSlug, slug))
      .orderBy(desc(registerRecordsTable.updatedAt))
      .limit(1);
    if (existing[0]) {
      const row = await db.update(registerRecordsTable).set({
        data,
        updatedAt: new Date(),
      }).where(eq(registerRecordsTable.id, existing[0].id)).returning();
      return res.json(toResponse(row[0], responseDataForRole(req, definition, row[0].data)));
    }
  }
  const row = await db.insert(registerRecordsTable).values({
    id: randomUUID(),
    registerSlug: slug,
    recordDate,
    data,
  }).returning();
  return res.status(201).json(toResponse(row[0], responseDataForRole(req, definition, row[0].data)));
});

router.patch("/registers/:slug/records/:id", async (req: Request, res: Response) => {
  await seedIfEmpty();
  const { slug, id } = UpdateRegisterRecordParams.parse(req.params);
  const body = UpdateRegisterRecordBody.parse(req.body);
  const definition = getRegister(slug);
  if (!definition) return res.status(404).json({ error: "Register not found" });
  if (!canAccessDefinition(req, definition)) return res.status(403).json({ error: "This role cannot access that module" });
  const existing = await db.select().from(registerRecordsTable).where(and(eq(registerRecordsTable.id, id), eq(registerRecordsTable.registerSlug, slug))).limit(1);
  if (!existing[0]) return res.status(404).json({ error: "Record not found" });
  const editWindowDays = editWindowForRole(req.user?.role, definition);
  if (editWindowDays === undefined) {
    return res.status(403).json({ error: "This role cannot edit records" });
  }
  if (!canEditRecord(existing[0].createdAt, req.user?.role, definition)) {
    return res.status(403).json({
      error: req.user?.role === "admin"
        ? "This record cannot be edited"
        : `This record can no longer be edited. ${req.user?.role === "manager" ? "Managers" : "Security staff"} can edit records for ${editWindowDays} days after entry.`,
    });
  }
  const recordDate = body.data?.date === undefined
    ? existing[0].recordDate
      ?? calendarDate(typeof existing[0].data.date === "string" ? existing[0].data.date : undefined)
      ?? dateInIndia(new Date())
    : calendarDate(body.data.date as string | undefined) ?? dateInIndia(new Date());
  const data = applyDerivedValues(
    definition,
    inputDataForRole(req, definition, { ...(body.data ?? existing[0].data), date: recordDate }),
  );
  const missing = validateRequiredFields(definition, recordDate, data);
  if (missing.length) return res.status(400).json({ error: `Missing required fields: ${missing.map((field) => field.label).join(", ")}` });
  const row = await db.update(registerRecordsTable).set({
    recordDate,
    data,
    updatedAt: new Date(),
  }).where(eq(registerRecordsTable.id, id)).returning();
  return res.json(toResponse(row[0], responseDataForRole(req, definition, row[0].data)));
});

router.delete("/registers/:slug/records/:id", async (req: Request, res: Response) => {
  await seedIfEmpty();
  const { slug, id } = DeleteRegisterRecordParams.parse(req.params);
  const definition = getRegister(slug);
  if (!definition) return res.status(404).json({ error: "Register not found" });
  if (!canAccessDefinition(req, definition)) return res.status(403).json({ error: "This role cannot access that module" });
  if (req.user?.role !== "admin" && req.user?.role !== "manager") {
    return res.status(403).json({ error: "Only managers and admins can delete records" });
  }

  const existing = await db
    .select()
    .from(registerRecordsTable)
    .where(and(eq(registerRecordsTable.id, id), eq(registerRecordsTable.registerSlug, slug)))
    .limit(1);
  if (!existing[0]) return res.status(404).json({ error: "Record not found" });
  if (!canEditRecord(existing[0].createdAt, req.user?.role, definition)) {
    return res.status(403).json({
      error: "Managers can delete records only within 7 days of entry. Admins can delete records at any time.",
    });
  }

  await db
    .delete(registerRecordsTable)
    .where(and(eq(registerRecordsTable.id, id), eq(registerRecordsTable.registerSlug, slug)));
  return res.status(204).send();
});

export default router;