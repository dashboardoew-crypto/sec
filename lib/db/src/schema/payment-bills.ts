import { doublePrecision, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const paymentBillsTable = pgTable(
  "payment_bills",
  {
    id: text("id").primaryKey(),
    billNumber: text("bill_number").notNull().unique(),
    billKey: text("bill_key").notNull().unique(),
    personName: text("person_name").notNull(),
    fromDate: text("from_date").notNull(),
    toDate: text("to_date").notNull(),
    sourceScope: text("source_scope").notNull().default("all"),
    totalDays: doublePrecision("total_days").notNull().default(0),
    wagePerDay: doublePrecision("wage_per_day").notNull().default(0),
    wageAmount: doublePrecision("wage_amount").notNull().default(0),
    overtimeMinutes: integer("overtime_minutes").notNull().default(0),
    overtimeRate: doublePrecision("overtime_rate").notNull().default(0),
    overtimeAmount: doublePrecision("overtime_amount").notNull().default(0),
    roundingAmount: doublePrecision("rounding_amount").notNull().default(0),
    totalAmount: doublePrecision("total_amount").notNull().default(0),
    paidAmount: doublePrecision("paid_amount").notNull().default(0),
    status: text("status").notNull().default("unpaid"),
    paymentMethod: text("payment_method"),
    paymentReference: text("payment_reference"),
    paymentNote: text("payment_note"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paidBy: text("paid_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("payment_bills_person_name_idx").on(table.personName),
    index("payment_bills_status_idx").on(table.status),
  ],
);

export const insertPaymentBillSchema = createInsertSchema(paymentBillsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertPaymentBill = z.infer<typeof insertPaymentBillSchema>;
export type PaymentBill = typeof paymentBillsTable.$inferSelect;
