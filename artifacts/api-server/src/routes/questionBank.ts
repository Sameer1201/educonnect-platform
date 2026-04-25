import { Router } from "express";
import {
  db,
} from "@workspace/db";
import {
  questionBankQuestionsTable,
  questionBankReportsTable,
  questionBankSavedQuestionsTable,
  questionBankQuestionProgressTable,
  chaptersTable,
  subjectsTable,
  classesTable,
  usersTable,
  enrollmentsTable,
} from "@workspace/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { ensureStudentFeatureUnlocked } from "../lib/studentFeatureAccess";

const router = Router();

type Auth = { userId: number; role: string };
type QuestionType = "mcq" | "multi" | "integer";
type QuestionBankAttemptAnswer = number | number[] | string;
type QuestionBankClassRow = typeof classesTable.$inferSelect & { isLocked?: boolean | null };
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
  topicTag: string | null;
  difficulty: string;
  points: number;
  imageData: string | null;
};
type NormalizedQuestionPayloadResult =
  | { value: NormalizedQuestionValue }
  | { error: string };
type ClassAccessError = { error: string; status: 403 | 404 };
type ClassAccessSuccess = {
  cls: typeof classesTable.$inferSelect;
  subjects: Array<typeof subjectsTable.$inferSelect>;
  isEnrolled: boolean;
  isAssignedSubjectTeacher: boolean;
};

function serializeQuestionTransferPayload(question: typeof questionBankQuestionsTable.$inferSelect) {
  return {
    question: question.question,
    questionType: question.questionType as QuestionType,
    options: safeParseArray<string>(question.options, []),
    optionImages: safeParseArray<string | null>(question.optionImages, []),
    correctAnswer: question.correctAnswer,
    correctAnswerMulti: safeParseArray<number>(question.correctAnswerMulti, []),
    correctAnswerMin: question.correctAnswerMin,
    correctAnswerMax: question.correctAnswerMax,
    explanation: question.explanation,
    topicTag: question.topicTag ?? null,
    difficulty: question.difficulty ?? "medium",
    points: question.points ?? 1,
    imageData: question.imageData ?? null,
  };
}

function getAuth(req: any, res: any): Auth | null {
  const userId = Number(req.cookies?.userId);
  const role = req.cookies?.userRole;

  if (!userId || Number.isNaN(userId) || !role) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }

  return { userId, role };
}

function isQuestionBankLocked(cls: QuestionBankClassRow) {
  return Boolean(cls.isLocked);
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

function normalizeExamKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  const compact = raw.replace(/[^a-z0-9]+/g, " ").trim();
  if (compact.includes("iit jam")) return "iit-jam";
  if (compact.includes("jee main")) return "jee-main";
  if (compact === "jee") return "jee";
  if (compact.includes("gate")) return "gate";
  if (compact.includes("cuet")) return "cuet";
  if (compact.includes("neet")) return "neet";
  if (compact.includes("cat")) return "cat";
  return compact.replace(/\s+/g, "-");
}

function normalizeTitleKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return normalized || null;
}

function normalizeQuestionDuplicateKey(question: string, questionType: QuestionType) {
  const normalizedQuestion = question.trim().toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalizedQuestion) return null;
  return `${questionType}:${normalizedQuestion}`;
}

function buildExistingQuestionDuplicateKey(question: { question: string; questionType: string | null }) {
  const questionType = question.questionType === "multi" || question.questionType === "integer" ? question.questionType : "mcq";
  return normalizeQuestionDuplicateKey(question.question, questionType);
}

function chunkValues<T>(values: T[], size: number): T[][] {
  if (values.length === 0) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function getAccessibleQuestionBankClasses(auth: Auth) {
  if (auth.role === "super_admin") {
    return db
      .select()
      .from(classesTable)
      .where(eq(classesTable.workflowType, "question_bank"));
  }

  if (auth.role === "admin") {
    const [ownedClasses, assignedSubjects, authoredQuestionClasses] = await Promise.all([
      db
        .select()
        .from(classesTable)
        .where(
          and(
            eq(classesTable.workflowType, "question_bank"),
            sql`(${classesTable.adminId} = ${auth.userId} OR ${classesTable.assignedTeacherIds} @> ARRAY[${auth.userId}]::integer[])`,
          ),
        ),
      db.select({ classId: subjectsTable.classId }).from(subjectsTable).where(eq(subjectsTable.teacherId, auth.userId)),
      db
        .selectDistinct({ classId: questionBankQuestionsTable.classId })
        .from(questionBankQuestionsTable)
        .where(eq(questionBankQuestionsTable.createdBy, auth.userId)),
    ]);

    const ownedIds = new Set(ownedClasses.map((item) => item.id));
    const assignedIds = new Set(assignedSubjects.map((item) => item.classId));
    const authoredIds = new Set(authoredQuestionClasses.map((item) => item.classId));
    if (assignedIds.size === 0 && authoredIds.size === 0) return ownedClasses;

    const extraClassIds = [...new Set([...assignedIds, ...authoredIds])].filter((id) => !ownedIds.has(id));
    const extraClasses = extraClassIds.length > 0
      ? await db
          .select()
          .from(classesTable)
          .where(
            and(
              inArray(classesTable.id, extraClassIds),
              eq(classesTable.workflowType, "question_bank"),
            ),
          )
      : [];

    return [...ownedClasses, ...extraClasses];
  }

  if (auth.role === "student") {
    return db
      .select()
      .from(classesTable)
      .where(
        and(
          eq(classesTable.workflowType, "question_bank"),
          sql`cardinality(${classesTable.assignedTeacherIds}) > 0`,
        ),
      );
  }

  return [];
}

async function getStudentExamKeys(userId: number) {
  const [user] = await db
    .select({ subject: usersTable.subject, additionalExams: usersTable.additionalExams })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  const keys = new Set<string>();
  const primary = normalizeExamKey(user?.subject);
  if (primary) keys.add(primary);
  for (const exam of user?.additionalExams ?? []) {
    const normalized = normalizeExamKey(exam);
    if (normalized) keys.add(normalized);
  }
  return keys;
}

function getQuestionBankClassExamKey(cls: QuestionBankClassRow) {
  return normalizeExamKey(cls.subject) ?? normalizeExamKey(cls.title);
}

async function findExistingQuestionBankCardByExam(exam: string, excludeClassId?: number) {
  const examKey = normalizeExamKey(exam);
  if (!examKey) return null;

  const questionBankClasses = await db
    .select()
    .from(classesTable)
    .where(eq(classesTable.workflowType, "question_bank"));

  return questionBankClasses.find((cls) => {
    if (excludeClassId && cls.id === excludeClassId) return false;
    return getQuestionBankClassExamKey(cls) === examKey;
  }) ?? null;
}

async function canStudentAccessQuestionBankClass(userId: number, cls: QuestionBankClassRow) {
  const examKey = getQuestionBankClassExamKey(cls);
  if (!examKey) return false;
  const studentExamKeys = await getStudentExamKeys(userId);
  return studentExamKeys.has(examKey);
}

function formatLocalDateKey(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function normalizeQuestionBankAttemptAnswer(
  question: typeof questionBankQuestionsTable.$inferSelect,
  value: unknown,
): { value: QuestionBankAttemptAnswer } | { error: string } {
  const questionType = question.questionType === "multi" || question.questionType === "integer" ? question.questionType : "mcq";

  if (questionType === "multi") {
    if (!Array.isArray(value) || value.length === 0) {
      return { error: "Select at least one option" };
    }
    const selected = value
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item >= 0)
      .filter((item, index, list) => list.indexOf(item) === index)
      .sort((a, b) => a - b);
    return selected.length > 0 ? { value: selected } : { error: "Select at least one valid option" };
  }

  if (questionType === "integer") {
    const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
    if (!raw) return { error: "Enter a numeric answer" };
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return { error: "Enter a valid numeric answer" };
    return { value: raw };
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return { error: "Select a valid option" };
  }
  return { value: parsed };
}

function isQuestionBankAttemptCorrect(
  question: typeof questionBankQuestionsTable.$inferSelect,
  answer: QuestionBankAttemptAnswer,
) {
  const questionType = question.questionType === "multi" || question.questionType === "integer" ? question.questionType : "mcq";

  if (questionType === "multi") {
    const correct = safeParseArray<number>(question.correctAnswerMulti, []).sort((a, b) => a - b);
    const selected = Array.isArray(answer) ? [...answer].sort((a, b) => a - b) : [];
    return JSON.stringify(selected) === JSON.stringify(correct);
  }

  if (questionType === "integer") {
    const numericAnswer = Number(answer);
    if (question.correctAnswerMin != null && question.correctAnswerMax != null) {
      return numericAnswer >= question.correctAnswerMin && numericAnswer <= question.correctAnswerMax;
    }
    return numericAnswer === question.correctAnswer;
  }

  return Number(answer) === question.correctAnswer;
}

async function buildQuestionBankTreeForClasses(auth: Auth, classes: QuestionBankClassRow[]) {
  const classIds = classes.map((item) => item.id);
  if (classIds.length === 0) {
    return { subjects: [], savedBucket: [] as any[] };
  }

  const subjects = await db
    .select()
    .from(subjectsTable)
    .where(inArray(subjectsTable.classId, classIds))
    .orderBy(subjectsTable.order, subjectsTable.createdAt);

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
  const progressRows = auth.role === "student" && questionIds.length > 0
    ? await db
        .select()
        .from(questionBankQuestionProgressTable)
        .where(and(inArray(questionBankQuestionProgressTable.questionId, questionIds), eq(questionBankQuestionProgressTable.studentId, auth.userId)))
    : [];

  const classMap = new Map(classes.map((cls) => [cls.id, cls]));
  const subjectTeacherIds = [...new Set(subjects.map((subject) => {
    const cls = classMap.get(subject.classId);
    return subject.teacherId ?? cls?.adminId ?? null;
  }).filter((value): value is number => !!value))];
  const reporterIds = [...new Set(reports.map((report) => report.reportedBy))];
  const userIds = [...new Set([...subjectTeacherIds, ...reporterIds])];
  const users = userIds.length > 0
    ? await db
        .select({ id: usersTable.id, fullName: usersTable.fullName, username: usersTable.username })
        .from(usersTable)
        .where(inArray(usersTable.id, userIds))
    : [];
  const userMap = new Map(users.map((user) => [user.id, user]));

  const reportsByQuestion = new Map<number, any[]>();
  for (const report of reports) {
    const existing = reportsByQuestion.get(report.questionId) ?? [];
    existing.push(report);
    reportsByQuestion.set(report.questionId, existing);
  }

  const savedQuestionIds = new Set(savedRows.map((row) => row.questionId));
  const progressByQuestionId = new Map(progressRows.map((row) => [row.questionId, row]));

  const serializedQuestions = questions.map((question) => {
    const questionReports = reportsByQuestion.get(question.id) ?? [];
    const progress = progressByQuestionId.get(question.id);
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
      progress: progress
        ? {
            attemptCount: progress.attemptCount,
            correctCount: progress.correctCount,
            incorrectCount: progress.incorrectCount,
            firstAttemptedAt: progress.firstAttemptedAt,
            lastAttemptedAt: progress.lastAttemptedAt,
            solvedAt: progress.solvedAt,
            lastIsCorrect: progress.lastIsCorrect,
          }
        : null,
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
    const cls = classMap.get(subject.classId);
    const teacherId = subject.teacherId ?? cls?.adminId ?? null;
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
  return { subjects: result, savedBucket };
}

async function getQuestionBankCardStats(classIds: number[]) {
  const stats = new Map<number, { subjectCount: number; chapterCount: number; questionCount: number }>();
  if (classIds.length === 0) return stats;

  const subjects = await db
    .select({ id: subjectsTable.id, classId: subjectsTable.classId })
    .from(subjectsTable)
    .where(inArray(subjectsTable.classId, classIds));
  const subjectIds = subjects.map((item) => item.id);

  const chapters = subjectIds.length > 0
    ? await db
        .select({ id: chaptersTable.id, subjectId: chaptersTable.subjectId })
        .from(chaptersTable)
        .where(inArray(chaptersTable.subjectId, subjectIds))
    : [];
  const chapterIds = chapters.map((item) => item.id);

  const questions = chapterIds.length > 0
    ? await db
        .select({ id: questionBankQuestionsTable.id, chapterId: questionBankQuestionsTable.chapterId })
        .from(questionBankQuestionsTable)
        .where(inArray(questionBankQuestionsTable.chapterId, chapterIds))
    : [];

  for (const classId of classIds) {
    stats.set(classId, { subjectCount: 0, chapterCount: 0, questionCount: 0 });
  }

  const subjectToClass = new Map(subjects.map((item) => [item.id, item.classId]));
  const chapterToSubject = new Map(chapters.map((item) => [item.id, item.subjectId]));

  for (const subject of subjects) {
    const entry = stats.get(subject.classId);
    if (entry) entry.subjectCount += 1;
  }

  for (const chapter of chapters) {
    const classId = subjectToClass.get(chapter.subjectId);
    const entry = classId ? stats.get(classId) : null;
    if (entry) entry.chapterCount += 1;
  }

  for (const question of questions) {
    const subjectId = chapterToSubject.get(question.chapterId);
    const classId = subjectId ? subjectToClass.get(subjectId) : null;
    const entry = classId ? stats.get(classId) : null;
    if (entry) entry.questionCount += 1;
  }

  return stats;
}

function classifyQuestionBankDeadline(deadline: Date | string | null | undefined) {
  if (!deadline) return null;
  const value = typeof deadline === "string" ? deadline : deadline.toISOString();
  const ms = new Date(value).getTime() - Date.now();
  const minutesLeft = Math.floor(ms / 60000);
  if (ms <= 0) return { urgency: "overdue" as const, minutesLeft, deadline: value };
  if (minutesLeft <= 60) return { urgency: "critical" as const, minutesLeft, deadline: value };
  return { urgency: "warning" as const, minutesLeft, deadline: value };
}

async function mapTeacherSummaries(classRows: QuestionBankClassRow[]) {
  const teacherIds = [...new Set(
    classRows.flatMap((cls) => cls.assignedTeacherIds ?? []).filter((value): value is number => Number.isInteger(value)),
  )];

  const teachers = teacherIds.length > 0
    ? await db
        .select({ id: usersTable.id, fullName: usersTable.fullName, username: usersTable.username })
        .from(usersTable)
        .where(inArray(usersTable.id, teacherIds))
    : [];

  const teacherMap = new Map(teachers.map((item) => [item.id, item]));
  return { teacherIds, teacherMap };
}

function parseQuestionBankDeadlineInput(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    const fallback = new Date(`${trimmed}:00`);
    if (!Number.isNaN(fallback.getTime())) {
      return fallback;
    }
  }

  return null;
}

router.get("/question-bank/cards", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;
  if (!["super_admin", "admin"].includes(auth.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const classes = await getAccessibleQuestionBankClasses(auth);
  const stats = await getQuestionBankCardStats(classes.map((item) => item.id));
  const { teacherMap } = await mapTeacherSummaries(classes);

  const cards = classes
    .map((cls) => {
      const counts = stats.get(cls.id) ?? { subjectCount: 0, chapterCount: 0, questionCount: 0 };
      const assignedTeacherIds = cls.assignedTeacherIds ?? [];
      const assignedTeachers = assignedTeacherIds
        .map((teacherId) => teacherMap.get(teacherId))
        .filter((teacher): teacher is NonNullable<typeof teacher> => !!teacher)
        .map((teacher) => ({
          id: teacher.id,
          fullName: teacher.fullName ?? null,
          username: teacher.username ?? null,
        }));
      const target = cls.weeklyTargetQuestions ?? 0;
      return {
        id: cls.id,
        title: cls.title,
        description: cls.description,
        exam: cls.subject,
        status: cls.status,
        adminId: cls.adminId,
        adminName: assignedTeachers[0]?.fullName ?? null,
        adminUsername: assignedTeachers[0]?.username ?? null,
        assignedTeacherIds,
        assignedTeachers,
        weeklyTargetQuestions: cls.weeklyTargetQuestions,
        weeklyTargetDeadline: cls.weeklyTargetDeadline?.toISOString() ?? null,
        isLocked: isQuestionBankLocked(cls),
        subjectCount: counts.subjectCount,
        chapterCount: counts.chapterCount,
        questionCount: counts.questionCount,
        remainingQuestions: target > 0 ? Math.max(target - counts.questionCount, 0) : 0,
        createdAt: cls.createdAt?.toISOString() ?? null,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  res.json(cards);
});

router.post("/question-bank/cards", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;
  if (auth.role !== "super_admin") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const exam = typeof req.body?.exam === "string" ? req.body.exam.trim() : "";
  const title = exam;
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
  const teacherIds = Array.isArray(req.body?.teacherIds)
    ? req.body.teacherIds.map((value: unknown) => Number(value)).filter((value: number) => Number.isInteger(value) && value > 0)
    : [];
  const rawWeeklyTargetQuestions = req.body?.weeklyTargetQuestions;
  const hasWeeklyTargetQuestions = !(rawWeeklyTargetQuestions === undefined || rawWeeklyTargetQuestions === null || String(rawWeeklyTargetQuestions).trim() === "");
  const parsedWeeklyTargetQuestions = hasWeeklyTargetQuestions ? Number(rawWeeklyTargetQuestions) : undefined;
  const weeklyTargetDeadline = typeof req.body?.weeklyTargetDeadline === "string" ? req.body.weeklyTargetDeadline.trim() : "";

  if (!exam) return res.status(400).json({ error: "Exam name is required" });
  if (teacherIds.length === 0) return res.status(400).json({ error: "At least one assigned teacher is required" });
  if (hasWeeklyTargetQuestions && (!Number.isInteger(parsedWeeklyTargetQuestions) || (parsedWeeklyTargetQuestions ?? 0) < 1)) {
    return res.status(400).json({ error: "Weekly target must be a positive whole number" });
  }
  const parsedDeadline = weeklyTargetDeadline ? parseQuestionBankDeadlineInput(weeklyTargetDeadline) : null;
  if (weeklyTargetDeadline && !parsedDeadline) {
    return res.status(400).json({ error: "Deadline is invalid" });
  }
  const weeklyTargetQuestions = parsedWeeklyTargetQuestions ?? null;

  const duplicateCard = await findExistingQuestionBankCardByExam(exam);
  if (duplicateCard) {
    return res.status(409).json({ error: "Question bank for this exam already exists" });
  }

  const teachers = await db
    .select({ id: usersTable.id, role: usersTable.role, fullName: usersTable.fullName, username: usersTable.username })
    .from(usersTable)
    .where(inArray(usersTable.id, teacherIds));
  if (teachers.length !== teacherIds.length || teachers.some((teacher) => teacher.role !== "admin")) {
    return res.status(400).json({ error: "One or more selected teachers are invalid" });
  }
  const primaryTeacher = teachers[0]!;

  const [card] = await db
    .insert(classesTable)
    .values({
      title,
      description: description || null,
      subject: exam,
      workflowType: "question_bank",
      adminId: primaryTeacher.id,
      assignedTeacherIds: teacherIds,
      plannerId: auth.userId,
      status: "scheduled",
      weeklyTargetQuestions,
      weeklyTargetDeadline: parsedDeadline,
      scheduledAt: null,
      maxStudents: null,
      meetingLink: null,
    })
    .returning();

  res.status(201).json({
    id: card.id,
    title: card.title,
    description: card.description,
    exam: card.subject,
    status: card.status,
    adminId: primaryTeacher.id,
    adminName: primaryTeacher.fullName ?? null,
    adminUsername: primaryTeacher.username ?? null,
    assignedTeacherIds: teacherIds,
    assignedTeachers: teachers.map((teacher) => ({
      id: teacher.id,
      fullName: teacher.fullName ?? null,
      username: teacher.username ?? null,
    })),
    weeklyTargetQuestions: card.weeklyTargetQuestions,
    weeklyTargetDeadline: card.weeklyTargetDeadline?.toISOString() ?? null,
    isLocked: isQuestionBankLocked(card),
    subjectCount: 0,
    chapterCount: 0,
    questionCount: 0,
    remainingQuestions: weeklyTargetQuestions ?? 0,
    createdAt: card.createdAt?.toISOString() ?? null,
  });
});

router.patch("/question-bank/cards/:id", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;
  if (auth.role !== "super_admin") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const cardId = Number(req.params.id);
  if (!Number.isInteger(cardId) || cardId <= 0) {
    return res.status(400).json({ error: "Invalid card id" });
  }

  const exam = typeof req.body?.exam === "string" ? req.body.exam.trim() : "";
  const title = exam;
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
  const teacherIds = Array.isArray(req.body?.teacherIds)
    ? req.body.teacherIds.map((value: unknown) => Number(value)).filter((value: number) => Number.isInteger(value) && value > 0)
    : [];
  const rawWeeklyTargetQuestions = req.body?.weeklyTargetQuestions;
  const hasWeeklyTargetQuestions = !(rawWeeklyTargetQuestions === undefined || rawWeeklyTargetQuestions === null || String(rawWeeklyTargetQuestions).trim() === "");
  const parsedWeeklyTargetQuestions = hasWeeklyTargetQuestions ? Number(rawWeeklyTargetQuestions) : undefined;
  const weeklyTargetDeadline = typeof req.body?.weeklyTargetDeadline === "string" ? req.body.weeklyTargetDeadline.trim() : "";

  if (!exam) return res.status(400).json({ error: "Exam name is required" });
  if (teacherIds.length === 0) return res.status(400).json({ error: "At least one assigned teacher is required" });
  if (hasWeeklyTargetQuestions && (!Number.isInteger(parsedWeeklyTargetQuestions) || (parsedWeeklyTargetQuestions ?? 0) < 1)) {
    return res.status(400).json({ error: "Weekly target must be a positive whole number" });
  }
  const parsedDeadline = weeklyTargetDeadline ? parseQuestionBankDeadlineInput(weeklyTargetDeadline) : null;
  if (weeklyTargetDeadline && !parsedDeadline) {
    return res.status(400).json({ error: "Deadline is invalid" });
  }
  const weeklyTargetQuestions = parsedWeeklyTargetQuestions ?? null;

  const [existingCard] = await db.select().from(classesTable).where(eq(classesTable.id, cardId));
  if (!existingCard || existingCard.workflowType !== "question_bank") {
    return res.status(404).json({ error: "Question bank card not found" });
  }
  if (!ensureQuestionBankUnlocked(existingCard, res)) return;

  const duplicateCard = await findExistingQuestionBankCardByExam(exam, cardId);
  if (duplicateCard) {
    return res.status(409).json({ error: "Question bank for this exam already exists" });
  }

  const teachers = await db
    .select({ id: usersTable.id, role: usersTable.role, fullName: usersTable.fullName, username: usersTable.username })
    .from(usersTable)
    .where(inArray(usersTable.id, teacherIds));
  if (teachers.length !== teacherIds.length || teachers.some((teacher) => teacher.role !== "admin")) {
    return res.status(400).json({ error: "One or more selected teachers are invalid" });
  }
  const primaryTeacher = teachers[0]!;

  const [card] = await db
    .update(classesTable)
    .set({
      title,
      description: description || null,
      subject: exam,
      adminId: primaryTeacher.id,
      assignedTeacherIds: teacherIds,
      weeklyTargetQuestions,
      weeklyTargetDeadline: parsedDeadline,
    })
    .where(eq(classesTable.id, cardId))
    .returning();

  res.json({
    id: card.id,
    title: card.title,
    description: card.description,
    exam: card.subject,
    status: card.status,
    adminId: primaryTeacher.id,
    adminName: primaryTeacher.fullName ?? null,
    adminUsername: primaryTeacher.username ?? null,
    assignedTeacherIds: teacherIds,
    assignedTeachers: teachers.map((teacher) => ({
      id: teacher.id,
      fullName: teacher.fullName ?? null,
      username: teacher.username ?? null,
    })),
    weeklyTargetQuestions: card.weeklyTargetQuestions,
    weeklyTargetDeadline: card.weeklyTargetDeadline?.toISOString() ?? null,
    isLocked: isQuestionBankLocked(card),
  });
});

router.patch("/question-bank/cards/:id/lock", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;
  if (auth.role !== "super_admin") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const cardId = Number(req.params.id);
  if (!Number.isInteger(cardId) || cardId <= 0) {
    return res.status(400).json({ error: "Invalid card id" });
  }

  const [card] = await db.select().from(classesTable).where(eq(classesTable.id, cardId));
  if (!card || card.workflowType !== "question_bank") {
    return res.status(404).json({ error: "Question bank card not found" });
  }

  const lockValue = Boolean(req.body?.isLocked);
  const updatedResult = await db.execute(sql<{ id: number; isLocked: boolean }>`
    update classes
    set is_locked = ${lockValue}, updated_at = now()
    where id = ${cardId}
    returning id, is_locked as "isLocked"
  `);
  const updated = updatedResult.rows[0];

  if (!updated) {
    return res.status(404).json({ error: "Question bank card not found" });
  }

  res.json({ id: updated.id, isLocked: updated.isLocked });
});

router.delete("/question-bank/cards/:id", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;
  if (auth.role !== "super_admin") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const cardId = Number(req.params.id);
  if (!Number.isInteger(cardId) || cardId <= 0) {
    return res.status(400).json({ error: "Invalid card id" });
  }

  const [existingCard] = await db.select().from(classesTable).where(eq(classesTable.id, cardId));
  if (!existingCard || existingCard.workflowType !== "question_bank") {
    return res.status(404).json({ error: "Question bank card not found" });
  }
  if (!ensureQuestionBankUnlocked(existingCard, res)) return;

  await db.delete(classesTable).where(eq(classesTable.id, cardId));
  res.json({ success: true });
});

router.get("/question-bank/alerts", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;
  if (!["admin", "super_admin"].includes(auth.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const classes = await getAccessibleQuestionBankClasses(auth);
  const stats = await getQuestionBankCardStats(classes.map((item) => item.id));
  const alerts = classes
    .map((cls) => {
      const target = cls.weeklyTargetQuestions ?? 0;
      const counts = stats.get(cls.id) ?? { subjectCount: 0, chapterCount: 0, questionCount: 0 };
      if (!target || !cls.weeklyTargetDeadline) return null;
      if (counts.questionCount >= target) return null;
      const deadlineInfo = classifyQuestionBankDeadline(cls.weeklyTargetDeadline);
      if (!deadlineInfo) return null;

      return {
        id: cls.id,
        title: cls.title,
        exam: cls.subject,
        deadline: deadlineInfo.deadline,
        urgency: deadlineInfo.urgency,
        minutesLeft: deadlineInfo.minutesLeft,
        weeklyTargetQuestions: target,
        currentQuestions: counts.questionCount,
        remainingQuestions: Math.max(target - counts.questionCount, 0),
      };
    })
    .filter((item): item is NonNullable<typeof item> => !!item)
    .sort((a, b) => {
      const order = { overdue: 0, critical: 1, warning: 2 };
      const diff = order[a.urgency] - order[b.urgency];
      if (diff !== 0) return diff;
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    });

  res.json(alerts);
});

router.get("/question-bank/exams", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;
  if (!["admin", "super_admin", "student"].includes(auth.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const classes = await getAccessibleQuestionBankClasses(auth);
  const studentExamKeys = auth.role === "student" ? await getStudentExamKeys(auth.userId) : null;

  const grouped = new Map<string, { key: string; label: string; classes: QuestionBankClassRow[] }>();
  for (const cls of classes) {
    const examKey = normalizeExamKey(cls.subject) ?? normalizeExamKey(cls.title);
    if (!examKey) continue;
    if (studentExamKeys && !studentExamKeys.has(examKey)) continue;
    const existing = grouped.get(examKey);
    if (existing) {
      existing.classes.push(cls);
    } else {
      grouped.set(examKey, {
        key: examKey,
        label: cls.subject ?? cls.title,
        classes: [cls],
      });
    }
  }

  const allClassIds = [...new Set([...grouped.values()].flatMap((group) => group.classes.map((item) => item.id)))];
  const progressRows = auth.role === "student" && allClassIds.length > 0
    ? await db
        .select()
        .from(questionBankQuestionProgressTable)
        .where(and(
          eq(questionBankQuestionProgressTable.studentId, auth.userId),
          inArray(questionBankQuestionProgressTable.classId, allClassIds),
        ))
    : [];
  const progressCountByClassId = new Map<number, number>();
  for (const row of progressRows) {
    progressCountByClassId.set(row.classId, (progressCountByClassId.get(row.classId) ?? 0) + 1);
  }

  const summaries = await Promise.all([...grouped.values()].map(async (group) => {
    const classIds = group.classes.map((item) => item.id);
    const subjects = classIds.length > 0
      ? await db.select({ id: subjectsTable.id }).from(subjectsTable).where(inArray(subjectsTable.classId, classIds))
      : [];
    const subjectIds = subjects.map((item) => item.id);
    const chapters = subjectIds.length > 0
      ? await db
          .select({ id: chaptersTable.id, targetQuestions: chaptersTable.targetQuestions })
          .from(chaptersTable)
          .where(inArray(chaptersTable.subjectId, subjectIds))
      : [];
    const chapterIds = chapters.map((item) => item.id);
    const questions = chapterIds.length > 0
      ? await db
          .select({ id: questionBankQuestionsTable.id, chapterId: questionBankQuestionsTable.chapterId })
          .from(questionBankQuestionsTable)
          .where(inArray(questionBankQuestionsTable.chapterId, chapterIds))
      : [];

    const questionCountByChapter = new Map<number, number>();
    for (const question of questions) {
      questionCountByChapter.set(question.chapterId, (questionCountByChapter.get(question.chapterId) ?? 0) + 1);
    }
    const targetQuestionCount = chapters.reduce((sum, chapter) => {
      const uploaded = questionCountByChapter.get(chapter.id) ?? 0;
      return sum + Math.max(chapter.targetQuestions ?? 0, uploaded);
    }, 0);
    const questionCount = questions.length;
    const attemptedQuestionCount = classIds.reduce((sum, classId) => sum + (progressCountByClassId.get(classId) ?? 0), 0);

    return {
      key: group.key,
      label: group.label,
      subjectCount: subjects.length,
      chapterCount: chapters.length,
      questionCount,
      targetQuestionCount,
      pendingQuestionCount: Math.max(targetQuestionCount - questionCount, 0),
      attemptedQuestionCount,
    };
  }));

  summaries.sort((a, b) => a.label.localeCompare(b.label));
  res.json(summaries);
});

router.get("/question-bank/progress/summary", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;
  if (auth.role !== "student") return res.status(403).json({ error: "Only students can view question bank progress" });
  const [student] = await db.select().from(usersTable).where(eq(usersTable.id, auth.userId));
  if (!ensureStudentFeatureUnlocked(student, "question-bank", res)) return;

  const classes = await getAccessibleQuestionBankClasses(auth);
  const studentExamKeys = await getStudentExamKeys(auth.userId);
  const visibleClassIds = classes
    .filter((cls) => {
      const examKey = getQuestionBankClassExamKey(cls);
      return examKey ? studentExamKeys.has(examKey) : false;
    })
    .map((cls) => cls.id);

  const progressRows = visibleClassIds.length > 0
    ? await db
        .select()
        .from(questionBankQuestionProgressTable)
        .where(and(
          eq(questionBankQuestionProgressTable.studentId, auth.userId),
          inArray(questionBankQuestionProgressTable.classId, visibleClassIds),
        ))
    : [];

  const totalSolvedQuestions = progressRows.length;
  const totalAttempts = progressRows.reduce((sum, row) => sum + Math.max(row.attemptCount ?? 0, 0), 0);
  const correctAttempts = progressRows.reduce((sum, row) => sum + Math.max(row.correctCount ?? 0, 0), 0);
  const latestCorrectQuestions = progressRows.filter((row) => row.lastIsCorrect).length;
  const dailySolvedMap = new Map<string, number>();

  for (const row of progressRows) {
    const key = formatLocalDateKey(row.firstAttemptedAt);
    if (!key) continue;
    dailySolvedMap.set(key, (dailySolvedMap.get(key) ?? 0) + 1);
  }

  const dailySolvedCounts = [...dailySolvedMap.entries()]
    .map(([date, questions]) => ({ date, questions }))
    .sort((a, b) => a.date.localeCompare(b.date));

  res.json({
    totalSolvedQuestions,
    totalAttempts,
    correctAttempts,
    latestCorrectQuestions,
    accuracy: totalAttempts > 0 ? Number(((correctAttempts / totalAttempts) * 100).toFixed(1)) : 0,
    dailySolvedCounts,
  });
});

router.get("/question-bank/exams/:examKey", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;
  if (!["admin", "super_admin", "student"].includes(auth.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const examKey = normalizeExamKey(req.params.examKey);
  if (!examKey) return res.status(400).json({ error: "Invalid exam key" });

  if (auth.role === "student") {
    const studentExamKeys = await getStudentExamKeys(auth.userId);
    if (!studentExamKeys.has(examKey)) return res.status(403).json({ error: "Forbidden" });
  }

  const classes = await getAccessibleQuestionBankClasses(auth);
  const matchingClasses = classes.filter((cls) => {
    const clsExamKey = normalizeExamKey(cls.subject) ?? normalizeExamKey(cls.title);
    return clsExamKey === examKey;
  });

  if (matchingClasses.length === 0) {
    return res.status(404).json({ error: "Exam question bank not found" });
  }

  const tree = await buildQuestionBankTreeForClasses(auth, matchingClasses);

  res.json({
    exam: {
      key: examKey,
      label: matchingClasses[0]?.subject ?? matchingClasses[0]?.title ?? "Exam",
    },
    subjects: tree.subjects,
    savedBucket: tree.savedBucket,
  });
});

router.get("/question-bank/exams/:examKey/export", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;
  if (!["admin", "super_admin"].includes(auth.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const examKey = normalizeExamKey(req.params.examKey);
  if (!examKey) return res.status(400).json({ error: "Invalid exam key" });

  const classes = await getAccessibleQuestionBankClasses(auth);
  const matchingClasses = classes.filter((cls) => {
    const clsExamKey = normalizeExamKey(cls.subject) ?? normalizeExamKey(cls.title);
    return clsExamKey === examKey;
  });

  if (matchingClasses.length === 0) {
    return res.status(404).json({ error: "Exam question bank not found" });
  }

  const tree = await buildQuestionBankTreeForClasses(auth, matchingClasses);
  res.json({
    version: 1,
    exportedAt: new Date().toISOString(),
    exam: {
      key: examKey,
      label: matchingClasses[0]?.subject ?? matchingClasses[0]?.title ?? "Exam",
    },
    subjects: tree.subjects.map((subject) => ({
      title: subject.title,
      chapters: subject.chapters.map((chapter) => ({
        title: chapter.title,
        description: chapter.description ?? null,
        targetQuestions: chapter.targetQuestions ?? 0,
        questions: chapter.questions,
      })),
    })),
  });
});

router.post("/question-bank/exams/:examKey/import", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;
  if (auth.role !== "admin" && auth.role !== "super_admin") {
    return res.status(403).json({ error: "Only assigned teachers can import into a question bank exam" });
  }

  const examKey = normalizeExamKey(req.params.examKey);
  if (!examKey) return res.status(400).json({ error: "Invalid exam key" });

  const classes = await getAccessibleQuestionBankClasses(auth);
  const matchingClasses = classes.filter((cls) => {
    const clsExamKey = normalizeExamKey(cls.subject) ?? normalizeExamKey(cls.title);
    return clsExamKey === examKey;
  });
  if (matchingClasses.length === 0) {
    return res.status(404).json({ error: "Exam question bank not found" });
  }
  if (matchingClasses.some((cls) => isQuestionBankLocked(cls))) {
    return res.status(409).json({ error: "This question bank is locked. Unlock it to make changes." });
  }

  const rawSubjects = Array.isArray(req.body?.subjects) ? req.body.subjects : [];
  if (rawSubjects.length === 0) {
    return res.status(400).json({ error: "No subjects were found in the import bundle" });
  }

  const classIds = matchingClasses.map((cls) => cls.id);
  const subjects = classIds.length > 0
    ? await db.select().from(subjectsTable).where(inArray(subjectsTable.classId, classIds))
    : [];
  const subjectIds = subjects.map((subject) => subject.id);
  const chapters = subjectIds.length > 0
    ? await db.select().from(chaptersTable).where(inArray(chaptersTable.subjectId, subjectIds))
    : [];

  const subjectsByKey = new Map(subjects.map((subject) => [normalizeTitleKey(subject.title), subject] as const));
  const chaptersBySubjectId = new Map<number, typeof chapters>();
  for (const chapter of chapters) {
    const existing = chaptersBySubjectId.get(chapter.subjectId) ?? [];
    existing.push(chapter);
    chaptersBySubjectId.set(chapter.subjectId, existing);
  }

  let importedCount = 0;
  let skippedSubjectCount = 0;
  let skippedChapterCount = 0;
  let skippedDuplicateCount = 0;
  let invalidQuestionCount = 0;
  const warnings: string[] = [];

  for (const rawSubject of rawSubjects) {
    const subjectTitle = typeof rawSubject?.title === "string" ? rawSubject.title.trim() : "";
    const subjectKey = normalizeTitleKey(subjectTitle);
    const targetSubject = subjectKey ? subjectsByKey.get(subjectKey) : undefined;
    if (!targetSubject) {
      skippedSubjectCount += 1;
      if (subjectTitle) warnings.push(`Subject not found: ${subjectTitle}`);
      continue;
    }
    const targetClass = matchingClasses.find((cls) => cls.id === targetSubject.classId);
    if (!targetClass || !canManageQuestionBank(auth, targetSubject, targetClass)) {
      skippedSubjectCount += 1;
      if (subjectTitle) warnings.push(`No access to subject: ${subjectTitle}`);
      continue;
    }

    const rawChapters = Array.isArray(rawSubject?.chapters) ? rawSubject.chapters : [];
    const targetChapters = chaptersBySubjectId.get(targetSubject.id) ?? [];
    const chapterMap = new Map(targetChapters.map((chapter) => [normalizeTitleKey(chapter.title), chapter] as const));

    for (const rawChapter of rawChapters) {
      const chapterTitle = typeof rawChapter?.title === "string" ? rawChapter.title.trim() : "";
      const chapterKey = normalizeTitleKey(chapterTitle);
      const targetChapter = chapterKey ? chapterMap.get(chapterKey) : undefined;
      if (!targetChapter) {
        skippedChapterCount += 1;
        if (subjectTitle && chapterTitle) warnings.push(`Chapter not found: ${subjectTitle} / ${chapterTitle}`);
        continue;
      }

      const context = { chapter: targetChapter, subject: targetSubject, cls: targetClass };
      const existingQuestions = await db
        .select({
          id: questionBankQuestionsTable.id,
          question: questionBankQuestionsTable.question,
          questionType: questionBankQuestionsTable.questionType,
        })
        .from(questionBankQuestionsTable)
        .where(eq(questionBankQuestionsTable.chapterId, targetChapter.id));
      const duplicateKeys = new Set(existingQuestions.map(buildExistingQuestionDuplicateKey).filter((value): value is string => !!value));

      const rawQuestions = Array.isArray(rawChapter?.questions) ? rawChapter.questions : [];
      const parsedQuestions = rawQuestions.map((item: unknown) => normalizeQuestionPayload(item));
      const validQuestions = parsedQuestions.filter((item: NormalizedQuestionPayloadResult): item is { value: NormalizedQuestionValue } => "value" in item);
      const invalidQuestions = parsedQuestions.filter((item: NormalizedQuestionPayloadResult): item is { error: string } => "error" in item);
      if (invalidQuestions.length > 0 && subjectTitle && chapterTitle) {
        warnings.push(`Skipped ${invalidQuestions.length} invalid question(s) in ${subjectTitle} / ${chapterTitle}`);
      }
      invalidQuestionCount += invalidQuestions.length;
      if (validQuestions.length === 0) continue;

      const values: Array<ReturnType<typeof buildQuestionInsertValues>> = [];
      let nextOrder = existingQuestions.length;
      for (const item of validQuestions) {
        const duplicateKey = normalizeQuestionDuplicateKey(item.value.question, item.value.questionType);
        if (duplicateKey && duplicateKeys.has(duplicateKey)) {
          skippedDuplicateCount += 1;
          continue;
        }
        if (duplicateKey) duplicateKeys.add(duplicateKey);
        values.push(buildQuestionInsertValues(item.value, context, nextOrder, auth.userId));
        nextOrder += 1;
      }
      if (values.length === 0) continue;

      const created = await db.insert(questionBankQuestionsTable).values(values).returning({ id: questionBankQuestionsTable.id });
      importedCount += created.length;
    }
  }

  res.status(201).json({
    importedCount,
    skippedSubjectCount,
    skippedChapterCount,
    skippedDuplicateCount,
    invalidQuestionCount,
    warnings,
  });
});

router.get("/question-bank/subjects/:subjectId/export", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;

  const subjectId = parseInt(req.params.subjectId, 10);
  if (Number.isNaN(subjectId)) return res.status(400).json({ error: "Invalid subject id" });

  const context = await getSubjectContext(subjectId);
  if (!context) return res.status(404).json({ error: "Subject not found" });
  if (!canManageQuestionBank(auth, context.subject, context.cls)) {
    return res.status(403).json({ error: "Only the assigned subject teacher can export this subject" });
  }

  const chapters = await db
    .select()
    .from(chaptersTable)
    .where(eq(chaptersTable.subjectId, subjectId))
    .orderBy(chaptersTable.order, chaptersTable.createdAt);

  const chapterIds = chapters.map((chapter) => chapter.id);
  const questions = chapterIds.length > 0
    ? await db
        .select()
        .from(questionBankQuestionsTable)
        .where(inArray(questionBankQuestionsTable.chapterId, chapterIds))
        .orderBy(questionBankQuestionsTable.order, questionBankQuestionsTable.createdAt)
    : [];

  const questionsByChapter = new Map<number, Array<ReturnType<typeof serializeQuestionTransferPayload>>>();
  for (const question of questions) {
    const existing = questionsByChapter.get(question.chapterId) ?? [];
    existing.push(serializeQuestionTransferPayload(question));
    questionsByChapter.set(question.chapterId, existing);
  }

  res.json({
    version: 1,
    exportedAt: new Date().toISOString(),
    subject: {
      id: context.subject.id,
      title: context.subject.title,
      description: context.subject.description ?? null,
    },
    chapters: chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      description: chapter.description ?? null,
      targetQuestions: chapter.targetQuestions ?? 0,
      questions: questionsByChapter.get(chapter.id) ?? [],
    })),
  });
});

router.post("/question-bank/subjects/:subjectId/import", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;

  const subjectId = parseInt(req.params.subjectId, 10);
  if (Number.isNaN(subjectId)) return res.status(400).json({ error: "Invalid subject id" });

  const context = await getSubjectContext(subjectId);
  if (!context) return res.status(404).json({ error: "Subject not found" });
  if (!canManageQuestionBank(auth, context.subject, context.cls)) {
    return res.status(403).json({ error: "Only the assigned subject teacher can import into this subject" });
  }
  if (!ensureQuestionBankUnlocked(context.cls, res)) return;

  const rawChapters = Array.isArray(req.body?.chapters) ? req.body.chapters : [];
  if (rawChapters.length === 0) {
    return res.status(400).json({ error: "No chapters were found in the import bundle" });
  }

  const chapters = await db
    .select()
    .from(chaptersTable)
    .where(eq(chaptersTable.subjectId, subjectId))
    .orderBy(chaptersTable.order, chaptersTable.createdAt);

  const chapterMap = new Map(chapters.map((chapter) => [normalizeTitleKey(chapter.title), chapter] as const));
  let importedCount = 0;
  let skippedChapterCount = 0;
  let skippedDuplicateCount = 0;
  let invalidQuestionCount = 0;
  const warnings: string[] = [];

  for (const rawChapter of rawChapters) {
    const chapterTitle = typeof rawChapter?.title === "string" ? rawChapter.title.trim() : "";
    const chapterKey = normalizeTitleKey(chapterTitle);
    const targetChapter = chapterKey ? chapterMap.get(chapterKey) : undefined;
    if (!targetChapter) {
      skippedChapterCount += 1;
      if (chapterTitle) warnings.push(`Chapter not found: ${chapterTitle}`);
      continue;
    }

    const existingQuestions = await db
      .select({
        id: questionBankQuestionsTable.id,
        question: questionBankQuestionsTable.question,
        questionType: questionBankQuestionsTable.questionType,
      })
      .from(questionBankQuestionsTable)
      .where(eq(questionBankQuestionsTable.chapterId, targetChapter.id));

    const duplicateKeys = new Set(existingQuestions.map(buildExistingQuestionDuplicateKey).filter((value): value is string => !!value));
    const rawQuestions = Array.isArray(rawChapter?.questions) ? rawChapter.questions : [];
    const parsedQuestions = rawQuestions.map((item: unknown) => normalizeQuestionPayload(item));
    const validQuestions = parsedQuestions.filter((item: NormalizedQuestionPayloadResult): item is { value: NormalizedQuestionValue } => "value" in item);
    const invalidQuestions = parsedQuestions.filter((item: NormalizedQuestionPayloadResult): item is { error: string } => "error" in item);

    if (invalidQuestions.length > 0 && chapterTitle) {
      warnings.push(`Skipped ${invalidQuestions.length} invalid question(s) in ${chapterTitle}`);
    }
    invalidQuestionCount += invalidQuestions.length;
    if (validQuestions.length === 0) continue;

    const values: Array<ReturnType<typeof buildQuestionInsertValues>> = [];
    let nextOrder = existingQuestions.length;
    for (const item of validQuestions) {
      const duplicateKey = normalizeQuestionDuplicateKey(item.value.question, item.value.questionType);
      if (duplicateKey && duplicateKeys.has(duplicateKey)) {
        skippedDuplicateCount += 1;
        continue;
      }
      if (duplicateKey) duplicateKeys.add(duplicateKey);
      values.push(buildQuestionInsertValues(item.value, { chapter: targetChapter, subject: context.subject, cls: context.cls }, nextOrder, auth.userId));
      nextOrder += 1;
    }

    if (values.length === 0) continue;
    const created = await db.insert(questionBankQuestionsTable).values(values).returning({ id: questionBankQuestionsTable.id });
    importedCount += created.length;
  }

  res.status(201).json({
    importedCount,
    skippedChapterCount,
    skippedDuplicateCount,
    invalidQuestionCount,
    warnings,
  });
});

router.get("/question-bank/chapters/:chapterId/export", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;

  const chapterId = parseInt(req.params.chapterId, 10);
  if (Number.isNaN(chapterId)) return res.status(400).json({ error: "Invalid chapter id" });

  const context = await getChapterContext(chapterId);
  if (!context) return res.status(404).json({ error: "Chapter not found" });
  if (!canManageQuestionBank(auth, context.subject, context.cls)) {
    return res.status(403).json({ error: "Only the assigned subject teacher can export this chapter" });
  }

  const questions = await db
    .select()
    .from(questionBankQuestionsTable)
    .where(eq(questionBankQuestionsTable.chapterId, chapterId))
    .orderBy(questionBankQuestionsTable.order, questionBankQuestionsTable.createdAt);

  res.json({
    version: 1,
    exportedAt: new Date().toISOString(),
    exam: context.cls.subject,
    subject: {
      id: context.subject.id,
      title: context.subject.title,
    },
    chapter: {
      id: context.chapter.id,
      title: context.chapter.title,
      description: context.chapter.description ?? null,
      targetQuestions: context.chapter.targetQuestions ?? 0,
    },
    questions: questions.map((question) => serializeQuestionTransferPayload(question)),
  });
});

router.post("/question-bank/chapters/:chapterId/import", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;

  const chapterId = parseInt(req.params.chapterId, 10);
  if (Number.isNaN(chapterId)) return res.status(400).json({ error: "Invalid chapter id" });

  const context = await getChapterContext(chapterId);
  if (!context) return res.status(404).json({ error: "Chapter not found" });
  if (!canManageQuestionBank(auth, context.subject, context.cls)) {
    return res.status(403).json({ error: "Only the assigned subject teacher can import questions here" });
  }
  if (!ensureQuestionBankUnlocked(context.cls, res)) return;

  const rawQuestions = Array.isArray(req.body)
    ? req.body
    : Array.isArray(req.body?.questions)
      ? req.body.questions
      : [];

  if (rawQuestions.length === 0) {
    return res.status(400).json({ error: "At least one question is required" });
  }

  const parsedQuestions = rawQuestions.map((item: unknown) => normalizeQuestionPayload(item));
  const firstError = parsedQuestions.find((item: NormalizedQuestionPayloadResult): item is { error: string } => "error" in item);
  if (firstError && "error" in firstError) {
    return res.status(400).json({ error: firstError.error });
  }

  const existingCount = await db
    .select({
      id: questionBankQuestionsTable.id,
      question: questionBankQuestionsTable.question,
      questionType: questionBankQuestionsTable.questionType,
    })
    .from(questionBankQuestionsTable)
    .where(eq(questionBankQuestionsTable.chapterId, chapterId));

  const duplicateKeys = new Set(existingCount.map(buildExistingQuestionDuplicateKey).filter((value): value is string => !!value));
  const values: Array<ReturnType<typeof buildQuestionInsertValues>> = [];
  let duplicateCount = 0;
  let nextOrder = existingCount.length;

  for (const item of parsedQuestions as Array<{ value: NormalizedQuestionValue }>) {
    const parsed = item.value;
    const duplicateKey = normalizeQuestionDuplicateKey(parsed.question, parsed.questionType);
    if (duplicateKey && duplicateKeys.has(duplicateKey)) {
      duplicateCount += 1;
      continue;
    }
    if (duplicateKey) duplicateKeys.add(duplicateKey);
    values.push(buildQuestionInsertValues(parsed, context, nextOrder, auth.userId));
    nextOrder += 1;
  }

  const created = values.length > 0 ? await db.insert(questionBankQuestionsTable).values(values).returning() : [];
  res.status(201).json({
    createdCount: created.length,
    duplicateCount,
    questions: created,
  });
});

async function getChapterContext(chapterId: number) {
  const [chapter] = await db.select().from(chaptersTable).where(eq(chaptersTable.id, chapterId));
  if (!chapter) return null;

  const [subject] = await db.select().from(subjectsTable).where(eq(subjectsTable.id, chapter.subjectId));
  if (!subject) return null;

  const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, subject.classId));
  if (!cls) return null;

  return { chapter, subject, cls };
}

async function getSubjectContext(subjectId: number) {
  const [subject] = await db.select().from(subjectsTable).where(eq(subjectsTable.id, subjectId));
  if (!subject) return null;

  const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, subject.classId));
  if (!cls) return null;

  return { subject, cls };
}

async function getQuestionContext(questionId: number) {
  const [question] = await db.select().from(questionBankQuestionsTable).where(eq(questionBankQuestionsTable.id, questionId));
  if (!question) return null;
  const context = await getChapterContext(question.chapterId);
  if (!context) return null;
  return { question, ...context };
}

function canViewClassQuestionBank(auth: Auth, cls: QuestionBankClassRow, isEnrolled: boolean) {
  if (auth.role === "super_admin") return true;
  if (auth.role === "admin") {
    return cls.adminId === auth.userId || (cls.assignedTeacherIds ?? []).includes(auth.userId);
  }
  if (auth.role === "student") return isEnrolled;
  return false;
}

function canManageQuestionBank(auth: Auth, subject: typeof subjectsTable.$inferSelect, cls: QuestionBankClassRow) {
  if (auth.role === "super_admin") return true;
  if (auth.role !== "admin") return false;
  const effectiveTeacherId = subject.teacherId ?? null;
  return effectiveTeacherId === auth.userId || (subject.teacherId == null && (cls.assignedTeacherIds ?? []).includes(auth.userId));
}

function canManageQuestionBankStructure(auth: Auth, cls: QuestionBankClassRow) {
  if (auth.role === "super_admin") return true;
  void cls;
  return false;
}

function ensureQuestionBankUnlocked(cls: QuestionBankClassRow, res: any) {
  if (!isQuestionBankLocked(cls)) return true;
  res.status(409).json({ error: "This question bank is locked. Unlock it to make changes." });
  return false;
}

type StructureSyncSubjectInput = {
  title: string;
  chapters: string[];
};

function normalizeStructureSyncSubjects(input: unknown): StructureSyncSubjectInput[] {
  if (!Array.isArray(input)) return [];

  const merged = new Map<string, StructureSyncSubjectInput>();

  for (const entry of input) {
    const record = typeof entry === "object" && entry ? entry as Record<string, unknown> : null;
    const title = typeof record?.title === "string" ? record.title.trim() : "";
    const titleKey = normalizeTitleKey(title);
    if (!titleKey) continue;

    const chapterValues = Array.isArray(record?.chapters)
      ? record.chapters
          .map((chapter) => (typeof chapter === "string" ? chapter.trim() : ""))
          .filter((chapter): chapter is string => Boolean(chapter))
      : [];

    const existing = merged.get(titleKey);
    if (!existing) {
      merged.set(titleKey, {
        title,
        chapters: [...new Set(chapterValues.map((chapter) => chapter.trim()))],
      });
      continue;
    }

    const seenChapters = new Set(existing.chapters.map((chapter) => normalizeTitleKey(chapter)));
    for (const chapter of chapterValues) {
      const chapterKey = normalizeTitleKey(chapter);
      if (!chapterKey || seenChapters.has(chapterKey)) continue;
      seenChapters.add(chapterKey);
      existing.chapters.push(chapter);
    }
  }

  return [...merged.values()];
}

async function getClassAccess(auth: Auth, classId: number): Promise<ClassAccessError | ClassAccessSuccess> {
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

  const isAssignedSubjectTeacher = auth.role === "admin" && subjects.some((subject) => subject.teacherId === auth.userId);

  if (!canViewClassQuestionBank(auth, cls, isEnrolled) && !isAssignedSubjectTeacher) {
    return { error: "Forbidden", status: 403 as const };
  }

  return { cls, subjects, isEnrolled, isAssignedSubjectTeacher };
}

function normalizeQuestionPayload(body: any): NormalizedQuestionPayloadResult {
  const questionType: QuestionType = body.questionType === "multi" || body.questionType === "integer" ? body.questionType : "mcq";
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const explanation = typeof body.explanation === "string" && body.explanation.trim() ? body.explanation.trim() : null;
  const topicTag = typeof body.topicTag === "string" && body.topicTag.trim()
    ? body.topicTag.trim()
    : typeof body.topic === "string" && body.topic.trim()
      ? body.topic.trim()
      : null;
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
    if (correctAnswer === null || !Number.isInteger(correctAnswer) || correctAnswer < 0 || correctAnswer >= options.length) {
      return { error: "Valid correct answer is required" };
    }
  }

  if (questionType === "multi") {
    if (options.length < 2) return { error: "Multi-select needs at least 2 options" };
    if (correctAnswerMulti.length === 0 || correctAnswerMulti.some((idx: number) => idx < 0 || idx >= options.length)) {
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
      topicTag,
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
    topicTag: parsed.topicTag,
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
  if ("error" in access) {
    const { status, error } = access;
    return res.status(status).json({ error });
  }

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
  const studentView = auth.role === "student";
  const reports = questionIds.length > 0
    ? studentView
      ? await db
          .select({
            questionId: questionBankReportsTable.questionId,
            status: questionBankReportsTable.status,
          })
          .from(questionBankReportsTable)
          .where(inArray(questionBankReportsTable.questionId, questionIds))
      : await db
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
  const reporterIds = studentView ? [] : [...new Set(reports.map((report: any) => report.reportedBy))];
  const userIds = [...new Set([...subjectTeacherIds, ...reporterIds])];
  const users = userIds.length > 0
    ? await db
        .select({ id: usersTable.id, fullName: usersTable.fullName, username: usersTable.username })
        .from(usersTable)
        .where(inArray(usersTable.id, userIds))
    : [];
  const userMap = new Map(users.map((user) => [user.id, user]));

  const reportsByQuestion = new Map<number, any[]>();
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
      reports: studentView
        ? []
        : questionReports.map((report) => ({
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
      isLocked: isQuestionBankLocked(cls),
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
  if (!ensureQuestionBankUnlocked(context.cls, res)) return;

  const parsed = normalizeQuestionPayload(req.body);
  if ("error" in parsed) return res.status(400).json({ error: parsed.error });

  const existingCount = await db
    .select({
      id: questionBankQuestionsTable.id,
      question: questionBankQuestionsTable.question,
      questionType: questionBankQuestionsTable.questionType,
    })
    .from(questionBankQuestionsTable)
    .where(eq(questionBankQuestionsTable.chapterId, chapterId));

  const duplicateKey = normalizeQuestionDuplicateKey(parsed.value.question, parsed.value.questionType);
  const existingKeys = new Set(existingCount.map(buildExistingQuestionDuplicateKey).filter((value): value is string => !!value));
  if (duplicateKey && existingKeys.has(duplicateKey)) {
    return res.status(409).json({ error: "This question already exists in the selected chapter" });
  }

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
  if (!ensureQuestionBankUnlocked(context.cls, res)) return;

  const rawQuestions = Array.isArray(req.body?.questions) ? req.body.questions : [];
  if (rawQuestions.length === 0) return res.status(400).json({ error: "At least one question is required" });

  const parsedQuestions = rawQuestions.map((item: unknown) => normalizeQuestionPayload(item));
  const firstError = parsedQuestions.find((item: NormalizedQuestionPayloadResult): item is { error: string } => "error" in item);
  if (firstError && "error" in firstError) {
    return res.status(400).json({ error: firstError.error });
  }

  const existingCount = await db
    .select({
      id: questionBankQuestionsTable.id,
      question: questionBankQuestionsTable.question,
      questionType: questionBankQuestionsTable.questionType,
    })
    .from(questionBankQuestionsTable)
    .where(eq(questionBankQuestionsTable.chapterId, chapterId));

  const duplicateKeys = new Set(existingCount.map(buildExistingQuestionDuplicateKey).filter((value): value is string => !!value));
  const values: Array<ReturnType<typeof buildQuestionInsertValues>> = [];
  let duplicateCount = 0;
  let nextOrder = existingCount.length;

  for (const item of parsedQuestions as Array<{ value: NormalizedQuestionValue }>) {
    const parsed = item.value;
    const duplicateKey = normalizeQuestionDuplicateKey(parsed.question, parsed.questionType);
    if (duplicateKey && duplicateKeys.has(duplicateKey)) {
      duplicateCount += 1;
      continue;
    }
    if (duplicateKey) duplicateKeys.add(duplicateKey);
    values.push(buildQuestionInsertValues(parsed, context, nextOrder, auth.userId));
    nextOrder += 1;
  }

  const created = values.length > 0 ? await db.insert(questionBankQuestionsTable).values(values).returning() : [];
  res.status(201).json({
    createdCount: created.length,
    duplicateCount,
    questions: created,
  });
});

router.post("/question-bank/classes/:classId/subjects", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;

  const classId = parseInt(req.params.classId, 10);
  if (Number.isNaN(classId)) return res.status(400).json({ error: "Invalid class id" });

  const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, classId));
  if (!cls) return res.status(404).json({ error: "Class not found" });
  if (!canManageQuestionBankStructure(auth, cls)) {
    return res.status(403).json({ error: "Only super admin can modify this question bank" });
  }
  if (!ensureQuestionBankUnlocked(cls, res)) return;

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
      teacherId: cls.adminId,
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

router.post("/question-bank/classes/:classId/structure-sync", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;

  const classId = parseInt(req.params.classId, 10);
  if (Number.isNaN(classId)) return res.status(400).json({ error: "Invalid class id" });

  const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, classId));
  if (!cls) return res.status(404).json({ error: "Class not found" });
  if (!canManageQuestionBankStructure(auth, cls)) {
    return res.status(403).json({ error: "Only super admin can modify this question bank" });
  }
  if (!ensureQuestionBankUnlocked(cls, res)) return;

  const parsedSubjects = normalizeStructureSyncSubjects(req.body?.subjects);
  if (parsedSubjects.length === 0) {
    return res.status(400).json({ error: "Paste at least one subject with chapters." });
  }

  const result = await db.transaction(async (tx) => {
    const existingSubjects = await tx
      .select({
        id: subjectsTable.id,
        title: subjectsTable.title,
        order: subjectsTable.order,
      })
      .from(subjectsTable)
      .where(eq(subjectsTable.classId, classId));

    const existingSubjectEntries = existingSubjects
      .map((subject) => {
        const key = normalizeTitleKey(subject.title);
        return key ? ([key, subject] as const) : null;
      })
      .filter((entry): entry is readonly [string, typeof existingSubjects[number]] => entry !== null);
    const existingSubjectMap = new Map(existingSubjectEntries);

    const newSubjectValues = parsedSubjects
      .filter((subject) => !existingSubjectMap.has(normalizeTitleKey(subject.title)!))
      .map((subject, index) => ({
        classId,
        title: subject.title,
        description: null,
        teacherId: cls.adminId,
        order: existingSubjects.length + index,
      }));

    if (newSubjectValues.length > 0) {
      await tx.insert(subjectsTable).values(newSubjectValues);
    }

    const allSubjects = newSubjectValues.length > 0
      ? await tx
          .select({
            id: subjectsTable.id,
            title: subjectsTable.title,
            order: subjectsTable.order,
          })
          .from(subjectsTable)
          .where(eq(subjectsTable.classId, classId))
      : existingSubjects;

    const subjectEntries = allSubjects
      .map((subject) => {
        const key = normalizeTitleKey(subject.title);
        return key ? ([key, subject] as const) : null;
      })
      .filter((entry): entry is readonly [string, typeof allSubjects[number]] => entry !== null);
    const subjectMap = new Map(subjectEntries);

    const allSubjectIds = [...subjectMap.values()].map((subject) => subject.id);
    const existingChapters = allSubjectIds.length > 0
      ? await tx
          .select({
            subjectId: chaptersTable.subjectId,
            title: chaptersTable.title,
            order: chaptersTable.order,
          })
          .from(chaptersTable)
          .where(inArray(chaptersTable.subjectId, allSubjectIds))
      : [];

    const chapterKeysBySubject = new Map<number, Set<string>>();
    const nextOrderBySubject = new Map<number, number>();

    for (const chapter of existingChapters) {
      const chapterKey = normalizeTitleKey(chapter.title);
      if (!chapterKeysBySubject.has(chapter.subjectId)) {
        chapterKeysBySubject.set(chapter.subjectId, new Set());
      }
      if (chapterKey) {
        chapterKeysBySubject.get(chapter.subjectId)!.add(chapterKey);
      }
      nextOrderBySubject.set(chapter.subjectId, (nextOrderBySubject.get(chapter.subjectId) ?? 0) + 1);
    }

    for (const subject of allSubjects) {
      if (nextOrderBySubject.has(subject.id)) continue;
      nextOrderBySubject.set(subject.id, 0);
      chapterKeysBySubject.set(subject.id, new Set());
    }

    const chapterValues: Array<typeof chaptersTable.$inferInsert> = [];
    for (const parsedSubject of parsedSubjects) {
      const subjectKey = normalizeTitleKey(parsedSubject.title);
      if (!subjectKey) continue;
      const subject = subjectMap.get(subjectKey);
      if (!subject) continue;

      const chapterKeys = chapterKeysBySubject.get(subject.id) ?? new Set<string>();
      let nextOrder = nextOrderBySubject.get(subject.id) ?? 0;

      for (const chapterTitle of parsedSubject.chapters) {
        const chapterKey = normalizeTitleKey(chapterTitle);
        if (!chapterKey || chapterKeys.has(chapterKey)) continue;

        chapterKeys.add(chapterKey);
        chapterValues.push({
          subjectId: subject.id,
          title: chapterTitle,
          description: null,
          targetQuestions: 0,
          order: nextOrder,
        });
        nextOrder += 1;
      }

      chapterKeysBySubject.set(subject.id, chapterKeys);
      nextOrderBySubject.set(subject.id, nextOrder);
    }

    if (chapterValues.length > 0) {
      for (const chunk of chunkValues(chapterValues, 200)) {
        await tx.insert(chaptersTable).values(chunk);
      }
    }

    const firstSubjectKey = normalizeTitleKey(parsedSubjects[0]?.title ?? "");
    const firstSubjectId = firstSubjectKey ? subjectMap.get(firstSubjectKey)?.id ?? null : null;

    return {
      createdSubjects: newSubjectValues.length,
      createdChapters: chapterValues.length,
      firstSubjectId,
    };
  });

  res.status(201).json(result);
});

router.post("/question-bank/subjects/:subjectId/chapters", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;

  const subjectId = parseInt(req.params.subjectId, 10);
  if (Number.isNaN(subjectId)) return res.status(400).json({ error: "Invalid subject id" });

  const context = await getSubjectContext(subjectId);
  if (!context) return res.status(404).json({ error: "Subject not found" });
  const { cls } = context;
  if (!canManageQuestionBankStructure(auth, cls)) {
    return res.status(403).json({ error: "Only super admin can modify this question bank" });
  }
  if (!ensureQuestionBankUnlocked(cls, res)) return;

  const { title, description } = req.body ?? {};
  const targetQuestions = Number(req.body?.targetQuestions ?? 0);
  if (typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "Chapter title is required" });
  }
  if (!Number.isFinite(targetQuestions) || targetQuestions < 0) {
    return res.status(400).json({ error: "Target questions must be zero or more" });
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
      targetQuestions: Math.max(0, Math.round(targetQuestions)),
      order: existingCount.length,
    })
    .returning();

  res.status(201).json({ ...chapter, questions: [] });
});

router.patch("/question-bank/subjects/:subjectId", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;

  const subjectId = parseInt(req.params.subjectId, 10);
  if (Number.isNaN(subjectId)) return res.status(400).json({ error: "Invalid subject id" });

  const context = await getSubjectContext(subjectId);
  if (!context) return res.status(404).json({ error: "Subject not found" });
  const { cls } = context;
  if (!canManageQuestionBankStructure(auth, cls)) {
    return res.status(403).json({ error: "Only super admin can modify this question bank" });
  }
  if (!ensureQuestionBankUnlocked(cls, res)) return;

  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
  if (!title) {
    return res.status(400).json({ error: "Subject title is required" });
  }

  const [updatedSubject] = await db
    .update(subjectsTable)
    .set({
      title,
      description: description || null,
    })
    .where(eq(subjectsTable.id, subjectId))
    .returning();

  const [teacher] = updatedSubject.teacherId
    ? await db
        .select({ fullName: usersTable.fullName, username: usersTable.username })
        .from(usersTable)
        .where(eq(usersTable.id, updatedSubject.teacherId))
    : [];

  res.json({
    ...updatedSubject,
    teacherName: teacher?.fullName ?? null,
    teacherUsername: teacher?.username ?? null,
  });
});

router.delete("/question-bank/subjects/:subjectId", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;

  const subjectId = parseInt(req.params.subjectId, 10);
  if (Number.isNaN(subjectId)) return res.status(400).json({ error: "Invalid subject id" });

  const context = await getSubjectContext(subjectId);
  if (!context) return res.status(404).json({ error: "Subject not found" });
  if (!canManageQuestionBankStructure(auth, context.cls)) {
    return res.status(403).json({ error: "Only super admin can modify this question bank" });
  }

  await db.delete(subjectsTable).where(eq(subjectsTable.id, subjectId));
  res.json({ success: true });
});

router.patch("/question-bank/chapters/:chapterId", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;

  const chapterId = parseInt(req.params.chapterId, 10);
  if (Number.isNaN(chapterId)) return res.status(400).json({ error: "Invalid chapter id" });

  const context = await getChapterContext(chapterId);
  if (!context) return res.status(404).json({ error: "Chapter not found" });
  if (!canManageQuestionBankStructure(auth, context.cls)) {
    return res.status(403).json({ error: "Only super admin can update chapter details" });
  }
  if (!ensureQuestionBankUnlocked(context.cls, res)) return;

  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
  const rawTargetQuestions = Number(req.body?.targetQuestions ?? context.chapter.targetQuestions ?? 0);

  if (!title) {
    return res.status(400).json({ error: "Chapter title is required" });
  }
  if (!Number.isFinite(rawTargetQuestions) || rawTargetQuestions < 0) {
    return res.status(400).json({ error: "Target questions must be zero or more" });
  }

  const [updatedChapter] = await db
    .update(chaptersTable)
    .set({
      title,
      description: description || null,
      targetQuestions: Math.max(0, Math.round(rawTargetQuestions)),
    })
    .where(eq(chaptersTable.id, chapterId))
    .returning();

  res.json(updatedChapter);
});

router.delete("/question-bank/chapters/:chapterId", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;

  const chapterId = parseInt(req.params.chapterId, 10);
  if (Number.isNaN(chapterId)) return res.status(400).json({ error: "Invalid chapter id" });

  const context = await getChapterContext(chapterId);
  if (!context) return res.status(404).json({ error: "Chapter not found" });
  if (!canManageQuestionBankStructure(auth, context.cls)) {
    return res.status(403).json({ error: "Only super admin can modify this question bank" });
  }
  if (!ensureQuestionBankUnlocked(context.cls, res)) return;

  await db.delete(chaptersTable).where(eq(chaptersTable.id, chapterId));
  res.json({ success: true });
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
  if (!ensureQuestionBankUnlocked(context.cls, res)) return;

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
          : parsed.value.correctAnswerMulti.map((idx: number) => parsed.value.options[idx]).filter(Boolean).join(", "),
      explanation: parsed.value.explanation,
      topicTag: parsed.value.topicTag,
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

router.patch("/question-bank-questions/:id/move", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;

  const questionId = parseInt(req.params.id, 10);
  const targetChapterId = Number(req.body?.chapterId);
  if (Number.isNaN(questionId) || !Number.isInteger(questionId)) {
    return res.status(400).json({ error: "Invalid question id" });
  }
  if (!Number.isInteger(targetChapterId) || targetChapterId <= 0) {
    return res.status(400).json({ error: "A valid target chapter is required" });
  }

  const currentContext = await getQuestionContext(questionId);
  if (!currentContext) return res.status(404).json({ error: "Question not found" });
  if (!canManageQuestionBank(auth, currentContext.subject, currentContext.cls)) {
    return res.status(403).json({ error: "Only the assigned subject teacher can move questions" });
  }
  if (!ensureQuestionBankUnlocked(currentContext.cls, res)) return;

  const targetContext = await getChapterContext(targetChapterId);
  if (!targetContext) return res.status(404).json({ error: "Target chapter not found" });
  if (!canManageQuestionBank(auth, targetContext.subject, targetContext.cls)) {
    return res.status(403).json({ error: "You do not have access to the target chapter" });
  }
  if (targetContext.subject.id !== currentContext.subject.id) {
    return res.status(400).json({ error: "Question can only be moved within the same subject" });
  }
  if (targetContext.chapter.id === currentContext.chapter.id) {
    return res.status(400).json({ error: "Question is already in this chapter" });
  }

  const targetExisting = await db
    .select({
      id: questionBankQuestionsTable.id,
      question: questionBankQuestionsTable.question,
      questionType: questionBankQuestionsTable.questionType,
    })
    .from(questionBankQuestionsTable)
    .where(eq(questionBankQuestionsTable.chapterId, targetChapterId));
  const duplicateKeys = new Set(targetExisting.map(buildExistingQuestionDuplicateKey).filter((value): value is string => !!value));
  const duplicateKey = normalizeQuestionDuplicateKey(
    currentContext.question.question,
    currentContext.question.questionType === "multi" || currentContext.question.questionType === "integer"
      ? currentContext.question.questionType
      : "mcq",
  );

  if (duplicateKey && duplicateKeys.has(duplicateKey)) {
    return res.status(409).json({ error: "A matching question already exists in the target chapter" });
  }

  const [updated] = await db
    .update(questionBankQuestionsTable)
    .set({
      classId: targetContext.cls.id,
      subjectId: targetContext.subject.id,
      chapterId: targetContext.chapter.id,
      order: targetExisting.length,
      updatedAt: new Date(),
    })
    .where(eq(questionBankQuestionsTable.id, questionId))
    .returning();

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
  if (!ensureQuestionBankUnlocked(context.cls, res)) return;

  await db.delete(questionBankQuestionsTable).where(eq(questionBankQuestionsTable.id, questionId));
  res.sendStatus(204);
});

router.post("/question-bank-questions/:id/attempt", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;
  if (auth.role !== "student") return res.status(403).json({ error: "Only students can attempt question bank questions" });
  const [student] = await db.select().from(usersTable).where(eq(usersTable.id, auth.userId));
  if (!ensureStudentFeatureUnlocked(student, "question-bank", res)) return;

  const questionId = parseInt(req.params.id, 10);
  if (Number.isNaN(questionId)) return res.status(400).json({ error: "Invalid question id" });

  const context = await getQuestionContext(questionId);
  if (!context) return res.status(404).json({ error: "Question not found" });

  const allowed = await canStudentAccessQuestionBankClass(auth.userId, context.cls);
  if (!allowed) return res.status(403).json({ error: "This question bank is not available for your exam profile" });

  const normalizedAnswer = normalizeQuestionBankAttemptAnswer(context.question, req.body?.answer);
  if ("error" in normalizedAnswer) return res.status(400).json({ error: normalizedAnswer.error });

  const now = new Date();
  const isCorrect = isQuestionBankAttemptCorrect(context.question, normalizedAnswer.value);
  const serializedAnswer = JSON.stringify(normalizedAnswer.value);

  const [existing] = await db
    .select()
    .from(questionBankQuestionProgressTable)
    .where(and(
      eq(questionBankQuestionProgressTable.questionId, questionId),
      eq(questionBankQuestionProgressTable.studentId, auth.userId),
    ));

  const [progress] = existing
    ? await db
        .update(questionBankQuestionProgressTable)
        .set({
          attemptCount: existing.attemptCount + 1,
          correctCount: existing.correctCount + (isCorrect ? 1 : 0),
          incorrectCount: existing.incorrectCount + (isCorrect ? 0 : 1),
          lastAnswer: serializedAnswer,
          lastIsCorrect: isCorrect,
          lastAttemptedAt: now,
          solvedAt: existing.solvedAt ?? (isCorrect ? now : null),
        })
        .where(eq(questionBankQuestionProgressTable.id, existing.id))
        .returning()
    : await db
        .insert(questionBankQuestionProgressTable)
        .values({
          questionId,
          studentId: auth.userId,
          classId: context.cls.id,
          subjectId: context.subject.id,
          chapterId: context.chapter.id,
          attemptCount: 1,
          correctCount: isCorrect ? 1 : 0,
          incorrectCount: isCorrect ? 0 : 1,
          lastAnswer: serializedAnswer,
          lastIsCorrect: isCorrect,
          firstAttemptedAt: now,
          lastAttemptedAt: now,
          solvedAt: isCorrect ? now : null,
        })
        .returning();

  res.json({
    isCorrect,
    progress: {
      attemptCount: progress.attemptCount,
      correctCount: progress.correctCount,
      incorrectCount: progress.incorrectCount,
      firstAttemptedAt: progress.firstAttemptedAt,
      lastAttemptedAt: progress.lastAttemptedAt,
      solvedAt: progress.solvedAt,
      lastIsCorrect: progress.lastIsCorrect,
    },
  });
});

router.post("/question-bank-questions/:id/report", async (req, res) => {
  const auth = getAuth(req, res);
  if (!auth) return;
  if (auth.role !== "student") return res.status(403).json({ error: "Only students can report questions" });
  const [student] = await db.select().from(usersTable).where(eq(usersTable.id, auth.userId));
  if (!ensureStudentFeatureUnlocked(student, "question-bank", res)) return;

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
  const [student] = await db.select().from(usersTable).where(eq(usersTable.id, auth.userId));
  if (!ensureStudentFeatureUnlocked(student, "question-bank", res)) return;

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
      : Promise.resolve<Array<typeof questionBankQuestionsTable.$inferSelect>>([]),
    reporterIds.length > 0
      ? db
          .select({ id: usersTable.id, fullName: usersTable.fullName, username: usersTable.username })
          .from(usersTable)
          .where(inArray(usersTable.id, reporterIds))
      : Promise.resolve<Array<{ id: number; fullName: string; username: string }>>([]),
  ]);

  const questionMap = new Map<number, typeof questionBankQuestionsTable.$inferSelect>(
    questions.map((question): [number, typeof questionBankQuestionsTable.$inferSelect] => [question.id, question]),
  );
  const reporterMap = new Map<number, { id: number; fullName: string; username: string }>(
    reporters.map((reporter): [number, { id: number; fullName: string; username: string }] => [reporter.id, reporter]),
  );

  res.json(reports.map((report) => ({
    ...report,
    questionText: questionMap.get(report.questionId)?.question ?? "",
    reporterName: reporterMap.get(report.reportedBy)?.fullName ?? reporterMap.get(report.reportedBy)?.username ?? "Student",
  })));
});

export { router as questionBankRouter };
