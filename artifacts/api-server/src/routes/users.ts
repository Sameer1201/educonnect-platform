import { Router, type IRouter } from "express";
import {
  db,
  usersTable,
  classesTable,
  enrollmentsTable,
  feedbackTable,
  supportTicketsTable,
  supportTicketMessagesTable,
  whiteboardsTable,
  lecturePlansTable,
  attendanceTable,
  assignmentSubmissionsTable,
  testSubmissionsTable,
  lectureEnrollmentsTable,
  directMessagesTable,
  communityPostsTable,
  questionBankSavedQuestionsTable,
  questionBankQuestionProgressTable,
  questionBankReportsTable,
  passwordResetRequestsTable,
  notificationsTable,
  notificationPreferencesTable,
  userActivityLogs,
  userSessions,
  testsTable,
} from "@workspace/db";
import { desc, eq, or } from "drizzle-orm";
import {
  ListUsersQueryParams,
  CreateAdminBody,
  GetUserParams,
  UpdateUserParams,
  UpdateUserBody,
  DeleteUserParams,
  ApproveStudentParams,
  ApproveStudentBody,
} from "@workspace/api-zod";
import { hashPassword } from "../lib/auth";
import { autoEnrollStudentIntoMatchingClasses } from "../lib/batchAssignment";
import { queueStudentApprovedEmail } from "../lib/brevo";
import { createFirebaseEmailUser, deleteFirebaseUser, isFirebaseAdminConfigured } from "../lib/firebaseAdmin";

const router: IRouter = Router();

function serializeUser(user: typeof usersTable.$inferSelect) {
  const { passwordHash, ...rest } = user;
  void passwordHash;
  return rest;
}

function parseStudentProfileData(raw: string | null) {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toDateValue(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function roundMetric(value: number) {
  return Math.round(value * 10) / 10;
}

function requireAuth(req: any, res: any): number | null {
  const userIdCookie = req.cookies?.userId;
  if (!userIdCookie) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  const userId = parseInt(userIdCookie, 10);
  if (isNaN(userId)) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  return userId;
}

function requireRole(req: any, res: any, allowedRoles: string[]): string | null {
  const callerRole = req.cookies?.userRole;
  if (!callerRole) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  if (!allowedRoles.includes(callerRole)) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return callerRole;
}

router.get("/users", async (req, res): Promise<void> => {
  const callerRole = requireRole(req, res, ["super_admin", "admin"]);
  if (!callerRole) return;

  const params = ListUsersQueryParams.safeParse(req.query);

  let users = await db.select().from(usersTable).orderBy(usersTable.createdAt);

  if (params.success) {
    if (params.data.role) {
      users = users.filter((u) => u.role === params.data.role);
    }
    if (params.data.status) {
      users = users.filter((u) => u.status === params.data.status);
    }
  }

  res.json(users.map(serializeUser));
});

router.post("/users", async (req, res): Promise<void> => {
  const callerRole = requireRole(req, res, ["super_admin"]);
  if (!callerRole) return;

  const parsed = CreateAdminBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, password, fullName, email, subject } = parsed.data;
  const role = parsed.data.role ?? "admin";

  if (role !== "admin") {
    res.status(400).json({ error: "Only teacher accounts can be created from this panel" });
    return;
  }

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username));

  if (existing) {
    res.status(400).json({ error: "Username already taken" });
    return;
  }

  const [existingEmail] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email));

  if (existingEmail) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }

  let firebaseUid: string | null = null;

  try {
    if (isFirebaseAdminConfigured()) {
      const firebaseUser = await createFirebaseEmailUser({ email, password, fullName });
      firebaseUid = firebaseUser.uid;
    }

    const [newAdmin] = await db.insert(usersTable).values({
      username,
      passwordHash: hashPassword(password),
      fullName,
      email,
      subject: role === "admin" ? subject ?? null : null,
      role,
      status: "active",
    }).returning();

    res.status(201).json(serializeUser(newAdmin));
  } catch (error) {
    if (firebaseUid) {
      await deleteFirebaseUser(firebaseUid).catch(() => {});
    }
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to create teacher account",
    });
  }
});

router.get("/users/:id", async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, params.data.id));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(serializeUser(user));
});

router.get("/users/:id/profile-insights", async (req, res): Promise<void> => {
  const callerRole = requireRole(req, res, ["super_admin", "admin"]);
  if (!callerRole) return;

  const params = GetUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, params.data.id));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (user.role !== "student") {
    res.status(400).json({ error: "Insights are only available for student accounts" });
    return;
  }

  const [approver, submissions, savedQuestions, practiceProgress, activityLogs, sessions] = await Promise.all([
    user.approvedById
      ? db
        .select({ fullName: usersTable.fullName })
        .from(usersTable)
        .where(eq(usersTable.id, user.approvedById))
        .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    db
      .select({
        id: testSubmissionsTable.id,
        testId: testSubmissionsTable.testId,
        score: testSubmissionsTable.score,
        totalPoints: testSubmissionsTable.totalPoints,
        percentage: testSubmissionsTable.percentage,
        passed: testSubmissionsTable.passed,
        submittedAt: testSubmissionsTable.submittedAt,
        testTitle: testsTable.title,
      })
      .from(testSubmissionsTable)
      .leftJoin(testsTable, eq(testSubmissionsTable.testId, testsTable.id))
      .where(eq(testSubmissionsTable.studentId, user.id))
      .orderBy(desc(testSubmissionsTable.submittedAt), desc(testSubmissionsTable.id)),
    db
      .select({ id: questionBankSavedQuestionsTable.id })
      .from(questionBankSavedQuestionsTable)
      .where(eq(questionBankSavedQuestionsTable.studentId, user.id)),
    db
      .select()
      .from(questionBankQuestionProgressTable)
      .where(eq(questionBankQuestionProgressTable.studentId, user.id)),
    db
      .select()
      .from(userActivityLogs)
      .where(eq(userActivityLogs.userId, user.id))
      .orderBy(desc(userActivityLogs.createdAt))
      .limit(80),
    db
      .select()
      .from(userSessions)
      .where(eq(userSessions.userId, user.id))
      .orderBy(desc(userSessions.lastActiveAt))
      .limit(20),
  ]);

  const profileDetails = parseStudentProfileData(user.studentProfileData ?? null);
  const address = (profileDetails?.address && typeof profileDetails.address === "object"
    ? profileDetails.address
    : {}) as Record<string, unknown>;
  const preparation = (profileDetails?.preparation && typeof profileDetails.preparation === "object"
    ? profileDetails.preparation
    : {}) as Record<string, unknown>;
  const learningMode = (profileDetails?.learningMode && typeof profileDetails.learningMode === "object"
    ? profileDetails.learningMode
    : {}) as Record<string, unknown>;

  const completionSteps = [
    {
      key: "personal",
      label: "Personal details",
      complete: Boolean(user.fullName?.trim() && user.phone?.trim() && profileDetails?.dateOfBirth),
    },
    {
      key: "address",
      label: "Address",
      complete: Boolean(address.country && address.state && address.city && address.pincode),
    },
    {
      key: "preparation",
      label: "Schooling & target",
      complete: Boolean(preparation.classLevel && preparation.board && preparation.targetYear && preparation.targetExam),
    },
    {
      key: "learning",
      label: "Learning mode",
      complete: Boolean(learningMode.mode),
    },
    {
      key: "discovery",
      label: "Source",
      complete: Boolean(profileDetails?.hearAboutUs),
    },
  ];

  const completedSteps = completionSteps.filter((step) => step.complete).length;
  const completionPercent = Math.round((completedSteps / completionSteps.length) * 100);

  const accountCreatedAt = toDateValue(user.createdAt);
  const latestActivityDate = [
    toDateValue(activityLogs[0]?.createdAt),
    toDateValue(sessions[0]?.lastActiveAt),
    toDateValue(submissions[0]?.submittedAt),
  ]
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  const testsAttempted = submissions.length;
  const averageScore = testsAttempted > 0
    ? roundMetric(submissions.reduce((sum, submission) => sum + Number(submission.percentage ?? 0), 0) / testsAttempted)
    : 0;
  const bestScore = testsAttempted > 0
    ? roundMetric(Math.max(...submissions.map((submission) => Number(submission.percentage ?? 0))))
    : 0;
  const latestScore = testsAttempted > 0 ? roundMetric(Number(submissions[0]?.percentage ?? 0)) : 0;
  const passRate = testsAttempted > 0
    ? roundMetric((submissions.filter((submission) => submission.passed).length / testsAttempted) * 100)
    : 0;

  const totalPracticeAttempts = practiceProgress.reduce((sum, item) => sum + item.attemptCount, 0);
  const correctPracticeAttempts = practiceProgress.reduce((sum, item) => sum + item.correctCount, 0);
  const solvedQuestions = practiceProgress.filter((item) => Boolean(item.solvedAt) || item.lastIsCorrect).length;
  const practiceAccuracy = totalPracticeAttempts > 0
    ? roundMetric((correctPracticeAttempts / totalPracticeAttempts) * 100)
    : 0;

  const today = new Date();
  const activityTrend = Array.from({ length: 7 }, (_, index) => {
    const current = new Date(today);
    current.setHours(0, 0, 0, 0);
    current.setDate(today.getDate() - (6 - index));
    const next = new Date(current);
    next.setDate(current.getDate() + 1);
    const count = activityLogs.filter((entry) => {
      const createdAt = toDateValue(entry.createdAt);
      return createdAt ? createdAt >= current && createdAt < next : false;
    }).length;
    return {
      label: current.toLocaleDateString("en-US", { weekday: "short" }),
      count,
      date: current.toISOString(),
    };
  });

  const activityBuckets = activityLogs.reduce<Record<string, number>>((acc, entry) => {
    const page = (entry.page ?? "").toLowerCase();
    const action = (entry.action ?? "").toLowerCase();
    const bucket = page.includes("question-bank") || action.includes("question")
      ? "Question Bank"
      : page.includes("/student/tests") || action.includes("test")
        ? "Tests"
        : page.includes("analysis")
          ? "Analysis"
          : "Other";
    acc[bucket] = (acc[bucket] ?? 0) + 1;
    return acc;
  }, {});

  const activityBreakdown = [
    { name: "Tests", value: activityBuckets.Tests ?? 0 },
    { name: "Question Bank", value: activityBuckets["Question Bank"] ?? 0 },
    { name: "Analysis", value: activityBuckets.Analysis ?? 0 },
    { name: "Other", value: activityBuckets.Other ?? 0 },
  ].filter((item) => item.value > 0);

  const recentActivity = activityLogs.slice(0, 8).map((entry) => ({
    id: entry.id,
    action: entry.action,
    page: entry.page,
    detail: entry.detail,
    createdAt: entry.createdAt,
  }));

  const scoreTrend = submissions
    .slice(0, 8)
    .reverse()
    .map((submission, index) => ({
      label: `T${index + 1}`,
      title: submission.testTitle ?? `Test #${submission.testId}`,
      percentage: roundMetric(Number(submission.percentage ?? 0)),
      score: roundMetric(Number(submission.score ?? 0)),
      totalPoints: submission.totalPoints,
      submittedAt: submission.submittedAt,
      passed: submission.passed,
    }));

  res.json({
    student: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      status: user.status,
      subject: user.subject,
      additionalExams: user.additionalExams ?? [],
      avatarUrl: user.avatarUrl,
      onboardingComplete: user.onboardingComplete,
      approvedAt: user.approvedAt,
      approverName: approver?.fullName ?? null,
      createdAt: user.createdAt,
      profileDetails,
    },
    overview: {
      testsAttempted,
      averageScore,
      bestScore,
      latestScore,
      passRate,
      savedQuestions: savedQuestions.length,
      solvedQuestions,
      trackedPracticeQuestions: practiceProgress.length,
      practiceAccuracy,
      totalPracticeAttempts,
      activeDaysLast7: activityTrend.filter((item) => item.count > 0).length,
      accountAgeDays: accountCreatedAt
        ? Math.max(1, Math.ceil((today.getTime() - accountCreatedAt.getTime()) / (1000 * 60 * 60 * 24)))
        : 0,
      lastActiveAt: latestActivityDate?.toISOString() ?? null,
    },
    profileCompletion: {
      percent: completionPercent,
      completedSteps,
      totalSteps: completionSteps.length,
      steps: completionSteps,
    },
    scoreTrend,
    activityTrend,
    activityBreakdown,
    recentActivity,
    preparationSnapshot: {
      dateOfBirth: profileDetails?.dateOfBirth ?? null,
      whatsappOnSameNumber: profileDetails?.whatsappOnSameNumber === true,
      address: {
        country: typeof address.country === "string" ? address.country : "",
        state: typeof address.state === "string" ? address.state : "",
        city: typeof address.city === "string" ? address.city : "",
        pincode: typeof address.pincode === "string" ? address.pincode : "",
      },
      preparation: {
        classLevel: typeof preparation.classLevel === "string" ? preparation.classLevel : "",
        board: typeof preparation.board === "string" ? preparation.board : "",
        targetYear: typeof preparation.targetYear === "string" ? preparation.targetYear : "",
        targetExam: typeof preparation.targetExam === "string" ? preparation.targetExam : "",
      },
      learningMode: {
        mode: typeof learningMode.mode === "string" ? learningMode.mode : "",
        provider: typeof learningMode.provider === "string" ? learningMode.provider : "",
      },
      hearAboutUs: typeof profileDetails?.hearAboutUs === "string" ? profileDetails.hearAboutUs : "",
    },
  });
});

router.patch("/users/:id", async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateUserBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const callerRole = req.cookies?.userRole;
  if (!callerRole || (callerRole !== "super_admin" && callerRole !== "admin")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (body.data.fullName != null) updateData.fullName = body.data.fullName;
  if (body.data.email != null) updateData.email = body.data.email;
  if (body.data.phone !== undefined) updateData.phone = body.data.phone;
  if (body.data.subject !== undefined) updateData.subject = body.data.subject;

  const newPassword = (req.body as any).newPassword;
  if (typeof newPassword === "string" && newPassword.trim().length >= 6) {
    updateData.passwordHash = hashPassword(newPassword.trim());
    updateData.mustChangePassword = !!(req.body as any).forcePasswordChange;
  }

  const [updated] = await db
    .update(usersTable)
    .set(updateData)
    .where(eq(usersTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(serializeUser(updated));
});

router.get("/password-reset-requests", async (req, res): Promise<void> => {
  const callerRole = requireRole(req, res, ["super_admin", "admin"]);
  if (!callerRole) return;

  const requests = await db.select().from(passwordResetRequestsTable).orderBy(desc(passwordResetRequestsTable.createdAt));
  res.json(requests);
});

router.patch("/password-reset-requests/:id/resolve", async (req, res): Promise<void> => {
  const callerRole = requireRole(req, res, ["super_admin", "admin"]);
  if (!callerRole) return;
  const resolverId = requireAuth(req, res);
  if (!resolverId) return;

  const requestId = parseInt(req.params.id, 10);
  const temporaryPassword = typeof req.body?.temporaryPassword === "string" ? req.body.temporaryPassword.trim() : "";
  if (isNaN(requestId) || temporaryPassword.length < 6) {
    res.status(400).json({ error: "A temporary password of at least 6 characters is required" });
    return;
  }

  const [requestRow] = await db.select().from(passwordResetRequestsTable).where(eq(passwordResetRequestsTable.id, requestId));
  if (!requestRow) {
    res.status(404).json({ error: "Reset request not found" });
    return;
  }

  await db.update(usersTable)
    .set({ passwordHash: hashPassword(temporaryPassword), mustChangePassword: true })
    .where(eq(usersTable.id, requestRow.userId));

  const [updatedRequest] = await db.update(passwordResetRequestsTable)
    .set({ status: "resolved", resolvedBy: resolverId, resolutionNote: "Temporary password issued" })
    .where(eq(passwordResetRequestsTable.id, requestId))
    .returning();

  res.json(updatedRequest);
});

router.delete("/users/:id", async (req, res): Promise<void> => {
  const callerRole = requireRole(req, res, ["super_admin", "admin"]);
  if (!callerRole) return;

  const params = DeleteUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = params.data.id;

  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then((r) => r[0]);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (callerRole === "admin" && user.role !== "student") {
    res.status(403).json({ error: "Admins can only permanently delete student accounts" });
    return;
  }

  // Cascade delete: remove all related records before deleting the user
  if (user.role === "admin") {
    await db.delete(lecturePlansTable).where(eq(lecturePlansTable.teacherId, userId));
    // Get all classes owned by this admin
    const adminClasses = await db.select({ id: classesTable.id }).from(classesTable).where(eq(classesTable.adminId, userId));
    const classIds = adminClasses.map((c) => c.id);

    for (const classId of classIds) {
      // Delete feedback for this class
      await db.delete(feedbackTable).where(eq(feedbackTable.classId, classId));
      // Delete enrollments for this class
      await db.delete(enrollmentsTable).where(eq(enrollmentsTable.classId, classId));
      // Delete whiteboard for this class
      await db.delete(whiteboardsTable).where(eq(whiteboardsTable.classId, classId));
    }
    // Delete all classes owned by this admin
    if (classIds.length > 0) {
      await db.delete(classesTable).where(eq(classesTable.adminId, userId));
    }
  } else if (user.role === "student") {
    // Delete all student-specific data before removing the account
    const ticketIds = await db
      .select({ id: supportTicketsTable.id })
      .from(supportTicketsTable)
      .where(eq(supportTicketsTable.studentId, userId))
      .then((rows) => rows.map((row) => row.id));

    for (const ticketId of ticketIds) {
      await db.delete(supportTicketMessagesTable).where(eq(supportTicketMessagesTable.ticketId, ticketId));
    }

    await db.delete(attendanceTable).where(eq(attendanceTable.studentId, userId));
    await db.delete(assignmentSubmissionsTable).where(eq(assignmentSubmissionsTable.studentId, userId));
    await db.delete(testSubmissionsTable).where(eq(testSubmissionsTable.studentId, userId));
    await db.delete(lectureEnrollmentsTable).where(eq(lectureEnrollmentsTable.studentId, userId));
    await db.delete(directMessagesTable).where(or(eq(directMessagesTable.senderId, userId), eq(directMessagesTable.receiverId, userId)));
    await db.delete(communityPostsTable).where(eq(communityPostsTable.authorId, userId));
    await db.delete(questionBankSavedQuestionsTable).where(eq(questionBankSavedQuestionsTable.studentId, userId));
    await db.delete(questionBankReportsTable).where(eq(questionBankReportsTable.reportedBy, userId));
    await db.delete(notificationsTable).where(eq(notificationsTable.userId, userId));
    await db.delete(notificationPreferencesTable).where(eq(notificationPreferencesTable.userId, userId));
    await db.delete(userActivityLogs).where(eq(userActivityLogs.userId, userId));
    await db.delete(userSessions).where(eq(userSessions.userId, userId));
    await db.delete(enrollmentsTable).where(eq(enrollmentsTable.studentId, userId));
    await db.delete(feedbackTable).where(eq(feedbackTable.studentId, userId));
    await db.delete(supportTicketsTable).where(eq(supportTicketsTable.studentId, userId));
  } else if (user.role === "planner") {
    await db.delete(lecturePlansTable).where(eq(lecturePlansTable.plannerId, userId));
  }

  await db.delete(usersTable).where(eq(usersTable.id, userId));

  res.sendStatus(204);
});

router.patch("/users/:id/approve", async (req, res): Promise<void> => {
  const callerRole = requireRole(req, res, ["super_admin", "admin"]);
  if (!callerRole) return;

  const params = ApproveStudentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = ApproveStudentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const approverId = parseInt((req as any).cookies?.userId ?? "0", 10);
  const newStatus = body.data.status;
  const setData: any = { status: newStatus };
  if (newStatus === "approved" && approverId) {
    setData.approvedById = approverId;
    setData.approvedAt = new Date();
  }

  const [updated] = await db
    .update(usersTable)
    .set(setData)
    .where(eq(usersTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (newStatus === "approved") {
    await autoEnrollStudentIntoMatchingClasses(updated);
    if (updated.role === "student" && updated.email) {
      queueStudentApprovedEmail({
        studentName: updated.fullName,
        email: updated.email,
      });
    }
  }

  res.json(serializeUser(updated));
});

export default router;
