import { text, pgTable, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const paymentAttendanceExclusionsTable = pgTable("payment_attendance_exclusions", {
  id: text("id").primaryKey(),
  recordId: text("record_id").notNull(),
  billKey: text("bill_key").notNull(),
  excludedBy: text("excluded_by"),
  excludedAt: timestamp("excluded_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  recordBillKey: uniqueIndex("payment_attendance_exclusions_record_bill_key").on(table.recordId, table.billKey),
}));

export const insertPaymentAttendanceExclusionSchema = createInsertSchema(paymentAttendanceExclusionsTable).omit({
  excludedAt: true,
});
export type InsertPaymentAttendanceExclusion = z.infer<typeof insertPaymentAttendanceExclusionSchema>;
export type PaymentAttendanceExclusion = typeof paymentAttendanceExclusionsTable.$inferSelect;