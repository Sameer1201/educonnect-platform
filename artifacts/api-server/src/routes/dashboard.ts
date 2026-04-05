import { Router, type IRouter } from "express";
import { db, usersTable, classesTable, enrollmentsTable, testsTable, testSubmissionsTable, assignmentsTable, communityPostsTable, supportTicketsTable } from "@workspace/db";
import { eq, count, sql, and, inArray, notInArray, gte } from "drizzle-orm";

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

router.get("/dashboard/super-admin", async (req, res): Promise<void> => {
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

router.get("/dashboard/admin", async (req, res): Promise<void> => {
  const userIdCookie = req.cookies?.userId;
  const adminId = userIdCookie ? parseInt(userIdCookie, 10) : null;

  let classes = await db.select().from(classesTable).orderBy(classesTable.scheduledAt);
  if (adminId) {
    classes = classes.filter((c) => c.adminId === adminId);
  }

  const allStudents = await db.select().from(usersTable).where(eq(usersTable.role, "student")).orderBy(usersTable.createdAt);
  const pendingStudents = allStudents.filter((u) => u.status === "pending");
  const liveClasses = classes.filter((c) => c.status === "live");
  const upcomingClasses = classes.filter((c) => c.status === "scheduled");

  const serializedUpcoming = await Promise.all(upcomingClasses.slice(0, 5).map(serializeClass));
  const recentStudents = allStudents.slice(-5).reverse();

  const enrollments = await db.select().from(enrollmentsTable);
  const myClassIds = new Set(classes.map((c) => c.id));
  const myEnrollments = enrollments.filter((e) => myClassIds.has(e.classId));
  const uniqueStudentIds = new Set(myEnrollments.map((e) => e.studentId));

  res.json({
    totalClasses: classes.length,
    liveClasses: liveClasses.length,
    totalStudents: uniqueStudentIds.size,
    pendingStudents: pendingStudents.length,
    upcomingClasses: serializedUpcoming,
    recentStudents: recentStudents.map(serializeUser),
  });
});

router.get("/dashboard/student", async (req, res): Promise<void> => {
  const userIdCookie = req.cookies?.userId;
  const studentId = userIdCookie ? parseInt(userIdCookie, 10) : null;

  const allClasses = await db.select().from(classesTable).orderBy(classesTable.scheduledAt);
  const liveClasses = allClasses.filter((c) => c.status === "live");
  const upcomingClasses = allClasses.filter((c) => c.status === "scheduled");
  const availableClasses = allClasses.filter((c) => c.status !== "cancelled");

  let enrolledClasses: typeof allClasses = [];
  let pendingTests: { id: number; title: string; description: string | null; durationMinutes: number | null; scheduledAt: string | null; className: string | null; classId: number | null }[] = [];

  if (studentId) {
    const myEnrollments = await db
      .select()
      .from(enrollmentsTable)
      .where(eq(enrollmentsTable.studentId, studentId));
    const enrolledIds = new Set(myEnrollments.map((e) => e.classId));
    enrolledClasses = allClasses.filter((c) => enrolledIds.has(c.id));

    // Get published tests for enrolled classes
    if (enrolledIds.size > 0) {
      const enrolledClassIds = [...enrolledIds];
      const publishedTests = await db
        .select({
          id: testsTable.id,
          title: testsTable.title,
          description: testsTable.description,
          durationMinutes: testsTable.durationMinutes,
          scheduledAt: testsTable.scheduledAt,
          classId: testsTable.classId,
          className: classesTable.title,
        })
        .from(testsTable)
        .leftJoin(classesTable, eq(testsTable.classId, classesTable.id))
        .where(and(eq(testsTable.isPublished, true), inArray(testsTable.classId, enrolledClassIds)));

      // Filter out already-submitted tests
      const submissions = await db
        .select({ testId: testSubmissionsTable.testId })
        .from(testSubmissionsTable)
        .where(eq(testSubmissionsTable.studentId, studentId));
      const submittedIds = new Set(submissions.map((s) => s.testId));

      pendingTests = publishedTests
        .filter((t) => !submittedIds.has(t.id))
        .map((t) => ({
          ...t,
          scheduledAt: t.scheduledAt?.toISOString() ?? null,
        }));
    }
  }

  const serializedUpcoming = await Promise.all(upcomingClasses.slice(0, 5).map(serializeClass));
  const serializedAvailable = await Promise.all(availableClasses.slice(0, 10).map(serializeClass));

  res.json({
    enrolledClasses: enrolledClasses.length,
    liveClasses: liveClasses.length,
    upcomingClasses: serializedUpcoming,
    availableClasses: serializedAvailable,
    pendingTests,
  });
});

router.get("/dashboard/hr", async (req, res): Promise<void> => {
  const allUsers = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  const allClasses = await db.select().from(classesTable).orderBy(classesTable.createdAt);
  const allEnrollments = await db.select().from(enrollmentsTable);

  const teachers = allUsers.filter((u) => u.role === "admin");
  const students = allUsers.filter((u) => u.role === "student");

  const teacherStats = teachers.map((teacher) => {
    const teacherClasses = allClasses.filter((c) => c.adminId === teacher.id);
    const teacherClassIds = new Set(teacherClasses.map((c) => c.id));
    const teacherEnrollments = allEnrollments.filter((e) => teacherClassIds.has(e.classId));
    const uniqueStudents = new Set(teacherEnrollments.map((e) => e.studentId));
    const liveClasses = teacherClasses.filter((c) => c.status === "live");

    return {
      id: teacher.id,
      fullName: teacher.fullName,
      username: teacher.username,
      email: teacher.email,
      subject: teacher.subject ?? null,
      classCount: teacherClasses.length,
      studentCount: uniqueStudents.size,
      liveClasses: liveClasses.length,
    };
  });

  const studentEnrollmentCounts = students.map((student) => {
    const enrolledCount = allEnrollments.filter((e) => e.studentId === student.id).length;
    return { id: student.id, fullName: student.fullName, username: student.username, enrolledCount };
  });
  const topStudentsByEnrollment = studentEnrollmentCounts.sort((a, b) => b.enrolledCount - a.enrolledCount).slice(0, 10);

  const avgClassesPerTeacher = teachers.length > 0
    ? allClasses.filter((c) => c.adminId !== null).length / teachers.length
    : 0;

  res.json({
    totalTeachers: teachers.length,
    totalStudents: students.length,
    totalClasses: allClasses.length,
    avgClassesPerTeacher: Math.round(avgClassesPerTeacher * 10) / 10,
    teacherStats,
    topStudentsByEnrollment,
  });
});

export default router;
