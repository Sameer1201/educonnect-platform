import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { classesTable } from "./classes";
import { usersTable } from "./users";

export const attendanceTable = pgTable("attendance", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").references(() => classesTable.id, { onDelete: "cascade" }).notNull(),
  studentId: integer("student_id").references(() => usersTable.id).notNull(),
  date: text("date").notNull(),
  status: text("status").notNull(),
  markedBy: integer("marked_by").references(() => usersTable.id),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
