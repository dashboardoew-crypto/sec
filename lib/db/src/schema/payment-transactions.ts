import { doublePrecision, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const paymentTransactionsTable = pgTable(
  "payment_transactions",
  {
    id: text("id").primaryKey(),
    billKey: text("bill_key").notNull(),
    billNumber: text("bill_number").notNull(),
    personName: text("person_name").notNull(),
    fromDate: text("from_date").notNull(),
    toDate: text("to_date").notNull(),
    sourceScope: text("source_scope").notNull().default("all"),
    amount: doublePrecision("amount").notNull().default(0),
    roundingAmount: doublePrecision("rounding_amount").notNull().default(0),
    paymentMethod: text("payment_method").notNull().default("Cash"),
    paymentReference: text("payment_reference"),
    paymentNote: text("payment_note"),
    attendanceReferences: text("attendance_references"),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
    paidBy: text("paid_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("payment_transactions_bill_key_idx").on(table.billKey),
    index("payment_transactions_person_name_idx").on(table.personName),
    index("payment_transactions_paid_at_idx").on(table.paidAt),
  ],
);

export const insertPaymentTransactionSchema = createInsertSchema(paymentTransactionsTable).omit({
  createdAt: true,
});
export type InsertPaymentTransaction = z.infer<typeof insertPaymentTransactionSchema>;
export type PaymentTransaction = typeof paymentTransactionsTable.$inferSelect;
