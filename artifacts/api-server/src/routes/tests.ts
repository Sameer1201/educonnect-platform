import { Router } from "express";
import {
  db,
  testsTable,
  testQuestionsTable,
  testSectionsTable,
  testSubmissionsTable,
  usersTable,
  enrollmentsTable,
  classesTable,
  lecturePlansTable,
  chaptersTable,
  subjectsTable,
} from "@workspace/db";
import { pushNotification, pushNotificationToMany } from "../lib/pushNotification";
import { eq, and, inArray, isNull, or, asc } from "drizzle-orm";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  if (!req.cookies?.userId) return res.status(401).json({ error: "Unauthorized" });
  next();
}

async function getUser(userId: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  return user;
}

async function getChapterContext(chapterId: number) {
  const [chapter] = await db.select().from(chaptersTable).where(eq(chaptersTable.id, chapterId));
  if (!chapter) return null;

  const [subject] = await db.select().from(subjectsTable).where(eq(subjectsTable.id, chapter.subjectId));
  if (!subject) return null;

  const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, subject.classId));
  if (!cls) return null;

  return { chapter, subject, cls };
}

function gradeQuestion(q: any, answer: any): boolean {
  const qType = q.questionType ?? "mcq";
  if (qType === "multi") {
    const correct: number[] = q.correctAnswerMulti ? JSON.parse(q.correctAnswerMulti) : [];
    const selected: number[] = Array.isArray(answer) ? [...answer].sort((a, b) => a - b) : [];
    return JSON.stringify(selected) === JSON.stringify([...correct].sort((a, b) => a - b));
  }
  if (qType === "integer") {
    if (answer === undefined || answer === null) return false;
    const num = Number(answer);
    // Range mode: if both min and max are set, check if answer is within range
    if (q.correctAnswerMin !== null && q.correctAnswerMin !== undefined &&
        q.correctAnswerMax !== null && q.correctAnswerMax !== undefined) {
      return num >= q.correctAnswerMin && num <= q.correctAnswerMax;
    }
    return num === q.correctAnswer;
  }
  // mcq
  return answer !== undefined && answer !== null && Number(answer) === q.correctAnswer;
}

function hasAnsweredQuestion(q: any, answer: any): boolean {
  const qType = q.questionType ?? "mcq";
  if (qType === "multi") return Array.isArray(answer) && answer.length > 0;
  return answer !== undefined && answer !== null && answer !== "";
}

// GET /api/tests — list tests
router.get("/tests", requireAuth, async (req, res) => {
  try {
    const userId = parseInt(req.cookies.userId, 10);
    const user = await getUser(userId);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    if (user.role === "super_admin") {
      const tests = await db.select({
        id: testsTable.id, classId: testsTable.classId, title: testsTable.title,
        chapterId: testsTable.chapterId,
      description: testsTable.description, examType: testsTable.examType, examHeader: testsTable.examHeader, examSubheader: testsTable.examSubheader, durationMinutes: testsTable.durationMinutes,
      instructions: testsTable.instructions,
      examConfig: testsTable.examConfig,
      defaultPositiveMarks: testsTable.defaultPositiveMarks,
      defaultNegativeMarks: testsTable.defaultNegativeMarks,
      passingScore: testsTable.passingScore, isPublished: testsTable.isPublished,
        scheduledAt: testsTable.scheduledAt, createdAt: testsTable.createdAt,
        className: classesTable.title, chapterName: chaptersTable.title, subjectName: subjectsTable.title,
      }).from(testsTable)
        .leftJoin(classesTable, eq(testsTable.classId, classesTable.id))
        .leftJoin(chaptersTable, eq(testsTable.chapterId, chaptersTable.id))
        .leftJoin(subjectsTable, eq(chaptersTable.subjectId, subjectsTable.id))
        .orderBy(testsTable.createdAt);
      return res.json(tests);
    }

    if (user.role === "admin") {
      const tests = await db.select({
        id: testsTable.id, classId: testsTable.classId, title: testsTable.title,
        chapterId: testsTable.chapterId,
      description: testsTable.description, examType: testsTable.examType, examHeader: testsTable.examHeader, examSubheader: testsTable.examSubheader, durationMinutes: testsTable.durationMinutes,
      instructions: testsTable.instructions,
      examConfig: testsTable.examConfig,
      defaultPositiveMarks: testsTable.defaultPositiveMarks,
      defaultNegativeMarks: testsTable.defaultNegativeMarks,
      passingScore: testsTable.passingScore, isPublished: testsTable.isPublished,
        scheduledAt: testsTable.scheduledAt, createdAt: testsTable.createdAt,
        className: classesTable.title, chapterName: chaptersTable.title, subjectName: subjectsTable.title,
      }).from(testsTable)
        .leftJoin(classesTable, eq(testsTable.classId, classesTable.id))
        .leftJoin(chaptersTable, eq(testsTable.chapterId, chaptersTable.id))
        .leftJoin(subjectsTable, eq(chaptersTable.subjectId, subjectsTable.id))
        .where(eq(testsTable.createdBy, userId))
        .orderBy(testsTable.createdAt);
      return res.json(tests);
    }

    // Student
    const enrollments = await db.select({ classId: enrollmentsTable.classId })
      .from(enrollmentsTable).where(eq(enrollmentsTable.studentId, userId));
    const classIds = enrollments.map((e) => e.classId);
    if (classIds.length === 0) return res.json([]);

    const tests = await db.select({
      id: testsTable.id, classId: testsTable.classId, title: testsTable.title,
      chapterId: testsTable.chapterId,
      description: testsTable.description, examType: testsTable.examType, examHeader: testsTable.examHeader, examSubheader: testsTable.examSubheader, durationMinutes: testsTable.durationMinutes,
      instructions: testsTable.instructions,
      examConfig: testsTable.examConfig,
      defaultPositiveMarks: testsTable.defaultPositiveMarks,
      defaultNegativeMarks: testsTable.defaultNegativeMarks,
      passingScore: testsTable.passingScore, scheduledAt: testsTable.scheduledAt,
      className: classesTable.title, chapterName: chaptersTable.title, subjectName: subjectsTable.title,
    }).from(testsTable)
      .leftJoin(classesTable, eq(testsTable.classId, classesTable.id))
      .leftJoin(chaptersTable, eq(testsTable.chapterId, chaptersTable.id))
      .leftJoin(subjectsTable, eq(chaptersTable.subjectId, subjectsTable.id))
      .where(and(
        eq(testsTable.isPublished, true),
        or(inArray(testsTable.classId, classIds), isNull(testsTable.classId))
      )).orderBy(testsTable.scheduledAt);

    const submissions = await db.select({ testId: testSubmissionsTable.testId })
      .from(testSubmissionsTable).where(eq(testSubmissionsTable.studentId, userId));
    const submittedTestIds = new Set(submissions.map((s) => s.testId));
    return res.json(tests.map((t) => ({ ...t, alreadySubmitted: submittedTestIds.has(t.id) })));
  } catch { return res.status(500).json({ error: "Internal server error" }); }
});

// GET /api/tests/:id — test detail with questions
router.get("/tests/:id", requireAuth, async (req, res) => {
  try {
    const testId = parseInt(req.params.id, 10);
    const userId = parseInt(req.cookies.userId, 10);
    const user = await getUser(userId);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const [test] = await db.select({
      id: testsTable.id,
      classId: testsTable.classId,
      chapterId: testsTable.chapterId,
      title: testsTable.title,
      description: testsTable.description,
      examType: testsTable.examType,
      examHeader: testsTable.examHeader,
      examSubheader: testsTable.examSubheader,
      instructions: testsTable.instructions,
      examConfig: testsTable.examConfig,
      durationMinutes: testsTable.durationMinutes,
      passingScore: testsTable.passingScore,
      defaultPositiveMarks: testsTable.defaultPositiveMarks,
      defaultNegativeMarks: testsTable.defaultNegativeMarks,
      isPublished: testsTable.isPublished,
      scheduledAt: testsTable.scheduledAt,
      createdBy: testsTable.createdBy,
      createdAt: testsTable.createdAt,
      className: classesTable.title,
      chapterName: chaptersTable.title,
      subjectName: subjectsTable.title,
    }).from(testsTable)
      .leftJoin(classesTable, eq(testsTable.classId, classesTable.id))
      .leftJoin(chaptersTable, eq(testsTable.chapterId, chaptersTable.id))
      .leftJoin(subjectsTable, eq(chaptersTable.subjectId, subjectsTable.id))
      .where(eq(testsTable.id, testId));
    if (!test) return res.status(404).json({ error: "Test not found" });

    const questions = await db.select().from(testQuestionsTable)
      .where(eq(testQuestionsTable.testId, testId)).orderBy(testQuestionsTable.order);
    const rawSections = await db.select().from(testSectionsTable)
      .where(eq(testSectionsTable.testId, testId)).orderBy(testSectionsTable.order);
    const sections = rawSections.map((section) => ({
      ...section,
      meta: section.meta ? JSON.parse(section.meta) : null,
    }));

    const isAdmin = user.role === "admin" || user.role === "super_admin";
    let submission = null;
    if (user.role === "student") {
      const [sub] = await db.select().from(testSubmissionsTable)
        .where(and(eq(testSubmissionsTable.testId, testId), eq(testSubmissionsTable.studentId, userId)));
      submission = sub ?? null;
    }

    const richSubmission = submission ? {
      ...submission,
      questionTimings: submission.questionTimings ? JSON.parse(submission.questionTimings) : null,
      flaggedQuestions: submission.flaggedQuestions ? JSON.parse(submission.flaggedQuestions) : null,
    } : null;

    const showCorrect = isAdmin || submission !== null;
    const safeQuestions = questions.map((q) => ({
      id: q.id, sectionId: q.sectionId ?? null, questionCode: q.questionCode ?? null, sourceType: q.sourceType ?? "manual", subjectLabel: q.subjectLabel ?? null, question: q.question,
      questionType: q.questionType ?? "mcq",
      options: q.options ? JSON.parse(q.options) : [],
      optionImages: q.optionImages ? JSON.parse(q.optionImages) : null,
      points: q.points, negativeMarks: q.negativeMarks ?? 0, order: q.order,
      meta: q.meta ? JSON.parse(q.meta) : null,
      imageData: q.imageData ?? null,
      ...(showCorrect ? {
        correctAnswer: q.correctAnswer,
        correctAnswerMulti: q.correctAnswerMulti ? JSON.parse(q.correctAnswerMulti) : null,
        correctAnswerMin: q.correctAnswerMin ?? null,
        correctAnswerMax: q.correctAnswerMax ?? null,
      } : {}),
    }));

    return res.json({ ...test, sections, questions: safeQuestions, submission: richSubmission });
  } catch { return res.status(500).json({ error: "Internal server error" }); }
});

// POST /api/tests — create test
router.post("/tests", requireAuth, async (req, res) => {
  try {
    const userId = parseInt(req.cookies.userId, 10);
    const user = await getUser(userId);
    if (!user || user.role !== "admin") return res.status(403).json({ error: "Forbidden" });

    const { classId, chapterId, title, description, examType, examHeader, examSubheader, instructions, examConfig, durationMinutes, passingScore, defaultPositiveMarks, defaultNegativeMarks, scheduledAt, sections } = req.body;
    if (!title) return res.status(400).json({ error: "title required" });
    if (!chapterId) return res.status(400).json({ error: "chapterId required" });

    const context = await getChapterContext(Number(chapterId));
    if (!context) return res.status(404).json({ error: "Chapter not found" });
    if (context.cls.adminId !== userId) {
      return res.status(403).json({ error: "You can only create tests for your assigned classes" });
    }
    if (classId && Number(classId) !== context.cls.id) {
      return res.status(400).json({ error: "Selected chapter does not belong to the selected class" });
    }

    const [test] = await db.insert(testsTable).values({
      classId: context.cls.id,
      chapterId: context.chapter.id,
      title: String(title), description: description ? String(description) : null,
      examType: examType ? String(examType) : "custom",
      examHeader: examHeader ? String(examHeader) : null,
      examSubheader: examSubheader ? String(examSubheader) : null,
      instructions: instructions ? String(instructions) : null,
      examConfig: examConfig ? JSON.stringify(examConfig) : null,
      durationMinutes: durationMinutes ? Number(durationMinutes) : 30,
      passingScore: passingScore ? Number(passingScore) : 60,
      defaultPositiveMarks: defaultPositiveMarks !== undefined ? Number(defaultPositiveMarks) : 1,
      defaultNegativeMarks: defaultNegativeMarks !== undefined ? Number(defaultNegativeMarks) : 0,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      createdBy: userId,
    }).returning();
    if (Array.isArray(sections) && sections.length > 0) {
      await db.insert(testSectionsTable).values(
        sections.map((section: any, index: number) => ({
          testId: test.id,
          title: String(section.title),
          description: section.description ? String(section.description) : null,
          subjectLabel: section.subjectLabel ? String(section.subjectLabel) : null,
          questionCount: section.questionCount !== undefined ? Number(section.questionCount) : null,
          marksPerQuestion: section.marksPerQuestion !== undefined ? Number(section.marksPerQuestion) : null,
          negativeMarks: section.negativeMarks !== undefined ? Number(section.negativeMarks) : null,
          meta: section.meta ? JSON.stringify(section.meta) : null,
          order: index,
        })),
      );
    }
    return res.status(201).json(test);
  } catch { return res.status(500).json({ error: "Internal server error" }); }
});

// PATCH /api/tests/:id — update test
router.patch("/tests/:id", requireAuth, async (req, res) => {
  try {
    const testId = parseInt(req.params.id, 10);
    const userId = parseInt(req.cookies.userId, 10);
    const user = await getUser(userId);
    if (!user || user.role !== "admin") return res.status(403).json({ error: "Forbidden" });

    const { isPublished, title, description, examType, examHeader, examSubheader, instructions, examConfig, durationMinutes, passingScore, defaultPositiveMarks, defaultNegativeMarks, scheduledAt } = req.body;
    const updates: any = {};
    if (isPublished !== undefined) updates.isPublished = Boolean(isPublished);
    if (title) updates.title = String(title);
    if (description !== undefined) updates.description = description ? String(description) : null;
    if (examType !== undefined) updates.examType = examType ? String(examType) : "custom";
    if (examHeader !== undefined) updates.examHeader = examHeader ? String(examHeader) : null;
    if (examSubheader !== undefined) updates.examSubheader = examSubheader ? String(examSubheader) : null;
    if (instructions !== undefined) updates.instructions = instructions ? String(instructions) : null;
    if (examConfig !== undefined) updates.examConfig = examConfig ? JSON.stringify(examConfig) : null;
    if (durationMinutes) updates.durationMinutes = Number(durationMinutes);
    if (passingScore) updates.passingScore = Number(passingScore);
    if (defaultPositiveMarks !== undefined) updates.defaultPositiveMarks = Number(defaultPositiveMarks);
    if (defaultNegativeMarks !== undefined) updates.defaultNegativeMarks = Number(defaultNegativeMarks);
    if (scheduledAt !== undefined) updates.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;

    const [beforeTest] = await db.select().from(testsTable).where(eq(testsTable.id, testId));
    const [test] = await db.update(testsTable).set(updates).where(eq(testsTable.id, testId)).returning();
    if (!test) return res.status(404).json({ error: "Test not found" });

    // Notify enrolled students when a test is first published
    if (updates.isPublished === true && !beforeTest?.isPublished) {
      let studentIds: number[] = [];
      if (test.classId) {
        const enrollments = await db
          .select({ studentId: enrollmentsTable.studentId })
          .from(enrollmentsTable)
          .where(eq(enrollmentsTable.classId, test.classId));
        studentIds = enrollments.map((e) => e.studentId);
      } else {
        // No class assigned — notify all students in any class taught by this teacher
        const teacherClasses = await db
          .select({ id: classesTable.id })
          .from(classesTable)
          .where(eq(classesTable.adminId, userId));
        const teacherClassIds = teacherClasses.map((c) => c.id);
        if (teacherClassIds.length > 0) {
          const enrollments = await db
            .select({ studentId: enrollmentsTable.studentId })
            .from(enrollmentsTable)
            .where(inArray(enrollmentsTable.classId, teacherClassIds));
          studentIds = [...new Set(enrollments.map((e) => e.studentId))];
        }
      }
      if (studentIds.length > 0) {
        await pushNotificationToMany(studentIds, {
          type: "test",
          title: `New Test: ${test.title}`,
          message: test.durationMinutes
            ? `Duration: ${test.durationMinutes} min${test.durationMinutes !== 1 ? "s" : ""}. Head to My Tests to start.`
            : "A new test is now available in My Tests.",
          link: "/student/tests",
        });
      }
    }

    return res.json(test);
  } catch { return res.status(500).json({ error: "Internal server error" }); }
});

// DELETE /api/tests/:id
router.delete("/tests/:id", requireAuth, async (req, res) => {
  try {
    const userId = parseInt(req.cookies.userId, 10);
    const user = await getUser(userId);
    if (!user || user.role !== "admin") return res.status(403).json({ error: "Forbidden" });
    await db.delete(testsTable).where(eq(testsTable.id, parseInt(req.params.id, 10)));
    return res.status(204).send();
  } catch { return res.status(500).json({ error: "Internal server error" }); }
});

// POST /api/tests/:id/questions — add question (supports mcq, multi, integer)
router.post("/tests/:id/questions", requireAuth, async (req, res) => {
  try {
    const testId = parseInt(req.params.id, 10);
    const userId = parseInt(req.cookies.userId, 10);
    const user = await getUser(userId);
    if (!user || user.role !== "admin") return res.status(403).json({ error: "Forbidden" });

    const { question, questionType = "mcq", sectionId, questionCode, sourceType, subjectLabel, options = [], optionImages, correctAnswer, correctAnswerMulti, correctAnswerMin, correctAnswerMax, points, negativeMarks, imageData, meta } = req.body;
    if (!question) return res.status(400).json({ error: "question required" });

    // Validate per type
    if (questionType === "multi" && (!correctAnswerMulti || !Array.isArray(correctAnswerMulti))) {
      return res.status(400).json({ error: "correctAnswerMulti (array) required for multi type" });
    }
    if (questionType === "integer" && correctAnswer === undefined && (correctAnswerMin === undefined || correctAnswerMax === undefined)) {
      return res.status(400).json({ error: "correctAnswer or correctAnswerMin+correctAnswerMax required for integer type" });
    }
    if (questionType !== "multi" && questionType !== "integer" && correctAnswer === undefined) {
      return res.status(400).json({ error: "correctAnswer required" });
    }

    const existing = await db.select({ id: testQuestionsTable.id })
      .from(testQuestionsTable).where(eq(testQuestionsTable.testId, testId));

    const isRange = questionType === "integer" && correctAnswerMin !== undefined && correctAnswerMax !== undefined;

    const [q] = await db.insert(testQuestionsTable).values({
      testId,
      sectionId: sectionId ? Number(sectionId) : null,
      questionCode: questionCode ? String(questionCode) : null,
      sourceType: sourceType ? String(sourceType) : "manual",
      subjectLabel: subjectLabel ? String(subjectLabel) : null,
      question: String(question),
      questionType: String(questionType),
      options: JSON.stringify(options),
      optionImages: optionImages ? JSON.stringify(optionImages) : null,
      correctAnswer: questionType === "multi" ? 0 : (isRange ? 0 : Number(correctAnswer ?? 0)),
      correctAnswerMulti: questionType === "multi" ? JSON.stringify(correctAnswerMulti) : null,
      correctAnswerMin: isRange ? Number(correctAnswerMin) : null,
      correctAnswerMax: isRange ? Number(correctAnswerMax) : null,
      points: points ? Number(points) : 1,
      negativeMarks: negativeMarks !== undefined ? Number(negativeMarks) : 0,
      meta: meta ? JSON.stringify(meta) : null,
      order: existing.length,
      imageData: imageData ? String(imageData) : null,
    }).returning();

    return res.status(201).json({
      ...q,
      sectionId: q.sectionId ?? null,
      questionCode: q.questionCode ?? null,
      sourceType: q.sourceType ?? "manual",
      subjectLabel: q.subjectLabel ?? null,
      questionType: q.questionType,
      options: JSON.parse(q.options),
      optionImages: q.optionImages ? JSON.parse(q.optionImages) : null,
      correctAnswerMulti: q.correctAnswerMulti ? JSON.parse(q.correctAnswerMulti) : null,
      correctAnswerMin: q.correctAnswerMin ?? null,
      correctAnswerMax: q.correctAnswerMax ?? null,
      negativeMarks: q.negativeMarks ?? 0,
      meta: q.meta ? JSON.parse(q.meta) : null,
      imageData: q.imageData ?? null,
    });
  } catch { return res.status(500).json({ error: "Internal server error" }); }
});

// GET /api/tests/:id/sections
router.get("/tests/:id/sections", requireAuth, async (req, res) => {
  try {
    const testId = parseInt(req.params.id, 10);
    const userId = parseInt(req.cookies.userId, 10);
    const user = await getUser(userId);
    if (!user || (user.role !== "admin" && user.role !== "super_admin")) return res.status(403).json({ error: "Forbidden" });

    const sections = await db.select().from(testSectionsTable)
      .where(eq(testSectionsTable.testId, testId))
      .orderBy(asc(testSectionsTable.order));
    return res.json(sections);
  } catch { return res.status(500).json({ error: "Internal server error" }); }
});

// POST /api/tests/:id/sections
router.post("/tests/:id/sections", requireAuth, async (req, res) => {
  try {
    const testId = parseInt(req.params.id, 10);
    const userId = parseInt(req.cookies.userId, 10);
    const user = await getUser(userId);
    if (!user || user.role !== "admin") return res.status(403).json({ error: "Forbidden" });

    const { title, description, subjectLabel, questionCount, marksPerQuestion, negativeMarks, meta } = req.body;
    if (!title) return res.status(400).json({ error: "title required" });

    const existing = await db.select({ id: testSectionsTable.id }).from(testSectionsTable).where(eq(testSectionsTable.testId, testId));
    const [section] = await db.insert(testSectionsTable).values({
      testId,
      title: String(title),
      description: description ? String(description) : null,
      subjectLabel: subjectLabel ? String(subjectLabel) : null,
      questionCount: questionCount !== undefined ? Number(questionCount) : null,
      marksPerQuestion: marksPerQuestion !== undefined ? Number(marksPerQuestion) : null,
      negativeMarks: negativeMarks !== undefined ? Number(negativeMarks) : null,
      meta: meta ? JSON.stringify(meta) : null,
      order: existing.length,
    }).returning();
    return res.status(201).json(section);
  } catch { return res.status(500).json({ error: "Internal server error" }); }
});

// PATCH /api/tests/:id/sections/:sectionId
router.patch("/tests/:id/sections/:sectionId", requireAuth, async (req, res) => {
  try {
    const userId = parseInt(req.cookies.userId, 10);
    const user = await getUser(userId);
    if (!user || user.role !== "admin") return res.status(403).json({ error: "Forbidden" });
    const sectionId = parseInt(req.params.sectionId, 10);
    const { title, description, subjectLabel, questionCount, marksPerQuestion, negativeMarks, meta, order } = req.body;
    const updates: any = {};
    if (title !== undefined) updates.title = String(title);
    if (description !== undefined) updates.description = description ? String(description) : null;
    if (subjectLabel !== undefined) updates.subjectLabel = subjectLabel ? String(subjectLabel) : null;
    if (questionCount !== undefined) updates.questionCount = questionCount !== null ? Number(questionCount) : null;
    if (marksPerQuestion !== undefined) updates.marksPerQuestion = marksPerQuestion !== null ? Number(marksPerQuestion) : null;
    if (negativeMarks !== undefined) updates.negativeMarks = negativeMarks !== null ? Number(negativeMarks) : null;
    if (meta !== undefined) updates.meta = meta ? JSON.stringify(meta) : null;
    if (order !== undefined) updates.order = Number(order);
    const [section] = await db.update(testSectionsTable).set(updates).where(eq(testSectionsTable.id, sectionId)).returning();
    if (!section) return res.status(404).json({ error: "Section not found" });
    return res.json(section);
  } catch { return res.status(500).json({ error: "Internal server error" }); }
});

// DELETE /api/tests/:id/sections/:sectionId
router.delete("/tests/:id/sections/:sectionId", requireAuth, async (req, res) => {
  try {
    const userId = parseInt(req.cookies.userId, 10);
    const user = await getUser(userId);
    if (!user || user.role !== "admin") return res.status(403).json({ error: "Forbidden" });
    const sectionId = parseInt(req.params.sectionId, 10);
    await db.delete(testSectionsTable).where(eq(testSectionsTable.id, sectionId));
    return res.status(204).send();
  } catch { return res.status(500).json({ error: "Internal server error" }); }
});

// DELETE /api/tests/:id/questions/:qid
router.delete("/tests/:id/questions/:qid", requireAuth, async (req, res) => {
  try {
    const userId = parseInt(req.cookies.userId, 10);
    const user = await getUser(userId);
    if (!user || user.role !== "admin") return res.status(403).json({ error: "Forbidden" });
    await db.delete(testQuestionsTable).where(eq(testQuestionsTable.id, parseInt(req.params.qid, 10)));
    return res.status(204).send();
  } catch { return res.status(500).json({ error: "Internal server error" }); }
});

// POST /api/tests/:id/submit — student submits answers
router.post("/tests/:id/submit", requireAuth, async (req, res) => {
  try {
    const testId = parseInt(req.params.id, 10);
    const userId = parseInt(req.cookies.userId, 10);
    const user = await getUser(userId);
    if (!user || user.role !== "student") return res.status(403).json({ error: "Students only" });

    const [existing] = await db.select().from(testSubmissionsTable)
      .where(and(eq(testSubmissionsTable.testId, testId), eq(testSubmissionsTable.studentId, userId)));
    if (existing) return res.status(409).json({ error: "Already submitted" });

    const { answers, questionTimings, flaggedQuestions } = req.body;
    const questions = await db.select().from(testQuestionsTable).where(eq(testQuestionsTable.testId, testId));

    let score = 0, totalPoints = 0;
    for (const q of questions) {
      totalPoints += q.points;
      const answer = answers?.[q.id];
      if (gradeQuestion(q, answer)) {
        score += q.points;
      } else if (hasAnsweredQuestion(q, answer)) {
        score -= Number(q.negativeMarks ?? 0);
      }
    }

    const [test] = await db.select().from(testsTable).where(eq(testsTable.id, testId));
    const normalizedScore = Number(score.toFixed(2));
    const percentage = totalPoints > 0 ? Number(((normalizedScore / totalPoints) * 100).toFixed(2)) : 0;
    const passed = percentage >= (test?.passingScore ?? 60);

    const [submission] = await db.insert(testSubmissionsTable).values({
      testId, studentId: userId,
      answers: JSON.stringify(answers ?? {}),
      questionTimings: questionTimings ? JSON.stringify(questionTimings) : null,
      flaggedQuestions: flaggedQuestions ? JSON.stringify(flaggedQuestions) : null,
      score: normalizedScore, totalPoints, percentage, passed,
    }).returning();
    return res.status(201).json(submission);
  } catch { return res.status(500).json({ error: "Internal server error" }); }
});

// GET /api/tests/:id/my-analysis — student gets their own advanced analysis + anonymous class stats
router.get("/tests/:id/my-analysis", requireAuth, async (req, res) => {
  try {
    const testId = parseInt(req.params.id, 10);
    const userId = parseInt(req.cookies.userId, 10);
    const user = await getUser(userId);
    if (!user || user.role !== "student") return res.status(403).json({ error: "Forbidden" });

    const [test] = await db.select({
      id: testsTable.id, title: testsTable.title, description: testsTable.description,
      durationMinutes: testsTable.durationMinutes, passingScore: testsTable.passingScore,
      classId: testsTable.classId, className: classesTable.title,
    }).from(testsTable).leftJoin(classesTable, eq(testsTable.classId, classesTable.id))
      .where(eq(testsTable.id, testId));
    if (!test) return res.status(404).json({ error: "Not found" });

    // Student's own submission
    const [submission] = await db.select().from(testSubmissionsTable)
      .where(and(eq(testSubmissionsTable.testId, testId), eq(testSubmissionsTable.studentId, userId)));
    if (!submission) return res.status(403).json({ error: "You have not submitted this test" });

    const questions = await db.select().from(testQuestionsTable)
      .where(eq(testQuestionsTable.testId, testId)).orderBy(testQuestionsTable.order);

    // All class submissions for aggregate stats
    const allSubs = await db.select({
      id: testSubmissionsTable.id, percentage: testSubmissionsTable.percentage,
      passed: testSubmissionsTable.passed, answers: testSubmissionsTable.answers,
      questionTimings: testSubmissionsTable.questionTimings,
      studentId: testSubmissionsTable.studentId,
    }).from(testSubmissionsTable).where(eq(testSubmissionsTable.testId, testId));

    const totalSubs = allSubs.length;
    const classAvg = totalSubs > 0 ? Math.round(allSubs.reduce((a, s) => a + s.percentage, 0) / totalSubs) : 0;
    const classPassRate = totalSubs > 0 ? Math.round(allSubs.filter(s => s.passed).length / totalSubs * 100) : 0;

    // Student rank & percentile
    const sortedPct = [...allSubs].sort((a, b) => b.percentage - a.percentage);
    const rank = sortedPct.findIndex(s => s.studentId === userId) + 1;
    const percentile = totalSubs > 1 ? Math.round(((totalSubs - rank) / (totalSubs - 1)) * 100) : 100;

    // Student's parsed data
    const myAnswers: Record<string, any> = JSON.parse(submission.answers ?? "{}");
    const myTimings: Record<string, number> = submission.questionTimings ? JSON.parse(submission.questionTimings) : {};
    const myFlagged: number[] = submission.flaggedQuestions ? JSON.parse(submission.flaggedQuestions) : [];

    // Per-question analysis
    const perQuestion = questions.map((q, idx) => {
      const answer = myAnswers[q.id] ?? myAnswers[String(q.id)];
      const isSkipped = answer === undefined || answer === null || (Array.isArray(answer) && answer.length === 0) || answer === "";
      const isCorrect = !isSkipped ? gradeQuestion(q, answer) : false;
      const myTime = myTimings[q.id] ?? myTimings[String(q.id)] ?? 0;
      const isFlagged = myFlagged.includes(q.id) || myFlagged.includes(Number(q.id));

      // Class-level stats for this question
      let classCorrectCount = 0;
      const classTimings: number[] = [];
      allSubs.forEach(s => {
        const parsedAns = JSON.parse(s.answers ?? "{}");
        const ans = parsedAns[q.id] ?? parsedAns[String(q.id)];
        if (gradeQuestion(q, ans)) classCorrectCount++;
        const timings: Record<string, number> = s.questionTimings ? JSON.parse(s.questionTimings) : {};
        const t = timings[q.id] ?? timings[String(q.id)] ?? 0;
        classTimings.push(Number(t) || 0);
      });
      const classSuccessRate = totalSubs > 0 ? Math.round(classCorrectCount / totalSubs * 100) : 0;
      const classAvgTime = classTimings.length > 0 ? Math.round(classTimings.reduce((a, b) => a + b, 0) / classTimings.length) : 0;

      return {
        id: q.id, order: idx + 1,
        question: q.question, questionType: q.questionType ?? "mcq",
        options: q.options ? JSON.parse(q.options) : [],
        optionImages: q.optionImages ? JSON.parse(q.optionImages) : null,
        imageData: q.imageData ?? null,
        points: q.points,
        negativeMarks: q.negativeMarks ?? 0,
        correctAnswer: q.correctAnswer,
        correctAnswerMulti: q.correctAnswerMulti ? JSON.parse(q.correctAnswerMulti) : null,
        correctAnswerMin: q.correctAnswerMin ?? null,
        correctAnswerMax: q.correctAnswerMax ?? null,
        myAnswer: isSkipped ? null : answer,
        isCorrect,
        isSkipped,
        isFlagged,
        myTime,
        classSuccessRate,
        classAvgTime,
        // Time comparison: faster/slower than class
        timeVsClass: classAvgTime > 0 ? Math.round((myTime - classAvgTime) / classAvgTime * 100) : 0,
      };
    });

    const totalTime = Object.values(myTimings).reduce((a, b) => a + (Number(b) || 0), 0);
    const correctCount = perQuestion.filter(q => q.isCorrect).length;
    const skippedCount = perQuestion.filter(q => q.isSkipped).length;
    const wrongCount = perQuestion.length - correctCount - skippedCount;

    // Insights
    const weakQuestions = perQuestion.filter(q => !q.isCorrect && !q.isSkipped && q.classSuccessRate >= 60);
    const hardQuestions = perQuestion.filter(q => !q.isCorrect && q.classSuccessRate < 40);
    const timeHogs = perQuestion.filter(q => q.myTime > 0).sort((a, b) => b.myTime - a.myTime).slice(0, 3);
    const fasterThanClass = perQuestion.filter(q => q.timeVsClass < -20 && q.myTime > 0).length;
    const slowerThanClass = perQuestion.filter(q => q.timeVsClass > 50 && q.myTime > 0).length;

    return res.json({
      test: { ...test, totalQuestions: questions.length },
      submission: {
        id: submission.id, score: submission.score, totalPoints: submission.totalPoints,
        percentage: submission.percentage, passed: submission.passed, submittedAt: submission.submittedAt,
        totalTime, correctCount, wrongCount, skippedCount,
        flaggedCount: myFlagged.length,
      },
      classStats: { totalSubs, classAvg, classPassRate, rank, percentile },
      perQuestion,
      insights: { weakQuestions, hardQuestions, timeHogs, fasterThanClass, slowerThanClass },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/tests/:id/results — admin sees all submissions
router.get("/tests/:id/results", requireAuth, async (req, res) => {
  try {
    const testId = parseInt(req.params.id, 10);
    const userId = parseInt(req.cookies.userId, 10);
    const user = await getUser(userId);
    if (!user || (user.role !== "admin" && user.role !== "super_admin")) return res.status(403).json({ error: "Forbidden" });

    const submissions = await db.select({
      id: testSubmissionsTable.id, studentId: testSubmissionsTable.studentId,
      score: testSubmissionsTable.score, totalPoints: testSubmissionsTable.totalPoints,
      percentage: testSubmissionsTable.percentage, passed: testSubmissionsTable.passed,
      submittedAt: testSubmissionsTable.submittedAt, answers: testSubmissionsTable.answers,
      studentName: usersTable.fullName, studentUsername: usersTable.username,
    }).from(testSubmissionsTable)
      .leftJoin(usersTable, eq(testSubmissionsTable.studentId, usersTable.id))
      .where(eq(testSubmissionsTable.testId, testId))
      .orderBy(testSubmissionsTable.submittedAt);

    return res.json(submissions);
  } catch { return res.status(500).json({ error: "Internal server error" }); }
});

// GET /api/tests/:id/analytics — detailed analytics with per-question breakdown
router.get("/tests/:id/analytics", requireAuth, async (req, res) => {
  try {
    const testId = parseInt(req.params.id, 10);
    const userId = parseInt(req.cookies.userId, 10);
    const user = await getUser(userId);
    if (!user || (user.role !== "admin" && user.role !== "super_admin")) return res.status(403).json({ error: "Forbidden" });

    const [test] = await db.select().from(testsTable).where(eq(testsTable.id, testId));
    if (!test) return res.status(404).json({ error: "Not found" });

    const questions = await db.select().from(testQuestionsTable)
      .where(eq(testQuestionsTable.testId, testId)).orderBy(testQuestionsTable.order);

    const submissions = await db.select({
      id: testSubmissionsTable.id, score: testSubmissionsTable.score,
      totalPoints: testSubmissionsTable.totalPoints, percentage: testSubmissionsTable.percentage,
      passed: testSubmissionsTable.passed, submittedAt: testSubmissionsTable.submittedAt,
      answers: testSubmissionsTable.answers,
      questionTimings: testSubmissionsTable.questionTimings,
      flaggedQuestions: testSubmissionsTable.flaggedQuestions,
      studentId: testSubmissionsTable.studentId,
      studentName: usersTable.fullName, studentUsername: usersTable.username,
    }).from(testSubmissionsTable)
      .leftJoin(usersTable, eq(testSubmissionsTable.studentId, usersTable.id))
      .where(eq(testSubmissionsTable.testId, testId))
      .orderBy(testSubmissionsTable.submittedAt);

    const total = submissions.length;
    const passCount = submissions.filter((s) => s.passed).length;
    const avgPercentage = total > 0 ? Math.round(submissions.reduce((a, s) => a + s.percentage, 0) / total) : 0;
    const avgScore = total > 0 ? +(submissions.reduce((a, s) => a + s.score, 0) / total).toFixed(1) : 0;
    const maxScore = total > 0 ? Math.max(...submissions.map((s) => s.percentage)) : 0;
    const minScore = total > 0 ? Math.min(...submissions.map((s) => s.percentage)) : 0;

    // Standard deviation of scores
    const stdDev = total > 1
      ? Math.round(Math.sqrt(submissions.reduce((acc, s) => acc + Math.pow(s.percentage - avgPercentage, 2), 0) / total))
      : 0;

    // Score distribution buckets (0-20, 20-40, 40-60, 60-80, 80-100)
    const buckets = [
      { range: "0–20%", min: 0, max: 20, count: 0 },
      { range: "21–40%", min: 21, max: 40, count: 0 },
      { range: "41–60%", min: 41, max: 60, count: 0 },
      { range: "61–80%", min: 61, max: 80, count: 0 },
      { range: "81–100%", min: 81, max: 100, count: 0 },
    ];
    submissions.forEach((s) => {
      const bucket = buckets.find((b) => s.percentage >= b.min && s.percentage <= b.max);
      if (bucket) bucket.count++;
    });

    // Median score
    const sortedPct = [...submissions.map((s) => s.percentage)].sort((a, b) => a - b);
    const median = total > 0
      ? total % 2 === 0
        ? Math.round((sortedPct[total / 2 - 1] + sortedPct[total / 2]) / 2)
        : sortedPct[Math.floor(total / 2)]
      : 0;

    // Per-question analytics with time analysis + discrimination index
    const perQuestion = questions.map((q) => {
      let correctCount = 0;
      let skippedCount = 0;
      const optionCounts: number[] = q.options ? JSON.parse(q.options).map(() => 0) : [];
      const timingsPerSub: number[] = [];
      let flaggedCount = 0;

      // For discrimination index: split into top/bottom 27%
      const n27 = Math.max(1, Math.round(total * 0.27));
      const sortedByScore = [...submissions].sort((a, b) => b.percentage - a.percentage);
      const topGroup = sortedByScore.slice(0, n27);
      const bottomGroup = sortedByScore.slice(-n27);
      let topCorrect = 0;
      let bottomCorrect = 0;

      submissions.forEach((s) => {
        const parsedAnswers = JSON.parse(s.answers ?? "{}");
        const answer = parsedAnswers[q.id];
        const timings = s.questionTimings ? JSON.parse(s.questionTimings) : {};
        const flagged = s.flaggedQuestions ? JSON.parse(s.flaggedQuestions) : [];

        if (answer === undefined || answer === null || answer === "") {
          skippedCount++;
        } else {
          if (gradeQuestion(q, answer)) correctCount++;
        }

        if (flagged.includes(q.id) || flagged.includes(String(q.id))) flaggedCount++;

        const timing = timings[q.id] ?? timings[String(q.id)] ?? 0;
        timingsPerSub.push(Number(timing) || 0);

        // Track option selections for MCQ/multi
        if ((q.questionType ?? "mcq") === "mcq" && answer !== undefined && answer !== null) {
          const idx = Number(answer);
          if (optionCounts[idx] !== undefined) optionCounts[idx]++;
        }
        if ((q.questionType ?? "mcq") === "multi" && Array.isArray(answer)) {
          answer.forEach((idx: number) => {
            if (optionCounts[idx] !== undefined) optionCounts[idx]++;
          });
        }
      });

      // Discrimination index for top/bottom groups
      topGroup.forEach((s) => {
        const parsedAnswers = JSON.parse(s.answers ?? "{}");
        const answer = parsedAnswers[q.id];
        if (gradeQuestion(q, answer)) topCorrect++;
      });
      bottomGroup.forEach((s) => {
        const parsedAnswers = JSON.parse(s.answers ?? "{}");
        const answer = parsedAnswers[q.id];
        if (gradeQuestion(q, answer)) bottomCorrect++;
      });

      const discriminationIndex = n27 > 0
        ? +((topCorrect / n27 - bottomCorrect / n27)).toFixed(2)
        : 0;

      const avgTime = timingsPerSub.length > 0
        ? Math.round(timingsPerSub.reduce((a, b) => a + b, 0) / timingsPerSub.length)
        : 0;
      const maxTime = timingsPerSub.length > 0 ? Math.max(...timingsPerSub) : 0;
      const minTime = timingsPerSub.length > 0 ? Math.min(...timingsPerSub) : 0;

      const successRate = total > 0 ? Math.round((correctCount / total) * 100) : 0;

      // Difficulty classification
      const difficulty = successRate >= 75 ? "easy" : successRate >= 40 ? "medium" : "hard";

      // Quality classification based on discrimination index
      const quality = discriminationIndex >= 0.4 ? "excellent"
        : discriminationIndex >= 0.3 ? "good"
        : discriminationIndex >= 0.2 ? "fair"
        : "poor";

      return {
        id: q.id,
        question: q.question,
        questionType: q.questionType ?? "mcq",
        options: q.options ? JSON.parse(q.options) : [],
        optionImages: q.optionImages ? JSON.parse(q.optionImages) : null,
        correctAnswer: q.correctAnswer,
        correctAnswerMulti: q.correctAnswerMulti ? JSON.parse(q.correctAnswerMulti) : null,
        correctAnswerMin: q.correctAnswerMin ?? null,
        correctAnswerMax: q.correctAnswerMax ?? null,
        points: q.points,
        correctCount,
        wrongCount: total - correctCount - skippedCount,
        skippedCount,
        successRate,
        optionCounts,
        imageData: q.imageData ?? null,
        // Advanced metrics
        difficulty,
        quality,
        discriminationIndex,
        flaggedCount,
        avgTime,
        maxTime,
        minTime,
        timingsPerSub,
      };
    });

    // Per-student breakdown (with timings for heatmap)
    const studentBreakdown = submissions.map((s) => {
      const parsedAnswers = JSON.parse(s.answers ?? "{}");
      const timings = s.questionTimings ? JSON.parse(s.questionTimings) : {};
      const flagged = s.flaggedQuestions ? JSON.parse(s.flaggedQuestions) : [];

      const questionResults = questions.map((q) => {
        const answer = parsedAnswers[q.id];
        const timing = timings[q.id] ?? timings[String(q.id)] ?? 0;
        const isCorrect = answer !== undefined && answer !== null && answer !== ""
          ? gradeQuestion(q, answer) : null;
        return {
          qId: q.id,
          correct: isCorrect,
          time: Number(timing) || 0,
          flagged: flagged.includes(q.id) || flagged.includes(String(q.id)),
        };
      });

      const totalTime = questionResults.reduce((a, r) => a + r.time, 0);

      return {
        id: s.id,
        studentId: s.studentId,
        studentName: s.studentName,
        studentUsername: s.studentUsername,
        score: s.score,
        totalPoints: s.totalPoints,
        percentage: s.percentage,
        passed: s.passed,
        submittedAt: s.submittedAt,
        totalTime,
        questionResults,
      };
    });

    // Over-time trend (if multiple submissions, group by date)
    const submissionsByDate = new Map<string, { total: number; passed: number; avgPct: number; scores: number[] }>();
    submissions.forEach((s) => {
      const dateKey = s.submittedAt ? new Date(s.submittedAt).toISOString().slice(0, 10) : "unknown";
      if (!submissionsByDate.has(dateKey)) submissionsByDate.set(dateKey, { total: 0, passed: 0, avgPct: 0, scores: [] });
      const d = submissionsByDate.get(dateKey)!;
      d.total++;
      if (s.passed) d.passed++;
      d.scores.push(s.percentage);
    });
    const trendData = [...submissionsByDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, d]) => ({
      date,
      submissions: d.total,
      passRate: Math.round((d.passed / d.total) * 100),
      avgScore: Math.round(d.scores.reduce((a, b) => a + b, 0) / d.scores.length),
    }));

    return res.json({
      test: { id: test.id, title: test.title, passingScore: test.passingScore, durationMinutes: test.durationMinutes },
      total, passCount, failCount: total - passCount,
      avgPercentage, avgScore, maxScore, minScore, stdDev, median,
      scoreDistribution: buckets,
      perQuestion,
      studentBreakdown,
      trendData,
      // Summary counts
      difficultyBreakdown: {
        easy: perQuestion.filter((q) => q.difficulty === "easy").length,
        medium: perQuestion.filter((q) => q.difficulty === "medium").length,
        hard: perQuestion.filter((q) => q.difficulty === "hard").length,
      },
      hardestQuestions: [...perQuestion].sort((a, b) => a.successRate - b.successRate).slice(0, 3).map((q) => ({ id: q.id, question: q.question, successRate: q.successRate })),
      easiestQuestions: [...perQuestion].sort((a, b) => b.successRate - a.successRate).slice(0, 3).map((q) => ({ id: q.id, question: q.question, successRate: q.successRate })),
      mostTimeConsuming: [...perQuestion].sort((a, b) => b.avgTime - a.avgTime).slice(0, 3).map((q) => ({ id: q.id, question: q.question, avgTime: q.avgTime })),
      mostFlagged: [...perQuestion].sort((a, b) => b.flaggedCount - a.flaggedCount).slice(0, 3).map((q) => ({ id: q.id, question: q.question, flaggedCount: q.flaggedCount })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/calendar
router.get("/calendar", requireAuth, async (req, res) => {
  try {
    const userId = parseInt(req.cookies.userId, 10);
    const user = await getUser(userId);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    let classRows: any[] = [], testRows: any[] = [], lecturePlanRows: any[] = [];
    if (user.role === "super_admin") {
      classRows = await db.select().from(classesTable);
      testRows = await db.select({ id: testsTable.id, title: testsTable.title, scheduledAt: testsTable.scheduledAt, createdAt: testsTable.createdAt, classId: testsTable.classId, isPublished: testsTable.isPublished }).from(testsTable);
      lecturePlanRows = await db.select().from(lecturePlansTable);
    } else if (user.role === "admin") {
      classRows = await db.select().from(classesTable).where(eq(classesTable.adminId, userId));
      testRows = await db.select({ id: testsTable.id, title: testsTable.title, scheduledAt: testsTable.scheduledAt, createdAt: testsTable.createdAt, classId: testsTable.classId, isPublished: testsTable.isPublished }).from(testsTable).where(eq(testsTable.createdBy, userId));
      lecturePlanRows = await db.select().from(lecturePlansTable).where(eq(lecturePlansTable.teacherId, userId));
    } else if (user.role === "planner") {
      classRows = await db.select().from(classesTable).where(eq(classesTable.plannerId, userId));
      lecturePlanRows = await db.select().from(lecturePlansTable).where(eq(lecturePlansTable.plannerId, userId));
    } else {
      const enrollments = await db.select({ classId: enrollmentsTable.classId }).from(enrollmentsTable).where(eq(enrollmentsTable.studentId, userId));
      const classIds = enrollments.map((e) => e.classId);
      if (classIds.length > 0) {
        classRows = await db.select().from(classesTable).where(inArray(classesTable.id, classIds));
        testRows = await db.select({ id: testsTable.id, title: testsTable.title, scheduledAt: testsTable.scheduledAt, createdAt: testsTable.createdAt, classId: testsTable.classId })
          .from(testsTable)
          .where(and(
            eq(testsTable.isPublished, true),
            or(inArray(testsTable.classId, classIds), isNull(testsTable.classId))
          ));
      }
    }

    const lecturePlanUserIds = [...new Set(lecturePlanRows.flatMap((plan) => [plan.teacherId, plan.plannerId]))];
    const lecturePlanUsers = lecturePlanUserIds.length > 0
      ? await db
          .select({ id: usersTable.id, fullName: usersTable.fullName, username: usersTable.username })
          .from(usersTable)
          .where(inArray(usersTable.id, lecturePlanUserIds))
      : [];
    const lecturePlanUserMap = new Map(lecturePlanUsers.map((u) => [u.id, u]));

    const events = [
      ...classRows.map((c) => ({
        id: `class-${c.id}`,
        type: "class" as const,
        title: c.title,
        date: (c.scheduledAt ?? c.createdAt).toISOString(),
        status: c.status,
        linkId: c.id,
        isScheduled: !!c.scheduledAt,
      })),
      ...testRows.map((t) => ({
        id: `test-${t.id}`,
        type: "test" as const,
        title: t.title,
        date: (t.scheduledAt ?? t.createdAt).toISOString(),
        linkId: t.id,
        isScheduled: !!t.scheduledAt,
      })),
      ...lecturePlanRows.map((plan) => ({
        id: `lecture-plan-${plan.id}`,
        type: "lecture_plan" as const,
        title: plan.title,
        subject: plan.subject,
        description: plan.description,
        date: plan.scheduledAt.toISOString(),
        linkId: plan.id,
        isScheduled: true,
        teacherName: lecturePlanUserMap.get(plan.teacherId)?.fullName ?? null,
        teacherUsername: lecturePlanUserMap.get(plan.teacherId)?.username ?? null,
        plannerName: lecturePlanUserMap.get(plan.plannerId)?.fullName ?? null,
        plannerUsername: lecturePlanUserMap.get(plan.plannerId)?.username ?? null,
      })),
    ];
    return res.json(events);
  } catch { return res.status(500).json({ error: "Internal server error" }); }
});

export { router as testsRouter };
