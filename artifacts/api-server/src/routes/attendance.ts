import { Router, type IRouter } from "express";
import {
  db, attendanceTable, enrollmentsTable, usersTable, classesTable
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

const router: IRouter = Router();

function getUser(req: any) {
  const userId = req.cookies?.userId ? parseInt(req.cookies.userId, 10) : null;
  const userRole = req.cookies?.userRole ?? null;
  return { userId, userRole };
}

router.get("/attendance/class/:classId", async (req, res): Promise<void> => {
  const { userId, userRole } = getUser(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const classId = parseInt(req.params.classId);
  const { date } = req.query as { date?: string };

  if (userRole === "admin" || userRole === "super_admin") {
    const enrollments = await db.select().from(enrollmentsTable).where(eq(enrollmentsTable.classId, classId));
    const studentIds = enrollments.map((e) => e.studentId);

    const students = studentIds.length
      ? await db.select({ id: usersTable.id, fullName: usersTable.fullName, username: usersTable.username }).from(usersTable).where(inArray(usersTable.id, studentIds))
      : [];

    const records = await db.select().from(attendanceTable).where(
      and(eq(attendanceTable.classId, classId), ...(date ? [eq(attendanceTable.date, date)] : []))
    );

    const recordMap = new Map<string, string>();
    for (const r of records) {
      recordMap.set(`${r.studentId}_${r.date}`, r.status);
    }

    const dates = [...new Set(records.map((r) => r.date))].sort();

    res.json({ students, dates, records });
    return;
  }

  if (userRole === "student") {
    const records = await db.select().from(attendanceTable).where(
      and(eq(attendanceTable.classId, classId), eq(attendanceTable.studentId, userId))
    );
    res.json({ records });
    return;
  }

  res.status(403).json({ error: "Forbidden" });
});

router.get("/attendance/student/:studentId", async (req, res): Promise<void> => {
  const { userId, userRole } = getUser(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const studentId = parseInt(req.params.studentId);

  if (userRole === "student" && studentId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const records = await db.select({
    id: attendanceTable.id,
    classId: attendanceTable.classId,
    date: attendanceTable.date,
    status: attendanceTable.status,
    note: attendanceTable.note,
    className: classesTable.title,
  }).from(attendanceTable)
    .leftJoin(classesTable, eq(attendanceTable.classId, classesTable.id))
    .where(eq(attendanceTable.studentId, studentId))
    .orderBy(attendanceTable.date);

  res.json(records);
});

router.post("/attendance/class/:classId/mark", async (req, res): Promise<void> => {
  const { userId, userRole } = getUser(req);
  if (!userId || userRole !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

  const classId = parseInt(req.params.classId);
  const { date, records } = req.body as { date: string; records: { studentId: number; status: string; note?: string }[] };

  if (!date || !records?.length) { res.status(400).json({ error: "date and records required" }); return; }

  for (const rec of records) {
    const existing = await db.select().from(attendanceTable).where(
      and(eq(attendanceTable.classId, classId), eq(attendanceTable.studentId, rec.studentId), eq(attendanceTable.date, date))
    );

    if (existing.length) {
      await db.update(attendanceTable).set({ status: rec.status, note: rec.note ?? null, markedBy: userId }).where(eq(attendanceTable.id, existing[0].id));
    } else {
      await db.insert(attendanceTable).values({
        classId,
        studentId: rec.studentId,
        date,
        status: rec.status,
        note: rec.note ?? null,
        markedBy: userId,
      });
    }
  }

  res.json({ ok: true, marked: records.length });
});

router.get("/attendance/summary/:studentId", async (req, res): Promise<void> => {
  const { userId, userRole } = getUser(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const studentId = parseInt(req.params.studentId);
  if (userRole === "student" && studentId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const records = await db.select().from(attendanceTable).where(eq(attendanceTable.studentId, studentId));

  const total = records.length;
  const present = records.filter((r) => r.status === "present").length;
  const absent = records.filter((r) => r.status === "absent").length;
  const late = records.filter((r) => r.status === "late").length;
  const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

  res.json({ total, present, absent, late, percentage });
});

export default router;
