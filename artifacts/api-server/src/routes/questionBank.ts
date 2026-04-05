import { Router } from "express";
import {
  db,
  questionBankQuestionsTable,
  questionBankReportsTable,
  questionBankSavedQuestionsTable,
  chaptersTable,
  subjectsTable,
  classesTable,
  usersTable,
  enrollmentsTable,
} from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { extractQuestionBankFromText } from "../lib/questionExtractionAI";

const router = Router();

type Auth = { userId: number; role: string };
type QuestionType = "mcq" | "multi" | "integer";
type NormalizedQuestionValue = {
  question: string;
  questionType: QuestionType;
  options: string[];
  optionImages: Array<string | null>;
  correctAnswer: number | null;
  correctAnswerMulti: number[];
  correctAnswerMin: number | null;
  correctAnswerMax: number | null;
  explanation: string | null;
  difficulty: string;
  points: number;
  imageData: string | null;
};

function getAuth(req: any, res: any): Auth | null {
  const userId = Number(req.cookies?.userId);
  const role = req.cookies?.userRole;

  if (!userId || Number.isNaN(userId) || !role) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }

  return { userId, role };
}

function safeParseArray<T>(value: string | null | undefined, fallback: T[]): T[] {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
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

async function getQuestionContext(questionId: number) {
  const [question] = await db.select().from(questionBankQuestionsTable).where(eq(questionBankQuestionsTable.id, questionId));
  if (!question) return null;
  const context = await getChapterContext(question.chapterId);
  if (!context) return null;
  return { question, ...context };
}

function canViewClassQuestionBank(auth: Auth, cls: typeof classesTable.$inferSelect, isEnrolled: boolean) {
  if (auth.role === "super_admin") return true;
  if (auth.role === "planner") return cls.plannerId === auth.userId;
  if (auth.role === "admin") return cls.adminId === auth.userId;
  if (auth.role === "student") return isEnrolled;
  return false;
}

function canManageQuestionBank(auth: Auth, subject: typeof subjectsTable.$inferSelect, cls: typeof classesTable.$inferSelect) {
  if (auth.role === "super_admin") return true;
  if (auth.role !== "admin") return false;
  const effectiveTeacherId = subject.teacherId ?? cls.adminId;
  return effectiveTeacherId === auth.userId;
}

async function canTeacherManageClassQuestionBank(auth: Auth, classId: number) {
  if (auth.role === "super_admin") return true;
  if (auth.role !== "admin") return false;

  const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, classId));
  if (!cls) return false;
  if (cls.adminId === auth.userId) return true;

  const assignedSubjects = await db
    .select({ id: subjectsTable.id })
    .from(subjectsTable)
    .where(and(eq(subjectsTable.classId, classId), eq(subjectsTable.teacherId, auth.userId)));

  return assignedSubjects.length > 0;
}

async function getClassAccess(auth: Auth, classId: number) {
  const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, classId));
  if (!cls) return { error: "Class not found", status: 404 as const };

  const subjects = await db
    .select()
    .from(subjectsTable)
    .where(eq(subjectsTable.classId, classId))
    .orderBy(subjectsTable.order, subjectsTable.createdAt);

  const isEnrolled = auth.role === "student"
    ? await db
        .select({ id: enrollmentsTable.id })
        .from(enrollmentsTable)
        .where(and(eq(enrollmentsTable.classId, classId), eq(enrollmentsTable.studentId, auth.userId)))
        .then((rows) => rows.length > 0)
    : false;

  const isAssignedSubjectTeacher = auth.role === "admin" && subjects.some((subject) => (subject.teacherId ?? cls.adminId) === auth.userId);

  if (!canViewClassQuestionBank(auth, cls, isEnrolled) && !isAssignedSubjectTeacher) {
    return { error: "Forbidden", status: 403 as const };
  }

  return { cls, subjects, isEnrolled, isAssignedSubjectTeacher };
}

function normalizeQuestionPayload(body: any) {
  const questionType: QuestionType = body.questionType === "multi" || body.questionType === "integer" ? body.questionType : "mcq";
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const explanation = typeof body.explanation === "string" && body.explanation.trim() ? body.explanation.trim() : null;
  const difficulty = typeof body.difficulty === "string" && body.difficulty.trim() ? body.difficulty.trim() : "medium";
  const points = Number.isFinite(Number(body.points)) ? Math.max(1, parseInt(String(body.points), 10)) : 1;
  const imageData = typeof body.imageData === "string" && body.imageData.trim() ? body.imageData.trim() : null;

  const rawOptions = Array.isArray(body.options) ? body.options : [];
  const options = rawOptions.map((option: unknown) => String(option ?? "").trim()).filter(Boolean);
  const rawOptionImages = Array.isArray(body.optionImages) ? body.optionImages : [];
  const optionImages = rawOptionImages.map((item: unknown) => {
    const value = typeof item === "string" ? item.trim() : "";
    return value || null;
  });

  const correctAnswer = body.correctAnswer === null || body.correctAnswer === undefined || body.correctAnswer === ""
    ? null
    : Number(body.correctAnswer);
  const correctAnswerMulti = Array.isArray(body.correctAnswerMulti)
    ? body.correctAnswerMulti
        .map((value: unknown) => Number(value))
        .filter((value: number) => Number.isInteger(value) && value >= 0)
    : [];
  const correctAnswerMin = body.correctAnswerMin === null || body.correctAnswerMin === undefined || body.correctAnswerMin === ""
    ? null
    : Number(body.correctAnswerMin);
  const correctAnswerMax = body.correctAnswerMax === null || body.correctAnswerMax === undefined || body.correctAnswerMax === ""
    ? null
    : Number(body.correctAnswerMax);

  if (!question) return { error: "Question is required" };

  if (questionType === "mcq") {
    if (options.length < 2) return { error: "MCQ needs at least 2 options" };
    if (!Number.isInteger(correctAnswer) || correctAnswer < 0 || correctAnswer >= options.length) {
      return { error: "Valid correct answer is required" };
    }
  }

  if (questionType === "multi") {
    if (options.length < 2) return { error: "Multi-select needs at least 2 options" };
    if (correctAnswerMulti.length === 0 || correctAnswerMulti.some((idx) => idx < 0 || idx >= options.length)) {
      return { error: "Select at least one valid correct option" };
    }
  }

  if (questionType === "integer") {
    const hasExact = Number.isInteger(correctAnswer);
    const hasRange = Number.isInteger(correctAnswerMin) && Number.isInteger(correctAnswerMax) && (correctAnswerMin as number) <= (correctAnswerMax as number);
    if (!hasExact && !hasRange) {
      return { error: "Integer answer or range is required" };
    }
  }

  return {
    value: {
      question,
      questionType,
      options,
      optionImages,
      correctAnswer: Number.isInteger(correctAnswer) ? correctAnswer : null,
      correctAnswerMulti,
      correctAnswerMin: Number.isInteger(correctAnswerMin) ? correctAnswerMin : null,
      correctAnswerMax: Number.isInteger(correctAnswerMax) ? correctAnswerMax : null,
      explanation,
      difficulty,
      points,
      imageData,
    } satisfies NormalizedQuestionValue,
  };
}

function buildQuestionInsertValues(
  parsed: NormalizedQuestionValue,
  context: NonNullable<Awaited<ReturnType<typeof getChapterContext>>>,
  order: number,
  createdBy: number,
) {
  return {
    classId: context.cls.id,
    subjectId: context.subject.id,
    chapterId: context.chapter.id,
    question: parsed.question,
    questionType: parsed.questionType,
    options: JSON.stringify(parsed.options),
    optionImages: parsed.optionImages.some(Boolean) ? JSON.stringify(parsed.optionImages) : null,
    correctAnswer: parsed.correctAnswer,
    correctAnswerMulti: parsed.correctAnswerMulti.length > 0 ? JSON.stringify(parsed.correctAnswerMulti) : null,
    correctAnswerMin: parsed.correctAnswerMin,
    correctAnswerMax: parsed.correctAnswerMax,
    answer: parsed.questionType === "integer"
      ? String(parsed.correctAnswer ?? parsed.correctAnswerMin ?? "")
      : parsed.questionType === "mcq"
        ? parsed.options[parsed.correctAnswer ?? 0] ?? null
        : parsed.correctAnswerMulti.map((idx) => parsed.options[idx]).filter(Boolean).join(", "),
    explanation: parsed.explanation,
    difficulty: parsed.difficulty,
    points: parsed.points,
    order,
    imageData: parsed.imageData,
    createdBy,
  };
}

router.get("/question-bank/classes/:classId", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;

  const classId = parseInt(req.params.classId, 10);
  if (Number.isNaN(classId)) return res.status(400).json({ error: "Invalid class id" });

  const access = await getClassAccess(auth, classId);
  if ("error" in access) return res.status(access.status).json({ error: access.error });

  const { cls, subjects } = access;
  const subjectIds = subjects.map((subject) => subject.id);
  const chapters = subjectIds.length > 0
    ? await db
        .select()
        .from(chaptersTable)
        .where(inArray(chaptersTable.subjectId, subjectIds))
        .orderBy(chaptersTable.order, chaptersTable.createdAt)
    : [];

  const chapterIds = chapters.map((chapter) => chapter.id);
  const questions = chapterIds.length > 0
    ? await db
        .select()
        .from(questionBankQuestionsTable)
        .where(inArray(questionBankQuestionsTable.chapterId, chapterIds))
        .orderBy(questionBankQuestionsTable.order, questionBankQuestionsTable.createdAt)
    : [];

  const questionIds = questions.map((question) => question.id);
  const reports = questionIds.length > 0
    ? await db
        .select()
        .from(questionBankReportsTable)
        .where(inArray(questionBankReportsTable.questionId, questionIds))
        .orderBy(desc(questionBankReportsTable.createdAt))
    : [];

  const savedRows = auth.role === "student" && questionIds.length > 0
    ? await db
        .select()
        .from(questionBankSavedQuestionsTable)
        .where(and(inArray(questionBankSavedQuestionsTable.questionId, questionIds), eq(questionBankSavedQuestionsTable.studentId, auth.userId)))
    : [];

  const subjectTeacherIds = [...new Set(subjects.map((subject) => subject.teacherId ?? cls.adminId).filter((value): value is number => !!value))];
  const reporterIds = [...new Set(reports.map((report) => report.reportedBy))];
  const userIds = [...new Set([...subjectTeacherIds, ...reporterIds])];
  const users = userIds.length > 0
    ? await db
        .select({ id: usersTable.id, fullName: usersTable.fullName, username: usersTable.username })
        .from(usersTable)
        .where(inArray(usersTable.id, userIds))
    : [];
  const userMap = new Map(users.map((user) => [user.id, user]));

  const reportsByQuestion = new Map<number, Array<typeof questionBankReportsTable.$inferSelect>>();
  for (const report of reports) {
    const existing = reportsByQuestion.get(report.questionId) ?? [];
    existing.push(report);
    reportsByQuestion.set(report.questionId, existing);
  }

  const savedQuestionIds = new Set(savedRows.map((row) => row.questionId));

  const serializedQuestions = questions.map((question) => {
    const questionReports = reportsByQuestion.get(question.id) ?? [];
    return {
      ...question,
      options: safeParseArray<string>(question.options, []),
      optionImages: safeParseArray<string | null>(question.optionImages, []),
      correctAnswerMulti: safeParseArray<number>(question.correctAnswerMulti, []),
      reports: questionReports.map((report) => ({
        id: report.id,
        reportedBy: report.reportedBy,
        reporterName: userMap.get(report.reportedBy)?.fullName ?? userMap.get(report.reportedBy)?.username ?? "Student",
        reason: report.reason,
        status: report.status,
        createdAt: report.createdAt,
      })),
      reportCount: questionReports.length,
      openReportCount: questionReports.filter((report) => report.status === "open").length,
      isSaved: savedQuestionIds.has(question.id),
    };
  });

  const questionsByChapter = new Map<number, typeof serializedQuestions>();
  for (const question of serializedQuestions) {
    const existing = questionsByChapter.get(question.chapterId) ?? [];
    existing.push(question);
    questionsByChapter.set(question.chapterId, existing);
  }

  const chaptersBySubject = new Map<number, Array<typeof chaptersTable.$inferSelect & { questions: typeof serializedQuestions }>>();
  for (const chapter of chapters) {
    const existing = chaptersBySubject.get(chapter.subjectId) ?? [];
    existing.push({ ...chapter, questions: questionsByChapter.get(chapter.id) ?? [] });
    chaptersBySubject.set(chapter.subjectId, existing);
  }

  const result = subjects.map((subject) => {
    const teacherId = subject.teacherId ?? cls.adminId;
    const teacher = teacherId ? userMap.get(teacherId) : null;
    return {
      ...subject,
      teacherId,
      teacherName: teacher?.fullName ?? null,
      teacherUsername: teacher?.username ?? null,
      chapters: chaptersBySubject.get(subject.id) ?? [],
    };
  });

  const savedBucket = serializedQuestions.filter((question) => question.isSaved);

  res.json({
    class: {
      id: cls.id,
      title: cls.title,
      subject: cls.subject,
    },
    subjects: result,
    savedBucket,
  });
});

router.post("/chapters/:chapterId/question-bank-questions", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;

  const chapterId = parseInt(req.params.chapterId, 10);
  if (Number.isNaN(chapterId)) return res.status(400).json({ error: "Invalid chapter id" });

  const context = await getChapterContext(chapterId);
  if (!context) return res.status(404).json({ error: "Chapter not found" });
  if (!canManageQuestionBank(auth, context.subject, context.cls)) {
    return res.status(403).json({ error: "Only the assigned subject teacher can add questions" });
  }

  const parsed = normalizeQuestionPayload(req.body);
  if ("error" in parsed) return res.status(400).json({ error: parsed.error });

  const existingCount = await db
    .select({ id: questionBankQuestionsTable.id })
    .from(questionBankQuestionsTable)
    .where(eq(questionBankQuestionsTable.chapterId, chapterId));

  const [created] = await db
    .insert(questionBankQuestionsTable)
    .values(buildQuestionInsertValues(parsed.value, context, existingCount.length, auth.userId))
    .returning();

  res.status(201).json(created);
});

router.post("/chapters/:chapterId/question-bank-questions/bulk", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;

  const chapterId = parseInt(req.params.chapterId, 10);
  if (Number.isNaN(chapterId)) return res.status(400).json({ error: "Invalid chapter id" });

  const context = await getChapterContext(chapterId);
  if (!context) return res.status(404).json({ error: "Chapter not found" });
  if (!canManageQuestionBank(auth, context.subject, context.cls)) {
    return res.status(403).json({ error: "Only the assigned subject teacher can add questions" });
  }

  const rawQuestions = Array.isArray(req.body?.questions) ? req.body.questions : [];
  if (rawQuestions.length === 0) return res.status(400).json({ error: "At least one question is required" });

  const parsedQuestions = rawQuestions.map((item) => normalizeQuestionPayload(item));
  const firstError = parsedQuestions.find((item) => "error" in item);
  if (firstError && "error" in firstError) {
    return res.status(400).json({ error: firstError.error });
  }

  const existingCount = await db
    .select({ id: questionBankQuestionsTable.id })
    .from(questionBankQuestionsTable)
    .where(eq(questionBankQuestionsTable.chapterId, chapterId));

  const values = parsedQuestions.map((item, index) => {
    const parsed = (item as { value: NormalizedQuestionValue }).value;
    return buildQuestionInsertValues(parsed, context, existingCount.length + index, auth.userId);
  });

  const created = await db.insert(questionBankQuestionsTable).values(values).returning();
  res.status(201).json(created);
});

router.post("/chapters/:chapterId/question-bank-questions/ai-extract", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;

  const chapterId = parseInt(req.params.chapterId, 10);
  if (Number.isNaN(chapterId)) return res.status(400).json({ error: "Invalid chapter id" });

  const context = await getChapterContext(chapterId);
  if (!context) return res.status(404).json({ error: "Chapter not found" });
  if (!canManageQuestionBank(auth, context.subject, context.cls)) {
    return res.status(403).json({ error: "Only the assigned subject teacher can extract questions here" });
  }

  const rawText = typeof req.body?.rawText === "string" ? req.body.rawText : "";
  const imageDataUrls = Array.isArray(req.body?.imageDataUrls)
    ? req.body.imageDataUrls.map((item: unknown) => String(item ?? "").trim()).filter(Boolean)
    : [];
  if (!rawText.trim() && imageDataUrls.length === 0) {
    return res.status(400).json({ error: "Input text, image upload, or both are required" });
  }

  try {
    const extracted = await extractQuestionBankFromText({ rawText, imageDataUrls });
    const questions = extracted.map((item) => {
      if (item.type === "integer") {
        return {
          question: item.question,
          questionType: "integer",
          options: [],
          correctAnswer: 0,
          correctAnswerMulti: [],
          correctAnswerInt: item.answer !== undefined ? String(item.answer) : "",
          correctAnswerMin: "",
          correctAnswerMax: "",
          integerMode: "exact",
          explanation: "",
          difficulty: "medium",
          points: "1",
          hasImage: item.hasImage,
        };
      }

      return {
        question: item.question,
        questionType: item.type,
        options: item.options ?? [],
        correctAnswer: item.correct?.[0] ?? 0,
        correctAnswerMulti: item.correct ?? [],
        correctAnswerInt: "",
        correctAnswerMin: "",
        correctAnswerMax: "",
        integerMode: "exact",
        explanation: "",
        difficulty: "medium",
        points: "1",
        hasImage: item.hasImage,
      };
    });

    res.json({ questions });
  } catch (error: any) {
    res.status(500).json({ error: error?.message ?? "AI extraction failed" });
  }
});

router.post("/question-bank/classes/:classId/subjects", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;

  const classId = parseInt(req.params.classId, 10);
  if (Number.isNaN(classId)) return res.status(400).json({ error: "Invalid class id" });

  const allowed = await canTeacherManageClassQuestionBank(auth, classId);
  if (!allowed) {
    return res.status(403).json({ error: "Only the assigned teacher can add subjects here" });
  }

  const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, classId));
  if (!cls) return res.status(404).json({ error: "Class not found" });

  const { title, description } = req.body ?? {};
  if (typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "Subject title is required" });
  }

  const existingCount = await db
    .select({ id: subjectsTable.id })
    .from(subjectsTable)
    .where(eq(subjectsTable.classId, classId));

  const [subject] = await db
    .insert(subjectsTable)
    .values({
      classId,
      title: title.trim(),
      description: typeof description === "string" && description.trim() ? description.trim() : null,
      teacherId: auth.role === "admin" ? auth.userId : cls.adminId,
      order: existingCount.length,
    })
    .returning();

  const [teacher] = await db
    .select({ fullName: usersTable.fullName, username: usersTable.username })
    .from(usersTable)
    .where(eq(usersTable.id, subject.teacherId!));

  res.status(201).json({
    ...subject,
    teacherName: teacher?.fullName ?? null,
    teacherUsername: teacher?.username ?? null,
    chapters: [],
  });
});

router.post("/question-bank/subjects/:subjectId/chapters", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;

  const subjectId = parseInt(req.params.subjectId, 10);
  if (Number.isNaN(subjectId)) return res.status(400).json({ error: "Invalid subject id" });

  const [subject] = await db.select().from(subjectsTable).where(eq(subjectsTable.id, subjectId));
  if (!subject) return res.status(404).json({ error: "Subject not found" });

  const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, subject.classId));
  if (!cls) return res.status(404).json({ error: "Class not found" });
  if (!canManageQuestionBank(auth, subject, cls)) {
    return res.status(403).json({ error: "Only the assigned subject teacher can add chapters" });
  }

  const { title, description } = req.body ?? {};
  if (typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "Chapter title is required" });
  }

  const existingCount = await db
    .select({ id: chaptersTable.id })
    .from(chaptersTable)
    .where(eq(chaptersTable.subjectId, subjectId));

  const [chapter] = await db
    .insert(chaptersTable)
    .values({
      subjectId,
      title: title.trim(),
      description: typeof description === "string" && description.trim() ? description.trim() : null,
      order: existingCount.length,
    })
    .returning();

  res.status(201).json({ ...chapter, questions: [] });
});

router.patch("/question-bank-questions/:id", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;

  const questionId = parseInt(req.params.id, 10);
  if (Number.isNaN(questionId)) return res.status(400).json({ error: "Invalid question id" });

  const context = await getQuestionContext(questionId);
  if (!context) return res.status(404).json({ error: "Question not found" });
  if (!canManageQuestionBank(auth, context.subject, context.cls)) {
    return res.status(403).json({ error: "Only the assigned subject teacher can update questions" });
  }

  const parsed = normalizeQuestionPayload(req.body);
  if ("error" in parsed) return res.status(400).json({ error: parsed.error });

  const [updated] = await db
    .update(questionBankQuestionsTable)
    .set({
      question: parsed.value.question,
      questionType: parsed.value.questionType,
      options: JSON.stringify(parsed.value.options),
      optionImages: parsed.value.optionImages.some(Boolean) ? JSON.stringify(parsed.value.optionImages) : null,
      correctAnswer: parsed.value.correctAnswer,
      correctAnswerMulti: parsed.value.correctAnswerMulti.length > 0 ? JSON.stringify(parsed.value.correctAnswerMulti) : null,
      correctAnswerMin: parsed.value.correctAnswerMin,
      correctAnswerMax: parsed.value.correctAnswerMax,
      answer: parsed.value.questionType === "integer"
        ? String(parsed.value.correctAnswer ?? parsed.value.correctAnswerMin ?? "")
        : parsed.value.questionType === "mcq"
          ? parsed.value.options[parsed.value.correctAnswer ?? 0] ?? null
          : parsed.value.correctAnswerMulti.map((idx) => parsed.value.options[idx]).filter(Boolean).join(", "),
      explanation: parsed.value.explanation,
      difficulty: parsed.value.difficulty,
      points: parsed.value.points,
      imageData: parsed.value.imageData,
      updatedAt: new Date(),
    })
    .where(eq(questionBankQuestionsTable.id, questionId))
    .returning();

  await db
    .update(questionBankReportsTable)
    .set({ status: "resolved", updatedAt: new Date() })
    .where(and(eq(questionBankReportsTable.questionId, questionId), eq(questionBankReportsTable.status, "open")));

  res.json(updated);
});

router.delete("/question-bank-questions/:id", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;

  const questionId = parseInt(req.params.id, 10);
  if (Number.isNaN(questionId)) return res.status(400).json({ error: "Invalid question id" });

  const context = await getQuestionContext(questionId);
  if (!context) return res.status(404).json({ error: "Question not found" });
  if (!canManageQuestionBank(auth, context.subject, context.cls)) {
    return res.status(403).json({ error: "Only the assigned subject teacher can delete questions" });
  }

  await db.delete(questionBankQuestionsTable).where(eq(questionBankQuestionsTable.id, questionId));
  res.sendStatus(204);
});

router.post("/question-bank-questions/:id/report", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;
  if (auth.role !== "student") return res.status(403).json({ error: "Only students can report questions" });

  const questionId = parseInt(req.params.id, 10);
  if (Number.isNaN(questionId)) return res.status(400).json({ error: "Invalid question id" });

  const context = await getQuestionContext(questionId);
  if (!context) return res.status(404).json({ error: "Question not found" });

  const isEnrolled = await db
    .select({ id: enrollmentsTable.id })
    .from(enrollmentsTable)
    .where(and(eq(enrollmentsTable.classId, context.cls.id), eq(enrollmentsTable.studentId, auth.userId)))
    .then((rows) => rows.length > 0);
  if (!isEnrolled) return res.status(403).json({ error: "Enroll in this batch first" });

  const teacherId = context.subject.teacherId ?? context.cls.adminId;
  if (!teacherId) return res.status(400).json({ error: "No teacher assigned for this subject" });

  const existingOpen = await db
    .select({ id: questionBankReportsTable.id })
    .from(questionBankReportsTable)
    .where(and(
      eq(questionBankReportsTable.questionId, questionId),
      eq(questionBankReportsTable.reportedBy, auth.userId),
      eq(questionBankReportsTable.status, "open"),
    ));
  if (existingOpen.length > 0) return res.status(409).json({ error: "You have already reported this question" });

  const reason = typeof req.body?.reason === "string" && req.body.reason.trim() ? req.body.reason.trim() : "Student reported an issue in this question";

  const [report] = await db
    .insert(questionBankReportsTable)
    .values({
      questionId,
      classId: context.cls.id,
      subjectId: context.subject.id,
      chapterId: context.chapter.id,
      reportedBy: auth.userId,
      teacherId,
      reason,
    })
    .returning();

  res.status(201).json(report);
});

router.post("/question-bank-questions/:id/save", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;
  if (auth.role !== "student") return res.status(403).json({ error: "Only students can save questions" });

  const questionId = parseInt(req.params.id, 10);
  if (Number.isNaN(questionId)) return res.status(400).json({ error: "Invalid question id" });

  const context = await getQuestionContext(questionId);
  if (!context) return res.status(404).json({ error: "Question not found" });

  const isEnrolled = await db
    .select({ id: enrollmentsTable.id })
    .from(enrollmentsTable)
    .where(and(eq(enrollmentsTable.classId, context.cls.id), eq(enrollmentsTable.studentId, auth.userId)))
    .then((rows) => rows.length > 0);
  if (!isEnrolled) return res.status(403).json({ error: "Enroll in this batch first" });

  const [existing] = await db
    .select()
    .from(questionBankSavedQuestionsTable)
    .where(and(eq(questionBankSavedQuestionsTable.questionId, questionId), eq(questionBankSavedQuestionsTable.studentId, auth.userId)));

  if (existing) {
    await db.delete(questionBankSavedQuestionsTable).where(eq(questionBankSavedQuestionsTable.id, existing.id));
    return res.json({ saved: false });
  }

  await db.insert(questionBankSavedQuestionsTable).values({ questionId, studentId: auth.userId });
  res.json({ saved: true });
});

router.get("/question-bank/reports", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;
  if (!["admin", "super_admin"].includes(auth.role)) return res.status(403).json({ error: "Forbidden" });

  const reports = auth.role === "super_admin"
    ? await db.select().from(questionBankReportsTable).orderBy(desc(questionBankReportsTable.createdAt))
    : await db
        .select()
        .from(questionBankReportsTable)
        .where(and(eq(questionBankReportsTable.teacherId, auth.userId), eq(questionBankReportsTable.status, "open")))
        .orderBy(desc(questionBankReportsTable.createdAt));

  const questionIds = reports.map((report) => report.questionId);
  const reporterIds = reports.map((report) => report.reportedBy);
  const [questions, reporters] = await Promise.all([
    questionIds.length > 0
      ? db.select().from(questionBankQuestionsTable).where(inArray(questionBankQuestionsTable.id, questionIds))
      : Promise.resolve([]),
    reporterIds.length > 0
      ? db
          .select({ id: usersTable.id, fullName: usersTable.fullName, username: usersTable.username })
          .from(usersTable)
          .where(inArray(usersTable.id, reporterIds))
      : Promise.resolve([]),
  ]);

  const questionMap = new Map(questions.map((question) => [question.id, question]));
  const reporterMap = new Map(reporters.map((reporter) => [reporter.id, reporter]));

  res.json(reports.map((report) => ({
    ...report,
    questionText: questionMap.get(report.questionId)?.question ?? "",
    reporterName: reporterMap.get(report.reportedBy)?.fullName ?? reporterMap.get(report.reportedBy)?.username ?? "Student",
  })));
});

export { router as questionBankRouter };
