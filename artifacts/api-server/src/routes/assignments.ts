import { Router, type IRouter } from "express";
import {
  db, assignmentsTable, assignmentSubmissionsTable,
  classesTable, enrollmentsTable, usersTable
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { pushNotification, pushNotificationToMany } from "../lib/pushNotification";

const router: IRouter = Router();

function getUser(req: any) {
  const userId = req.cookies?.userId ? parseInt(req.cookies.userId, 10) : null;
  const userRole = req.cookies?.userRole ?? null;
  return { userId, userRole };
}

async function notifyStudents(classId: number, title: string, message: string, link: string) {
  const enrollments = await db.select().from(enrollmentsTable).where(eq(enrollmentsTable.classId, classId));
  if (enrollments.length === 0) return;
  const userIds = enrollments.map((e) => e.studentId);
  await pushNotificationToMany(userIds, { type: "assignment", title, message, link });
}

router.get("/assignments", async (req, res): Promise<void> => {
  const { userId, userRole } = getUser(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  if (userRole === "admin") {
    const assignments = await db
      .select()
      .from(assignmentsTable)
      .where(eq(assignmentsTable.createdBy, userId))
      .orderBy(assignmentsTable.createdAt);

    const classIds = [...new Set(assignments.map((a) => a.classId))];
    const classes = classIds.length
      ? await db.select({ id: classesTable.id, title: classesTable.title }).from(classesTable).where(inArray(classesTable.id, classIds))
      : [];
    const classMap = new Map(classes.map((c) => [c.id, c.title]));

    const subs = await db
      .select()
      .from(assignmentSubmissionsTable)
      .where(inArray(assignmentSubmissionsTable.assignmentId, assignments.map((a) => a.id)));

    const subCountMap = new Map<number, number>();
    for (const s of subs) {
      subCountMap.set(s.assignmentId, (subCountMap.get(s.assignmentId) ?? 0) + 1);
    }

    res.json(assignments.map((a) => ({
      ...a,
      dueAt: a.dueAt?.toISOString() ?? null,
      createdAt: a.createdAt?.toISOString() ?? null,
      className: classMap.get(a.classId) ?? null,
      submissionCount: subCountMap.get(a.id) ?? 0,
    })));
    return;
  }

  if (userRole === "student") {
    const enrollments = await db.select().from(enrollmentsTable).where(eq(enrollmentsTable.studentId, userId));
    const classIds = enrollments.map((e) => e.classId);
    if (classIds.length === 0) { res.json([]); return; }

    const assignments = await db
      .select()
      .from(assignmentsTable)
      .where(and(eq(assignmentsTable.isPublished, true), inArray(assignmentsTable.classId, classIds)))
      .orderBy(assignmentsTable.dueAt);

    const classes = await db.select({ id: classesTable.id, title: classesTable.title }).from(classesTable).where(inArray(classesTable.id, classIds));
    const classMap = new Map(classes.map((c) => [c.id, c.title]));

    const mySubs = await db
      .select()
      .from(assignmentSubmissionsTable)
      .where(and(
        eq(assignmentSubmissionsTable.studentId, userId),
        inArray(assignmentSubmissionsTable.assignmentId, assignments.map((a) => a.id))
      ));
    const mySubMap = new Map(mySubs.map((s) => [s.assignmentId, s]));

    res.json(assignments.map((a) => ({
      ...a,
      dueAt: a.dueAt?.toISOString() ?? null,
      createdAt: a.createdAt?.toISOString() ?? null,
      className: classMap.get(a.classId) ?? null,
      submission: mySubMap.has(a.id)
        ? { ...mySubMap.get(a.id)!, submittedAt: mySubMap.get(a.id)!.submittedAt?.toISOString() ?? null, gradedAt: mySubMap.get(a.id)!.gradedAt?.toISOString() ?? null, fileData: null }
        : null,
    })));
    return;
  }

  if (userRole === "super_admin") {
    const assignments = await db.select().from(assignmentsTable).orderBy(assignmentsTable.createdAt);
    const classIds = [...new Set(assignments.map((a) => a.classId))];
    const classes = classIds.length
      ? await db.select({ id: classesTable.id, title: classesTable.title }).from(classesTable).where(inArray(classesTable.id, classIds))
      : [];
    const classMap = new Map(classes.map((c) => [c.id, c.title]));
    res.json(assignments.map((a) => ({ ...a, dueAt: a.dueAt?.toISOString() ?? null, createdAt: a.createdAt?.toISOString() ?? null, className: classMap.get(a.classId) ?? null })));
    return;
  }

  res.status(403).json({ error: "Forbidden" });
});

router.post("/assignments", async (req, res): Promise<void> => {
  const { userId, userRole } = getUser(req);
  if (!userId || userRole !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

  const { classId, title, description, dueAt, maxMarks, isPublished } = req.body;
  if (!classId || !title) { res.status(400).json({ error: "classId and title required" }); return; }

  const [assignment] = await db.insert(assignmentsTable).values({
    classId: parseInt(classId),
    createdBy: userId,
    title,
    description: description ?? null,
    dueAt: dueAt ? new Date(dueAt) : null,
    maxMarks: maxMarks ? parseInt(maxMarks) : 100,
    isPublished: isPublished ?? false,
  }).returning();

  if (isPublished) {
    await notifyStudents(
      parseInt(classId),
      `New Assignment: ${title}`,
      description ?? "A new assignment has been posted.",
      "/student/assignments"
    );
  }

  res.json({ ...assignment, dueAt: assignment.dueAt?.toISOString() ?? null, createdAt: assignment.createdAt?.toISOString() ?? null });
});

router.patch("/assignments/:id", async (req, res): Promise<void> => {
  const { userId, userRole } = getUser(req);
  if (!userId || userRole !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

  const id = parseInt(req.params.id);
  const { title, description, dueAt, maxMarks, isPublished } = req.body;

  const existing = await db.select().from(assignmentsTable).where(and(eq(assignmentsTable.id, id), eq(assignmentsTable.createdBy, userId)));
  if (!existing.length) { res.status(404).json({ error: "Not found" }); return; }

  const [updated] = await db.update(assignmentsTable).set({
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(dueAt !== undefined && { dueAt: dueAt ? new Date(dueAt) : null }),
    ...(maxMarks !== undefined && { maxMarks: parseInt(maxMarks) }),
    ...(isPublished !== undefined && { isPublished }),
  }).where(eq(assignmentsTable.id, id)).returning();

  if (isPublished && !existing[0].isPublished) {
    await notifyStudents(
      existing[0].classId,
      `New Assignment: ${updated.title}`,
      updated.description ?? "A new assignment has been posted.",
      "/student/assignments"
    );
  }

  res.json({ ...updated, dueAt: updated.dueAt?.toISOString() ?? null, createdAt: updated.createdAt?.toISOString() ?? null });
});

router.delete("/assignments/:id", async (req, res): Promise<void> => {
  const { userId, userRole } = getUser(req);
  if (!userId || userRole !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

  const id = parseInt(req.params.id);
  await db.delete(assignmentsTable).where(and(eq(assignmentsTable.id, id), eq(assignmentsTable.createdBy, userId)));
  res.json({ ok: true });
});

router.get("/assignments/:id/submissions", async (req, res): Promise<void> => {
  const { userId, userRole } = getUser(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);

  if (userRole === "admin") {
    const subs = await db.select().from(assignmentSubmissionsTable).where(eq(assignmentSubmissionsTable.assignmentId, id));
    const studentIds = [...new Set(subs.map((s) => s.studentId))];
    const students = studentIds.length
      ? await db.select({ id: usersTable.id, fullName: usersTable.fullName, username: usersTable.username }).from(usersTable).where(inArray(usersTable.id, studentIds))
      : [];
    const studentMap = new Map(students.map((s) => [s.id, s]));

    res.json(subs.map((s) => ({
      ...s,
      fileData: null,
      submittedAt: s.submittedAt?.toISOString() ?? null,
      gradedAt: s.gradedAt?.toISOString() ?? null,
      student: studentMap.get(s.studentId) ?? null,
    })));
    return;
  }

  if (userRole === "student") {
    const [sub] = await db.select().from(assignmentSubmissionsTable).where(
      and(eq(assignmentSubmissionsTable.assignmentId, id), eq(assignmentSubmissionsTable.studentId, userId))
    );
    res.json(sub ? { ...sub, submittedAt: sub.submittedAt?.toISOString() ?? null, gradedAt: sub.gradedAt?.toISOString() ?? null } : null);
    return;
  }

  res.status(403).json({ error: "Forbidden" });
});

router.post("/assignments/:id/submissions", async (req, res): Promise<void> => {
  const { userId, userRole } = getUser(req);
  if (!userId || userRole !== "student") { res.status(403).json({ error: "Forbidden" }); return; }

  const id = parseInt(req.params.id);
  const { fileName, fileData, fileType, comment } = req.body;

  const existing = await db.select().from(assignmentSubmissionsTable).where(
    and(eq(assignmentSubmissionsTable.assignmentId, id), eq(assignmentSubmissionsTable.studentId, userId))
  );

  let sub;
  if (existing.length) {
    [sub] = await db.update(assignmentSubmissionsTable).set({
      fileName: fileName ?? null,
      fileData: fileData ?? null,
      fileType: fileType ?? null,
      comment: comment ?? null,
      submittedAt: new Date(),
    }).where(eq(assignmentSubmissionsTable.id, existing[0].id)).returning();
  } else {
    [sub] = await db.insert(assignmentSubmissionsTable).values({
      assignmentId: id,
      studentId: userId,
      fileName: fileName ?? null,
      fileData: fileData ?? null,
      fileType: fileType ?? null,
      comment: comment ?? null,
    }).returning();
  }

  const [assignment] = await db.select().from(assignmentsTable).where(eq(assignmentsTable.id, id));
  if (assignment) {
    await pushNotification({
      userId: assignment.createdBy,
      type: "assignment",
      title: `New Submission: ${assignment.title}`,
      message: "A student has submitted their assignment.",
      link: "/admin/assignments",
    });
  }

  res.json({ ...sub, submittedAt: sub.submittedAt?.toISOString() ?? null });
});

router.get("/assignments/:id/submissions/:subId/file", async (req, res): Promise<void> => {
  const { userId, userRole } = getUser(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const subId = parseInt(req.params.subId);
  const [sub] = await db.select().from(assignmentSubmissionsTable).where(eq(assignmentSubmissionsTable.id, subId));
  if (!sub) { res.status(404).json({ error: "Not found" }); return; }

  if (userRole === "student" && sub.studentId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  res.json({ fileData: sub.fileData, fileName: sub.fileName, fileType: sub.fileType });
});

router.patch("/assignments/:id/submissions/:subId/grade", async (req, res): Promise<void> => {
  const { userId, userRole } = getUser(req);
  if (!userId || userRole !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

  const subId = parseInt(req.params.subId);
  const { grade, feedback } = req.body;

  const [sub] = await db.update(assignmentSubmissionsTable).set({
    grade: grade !== undefined ? parseInt(grade) : null,
    feedback: feedback ?? null,
    gradedBy: userId,
    gradedAt: new Date(),
  }).where(eq(assignmentSubmissionsTable.id, subId)).returning();

  const [assignment] = await db.select().from(assignmentsTable).where(eq(assignmentsTable.id, sub.assignmentId));
  if (assignment) {
    await pushNotification({
      userId: sub.studentId,
      type: "grade",
      title: `Assignment Graded: ${assignment.title}`,
      message: `You received ${grade}/${assignment.maxMarks} marks. ${feedback ?? ""}`.trim(),
      link: "/student/assignments",
    });
  }

  res.json({ ...sub, submittedAt: sub.submittedAt?.toISOString() ?? null, gradedAt: sub.gradedAt?.toISOString() ?? null });
});

export default router;
