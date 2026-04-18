import { Router } from "express";
import {
  db,
  userActivityLogs,
  userSessions,
  usersTable,
  testsTable,
  testQuestionsTable,
  questionBankQuestionsTable,
  questionBankReportsTable,
} from "@workspace/db";
import { eq, desc, and, sql, inArray } from "drizzle-orm";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  if (!req.cookies?.userId) return res.status(401).json({ error: "Unauthorized" });
  next();
}

async function requireSuperAdmin(req: any, res: any, next: any) {
  if (!req.cookies?.userId) return res.status(401).json({ error: "Unauthorized" });
  // Fast path: role cookie already set
  if (req.cookies.userRole === "super_admin") return next();
  // Fallback: look up role in DB (handles users logged in before role cookie was added)
  try {
    const userId = parseInt(req.cookies.userId, 10);
    const [user] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId));
    if (!user || user.role !== "super_admin") return res.status(403).json({ error: "Forbidden" });
    next();
  } catch {
    return res.status(500).json({ error: "Auth check failed" });
  }
}

// POST /api/activity/log — log a user action
router.post("/log", requireAuth, async (req, res) => {
  try {
    const userId = parseInt(req.cookies.userId, 10);
    const { action, page, detail } = req.body;
    if (!action) return res.status(400).json({ error: "action required" });

    await db.insert(userActivityLogs).values({ userId, action, page: page || null, detail: detail || null });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to log activity" });
  }
});

// POST /api/activity/session/start — start or resume a session
router.post("/session/start", requireAuth, async (req, res) => {
  try {
    const userId = parseInt(req.cookies.userId, 10);
    const { sessionToken } = req.body;
    if (!sessionToken) return res.status(400).json({ error: "sessionToken required" });

    // Check if session already exists
    const existing = await db.select().from(userSessions)
      .where(and(eq(userSessions.userId, userId), eq(userSessions.sessionToken, sessionToken)));
    if (existing.length > 0) {
      await db.update(userSessions)
        .set({ lastActiveAt: new Date(), isActive: true })
        .where(eq(userSessions.id, existing[0].id));
      return res.json({ sessionId: existing[0].id });
    }

    const [row] = await db.insert(userSessions).values({
      userId, sessionToken, isActive: true,
    }).returning({ id: userSessions.id });
    res.json({ sessionId: row.id });
  } catch (err) {
    res.status(500).json({ error: "Failed to start session" });
  }
});

// POST /api/activity/heartbeat — update session last active time
router.post("/heartbeat", requireAuth, async (req, res) => {
  try {
    const userId = parseInt(req.cookies.userId, 10);
    const { sessionToken } = req.body;
    if (!sessionToken) return res.status(400).json({ error: "sessionToken required" });

    const existing = await db.select().from(userSessions)
      .where(and(eq(userSessions.userId, userId), eq(userSessions.sessionToken, sessionToken)));
    if (existing.length > 0) {
      const sess = existing[0];
      const elapsedSeconds = Math.floor((Date.now() - sess.lastActiveAt.getTime()) / 1000);
      const newTotal = (sess.totalSeconds || 0) + Math.min(elapsedSeconds, 120); // cap at 2 min per heartbeat to avoid counting idle
      await db.update(userSessions)
        .set({ lastActiveAt: new Date(), totalSeconds: newTotal, isActive: true })
        .where(eq(userSessions.id, sess.id));
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

// POST /api/activity/session/end — end a session
router.post("/session/end", requireAuth, async (req, res) => {
  try {
    const userId = parseInt(req.cookies.userId, 10);
    const { sessionToken } = req.body;
    if (!sessionToken) return res.status(400).json({ error: "sessionToken required" });

    const existing = await db.select().from(userSessions)
      .where(and(eq(userSessions.userId, userId), eq(userSessions.sessionToken, sessionToken)));
    if (existing.length > 0) {
      const sess = existing[0];
      const elapsedSeconds = Math.floor((Date.now() - sess.lastActiveAt.getTime()) / 1000);
      const newTotal = (sess.totalSeconds || 0) + Math.min(elapsedSeconds, 120);
      await db.update(userSessions)
        .set({ endedAt: new Date(), isActive: false, lastActiveAt: new Date(), totalSeconds: newTotal })
        .where(eq(userSessions.id, sess.id));
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

// GET /api/activity/overview — super admin: all users with activity summary
router.get("/overview", requireSuperAdmin, async (_req, res) => {
  try {
    const users = await db.select().from(usersTable).orderBy(usersTable.fullName);

    // For each user, get total time and recent activity
    const result = await Promise.all(users.map(async (u) => {
      // Total session seconds
      const sessionRows = await db.select({
        totalSeconds: sql<number>`coalesce(sum(${userSessions.totalSeconds}), 0)`,
        sessionsCount: sql<number>`count(*)`,
      }).from(userSessions).where(eq(userSessions.userId, u.id));

      // Last active (most recent heartbeat)
      const lastSession = await db.select().from(userSessions)
        .where(eq(userSessions.userId, u.id))
        .orderBy(desc(userSessions.lastActiveAt))
        .limit(1);

      // Recent activities
      const activities = await db.select().from(userActivityLogs)
        .where(eq(userActivityLogs.userId, u.id))
        .orderBy(desc(userActivityLogs.createdAt))
        .limit(5);

      // Is currently online (heartbeat within last 2 minutes)
      const isOnline = lastSession.length > 0 && lastSession[0].isActive &&
        (Date.now() - lastSession[0].lastActiveAt.getTime()) < 2 * 60 * 1000;

      return {
        id: u.id,
        username: u.username,
        fullName: u.fullName,
        role: u.role,
        totalSeconds: Number(sessionRows[0]?.totalSeconds ?? 0),
        sessionsCount: Number(sessionRows[0]?.sessionsCount ?? 0),
        lastActiveAt: lastSession[0]?.lastActiveAt ?? null,
        isOnline,
        recentActivities: activities,
      };
    }));

    res.json(result);
  } catch (err) {
    console.error("activity overview error:", err);
    res.status(500).json({ error: "Failed" });
  }
});

// GET /api/activity/user/:id — super admin: full activity log for one user
router.get("/user/:id", requireSuperAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) return res.status(404).json({ error: "User not found" });

    const activities = await db.select().from(userActivityLogs)
      .where(eq(userActivityLogs.userId, userId))
      .orderBy(desc(userActivityLogs.createdAt))
      .limit(200);

    const sessions = await db.select().from(userSessions)
      .where(eq(userSessions.userId, userId))
      .orderBy(desc(userSessions.startedAt))
      .limit(50);

    const totalSeconds = sessions.reduce((sum, s) => sum + (s.totalSeconds || 0), 0);
    const createdTests = await db.select().from(testsTable).where(eq(testsTable.createdBy, userId));
    const createdTestIds = createdTests.map((test) => test.id);
    const testQuestions = createdTestIds.length > 0
      ? await db.select().from(testQuestionsTable).where(inArray(testQuestionsTable.testId, createdTestIds))
      : [];
    const questionBankQuestions = await db.select().from(questionBankQuestionsTable).where(eq(questionBankQuestionsTable.createdBy, userId));
    const questionBankReports = await db.select().from(questionBankReportsTable).where(eq(questionBankReportsTable.teacherId, userId));
    const openQuestionBankReports = questionBankReports.filter((report) => report.status === "open");

    res.json({
      user: { id: user.id, username: user.username, fullName: user.fullName, role: user.role },
      totalSeconds,
      sessions,
      activities,
      stats: {
        testsCreated: createdTests.length,
        testQuestionsCreated: testQuestions.length,
        questionBankQuestionsCreated: questionBankQuestions.length,
        reportedQuestionsReceived: questionBankReports.length,
        openReportedQuestions: openQuestionBankReports.length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
