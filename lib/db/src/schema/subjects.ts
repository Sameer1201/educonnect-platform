import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { classesTable } from "./classes";
import { usersTable } from "./users";

export const subjectsTable = pgTable("subjects", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").notNull().references(() => classesTable.id, { onDelete: "cascade" }),
  teacherId: integer("teacher_id").references(() => usersTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Subject = typeof subjectsTable.$inferSelect;
