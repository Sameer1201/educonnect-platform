import { boolean, integer, pgTable, timestamp } from "drizzle-orm/pg-core";

export const platformSettingsTable = pgTable("platform_settings", {
  id: integer("id").primaryKey().default(1),
  studentReviewEmailEnabled: boolean("student_review_email_enabled").notNull().default(true),
  studentReviewEmailActionsEnabled: boolean("student_review_email_actions_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type PlatformSettings = typeof platformSettingsTable.$inferSelect;
