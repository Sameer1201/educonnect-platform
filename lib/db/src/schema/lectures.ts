import { pgTable, text, serial, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { subjectsTable } from "./subjects";
import { chaptersTable } from "./chapters";

export const lecturesTable = pgTable("lectures", {
  id: serial("id").primaryKey(),
  subjectId: integer("subject_id").notNull().references(() => subjectsTable.id, { onDelete: "cascade" }),
  chapterId: integer("chapter_id").references(() => chaptersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  videoUrl: text("video_url"),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const lectureEnrollmentsTable = pgTable("lecture_enrollments", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  lectureId: integer("lecture_id").notNull().references(() => lecturesTable.id, { onDelete: "cascade" }),
  enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("unique_lecture_enrollment").on(t.studentId, t.lectureId),
]);

export type Lecture = typeof lecturesTable.$inferSelect;
export type LectureEnrollment = typeof lectureEnrollmentsTable.$inferSelect;
