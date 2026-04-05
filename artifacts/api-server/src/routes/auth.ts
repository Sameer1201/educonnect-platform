import { Router, type IRouter } from "express";
import { db, classesTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { LoginBody, RegisterStudentBody } from "@workspace/api-zod";
import { hashPassword, verifyPassword } from "../lib/auth";

const router: IRouter = Router();

function serializeUser(user: typeof usersTable.$inferSelect) {
  const { passwordHash, ...rest } = user;
  void passwordHash;
  return rest;
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

router.get("/auth/exams", async (_req, res): Promise<void> => {
  const classes = await db
    .select({ subject: classesTable.subject, status: classesTable.status })
    .from(classesTable);

  const examCounts = new Map<string, number>();

  for (const cls of classes) {
    const exam = cls.subject.trim();
    if (!exam || cls.status === "completed" || cls.status === "cancelled") {
      continue;
    }
    examCounts.set(exam, (examCounts.get(exam) ?? 0) + 1);
  }

  const exams = [...examCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([exam, batchCount]) => ({ exam, batchCount }));

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

  const { fullName, phone, avatarUrl } = req.body;
  const updates: Record<string, any> = {};
  if (typeof fullName === "string" && fullName.trim()) updates.fullName = fullName.trim();
  if (typeof phone === "string") updates.phone = phone.trim() || null;
  if (typeof avatarUrl === "string" || avatarUrl === null) updates.avatarUrl = avatarUrl;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" }); return;
  }

  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, userId)).returning();
  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
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
