import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { classesTable } from "./classes";
import { subjectsTable } from "./subjects";
import { chaptersTable } from "./chapters";
import { usersTable } from "./users";

export const questionBankQuestionsTable = pgTable("question_bank_questions", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").notNull().references(() => classesTable.id, { onDelete: "cascade" }),
  subjectId: integer("subject_id").notNull().references(() => subjectsTable.id, { onDelete: "cascade" }),
  chapterId: integer("chapter_id").notNull().references(() => chaptersTable.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  questionType: text("question_type").notNull().default("mcq"),
  options: text("options").notNull().default("[]"),
  optionImages: text("option_images"),
  correctAnswer: integer("correct_answer"),
  correctAnswerMulti: text("correct_answer_multi"),
  correctAnswerMin: integer("correct_answer_min"),
  correctAnswerMax: integer("correct_answer_max"),
  answer: text("answer"),
  explanation: text("explanation"),
  difficulty: text("difficulty").notNull().default("medium"),
  points: integer("points").notNull().default(1),
  order: integer("order").notNull().default(0),
  imageData: text("image_data"),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const questionBankReportsTable = pgTable("question_bank_reports", {
  id: serial("id").primaryKey(),
  questionId: integer("question_id").notNull().references(() => questionBankQuestionsTable.id, { onDelete: "cascade" }),
  classId: integer("class_id").notNull().references(() => classesTable.id, { onDelete: "cascade" }),
  subjectId: integer("subject_id").notNull().references(() => subjectsTable.id, { onDelete: "cascade" }),
  chapterId: integer("chapter_id").notNull().references(() => chaptersTable.id, { onDelete: "cascade" }),
  reportedBy: integer("reported_by").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  teacherId: integer("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  reason: text("reason"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const questionBankSavedQuestionsTable = pgTable("question_bank_saved_questions", {
  id: serial("id").primaryKey(),
  questionId: integer("question_id").notNull().references(() => questionBankQuestionsTable.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type QuestionBankQuestion = typeof questionBankQuestionsTable.$inferSelect;
export type QuestionBankReport = typeof questionBankReportsTable.$inferSelect;
export type QuestionBankSavedQuestion = typeof questionBankSavedQuestionsTable.$inferSelect;
