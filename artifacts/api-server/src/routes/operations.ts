import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, registerRecordsTable } from "@workspace/db";
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
import { requireAuth } from "../middlewares/authMiddleware";

const router: IRouter = Router();
router.use(requireAuth);
let seedPromise: Promise<void> | undefined;
const EDIT_WINDOW_DAYS = 3;

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

const minutesFromTime = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return undefined;
  return hours * 60 + minutes;
};

const timeFromMinutes = (value: number) => {
  const total = ((Math.round(value) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

const applyDerivedValues = (register: RegisterDefinition, input: Record<string, unknown>) => {
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

  const initialReading = Number(data.initial_reading);
  const finalReading = Number(data.final_reading);
  if (Number.isFinite(initialReading) && Number.isFinite(finalReading)) {
    setIfKnown("total_km_car_run", finalReading - initialReading);
    setIfKnown("total_km_run", finalReading - initialReading);
  }

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

  const unit12 = minutesBetween(data.out_time_from_unit_1, data.in_time_in_unit_2);
  const unit21 = minutesBetween(data.out_time_from_unit_2, data.in_time_in_unit_1);
  if (unit12 !== undefined) setIfKnown("time_taken_to_travel_from_unit1_to_2", `${Math.floor(unit12 / 60)}h ${unit12 % 60}m`);
  if (unit21 !== undefined) setIfKnown("time_taken_to_travel_from_unit_2_to_1", `${Math.floor(unit21 / 60)}h ${unit21 % 60}m`);
  return data;
};

const validateRequiredFields = (register: RegisterDefinition, recordDate: string | null, data: Record<string, unknown>) => {
  const missing = register.fields
    .filter((field) => field.required)
    .filter((field) => data[field.key] === undefined || data[field.key] === null || data[field.key] === "");
  if (!recordDate) missing.unshift({ key: "recordDate", label: "Date", type: "date" });
  return missing;
};

const toResponse = (row: typeof registerRecordsTable.$inferSelect) => ({
  id: row.id,
  registerSlug: row.registerSlug,
  recordDate: row.recordDate,
  data: row.data,
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

const canEditRecord = (createdAt: Date) => {
  const createdDate = new Date(`${dateInIndia(createdAt)}T00:00:00Z`);
  const today = new Date(`${dateInIndia(new Date())}T00:00:00Z`);
  const daysSinceCreation = Math.floor((today.getTime() - createdDate.getTime()) / 86_400_000);
  return daysSinceCreation >= 0 && daysSinceCreation <= EDIT_WINDOW_DAYS;
};

router.get("/dashboard", async (_req: Request, res: Response) => {
  await seedIfEmpty();
  const rows = await db.select().from(registerRecordsTable);
  const modules = ["security", "main-gate"].map((module) => ({
    module,
    label: module === "security" ? "Security Operations" : "Main Gate Security",
    totalRecords: rows.filter((row) => getRegister(row.registerSlug)?.module === module).length,
    registerCount: REGISTER_DEFINITIONS.filter((item) => item.module === module).length,
  }));
  const latest = rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 5);
  const latestDate = rows.map((row) => row.recordDate).filter(Boolean).sort().at(-1) ?? null;
  return res.json({
    totalRecords: rows.length,
    totalRegisters: REGISTER_DEFINITIONS.length,
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
  const rows = await db.select().from(registerRecordsTable).orderBy(desc(registerRecordsTable.updatedAt)).limit(query.limit ?? 100);
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

router.get("/registers", async (_req: Request, res: Response) => {
  await seedIfEmpty();
  const counts = await db.select({ registerSlug: registerRecordsTable.registerSlug }).from(registerRecordsTable);
  return res.json(REGISTER_DEFINITIONS.map((definition) => ({
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
  let rows = await db.select().from(registerRecordsTable).where(eq(registerRecordsTable.registerSlug, slug)).orderBy(desc(registerRecordsTable.updatedAt));
  const search = query.search?.trim().toLowerCase();
  if (search) rows = rows.filter((row) => JSON.stringify(row.data).toLowerCase().includes(search));
  if (query.from) rows = rows.filter((row) => !row.recordDate || row.recordDate >= calendarDate(query.from)!);
  if (query.to) rows = rows.filter((row) => !row.recordDate || row.recordDate <= calendarDate(query.to)!);
  return res.json({ records: rows.slice(0, query.limit ?? 100).map(toResponse), total: rows.length });
});

router.post("/registers/:slug/records", async (req: Request, res: Response) => {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Only admins can add records" });
  await seedIfEmpty();
  const { slug } = CreateRegisterRecordParams.parse(req.params);
  const body = CreateRegisterRecordBody.parse(req.body);
  const definition = getRegister(slug);
  if (!definition) return res.status(404).json({ error: "Register not found" });
  const recordDate = calendarDate(body.recordDate) ?? (body.data.date as string | undefined) ?? null;
  const data = applyDerivedValues(definition, { ...body.data, ...(recordDate ? { date: recordDate } : {}) });
  const missing = validateRequiredFields(definition, recordDate, data);
  if (missing.length) return res.status(400).json({ error: `Missing required fields: ${missing.map((field) => field.label).join(", ")}` });
  const row = await db.insert(registerRecordsTable).values({
    id: randomUUID(),
    registerSlug: slug,
    recordDate,
    data,
  }).returning();
  return res.status(201).json(toResponse(row[0]));
});

router.patch("/registers/:slug/records/:id", async (req: Request, res: Response) => {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Only admins can edit records" });
  await seedIfEmpty();
  const { slug, id } = UpdateRegisterRecordParams.parse(req.params);
  const body = UpdateRegisterRecordBody.parse(req.body);
  const definition = getRegister(slug);
  if (!definition) return res.status(404).json({ error: "Register not found" });
  const existing = await db.select().from(registerRecordsTable).where(and(eq(registerRecordsTable.id, id), eq(registerRecordsTable.registerSlug, slug))).limit(1);
  if (!existing[0]) return res.status(404).json({ error: "Record not found" });
  if (!canEditRecord(existing[0].createdAt)) {
    return res.status(403).json({ error: "This record can no longer be edited. Records are editable for three days after entry." });
  }
  const recordDate = body.recordDate === undefined ? existing[0].recordDate : calendarDate(body.recordDate);
  const data = body.data ? applyDerivedValues(definition, { ...body.data, ...(recordDate ? { date: recordDate } : {}) }) : existing[0].data;
  const missing = validateRequiredFields(definition, recordDate, data);
  if (missing.length) return res.status(400).json({ error: `Missing required fields: ${missing.map((field) => field.label).join(", ")}` });
  const row = await db.update(registerRecordsTable).set({
    recordDate,
    data,
    updatedAt: new Date(),
  }).where(eq(registerRecordsTable.id, id)).returning();
  return res.json(toResponse(row[0]));
});

router.delete("/registers/:slug/records/:id", async (req: Request, res: Response) => {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Only admins can delete records" });
  DeleteRegisterRecordParams.parse(req.params);
  return res.status(403).json({ error: "Deleting register records is disabled." });
});

export default router;