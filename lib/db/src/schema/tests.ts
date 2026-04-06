import { pgTable, text, serial, timestamp, integer, boolean, real } from "drizzle-orm/pg-core";
import { classesTable } from "./classes";
import { usersTable } from "./users";
import { chaptersTable } from "./chapters";

export const testsTable = pgTable("tests", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").references(() => classesTable.id, { onDelete: "cascade" }),
  chapterId: integer("chapter_id").references(() => chaptersTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  examType: text("exam_type").notNull().default("custom"),
  examHeader: text("exam_header"),
  examSubheader: text("exam_subheader"),
  instructions: text("instructions"),
  examConfig: text("exam_config"),
  durationMinutes: integer("duration_minutes").notNull().default(30),
  passingScore: integer("passing_score").notNull().default(60),
  defaultPositiveMarks: real("default_positive_marks").notNull().default(1),
  defaultNegativeMarks: real("default_negative_marks").notNull().default(0),
  isPublished: boolean("is_published").notNull().default(false),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const testSectionsTable = pgTable("test_sections", {
  id: serial("id").primaryKey(),
  testId: integer("test_id").notNull().references(() => testsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  subjectLabel: text("subject_label"),
  questionCount: integer("question_count"),
  marksPerQuestion: real("marks_per_question"),
  negativeMarks: real("negative_marks"),
  meta: text("meta"),
  order: integer("order").notNull().default(0),
});

export const testQuestionsTable = pgTable("test_questions", {
  id: serial("id").primaryKey(),
  testId: integer("test_id").notNull().references(() => testsTable.id, { onDelete: "cascade" }),
  sectionId: integer("section_id").references(() => testSectionsTable.id, { onDelete: "set null" }),
  question: text("question").notNull(),
  questionType: text("question_type").notNull().default("mcq"),
  questionCode: text("question_code"),
  sourceType: text("source_type").notNull().default("manual"),
  subjectLabel: text("subject_label"),
  options: text("options").notNull().default("[]"),
  optionImages: text("option_images"),
  correctAnswer: integer("correct_answer").notNull().default(0),
  correctAnswerMulti: text("correct_answer_multi"),
  correctAnswerMin: integer("correct_answer_min"),
  correctAnswerMax: integer("correct_answer_max"),
  points: integer("points").notNull().default(1),
  negativeMarks: real("negative_marks").notNull().default(0),
  meta: text("meta"),
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
  score: real("score").notNull().default(0),
  totalPoints: integer("total_points").notNull().default(0),
  percentage: real("percentage").notNull().default(0),
  passed: boolean("passed").notNull().default(false),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow(),
});

export type Test = typeof testsTable.$inferSelect;
export type TestSection = typeof testSectionsTable.$inferSelect;
export type TestQuestion = typeof testQuestionsTable.$inferSelect;
export type TestSubmission = typeof testSubmissionsTable.$inferSelect;
