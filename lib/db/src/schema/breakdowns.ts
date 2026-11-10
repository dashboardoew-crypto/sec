import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const breakdownsTable = pgTable(
  "breakdowns",
  {
    id: text("id").primaryKey(),
    registerSlug: text("register_slug").notNull(),
    tubewellName: text("tubewell_name").notNull(),
    date: text("date").notNull(),
    issue: text("issue").notNull(),
    reportedBy: text("reported_by"),
    status: text("status").notNull().default("open"),
    resolutionNotes: text("resolution_notes"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by"),
    emailSent: boolean("email_sent").default(false),
    emailRecipient: text("email_recipient"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("breakdowns_slug_idx").on(table.registerSlug),
    index("breakdowns_date_idx").on(table.date),
    index("breakdowns_created_at_idx").on(table.createdAt),
  ],
);

export const insertBreakdownSchema = createInsertSchema(breakdownsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertBreakdown = z.infer<typeof insertBreakdownSchema>;
export type Breakdown = typeof breakdownsTable.$inferSelect;

