import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  db,
  registerRecordsTable,
  paymentBillsTable,
  paymentTransactionsTable,
  paymentAttendanceExclusionsTable,
} from "../../lib/db/src/index.js";
import {
  REGISTER_DEFINITIONS,
  getRegister,
  type FieldDefinition,
  type RegisterDefinition,
} from "../../artifacts/api-server/src/data/registers.js";
import {
  applyDerivedValues,
  validateRequiredFields,
} from "../../artifacts/api-server/src/routes/operations.js";

const normalizeHeader = (value: string) =>
  value.trim().replace(/^\ufeff/, "").replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

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
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  return trimmed;
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
      if (!Number.isFinite(numericValue)) {
        console.warn(`Row ${rowIndex}: "${value}" is not a valid number for ${field.label}, using 0.`);
        data[field.key] = 0;
      } else {
        data[field.key] = numericValue;
      }
    } else if (field?.type === "checkbox") {
      data[field.key] = value.toLowerCase() === "true" || value === "1";
    } else if (field) {
      data[field.key] = value;
    }
  }
  const importedDate = normalizeDateValue(recordDateOverride);
  if ((data.date === undefined || data.date === "") && importedDate) data.date = importedDate;
  if (data.date === undefined || data.date === "") data.date = new Date().toISOString().slice(0, 10);
  const selectedDate = typeof data.date === "string" ? normalizeDateValue(data.date) as string : new Date().toISOString().slice(0, 10);
  data.date = selectedDate;
  const processed = applyDerivedValues(definition, data);
  const missing = validateRequiredFields(definition, selectedDate, processed);
  if (missing.length) {
    console.warn(`Row ${rowIndex} (${definition.title}): missing required fields: ${missing.map((f) => f.label).join(", ")}. Setting defaults.`);
    for (const m of missing) {
      if (!(m.key in processed) || processed[m.key] === undefined || processed[m.key] === "") {
        processed[m.key] = m.type === "number" ? 0 : "-";
      }
    }
  }
  const recordId = typeof recordIdOverride === "string" ? recordIdOverride.trim() : "";
  return {
    id: recordId || randomUUID(),
    registerSlug: definition.slug,
    recordDate: selectedDate,
    data: processed,
  };
};

async function main() {
  const filePath = fs.existsSync(path.resolve(process.cwd(), "scripts/import_payload.csv"))
    ? path.resolve(process.cwd(), "scripts/import_payload.csv")
    : path.resolve(process.cwd(), "import_payload.csv");
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const rawCsv = fs.readFileSync(filePath, "utf8");
  const allRows = parseCsv(rawCsv);
  console.log(`Read ${allRows.length} total rows from CSV.`);

  // Detect section boundaries
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

  console.log(`Identified ${sections.length} distinct data sections.`);

  const registerRowsToInsert: any[] = [];
  const billsToInsert: any[] = [];
  const transactionsToInsert: any[] = [];
  const exclusionsToInsert: any[] = [];

  for (const sec of sections) {
    if (sec.type === "register") {
      const headers = sec.headers;
      const registerHeaders = ["register", "register_slug", "registerslug", "register_name", "registername", "register_title", "registertitle"];
      const metadataHeaders = [...registerHeaders, "record_id", "recordid", "record_date", "recorddate"];

      for (let rIdx = 0; rIdx < sec.rows.length; rIdx++) {
        const values = sec.rows[rIdx];
        const raw: Record<string, string> = {};
        headers.forEach((header, index) => {
          raw[header] = (values[index] ?? "").trim();
        });

        const registerValue = registerHeaders.map((h) => raw[h]).find(Boolean);
        const definition = resolveRegister(registerValue);
        if (!definition) {
          console.warn(`Row ${rIdx + 1}: unknown register "${registerValue}", skipping.`);
          continue;
        }

        const dataHeaders = headers.filter((h) => !metadataHeaders.includes(h));
        const dataValues = values.filter((_, idx) => !metadataHeaders.includes(headers[idx]));
        const recordDate = raw.date ?? raw.record_date ?? raw.recorddate;
        const recordId = raw.record_id ?? raw.recordid;

        const parsed = parseImportedDataRows(definition, dataHeaders, dataValues, rIdx + 1, recordDate, recordId);
        registerRowsToInsert.push(parsed);
      }
    } else if (sec.type === "bills") {
      for (const row of sec.rows) {
        const raw: Record<string, string> = {};
        sec.headers.forEach((h, idx) => {
          raw[h] = (row[idx] ?? "").trim();
        });

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

        const bill = {
          id: getVal("id") || randomUUID(),
          billNumber: getVal("billNumber", "bill_number"),
          billKey: getVal("billKey", "bill_key"),
          personName: getVal("personName", "person_name"),
          fromDate: normalizeDateValue(getVal("fromDate", "from_date")) as string,
          toDate: normalizeDateValue(getVal("toDate", "to_date")) as string,
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
        };
        billsToInsert.push(bill);
      }
    } else if (sec.type === "transactions") {
      for (const row of sec.rows) {
        const raw: Record<string, string> = {};
        sec.headers.forEach((h, idx) => {
          raw[h] = (row[idx] ?? "").trim();
        });

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

        const tx = {
          id: getVal("id") || randomUUID(),
          billNumber: getVal("billNumber", "bill_number"),
          billKey: getVal("billKey", "bill_key"),
          personName: getVal("personName", "person_name"),
          fromDate: normalizeDateValue(getVal("fromDate", "from_date")) as string,
          toDate: normalizeDateValue(getVal("toDate", "to_date")) as string,
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
        };
        transactionsToInsert.push(tx);
      }
    } else if (sec.type === "exclusions") {
      for (const row of sec.rows) {
        const raw: Record<string, string> = {};
        sec.headers.forEach((h, idx) => {
          raw[h] = (row[idx] ?? "").trim();
        });
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
          exclusionsToInsert.push({
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

  console.log(`Parsed:`);
  console.log(`- ${registerRowsToInsert.length} register records across all registers`);
  console.log(`- ${billsToInsert.length} payment bills`);
  console.log(`- ${transactionsToInsert.length} payment transactions`);
  console.log(`- ${exclusionsToInsert.length} attendance exclusions`);

  // Insert into Database
  console.log("Inserting records into PostgreSQL...");
  let insertedRegisterCount = 0;
  for (const r of registerRowsToInsert) {
    await db.insert(registerRecordsTable).values({
      id: r.id,
      registerSlug: r.registerSlug,
      recordDate: r.recordDate,
      data: r.data,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: registerRecordsTable.id,
      set: {
        registerSlug: r.registerSlug,
        recordDate: r.recordDate,
        data: r.data,
        updatedAt: new Date(),
      },
    });
    insertedRegisterCount++;
  }
  console.log(`Successfully saved ${insertedRegisterCount} register records.`);

  let insertedBillsCount = 0;
  for (const b of billsToInsert) {
    await db.insert(paymentBillsTable).values(b).onConflictDoUpdate({
      target: paymentBillsTable.id,
      set: {
        billNumber: b.billNumber,
        billKey: b.billKey,
        personName: b.personName,
        fromDate: b.fromDate,
        toDate: b.toDate,
        sourceScope: b.sourceScope,
        totalDays: b.totalDays,
        wagePerDay: b.wagePerDay,
        wageAmount: b.wageAmount,
        overtimeMinutes: b.overtimeMinutes,
        overtimeRate: b.overtimeRate,
        overtimeAmount: b.overtimeAmount,
        roundingAmount: b.roundingAmount,
        totalAmount: b.totalAmount,
        paidAmount: b.paidAmount,
        status: b.status,
        paymentMethod: b.paymentMethod,
        paymentReference: b.paymentReference,
        paymentNote: b.paymentNote,
        paidAt: b.paidAt,
        paidBy: b.paidBy,
        updatedAt: new Date(),
      },
    });
    insertedBillsCount++;
  }
  console.log(`Successfully saved ${insertedBillsCount} payment bills.`);

  let insertedTxCount = 0;
  for (const t of transactionsToInsert) {
    await db.insert(paymentTransactionsTable).values(t).onConflictDoUpdate({
      target: paymentTransactionsTable.id,
      set: {
        billNumber: t.billNumber,
        billKey: t.billKey,
        personName: t.personName,
        fromDate: t.fromDate,
        toDate: t.toDate,
        sourceScope: t.sourceScope,
        amount: t.amount,
        roundingAmount: t.roundingAmount,
        paymentMethod: t.paymentMethod,
        paymentReference: t.paymentReference,
        paymentNote: t.paymentNote,
        attendanceReferences: t.attendanceReferences,
        paidAt: t.paidAt,
        paidBy: t.paidBy,
      },
    });
    insertedTxCount++;
  }
  console.log(`Successfully saved ${insertedTxCount} payment transactions.`);

  let insertedExclCount = 0;
  for (const e of exclusionsToInsert) {
    await db.insert(paymentAttendanceExclusionsTable).values(e).onConflictDoNothing();
    insertedExclCount++;
  }
  console.log(`Successfully saved ${insertedExclCount} attendance exclusions.`);

  console.log("\n--- IMPORT COMPLETE ---");
  process.exit(0);
}

main().catch((err) => {
  console.error("Import error:", err);
  process.exit(1);
});
