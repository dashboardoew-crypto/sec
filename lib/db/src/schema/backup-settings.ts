import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const backupSettingsTable = pgTable("backup_settings", {
  id: text("id").primaryKey(),
  recipientEmail: text("recipient_email"),
  enabled: boolean("enabled").notNull().default(false),
  lastSentDate: text("last_sent_date"),
  lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BackupSettings = typeof backupSettingsTable.$inferSelect;