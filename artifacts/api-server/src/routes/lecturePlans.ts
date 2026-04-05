import { Router, type IRouter } from "express";
import { asc, eq, inArray } from "drizzle-orm";
import { db, lecturePlansTable, usersTable } from "@workspace/db";
import { pushNotificationToMany } from "../lib/pushNotification";

const router: IRouter = Router();

function getAuth(req: any, res: any): { userId: number; role: string } | null {
  const userIdCookie = req.cookies?.userId;
  const roleCookie = req.cookies?.userRole;

  if (!userIdCookie || !roleCookie) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }

  const userId = parseInt(userIdCookie, 10);
  if (Number.isNaN(userId)) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }

  return { userId, role: roleCookie };
}

async function serializePlans(plans: Array<typeof lecturePlansTable.$inferSelect>) {
  const teacherIds = [...new Set(plans.map((plan) => plan.teacherId))];
  const plannerIds = [...new Set(plans.map((plan) => plan.plannerId))];
  const allUserIds = [...new Set([...teacherIds, ...plannerIds])];

  const users = allUserIds.length > 0
    ? await db
        .select({ id: usersTable.id, fullName: usersTable.fullName, username: usersTable.username })
        .from(usersTable)
        .where(inArray(usersTable.id, allUserIds))
    : [];

  const userMap = new Map(users.map((user) => [user.id, user]));

  return plans.map((plan) => ({
    id: plan.id,
    title: plan.title,
    subject: plan.subject,
    description: plan.description,
    scheduledAt: plan.scheduledAt,
    teacherId: plan.teacherId,
    teacherName: userMap.get(plan.teacherId)?.fullName ?? null,
    teacherUsername: userMap.get(plan.teacherId)?.username ?? null,
    plannerId: plan.plannerId,
    plannerName: userMap.get(plan.plannerId)?.fullName ?? null,
    plannerUsername: userMap.get(plan.plannerId)?.username ?? null,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  }));
}

router.get("/lecture-plans", async (req, res): Promise<void> => {
  const auth = getAuth(req, res);
  if (!auth) return;

  if (!["super_admin", "admin", "planner"].includes(auth.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const plans = auth.role === "super_admin"
    ? await db.select().from(lecturePlansTable).orderBy(asc(lecturePlansTable.scheduledAt))
    : auth.role === "admin"
      ? await db
          .select()
          .from(lecturePlansTable)
          .where(eq(lecturePlansTable.teacherId, auth.userId))
          .orderBy(asc(lecturePlansTable.scheduledAt))
      : await db
          .select()
          .from(lecturePlansTable)
          .where(eq(lecturePlansTable.plannerId, auth.userId))
          .orderBy(asc(lecturePlansTable.scheduledAt));

  res.json(await serializePlans(plans));
});

router.post("/lecture-plans", async (req, res): Promise<void> => {
  const auth = getAuth(req, res);
  if (!auth) return;

  if (!["planner", "super_admin"].includes(auth.role)) {
    res.status(403).json({ error: "Only planners can create lecture plans" });
    return;
  }

  const { title, subject, description, scheduledAt, teacherId } = req.body ?? {};

  if (typeof title !== "string" || !title.trim()) {
    res.status(400).json({ error: "Title is required" });
    return;
  }
  if (typeof subject !== "string" || !subject.trim()) {
    res.status(400).json({ error: "Subject is required" });
    return;
  }
  if (typeof scheduledAt !== "string" || Number.isNaN(Date.parse(scheduledAt))) {
    res.status(400).json({ error: "A valid scheduled date/time is required" });
    return;
  }

  const parsedTeacherId = Number(teacherId);
  if (!Number.isInteger(parsedTeacherId) || parsedTeacherId <= 0) {
    res.status(400).json({ error: "A valid teacher is required" });
    return;
  }

  const [teacher] = await db
    .select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, parsedTeacherId));

  if (!teacher || teacher.role !== "admin") {
    res.status(400).json({ error: "Selected teacher is invalid" });
    return;
  }

  const [created] = await db.insert(lecturePlansTable).values({
    title: title.trim(),
    subject: subject.trim(),
    description: typeof description === "string" && description.trim() ? description.trim() : null,
    scheduledAt: new Date(scheduledAt),
    teacherId: parsedTeacherId,
    plannerId: auth.userId,
  }).returning();

  await pushNotificationToMany([parsedTeacherId], {
    type: "system",
    title: `New planner event: ${title.trim()}`,
    message: `A planner scheduled ${subject.trim()} for ${scheduledAt}.`,
    link: "/schedule",
  });

  res.status(201).json((await serializePlans([created]))[0]);
});

router.patch("/lecture-plans/:id", async (req, res): Promise<void> => {
  const auth = getAuth(req, res);
  if (!auth) return;

  if (!["planner", "super_admin"].includes(auth.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid lecture plan id" });
    return;
  }

  const [existing] = await db.select().from(lecturePlansTable).where(eq(lecturePlansTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Lecture plan not found" });
    return;
  }

  if (auth.role === "planner" && existing.plannerId !== auth.userId) {
    res.status(403).json({ error: "You can only edit your own lecture plans" });
    return;
  }

  const previousScheduledAt = existing.scheduledAt;
  const previousTeacherId = existing.teacherId;
  const updates: Record<string, unknown> = {};
  const { title, subject, description, scheduledAt, teacherId } = req.body ?? {};

  if (title !== undefined) {
    if (typeof title !== "string" || !title.trim()) {
      res.status(400).json({ error: "Title must be a non-empty string" });
      return;
    }
    updates.title = title.trim();
  }

  if (subject !== undefined) {
    if (typeof subject !== "string" || !subject.trim()) {
      res.status(400).json({ error: "Subject must be a non-empty string" });
      return;
    }
    updates.subject = subject.trim();
  }

  if (description !== undefined) {
    updates.description = typeof description === "string" && description.trim() ? description.trim() : null;
  }

  if (scheduledAt !== undefined) {
    if (typeof scheduledAt !== "string" || Number.isNaN(Date.parse(scheduledAt))) {
      res.status(400).json({ error: "A valid scheduled date/time is required" });
      return;
    }
    updates.scheduledAt = new Date(scheduledAt);
  }

  if (teacherId !== undefined) {
    const parsedTeacherId = Number(teacherId);
    if (!Number.isInteger(parsedTeacherId) || parsedTeacherId <= 0) {
      res.status(400).json({ error: "A valid teacher is required" });
      return;
    }

    const [teacher] = await db
      .select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, parsedTeacherId));

    if (!teacher || teacher.role !== "admin") {
      res.status(400).json({ error: "Selected teacher is invalid" });
      return;
    }

    updates.teacherId = parsedTeacherId;
  }

  const [updated] = await db
    .update(lecturePlansTable)
    .set(updates)
    .where(eq(lecturePlansTable.id, id))
    .returning();

  const notifyIds = new Set<number>([updated.teacherId]);
  if (previousTeacherId !== updated.teacherId) notifyIds.add(previousTeacherId);

  if ((updates.scheduledAt || updates.teacherId) && notifyIds.size > 0) {
    const changedSchedule = updates.scheduledAt
      ? `Rescheduled from ${previousScheduledAt?.toISOString() ?? "unscheduled"} to ${updated.scheduledAt?.toISOString() ?? "unscheduled"}.`
      : "Teacher assignment updated.";
    await pushNotificationToMany([...notifyIds], {
      type: "system",
      title: `Planner updated: ${updated.title}`,
      message: changedSchedule,
      link: "/schedule",
    });
  }

  res.json((await serializePlans([updated]))[0]);
});

router.delete("/lecture-plans/:id", async (req, res): Promise<void> => {
  const auth = getAuth(req, res);
  if (!auth) return;

  if (!["planner", "super_admin"].includes(auth.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid lecture plan id" });
    return;
  }

  const [existing] = await db.select().from(lecturePlansTable).where(eq(lecturePlansTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Lecture plan not found" });
    return;
  }

  if (auth.role === "planner" && existing.plannerId !== auth.userId) {
    res.status(403).json({ error: "You can only delete your own lecture plans" });
    return;
  }

  await db.delete(lecturePlansTable).where(eq(lecturePlansTable.id, id));
  res.sendStatus(204);
});

export { router as lecturePlansRouter };
