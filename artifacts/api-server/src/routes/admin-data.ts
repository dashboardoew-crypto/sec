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
import { desc, eq, sql } from "drizzle-orm";
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

let dbMigrated = false;
async function ensureDbColumns() {
  if (dbMigrated) return;
  try {
    await db.execute(sql`ALTER TABLE backup_settings ADD COLUMN IF NOT EXISTS register_emails jsonb DEFAULT '{}'::jsonb`);
    dbMigrated = true;
  } catch (err) {
    console.error("Migration error (non-fatal):", err);
  }
}

const getSettings = async () => {
  await ensureDbColumns();
  const rows = await db.select().from(backupSettingsTable).where(eq(backupSettingsTable.id, SETTINGS_ID)).limit(1);
  return rows[0] ?? null;
};

const publicSettings = (settings: typeof backupSettingsTable.$inferSelect | null) => ({
  recipientEmail: settings?.recipientEmail ?? "",
  enabled: settings?.enabled ?? false,
  lastSentAt: settings?.lastSentAt?.toISOString() ?? null,
  registerEmails: (settings?.registerEmails as Record<string, string>) ?? {},
});

const styleWorkbookSheet = (worksheet: ExcelJS.Worksheet) => {
  worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF123B59" } };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
};

const workbookForAllRegisters = async () => {
  const [rows, transactions, bills, attendanceExclusions] = await Promise.all([
    db.select().from(registerRecordsTable).orderBy(registerRecordsTable.registerSlug),
    db.select().from(paymentTransactionsTable).orderBy(desc(paymentTransactionsTable.paidAt)),
    db.select().from(paymentBillsTable).orderBy(desc(paymentBillsTable.updatedAt)),
    db.select().from(paymentAttendanceExclusionsTable).orderBy(desc(paymentAttendanceExclusionsTable.excludedAt)),
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
     { header: "roundingAmount", key: "roundingAmount", width: 18 },
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
  paymentHistory.autoFilter = { from: "A1", to: "P1" };

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

  const paymentAttendanceExclusions = workbook.addWorksheet("Payment Attendance Exclusions");
  paymentAttendanceExclusions.columns = [
    { header: "id", key: "id", width: 38 },
    { header: "recordId", key: "recordId", width: 38 },
    { header: "billKey", key: "billKey", width: 54 },
    { header: "excludedBy", key: "excludedBy", width: 24 },
    { header: "excludedAt", key: "excludedAt", width: 24 },
  ];
  styleWorkbookSheet(paymentAttendanceExclusions);
  attendanceExclusions.forEach((exclusion) => paymentAttendanceExclusions.addRow({
    ...exclusion,
    excludedAt: exclusion.excludedAt.toISOString(),
  }));
  paymentAttendanceExclusions.autoFilter = { from: "A1", to: "E1" };

  return workbook.xlsx.writeBuffer();
};

const sendBackupEmail = async (recipientEmail: string) => {
  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailAppPassword) {
    throw new Error("Gmail is not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD in your environment / .env file.");
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
    registerEmails: current?.registerEmails ?? {},
    lastSentDate: indiaDateKey(sentAt),
    lastSentAt: sentAt,
    updatedAt: sentAt,
  }).onConflictDoUpdate({
    target: backupSettingsTable.id,
    set: { lastSentDate: indiaDateKey(sentAt), lastSentAt: sentAt, updatedAt: sentAt },
  });
};

export type RegisterEmailConfig = {
  email: string;
  enabled: boolean;
  notifyOnNoEntries: boolean;
  notifyOnlyOnException: boolean;
};

export const normalizeRegisterEmailConfig = (val: unknown): RegisterEmailConfig => {
  if (typeof val === "string") {
    const trimmed = val.trim().toLowerCase();
    return {
      email: trimmed,
      enabled: Boolean(trimmed),
      notifyOnNoEntries: false,
      notifyOnlyOnException: false,
    };
  }
  if (typeof val === "object" && val !== null) {
    const obj = val as Record<string, unknown>;
    const email = typeof obj.email === "string" ? obj.email.trim().toLowerCase() : "";
    return {
      email,
      enabled: obj.enabled !== undefined ? Boolean(obj.enabled) : Boolean(email),
      notifyOnNoEntries: Boolean(obj.notifyOnNoEntries),
      notifyOnlyOnException: Boolean(obj.notifyOnlyOnException),
    };
  }
  return {
    email: "",
    enabled: false,
    notifyOnNoEntries: false,
    notifyOnlyOnException: false,
  };
};

export const sendRegisterReportEmail = async (
  slug: string,
  recipientEmail: string,
  targetDate: string = indiaDateKey(new Date()),
  options?: {
    isScheduledAuto?: boolean;
    notifyOnNoEntries?: boolean;
    notifyOnlyOnException?: boolean;
  }
) => {
  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailAppPassword) {
    throw new Error("Gmail is not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD in your environment / .env file.");
  }

  const definition = getRegister(slug);
  if (!definition) throw new Error(`Register "${slug}" not found.`);

  const rows = await db
    .select()
    .from(registerRecordsTable)
    .where(eq(registerRecordsTable.registerSlug, slug))
    .orderBy(desc(registerRecordsTable.updatedAt));

  const dateRows = rows.filter((r) => {
    const recDate = typeof r.data.date === "string" ? r.data.date : r.recordDate;
    return recDate === targetDate;
  });

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailAppPassword },
  });

  // Handle case when 0 entries were logged today
  if (dateRows.length === 0) {
    if (options?.isScheduledAuto && !options.notifyOnNoEntries) {
      return {
        success: true,
        skipped: true,
        unreturnedCount: 0,
        totalRecords: 0,
        message: `Skipped: 0 entries logged today for ${definition.title} and notifyOnNoEntries is disabled.`,
      };
    }

    // Find earlier unreturned keys for key-movement if any
    const isUnreturnedCheck = (data: Record<string, unknown>) => {
      const ret = data.key_return;
      return !ret || String(ret).trim() === "" || String(ret).trim() === "-";
    };
    const pastUnreturned = slug === "key-movement" ? rows.filter((r) => isUnreturnedCheck(r.data)).slice(0, 20) : [];

    const noEntrySubject = `ℹ️ [Notice] No Entries Logged Today — ${definition.title} (${targetDate})`;
    const noEntryHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; color: #1e293b; background-color: #f8fafc; padding: 20px; border-radius: 8px;">
        <div style="background-color: #0f2b48; color: #ffffff; padding: 18px 24px; border-radius: 6px 6px 0 0;">
          <h1 style="margin: 0; font-size: 20px; font-weight: bold;">Security Operations Management</h1>
          <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.85;">${definition.title} — Daily Activity Notice</p>
        </div>
        <div style="background-color: #ffffff; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 6px 6px;">
          <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 16px; margin-bottom: 20px;">
            <p style="color: #1e40af; margin: 0; font-size: 14px; line-height: 1.5;">
              <strong>Notice:</strong> No entries were recorded in <strong>${definition.title}</strong> for date <strong>${targetDate}</strong>.
            </p>
          </div>
          <p style="font-size: 13px; color: #475569; line-height: 1.6;">
            This email was sent according to your admin configuration to report when no entries have been logged on a given date. If operations were expected today, please follow up with security desk personnel.
          </p>
          ${pastUnreturned.length > 0 ? `
            <div style="margin-top: 20px; border-top: 1px dashed #cbd5e1; padding-top: 14px;">
              <h4 style="color: #b45309; font-size: 13px; margin: 0 0 8px 0;">⚠️ Note: Previous Unreturned Keys Still Outstanding (${pastUnreturned.length}):</h4>
              <ul style="font-size: 12px; color: #78350f; margin: 0; padding-left: 18px;">
                ${pastUnreturned.map((k) => `
                  <li><strong>${k.data.name ?? "Unknown"}</strong>: ${k.data.location ?? "Key"} (Issued ${k.data.date ?? k.recordDate} at ${k.data.key_out_time ?? "-"})</li>
                `).join("")}
              </ul>
            </div>
          ` : ''}
          <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center;">
            This automated report was generated by Security Operations Management.
          </div>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: gmailUser,
      to: recipientEmail,
      subject: noEntrySubject,
      html: noEntryHtml,
      text: `Notice: No entries were recorded today (${targetDate}) in ${definition.title}.`,
    });

    return {
      success: true,
      skipped: false,
      unreturnedCount: pastUnreturned.length,
      totalRecords: 0,
      message: `Notice email sent: 0 entries recorded today for ${definition.title}.`,
    };
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Security Operations Management";
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet(definition.title.slice(0, 31));

  const columns = [
    { header: "Date", key: "date", width: 14 },
    ...definition.fields.map((f) => ({
      header: f.label,
      key: f.key,
      width: Math.min(Math.max(f.label.length + 4, 14), 28),
    })),
  ];
  worksheet.columns = columns;
  styleWorkbookSheet(worksheet);

  let subject = `${definition.title} Daily Report — ${targetDate}`;
  let htmlContent = "";
  let unreturnedCount = 0;

  if (slug === "key-movement") {
    const isUnreturned = (data: Record<string, unknown>) => {
      const ret = data.key_return;
      return !ret || String(ret).trim() === "" || String(ret).trim() === "-";
    };

    const unreturnedKeys = dateRows.filter((r) => isUnreturned(r.data));
    unreturnedCount = unreturnedKeys.length;

    // Check if admin only wants email when keys are NOT returned
    if (unreturnedCount === 0 && options?.isScheduledAuto && options.notifyOnlyOnException) {
      return {
        success: true,
        skipped: true,
        unreturnedCount: 0,
        totalRecords: dateRows.length,
        message: `Skipped: All keys returned today for Key Movement Register and notifyOnlyOnException is enabled.`,
      };
    }

    const pastUnreturned = rows.filter((r) => {
      const recDate = typeof r.data.date === "string" ? r.data.date : r.recordDate;
      return recDate !== targetDate && isUnreturned(r.data);
    }).slice(0, 20);

    if (unreturnedCount > 0) {
      subject = `🚨 [URGENT ALERT] ${unreturnedCount} Key(s) NOT RETURNED — Key Movement Register (${targetDate})`;
    } else {
      subject = `✅ Key Movement Register Report — ${targetDate} (All keys returned)`;
    }

    dateRows.forEach((r) => {
      const row = worksheet.addRow({
        date: displayDate(r.data.date ?? r.recordDate),
        ...Object.fromEntries(definition.fields.map((f) => [f.key, r.data[f.key] ?? ""])),
      });

      if (isUnreturned(r.data)) {
        row.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFC7CE" },
        };
        row.font = { color: { argb: "FF9C0006" }, bold: true };
      }
    });

    htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; color: #1e293b; background-color: #f8fafc; padding: 20px; border-radius: 8px;">
        <div style="background-color: #0f2b48; color: #ffffff; padding: 18px 24px; border-radius: 6px 6px 0 0;">
          <h1 style="margin: 0; font-size: 20px; font-weight: bold;">Security Operations Management</h1>
          <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.85;">Key Movement Register — Daily Exception & Movement Report</p>
        </div>

        <div style="background-color: #ffffff; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 6px 6px;">
          <div style="margin-bottom: 20px; font-size: 14px;">
            <strong>Report Date:</strong> ${targetDate} &nbsp;|&nbsp;
            <strong>Total Keys Issued Today:</strong> ${dateRows.length} &nbsp;|&nbsp;
            <strong>Status:</strong> ${unreturnedCount > 0 ? '<span style="color: #dc2626; font-weight: bold;">⚠️ Pending Returns</span>' : '<span style="color: #16a34a; font-weight: bold;">✅ All Returned</span>'}
          </div>

          ${unreturnedCount > 0 ? `
            <div style="background-color: #fef2f2; border: 2px solid #ef4444; border-radius: 6px; padding: 16px; margin-bottom: 20px;">
              <h2 style="color: #b91c1c; margin: 0 0 8px 0; font-size: 16px;">
                🚨 URGENT: Keys Assigned Today Not Returned
              </h2>
              <p style="color: #991b1b; margin: 0 0 12px 0; font-size: 13px;">
                The following <strong>${unreturnedCount}</strong> key(s) were assigned on <strong>${targetDate}</strong> and have <strong>not been returned on the same day</strong>:
              </p>
              <table style="width: 100%; border-collapse: collapse; font-size: 13px; background-color: #ffffff; border: 1px solid #fca5a5;">
                <thead>
                  <tr style="background-color: #dc2626; color: #ffffff;">
                    <th style="padding: 8px 10px; text-align: left;">Person Name</th>
                    <th style="padding: 8px 10px; text-align: left;">Key / Location</th>
                    <th style="padding: 8px 10px; text-align: left;">Key Out Time</th>
                    <th style="padding: 8px 10px; text-align: center;">Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${unreturnedKeys.map((k) => `
                    <tr style="border-bottom: 1px solid #fee2e2;">
                      <td style="padding: 8px 10px; font-weight: bold; color: #1e293b;">${k.data.name ?? "-"}</td>
                      <td style="padding: 8px 10px; color: #334155;">${k.data.location ?? "-"}</td>
                      <td style="padding: 8px 10px; color: #334155;">${k.data.key_out_time ?? "-"}</td>
                      <td style="padding: 8px 10px; text-align: center; color: #dc2626; font-weight: bold; background-color: #fee2e2;">
                        NOT RETURNED ❌
                      </td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          ` : `
            <div style="background-color: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 14px; margin-bottom: 20px;">
              <p style="color: #15803d; margin: 0; font-weight: 600; font-size: 14px;">
                ✅ All keys issued on ${targetDate} have been safely returned.
              </p>
            </div>
          `}

          ${dateRows.length > 0 ? `
            <h3 style="color: #0f172a; font-size: 15px; margin: 20px 0 10px 0;">Today's Complete Key Movement Log (${dateRows.length} entries)</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px;">
              <thead>
                <tr style="background-color: #0f2b48; color: #ffffff;">
                  <th style="padding: 8px; text-align: left;">Person</th>
                  <th style="padding: 8px; text-align: left;">Location / Key</th>
                  <th style="padding: 8px; text-align: left;">Out Time</th>
                  <th style="padding: 8px; text-align: left;">Return Time</th>
                </tr>
              </thead>
              <tbody>
                ${dateRows.map((r, i) => `
                  <tr style="background-color: ${i % 2 === 0 ? '#f8fafc' : '#ffffff'}; border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 7px 8px; font-weight: 500;">${r.data.name ?? "-"}</td>
                    <td style="padding: 7px 8px;">${r.data.location ?? "-"}</td>
                    <td style="padding: 7px 8px;">${r.data.key_out_time ?? "-"}</td>
                    <td style="padding: 7px 8px; ${isUnreturned(r.data) ? 'color: #dc2626; font-weight: bold;' : 'color: #16a34a;'}">${r.data.key_return || 'Pending / Not Returned'}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          ` : `
            <p style="color: #64748b; font-size: 13px; font-style: italic;">No key movements logged today (${targetDate}).</p>
          `}

          ${pastUnreturned.length > 0 ? `
            <div style="margin-top: 20px; border-top: 1px dashed #cbd5e1; padding-top: 10px;">
              <h4 style="color: #b45309; font-size: 13px; margin: 8px 0 6px 0;">⚠️ Earlier Unreturned Keys Still Outstanding (${pastUnreturned.length}):</h4>
              <ul style="font-size: 12px; color: #78350f; margin: 0; padding-left: 18px;">
                ${pastUnreturned.map((k) => `
                  <li><strong>${k.data.name ?? "Unknown"}</strong>: ${k.data.location ?? "Key"} (Issued on ${k.data.date ?? k.recordDate} at ${k.data.key_out_time ?? "-"})</li>
                `).join("")}
              </ul>
            </div>
          ` : ''}

          <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center;">
            This automated report was generated by Security Operations Management. An Excel copy is attached.
          </div>
        </div>
      </div>
    `;
  } else {
    dateRows.forEach((r) => {
      worksheet.addRow({
        date: displayDate(r.data.date ?? r.recordDate),
        ...Object.fromEntries(definition.fields.map((f) => [f.key, r.data[f.key] ?? ""])),
      });
    });

    htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; color: #1e293b; background-color: #f8fafc; padding: 20px; border-radius: 8px;">
        <div style="background-color: #0f2b48; color: #ffffff; padding: 18px 24px; border-radius: 6px 6px 0 0;">
          <h1 style="margin: 0; font-size: 20px; font-weight: bold;">Security Operations Management</h1>
          <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.85;">${definition.title} — Daily Report</p>
        </div>
        <div style="background-color: #ffffff; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 6px 6px;">
          <div style="margin-bottom: 16px; font-size: 14px;">
            <strong>Module:</strong> ${definition.module.toUpperCase()} &nbsp;|&nbsp;
            <strong>Report Date:</strong> ${targetDate} &nbsp;|&nbsp;
            <strong>Total Entries Today:</strong> ${dateRows.length}
          </div>
          ${dateRows.length > 0 ? `
            <p style="font-size: 13px; color: #334155;">Attached is the structured Excel report containing all ${dateRows.length} entries recorded for <strong>${definition.title}</strong> on ${targetDate}.</p>
          ` : `
            <p style="font-size: 13px; color: #64748b; font-style: italic;">No records were recorded for ${definition.title} on ${targetDate}.</p>
          `}
          <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center;">
            This automated report was generated by Security Operations Management. An Excel copy is attached.
          </div>
        </div>
      </div>
    `;
  }

  const excelBuffer = await workbook.xlsx.writeBuffer();
  const excelBase64 = Buffer.from(excelBuffer as any).toString("base64");

  await transporter.sendMail({
    from: gmailUser,
    to: recipientEmail,
    subject,
    html: htmlContent,
    text: `Daily Report for ${definition.title} (${targetDate}). ${unreturnedCount > 0 ? `WARNING: ${unreturnedCount} unreturned key(s)!` : ''} Please check the attached spreadsheet.`,
    attachments: [
      {
        filename: `${definition.slug}-report-${targetDate}.xlsx`,
        content: excelBase64,
        encoding: "base64",
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    ],
  });

  return { success: true, skipped: false, unreturnedCount, totalRecords: dateRows.length, message: `Report sent for ${definition.title} (${targetDate})` };
};

export const runDailyBackupIfDue = async () => {
  const settings = await getSettings();
  if (!settings) return;
  const now = new Date();
  const { hour, minute } = indiaTimeParts(now);
  if (hour < 18 || (hour === 18 && minute < 0) || settings.lastSentDate === indiaDateKey(now)) return;

  const todayKey = indiaDateKey(now);

  if (settings.enabled && settings.recipientEmail) {
    try {
      await sendBackupEmail(settings.recipientEmail);
    } catch (err) {
      console.error("Master backup email failed:", err);
    }
  }

  const rawConfigs = (settings.registerEmails as Record<string, unknown>) ?? {};
  for (const definition of REGISTER_DEFINITIONS) {
    if (definition.module === "master") continue;
    const slug = definition.slug;
    const config = normalizeRegisterEmailConfig(rawConfigs[slug]);

    if (!config.enabled || !config.email || !config.email.includes("@")) {
      continue;
    }

    try {
      await sendRegisterReportEmail(slug, config.email, todayKey, {
        isScheduledAuto: true,
        notifyOnNoEntries: config.notifyOnNoEntries,
        notifyOnlyOnException: config.notifyOnlyOnException,
      });
    } catch (err) {
      console.error(`Daily report failed for ${slug} (${config.email}):`, err);
    }
  }

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
  const entries: [string, FieldDefinition][] = [];
  for (const field of definition.fields) {
    entries.push([normalizeHeader(field.key), field]);
    entries.push([normalizeHeader(field.label), field]);
    if (field.key === "bill_received_from") {
      entries.push(["billrecievedfrom", field]);
      entries.push(["billrecieved", field]);
    }
    if (field.key === "office_initial") {
      entries.push(["officeinitial", field]);
      entries.push(["officeinitialmeterreading", field]);
      entries.push(["officeinitialelectricitymeterreading", field]);
    }
    if (field.key === "office_final") {
      entries.push(["officefinal", field]);
      entries.push(["officefinalmeterreading", field]);
      entries.push(["officefinalelectricitymeterreading", field]);
    }
    if (field.key === "kothi_initial") {
      entries.push(["kothiinitial", field]);
      entries.push(["mangotreewaterconsptioninitialreading", field]);
      entries.push(["mangotreewaterconsumptioninitialreading", field]);
      entries.push(["clinicgatewaterconsptioninitialreading", field]);
      entries.push(["clinicgatewaterconsumptioninitialreading", field]);
    }
    if (field.key === "kothi_final") {
      entries.push(["kothifinal", field]);
      entries.push(["kothifinalreading", field]);
      entries.push(["mangotreewaterconsptionfinalreading", field]);
      entries.push(["mangotreewaterconsumptionfinalreading", field]);
      entries.push(["clinicgatewaterconsptionfinalreading", field]);
      entries.push(["clinicgatewaterconsumptionfinalreading", field]);
    }
    if (field.key === "total_water_consumed") {
      entries.push(["totalwaterconsumed", field]);
      entries.push(["totalwaterconsumedliter", field]);
      entries.push(["totalwaterconsumedauto", field]);
    }
    if (field.key === "per_minute_water_consumed") {
      entries.push(["perminutewaterconsumed", field]);
      entries.push(["perminwaterconsumed", field]);
      entries.push(["perminwaterconsumedliter", field]);
      entries.push(["perminutewaterconsumedliter", field]);
      entries.push(["perminwaterconsumedauto", field]);
      entries.push(["perminutewaterconsumedauto", field]);
    }
    if (field.key === "remark") {
      entries.push(["printbatch", field]);
      entries.push(["print_batch", field]);
    }
    if (field.key === "man_power") {
      entries.push(["manpower", field]);
      entries.push(["totalmanpower", field]);
    }
    if (field.key === "initial_meter_reading") {
      entries.push(["initialmeterreading", field]);
      entries.push(["initialreading", field]);
    }
    if (field.key === "final_meter_reading") {
      entries.push(["finalmeterreading", field]);
      entries.push(["finalreading", field]);
    }
    if (field.key === "today_total_reading") {
      entries.push(["todaytotalreading", field]);
      entries.push(["totalreading", field]);
      entries.push(["todaytotalreadingauto", field]);
    }
  }
  const fieldByHeader = new Map<string, FieldDefinition>(entries);
  const allowanceFlag = (value: string) => ["yes", "no", "true", "false"].includes(value.toLowerCase());
  const data: Record<string, unknown> = {};
  for (const [header, value] of Object.entries(raw)) {
    if (!value) continue;
    const field = definition.slug === "driver-attendance" && allowanceFlag(value) && header === "day_allowance"
      ? definition.fields.find((candidate) => candidate.key === "day_allowance_applicable")
      : definition.slug === "driver-attendance" && allowanceFlag(value) && header === "night_allowance"
        ? definition.fields.find((candidate) => candidate.key === "night_allowance_applicable")
        : fieldByHeader.get(header);
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
  const selectedDate = typeof data.date === "string" ? normalizeDateValue(data.date) as string : indiaDateKey(new Date());
  data.date = selectedDate;
  const processed = applyDerivedValues(definition, data);
  const missing = validateRequiredFields(definition, selectedDate, processed);
  if (missing.length) {
    for (const m of missing) {
      if (!(m.key in processed) || processed[m.key] === undefined || processed[m.key] === "") {
        processed[m.key] = m.type === "number" ? 0 : "-";
      }
    }
  }
  const recordId = typeof recordIdOverride === "string" ? recordIdOverride.trim() : "";
  return {
    id: recordId || randomUUID(),
    recordIdProvided: Boolean(recordId),
    registerSlug: definition.slug,
    recordDate: new Date().toISOString(),
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
    roundingAmount: paymentNumber(worksheetCell(headers, values, "rounding_amount"), "roundingAmount", rowNumber),
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

const parseImportedAttendanceExclusions = (worksheet: ExcelJS.Worksheet) => {
  const { headers, rows } = worksheetRows(worksheet);
  return rows.map(({ rowNumber, values }) => ({
    id: requiredPaymentText(worksheetCell(headers, values, "id"), "id", rowNumber),
    recordId: requiredPaymentText(worksheetCell(headers, values, "record_id"), "recordId", rowNumber),
    billKey: requiredPaymentText(worksheetCell(headers, values, "bill_key"), "billKey", rowNumber),
    excludedBy: optionalPaymentText(worksheetCell(headers, values, "excluded_by")),
    excludedAt: paymentTimestamp(worksheetCell(headers, values, "excluded_at"), "excludedAt", rowNumber) ?? new Date(),
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
  const importedAttendanceExclusions: ReturnType<typeof parseImportedAttendanceExclusions> = [];
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
    if (normalizedSheetName === "payment_attendance_exclusions") {
      importedAttendanceExclusions.push(...parseImportedAttendanceExclusions(worksheet));
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
  if (!imported.length && !importedTransactions.length && !importedBills.length && !importedAttendanceExclusions.length) {
    throw new Error("The workbook does not contain any register or payment rows.");
  }
  return {
    registerRows: imported,
    transactions: importedTransactions,
    bills: importedBills,
    attendanceExclusions: importedAttendanceExclusions,
  };
};

const parseImportedCsvContent = (source: string) => {
  const allRows = parseCsv(source);
  if (allRows.length < 2) throw new Error("The CSV must include a header row and at least one data row.");

  type Section = {
    type: "register" | "transactions" | "bills" | "exclusions";
    headers: string[];
    rows: string[][];
  };

  const sections: Section[] = [];
  let currentSection: Section | null = null;

  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i];
    const norm = row.map(normalizeHeader);

    const hasCol = (name: string) => norm.includes(name) || norm.some((h) => h.replace(/_/g, "") === name.replace(/_/g, ""));
    const isRegisterHeader = hasCol("register_slug") || (hasCol("register") && hasCol("record_id"));
    const isBillsHeader = hasCol("bill_number") && (hasCol("total_days") || hasCol("wage_per_day"));
    const isTransactionsHeader = hasCol("bill_number") && hasCol("amount") && !hasCol("total_days") && !hasCol("wage_per_day");
    const isExclusionsHeader = hasCol("excluded_by") || (hasCol("record_id") && hasCol("bill_key") && !hasCol("register"));

    if (isRegisterHeader || isTransactionsHeader || isBillsHeader || isExclusionsHeader) {
      if (currentSection && currentSection.rows.length > 0) {
        sections.push(currentSection);
      }
      currentSection = {
        type: isRegisterHeader ? "register" : isTransactionsHeader ? "transactions" : isBillsHeader ? "bills" : "exclusions",
        headers: norm,
        rows: [],
      };
    } else if (currentSection) {
      if (row.some((cell) => cell.trim())) {
        currentSection.rows.push(row);
      }
    }
  }
  if (currentSection && currentSection.rows.length > 0) {
    sections.push(currentSection);
  }

  if (sections.length === 0) {
    return {
      registerRows: parseImportedCsvRows(source),
      transactions: [] as ReturnType<typeof parseImportedPaymentTransactions>,
      bills: [] as ReturnType<typeof parseImportedPaymentBills>,
      attendanceExclusions: [] as ReturnType<typeof parseImportedAttendanceExclusions>,
    };
  }

  const registerRows: Array<{
    id: string;
    recordIdProvided: boolean;
    registerSlug: string;
    recordDate: string | null;
    data: Record<string, unknown>;
  }> = [];
  const bills: ReturnType<typeof parseImportedPaymentBills> = [];
  const transactions: ReturnType<typeof parseImportedPaymentTransactions> = [];
  const attendanceExclusions: ReturnType<typeof parseImportedAttendanceExclusions> = [];

  for (const sec of sections) {
    if (sec.type === "register") {
      const headers = sec.headers;
      const registerHeaders = ["register", "register_slug", "registerslug", "register_name", "registername", "register_title", "registertitle"];
      const metadataHeaders = [...registerHeaders, "record_id", "recordid", "record_date", "recorddate"];

      for (let rIdx = 0; rIdx < sec.rows.length; rIdx++) {
        const values = sec.rows[rIdx];
        const raw: Record<string, string> = {};
        headers.forEach((header, index) => { raw[header] = (values[index] ?? "").trim(); });

        const registerValue = registerHeaders.map((h) => raw[h]).find(Boolean);
        const definition = resolveRegister(registerValue);
        if (!definition) continue;

        const dataHeaders = headers.filter((h) => !metadataHeaders.includes(h));
        const dataValues = values.filter((_, idx) => !metadataHeaders.includes(headers[idx]));
        const recordDate = raw.date ?? raw.record_date ?? raw.recorddate;
        const recordId = raw.record_id ?? raw.recordid;

        const parsed = parseImportedDataRows(definition, dataHeaders, dataValues, rIdx + 1, recordDate, recordId);
        registerRows.push(parsed);
      }
    } else if (sec.type === "bills") {
      for (let bIdx = 0; bIdx < sec.rows.length; bIdx++) {
        const row = sec.rows[bIdx];
        const raw: Record<string, string> = {};
        sec.headers.forEach((h, idx) => { raw[h] = (row[idx] ?? "").trim(); });
        const getVal = (...keys: string[]) => {
          for (const k of keys) {
            const normKey = normalizeHeader(k);
            if (raw[normKey] !== undefined && raw[normKey] !== "") return raw[normKey];
            const noUnderscore = normKey.replace(/_/g, "");
            for (const [rk, rv] of Object.entries(raw)) {
              if (rk.replace(/_/g, "") === noUnderscore && rv !== "") return rv;
            }
          }
          return "";
        };

        bills.push({
          id: getVal("id") || randomUUID(),
          billNumber: getVal("billNumber", "bill_number"),
          billKey: getVal("billKey", "bill_key"),
          personName: getVal("personName", "person_name"),
          fromDate: paymentDate(getVal("fromDate", "from_date"), "fromDate", bIdx + 1),
          toDate: paymentDate(getVal("toDate", "to_date"), "toDate", bIdx + 1),
          sourceScope: getVal("sourceScope", "source_scope") || "all",
          totalDays: Number(getVal("totalDays", "total_days") || 0),
          wagePerDay: Number(getVal("wagePerDay", "wage_per_day") || 0),
          wageAmount: Number(getVal("wageAmount", "wage_amount") || 0),
          overtimeMinutes: Math.round(Number(getVal("overtimeMinutes", "overtime_minutes") || 0)),
          overtimeRate: Number(getVal("overtimeRate", "overtime_rate") || 0),
          overtimeAmount: Number(getVal("overtimeAmount", "overtime_amount") || 0),
          roundingAmount: Number(getVal("roundingAmount", "rounding_amount") || 0),
          totalAmount: Number(getVal("totalAmount", "total_amount") || 0),
          paidAmount: Number(getVal("paidAmount", "paid_amount") || 0),
          status: getVal("status") || "unpaid",
          paymentMethod: getVal("paymentMethod", "payment_method") || null,
          paymentReference: getVal("paymentReference", "payment_reference") || null,
          paymentNote: getVal("paymentNote", "payment_note") || null,
          paidAt: getVal("paidAt", "paid_at") ? new Date(getVal("paidAt", "paid_at")) : null,
          paidBy: getVal("paidBy", "paid_by") || null,
          createdAt: getVal("createdAt", "created_at") ? new Date(getVal("createdAt", "created_at")) : new Date(),
          updatedAt: getVal("updatedAt", "updated_at") ? new Date(getVal("updatedAt", "updated_at")) : new Date(),
        });
      }
    } else if (sec.type === "transactions") {
      for (let tIdx = 0; tIdx < sec.rows.length; tIdx++) {
        const row = sec.rows[tIdx];
        const raw: Record<string, string> = {};
        sec.headers.forEach((h, idx) => { raw[h] = (row[idx] ?? "").trim(); });
        const getVal = (...keys: string[]) => {
          for (const k of keys) {
            const normKey = normalizeHeader(k);
            if (raw[normKey] !== undefined && raw[normKey] !== "") return raw[normKey];
            const noUnderscore = normKey.replace(/_/g, "");
            for (const [rk, rv] of Object.entries(raw)) {
              if (rk.replace(/_/g, "") === noUnderscore && rv !== "") return rv;
            }
          }
          return "";
        };

        transactions.push({
          id: getVal("id") || randomUUID(),
          billNumber: getVal("billNumber", "bill_number"),
          billKey: getVal("billKey", "bill_key"),
          personName: getVal("personName", "person_name"),
          fromDate: paymentDate(getVal("fromDate", "from_date"), "fromDate", tIdx + 1),
          toDate: paymentDate(getVal("toDate", "to_date"), "toDate", tIdx + 1),
          sourceScope: getVal("sourceScope", "source_scope") || "all",
          amount: Number(getVal("amount") || 0),
          roundingAmount: Number(getVal("roundingAmount", "rounding_amount") || 0),
          paymentMethod: getVal("paymentMethod", "payment_method") || "Cash",
          paymentReference: getVal("paymentReference", "payment_reference") || null,
          paymentNote: getVal("paymentNote", "payment_note") || null,
          attendanceReferences: getVal("attendanceReferences", "attendance_references") || null,
          paidAt: getVal("paidAt", "paid_at") ? new Date(getVal("paidAt", "paid_at")) : new Date(),
          paidBy: getVal("paidBy", "paid_by") || null,
          createdAt: getVal("createdAt", "created_at") ? new Date(getVal("createdAt", "created_at")) : new Date(),
        });
      }
    } else if (sec.type === "exclusions") {
      for (let eIdx = 0; eIdx < sec.rows.length; eIdx++) {
        const row = sec.rows[eIdx];
        const raw: Record<string, string> = {};
        sec.headers.forEach((h, idx) => { raw[h] = (row[idx] ?? "").trim(); });
        const getVal = (...keys: string[]) => {
          for (const k of keys) {
            const normKey = normalizeHeader(k);
            if (raw[normKey] !== undefined && raw[normKey] !== "") return raw[normKey];
          }
          return "";
        };
        const id = getVal("id");
        const recordId = getVal("recordId", "record_id");
        const billKey = getVal("billKey", "bill_key");
        if (id && recordId && billKey) {
          attendanceExclusions.push({
            id,
            recordId,
            billKey,
            excludedBy: getVal("excludedBy", "excluded_by") || null,
            excludedAt: getVal("excludedAt", "excluded_at") ? new Date(getVal("excludedAt", "excluded_at")) : new Date(),
          });
        }
      }
    }
  }

  return {
    registerRows,
    bills,
    transactions,
    attendanceExclusions,
  };
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
    const date = typeof row.data.date === "string" ? row.data.date : row.recordDate ?? "";
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
        (typeof row.data.date === "string" ? row.data.date : row.recordDate) === date &&
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
  attendanceExclusions: Array<{ id: string; recordId: string; billKey: string }>;
}) => {
  reconcileLegacyAttendanceReferences(imported.registerRows, imported.transactions);
  const [existingRecords, existingBills] = await Promise.all([
    db.select().from(registerRecordsTable),
    db.select({ billKey: paymentBillsTable.billKey }).from(paymentBillsTable),
  ]);
  const attendanceReferences = new Set([
    ...existingRecords.map((row) => attendanceReferenceFor(
      row.id,
      typeof row.data.date === "string" ? row.data.date : row.recordDate ?? "",
      row.registerSlug,
    )),
    ...imported.registerRows.map((row) => attendanceReferenceFor(
      row.id,
      typeof row.data.date === "string" ? row.data.date : row.recordDate ?? "",
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

  const recordIds = new Set([
    ...existingRecords.map((row) => row.id),
    ...imported.registerRows.map((row) => row.id),
  ]);
  const exclusionIds = new Set<string>();
  const exclusionKeys = new Set<string>();
  for (const exclusion of imported.attendanceExclusions) {
    if (exclusionIds.has(exclusion.id)) {
      throw new Error(`Attendance exclusion "${exclusion.id}" appears more than once in the import.`);
    }
    exclusionIds.add(exclusion.id);
    const exclusionKey = `${exclusion.recordId}:${exclusion.billKey}`;
    if (exclusionKeys.has(exclusionKey)) {
      throw new Error(`Attendance exclusion for record "${exclusion.recordId}" and bill "${exclusion.billKey}" appears more than once in the import.`);
    }
    exclusionKeys.add(exclusionKey);
    if (!recordIds.has(exclusion.recordId)) {
      throw new Error(`Attendance exclusion "${exclusion.id}" refers to a missing register record.`);
    }
    if (!billKeys.has(exclusion.billKey)) {
      throw new Error(`Attendance exclusion "${exclusion.id}" refers to a missing payment bill.`);
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

router.get("/admin/data/register-emails", async (_req: Request, res: Response) => {
  const settings = await getSettings();
  const rawConfigs = (settings?.registerEmails as Record<string, unknown>) ?? {};
  const configs: Record<string, RegisterEmailConfig> = {};
  const operationalRegisters = REGISTER_DEFINITIONS.filter((d) => d.module !== "master");

  for (const d of operationalRegisters) {
    configs[d.slug] = normalizeRegisterEmailConfig(rawConfigs[d.slug]);
  }

  return res.json({
    registerConfigs: configs,
    registers: operationalRegisters.map((d) => ({
      slug: d.slug,
      title: d.title,
      module: d.module,
      config: configs[d.slug],
    })),
  });
});

router.put("/admin/data/register-emails", async (req: Request, res: Response) => {
  const current = await getSettings();
  const input = req.body?.registerConfigs ?? req.body?.registerEmails ?? {};
  const cleanedConfigs: Record<string, RegisterEmailConfig> = {};
  const operationalRegisters = REGISTER_DEFINITIONS.filter((d) => d.module !== "master");

  for (const d of operationalRegisters) {
    cleanedConfigs[d.slug] = normalizeRegisterEmailConfig(input[d.slug]);
  }

  const [settings] = await db.insert(backupSettingsTable).values({
    id: SETTINGS_ID,
    recipientEmail: current?.recipientEmail ?? null,
    enabled: current?.enabled ?? false,
    preparedBy: current?.preparedBy ?? null,
    checkedBy: current?.checkedBy ?? null,
    verifiedBy: current?.verifiedBy ?? null,
    registerEmails: cleanedConfigs,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: backupSettingsTable.id,
    set: {
      registerEmails: cleanedConfigs,
      updatedAt: new Date(),
    },
  }).returning();

  const saved = (settings.registerEmails as unknown as Record<string, RegisterEmailConfig>) ?? {};
  const normalizedSaved: Record<string, RegisterEmailConfig> = {};
  for (const d of operationalRegisters) {
    normalizedSaved[d.slug] = normalizeRegisterEmailConfig(saved[d.slug]);
  }

  return res.json({
    registerConfigs: normalizedSaved,
    registers: operationalRegisters.map((d) => ({
      slug: d.slug,
      title: d.title,
      module: d.module,
      config: normalizedSaved[d.slug],
    })),
  });
});

router.post("/admin/data/registers/:slug/send-report", async (req: Request, res: Response) => {
  const slug = String(req.params.slug);
  const definition = getRegister(slug);
  if (!definition) return res.status(404).json({ error: "Register not found" });
  if (definition.module === "master") {
    return res.status(400).json({ error: "Master registers are one-time records and do not support email reports or alerts." });
  }

  const settings = await getSettings();
  const rawConfigs = (settings?.registerEmails as Record<string, unknown>) ?? {};
  const config = normalizeRegisterEmailConfig(rawConfigs[slug]);

  const recipient = req.body?.recipientEmail || config.email || settings?.recipientEmail;

  if (!recipient || typeof recipient !== "string" || !recipient.includes("@")) {
    return res.status(400).json({
      error: `No report recipient email configured for ${definition.title}. Please enter a valid email address first.`
    });
  }

  const dateStr = req.body?.date || indiaDateKey(new Date());

  try {
    const result = await sendRegisterReportEmail(slug, recipient.trim().toLowerCase(), dateStr, {
      isScheduledAuto: false,
      notifyOnNoEntries: true,
      notifyOnlyOnException: false,
    });

    return res.json({
      success: true,
      message: result.message || `Report for ${definition.title} sent to ${recipient.trim().toLowerCase()}`,
      unreturnedCount: result.unreturnedCount,
      totalRecords: result.totalRecords,
      skipped: result.skipped ?? false,
      date: dateStr,
    });
  } catch (error) {
    return res.status(503).json({
      error: error instanceof Error ? error.message : "The register report email could not be sent."
    });
  }
});

router.get("/admin/data/import-template", (_req: Request, res: Response) => {
  const importFields = Array.from(new Map(REGISTER_DEFINITIONS.flatMap((definition) => definition.fields).map((field) => [field.key, field])).values());
  const headers = ["Register", "registerSlug", ...importFields.map((field) => field.key)];
  const example = {
    name_of_visitor: "Example visitor",
    location_of_visitor: "Office",
    mobile_no: "0000000000",
    purpose: "Meeting",
    whom_to_meet: "Admin",
    in_time: "09:00",
  } as Record<string, string>;
  const sample = ["Visitor Record Register", "visitor-record", ...importFields.map((field) => example[field.key] ?? "")];
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
      : parseImportedCsvContent(workbookBuffer.toString("utf8"));
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
      if (imported.attendanceExclusions.length) {
        await tx.insert(paymentAttendanceExclusionsTable).values(imported.attendanceExclusions).onConflictDoNothing();
      }
    });
    return res.status(201).json({
      imported: imported.registerRows.length,
      registers: Array.from(new Set(imported.registerRows.map((row) => row.registerSlug))).length,
      payments: imported.transactions.length,
      bills: imported.bills.length,
      attendanceExclusions: imported.attendanceExclusions.length,
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