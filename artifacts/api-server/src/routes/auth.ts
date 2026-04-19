import { Router, type IRouter, type Response } from "express";
import { db, examTemplatesTable, usersTable } from "@workspace/db";
import { eq, or, ilike } from "drizzle-orm";
import { LoginBody } from "@workspace/api-zod";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { hashPassword, verifyPassword } from "../lib/auth";
import { hasBrevoAccounts, sendPasswordResetEmail } from "../lib/brevo";
import { getStudentReviewAutomationSettings } from "../lib/platformSettings";
import {
  buildStudentReviewSummary,
  getStudentReviewCycleAt,
  listStudentReviewEmailRecipients,
} from "../lib/studentReview";
import { queueNewStudentReviewRequestEmails } from "../lib/brevo";
import {
  deleteFirebaseUser,
  ensureFirebaseEmailUser,
  generateFirebasePasswordResetLink,
  isFirebaseAdminConfigured,
  verifyFirebaseIdToken,
} from "../lib/firebaseAdmin";

const router: IRouter = Router();

function readTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function readPublicAppUrl() {
  return readTrimmedString(process.env.PUBLIC_APP_URL) || "http://localhost:5173";
}

function buildCustomPasswordResetUrl(firebaseLink: string) {
  const firebaseUrl = new URL(firebaseLink);
  const appUrl = new URL("/reset-password", readPublicAppUrl());
  const expiresAt = Date.now() + PASSWORD_RESET_EMAIL_COOLDOWN_MS;
  const oobCode = firebaseUrl.searchParams.get("oobCode") ?? "";
  const sig = signPasswordResetLink(oobCode, expiresAt);

  ["oobCode", "mode", "apiKey", "lang", "continueUrl"].forEach((key) => {
    const value = firebaseUrl.searchParams.get(key);
    if (value) appUrl.searchParams.set(key, value);
  });

  appUrl.searchParams.set("expiresAt", String(expiresAt));
  appUrl.searchParams.set("sig", sig);

  return appUrl.toString();
}

const PASSWORD_RESET_EMAIL_COOLDOWN_MS = 2 * 60 * 60 * 1000;

function readPasswordResetSigningSecret() {
  return readTrimmedString(process.env.PASSWORD_RESET_LINK_SECRET)
    || readTrimmedString(process.env.FIREBASE_PRIVATE_KEY)
    || readTrimmedString(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
    || readTrimmedString(process.env.BREVO_API_KEY)
    || "rank-pulse-reset-link-secret";
}

function signPasswordResetLink(oobCode: string, expiresAt: number) {
  return createHmac("sha256", readPasswordResetSigningSecret())
    .update(`${oobCode}:${expiresAt}`)
    .digest("hex");
}

function isPasswordResetLinkSignatureValid(oobCode: string, expiresAt: number, sig: string) {
  if (!oobCode || !Number.isFinite(expiresAt) || !sig) return false;
  const expected = signPasswordResetLink(oobCode, expiresAt);
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(sig, "utf8");
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

function getPasswordResetCooldownRemaining(lastSentAt: Date | null | undefined) {
  if (!lastSentAt) return 0;
  const elapsed = Date.now() - lastSentAt.getTime();
  return Math.max(0, PASSWORD_RESET_EMAIL_COOLDOWN_MS - elapsed);
}

function formatPasswordResetCooldown(remainingMs: number) {
  const totalMinutes = Math.ceil(remainingMs / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  if (minutes === 0) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${hours} hour${hours === 1 ? "" : "s"} ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

router.post("/auth/password-reset-link/validate", async (req, res): Promise<void> => {
  const oobCode = readTrimmedString(req.body?.oobCode);
  const sig = readTrimmedString(req.body?.sig);
  const expiresAtRaw = Number(req.body?.expiresAt);

  if (!oobCode || !sig || !Number.isFinite(expiresAtRaw)) {
    res.status(400).json({ error: "Reset link is invalid or incomplete." });
    return;
  }

  if (!isPasswordResetLinkSignatureValid(oobCode, expiresAtRaw, sig)) {
    res.status(400).json({ error: "Reset link signature is invalid." });
    return;
  }

  const remainingMs = expiresAtRaw - Date.now();
  if (remainingMs <= 0) {
    res.status(400).json({ error: "This reset link has expired. Please request a new one." });
    return;
  }

  res.json({
    valid: true,
    expiresAt: new Date(expiresAtRaw).toISOString(),
    remainingMs,
  });
});

function sanitizeGoogleUsernameBase(email: string, name: string) {
  const emailBase = email.split("@")[0] ?? "";
  const fromName = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  const fromEmail = emailBase
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  const fallback = fromName || fromEmail || "student";
  const compact = fallback.slice(0, 24);
  if (compact.length >= 3) return compact;
  return `${compact}student`.slice(0, 24);
}

async function buildUniqueGoogleUsername(email: string, name: string) {
  const base = sanitizeGoogleUsernameBase(email, name);
  let candidate = base;
  let suffix = 1;

  while (true) {
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.username, candidate));
    if (!existing) return candidate;
    suffix += 1;
    candidate = `${base}${suffix}`.slice(0, 64);
  }
}

function readGoogleNewStudentStatus() {
  const configured = readTrimmedString(process.env.FIREBASE_GOOGLE_NEW_STUDENT_STATUS).toLowerCase();
  if (configured === "approved") return "approved" as const;
  return "pending" as const;
}

function validateRegisterStudentBody(body: unknown) {
  const payload = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const username = readTrimmedString(payload.username);
  const email = normalizeEmail(readTrimmedString(payload.email));
  const password = typeof payload.password === "string" ? payload.password : "";
  const fullName = readTrimmedString(payload.fullName);

  if (username.length < 3) return { error: "User ID must be at least 3 characters" } as const;
  if (username.length > 64) return { error: "User ID is too long" } as const;
  if (!email) return { error: "Email is required" } as const;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) return { error: "Enter a valid email address" } as const;
  if (password.length < 6) return { error: "Password must be at least 6 characters" } as const;
  if (!fullName) return { error: "Name is required" } as const;
  if (fullName.length > 120) return { error: "Name is too long" } as const;

  return { data: { username, email, password, fullName } } as const;
}

function validateStudentOnboardingBody(body: unknown) {
  const payload = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const fullName = readTrimmedString(payload.fullName);
  const phone = readTrimmedString(payload.phone);
  const subject = readTrimmedString(payload.subject);
  const profileDetails = payload.profileDetails;

  if (!fullName) return { error: "Full name is required" } as const;
  if (fullName.length > 120) return { error: "Full name is too long" } as const;
  if (phone.length < 10) return { error: "Phone number is required" } as const;
  if (phone.length > 20) return { error: "Phone number is too long" } as const;
  if (!subject) return { error: "Target exam is required" } as const;

  if (!profileDetails || typeof profileDetails !== "object") {
    return { error: "Profile details are required" } as const;
  }

  const details = profileDetails as Record<string, unknown>;
  const address = (details.address && typeof details.address === "object" ? details.address : {}) as Record<string, unknown>;
  const preparation = (details.preparation && typeof details.preparation === "object" ? details.preparation : {}) as Record<string, unknown>;
  const learningMode = (details.learningMode && typeof details.learningMode === "object" ? details.learningMode : {}) as Record<string, unknown>;

  const normalized = {
    dateOfBirth: readTrimmedString(details.dateOfBirth),
    whatsappOnSameNumber: details.whatsappOnSameNumber === true,
    whatsappNumber:
      details.whatsappOnSameNumber === true
        ? phone
        : readTrimmedString(details.whatsappNumber),
    address: {
      country: readTrimmedString(address.country),
      state: readTrimmedString(address.state),
      district: readTrimmedString(address.district),
      street: readTrimmedString(address.street),
      city: readTrimmedString(address.city),
      pincode: readTrimmedString(address.pincode),
    },
    preparation: {
      classLevel: readTrimmedString(preparation.classLevel),
      board: readTrimmedString(preparation.board),
      targetYear: readTrimmedString(preparation.targetYear),
      targetExam: readTrimmedString(preparation.targetExam) || subject,
    },
    learningMode: {
      mode: readTrimmedString(learningMode.mode),
      provider: readTrimmedString(learningMode.provider),
    },
    hearAboutUs: readTrimmedString(details.hearAboutUs),
  };

  if (!normalized.dateOfBirth) return { error: "Date of birth is required" } as const;
  if (!normalized.whatsappOnSameNumber && !normalized.whatsappNumber) {
    return { error: "WhatsApp number is required" } as const;
  }
  if (!normalized.address.country) return { error: "Country is required" } as const;
  if (!normalized.address.state) return { error: "State is required" } as const;
  if (!normalized.address.district) return { error: "District is required" } as const;
  if (!normalized.address.street) return { error: "Street address is required" } as const;
  if (!normalized.address.city) return { error: "City is required" } as const;
  if (!normalized.address.pincode) return { error: "Pincode is required" } as const;
  if (!normalized.preparation.classLevel) return { error: "Current stage is required" } as const;
  if (!normalized.preparation.board) return { error: "Board is required" } as const;
  if (!normalized.preparation.targetYear) return { error: "Target year is required" } as const;
  if (!normalized.preparation.targetExam) return { error: "Target exam is required" } as const;
  if (!normalized.learningMode.mode) return { error: "Learning mode is required" } as const;
  if (!normalized.hearAboutUs) return { error: "Please choose how you heard about us" } as const;

  return {
    data: {
      fullName,
      phone,
      subject,
      profileDetails: normalized,
    },
  } as const;
}

function parseStudentProfileData(raw: string | null) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function serializeUser(user: typeof usersTable.$inferSelect) {
  const { passwordHash, ...rest } = user;
  void passwordHash;
  const onboardingComplete = user.onboardingComplete || (user.role === "student" && Boolean(user.subject?.trim()));
  return {
    ...rest,
    additionalExams: user.additionalExams ?? [],
    onboardingComplete,
    profileDetails: parseStudentProfileData(user.studentProfileData ?? null),
  };
}

function canUserAccessPlatform(user: typeof usersTable.$inferSelect) {
  if (user.role === "planner") {
    return { error: "Planner role is no longer supported on this platform", status: 403 } as const;
  }

  return null;
}

function sendSessionResponse(
  res: Response,
  user: typeof usersTable.$inferSelect,
  message: string,
) {
  const accessError = canUserAccessPlatform(user);
  if (accessError) {
    if (user.role === "planner") {
      res.clearCookie("userId");
      res.clearCookie("userRole");
    }
    res.status(accessError.status).json({ error: accessError.error });
    return false;
  }

  const cookieOpts = { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 };
  res.cookie("userId", user.id.toString(), cookieOpts);
  res.cookie("userRole", user.role, cookieOpts);
  res.json({ user: serializeUser(user), message });
  return true;
}

async function upsertFirebaseUser({
  email,
  fullName,
  avatarUrl,
}: {
  email: string;
  fullName: string;
  avatarUrl: string | null;
}) {
  let [user] = await db
    .select()
    .from(usersTable)
    .where(ilike(usersTable.email, email));

  if (!user) {
    const username = await buildUniqueGoogleUsername(email, fullName);
    const status = readGoogleNewStudentStatus();
    const [createdUser] = await db.insert(usersTable).values({
      username,
      passwordHash: hashPassword(randomBytes(24).toString("hex")),
      fullName,
      email,
      phone: null,
      subject: null,
      avatarUrl,
      role: "student",
      status,
      approvedAt: status === "approved" ? new Date() : null,
      rejectionReason: null,
    }).returning();
    user = createdUser;
  } else {
    const updates: Partial<typeof usersTable.$inferInsert> = {};
    if (avatarUrl && user.avatarUrl !== avatarUrl) updates.avatarUrl = avatarUrl;
    if (fullName && user.fullName?.trim() !== fullName) updates.fullName = fullName;
    if (Object.keys(updates).length > 0) {
      const [updatedUser] = await db
        .update(usersTable)
        .set(updates)
        .where(eq(usersTable.id, user.id))
        .returning();
      user = updatedUser;
    }
  }

  return user;
}

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, password } = parsed.data;
  const normalizedIdentifier = normalizeEmail(username);

  const [user] = await db
    .select()
    .from(usersTable)
    .where(or(eq(usersTable.username, username), ilike(usersTable.email, normalizedIdentifier)));

  if (!user) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  if (!verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  if (user.role === "student") {
    res.status(403).json({ error: "Students must sign in with email/password or Google via Firebase." });
    return;
  }

  sendSessionResponse(res, user, "Login successful");
});

router.post("/auth/google", async (req, res): Promise<void> => {
  const idToken = typeof req.body?.idToken === "string" ? req.body.idToken.trim() : "";
  if (!idToken) {
    res.status(400).json({ error: "Firebase Google ID token is required" });
    return;
  }

  if (!isFirebaseAdminConfigured()) {
    res.status(503).json({ error: "Firebase Google login is not configured on the server yet" });
    return;
  }

  try {
    const decoded = await verifyFirebaseIdToken(idToken);
    const provider = decoded.firebase?.sign_in_provider;
    const email = normalizeEmail(typeof decoded.email === "string" ? decoded.email : "");
    const fullName = readTrimmedString(decoded.name) || email.split("@")[0] || "Student";
    const avatarUrl = typeof decoded.picture === "string" ? decoded.picture : null;

    if (provider !== "google.com") {
      res.status(400).json({ error: "This token is not from Firebase Google sign-in" });
      return;
    }

    if (!decoded.email_verified || !email) {
      res.status(400).json({ error: "A verified Google email is required to continue" });
      return;
    }

    const user = await upsertFirebaseUser({ email, fullName, avatarUrl });
    sendSessionResponse(res, user, "Google login successful");
  } catch (error) {
    res.status(401).json({
      error: error instanceof Error ? error.message : "Firebase Google login failed",
    });
  }
});

router.post("/auth/firebase-email", async (req, res): Promise<void> => {
  const idToken = typeof req.body?.idToken === "string" ? req.body.idToken.trim() : "";
  if (!idToken) {
    res.status(400).json({ error: "Firebase email/password ID token is required" });
    return;
  }

  if (!isFirebaseAdminConfigured()) {
    res.status(503).json({ error: "Firebase email/password login is not configured on the server yet" });
    return;
  }

  try {
    const decoded = await verifyFirebaseIdToken(idToken);
    const provider = decoded.firebase?.sign_in_provider;
    const email = normalizeEmail(typeof decoded.email === "string" ? decoded.email : "");
    if (provider !== "password") {
      res.status(400).json({ error: "This token is not from Firebase email/password sign-in" });
      return;
    }

    if (!email) {
      res.status(400).json({ error: "A Firebase email is required to continue" });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(ilike(usersTable.email, email));

    if (!user) {
      res.status(403).json({
        error: "Account not found. Student signup is public, but teacher accounts must be created by admin.",
      });
      return;
    }

    sendSessionResponse(res, user, "Firebase email login successful");
  } catch (error) {
    res.status(401).json({
      error: error instanceof Error ? error.message : "Firebase email/password login failed",
    });
  }
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

  if (!user) {
    res.json({ message: "If this student account exists, a reset request has been sent." });
    return;
  }

  if (user.role === "student" || user.role === "admin" || user.role === "super_admin") {
    if (user.email) {
      const cooldownRemaining = getPasswordResetCooldownRemaining(user.lastPasswordResetEmailAt);
      if (cooldownRemaining > 0) {
        res.status(429).json({
          error: `A reset email was already sent recently. You can request the next email after ${formatPasswordResetCooldown(cooldownRemaining)}.`,
          retryAfterSeconds: Math.ceil(cooldownRemaining / 1000),
          nextAllowedAt: new Date(Date.now() + cooldownRemaining).toISOString(),
        });
        return;
      }

      if (isFirebaseAdminConfigured() && await hasBrevoAccounts()) {
        try {
          const firebaseLink = await generateFirebasePasswordResetLink(user.email);
          const resetUrl = buildCustomPasswordResetUrl(firebaseLink);
          await sendPasswordResetEmail({
            accountName: user.fullName?.trim() || user.username,
            email: user.email,
            resetUrl,
          });
          await db
            .update(usersTable)
            .set({ lastPasswordResetEmailAt: new Date() })
            .where(eq(usersTable.id, user.id));

          res.json({
            message: "Password reset link sent to your registered email. The next reset email can be sent after 2 hours.",
            delivery: "server",
          });
          return;
        } catch (error) {
          res.status(500).json({
            error: error instanceof Error ? error.message : "Failed to send password reset email.",
          });
          return;
        }
      }

      await db
        .update(usersTable)
        .set({ lastPasswordResetEmailAt: new Date() })
        .where(eq(usersTable.id, user.id));

      res.json({
        message: "Password reset link sent to your registered email. The next reset email can be sent after 2 hours.",
        email: user.email,
        delivery: "client",
      });
      return;
    }

  }

  res.status(400).json({ error: "This account does not have a valid email address." });
  return;
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
  const parsed = validateRegisterStudentBody(req.body);
  if ("error" in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const { username, email, password, fullName } = parsed.data;

  if (!isFirebaseAdminConfigured()) {
    res.status(503).json({ error: "Firebase student registration is not configured on the server yet" });
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
    .where(ilike(usersTable.email, email));

  if (existingEmail) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }

  let firebaseUid: string | null = null;

  try {
    const firebaseUser = await ensureFirebaseEmailUser({ email, password, fullName });
    firebaseUid = firebaseUser.uid;

    const [newUser] = await db.insert(usersTable).values({
      username,
      passwordHash: hashPassword(password),
      fullName,
      email,
      phone: null,
      subject: null,
      role: "student",
      status: "pending",
      onboardingComplete: false,
    }).returning();

    res.status(201).json(serializeUser(newUser));
  } catch (error) {
    if (firebaseUid) {
      await deleteFirebaseUser(firebaseUid).catch(() => undefined);
    }

    if (error instanceof Error) {
      if (error.message.includes("email-already-exists")) {
        res.status(400).json({ error: "This email is already linked to an active account. Try signing in instead." });
        return;
      }
      res.status(400).json({ error: error.message });
      return;
    }

    res.status(500).json({ error: "Student registration failed" });
  }
});

router.post("/auth/logout", async (_req, res): Promise<void> => {
  res.clearCookie("userId");
  res.clearCookie("userRole");
  res.json({ message: "Logged out successfully" });
});

router.patch("/auth/profile", async (req, res): Promise<void> => {
  const userIdCookie = req.cookies?.userId;
  if (!userIdCookie) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = parseInt(userIdCookie, 10);
  if (isNaN(userId)) { res.status(401).json({ error: "Not authenticated" }); return; }

  const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!existingUser) { res.status(404).json({ error: "User not found" }); return; }

  const { fullName, phone, avatarUrl, additionalExams, dailyQuestionGoal } = req.body;
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
  if (dailyQuestionGoal !== undefined) {
    const parsedGoal = Number(dailyQuestionGoal);
    if (!Number.isInteger(parsedGoal) || parsedGoal <= 0 || parsedGoal > 5000) {
      res.status(400).json({ error: "Daily question goal must be between 1 and 5000" }); return;
    }

    const existingProfileData = parseStudentProfileData(existingUser.studentProfileData ?? null);
    const nextProfileData = {
      ...(existingProfileData && typeof existingProfileData === "object" ? existingProfileData : {}),
      dashboard: {
        ...(existingProfileData?.dashboard && typeof existingProfileData.dashboard === "object" ? existingProfileData.dashboard : {}),
        dailyQuestionGoal: parsedGoal,
      },
    };
    updates.studentProfileData = JSON.stringify(nextProfileData);
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" }); return;
  }

  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, userId)).returning();
  res.json(serializeUser(updated));
});

router.post("/auth/student-onboarding", async (req, res): Promise<void> => {
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

  const parsed = validateStudentOnboardingBody(req.body);
  if ("error" in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!existingUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (existingUser.role !== "student") {
    res.status(403).json({ error: "Only students can complete onboarding" });
    return;
  }

  const { fullName, phone, subject, profileDetails } = parsed.data;
  const normalizedSubject = profileDetails.preparation.targetExam.trim() || subject.trim();

  const [updated] = await db
    .update(usersTable)
    .set({
      fullName,
      phone,
      subject: normalizedSubject,
      status: "pending",
      reviewedById: null,
      reviewedAt: null,
      approvedAt: null,
      approvedById: null,
      rejectionReason: null,
      pendingReviewStartedAt: new Date(),
      pendingReviewEscalatedAt: null,
      onboardingComplete: true,
      studentProfileData: JSON.stringify({
        ...profileDetails,
        preparation: {
          ...profileDetails.preparation,
          targetExam: normalizedSubject,
        },
      }),
    })
    .where(eq(usersTable.id, userId))
    .returning();

  const studentReviewSettings = await getStudentReviewAutomationSettings();
  if (studentReviewSettings.emailEnabled && await hasBrevoAccounts()) {
    const recipients = await listStudentReviewEmailRecipients();
    if (recipients.length > 0) {
      queueNewStudentReviewRequestEmails({
        studentId: updated.id,
        cycleAt: getStudentReviewCycleAt(updated),
        studentSummary: buildStudentReviewSummary(updated),
        recipients,
        quickActionsEnabled: studentReviewSettings.quickActionsEnabled,
      });
    }
  }

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

  if (user.role === "planner") {
    res.clearCookie("userId");
    res.clearCookie("userRole");
    res.status(403).json({ error: "Planner role is no longer supported on this platform" });
    return;
  }

  res.json(serializeUser(user));
});

export default router;
