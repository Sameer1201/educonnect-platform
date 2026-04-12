import { Router, type IRouter } from "express";
import { db, classesTable, enrollmentsTable, usersTable, whiteboardsTable, feedbackTable, subjectsTable } from "@workspace/db";
import { pushNotificationToMany } from "../lib/pushNotification";
import { eq, count, and, inArray } from "drizzle-orm";
import {
  ListClassesQueryParams,
  CreateClassBody,
  GetClassParams,
  UpdateClassParams,
  UpdateClassBody,
  DeleteClassParams,
  StartClassParams,
  EndClassParams,
  EnrollInClassParams,
  GetClassEnrollmentsParams,
} from "@workspace/api-zod";
import { autoEnrollApprovedStudentsForClass } from "../lib/batchAssignment";

const router: IRouter = Router();

function getAuth(req: any, res: any): { userId: number; role: string } | null {
  const userId = Number(req.cookies?.userId);
  const role = req.cookies?.userRole;

  if (!userId || Number.isNaN(userId) || !role) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }

  return { userId, role };
}

async function validateTeacher(teacherId: number) {
  const [teacher] = await db
    .select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, teacherId));

  if (!teacher || teacher.role !== "admin") return null;
  return teacher;
}

function canManageClass(auth: { userId: number; role: string }, cls: typeof classesTable.$inferSelect) {
  if (auth.role === "super_admin") return true;
  if (auth.role === "admin") return cls.adminId === auth.userId;
  if (auth.role === "planner") return cls.plannerId === auth.userId;
  return false;
}

async function getEnrolledCount(classId: number): Promise<number> {
  const [result] = await db
    .select({ count: count() })
    .from(enrollmentsTable)
    .where(eq(enrollmentsTable.classId, classId));
  return result?.count ?? 0;
}

async function serializeClass(cls: typeof classesTable.$inferSelect, studentId?: number) {
  const enrolledCount = await getEnrolledCount(cls.id);
  const [admin] = await db.select({ fullName: usersTable.fullName }).from(usersTable).where(eq(usersTable.id, cls.adminId));
  let isEnrolled = false;
  if (studentId) {
    const [row] = await db.select({ id: enrollmentsTable.id }).from(enrollmentsTable)
      .where(and(eq(enrollmentsTable.classId, cls.id), eq(enrollmentsTable.studentId, studentId)));
    isEnrolled = !!row;
  }
  return {
    ...cls,
    enrolledCount,
    isEnrolled,
    adminName: admin?.fullName ?? null,
    scheduledAt: cls.scheduledAt?.toISOString() ?? null,
    startedAt: cls.startedAt?.toISOString() ?? null,
    endedAt: cls.endedAt?.toISOString() ?? null,
    weeklyTargetDeadline: cls.weeklyTargetDeadline?.toISOString() ?? null,
  };
}

router.get("/classes", async (req, res): Promise<void> => {
  const auth = getAuth(req, res);
  if (!auth) return;

  const params = ListClassesQueryParams.safeParse(req.query);
  const studentId = auth.role === "student" ? auth.userId : undefined;

  let classes = auth.role === "super_admin"
    ? await db.select().from(classesTable).orderBy(classesTable.createdAt)
    : auth.role === "admin"
      ? await db.select().from(classesTable).where(eq(classesTable.adminId, auth.userId)).orderBy(classesTable.createdAt)
      : auth.role === "planner"
        ? await db.select().from(classesTable).where(eq(classesTable.plannerId, auth.userId)).orderBy(classesTable.createdAt)
        : await db.select().from(classesTable).orderBy(classesTable.createdAt);

  if (auth.role === "admin") {
    const subjectAssignments = await db
      .select({ classId: subjectsTable.classId })
      .from(subjectsTable)
      .where(eq(subjectsTable.teacherId, auth.userId));
    const extraClassIds = [...new Set(subjectAssignments.map((item) => item.classId).filter((id) => !classes.some((cls) => cls.id === id)))];
    if (extraClassIds.length > 0) {
      const extraClasses = await db.select().from(classesTable).where(inArray(classesTable.id, extraClassIds));
      classes = [...classes, ...extraClasses].sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return aTime - bTime;
      });
    }
  }

  if (params.success && params.data.status) {
    classes = classes.filter((c) => c.status === params.data.status);
  }

  const serialized = await Promise.all(classes.map((c) => serializeClass(c, studentId)));
  res.json(serialized);
});

router.post("/classes", async (req, res): Promise<void> => {
  const auth = getAuth(req, res);
  if (!auth) return;

  if (!["admin", "planner", "super_admin"].includes(auth.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = CreateClassBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { title, description, subject, scheduledAt, maxStudents, meetingLink } = parsed.data;
  let teacherId = auth.userId;

  if (auth.role === "planner" || auth.role === "super_admin") {
    const requestedTeacherId = Number((req.body as any)?.adminId);
    if (!requestedTeacherId || Number.isNaN(requestedTeacherId)) {
      res.status(400).json({ error: "A valid teacher is required" });
      return;
    }

    const teacher = await validateTeacher(requestedTeacherId);
    if (!teacher) {
      res.status(400).json({ error: "Selected teacher is invalid" });
      return;
    }

    teacherId = teacher.id;
  }

  const [newClass] = await db.insert(classesTable).values({
    title,
    description: description ?? null,
    subject,
    adminId: teacherId,
    plannerId: auth.role === "planner" ? auth.userId : null,
    status: "scheduled",
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    maxStudents: maxStudents ?? null,
    meetingLink: meetingLink ?? null,
  }).returning();

  await autoEnrollApprovedStudentsForClass(newClass);

  const serialized = await serializeClass(newClass);
  res.status(201).json(serialized);
});

router.get("/classes/:id", async (req, res): Promise<void> => {
  const auth = getAuth(req, res);
  if (!auth) return;

  const params = GetClassParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, params.data.id));
  if (!cls) {
    res.status(404).json({ error: "Class not found" });
    return;
  }

  if ((auth.role === "admin" || auth.role === "planner") && !canManageClass(auth, cls)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const studentId = auth.role === "student" ? auth.userId : undefined;
  const serialized = await serializeClass(cls, studentId);
  res.json(serialized);
});

router.patch("/classes/:id", async (req, res): Promise<void> => {
  const auth = getAuth(req, res);
  if (!auth) return;

  const params = UpdateClassParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateClassBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  if (!["admin", "planner", "super_admin"].includes(auth.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [existing] = await db.select().from(classesTable).where(eq(classesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Class not found" });
    return;
  }

  if (!canManageClass(auth, existing)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const updateData: Record<string, unknown> = {};
  const previousScheduledAt = existing.scheduledAt;
  const previousTeacherId = existing.adminId;
  if (body.data.title != null) updateData.title = body.data.title;
  if (body.data.description !== undefined) updateData.description = body.data.description;
  if (body.data.subject != null) updateData.subject = body.data.subject;
  if (body.data.scheduledAt !== undefined) updateData.scheduledAt = body.data.scheduledAt ? new Date(body.data.scheduledAt) : null;
  if (body.data.maxStudents !== undefined) updateData.maxStudents = body.data.maxStudents;
  if (body.data.meetingLink !== undefined) updateData.meetingLink = body.data.meetingLink;
  if (body.data.status != null) updateData.status = body.data.status;

  const requestedTeacherId = (req.body as any)?.adminId;
  if (requestedTeacherId !== undefined) {
    if (auth.role !== "planner" && auth.role !== "super_admin") {
      res.status(403).json({ error: "Only planners can reassign teachers" });
      return;
    }

    const teacher = await validateTeacher(Number(requestedTeacherId));
    if (!teacher) {
      res.status(400).json({ error: "Selected teacher is invalid" });
      return;
    }

    updateData.adminId = teacher.id;
  }

  const [updated] = await db
    .update(classesTable)
    .set(updateData)
    .where(eq(classesTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Class not found" });
    return;
  }

  await autoEnrollApprovedStudentsForClass(updated);

  const enrolledStudentIds = await db
    .select({ studentId: enrollmentsTable.studentId })
    .from(enrollmentsTable)
    .where(eq(enrollmentsTable.classId, updated.id))
    .then((rows) => rows.map((row) => row.studentId));

  if (body.data.scheduledAt !== undefined && updated.scheduledAt) {
    const wasRescheduled = !previousScheduledAt || new Date(previousScheduledAt).getTime() !== new Date(updated.scheduledAt).getTime();
    if (wasRescheduled) {
      await pushNotificationToMany([updated.adminId, ...enrolledStudentIds], {
        type: "class",
        title: `Schedule updated: ${updated.title}`,
        message: `Planner rescheduled this class to ${updated.scheduledAt.toISOString()}.`,
        link: updated.adminId === auth.userId ? "/schedule" : null,
      });
    }
  }

  if (updateData.adminId && Number(updateData.adminId) !== previousTeacherId) {
    await pushNotificationToMany([Number(updateData.adminId), ...enrolledStudentIds], {
      type: "system",
      title: `Teacher reassigned: ${updated.title}`,
      message: "Planner updated the assigned teacher for this class.",
      link: "/schedule",
    });
  }

  const serialized = await serializeClass(updated);
  res.json(serialized);
});

router.delete("/classes/:id", async (req, res): Promise<void> => {
  const auth = getAuth(req, res);
  if (!auth) return;
  if (!["admin", "planner", "super_admin"].includes(auth.role)) { res.status(403).json({ error: "Forbidden" }); return; }

  const params = DeleteClassParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, params.data.id));
  if (!cls) { res.status(404).json({ error: "Class not found" }); return; }

  if (!canManageClass(auth, cls)) {
    res.status(403).json({ error: "You can only delete your own classes" }); return;
  }

  // Delete non-cascading FK dependents first
  await db.delete(feedbackTable).where(eq(feedbackTable.classId, params.data.id));
  await db.delete(enrollmentsTable).where(eq(enrollmentsTable.classId, params.data.id));
  await db.delete(whiteboardsTable).where(eq(whiteboardsTable.classId, params.data.id));
  await db.delete(classesTable).where(eq(classesTable.id, params.data.id));
  res.sendStatus(204);
});

router.patch("/classes/:id/start", async (req, res): Promise<void> => {
  const auth = getAuth(req, res);
  if (!auth) return;
  if (auth.role !== "admin" && auth.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const params = StartClassParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db.select().from(classesTable).where(eq(classesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Class not found" });
    return;
  }
  if (auth.role === "admin" && existing.adminId !== auth.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [updated] = await db
    .update(classesTable)
    .set({ status: "live", startedAt: new Date() })
    .where(eq(classesTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Class not found" });
    return;
  }

  const serialized = await serializeClass(updated);

  // Notify enrolled students that class is now live
  try {
    const enrollments = await db
      .select({ studentId: enrollmentsTable.studentId })
      .from(enrollmentsTable)
      .where(eq(enrollmentsTable.classId, updated.id));
    const studentIds = enrollments.map((e) => e.studentId);
    if (studentIds.length > 0) {
      await pushNotificationToMany(studentIds, {
        type: "class",
        title: `Class is Live: ${updated.title}`,
        message: "Your class has started. Join now!",
        link: `/student/classes/${updated.id}`,
      });
    }
  } catch { /* non-critical */ }

  res.json(serialized);
});

router.patch("/classes/:id/end", async (req, res): Promise<void> => {
  const auth = getAuth(req, res);
  if (!auth) return;
  if (auth.role !== "admin" && auth.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const params = EndClassParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db.select().from(classesTable).where(eq(classesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Class not found" });
    return;
  }
  if (auth.role === "admin" && existing.adminId !== auth.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [updated] = await db
    .update(classesTable)
    .set({ status: "completed", endedAt: new Date() })
    .where(eq(classesTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Class not found" });
    return;
  }

  const serialized = await serializeClass(updated);
  res.json(serialized);
});

router.post("/classes/:id/enroll", async (req, res): Promise<void> => {
  const params = EnrollInClassParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userIdCookie = req.cookies?.userId;
  const studentId = userIdCookie ? parseInt(userIdCookie, 10) : null;
  if (!studentId || isNaN(studentId)) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    await db.insert(enrollmentsTable).values({
      studentId,
      classId: params.data.id,
    });
    res.json({ message: "Enrolled successfully" });
  } catch {
    res.status(400).json({ error: "Already enrolled or class not found" });
  }
});

router.delete("/classes/:id/enroll", async (req, res): Promise<void> => {
  const userIdCookie = req.cookies?.userId;
  const studentId = userIdCookie ? parseInt(userIdCookie, 10) : null;
  if (!studentId || isNaN(studentId)) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const classId = parseInt(req.params.id, 10);
  await db.delete(enrollmentsTable).where(
    and(eq(enrollmentsTable.studentId, studentId), eq(enrollmentsTable.classId, classId))
  );
  res.sendStatus(204);
});

router.get("/classes/:id/enrollments", async (req, res): Promise<void> => {
  const auth = getAuth(req, res);
  if (!auth) return;

  const params = GetClassEnrollmentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, params.data.id));
  if (!cls) {
    res.status(404).json({ error: "Class not found" });
    return;
  }

  if (!canManageClass(auth, cls)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const enrollments = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      fullName: usersTable.fullName,
      email: usersTable.email,
      role: usersTable.role,
      status: usersTable.status,
      phone: usersTable.phone,
      subject: usersTable.subject,
      createdAt: usersTable.createdAt,
    })
    .from(enrollmentsTable)
    .innerJoin(usersTable, eq(enrollmentsTable.studentId, usersTable.id))
    .where(eq(enrollmentsTable.classId, params.data.id));

  res.json(enrollments);
});

export { enrollmentsTable };
export default router;
