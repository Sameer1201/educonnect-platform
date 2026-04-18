import { Router, type IRouter } from "express";
import {
  db, testsTable, testSubmissionsTable, usersTable, enrollmentsTable,
  classesTable, assignmentsTable, assignmentSubmissionsTable, attendanceTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const router: IRouter = Router();
type AssignmentSubmissionRow = typeof assignmentSubmissionsTable.$inferSelect;
type AttendanceRow = typeof attendanceTable.$inferSelect;

function getUser(req: any) {
  const userId = req.cookies?.userId ? parseInt(req.cookies.userId, 10) : null;
  const userRole = req.cookies?.userRole ?? null;
  return { userId, userRole };
}

router.get("/analytics", async (req, res): Promise<void> => {
  const { userId, userRole } = getUser(req);
  if (!userId || (userRole !== "admin" && userRole !== "super_admin")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  let allClasses = userRole === "admin"
    ? await db.select().from(classesTable).where(eq(classesTable.adminId, userId))
    : await db.select().from(classesTable);

  const classIds = allClasses.map((c) => c.id);
  if (classIds.length === 0) {
    res.json({
      summary: { totalClasses: 0, totalStudents: 0, totalTests: 0, totalSubmissions: 0, avgScore: 0, passRate: 0, submissionRate: 0 },
      scoreDistribution: [],
      classMetrics: [],
      testMetrics: [],
      topStudents: [],
      bottomStudents: [],
      assignmentMetrics: [],
      attendanceSummary: [],
      weeklyActivity: [],
    });
    return;
  }

  const [enrollments, tests, allAssignments] = await Promise.all([
    db.select().from(enrollmentsTable).where(inArray(enrollmentsTable.classId, classIds)),
    db.select().from(testsTable).where(inArray(testsTable.classId, classIds)),
    db.select().from(assignmentsTable).where(inArray(assignmentsTable.classId, classIds)),
  ]);

  const testIds = tests.map((t) => t.id);
  const assignmentIds = allAssignments.map((a) => a.id);

  const [testSubs, assignSubs, attendRecords] = await Promise.all([
    testIds.length
      ? db.select().from(testSubmissionsTable).where(inArray(testSubmissionsTable.testId, testIds))
      : Promise.resolve<typeof testSubmissionsTable.$inferSelect[]>([]),
    assignmentIds.length
      ? db.select().from(assignmentSubmissionsTable).where(inArray(assignmentSubmissionsTable.assignmentId, assignmentIds))
      : Promise.resolve<AssignmentSubmissionRow[]>([]),
    classIds.length
      ? db.select().from(attendanceTable).where(inArray(attendanceTable.classId, classIds))
      : Promise.resolve<AttendanceRow[]>([]),
  ]);

  const uniqueStudentIds = [...new Set(enrollments.map((e) => e.studentId))];
  const completedSubs = testSubs.filter((s) => s.score !== null && s.totalPoints !== null && s.totalPoints > 0);

  const avgScore = completedSubs.length > 0
    ? Math.round(completedSubs.reduce((sum, s) => sum + ((s.score! / s.totalPoints!) * 100), 0) / completedSubs.length)
    : 0;
  const passedSubs = testSubs.filter((s) => s.passed).length;
  const passRate = testSubs.length > 0 ? Math.round((passedSubs / testSubs.length) * 100) : 0;

  const expectedSubs = enrollments.length * tests.length;
  const submissionRate = expectedSubs > 0 ? Math.round((testSubs.length / expectedSubs) * 100) : 0;

  const ranges = [
    { range: "0–20%", min: 0, max: 20, count: 0 },
    { range: "21–40%", min: 21, max: 40, count: 0 },
    { range: "41–60%", min: 41, max: 60, count: 0 },
    { range: "61–80%", min: 61, max: 80, count: 0 },
    { range: "81–100%", min: 81, max: 100, count: 0 },
  ];
  for (const s of completedSubs) {
    const pct = (s.score! / s.totalPoints!) * 100;
    const bucket = ranges.find((r) => pct >= r.min && pct <= r.max);
    if (bucket) bucket.count++;
  }
  const scoreDistribution = ranges.map(({ range, count }) => ({ range, count }));

  const classMetrics = allClasses.map((cls) => {
    const clsEnroll = enrollments.filter((e) => e.classId === cls.id);
    const clsTests = tests.filter((t) => t.classId === cls.id);
    const clsTestIds = clsTests.map((t) => t.id);
    const clsSubs = testSubs.filter((s) => clsTestIds.includes(s.testId) && s.score !== null && s.totalPoints && s.totalPoints > 0);
    const clsAvg = clsSubs.length > 0
      ? Math.round(clsSubs.reduce((sum, s) => sum + (s.score! / s.totalPoints!) * 100, 0) / clsSubs.length)
      : null;
    return {
      id: cls.id, title: cls.title, subject: cls.subject,
      enrolledCount: clsEnroll.length, testCount: clsTests.length,
      submissionCount: clsSubs.length, avgScore: clsAvg,
    };
  });

  const testMetrics = tests.map((t) => {
    const subs = testSubs.filter((s) => s.testId === t.id);
    const scored = subs.filter((s) => s.score !== null && s.totalPoints && s.totalPoints > 0);
    const avg = scored.length > 0
      ? Math.round(scored.reduce((sum, s) => sum + (s.score! / s.totalPoints!) * 100, 0) / scored.length)
      : null;
    const pass = subs.length > 0 ? Math.round((subs.filter((s) => s.passed).length / subs.length) * 100) : null;
    const cls = allClasses.find((c) => c.id === t.classId);
    return {
      id: t.id, title: t.title, className: cls?.title ?? "—",
      totalSubmissions: subs.length, avgScore: avg, passRate: pass,
    };
  });

  const scoreByStudent = new Map<number, { total: number; count: number }>();
  for (const s of completedSubs) {
    const pct = (s.score! / s.totalPoints!) * 100;
    const ex = scoreByStudent.get(s.studentId) ?? { total: 0, count: 0 };
    ex.total += pct; ex.count += 1;
    scoreByStudent.set(s.studentId, ex);
  }
  const rankedStudents = [...scoreByStudent.entries()]
    .map(([id, v]) => ({ id, avg: Math.round(v.total / v.count) }))
    .sort((a, b) => b.avg - a.avg);

  const topIds = rankedStudents.slice(0, 8).map((s) => s.id);
  const bottomIds = rankedStudents.slice(-5).reverse().map((s) => s.id);
  const allFetchIds = [...new Set([...topIds, ...bottomIds])];
  const studentUsers = allFetchIds.length
    ? await db.select({ id: usersTable.id, fullName: usersTable.fullName, username: usersTable.username })
        .from(usersTable).where(inArray(usersTable.id, allFetchIds))
    : [];

  const topStudents = topIds.map((id) => ({
    ...studentUsers.find((u) => u.id === id)!,
    avgScore: rankedStudents.find((s) => s.id === id)!.avg,
  })).filter((s) => s.id);
  const bottomStudents = bottomIds.map((id) => ({
    ...studentUsers.find((u) => u.id === id)!,
    avgScore: rankedStudents.find((s) => s.id === id)!.avg,
  })).filter((s) => s.id);

  const assignmentMetrics = allAssignments.map((a) => {
    const subs = assignSubs.filter((s) => s.assignmentId === a.id);
    const graded = subs.filter((s) => s.grade !== null);
    const cls = allClasses.find((c) => c.id === a.classId);
    const enrolled = enrollments.filter((e) => e.classId === a.classId).length;
    const avgGrade = graded.length > 0
      ? Math.round(graded.reduce((sum, s) => sum + Number(s.grade), 0) / graded.length)
      : null;
    return {
      id: a.id, title: a.title, className: cls?.title ?? "—",
      totalEnrolled: enrolled, submissionCount: subs.length, gradedCount: graded.length,
      avgGrade, submissionRate: enrolled > 0 ? Math.round((subs.length / enrolled) * 100) : 0,
    };
  });

  const attendanceByClass = allClasses.map((cls) => {
    const records = attendRecords.filter((r) => r.classId === cls.id);
    const present = records.filter((r) => r.status === "present").length;
    const rate = records.length > 0 ? Math.round((present / records.length) * 100) : null;
    return { classId: cls.id, className: cls.title, total: records.length, present, rate };
  }).filter((a) => a.total > 0);

  res.json({
    summary: {
      totalClasses: classIds.length, totalStudents: uniqueStudentIds.length,
      totalTests: tests.length, totalSubmissions: testSubs.length,
      avgScore, passRate, submissionRate,
    },
    scoreDistribution,
    classMetrics,
    testMetrics,
    topStudents,
    bottomStudents,
    assignmentMetrics,
    attendanceSummary: attendanceByClass,
  });
});

export default router;
