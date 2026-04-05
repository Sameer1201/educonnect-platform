import { Router } from "express";
import {
  db,
  subjectsTable,
  chaptersTable,
  lecturesTable,
  lectureEnrollmentsTable,
  classesTable,
  usersTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

const router = Router();

function getAuth(req: any, res: any): { userId: number; role: string } | null {
  const userId = Number(req.cookies?.userId);
  const role = req.cookies?.userRole;

  if (!userId || Number.isNaN(userId) || !role) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }

  return { userId, role };
}

function canManageClass(auth: { userId: number; role: string }, cls: typeof classesTable.$inferSelect) {
  if (auth.role === "super_admin") return true;
  if (auth.role === "admin") return cls.adminId === auth.userId;
  if (auth.role === "planner") return cls.plannerId === auth.userId;
  return false;
}

async function getSubjectTree(classId: number, viewerId: number) {
  const subjects = await db
    .select()
    .from(subjectsTable)
    .where(eq(subjectsTable.classId, classId))
    .orderBy(subjectsTable.order, subjectsTable.createdAt);

  if (subjects.length === 0) return [];

  const teacherIds = [...new Set(subjects.map((subject) => subject.teacherId).filter((value): value is number => !!value))];
  const teachers = teacherIds.length > 0
    ? await db
        .select({ id: usersTable.id, fullName: usersTable.fullName, username: usersTable.username })
        .from(usersTable)
        .where(inArray(usersTable.id, teacherIds))
    : [];
  const teacherMap = new Map(teachers.map((teacher) => [teacher.id, teacher]));

  const subjectIds = subjects.map((subject) => subject.id);
  const chapters = await db
    .select()
    .from(chaptersTable)
    .where(inArray(chaptersTable.subjectId, subjectIds))
    .orderBy(chaptersTable.order, chaptersTable.createdAt);

  const chapterIds = chapters.map((chapter) => chapter.id);
  const lectures = chapterIds.length > 0
    ? await db
        .select()
        .from(lecturesTable)
        .where(inArray(lecturesTable.chapterId, chapterIds))
        .orderBy(lecturesTable.order, lecturesTable.createdAt)
    : [];

  const lectureIds = lectures.map((lecture) => lecture.id);
  const lectureEnrollments = lectureIds.length > 0
    ? await db
        .select({
          lectureId: lectureEnrollmentsTable.lectureId,
          studentId: lectureEnrollmentsTable.studentId,
        })
        .from(lectureEnrollmentsTable)
        .where(inArray(lectureEnrollmentsTable.lectureId, lectureIds))
    : [];

  const enrollmentCounts = new Map<number, number>();
  const enrolledLectureIds = new Set<number>();

  for (const enrollment of lectureEnrollments) {
    enrollmentCounts.set(enrollment.lectureId, (enrollmentCounts.get(enrollment.lectureId) ?? 0) + 1);
    if (enrollment.studentId === viewerId) {
      enrolledLectureIds.add(enrollment.lectureId);
    }
  }

  const lecturesByChapter = new Map<number, Array<typeof lecturesTable.$inferSelect & { enrolled: boolean; enrolledCount: number }>>();
  for (const lecture of lectures) {
    const chapterId = lecture.chapterId;
    if (!chapterId) continue;

    const enrichedLecture = {
      ...lecture,
      enrolled: enrolledLectureIds.has(lecture.id),
      enrolledCount: enrollmentCounts.get(lecture.id) ?? 0,
    };

    const existing = lecturesByChapter.get(chapterId) ?? [];
    existing.push(enrichedLecture);
    lecturesByChapter.set(chapterId, existing);
  }

  const chaptersBySubject = new Map<number, Array<typeof chaptersTable.$inferSelect & { lectures: Array<typeof lecturesTable.$inferSelect & { enrolled: boolean; enrolledCount: number }> }>>();
  for (const chapter of chapters) {
    const chapterLectures = lecturesByChapter.get(chapter.id) ?? [];
    const existing = chaptersBySubject.get(chapter.subjectId) ?? [];
    existing.push({ ...chapter, lectures: chapterLectures });
    chaptersBySubject.set(chapter.subjectId, existing);
  }

  return subjects.map((subject) => {
    const nestedChapters = chaptersBySubject.get(subject.id) ?? [];
    const teacher = subject.teacherId ? teacherMap.get(subject.teacherId) : null;
    return {
      ...subject,
      teacherName: teacher?.fullName ?? null,
      teacherUsername: teacher?.username ?? null,
      chapters: nestedChapters,
      lectures: nestedChapters.flatMap((chapter) => chapter.lectures),
    };
  });
}

async function getClassFromSubject(subjectId: number) {
  const [subject] = await db.select().from(subjectsTable).where(eq(subjectsTable.id, subjectId));
  if (!subject) return null;

  const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, subject.classId));
  if (!cls) return null;

  return { subject, cls };
}

async function getClassFromChapter(chapterId: number) {
  const [chapter] = await db.select().from(chaptersTable).where(eq(chaptersTable.id, chapterId));
  if (!chapter) return null;

  const context = await getClassFromSubject(chapter.subjectId);
  if (!context) return null;

  return { chapter, ...context };
}

router.get("/classes/:classId/subjects", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;

  const classId = parseInt(req.params.classId, 10);
  if (Number.isNaN(classId)) return res.status(400).json({ error: "Invalid class id" });

  const result = await getSubjectTree(classId, auth.userId);
  res.json(result);
});

router.post("/classes/:classId/subjects", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;

  const classId = parseInt(req.params.classId, 10);
  const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, classId));
  if (!cls) return res.status(404).json({ error: "Class not found" });
  if (!canManageClass(auth, cls)) {
    return res.status(403).json({ error: "Only assigned planner or teacher can add subjects" });
  }

  const { title, description, order, teacherId } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Title is required" });

  let assignedTeacherId: number | null = cls.adminId;
  if (teacherId !== undefined && teacherId !== null && teacherId !== "") {
    const numericTeacherId = Number(teacherId);
    if (!numericTeacherId || Number.isNaN(numericTeacherId)) {
      return res.status(400).json({ error: "Valid teacher is required" });
    }

    const [teacher] = await db
      .select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, numericTeacherId));
    if (!teacher || teacher.role !== "admin") {
      return res.status(400).json({ error: "Selected subject teacher is invalid" });
    }

    assignedTeacherId = teacher.id;
  }

  const [subject] = await db
    .insert(subjectsTable)
    .values({
      classId,
      teacherId: assignedTeacherId,
      title: title.trim(),
      description: description?.trim() ?? null,
      order: order ?? 0,
    })
    .returning();

  const teacher = assignedTeacherId
    ? await db
        .select({ fullName: usersTable.fullName, username: usersTable.username })
        .from(usersTable)
        .where(eq(usersTable.id, assignedTeacherId))
        .then((rows) => rows[0] ?? null)
    : null;

  res.json({
    ...subject,
    teacherName: teacher?.fullName ?? null,
    teacherUsername: teacher?.username ?? null,
    chapters: [],
    lectures: [],
  });
});

router.delete("/subjects/:id", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;

  const context = await getClassFromSubject(parseInt(req.params.id, 10));
  if (!context) return res.status(404).json({ error: "Subject not found" });
  if (!canManageClass(auth, context.cls)) {
    return res.status(403).json({ error: "Only assigned planner or teacher can delete subjects" });
  }

  await db.delete(subjectsTable).where(eq(subjectsTable.id, context.subject.id));
  res.sendStatus(204);
});

router.post("/subjects/:subjectId/chapters", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;

  const context = await getClassFromSubject(parseInt(req.params.subjectId, 10));
  if (!context) return res.status(404).json({ error: "Subject not found" });
  if (!canManageClass(auth, context.cls)) {
    return res.status(403).json({ error: "Only assigned planner or teacher can add chapters" });
  }

  const { title, description, order } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Title is required" });

  const [chapter] = await db
    .insert(chaptersTable)
    .values({
      subjectId: context.subject.id,
      title: title.trim(),
      description: description?.trim() ?? null,
      order: order ?? 0,
    })
    .returning();

  res.json({ ...chapter, lectures: [] });
});

router.delete("/chapters/:id", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;

  const context = await getClassFromChapter(parseInt(req.params.id, 10));
  if (!context) return res.status(404).json({ error: "Chapter not found" });
  if (!canManageClass(auth, context.cls)) {
    return res.status(403).json({ error: "Only assigned planner or teacher can delete chapters" });
  }

  await db.delete(chaptersTable).where(eq(chaptersTable.id, context.chapter.id));
  res.sendStatus(204);
});

router.post("/chapters/:chapterId/lectures", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;

  const context = await getClassFromChapter(parseInt(req.params.chapterId, 10));
  if (!context) return res.status(404).json({ error: "Chapter not found" });
  if (!canManageClass(auth, context.cls)) {
    return res.status(403).json({ error: "Only assigned planner or teacher can add lectures" });
  }

  const { title, description, videoUrl, order } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Title is required" });

  const [lecture] = await db
    .insert(lecturesTable)
    .values({
      subjectId: context.subject.id,
      chapterId: context.chapter.id,
      title: title.trim(),
      description: description?.trim() ?? null,
      videoUrl: videoUrl?.trim() ?? null,
      order: order ?? 0,
    })
    .returning();

  res.json({ ...lecture, enrolled: false, enrolledCount: 0 });
});

router.delete("/lectures/:id", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;

  const [lecture] = await db.select().from(lecturesTable).where(eq(lecturesTable.id, parseInt(req.params.id, 10)));
  if (!lecture) return res.status(404).json({ error: "Lecture not found" });

  const context = lecture.chapterId
    ? await getClassFromChapter(lecture.chapterId)
    : await getClassFromSubject(lecture.subjectId);
  if (!context) return res.status(404).json({ error: "Lecture context not found" });
  if (!canManageClass(auth, context.cls)) {
    return res.status(403).json({ error: "Only assigned planner or teacher can delete lectures" });
  }

  await db.delete(lecturesTable).where(eq(lecturesTable.id, lecture.id));
  res.sendStatus(204);
});

router.post("/lectures/:id/enroll", async (req, res) => {
  const userId = req.cookies?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const lectureId = parseInt(req.params.id, 10);
  const studentId = parseInt(userId, 10);

  try {
    await db.insert(lectureEnrollmentsTable).values({ studentId, lectureId });
    res.json({ success: true });
  } catch {
    res.status(409).json({ error: "Already enrolled in this lecture" });
  }
});

router.delete("/lectures/:id/enroll", async (req, res) => {
  const userId = req.cookies?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const lectureId = parseInt(req.params.id, 10);
  const studentId = parseInt(userId, 10);

  await db
    .delete(lectureEnrollmentsTable)
    .where(
      and(
        eq(lectureEnrollmentsTable.lectureId, lectureId),
        eq(lectureEnrollmentsTable.studentId, studentId),
      ),
    );

  res.sendStatus(204);
});

export { router as subjectsRouter };
