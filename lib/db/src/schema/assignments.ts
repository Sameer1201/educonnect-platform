import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { classesTable } from "./classes";
import { usersTable } from "./users";

export const assignmentsTable = pgTable("assignments", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").references(() => classesTable.id, { onDelete: "cascade" }).notNull(),
  createdBy: integer("created_by").references(() => usersTable.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  dueAt: timestamp("due_at"),
  maxMarks: integer("max_marks").default(100),
  isPublished: boolean("is_published").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const assignmentSubmissionsTable = pgTable("assignment_submissions", {
  id: serial("id").primaryKey(),
  assignmentId: integer("assignment_id").references(() => assignmentsTable.id, { onDelete: "cascade" }).notNull(),
  studentId: integer("student_id").references(() => usersTable.id).notNull(),
  fileName: text("file_name"),
  fileData: text("file_data"),
  fileType: text("file_type"),
  comment: text("comment"),
  grade: integer("grade"),
  feedback: text("feedback"),
  gradedBy: integer("graded_by").references(() => usersTable.id),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  gradedAt: timestamp("graded_at"),
});
