import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const classesTable = pgTable("classes", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  subject: text("subject").notNull(),
  workflowType: text("workflow_type", { enum: ["class", "question_bank"] }).notNull().default("class"),
  adminId: integer("admin_id").notNull().references(() => usersTable.id),
  assignedTeacherIds: integer("assigned_teacher_ids").array().notNull().default([]),
  plannerId: integer("planner_id").references(() => usersTable.id),
  status: text("status", { enum: ["scheduled", "live", "completed", "cancelled"] }).notNull().default("scheduled"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  weeklyTargetQuestions: integer("weekly_target_questions"),
  weeklyTargetDeadline: timestamp("weekly_target_deadline", { withTimezone: true }),
  maxStudents: integer("max_students"),
  meetingLink: text("meeting_link"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertClassSchema = createInsertSchema(classesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClass = z.infer<typeof insertClassSchema>;
export type Class = typeof classesTable.$inferSelect;
