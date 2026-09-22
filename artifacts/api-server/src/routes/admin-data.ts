import ExcelJS from "exceljs";
import nodemailer from "nodemailer";
import { randomUUID } from "node:crypto";
import { Router, raw, type IRouter, type Request, type Response } from "express";
import {
  db,
  backupSettingsTable,
  paymentAttendanceExclusionsTable,
  paymentBillsTable,
  paymentTransactionsTable,
  registerRecordsTable,
} from "@workspace/db";
import { desc, eq } from "drizzle-orm";
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
  if (dayFirst) return `${dayFirst[3]}-${dayFirst[2]}-${dayFirst[1]}`;
  const isoDate = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  return isoDate?.[1] ?? trimmed;
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

const styleWorkbookSheet = (worksheet: ExcelJS.Worksheet) => {
  worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF123B59" } };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
};

const workbookForAllRegisters = async () => {
  const [rows, transactions, bills] = await Promise.all([
    db.select().from(registerRecordsTable).orderBy(registerRecordsTable.registerSlug),
    db.select().from(paymentTransactionsTable).orderBy(desc(paymentTransactionsTable.paidAt)),
    db.select().from(paymentBillsTable).orderBy(desc(paymentBillsTable.updatedAt)),
  ]);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Security Operations Management";
  workbook.created = new Date();

  for (const definition of REGISTER_DEFINITIONS) {
    const worksheet = workbook.addWorksheet(definition.title.slice(0, 31));
    const columns = [
      { header: "recordId", key: "recordId", width: 38 },
      { header: "Register", key: "Register", width: 24 },
      { header: "registerSlug", key: "registerSlug", width: 24 },
      { header: "recordDate", key: "recordDate", width: 14 },
      ...definition.fields.map((field) => ({ header: field.label, key: field.key, width: Math.min(Math.max(field.label.length + 4, 14), 28) })),
    ];
    worksheet.columns = columns;
    styleWorkbookSheet(worksheet);

    rows
      .filter((row) => row.registerSlug === definition.slug)
      .forEach((row) => worksheet.addRow({
        recordId: row.id,
        Register: definition.title,
        registerSlug: definition.slug,
        recordDate: displayDate(row.recordDate ?? row.data.date ?? indiaDateKey(new Date())),
        ...Object.fromEntries(definition.fields.map((field) => [
          field.key,
          field.type === "date" ? displayDate(row.data[field.key] ?? row.recordDate) : row.data[field.key] ?? "",
        ])),
      }));
    worksheet.autoFilter = { from: "A1", to: `${String.fromCharCode(65 + Math.min(columns.length - 1, 25))}1` };
  }

  const paymentHistory = workbook.addWorksheet("Payment History");
  paymentHistory.columns = [
    { header: "id", key: "id", width: 38 },
    { header: "billNumber", key: "billNumber", width: 28 },
    { header: "billKey", key: "billKey", width: 54 },
    { header: "personName", key: "personName", width: 24 },
    { header: "fromDate", key: "fromDate", width: 14 },
    { header: "toDate", key: "toDate", width: 14 },
    { header: "sourceScope", key: "sourceScope", width: 22 },
    { header: "amount", key: "amount", width: 14 },
    { header: "paymentMethod", key: "paymentMethod", width: 18 },
    { header: "paymentReference", key: "paymentReference", width: 24 },
    { header: "paymentNote", key: "paymentNote", width: 28 },
    { header: "attendanceReferences", key: "attendanceReferences", width: 48 },
    { header: "paidAt", key: "paidAt", width: 24 },
    { header: "paidBy", key: "paidBy", width: 24 },
    { header: "createdAt", key: "createdAt", width: 24 },
  ];
  styleWorkbookSheet(paymentHistory);
  transactions.forEach((transaction) => paymentHistory.addRow({
    ...transaction,
    paidAt: transaction.paidAt.toISOString(),
    createdAt: transaction.createdAt.toISOString(),
  }));
  paymentHistory.autoFilter = { from: "A1", to: "O1" };

  const paymentBills = workbook.addWorksheet("Payment Bills");
  paymentBills.columns = [
    { header: "id", key: "id", width: 38 },
    { header: "billNumber", key: "billNumber", width: 28 },
    { header: "billKey", key: "billKey", width: 54 },
    { header: "personName", key: "personName", width: 24 },
    { header: "fromDate", key: "fromDate", width: 14 },
    { header: "toDate", key: "toDate", width: 14 },
    { header: "sourceScope", key: "sourceScope", width: 22 },
    { header: "totalDays", key: "totalDays", width: 14 },
    { header: "wagePerDay", key: "wagePerDay", width: 14 },
    { header: "wageAmount", key: "wageAmount", width: 14 },
    { header: "overtimeMinutes", key: "overtimeMinutes", width: 18 },
    { header: "overtimeRate", key: "overtimeRate", width: 16 },
    { header: "overtimeAmount", key: "overtimeAmount", width: 18 },
    { header: "roundingAmount", key: "roundingAmount", width: 18 },
    { header: "totalAmount", key: "totalAmount", width: 16 },
    { header: "paidAmount", key: "paidAmount", width: 16 },
    { header: "status", key: "status", width: 14 },
    { header: "paymentMethod", key: "paymentMethod", width: 18 },
    { header: "paymentReference", key: "paymentReference", width: 24 },
    { header: "paymentNote", key: "paymentNote", width: 28 },
    { header: "paidAt", key: "paidAt", width: 24 },
    { header: "paidBy", key: "paidBy", width: 24 },
    { header: "createdAt", key: "createdAt", width: 24 },
    { header: "updatedAt", key: "updatedAt", width: 24 },
  ];
  styleWorkbookSheet(paymentBills);
  bills.forEach((bill) => paymentBills.addRow({
    ...bill,
    paidAt: bill.paidAt?.toISOString() ?? "",
    createdAt: bill.createdAt.toISOString(),
    updatedAt: bill.updatedAt.toISOString(),
  }));
  paymentBills.autoFilter = { from: "A1", to: "X1" };

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

const parseImportedDataRows = (
  definition: RegisterDefinition,
  headers: string[],
  values: unknown[],
  rowIndex: number,
  recordDateOverride?: unknown,
  recordIdOverride?: unknown,
) => {
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
  const importedDate = normalizeDateValue(recordDateOverride);
  if ((data.date === undefined || data.date === "") && importedDate) data.date = importedDate;
  if (data.date === undefined || data.date === "") data.date = indiaDateKey(new Date());
  const recordDate = typeof data.date === "string" ? normalizeDateValue(data.date) as string : indiaDateKey(new Date());
  data.date = recordDate;
  const processed = applyDerivedValues(definition, data);
  const missing = validateRequiredFields(definition, recordDate, processed);
  if (missing.length) throw new Error(`Row ${rowIndex} (${definition.title}): missing ${missing.map((field) => field.label).join(", ")}.`);
  const recordId = typeof recordIdOverride === "string" ? recordIdOverride.trim() : "";
  return {
    id: recordId || randomUUID(),
    recordIdProvided: Boolean(recordId),
    registerSlug: definition.slug,
    recordDate,
    data: processed,
  };
};

const parseImportedCsvRows = (source: string) => {
  const rows = parseCsv(source);
  if (rows.length < 2) throw new Error("The CSV must include a header row and at least one data row.");
  const headers = rows[0].map(normalizeHeader);
  const registerHeaders = ["register", "register_slug", "registerslug", "register_name", "registername", "register_title", "registertitle"];
  const metadataHeaders = [...registerHeaders, "record_id", "recordid", "record_date", "recorddate"];
  const registerIndex = headers.findIndex((header) => registerHeaders.includes(header));
  if (registerIndex < 0) throw new Error("Add a Register or registerSlug column so each row can be assigned to a register.");

  return rows.slice(1).map((values, rowIndex) => {
    const raw: Record<string, string> = {};
    headers.forEach((header, index) => { raw[header] = (values[index] ?? "").trim(); });
    const registerValue = registerHeaders.map((header) => raw[header]).find(Boolean);
    const definition = resolveRegister(registerValue);
    if (!definition) throw new Error(`Row ${rowIndex + 2}: unknown register "${registerValue ?? ""}".`);
    const dataHeaders = headers.filter((header) => !metadataHeaders.includes(header));
    const dataValues = values.filter((_value, index) => !metadataHeaders.includes(headers[index]));
    const recordDate = raw.record_date ?? raw.recorddate;
    return parseImportedDataRows(
      definition,
      dataHeaders,
      dataValues,
      rowIndex + 2,
      recordDate,
      raw.record_id ?? raw.recordid,
    );
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

const worksheetRows = (worksheet: ExcelJS.Worksheet) => {
  const headers = (worksheet.getRow(1).values as unknown[]).slice(1).map((value) => normalizeHeader(String(value ?? "")));
  const rows: Array<{ rowNumber: number; values: unknown[] }> = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const values = (worksheet.getRow(rowNumber).values as unknown[]).slice(1);
    if (values.some((value) => String(value ?? "").trim())) rows.push({ rowNumber, values });
  }
  return { headers, rows };
};

const worksheetCell = (headers: string[], values: unknown[], name: string) =>
  values[headers.indexOf(name)];

const requiredPaymentText = (value: unknown, label: string, rowNumber: number) => {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "").trim();
  if (!text) throw new Error(`Payment row ${rowNumber}: "${label}" is required.`);
  return text;
};

const optionalPaymentText = (value: unknown) => {
  if (value === undefined || value === null || value === "") return null;
  return value instanceof Date ? value.toISOString() : String(value).trim() || null;
};

const paymentDate = (value: unknown, label: string, rowNumber: number) => {
  const normalized = normalizeDateValue(value);
  if (typeof normalized !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`Payment row ${rowNumber}: "${label}" must be a date in YYYY-MM-DD format.`);
  }
  return normalized;
};

const paymentTimestamp = (value: unknown, label: string, rowNumber: number, optional = false) => {
  const text = optional ? optionalPaymentText(value) : requiredPaymentText(value, label, rowNumber);
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Payment row ${rowNumber}: "${label}" is not a valid date/time.`);
  return parsed;
};

const paymentNumber = (value: unknown, label: string, rowNumber: number) => {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) throw new Error(`Payment row ${rowNumber}: "${label}" must be a number.`);
  return number;
};

const parseImportedPaymentTransactions = (worksheet: ExcelJS.Worksheet) => {
  const { headers, rows } = worksheetRows(worksheet);
  return rows.map(({ rowNumber, values }) => ({
    id: requiredPaymentText(worksheetCell(headers, values, "id"), "id", rowNumber),
    billKey: requiredPaymentText(worksheetCell(headers, values, "bill_key"), "billKey", rowNumber),
    billNumber: requiredPaymentText(worksheetCell(headers, values, "bill_number"), "billNumber", rowNumber),
    personName: requiredPaymentText(worksheetCell(headers, values, "person_name"), "personName", rowNumber),
    fromDate: paymentDate(worksheetCell(headers, values, "from_date"), "fromDate", rowNumber),
    toDate: paymentDate(worksheetCell(headers, values, "to_date"), "toDate", rowNumber),
    sourceScope: optionalPaymentText(worksheetCell(headers, values, "source_scope")) ?? "all",
    amount: paymentNumber(worksheetCell(headers, values, "amount"), "amount", rowNumber),
    paymentMethod: optionalPaymentText(worksheetCell(headers, values, "payment_method")) ?? "Cash",
    paymentReference: optionalPaymentText(worksheetCell(headers, values, "payment_reference")),
    paymentNote: optionalPaymentText(worksheetCell(headers, values, "payment_note")),
    attendanceReferences: optionalPaymentText(worksheetCell(headers, values, "attendance_references")),
    paidAt: paymentTimestamp(worksheetCell(headers, values, "paid_at"), "paidAt", rowNumber) ?? new Date(),
    paidBy: optionalPaymentText(worksheetCell(headers, values, "paid_by")),
    createdAt: paymentTimestamp(worksheetCell(headers, values, "created_at"), "createdAt", rowNumber, true) ?? new Date(),
  }));
};

const parseImportedPaymentBills = (worksheet: ExcelJS.Worksheet) => {
  const { headers, rows } = worksheetRows(worksheet);
  return rows.map(({ rowNumber, values }) => ({
    id: requiredPaymentText(worksheetCell(headers, values, "id"), "id", rowNumber),
    billNumber: requiredPaymentText(worksheetCell(headers, values, "bill_number"), "billNumber", rowNumber),
    billKey: requiredPaymentText(worksheetCell(headers, values, "bill_key"), "billKey", rowNumber),
    personName: requiredPaymentText(worksheetCell(headers, values, "person_name"), "personName", rowNumber),
    fromDate: paymentDate(worksheetCell(headers, values, "from_date"), "fromDate", rowNumber),
    toDate: paymentDate(worksheetCell(headers, values, "to_date"), "toDate", rowNumber),
    sourceScope: optionalPaymentText(worksheetCell(headers, values, "source_scope")) ?? "all",
    totalDays: paymentNumber(worksheetCell(headers, values, "total_days"), "totalDays", rowNumber),
    wagePerDay: paymentNumber(worksheetCell(headers, values, "wage_per_day"), "wagePerDay", rowNumber),
    wageAmount: paymentNumber(worksheetCell(headers, values, "wage_amount"), "wageAmount", rowNumber),
    overtimeMinutes: Math.round(paymentNumber(worksheetCell(headers, values, "overtime_minutes"), "overtimeMinutes", rowNumber)),
    overtimeRate: paymentNumber(worksheetCell(headers, values, "overtime_rate"), "overtimeRate", rowNumber),
    overtimeAmount: paymentNumber(worksheetCell(headers, values, "overtime_amount"), "overtimeAmount", rowNumber),
    roundingAmount: paymentNumber(worksheetCell(headers, values, "rounding_amount"), "roundingAmount", rowNumber),
    totalAmount: paymentNumber(worksheetCell(headers, values, "total_amount"), "totalAmount", rowNumber),
    paidAmount: paymentNumber(worksheetCell(headers, values, "paid_amount"), "paidAmount", rowNumber),
    status: optionalPaymentText(worksheetCell(headers, values, "status")) ?? "unpaid",
    paymentMethod: optionalPaymentText(worksheetCell(headers, values, "payment_method")),
    paymentReference: optionalPaymentText(worksheetCell(headers, values, "payment_reference")),
    paymentNote: optionalPaymentText(worksheetCell(headers, values, "payment_note")),
    paidAt: paymentTimestamp(worksheetCell(headers, values, "paid_at"), "paidAt", rowNumber, true),
    paidBy: optionalPaymentText(worksheetCell(headers, values, "paid_by")),
    createdAt: paymentTimestamp(worksheetCell(headers, values, "created_at"), "createdAt", rowNumber, true) ?? new Date(),
    updatedAt: paymentTimestamp(worksheetCell(headers, values, "updated_at"), "updatedAt", rowNumber, true) ?? new Date(),
  }));
};

const parseImportedWorkbook = async (source: Buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(source as any);
  const imported: Array<{
    id: string;
    recordIdProvided: boolean;
    registerSlug: string;
    recordDate: string | null;
    data: Record<string, unknown>;
  }> = [];
  const importedTransactions: ReturnType<typeof parseImportedPaymentTransactions> = [];
  const importedBills: ReturnType<typeof parseImportedPaymentBills> = [];
  workbook.worksheets.forEach((worksheet) => {
    const normalizedSheetName = normalizeHeader(worksheet.name);
    if (normalizedSheetName === "payment_history") {
      importedTransactions.push(...parseImportedPaymentTransactions(worksheet));
      return;
    }
    if (normalizedSheetName === "payment_bills") {
      importedBills.push(...parseImportedPaymentBills(worksheet));
      return;
    }
    const headerValues = (worksheet.getRow(1).values as unknown[]).slice(1);
    const headers = headerValues.map((value) => normalizeHeader(String(value ?? "")));
    if (!headers.some(Boolean)) return;
    const registerHeaders = ["register", "register_slug", "registerslug", "register_name", "registername", "register_title", "registertitle"];
    const metadataHeaders = [...registerHeaders, "record_id", "recordid", "record_date", "recorddate"];
    const definition = resolveWorksheetRegister(worksheet.name);
    const registerIndex = headers.findIndex((header) => registerHeaders.includes(header));
    const dataRows = Array.from({ length: Math.max(worksheet.rowCount - 1, 0) }, (_, index) => worksheet.getRow(index + 2).values as unknown[])
      .map((values) => values.slice(1))
      .filter((values) => values.some((value) => String(value ?? "").trim()));
    if (!definition && registerIndex < 0) {
      if (!dataRows.length) return;
      throw new Error(`Unknown register worksheet "${worksheet.name}". Use the register title from the backup workbook.`);
    }
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const values = (worksheet.getRow(rowNumber).values as unknown[]).slice(1);
      if (!values.some((value) => String(value ?? "").trim())) continue;
      if (definition) {
        imported.push(parseImportedDataRows(
          definition,
          headers.filter((header) => !metadataHeaders.includes(header)),
          values.filter((_value, index) => !metadataHeaders.includes(headers[index])),
          rowNumber,
          values[headers.findIndex((header) => ["record_date", "recorddate"].includes(header))],
          values[headers.findIndex((header) => ["record_id", "recordid"].includes(header))],
        ));
        continue;
      }
      const row = Object.fromEntries(headers.map((header, index) => [header, String(values[index] ?? "").trim()]));
      const rowDefinition = resolveRegister(
        registerHeaders.map((header) => row[header]).find(Boolean),
      );
      if (!rowDefinition) throw new Error(`Row ${rowNumber}: unknown register "${registerHeaders.map((header) => row[header]).find(Boolean) ?? ""}".`);
      imported.push(parseImportedDataRows(
        rowDefinition,
        headers.filter((header) => !metadataHeaders.includes(header)),
        values.filter((_value, index) => !metadataHeaders.includes(headers[index])),
        rowNumber,
        row.record_date ?? row.recorddate,
        row.record_id ?? row.recordid,
      ));
    }
  });
  if (!imported.length && !importedTransactions.length && !importedBills.length) {
    throw new Error("The workbook does not contain any register or payment rows.");
  }
  return { registerRows: imported, transactions: importedTransactions, bills: importedBills };
};

const attendanceReferenceFor = (id: string, date: string, registerSlug: string) =>
  `ATT-${date.replaceAll("-", "")}-${registerSlug.slice(0, 3).toUpperCase()}-${id.slice(0, 8).toUpperCase()}`;

const parseImportedAttendanceReferences = (value: string | null) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string" || !item.trim())) {
      throw new Error("must be a JSON array of attendance references");
    }
    return parsed as string[];
  } catch (error) {
    throw new Error(`Payment attendanceReferences ${error instanceof Error ? error.message : "are invalid"}.`);
  }
};

const importedPersonName = (row: { data: Record<string, unknown> }) =>
  String(row.data.labour_name ?? row.data.driver_name ?? row.data.choosen_driver ?? row.data.name ?? "").trim().toLowerCase();

const reconcileLegacyAttendanceReferences = (
  registerRows: Array<{
    id: string;
    recordIdProvided: boolean;
    registerSlug: string;
    recordDate: string | null;
    data: Record<string, unknown>;
  }>,
  transactions: Array<{ personName: string; attendanceReferences: string | null }>,
) => {
  const referenceOwners = new Map<string, typeof registerRows[number]>();
  for (const row of registerRows) {
    const date = row.recordDate ?? (typeof row.data.date === "string" ? row.data.date : "");
    if (date) referenceOwners.set(attendanceReferenceFor(row.id, date, row.registerSlug), row);
  }

  for (const transaction of transactions) {
    const references = parseImportedAttendanceReferences(transaction.attendanceReferences);
    for (const reference of references) {
      if (referenceOwners.has(reference)) continue;
      const match = reference.match(/^ATT-(\d{8})-([A-Z0-9]{3})-([A-Z0-9]{8})$/i);
      if (!match) throw new Error(`Payment reference "${reference}" is not a valid attendance reference.`);
      const [, compactDate, registerPrefix, legacyIdPrefix] = match;
      const date = `${compactDate.slice(0, 4)}-${compactDate.slice(4, 6)}-${compactDate.slice(6, 8)}`;
      const candidates = registerRows.filter((row) =>
        !row.recordIdProvided &&
        (row.recordDate ?? row.data.date) === date &&
        row.registerSlug.slice(0, 3).toUpperCase() === registerPrefix.toUpperCase() &&
        importedPersonName(row) === transaction.personName.trim().toLowerCase(),
      );
      if (candidates.length !== 1) {
        throw new Error(
          `Payment reference "${reference}" could not be matched safely to one imported attendance row. Export a fresh backup with record IDs and try again.`,
        );
      }
      const row = candidates[0];
      row.id = `${legacyIdPrefix}-${randomUUID()}`;
      row.recordIdProvided = true;
      referenceOwners.set(reference, row);
    }
  }
};

const validateImportConsistency = async (imported: {
  registerRows: Array<{
    id: string;
    recordIdProvided: boolean;
    registerSlug: string;
    recordDate: string | null;
    data: Record<string, unknown>;
  }>;
  transactions: Array<{ id: string; billKey: string; personName: string; attendanceReferences: string | null }>;
  bills: Array<{ billKey: string }>;
}) => {
  reconcileLegacyAttendanceReferences(imported.registerRows, imported.transactions);
  const [existingRecords, existingBills] = await Promise.all([
    db.select().from(registerRecordsTable),
    db.select({ billKey: paymentBillsTable.billKey }).from(paymentBillsTable),
  ]);
  const attendanceReferences = new Set([
    ...existingRecords.map((row) => attendanceReferenceFor(
      row.id,
      row.recordDate ?? (typeof row.data.date === "string" ? row.data.date : ""),
      row.registerSlug,
    )),
    ...imported.registerRows.map((row) => attendanceReferenceFor(
      row.id,
      row.recordDate ?? (typeof row.data.date === "string" ? row.data.date : ""),
      row.registerSlug,
    )),
  ]);
  const billKeys = new Set([
    ...existingBills.map((bill) => bill.billKey),
    ...imported.bills.map((bill) => bill.billKey),
  ]);
  const transactionIds = new Set<string>();
  for (const transaction of imported.transactions) {
    if (transactionIds.has(transaction.id)) throw new Error(`Payment transaction "${transaction.id}" appears more than once in the import.`);
    transactionIds.add(transaction.id);
    if (!billKeys.has(transaction.billKey)) {
      throw new Error(`Payment transaction "${transaction.id}" refers to a missing payment bill.`);
    }
    const references = parseImportedAttendanceReferences(transaction.attendanceReferences);
    const missing = references.filter((reference) => !attendanceReferences.has(reference));
    if (missing.length) {
      throw new Error(`Payment transaction "${transaction.id}" refers to missing attendance reference "${missing[0]}".`);
    }
  }
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
  const headers = ["Register", "registerSlug", "recordDate", ...importFields.map((field) => field.key)];
  const example = {
    name_of_visitor: "Example visitor",
    location_of_visitor: "Office",
    mobile_no: "0000000000",
    purpose: "Meeting",
    whom_to_meet: "Admin",
    in_time: "09:00",
  } as Record<string, string>;
  const sample = ["Visitor Record Register", "visitor-record", "2026-09-15", ...importFields.map((field) => example[field.key] ?? "")];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="register-import-template.csv"');
  return res.send([headers, sample].map((row) => row.map(escapeCsvValue).join(",")).join("\n"));
});

router.post("/admin/data/import", raw({
  type: () => true,
  limit: MAX_IMPORT_BYTES,
}), async (req: Request, res: Response) => {
  const workbookBuffer = Buffer.isBuffer(req.body)
    ? req.body
    : req.body instanceof Uint8Array
      ? Buffer.from(req.body)
      : null;
  if (!workbookBuffer) return res.status(400).json({ error: "Upload an Excel workbook." });
  try {
    const imported = workbookBuffer.subarray(0, 2).toString("utf8") === "PK"
      ? await parseImportedWorkbook(workbookBuffer)
      : {
        registerRows: parseImportedCsvRows(workbookBuffer.toString("utf8")),
        transactions: [],
        bills: [],
      };
    await validateImportConsistency(imported);
    await db.transaction(async (tx) => {
      if (imported.registerRows.length) {
        await tx.insert(registerRecordsTable).values(
          imported.registerRows.map(({ recordIdProvided: _recordIdProvided, ...row }) => row),
        ).onConflictDoNothing();
      }
      if (imported.bills.length) {
        await tx.insert(paymentBillsTable).values(imported.bills).onConflictDoNothing();
      }
      if (imported.transactions.length) {
        await tx.insert(paymentTransactionsTable).values(imported.transactions).onConflictDoNothing();
      }
    });
    return res.status(201).json({
      imported: imported.registerRows.length,
      registers: Array.from(new Set(imported.registerRows.map((row) => row.registerSlug))).length,
      payments: imported.transactions.length,
      bills: imported.bills.length,
    });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "The CSV could not be imported." });
  }
});

router.post("/admin/data/truncate", async (req: Request, res: Response) => {
  if (req.body?.confirmation !== "TRUNCATE ALL DATA") {
    return res.status(400).json({ error: 'Type "TRUNCATE ALL DATA" to confirm this destructive action.' });
  }
  try {
    const cleared = await db.transaction(async (tx) => {
      const exclusions = await tx.delete(paymentAttendanceExclusionsTable).returning({ id: paymentAttendanceExclusionsTable.id });
      const transactions = await tx.delete(paymentTransactionsTable).returning({ id: paymentTransactionsTable.id });
      const bills = await tx.delete(paymentBillsTable).returning({ id: paymentBillsTable.id });
      const records = await tx.delete(registerRecordsTable).returning({ id: registerRecordsTable.id });
      return {
        attendanceExclusions: exclusions.length,
        transactions: transactions.length,
        bills: bills.length,
        records: records.length,
      };
    });
    return res.json({ cleared });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "All data could not be cleared." });
  }
});

router.get("/admin/data/export", async (_req: Request, res: Response) => {
  const workbook = await workbookForAllRegisters();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="security-operations-backup-${indiaDateKey(new Date())}.xlsx"`);
  return res.send(Buffer.from(workbook as any));
});

export default router;