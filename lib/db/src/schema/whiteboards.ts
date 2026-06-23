import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { classesTable } from "./classes";

export const whiteboardsTable = pgTable("whiteboards", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").notNull().unique().references(() => classesTable.id),
  data: text("data").notNull().default("[]"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertWhiteboardSchema = createInsertSchema(whiteboardsTable).omit({ id: true, updatedAt: true });
export type InsertWhiteboard = z.infer<typeof insertWhiteboardSchema>;
export type Whiteboard = typeof whiteboardsTable.$inferSelect;
