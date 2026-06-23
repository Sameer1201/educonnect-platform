import { Router, type IRouter } from "express";
import { db, notificationsTable, notificationPreferencesTable, usersTable } from "@workspace/db";
import { eq, and, desc, lt } from "drizzle-orm";
import { addSSEClient } from "../lib/sseClients";
import { pushNotificationToMany } from "../lib/pushNotification";
import {
  createBrevoProviderConfig,
  getBrevoProviderUsageSummary,
  listBrevoEmailSendLogs,
  setBrevoProviderActiveState,
} from "../lib/brevo";

const router: IRouter = Router();

function getUser(req: any) {
  const userId = req.cookies?.userId ? parseInt(req.cookies.userId, 10) : null;
  return userId;
}

function requireSuperAdmin(req: any, res: any) {
  const userId = getUser(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  if (req.cookies?.userRole !== "super_admin") {
    res.status(403).json({ error: "Only super admin can access this section" });
    return null;
  }
  return userId;
}

/* ── SSE stream ── */
router.get("/notifications/stream", (req, res): void => {
  const userId = getUser(req);
  if (!userId) { res.status(401).end(); return; }
  addSSEClient(userId, res);
  // Keep the request open (SSE handles cleanup on close)
});

/* ── List (paginated) ── */
router.get("/notifications", async (req, res): Promise<void> => {
  const userId = getUser(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 100);
  const cursor = req.query.cursor ? parseInt(String(req.query.cursor), 10) : null;

  let query = db
    .select()
    .from(notificationsTable)
    .where(
      cursor
        ? and(eq(notificationsTable.userId, userId), lt(notificationsTable.id, cursor))
        : eq(notificationsTable.userId, userId)
    )
    .orderBy(desc(notificationsTable.id))
    .limit(limit + 1);

  const rows = await query;
  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit);

  res.json({
    notifications: data.map((n) => ({ ...n, createdAt: n.createdAt?.toISOString() ?? null })),
    hasMore,
    nextCursor: hasMore ? data[data.length - 1].id : null,
  });
});

/* ── Unread count ── */
router.get("/notifications/unread-count", async (req, res): Promise<void> => {
  const userId = getUser(req);
  if (!userId) { res.json({ count: 0 }); return; }

  const all = await db
    .select({ id: notificationsTable.id })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.isRead, false)));

  res.json({ count: all.length });
});

/* ── Mark one read ── */
router.patch("/notifications/:id/read", async (req, res): Promise<void> => {
  const userId = getUser(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id);
  await db.update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, userId)));
  res.json({ ok: true });
});

/* ── Mark all read ── */
router.patch("/notifications/read-all", async (req, res): Promise<void> => {
  const userId = getUser(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  await db.update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.isRead, false)));
  res.json({ ok: true });
});

/* ── Delete one ── */
router.delete("/notifications/:id", async (req, res): Promise<void> => {
  const userId = getUser(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id);
  await db.delete(notificationsTable)
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, userId)));
  res.json({ ok: true });
});

/* ── Delete all read ── */
router.delete("/notifications/clear-read", async (req, res): Promise<void> => {
  const userId = getUser(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  await db.delete(notificationsTable)
    .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.isRead, true)));
  res.json({ ok: true });
});

/* ── Delete ALL ── */
router.delete("/notifications/clear-all", async (req, res): Promise<void> => {
  const userId = getUser(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  await db.delete(notificationsTable).where(eq(notificationsTable.userId, userId));
  res.json({ ok: true });
});

/* ══════════════════════════════════════
   NOTIFICATION PREFERENCES
══════════════════════════════════════ */

/* ── Get preferences ── */
router.get("/notification-preferences", async (req, res): Promise<void> => {
  const userId = getUser(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [pref] = await db
    .select()
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, userId))
    .limit(1);

  if (!pref) {
    // Return defaults
    res.json({
      assignment: true, grade: true, test: true, class: true,
      system: true, community: true, digest: true, weeklyDigest: true,
    });
    return;
  }

  res.json({
    assignment: pref.assignment,
    grade: pref.grade,
    test: pref.test,
    class: pref.class,
    system: pref.system,
    community: pref.community,
    digest: pref.digest,
    weeklyDigest: pref.weeklyDigest,
  });
});

/* ── Update preferences ── */
router.patch("/notification-preferences", async (req, res): Promise<void> => {
  const userId = getUser(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const allowed = ["assignment", "grade", "test", "class", "system", "community", "digest", "weeklyDigest"];
  const updates: any = { updatedAt: new Date() };
  for (const key of allowed) {
    if (key in req.body) updates[key] = Boolean(req.body[key]);
  }

  const [existing] = await db
    .select({ id: notificationPreferencesTable.id })
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, userId))
    .limit(1);

  if (existing) {
    await db.update(notificationPreferencesTable).set(updates)
      .where(eq(notificationPreferencesTable.userId, userId));
  } else {
    await db.insert(notificationPreferencesTable).values({ userId, ...updates });
  }

  res.json({ ok: true });
});

/* ── Broadcast (super_admin only) ── */
router.post("/notifications/broadcast", async (req, res): Promise<void> => {
  const userId = getUser(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const callerRole = req.cookies?.userRole;
  if (callerRole !== "super_admin") { res.status(403).json({ error: "Only super admin can broadcast notifications" }); return; }

  const { title, message, link, type, target } = req.body as {
    title: string;
    message?: string;
    link?: string;
    type: string;
    target: "all" | "admins" | "students";
  };

  if (!title?.trim()) { res.status(400).json({ error: "Title is required" }); return; }
  if (!["all", "admins", "students"].includes(target)) { res.status(400).json({ error: "Invalid target" }); return; }

  let users = await db.select({ id: usersTable.id, role: usersTable.role }).from(usersTable);

  if (target === "admins") users = users.filter((u) => u.role === "admin");
  else if (target === "students") users = users.filter((u) => u.role === "student");
  else users = users.filter((u) => u.role !== "super_admin");

  const userIds = users.map((u) => u.id);
  await pushNotificationToMany(userIds, {
    type: type ?? "system",
    title: title.trim(),
    message: message?.trim() ?? null,
    link: link?.trim() ?? null,
  });

  res.json({ sent: userIds.length });
});

router.get("/notifications/email-providers/usage", async (req, res): Promise<void> => {
  const callerId = requireSuperAdmin(req, res);
  if (!callerId) return;

  const summary = await getBrevoProviderUsageSummary();
  res.json(summary);
});

router.get("/notifications/email-log", async (req, res): Promise<void> => {
  const callerId = requireSuperAdmin(req, res);
  if (!callerId) return;

  const rawLimit = parseInt(String(req.query.limit ?? "50"), 10);
  const logs = await listBrevoEmailSendLogs(Number.isFinite(rawLimit) ? rawLimit : 50);
  res.json({ logs });
});

router.post("/notifications/email-providers", async (req, res): Promise<void> => {
  const callerId = requireSuperAdmin(req, res);
  if (!callerId) return;

  const providerName = typeof req.body?.providerName === "string" ? req.body.providerName.trim() : "";
  const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";
  const senderEmail = typeof req.body?.senderEmail === "string" ? req.body.senderEmail.trim() : "";
  const senderName = typeof req.body?.senderName === "string" ? req.body.senderName.trim() : "";
  const dailyLimit = Number(req.body?.dailyLimit);

  if (!providerName) {
    res.status(400).json({ error: "Account label is required." });
    return;
  }
  if (!apiKey) {
    res.status(400).json({ error: "Brevo API key is required." });
    return;
  }
  if (!senderEmail) {
    res.status(400).json({ error: "Sender email is required." });
    return;
  }

  try {
    const provider = await createBrevoProviderConfig({
      providerName,
      apiKey,
      senderEmail,
      senderName,
      dailyLimit: Number.isFinite(dailyLimit) ? dailyLimit : undefined,
      createdById: callerId,
    });

    res.status(201).json({ provider });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to add Brevo account.",
    });
  }
});

router.patch("/notifications/email-providers/:id", async (req, res): Promise<void> => {
  const callerId = requireSuperAdmin(req, res);
  if (!callerId) return;

  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Valid provider id is required." });
    return;
  }

  const isActive = Boolean(req.body?.isActive);

  try {
    const provider = await setBrevoProviderActiveState({ id, isActive });
    res.json({ provider });
  } catch (error) {
    res.status(404).json({
      error: error instanceof Error ? error.message : "Failed to update Brevo account.",
    });
  }
});

export default router;
