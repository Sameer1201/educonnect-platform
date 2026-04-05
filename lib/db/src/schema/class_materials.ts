import { pgTable, text, serial, timestamp, integer, varchar } from "drizzle-orm/pg-core";
import { classesTable } from "./classes";

export const classMaterialsTable = pgTable("class_materials", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").notNull().references(() => classesTable.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  fileData: text("file_data").notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull().default("application/pdf"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow(),
});

export type ClassMaterial = typeof classMaterialsTable.$inferSelect;
