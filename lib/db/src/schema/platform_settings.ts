import { integer, pgTable, timestamp } from "drizzle-orm/pg-core";

export const platformSettingsTable = pgTable("platform_settings", {
  id: integer("id").primaryKey().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type PlatformSettings = typeof platformSettingsTable.$inferSelect;
