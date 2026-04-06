import { boolean, integer, pgTable, real, serial, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const examTemplatesTable = pgTable("exam_templates", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  examHeader: text("exam_header"),
  examSubheader: text("exam_subheader"),
  durationMinutes: integer("duration_minutes").notNull().default(180),
  passingScore: integer("passing_score").notNull().default(60),
  defaultPositiveMarks: real("default_positive_marks").notNull().default(1),
  defaultNegativeMarks: real("default_negative_marks").notNull().default(0),
  sections: text("sections").notNull(),
  isSystem: boolean("is_system").notNull().default(false),
  createdBy: integer("created_by").references(() => usersTable.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ExamTemplate = typeof examTemplatesTable.$inferSelect;
