import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { classesTable } from "./classes";
import { usersTable } from "./users";
import { chaptersTable } from "./chapters";

export const testsTable = pgTable("tests", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").references(() => classesTable.id, { onDelete: "cascade" }),
  chapterId: integer("chapter_id").references(() => chaptersTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  durationMinutes: integer("duration_minutes").notNull().default(30),
  passingScore: integer("passing_score").notNull().default(60),
  isPublished: boolean("is_published").notNull().default(false),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const testQuestionsTable = pgTable("test_questions", {
  id: serial("id").primaryKey(),
  testId: integer("test_id").notNull().references(() => testsTable.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  questionType: text("question_type").notNull().default("mcq"),
  options: text("options").notNull().default("[]"),
  optionImages: text("option_images"),
  correctAnswer: integer("correct_answer").notNull().default(0),
  correctAnswerMulti: text("correct_answer_multi"),
  correctAnswerMin: integer("correct_answer_min"),
  correctAnswerMax: integer("correct_answer_max"),
  points: integer("points").notNull().default(1),
  order: integer("order").notNull().default(0),
  imageData: text("image_data"),
});

export const testSubmissionsTable = pgTable("test_submissions", {
  id: serial("id").primaryKey(),
  testId: integer("test_id").notNull().references(() => testsTable.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => usersTable.id),
  answers: text("answers").notNull(),
  questionTimings: text("question_timings"),
  flaggedQuestions: text("flagged_questions"),
  score: integer("score").notNull().default(0),
  totalPoints: integer("total_points").notNull().default(0),
  percentage: integer("percentage").notNull().default(0),
  passed: boolean("passed").notNull().default(false),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow(),
});

export type Test = typeof testsTable.$inferSelect;
export type TestQuestion = typeof testQuestionsTable.$inferSelect;
export type TestSubmission = typeof testSubmissionsTable.$inferSelect;
