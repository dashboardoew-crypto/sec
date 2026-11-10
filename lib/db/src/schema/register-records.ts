import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const registerRecordsTable = pgTable(
  "register_records",
  {
    id: text("id").primaryKey(),
    registerSlug: text("register_slug").notNull(),
    recordDate: text("record_date"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("register_records_slug_updated_idx").on(table.registerSlug, table.updatedAt),
    index("register_records_slug_date_idx").on(table.registerSlug, table.recordDate),
    index("register_records_updated_at_idx").on(table.updatedAt),
  ],
);

export const insertRegisterRecordSchema = createInsertSchema(registerRecordsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertRegisterRecord = z.infer<typeof insertRegisterRecordSchema>;
export type RegisterRecord = typeof registerRecordsTable.$inferSelect;
