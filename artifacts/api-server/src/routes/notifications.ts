import { Router, type IRouter } from "express";
import { db, notificationsTable, notificationPreferencesTable, usersTable } from "@workspace/db";
import { eq, and, desc, lt } from "drizzle-orm";
import { addSSEClient } from "../lib/sseClients";
import { pushNotificationToMany } from "../lib/pushNotification";

const router: IRouter = Router();

function getUser(req: any) {
  const userId = req.cookies?.userId ? parseInt(req.cookies.userId, 10) : null;
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

export default router;
