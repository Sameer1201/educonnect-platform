import { Router, type IRouter } from "express";
import {
  db,
  usersTable,
  classesTable,
  enrollmentsTable,
  testsTable,
  testSubmissionsTable,
  assignmentsTable,
  assignmentSubmissionsTable,
  attendanceTable,
  communityPostsTable,
  supportTicketsTable,
  chaptersTable,
  subjectsTable,
} from "@workspace/db";
import { eq, count, and, inArray, desc } from "drizzle-orm";

const router: IRouter = Router();

function serializeUser(user: typeof usersTable.$inferSelect) {
  const { passwordHash, ...rest } = user;
  void passwordHash;
  return rest;
}

async function getEnrolledCount(classId: number): Promise<number> {
  const [result] = await db
    .select({ count: count() })
    .from(enrollmentsTable)
    .where(eq(enrollmentsTable.classId, classId));
  return result?.count ?? 0;
}

async function serializeClass(cls: typeof classesTable.$inferSelect) {
  const enrolledCount = await getEnrolledCount(cls.id);
  const [admin] = await db.select({ fullName: usersTable.fullName }).from(usersTable).where(eq(usersTable.id, cls.adminId));
  return {
    ...cls,
    enrolledCount,
    adminName: admin?.fullName ?? null,
    scheduledAt: cls.scheduledAt?.toISOString() ?? null,
    startedAt: cls.startedAt?.toISOString() ?? null,
    endedAt: cls.endedAt?.toISOString() ?? null,
  };
}

function normalizeExamKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;

  const compact = raw.replace(/[^a-z0-9]+/g, " ").trim();
  if (compact.includes("iit jam")) return "iit-jam";
  if (compact.includes("jee main")) return "jee";
  if (compact === "jee") return "jee";
  if (compact.includes("gate")) return "gate";
  if (compact.includes("cuet")) return "cuet";
  if (compact.includes("neet")) return "neet";
  if (compact.includes("cat")) return "cat";
  return compact.replace(/\s+/g, "-");
}

function toIsoString(value: Date | null | undefined) {
  return value?.toISOString() ?? null;
}

function getTimeValue(value: Date | null | undefined) {
  return value ? value.getTime() : Number.POSITIVE_INFINITY;
}

router.get("/dashboard/super-admin", async (_req, res): Promise<void> => {
  const [allUsers, allClasses, allEnrollments, allTests, allAssignments, allTickets, allPosts] = await Promise.all([
    db.select().from(usersTable).orderBy(usersTable.createdAt),
    db.select().from(classesTable).orderBy(classesTable.createdAt),
    db.select().from(enrollmentsTable),
    db.select().from(testsTable),
    db.select().from(assignmentsTable),
    db.select().from(supportTicketsTable),
    db.select({ id: communityPostsTable.id, createdAt: communityPostsTable.createdAt }).from(communityPostsTable),
  ]);

  const admins = allUsers.filter((u) => u.role === "admin");
  const students = allUsers.filter((u) => u.role === "student");
  const pendingStudents = students.filter((u) => u.status === "pending");
  const approvedStudents = students.filter((u) => u.status === "approved");
  const liveClasses = allClasses.filter((c) => c.status === "live");
  const completedClasses = allClasses.filter((c) => c.status === "completed");
  const scheduledClasses = allClasses.filter((c) => c.status === "scheduled");
  const openTickets = allTickets.filter((t) => t.status === "open");

  const recentAdmins = [...admins].reverse().slice(0, 5);
  const recentStudents = [...students].reverse().slice(0, 5);

  // Sign-ups for the last 7 days
  const now = new Date();
  const signupTrend: { date: string; students: number; admins: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayStart = new Date(dateStr + "T00:00:00Z");
    const dayEnd = new Date(dateStr + "T23:59:59Z");
    signupTrend.push({
      date: dateStr,
      students: students.filter((u) => u.createdAt && u.createdAt >= dayStart && u.createdAt <= dayEnd).length,
      admins: admins.filter((u) => u.createdAt && u.createdAt >= dayStart && u.createdAt <= dayEnd).length,
    });
  }

  // Class activity by status
  const classBreakdown = [
    { label: "Scheduled", value: scheduledClasses.length, color: "#6366f1" },
    { label: "Live", value: liveClasses.length, color: "#ef4444" },
    { label: "Completed", value: completedClasses.length, color: "#10b981" },
  ];

  // Top teachers by class count
  const teacherStats = admins.map((t) => {
    const myClasses = allClasses.filter((c) => c.adminId === t.id);
    const myClassIds = myClasses.map((c) => c.id);
    const myStudents = new Set(allEnrollments.filter((e) => myClassIds.includes(e.classId)).map((e) => e.studentId)).size;
    return {
      id: t.id,
      fullName: t.fullName,
      subject: t.subject ?? null,
      classesCount: myClasses.length,
      studentsCount: myStudents,
    };
  }).sort((a, b) => b.classesCount - a.classesCount).slice(0, 4);

  res.json({
    totalAdmins: admins.length,
    totalStudents: students.length,
    approvedStudents: approvedStudents.length,
    pendingStudents: pendingStudents.length,
    totalClasses: allClasses.length,
    liveClasses: liveClasses.length,
    completedClasses: completedClasses.length,
    scheduledClasses: scheduledClasses.length,
    totalEnrollments: allEnrollments.length,
    totalTests: allTests.length,
    totalAssignments: allAssignments.length,
    openTickets: openTickets.length,
    communityPosts: allPosts.length,
    recentAdmins: recentAdmins.map(serializeUser),
    recentStudents: recentStudents.map(serializeUser),
    pendingApprovals: pendingStudents.map(serializeUser),
    signupTrend,
    classBreakdown,
    topTeachers: teacherStats,
  });
});

router.get("/dashboard/student", async (req, res): Promise<void> => {
  const userIdCookie = req.cookies?.userId;
  const studentId = userIdCookie ? parseInt(userIdCookie, 10) : null;

  if (!studentId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [student] = await db.select().from(usersTable).where(eq(usersTable.id, studentId));
  if (!student) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (student.role !== "student") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const now = new Date();
  const [allClasses, myEnrollments, attendanceRecords, studentSubmissions] = await Promise.all([
    db.select().from(classesTable).orderBy(classesTable.scheduledAt),
    db.select().from(enrollmentsTable).where(eq(enrollmentsTable.studentId, studentId)),
    db.select().from(attendanceTable).where(eq(attendanceTable.studentId, studentId)),
    db
      .select({
        id: testSubmissionsTable.id,
        testId: testSubmissionsTable.testId,
        score: testSubmissionsTable.score,
        totalPoints: testSubmissionsTable.totalPoints,
        percentage: testSubmissionsTable.percentage,
        passed: testSubmissionsTable.passed,
        submittedAt: testSubmissionsTable.submittedAt,
        title: testsTable.title,
        className: classesTable.title,
        subjectName: subjectsTable.title,
        chapterName: chaptersTable.title,
      })
      .from(testSubmissionsTable)
      .leftJoin(testsTable, eq(testSubmissionsTable.testId, testsTable.id))
      .leftJoin(classesTable, eq(testsTable.classId, classesTable.id))
      .leftJoin(chaptersTable, eq(testsTable.chapterId, chaptersTable.id))
      .leftJoin(subjectsTable, eq(chaptersTable.subjectId, subjectsTable.id))
      .where(eq(testSubmissionsTable.studentId, studentId))
      .orderBy(desc(testSubmissionsTable.submittedAt), desc(testSubmissionsTable.id)),
  ]);

  const enrolledIds = new Set(myEnrollments.map((enrollment) => enrollment.classId));
  const enrolledClasses = allClasses.filter((cls) => enrolledIds.has(cls.id));
  const liveClassesNow = enrolledClasses.filter((cls) => cls.status === "live");
  const upcomingEnrolledClasses = [...enrolledClasses]
    .filter((cls) => cls.status === "scheduled")
    .sort((a, b) => getTimeValue(a.scheduledAt) - getTimeValue(b.scheduledAt));
  const availableClasses = [...allClasses]
    .filter((cls) => !enrolledIds.has(cls.id) && (cls.status === "scheduled" || cls.status === "live"))
    .sort((a, b) => getTimeValue(a.scheduledAt) - getTimeValue(b.scheduledAt));

  const studentExamKeys = new Set<string>();
  const primaryExamKey = normalizeExamKey(student.subject);
  if (primaryExamKey) studentExamKeys.add(primaryExamKey);
  for (const exam of student.additionalExams ?? []) {
    const key = normalizeExamKey(exam);
    if (key) studentExamKeys.add(key);
  }

  const visibleTests = studentExamKeys.size > 0
    ? (await db
        .select({
          id: testsTable.id,
          title: testsTable.title,
          description: testsTable.description,
          examType: testsTable.examType,
          durationMinutes: testsTable.durationMinutes,
          scheduledAt: testsTable.scheduledAt,
          classId: testsTable.classId,
          className: classesTable.title,
          subjectName: subjectsTable.title,
          chapterName: chaptersTable.title,
        })
        .from(testsTable)
        .leftJoin(classesTable, eq(testsTable.classId, classesTable.id))
        .leftJoin(chaptersTable, eq(testsTable.chapterId, chaptersTable.id))
        .leftJoin(subjectsTable, eq(chaptersTable.subjectId, subjectsTable.id))
        .where(eq(testsTable.isPublished, true))
        .orderBy(testsTable.scheduledAt))
        .filter((test) => {
          const examKey = normalizeExamKey(test.examType);
          return examKey ? studentExamKeys.has(examKey) : false;
        })
    : [];

  const submittedTestIds = new Set(studentSubmissions.map((submission) => submission.testId));
  const pendingTests = visibleTests
    .filter((test) => !submittedTestIds.has(test.id))
    .map((test) => ({
      id: test.id,
      title: test.title,
      description: test.description,
      durationMinutes: test.durationMinutes,
      scheduledAt: toIsoString(test.scheduledAt),
      classId: test.classId,
      className: test.className,
      subjectName: test.subjectName,
      chapterName: test.chapterName,
      status: test.scheduledAt && test.scheduledAt.getTime() > now.getTime() ? "upcoming" : "active",
    }))
    .slice(0, 5);

  const averageTestScore = studentSubmissions.length > 0
    ? Number((studentSubmissions.reduce((sum, submission) => sum + Number(submission.percentage ?? 0), 0) / studentSubmissions.length).toFixed(1))
    : null;
  const bestResult = studentSubmissions.length > 0
    ? studentSubmissions.reduce((best, submission) =>
      Number(submission.percentage ?? 0) > Number(best.percentage ?? 0) ? submission : best,
    )
    : null;

  const enrolledClassIds = [...enrolledIds];
  const assignments = enrolledClassIds.length > 0
    ? await db
        .select({
          id: assignmentsTable.id,
          title: assignmentsTable.title,
          description: assignmentsTable.description,
          dueAt: assignmentsTable.dueAt,
          maxMarks: assignmentsTable.maxMarks,
          classId: assignmentsTable.classId,
          className: classesTable.title,
        })
        .from(assignmentsTable)
        .leftJoin(classesTable, eq(assignmentsTable.classId, classesTable.id))
        .where(and(eq(assignmentsTable.isPublished, true), inArray(assignmentsTable.classId, enrolledClassIds)))
        .orderBy(assignmentsTable.dueAt)
    : [];

  const assignmentIds = assignments.map((assignment) => assignment.id);
  const assignmentSubmissions = assignmentIds.length > 0
    ? await db
        .select({
          assignmentId: assignmentSubmissionsTable.assignmentId,
        })
        .from(assignmentSubmissionsTable)
        .where(and(
          eq(assignmentSubmissionsTable.studentId, studentId),
          inArray(assignmentSubmissionsTable.assignmentId, assignmentIds),
        ))
    : [];
  const submittedAssignmentIds = new Set(assignmentSubmissions.map((submission) => submission.assignmentId));
  const pendingAssignments = assignments.filter((assignment) => !submittedAssignmentIds.has(assignment.id));
  const nextAssignmentCandidate = [...pendingAssignments].sort((a, b) => getTimeValue(a.dueAt) - getTimeValue(b.dueAt))[0] ?? null;

  const totalAttendanceSessions = attendanceRecords.length;
  const presentCount = attendanceRecords.filter((record) => record.status === "present").length;
  const lateCount = attendanceRecords.filter((record) => record.status === "late").length;
  const absentCount = attendanceRecords.filter((record) => record.status === "absent").length;

  const serializedLiveClasses = await Promise.all(liveClassesNow.slice(0, 3).map(serializeClass));
  const serializedUpcomingClasses = await Promise.all(upcomingEnrolledClasses.slice(0, 5).map(serializeClass));
  const serializedAvailableClasses = await Promise.all(availableClasses.slice(0, 6).map(serializeClass));

  res.json({
    enrolledClasses: enrolledClasses.length,
    liveClasses: liveClassesNow.length,
    availableClassesCount: availableClasses.length,
    totalVisibleTests: visibleTests.length,
    pendingTestsCount: visibleTests.filter((test) => !submittedTestIds.has(test.id)).length,
    completedTests: studentSubmissions.length,
    averageTestScore,
    attendance: {
      total: totalAttendanceSessions,
      present: presentCount,
      late: lateCount,
      absent: absentCount,
      percentage: totalAttendanceSessions > 0 ? Math.round((presentCount / totalAttendanceSessions) * 100) : 0,
    },
    assignmentSummary: {
      pending: pendingAssignments.length,
      overdue: pendingAssignments.filter((assignment) => assignment.dueAt && assignment.dueAt.getTime() < now.getTime()).length,
      submitted: submittedAssignmentIds.size,
    },
    bestResult: bestResult
      ? {
          testId: bestResult.testId,
          title: bestResult.title,
          percentage: Number(bestResult.percentage ?? 0),
          score: Number(bestResult.score ?? 0),
          totalPoints: bestResult.totalPoints,
        }
      : null,
    liveClassesNow: serializedLiveClasses,
    upcomingClasses: serializedUpcomingClasses,
    availableClasses: serializedAvailableClasses,
    pendingTests,
    recentResults: studentSubmissions.slice(0, 5).map((submission) => ({
      id: submission.id,
      testId: submission.testId,
      title: submission.title,
      submittedAt: toIsoString(submission.submittedAt),
      percentage: Number(submission.percentage ?? 0),
      score: Number(submission.score ?? 0),
      totalPoints: submission.totalPoints,
      passed: submission.passed,
      className: submission.className,
      subjectName: submission.subjectName,
      chapterName: submission.chapterName,
    })),
    nextAssignment: nextAssignmentCandidate
      ? {
          id: nextAssignmentCandidate.id,
          title: nextAssignmentCandidate.title,
          description: nextAssignmentCandidate.description,
          dueAt: toIsoString(nextAssignmentCandidate.dueAt),
          maxMarks: nextAssignmentCandidate.maxMarks,
          classId: nextAssignmentCandidate.classId,
          className: nextAssignmentCandidate.className,
          isOverdue: Boolean(nextAssignmentCandidate.dueAt && nextAssignmentCandidate.dueAt.getTime() < now.getTime()),
        }
      : null,
  });
});

export default router;
