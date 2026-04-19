import { Router, type IRouter } from "express";
import {
  db,
  usersTable,
  classesTable,
  chaptersTable,
  enrollmentsTable,
  emailSendLogsTable,
  feedbackTable,
  supportTicketsTable,
  supportTicketMessagesTable,
  whiteboardsTable,
  lecturePlansTable,
  attendanceTable,
  assignmentsTable,
  assignmentSubmissionsTable,
  testSubmissionsTable,
  testQuestionReportsTable,
  lectureEnrollmentsTable,
  directMessagesTable,
  communityPostsTable,
  contactSubmissionsTable,
  examTemplatesTable,
  passwordResetRequestsTable,
  questionBankSavedQuestionsTable,
  questionBankQuestionsTable,
  questionBankQuestionProgressTable,
  questionBankReportsTable,
  notificationsTable,
  notificationPreferencesTable,
  subjectsTable,
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
import { queueStudentApprovedEmail, queueStudentRejectedEmail } from "../lib/brevo";
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

function isMissingRelationError(error: unknown) {
  const candidate = error as { code?: string; cause?: { code?: string }; message?: string } | null;
  const code = candidate?.cause?.code ?? candidate?.code;
  if (code === "42P01") return true;
  return typeof candidate?.message === "string" && candidate.message.toLowerCase().includes("does not exist");
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

  const [approver, submissions, savedQuestions, practiceProgress, activityLogs, sessions, questionBankPerformanceRows, emailLogs] = await Promise.all([
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
      .where(eq(questionBankQuestionProgressTable.studentId, user.id))
      .catch((error) => {
        if (isMissingRelationError(error)) {
          return [] as Array<typeof questionBankQuestionProgressTable.$inferSelect>;
        }
        throw error;
      }),
    db
      .select()
      .from(userActivityLogs)
      .where(eq(userActivityLogs.userId, user.id))
      .orderBy(desc(userActivityLogs.createdAt))
      .limit(250),
    db
      .select()
      .from(userSessions)
      .where(eq(userSessions.userId, user.id))
      .orderBy(desc(userSessions.lastActiveAt))
      .limit(40),
    db
      .select({
        attemptCount: questionBankQuestionProgressTable.attemptCount,
        correctCount: questionBankQuestionProgressTable.correctCount,
        lastAttemptedAt: questionBankQuestionProgressTable.lastAttemptedAt,
        subjectName: subjectsTable.title,
        chapterName: chaptersTable.title,
      })
      .from(questionBankQuestionProgressTable)
      .leftJoin(subjectsTable, eq(questionBankQuestionProgressTable.subjectId, subjectsTable.id))
      .leftJoin(chaptersTable, eq(questionBankQuestionProgressTable.chapterId, chaptersTable.id))
      .where(eq(questionBankQuestionProgressTable.studentId, user.id))
      .catch(() => [] as Array<{
        attemptCount: number;
        correctCount: number;
        lastAttemptedAt: Date | string;
        subjectName: string | null;
        chapterName: string | null;
      }>),
    db
      .select({
        id: emailSendLogsTable.id,
        providerKey: emailSendLogsTable.providerKey,
        providerName: emailSendLogsTable.providerName,
        senderEmail: emailSendLogsTable.senderEmail,
        recipientEmail: emailSendLogsTable.recipientEmail,
        subject: emailSendLogsTable.subject,
        messageType: emailSendLogsTable.messageType,
        status: emailSendLogsTable.status,
        sentAt: emailSendLogsTable.sentAt,
      })
      .from(emailSendLogsTable)
      .where(eq(emailSendLogsTable.recipientEmail, user.email))
      .orderBy(desc(emailSendLogsTable.sentAt))
      .limit(12)
      .catch(() => [] as Array<{
        id: number;
        providerKey: string;
        providerName: string;
        senderEmail: string;
        recipientEmail: string;
        subject: string;
        messageType: string;
        status: string;
        sentAt: Date | string;
      }>),
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
  const country = typeof address.country === "string" && address.country.trim() ? address.country.trim() : "India";
  const state = typeof address.state === "string" ? address.state.trim() : "";
  const district = typeof address.district === "string" ? address.district.trim() : "";
  const street = typeof address.street === "string" ? address.street.trim() : "";
  const city = typeof address.city === "string" ? address.city.trim() : "";
  const pincode = typeof address.pincode === "string" ? address.pincode.trim() : "";
  const classLevel = typeof preparation.classLevel === "string" ? preparation.classLevel.trim() : "";
  const board = typeof preparation.board === "string" ? preparation.board.trim() : "";
  const targetYear = typeof preparation.targetYear === "string" ? preparation.targetYear.trim() : "";
  const targetExam = typeof preparation.targetExam === "string" && preparation.targetExam.trim()
    ? preparation.targetExam.trim()
    : (typeof user.subject === "string" ? user.subject.trim() : "");
  const learningModeName = typeof learningMode.mode === "string" ? learningMode.mode.trim() : "";
  const learningProvider = typeof learningMode.provider === "string" && learningMode.provider.trim()
    ? learningMode.provider.trim()
    : (learningModeName === "Self Study using Free Resources" ? "Self Study using Free Resources" : "");
  const hearAboutUs = typeof profileDetails?.hearAboutUs === "string" ? profileDetails.hearAboutUs.trim() : "";

  const completionSteps = [
    {
      key: "personal",
      label: "Personal details",
      complete: Boolean(
        user.fullName?.trim()
        && user.phone?.trim()
        && profileDetails?.dateOfBirth
        && (profileDetails?.whatsappOnSameNumber === true || (typeof profileDetails?.whatsappNumber === "string" && profileDetails.whatsappNumber.trim())),
      ),
    },
    {
      key: "address",
      label: "Address",
      complete: Boolean(country && state && district && street && city && pincode),
    },
    {
      key: "preparation",
      label: "Schooling & target",
      complete: Boolean(classLevel && board && targetYear && targetExam),
    },
    {
      key: "learning",
      label: "Learning mode",
      complete: Boolean(learningModeName),
    },
    {
      key: "discovery",
      label: "Source",
      complete: Boolean(hearAboutUs),
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

  const questionBankPerformanceMap = new Map<string, {
    subject: string;
    attempted: number;
    correct: number;
    topicCounts: Record<string, number>;
  }>();

  questionBankPerformanceRows.forEach((row) => {
    const subject = row.subjectName?.trim() || "General Practice";
    const topic = row.chapterName?.trim() || "Mixed topics";
    const existing = questionBankPerformanceMap.get(subject) ?? {
      subject,
      attempted: 0,
      correct: 0,
      topicCounts: {} as Record<string, number>,
    };

    existing.attempted += row.attemptCount ?? 0;
    existing.correct += row.correctCount ?? 0;
    existing.topicCounts[topic] = (existing.topicCounts[topic] ?? 0) + (row.attemptCount ?? 0);
    questionBankPerformanceMap.set(subject, existing);
  });

  const questionBankPerformance = Array.from(questionBankPerformanceMap.values())
    .map((item) => {
      const topTopic = Object.entries(item.topicCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Mixed topics";
      return {
        subject: item.subject,
        topic: topTopic,
        attempted: item.attempted,
        correct: item.correct,
        accuracy: item.attempted > 0 ? roundMetric((item.correct / item.attempted) * 100) : 0,
      };
    })
    .sort((a, b) => b.attempted - a.attempted);

  const studyActivityMap = new Map<string, number>();
  const bumpStudyDay = (value: Date | string | null | undefined) => {
    const parsed = toDateValue(value);
    if (!parsed) return;
    const key = parsed.toISOString().slice(0, 10);
    studyActivityMap.set(key, (studyActivityMap.get(key) ?? 0) + 1);
  };

  activityLogs.forEach((entry) => bumpStudyDay(entry.createdAt));
  sessions.forEach((session) => {
    bumpStudyDay(session.startedAt);
    bumpStudyDay(session.lastActiveAt);
  });
  submissions.forEach((submission) => bumpStudyDay(submission.submittedAt));

  const heatmapStart = new Date(today);
  heatmapStart.setHours(0, 0, 0, 0);
  heatmapStart.setDate(heatmapStart.getDate() - 83);

  const heatmap = Array.from({ length: 84 }, (_, index) => {
    const date = new Date(heatmapStart);
    date.setDate(heatmapStart.getDate() + index);
    const key = date.toISOString().slice(0, 10);
    const count = studyActivityMap.get(key) ?? 0;
    const level = count === 0
      ? 0
      : count < 2
        ? 1
        : count < 4
          ? 2
          : count < 7
            ? 3
            : 4;

    return {
      date: key,
      count,
      level,
    };
  });

  const dailyCounts = heatmap.map((item) => item.count);
  let currentStreak = 0;
  for (let index = dailyCounts.length - 1; index >= 0; index -= 1) {
    if (dailyCounts[index] > 0) {
      currentStreak += 1;
    } else {
      break;
    }
  }

  let longestStreak = 0;
  let activeRun = 0;
  dailyCounts.forEach((count) => {
    if (count > 0) {
      activeRun += 1;
      longestStreak = Math.max(longestStreak, activeRun);
    } else {
      activeRun = 0;
    }
  });

  const sessionsHistory = sessions.slice(0, 8).map((session) => ({
    id: session.id,
    startedAt: session.startedAt,
    lastActiveAt: session.lastActiveAt,
    endedAt: session.endedAt,
    totalSeconds: session.totalSeconds,
    isActive: session.isActive,
    ipAddress: session.ipAddress ?? null,
    locationLabel: session.locationLabel ?? null,
    browserName: session.browserName ?? null,
    deviceType: session.deviceType ?? null,
  }));

  const emailHistory = emailLogs.map((entry) => ({
    id: entry.id,
    providerKey: entry.providerKey,
    providerName: entry.providerName,
    senderEmail: entry.senderEmail,
    recipientEmail: entry.recipientEmail,
    subject: entry.subject,
    messageType: entry.messageType,
    status: entry.status,
    sentAt: entry.sentAt,
  }));

  res.json({
    student: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      status: user.status,
      subject: targetExam || user.subject,
      additionalExams: user.additionalExams ?? [],
      avatarUrl: user.avatarUrl,
      onboardingComplete: user.onboardingComplete,
      approvedAt: user.approvedAt,
      approverName: approver?.fullName ?? null,
      rejectionReason: user.rejectionReason ?? null,
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
    studyStreak: {
      heatmap,
      currentStreak,
      longestStreak,
      totalActiveDays: heatmap.filter((item) => item.count > 0).length,
    },
    questionBankPerformance,
    sessionsHistory,
    emailHistory,
    preparationSnapshot: {
      dateOfBirth: profileDetails?.dateOfBirth ?? null,
      whatsappOnSameNumber: profileDetails?.whatsappOnSameNumber === true,
      whatsappNumber: typeof profileDetails?.whatsappNumber === "string" ? profileDetails.whatsappNumber : "",
      address: {
        country,
        state,
        district,
        street,
        city,
        pincode,
      },
      preparation: {
        classLevel,
        board,
        targetYear,
        targetExam,
      },
      learningMode: {
        mode: learningModeName,
        provider: learningProvider,
      },
      hearAboutUs,
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

  try {
    // Clear nullable references that can otherwise block staff deletion.
    await db.update(subjectsTable).set({ teacherId: null }).where(eq(subjectsTable.teacherId, userId));
    await db.update(attendanceTable).set({ markedBy: null }).where(eq(attendanceTable.markedBy, userId));
    await db.update(assignmentSubmissionsTable).set({ gradedBy: null }).where(eq(assignmentSubmissionsTable.gradedBy, userId));
    await db.update(supportTicketsTable).set({ respondedBy: null }).where(eq(supportTicketsTable.respondedBy, userId));
    await db.update(contactSubmissionsTable).set({ reviewedBy: null }).where(eq(contactSubmissionsTable.reviewedBy, userId));
    await db.update(passwordResetRequestsTable).set({ resolvedBy: null }).where(eq(passwordResetRequestsTable.resolvedBy, userId));
    await db.update(questionBankQuestionsTable).set({ createdBy: null }).where(eq(questionBankQuestionsTable.createdBy, userId));
    await db.update(testsTable).set({ createdBy: null }).where(eq(testsTable.createdBy, userId));
    await db.update(examTemplatesTable).set({ createdBy: null }).where(eq(examTemplatesTable.createdBy, userId));

    // Delete direct references that should disappear with the account.
    await db.delete(directMessagesTable).where(or(eq(directMessagesTable.senderId, userId), eq(directMessagesTable.receiverId, userId)));
    await db.delete(communityPostsTable).where(eq(communityPostsTable.authorId, userId));
    await db.delete(questionBankReportsTable).where(or(eq(questionBankReportsTable.reportedBy, userId), eq(questionBankReportsTable.teacherId, userId)));
    await db
      .delete(testQuestionReportsTable)
      .where(or(eq(testQuestionReportsTable.reportedBy, userId), eq(testQuestionReportsTable.teacherId, userId)))
      .catch((error) => {
        if (!isMissingRelationError(error)) throw error;
      });
    await db.delete(supportTicketMessagesTable).where(eq(supportTicketMessagesTable.senderId, userId));
    await db.delete(notificationsTable).where(eq(notificationsTable.userId, userId));
    await db.delete(notificationPreferencesTable).where(eq(notificationPreferencesTable.userId, userId));
    await db.delete(userActivityLogs).where(eq(userActivityLogs.userId, userId));
    await db.delete(userSessions).where(eq(userSessions.userId, userId));

    // Cascade delete: remove role-specific data before deleting the user.
    if (user.role === "admin") {
      await db.delete(lecturePlansTable).where(eq(lecturePlansTable.teacherId, userId));
      await db.delete(assignmentsTable).where(eq(assignmentsTable.createdBy, userId));

      const adminClasses = await db
        .select({ id: classesTable.id })
        .from(classesTable)
        .where(eq(classesTable.adminId, userId));
      const classIds = adminClasses.map((c) => c.id);

      for (const classId of classIds) {
        await db.delete(feedbackTable).where(eq(feedbackTable.classId, classId));
        await db.delete(enrollmentsTable).where(eq(enrollmentsTable.classId, classId));
        await db.delete(whiteboardsTable).where(eq(whiteboardsTable.classId, classId));
      }

      if (classIds.length > 0) {
        await db.delete(classesTable).where(eq(classesTable.adminId, userId));
      }
    } else if (user.role === "student") {
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
      await db.delete(questionBankSavedQuestionsTable).where(eq(questionBankSavedQuestionsTable.studentId, userId));
      await db.delete(enrollmentsTable).where(eq(enrollmentsTable.studentId, userId));
      await db.delete(feedbackTable).where(eq(feedbackTable.studentId, userId));
      await db.delete(supportTicketsTable).where(eq(supportTicketsTable.studentId, userId));
      await db.delete(passwordResetRequestsTable).where(eq(passwordResetRequestsTable.userId, userId));
    } else if (user.role === "planner") {
      await db.delete(lecturePlansTable).where(eq(lecturePlansTable.plannerId, userId));
    }

    await db.delete(usersTable).where(eq(usersTable.id, userId));

    res.sendStatus(204);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to delete user",
    });
  }
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
  const reviewReason = typeof body.data.reason === "string" ? body.data.reason.trim() : "";
  if (newStatus === "rejected" && reviewReason.length < 5) {
    res.status(400).json({ error: "Please provide a short rejection reason." });
    return;
  }
  const setData: any = {
    status: newStatus,
    reviewedById: approverId || null,
    reviewedAt: new Date(),
    pendingReviewStartedAt: null,
    pendingReviewEscalatedAt: null,
  };
  if (newStatus === "approved" && approverId) {
    setData.approvedById = approverId;
    setData.approvedAt = new Date();
    setData.rejectionReason = null;
  }
  if (newStatus === "rejected") {
    setData.approvedById = null;
    setData.approvedAt = null;
    setData.rejectionReason = reviewReason;
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

  if (newStatus === "rejected" && updated.role === "student" && updated.email) {
    queueStudentRejectedEmail({
      studentName: updated.fullName,
      email: updated.email,
      reason: reviewReason,
    });
  }

  res.json(serializeUser(updated));
});

export default router;
