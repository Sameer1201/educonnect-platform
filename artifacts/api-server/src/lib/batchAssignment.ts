import { and, eq } from "drizzle-orm";
import { db, classesTable, enrollmentsTable, usersTable } from "@workspace/db";

const INACTIVE_CLASS_STATUSES = new Set(["completed", "cancelled"]);

function normalizeExam(exam: string | null | undefined) {
  return exam?.trim() || null;
}

export async function autoEnrollApprovedStudentsForClass(
  cls: Pick<typeof classesTable.$inferSelect, "id" | "subject" | "status">,
) {
  const exam = normalizeExam(cls.subject);
  if (!exam || INACTIVE_CLASS_STATUSES.has(cls.status)) {
    return 0;
  }

  const matchingStudents = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.role, "student"),
        eq(usersTable.status, "approved"),
        eq(usersTable.subject, exam),
      ),
    );

  if (matchingStudents.length === 0) {
    return 0;
  }

  await db
    .insert(enrollmentsTable)
    .values(matchingStudents.map((student) => ({ studentId: student.id, classId: cls.id })))
    .onConflictDoNothing();

  return matchingStudents.length;
}

export async function autoEnrollStudentIntoMatchingClasses(
  student: Pick<typeof usersTable.$inferSelect, "id" | "role" | "status" | "subject">,
) {
  const exam = normalizeExam(student.subject);
  if (student.role !== "student" || student.status !== "approved" || !exam) {
    return 0;
  }

  const matchingClasses = (await db
    .select({ id: classesTable.id, status: classesTable.status })
    .from(classesTable)
    .where(eq(classesTable.subject, exam)))
    .filter((cls) => !INACTIVE_CLASS_STATUSES.has(cls.status));

  if (matchingClasses.length === 0) {
    return 0;
  }

  await db
    .insert(enrollmentsTable)
    .values(matchingClasses.map((cls) => ({ studentId: student.id, classId: cls.id })))
    .onConflictDoNothing();

  return matchingClasses.length;
}
