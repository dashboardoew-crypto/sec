import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, paymentBillsTable, registerRecordsTable } from "@workspace/db";
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

const referenceMasterSlugs = ["labour-master", "key-master", "kothi-master"];
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

const minutesFromTime = (value: unknown, period?: "morning" | "evening") => {
  if (typeof value !== "string") return undefined;
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return undefined;
  const normalizedHours = period === "evening" && hours < 12 ? hours + 12 : hours;
  return normalizedHours * 60 + minutes;
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

const formatTotalDays = (minutes: number) => {
  const days = minutes / 480;
  return Number.isInteger(days) ? String(days) : days.toFixed(2);
};

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
      setIfKnown("total_water_consumed", water);
      if (minutesConsumed) setIfKnown("per_minute_water_consumed", Number((water / minutesConsumed).toFixed(2)));
    }
  }

  if (register.slug === "daily-attendance" || register.slug === "chowk-labour") {
    delete data.payment_status;
    delete data.overtime_payment_status;
    const totalMinutes = trainingDurationMinutes(data);
    if (totalMinutes !== undefined) {
      setIfKnown("total_hours", formatClockDuration(totalMinutes));
      setIfKnown("total_days", formatTotalDays(totalMinutes));
      setIfKnown("overtime", formatSignedClockDuration(totalMinutes - 480));
    }
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
  if (!recordDate) missing.unshift({ key: "recordDate", label: "Date", type: "date" });
  return missing;
};

const responseDataForRole = (req: Request, definition: RegisterDefinition, data: Record<string, unknown>) => {
  const calculatedData = ["daily-attendance", "chowk-labour"].includes(definition.slug)
    ? applyDerivedValues(definition, data)
    : data;

  if (req.user?.role === "security" && referenceMasterSlugs.includes(definition.slug)) {
    return { name: calculatedData.name };
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
  data,
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

const calendarDate = (value: string | Date | null | undefined) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : value ?? null;

const hrRegisterSlugs = ["driver-attendance", "daily-attendance", "chowk-labour"] as const;
const dateForRecord = (row: typeof registerRecordsTable.$inferSelect) => row.recordDate ?? (typeof row.data.date === "string" ? row.data.date : null);
const parseDurationMinutes = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const clock = value.match(/^(-?)(\d+):(\d{2})$/);
  if (clock) return (clock[1] === "-" ? -1 : 1) * (Number(clock[2]) * 60 + Number(clock[3]));
  const text = value.match(/^(-?)(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/i);
  if (!text || (!text[2] && !text[3])) return undefined;
  return (text[1] === "-" ? -1 : 1) * (Number(text[2] ?? 0) * 60 + Number(text[3] ?? 0));
};
const personNameForRecord = (slug: string, data: Record<string, unknown>) =>
  String(slug === "daily-attendance" ? data.labour_name : data.name ?? data.driver_name ?? "").trim();
const numericValue = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};
const inclusiveDays = (from: string, to: string) =>
  Math.max(0, Math.floor((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000) + 1);

const paymentSourceSlugs = ["all", ...hrRegisterSlugs] as const;
const billKeyFor = (name: string, from: string, to: string, source: string) =>
  `${name.trim().toLowerCase()}|${from}|${to}|${source}`;

const hrReport = async (from: string, to: string, sourceScope = "all") => {
  const [rows, labourRows, bills] = await Promise.all([
    db.select().from(registerRecordsTable).where(inArray(registerRecordsTable.registerSlug, [...hrRegisterSlugs])),
    db.select().from(registerRecordsTable).where(eq(registerRecordsTable.registerSlug, "labour-master")),
    db.select().from(paymentBillsTable),
  ]);
  const billMap = new Map(bills.map((bill) => [bill.billKey, bill]));
  const wages = new Map(labourRows.map((row) => [String(row.data.name ?? "").trim().toLowerCase(), numericValue(row.data.wages_per_day)]));
  const summary = new Map<string, {
    name: string; workedDays: number; leftDays: number; overtimeMinutes: number; shortfallMinutes: number;
    wagePerDay: number;
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
    const minutes = row.registerSlug === "driver-attendance"
      ? parseDurationMinutes(data.time_duration) ?? 480
      : ["daily-attendance", "chowk-labour"].includes(row.registerSlug)
        ? trainingDurationMinutes(data) ?? parseDurationMinutes(data.total_hours) ?? 0
        : parseDurationMinutes(data.time_duration) ?? 0;
    const workedDays = row.registerSlug === "driver-attendance" ? 1 : Math.max(minutes / 480, 0);
    const overtimeMinutes = Math.max(minutes - 480, 0);
    const shortfallMinutes = Math.max(480 - minutes, 0);
    const wage = wages.get(name.toLowerCase()) ?? 0;
    const allowanceAmount = row.registerSlug === "driver-attendance"
      ? numericValue(data.day_allowance) + numericValue(data.night_allowance)
      : workedDays * wage;
    const overtimeAmount = row.registerSlug === "driver-attendance" ? 0 : (overtimeMinutes / 60) * (wage / 8);
    const existing = summary.get(name.toLowerCase()) ?? {
      name, workedDays: 0, leftDays: 0, overtimeMinutes: 0, shortfallMinutes: 0,
      wagePerDay: wage,
      baseAmount: 0, overtimeAmount: 0, totalAmount: 0, sources: {}, dates: new Set<string>(),
    };
    existing.wagePerDay = existing.wagePerDay || wage;
    existing.workedDays += workedDays;
    existing.overtimeMinutes += overtimeMinutes;
    existing.shortfallMinutes += shortfallMinutes;
    existing.baseAmount += allowanceAmount;
    existing.overtimeAmount += overtimeAmount;
    existing.totalAmount += allowanceAmount + overtimeAmount;
    existing.dates.add(date);
    const source = existing.sources[row.registerSlug] ?? { days: 0, overtimeMinutes: 0, amount: 0 };
    source.days += workedDays;
    source.overtimeMinutes += overtimeMinutes;
    source.amount += allowanceAmount + overtimeAmount;
    existing.sources[row.registerSlug] = source;
    summary.set(name.toLowerCase(), existing);
    details.push({
      id: row.id, date, name, source: row.registerSlug, workedDays, minutes, overtimeMinutes,
      shortfallMinutes, baseAmount: allowanceAmount, overtimeAmount, totalAmount: allowanceAmount + overtimeAmount,
    });
  }
  const expectedDays = inclusiveDays(from, to);
  const summaries = Array.from(summary.values()).map(({ dates, ...item }) => {
    const bill = billMap.get(billKeyFor(item.name, from, to, sourceScope));
    const subtotal = item.baseAmount + item.overtimeAmount;
    const roundingAmount = Math.round(subtotal) - subtotal;
    return {
      ...item,
      wageAmount: item.baseAmount,
      overtimeRate: item.wagePerDay / 8,
      roundingAmount: Number(roundingAmount.toFixed(2)),
      totalAmount: Math.round(subtotal),
      leftDays: Math.max(expectedDays - dates.size, 0),
      paymentStatus: bill?.status ?? "unpaid",
      billNumber: bill?.billNumber ?? null,
      paidAt: bill?.paidAt?.toISOString() ?? null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const statusByName = new Map(summaries.map((item) => [item.name.toLowerCase(), item.paymentStatus]));
  const sortedDetails = details.slice().sort((a, b) =>
    String(a["date"] ?? "").localeCompare(String(b["date"] ?? "")),
  );
  return {
    from, to, sourceScope, expectedDays, summaries,
    details: sortedDetails.map((item) => ({
      ...item,
      paymentStatus: statusByName.get(String(item["name"] ?? "").toLowerCase()) ?? "unpaid",
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
  if (role === "security") return 3;
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
  const latestDate = rows.map((row) => row.recordDate).filter(Boolean).sort().at(-1) ?? null;
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
  const query = ListRegisterRecordsQueryParams.parse(req.query);
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
  if (query.from) rows = rows.filter((row) => !row.recordDate || row.recordDate >= calendarDate(query.from)!);
  if (query.to) rows = rows.filter((row) => !row.recordDate || row.recordDate <= calendarDate(query.to)!);
  return res.json({
    records: rows.slice(0, query.limit ?? 100).map((row) => toResponse(row, responseDataForRole(req, definition, row.data))),
    total: rows.length,
  });
});

router.get("/registers/:slug/records/export", async (req: Request, res: Response) => {
  await seedIfEmpty();
  const { slug } = ListRegisterRecordsParams.parse(req.params);
  const query = ListRegisterRecordsQueryParams.parse(req.query);
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
  if (query.from) rows = rows.filter((row) => !row.recordDate || row.recordDate >= calendarDate(query.from)!);
  if (query.to) rows = rows.filter((row) => !row.recordDate || row.recordDate <= calendarDate(query.to)!);
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
    (source === "all" || bill.sourceScope === source) &&
    (!name || bill.personName.toLowerCase().includes(name)),
  ));
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
  const status = body.status === "paid" ? "paid" : body.status === "unpaid" ? "unpaid" : "";
  if (!personName || !/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate) || fromDate > toDate || !status || !paymentSourceSlugs.includes(sourceScope as typeof paymentSourceSlugs[number])) {
    return res.status(400).json({ error: "Invalid bill details" });
  }
  const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const billKey = billKeyFor(personName, fromDate, toDate, sourceScope);
  const existing = await db.select().from(paymentBillsTable).where(eq(paymentBillsTable.billKey, billKey)).limit(1);
  const current = existing[0];
  const paidAt = status === "paid" ? (current?.paidAt ?? new Date()) : null;
  const payload = {
    personName, fromDate, toDate, sourceScope,
    totalDays: number(body.totalDays), wagePerDay: number(body.wagePerDay), wageAmount: number(body.wageAmount),
    overtimeMinutes: Math.round(number(body.overtimeMinutes)), overtimeRate: number(body.overtimeRate),
    overtimeAmount: number(body.overtimeAmount), roundingAmount: number(body.roundingAmount), totalAmount: number(body.totalAmount),
    status, paidAt, paidBy: status === "paid" ? (req.user?.displayName ?? req.user?.email ?? null) : null,
    updatedAt: new Date(),
  };
  const bill = current
    ? (await db.update(paymentBillsTable).set(payload).where(eq(paymentBillsTable.billKey, billKey)).returning())[0]
    : (await db.insert(paymentBillsTable).values({
      id: randomUUID(), billNumber: `PAY-${Date.now()}-${randomUUID().slice(0, 4).toUpperCase()}`, billKey, ...payload,
    }).returning())[0];
  return res.status(current ? 200 : 201).json(bill);
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
  const recordDate = calendarDate(body.recordDate) ?? (body.data.date as string | undefined) ?? null;
  const data = applyDerivedValues(
    definition,
    inputDataForRole(req, definition, { ...body.data, ...(recordDate ? { date: recordDate } : {}) }),
  );
  const missing = validateRequiredFields(definition, recordDate, data);
  if (missing.length) return res.status(400).json({ error: `Missing required fields: ${missing.map((field) => field.label).join(", ")}` });
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
  const recordDate = body.recordDate === undefined ? existing[0].recordDate : calendarDate(body.recordDate);
  const data = body.data
    ? applyDerivedValues(
        definition,
        inputDataForRole(req, definition, { ...body.data, ...(recordDate ? { date: recordDate } : {}) }),
      )
    : existing[0].data;
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
  if (!canEditRecord(existing[0].createdAt, req.user?.role)) {
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