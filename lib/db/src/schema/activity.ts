import { pgTable, serial, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const userActivityLogs = pgTable("user_activity_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  action: text("action").notNull(),
  page: text("page"),
  detail: text("detail"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userSessions = pgTable("user_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  sessionToken: text("session_token").notNull(),
  ipAddress: text("ip_address"),
  locationLabel: text("location_label"),
  browserName: text("browser_name"),
  deviceType: text("device_type"),
  userAgent: text("user_agent"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  lastActiveAt: timestamp("last_active_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
  totalSeconds: integer("total_seconds").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
});
