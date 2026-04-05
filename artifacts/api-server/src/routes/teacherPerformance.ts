import { Router } from "express";
import {
  db, usersTable, classesTable, enrollmentsTable,
  testsTable, assignmentsTable, attendanceTable,
  testSubmissionsTable, assignmentSubmissionsTable,
  feedbackTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const router = Router();

router.get("/teacher-performance", async (req, res): Promise<void> => {
  const userId = req.cookies?.userId;
  const userRole = req.cookies?.userRole;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (userRole !== "super_admin") { res.status(403).json({ error: "Forbidden" }); return; }

  /* --- 1. Fetch all teachers (admins) --- */
  const teachers = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.role, "admin"));

  if (teachers.length === 0) { res.json([]); return; }

  const teacherIds = teachers.map((t) => t.id);

  /* --- 2. Fetch all related data in parallel --- */
  const [
    allClasses,
    allFeedback,
  ] = await Promise.all([
    db.select().from(classesTable).where(inArray(classesTable.adminId, teacherIds)),
    db.select().from(feedbackTable),
  ]);

  const classIds = allClasses.map((c) => c.id);

  const [
    allEnrollments,
    allTests,
    allAssignments,
    allAttendance,
  ] = classIds.length > 0
    ? await Promise.all([
        db.select().from(enrollmentsTable).where(inArray(enrollmentsTable.classId, classIds)),
        db.select().from(testsTable).where(inArray(testsTable.classId, classIds)),
        db.select().from(assignmentsTable).where(inArray(assignmentsTable.classId, classIds)),
        db.select().from(attendanceTable).where(inArray(attendanceTable.classId, classIds)),
      ])
    : [[], [], [], []];

  const testIds = allTests.map((t) => t.id);
  const assignmentIds = allAssignments.map((a) => a.id);

  const [testSubs, assignSubs] = await Promise.all([
    testIds.length > 0
      ? db.select().from(testSubmissionsTable).where(inArray(testSubmissionsTable.testId, testIds))
      : [],
    assignmentIds.length > 0
      ? db.select().from(assignmentSubmissionsTable).where(inArray(assignmentSubmissionsTable.assignmentId, assignmentIds))
      : [],
  ]);

  /* --- 3. Aggregate per teacher --- */
  const result = teachers.map((teacher) => {
    const myClasses = allClasses.filter((c) => c.adminId === teacher.id);
    const myClassIds = myClasses.map((c) => c.id);

    const myEnrollments = allEnrollments.filter((e) => myClassIds.includes(e.classId));
    const uniqueStudents = new Set(myEnrollments.map((e) => e.studentId)).size;

    const myTests = allTests.filter((t) => myClassIds.includes(t.classId));
    const myTestIds = myTests.map((t) => t.id);

    const myAssignments = allAssignments.filter((a) => myClassIds.includes(a.classId));
    const myAssignmentIds = myAssignments.map((a) => a.id);

    // Attendance sessions taken (distinct date+classId combos)
    const myAttendance = allAttendance.filter((a) => myClassIds.includes(a.classId));
    const attendanceSessions = new Set(myAttendance.map((a) => `${a.classId}-${a.date}`)).size;

    // Test submissions graded (submissions to their tests that have a score)
    const myTestSubs = testSubs.filter((s) => myTestIds.includes(s.testId));
    const gradedSubs = myTestSubs.filter((s) => s.score !== null && s.totalPoints && s.totalPoints > 0);
    const avgScore = gradedSubs.length > 0
      ? Math.round(gradedSubs.reduce((acc, s) => acc + ((s.score! / s.totalPoints!) * 100), 0) / gradedSubs.length)
      : null;

    // Assignment submissions received
    const myAssignSubs = assignSubs.filter((s) => myAssignmentIds.includes(s.assignmentId));

    // Student feedback for their classes
    const myFeedback = allFeedback.filter((f) => myClassIds.includes(f.classId));
    const avgRating = myFeedback.length > 0
      ? parseFloat((myFeedback.reduce((acc, f) => acc + (f.rating ?? 0), 0) / myFeedback.length).toFixed(1))
      : null;

    // Live vs scheduled vs completed class breakdown
    const liveClasses = myClasses.filter((c) => c.status === "live").length;
    const completedClasses = myClasses.filter((c) => c.status === "completed").length;

    // Workload score: weighted composite
    const score =
      myClasses.length * 10 +
      uniqueStudents * 2 +
      myTests.length * 8 +
      myAssignments.length * 5 +
      attendanceSessions * 3 +
      myTestSubs.length * 1 +
      myAssignSubs.length * 1 +
      completedClasses * 6 +
      liveClasses * 4;

    return {
      id: teacher.id,
      fullName: teacher.fullName,
      username: teacher.username,
      subject: teacher.subject ?? null,
      email: teacher.email ?? null,
      status: teacher.status,
      // Core metrics
      classesCount: myClasses.length,
      uniqueStudents,
      testsCount: myTests.length,
      assignmentsCount: myAssignments.length,
      attendanceSessions,
      liveClasses,
      completedClasses,
      // Submission metrics
      testSubmissions: myTestSubs.length,
      assignmentSubmissions: myAssignSubs.length,
      // Quality metrics
      avgScore,
      avgRating,
      feedbackCount: myFeedback.length,
      // Composite workload score
      workloadScore: score,
    };
  });

  // Sort by workload score descending
  result.sort((a, b) => b.workloadScore - a.workloadScore);

  res.json(result);
});

export { router as teacherPerformanceRouter };
