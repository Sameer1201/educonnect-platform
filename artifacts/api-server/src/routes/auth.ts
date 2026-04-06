import { Router, type IRouter } from "express";
import { db, classesTable, examTemplatesTable, passwordResetRequestsTable, usersTable } from "@workspace/db";
import { eq, or, desc } from "drizzle-orm";
import { LoginBody, RegisterStudentBody } from "@workspace/api-zod";
import { hashPassword, verifyPassword } from "../lib/auth";

const router: IRouter = Router();

function serializeUser(user: typeof usersTable.$inferSelect) {
  const { passwordHash, ...rest } = user;
  void passwordHash;
  return {
    ...rest,
    additionalExams: user.additionalExams ?? [],
  };
}

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, password } = parsed.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username));

  if (!user) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  if (!verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  if (user.role === "student" && user.status === "pending") {
    res.status(401).json({ error: "Your account is pending approval. Please wait for admin to approve." });
    return;
  }

  if (user.role === "student" && user.status === "rejected") {
    res.status(401).json({ error: "Your account has been rejected. Contact admin for details." });
    return;
  }

  const cookieOpts = { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 };
  res.cookie("userId", user.id.toString(), cookieOpts);
  res.cookie("userRole", user.role, cookieOpts);

  res.json({ user: serializeUser(user), message: "Login successful" });
});

router.post("/auth/forgot-password-request", async (req, res): Promise<void> => {
  const identifier = typeof req.body?.identifier === "string" ? req.body.identifier.trim() : "";
  if (!identifier) {
    res.status(400).json({ error: "Username or email is required" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(or(eq(usersTable.username, identifier), eq(usersTable.email, identifier)));

  if (!user || user.role !== "student") {
    res.json({ message: "If this student account exists, a reset request has been sent." });
    return;
  }

  const [existingOpen] = await db
    .select()
    .from(passwordResetRequestsTable)
    .where(eq(passwordResetRequestsTable.userId, user.id))
    .orderBy(desc(passwordResetRequestsTable.createdAt));

  if (!existingOpen || existingOpen.status !== "open") {
    await db.insert(passwordResetRequestsTable).values({
      userId: user.id,
      requestedUsername: user.username,
      requestedEmail: user.email,
    });
  }

  res.json({ message: "Reset request submitted. Admin will share a temporary password after verification." });
});

router.get("/auth/exams", async (_req, res): Promise<void> => {
  const templates = await db
    .select({
      key: examTemplatesTable.key,
      name: examTemplatesTable.name,
      description: examTemplatesTable.description,
      durationMinutes: examTemplatesTable.durationMinutes,
      showInRegistration: examTemplatesTable.showInRegistration,
    })
    .from(examTemplatesTable)
    .orderBy(examTemplatesTable.name);

  const exams = templates
    .filter((template) => template.showInRegistration !== false)
    .map((template) => ({
      exam: template.key,
      label: template.name,
      description: template.description ?? null,
      durationMinutes: template.durationMinutes ?? null,
    }));
  res.json(exams);
});

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterStudentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, password, fullName, email, phone, exam } = parsed.data;

  // Check if username or email already taken
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

  const [newUser] = await db.insert(usersTable).values({
    username,
    passwordHash: hashPassword(password),
    fullName,
    email,
    phone: phone ?? null,
    subject: exam.trim(),
    role: "student",
    status: "pending",
  }).returning();

  res.status(201).json(serializeUser(newUser));
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  res.clearCookie("userId");
  res.clearCookie("userRole");
  res.json({ message: "Logged out successfully" });
});

router.patch("/auth/profile", async (req, res): Promise<void> => {
  const userIdCookie = req.cookies?.userId;
  if (!userIdCookie) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = parseInt(userIdCookie, 10);
  if (isNaN(userId)) { res.status(401).json({ error: "Not authenticated" }); return; }

  const { fullName, phone, avatarUrl, additionalExams } = req.body;
  const updates: Record<string, any> = {};
  if (typeof fullName === "string" && fullName.trim()) updates.fullName = fullName.trim();
  if (typeof phone === "string") updates.phone = phone.trim() || null;
  if (typeof avatarUrl === "string" || avatarUrl === null) updates.avatarUrl = avatarUrl;
  if (Array.isArray(additionalExams)) {
    updates.additionalExams = additionalExams
      .filter((exam): exam is string => typeof exam === "string")
      .map((exam) => exam.trim())
      .filter(Boolean)
      .filter((exam, index, all) => all.indexOf(exam) === index);
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" }); return;
  }

  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, userId)).returning();
  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  res.json(serializeUser(updated));
});

router.post("/auth/change-password", async (req, res): Promise<void> => {
  const userIdCookie = req.cookies?.userId;
  if (!userIdCookie) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = parseInt(userIdCookie, 10);
  if (isNaN(userId)) { res.status(401).json({ error: "Not authenticated" }); return; }

  const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword.trim() : "";

  if (newPassword.length < 6) {
    res.status(400).json({ error: "New password must be at least 6 characters" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (!verifyPassword(currentPassword, user.passwordHash)) {
    res.status(400).json({ error: "Current password is incorrect" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ passwordHash: hashPassword(newPassword), mustChangePassword: false })
    .where(eq(usersTable.id, userId))
    .returning();

  res.json(serializeUser(updated));
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const userIdCookie = req.cookies?.userId;
  if (!userIdCookie) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const userId = parseInt(userIdCookie, 10);
  if (isNaN(userId)) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.clearCookie("userId");
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  res.json(serializeUser(user));
});

export default router;
