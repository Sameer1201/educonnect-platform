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
  studentPaymentsTable,
  lectureEnrollmentsTable,
  directMessagesTable,
  communityPostsTable,
  questionBankSavedQuestionsTable,
  questionBankReportsTable,
  passwordResetRequestsTable,
  notificationsTable,
  notificationPreferencesTable,
  userActivityLogs,
  userSessions,
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

const router: IRouter = Router();

function serializeUser(user: typeof usersTable.$inferSelect) {
  const { passwordHash, ...rest } = user;
  void passwordHash;
  return rest;
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
  const callerRole = requireRole(req, res, ["super_admin", "admin", "planner"]);
  if (!callerRole) return;

  const params = ListUsersQueryParams.safeParse(req.query);

  let users = await db.select().from(usersTable).orderBy(usersTable.createdAt);

  if (params.success) {
    if (callerRole === "planner" && params.data.role && params.data.role !== "admin") {
      res.status(403).json({ error: "Planners can only view teacher accounts" });
      return;
    }
    if (params.data.role) {
      users = users.filter((u) => u.role === params.data.role);
    }
    if (params.data.status) {
      users = users.filter((u) => u.status === params.data.status);
    }
  }

  if (callerRole === "planner") {
    users = users.filter((u) => u.role === "admin");
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
    await db.delete(studentPaymentsTable).where(eq(studentPaymentsTable.studentId, userId));
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
  }

  res.json(serializeUser(updated));
});

export default router;
