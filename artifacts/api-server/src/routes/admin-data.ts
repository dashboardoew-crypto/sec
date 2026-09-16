import ExcelJS from "exceljs";
import nodemailer from "nodemailer";
import { randomUUID } from "node:crypto";
import { Router, raw, type IRouter, type Request, type Response } from "express";
import { db, backupSettingsTable, registerRecordsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getRegister, REGISTER_DEFINITIONS, type FieldDefinition, type RegisterDefinition } from "../data/registers";
import { applyDerivedValues, validateRequiredFields } from "./operations";
import { requireRole } from "../middlewares/authMiddleware";

const router: IRouter = Router();
const SETTINGS_ID = "default";
const INDIA_TIME_ZONE = "Asia/Kolkata";
const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

const normalizeHeader = (value: string) =>
  value.trim().replace(/^\ufeff/, "").replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

const escapeCsvValue = (value: unknown) => {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
};

const normalizeDateValue = (value: unknown) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
    return date.toISOString().slice(0, 10);
  }
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  const dayFirst = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return dayFirst ? `${dayFirst[3]}-${dayFirst[2]}-${dayFirst[1]}` : trimmed;
};

const displayDate = (value: unknown) => {
  const normalized = normalizeDateValue(value);
  if (typeof normalized !== "string") return normalized;
  const iso = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return iso ? `${iso[3]}-${iso[2]}-${iso[1]}` : normalized;
};

const parseCsv = (source: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    if (row.some((value) => value.trim())) rows.push(row);
  }
  return rows;
};

const indiaDateKey = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: INDIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
};

const indiaTimeParts = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: INDIA_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  return {
    hour: Number(parts.find((part) => part.type === "hour")?.value ?? 0),
    minute: Number(parts.find((part) => part.type === "minute")?.value ?? 0),
  };
};

const getSettings = async () => {
  const rows = await db.select().from(backupSettingsTable).where(eq(backupSettingsTable.id, SETTINGS_ID)).limit(1);
  return rows[0] ?? null;
};

const publicSettings = (settings: typeof backupSettingsTable.$inferSelect | null) => ({
  recipientEmail: settings?.recipientEmail ?? "",
  enabled: settings?.enabled ?? false,
  lastSentAt: settings?.lastSentAt?.toISOString() ?? null,
});

const workbookForAllRegisters = async () => {
  const rows = await db.select().from(registerRecordsTable).orderBy(registerRecordsTable.registerSlug);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Security Operations Management";
  workbook.created = new Date();

  for (const definition of REGISTER_DEFINITIONS) {
    const worksheet = workbook.addWorksheet(definition.title.slice(0, 31));
    const columns = definition.fields.map((field) => ({ header: field.label, key: field.key, width: Math.min(Math.max(field.label.length + 4, 14), 28) }));
    worksheet.columns = columns;
    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF123B59" } };
    worksheet.views = [{ state: "frozen", ySplit: 1 }];

    rows
      .filter((row) => row.registerSlug === definition.slug)
      .forEach((row) => worksheet.addRow(Object.fromEntries(definition.fields.map((field) => [
        field.key,
        field.type === "date" ? displayDate(row.data[field.key]) : row.data[field.key] ?? "",
      ]))));
    worksheet.autoFilter = { from: "A1", to: `${String.fromCharCode(65 + Math.min(columns.length - 1, 25))}1` };
  }

  return workbook.xlsx.writeBuffer();
};

const sendBackupEmail = async (recipientEmail: string) => {
  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailAppPassword) {
    throw new Error("Gmail is not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD in Replit Secrets.");
  }

  const workbook = await workbookForAllRegisters();
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailAppPassword },
  });
  const workbookBase64 = Buffer.from(workbook as any).toString("base64");
  await transporter.sendMail({
    from: gmailUser,
    to: recipientEmail,
    subject: `Security Operations data backup — ${indiaDateKey(new Date())}`,
    text: "Attached is the daily backup of all register data. Each register has its own spreadsheet tab.",
    attachments: [{
      filename: `security-operations-backup-${indiaDateKey(new Date())}.xlsx`,
      content: workbookBase64,
      encoding: "base64",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }],
  });
};

const saveSentDate = async (sentAt: Date) => {
  const current = await getSettings();
  await db.insert(backupSettingsTable).values({
    id: SETTINGS_ID,
    recipientEmail: current?.recipientEmail ?? null,
    enabled: current?.enabled ?? false,
    lastSentDate: indiaDateKey(sentAt),
    lastSentAt: sentAt,
    updatedAt: sentAt,
  }).onConflictDoUpdate({
    target: backupSettingsTable.id,
    set: { lastSentDate: indiaDateKey(sentAt), lastSentAt: sentAt, updatedAt: sentAt },
  });
};

export const runDailyBackupIfDue = async () => {
  const settings = await getSettings();
  if (!settings?.enabled || !settings.recipientEmail) return;
  const now = new Date();
  const { hour, minute } = indiaTimeParts(now);
  if (hour < 18 || (hour === 18 && minute < 0) || settings.lastSentDate === indiaDateKey(now)) return;
  await sendBackupEmail(settings.recipientEmail);
  await saveSentDate(now);
};

export const startDailyBackupScheduler = () => {
  const check = () => void runDailyBackupIfDue().catch((error) => console.error("Daily backup failed:", error));
  const timer = setInterval(check, 60_000);
  timer.unref();
  check();
};

const resolveRegister = (value: string | undefined) => {
  const normalized = normalizeHeader(value ?? "");
  return getRegister(value ?? "") ??
    REGISTER_DEFINITIONS.find((definition) =>
      normalizeHeader(definition.slug) === normalized || normalizeHeader(definition.title) === normalized,
    );
};

const parseImportedDataRows = (definition: RegisterDefinition, headers: string[], values: unknown[], rowIndex: number) => {
  const raw: Record<string, string> = {};
  headers.forEach((header, index) => {
    const value = values[index] instanceof Date ? values[index].toISOString() : String(values[index] ?? "").trim();
    if (!(header in raw) || value) raw[header] = value;
  });
  const fieldByHeader = new Map<string, FieldDefinition>(
    definition.fields.flatMap((field) => [[normalizeHeader(field.key), field], [normalizeHeader(field.label), field]]),
  );
  const data: Record<string, unknown> = {};
  for (const [header, value] of Object.entries(raw)) {
    if (!value) continue;
    const field = fieldByHeader.get(header);
    if (field?.type === "date") {
      data[field.key] = normalizeDateValue(value);
    } else if (field?.type === "number") {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) throw new Error(`Row ${rowIndex}: "${value}" is not a valid number for ${field.label}.`);
      data[field.key] = numericValue;
    } else if (field?.type === "checkbox") {
      data[field.key] = value.toLowerCase() === "true" || value === "1";
    } else if (field) {
      data[field.key] = value;
    }
  }
  const recordDate = typeof data.date === "string" ? data.date : null;
  const processed = applyDerivedValues(definition, data);
  const missing = validateRequiredFields(definition, recordDate, processed);
  if (missing.length) throw new Error(`Row ${rowIndex} (${definition.title}): missing ${missing.map((field) => field.label).join(", ")}.`);
  return { registerSlug: definition.slug, recordDate, data: processed };
};

const parseImportedCsvRows = (source: string) => {
  const rows = parseCsv(source);
  if (rows.length < 2) throw new Error("The CSV must include a header row and at least one data row.");
  const headers = rows[0].map(normalizeHeader);
  const registerIndex = headers.findIndex((header) => ["register", "register_slug", "register_name", "register_title"].includes(header));
  if (registerIndex < 0) throw new Error("Add a Register or registerSlug column so each row can be assigned to a register.");

  return rows.slice(1).map((values, rowIndex) => {
    const raw: Record<string, string> = {};
    headers.forEach((header, index) => { raw[header] = (values[index] ?? "").trim(); });
    const definition = resolveRegister(raw.register ?? raw.register_slug ?? raw.register_name ?? raw.register_title);
    if (!definition) throw new Error(`Row ${rowIndex + 2}: unknown register "${raw.register ?? raw.register_slug ?? ""}".`);
    return parseImportedDataRows(definition, headers.filter((header) => !["register", "register_slug", "register_name", "register_title", "record_date"].includes(header)), values.filter((_value, index) => !["register", "register_slug", "register_name", "register_title", "record_date"].includes(headers[index])), rowIndex + 2);
  });
};

const resolveWorksheetRegister = (name: string) => {
  const normalized = normalizeHeader(name);
  return REGISTER_DEFINITIONS.find((definition) =>
    normalizeHeader(definition.slug) === normalized ||
    normalizeHeader(definition.title) === normalized ||
    normalizeHeader(definition.title).startsWith(normalized),
  );
};

const parseImportedWorkbook = async (source: Buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(source as any);
  const imported: Array<{ registerSlug: string; recordDate: string | null; data: Record<string, unknown> }> = [];
  workbook.worksheets.forEach((worksheet) => {
    const definition = resolveWorksheetRegister(worksheet.name);
    if (!definition) throw new Error(`Unknown register worksheet "${worksheet.name}". Use the register title from the backup workbook.`);
    const headerValues = (worksheet.getRow(1).values as unknown[]).slice(1);
    const headers = headerValues.map((value) => normalizeHeader(String(value ?? "")));
    if (!headers.some(Boolean)) return;
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const values = (worksheet.getRow(rowNumber).values as unknown[]).slice(1);
      if (!values.some((value) => String(value ?? "").trim())) continue;
      imported.push(parseImportedDataRows(definition, headers, values, rowNumber));
    }
  });
  if (!imported.length) throw new Error("The workbook does not contain any register rows.");
  return imported;
};

router.use(requireRole("admin"));

router.get("/admin/data/backup", async (_req: Request, res: Response) => {
  return res.json(publicSettings(await getSettings()));
});

router.put("/admin/data/backup", async (req: Request, res: Response) => {
  const recipientEmail = typeof req.body?.recipientEmail === "string" ? req.body.recipientEmail.trim().toLowerCase() : "";
  const enabled = req.body?.enabled === true;
  if (enabled && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return res.status(400).json({ error: "Enter a valid backup email address before enabling daily backups." });
  }
  const now = new Date();
  const [settings] = await db.insert(backupSettingsTable).values({
    id: SETTINGS_ID,
    recipientEmail: recipientEmail || null,
    enabled,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: backupSettingsTable.id,
    set: { recipientEmail: recipientEmail || null, enabled, updatedAt: now },
  }).returning();
  return res.json(publicSettings(settings));
});

router.post("/admin/data/backup/send-now", async (_req: Request, res: Response) => {
  const settings = await getSettings();
  if (!settings?.recipientEmail) return res.status(400).json({ error: "Save a backup email address first." });
  try {
    const sentAt = new Date();
    await sendBackupEmail(settings.recipientEmail);
    await saveSentDate(sentAt);
    return res.json(publicSettings(await getSettings()));
  } catch (error) {
    return res.status(503).json({ error: error instanceof Error ? error.message : "The backup email could not be sent." });
  }
});

router.get("/admin/data/import-template", (_req: Request, res: Response) => {
  const importFields = Array.from(new Map(REGISTER_DEFINITIONS.flatMap((definition) => definition.fields).map((field) => [field.key, field])).values());
  const headers = ["Register", "recordDate", ...importFields.map((field) => field.key)];
  const example = {
    name_of_visitor: "Example visitor",
    location_of_visitor: "Office",
    mobile_no: "0000000000",
    purpose: "Meeting",
    whom_to_meet: "Admin",
    in_time: "09:00",
  } as Record<string, string>;
  const sample = ["visitor-record", "2026-09-15", ...importFields.map((field) => example[field.key] ?? "")];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="register-import-template.csv"');
  return res.send([headers, sample].map((row) => row.map(escapeCsvValue).join(",")).join("\n"));
});

router.post("/admin/data/import", raw({
  type: ["text/csv", "application/csv", "application/vnd.ms-excel", "application/octet-stream"],
  limit: MAX_IMPORT_BYTES,
}), async (req: Request, res: Response) => {
  if (!Buffer.isBuffer(req.body)) return res.status(400).json({ error: "Upload an Excel workbook." });
  try {
    const imported = req.body.subarray(0, 2).toString("utf8") === "PK"
      ? await parseImportedWorkbook(req.body)
      : parseImportedCsvRows(req.body.toString("utf8"));
    await db.transaction(async (tx) => {
      await tx.insert(registerRecordsTable).values(imported.map((row) => ({ id: randomUUID(), ...row })));
    });
    return res.status(201).json({ imported: imported.length, registers: Array.from(new Set(imported.map((row) => row.registerSlug))).length });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "The CSV could not be imported." });
  }
});

router.get("/admin/data/export", async (_req: Request, res: Response) => {
  const workbook = await workbookForAllRegisters();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="security-operations-backup-${indiaDateKey(new Date())}.xlsx"`);
  return res.send(Buffer.from(workbook as any));
});

export default router;