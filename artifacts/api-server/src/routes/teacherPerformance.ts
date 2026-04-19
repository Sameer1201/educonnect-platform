import { Router } from "express";
import {
  db,
  usersTable,
  classesTable,
  enrollmentsTable,
  testsTable,
  testSubmissionsTable,
  feedbackTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const router = Router();

type EnrollmentRow = typeof enrollmentsTable.$inferSelect;
type TestRow = typeof testsTable.$inferSelect;
type TestSubmissionRow = typeof testSubmissionsTable.$inferSelect;

router.get("/teacher-performance", async (req, res): Promise<void> => {
  const userId = req.cookies?.userId;
  const userRole = req.cookies?.userRole;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (userRole !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const teachers = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.role, "admin"));

  if (teachers.length === 0) {
    res.json([]);
    return;
  }

  const teacherIds = teachers.map((teacher) => teacher.id);

  const [allClasses, allFeedback] = await Promise.all([
    db.select().from(classesTable).where(inArray(classesTable.adminId, teacherIds)),
    db.select().from(feedbackTable),
  ]);

  const classIds = allClasses.map((cls) => cls.id);

  const [allEnrollments, allTests] = classIds.length > 0
    ? await Promise.all([
        db.select().from(enrollmentsTable).where(inArray(enrollmentsTable.classId, classIds)),
        db.select().from(testsTable).where(inArray(testsTable.classId, classIds)),
      ])
    : [
        [] as EnrollmentRow[],
        [] as TestRow[],
      ];

  const testIds = allTests.map((test) => test.id);
  const testSubs = testIds.length > 0
    ? await db.select().from(testSubmissionsTable).where(inArray(testSubmissionsTable.testId, testIds))
    : [] as TestSubmissionRow[];

  const result = teachers.map((teacher) => {
    const myClasses = allClasses.filter((cls) => cls.adminId === teacher.id);
    const myClassIds = myClasses.map((cls) => cls.id);

    const myEnrollments = allEnrollments.filter((enrollment) => myClassIds.includes(enrollment.classId));
    const uniqueStudents = new Set(myEnrollments.map((enrollment) => enrollment.studentId)).size;

    const myTests = allTests.filter((test) => test.classId !== null && myClassIds.includes(test.classId));
    const myTestIds = myTests.map((test) => test.id);
    const myTestSubs = testSubs.filter((submission) => myTestIds.includes(submission.testId));

    const gradedSubs = myTestSubs.filter(
      (submission) => submission.score !== null && submission.totalPoints && submission.totalPoints > 0,
    );
    const avgScore = gradedSubs.length > 0
      ? Math.round(
          gradedSubs.reduce(
            (accumulator, submission) => accumulator + ((submission.score! / submission.totalPoints!) * 100),
            0,
          ) / gradedSubs.length,
        )
      : null;

    const myFeedback = allFeedback.filter((feedback) => myClassIds.includes(feedback.classId));
    const avgRating = myFeedback.length > 0
      ? parseFloat(
          (
            myFeedback.reduce((accumulator, feedback) => accumulator + (feedback.rating ?? 0), 0)
            / myFeedback.length
          ).toFixed(1),
        )
      : null;

    const rankingScore = Math.round(
      uniqueStudents * 3
      + myTests.length * 12
      + myTestSubs.length * 2
      + myFeedback.length * 4
      + (avgRating ?? 0) * 8
      + (avgScore ?? 0) / 4,
    );

    return {
      id: teacher.id,
      fullName: teacher.fullName,
      username: teacher.username,
      subject: teacher.subject ?? null,
      email: teacher.email ?? null,
      status: teacher.status,
      uniqueStudents,
      testsCount: myTests.length,
      testSubmissions: myTestSubs.length,
      avgScore,
      avgRating,
      feedbackCount: myFeedback.length,
      rankingScore,
    };
  });

  result.sort((a, b) => b.rankingScore - a.rankingScore);

  res.json(result);
});

export { router as teacherPerformanceRouter };
