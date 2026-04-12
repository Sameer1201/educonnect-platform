import { Router } from "express";
import {
  db,
  testsTable,
  testQuestionsTable,
  testSectionsTable,
  testSubmissionsTable,
  examTemplatesTable,
  usersTable,
  enrollmentsTable,
  classesTable,
  lecturePlansTable,
  chaptersTable,
  subjectsTable,
} from "@workspace/db";
import { pushNotification, pushNotificationToMany } from "../lib/pushNotification";
import { eq, and, inArray, isNull, or, asc, desc } from "drizzle-orm";

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

function normalizeExamKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  const compact = raw.replace(/[^a-z0-9]+/g, " ").trim();
  if (compact.includes("iit jam")) return "iit-jam";
  if (compact.includes("jee main")) return "jee";
  if (compact === "jee") return "jee";
  if (compact.includes("gate")) return "gate";
  if (compact.includes("cuet")) return "cuet";
  if (compact.includes("neet")) return "neet";
  if (compact.includes("cat")) return "cat";
  return compact.replace(/\s+/g, "-");
}

function safeParseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeArrayValue<T = unknown>(value: unknown, fallback: T[] = []): T[] {
  if (Array.isArray(value)) return value as T[];
  return safeParseJson(value, fallback);
}

function normalizeObjectValue<T extends Record<string, unknown> | null>(value: unknown, fallback: T): T {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as T;
  return safeParseJson(value, fallback);
}

function isHtmlImportedTestConfig(value: unknown) {
  const config = normalizeObjectValue<Record<string, unknown> | null>(value, null);
  return Boolean(config?.importedFromHtml);
}

function getDefaultTemplateInstructions(templateName: string, durationMinutes: number) {
  const safeName = templateName?.trim() || "the examination";
  const safeDuration = Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 180;
  return [
    `The duration of ${safeName} is ${safeDuration} minutes. The countdown timer at the top right-hand corner of your screen displays the remaining time.`,
    "When the timer reaches zero, the test will be submitted automatically.",
    "Read every question carefully before selecting or entering your response.",
    "Use Save & Next to save the current response and move ahead.",
    "Use Mark for Review & Next when you want to revisit a question before final submission.",
    "You can jump to any question from the question palette without losing the current screen context.",
    "Use Clear Response to remove the selected answer from the current question.",
    "MCQ uses single selection, MSQ uses multiple selections, and integer questions require a numeric answer.",
  ].join("\n");
}

function normalizeSectionLabel(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function serializeTestQuestion(question: any, options?: { showCorrect?: boolean; includeSolutions?: boolean }) {
  const showCorrect = Boolean(options?.showCorrect);
  const includeSolutions = Boolean(options?.includeSolutions);
  const base = {
    id: question.id,
    sectionId: question.sectionId ?? null,
    questionCode: question.questionCode ?? null,
    sourceType: question.sourceType ?? "manual",
    subjectLabel: question.subjectLabel ?? null,
    question: question.question,
    questionType: question.questionType ?? "mcq",
    options: safeParseJson(question.options, []),
    optionImages: safeParseJson(question.optionImages, null),
    points: question.points,
    negativeMarks: question.negativeMarks ?? 0,
    order: question.order,
    meta: safeParseJson(question.meta, null),
    imageData: question.imageData ?? null,
  } as Record<string, unknown>;

  if (showCorrect) {
    base.correctAnswer = question.correctAnswer;
    base.correctAnswerMulti = safeParseJson(question.correctAnswerMulti, null);
    base.correctAnswerMin = question.correctAnswerMin ?? null;
    base.correctAnswerMax = question.correctAnswerMax ?? null;
  }

  if (includeSolutions) {
    base.solutionText = question.solutionText ?? null;
    base.solutionImageData = question.solutionImageData ?? null;
  }

  return base;
}

function formatSubmissionAnswerLabel(question: any, answer: any): string {
  const qType = question.questionType ?? "mcq";
  if (answer === undefined || answer === null || answer === "" || (Array.isArray(answer) && answer.length === 0)) {
    return "—";
  }
  if (qType === "multi") {
    return Array.isArray(answer)
      ? answer.map((value) => String.fromCharCode(65 + Number(value))).join(", ")
      : "—";
  }
  if (qType === "integer") {
    return String(answer);
  }
  return String.fromCharCode(65 + Number(answer));
}

function formatQuestionCorrectLabel(question: any): string {
  const qType = question.questionType ?? "mcq";
  if (qType === "multi") {
    return normalizeArrayValue<number>(question.correctAnswerMulti, [])
      .map((value) => String.fromCharCode(65 + Number(value)))
      .join(", ");
  }
  if (qType === "integer") {
    if (question.correctAnswerMin !== null && question.correctAnswerMin !== undefined &&
        question.correctAnswerMax !== null && question.correctAnswerMax !== undefined) {
      return `${question.correctAnswerMin} — ${question.correctAnswerMax}`;
    }
    return String(question.correctAnswer ?? "—");
  }
  return String.fromCharCode(65 + Number(question.correctAnswer ?? 0));
}

function computeOptionSelectionStats(question: any, submissions: Array<{ answers?: unknown }>) {
  const optionCounts = normalizeArrayValue(question.options, []).map(() => 0);
  let attemptedCount = 0;
  const questionType = question.questionType ?? "mcq";

  submissions.forEach((submission) => {
    const parsedAnswers = safeParseJson<Record<string, unknown>>(submission.answers, {});
    const answer = parsedAnswers[String(question.id)] ?? parsedAnswers[question.id as unknown as keyof typeof parsedAnswers];
    if (!hasAnsweredQuestion(question, answer)) return;

    attemptedCount += 1;

    if (questionType === "mcq") {
      const index = Number(answer);
      if (optionCounts[index] !== undefined) optionCounts[index] += 1;
      return;
    }

    if (questionType === "multi" && Array.isArray(answer)) {
      answer.forEach((value) => {
        const index = Number(value);
        if (optionCounts[index] !== undefined) optionCounts[index] += 1;
      });
    }
  });

  return {
    optionCounts,
    optionSelectionPercentages: optionCounts.map((count) =>
      attemptedCount > 0 ? Number(((count / attemptedCount) * 100).toFixed(2)) : 0,
    ),
  };
}

async function syncTestSectionsFromTemplate(testId: number, examType: unknown, rawSections: any[]) {
  const parsedSections = rawSections.map((section) => ({
    ...section,
    meta: safeParseJson(section.meta, null),
  }));

  const examKey = normalizeExamKey(examType);
  if (!examKey) return parsedSections;

  const [template] = await db.select().from(examTemplatesTable).where(eq(examTemplatesTable.key, examKey)).limit(1);
  if (!template) return parsedSections;

  const templateSections = normalizeArrayValue<Record<string, unknown>>(template.sections, []);
  if (templateSections.length === 0) return parsedSections;

  const existingByLabel = new Map<string, any>();
  parsedSections.forEach((section) => {
    const label = normalizeSectionLabel(section.subjectLabel ?? section.title);
    if (label && !existingByLabel.has(label)) existingByLabel.set(label, section);
  });

  const usedIds = new Set<number>();
  const resolvedSections: any[] = [];

  for (let index = 0; index < templateSections.length; index += 1) {
    const templateSection = templateSections[index];
    const templateLabel = normalizeSectionLabel(templateSection.subjectLabel ?? templateSection.title);

    let existingSection =
      (templateLabel && existingByLabel.get(templateLabel)) ||
      parsedSections.find((section) => !usedIds.has(section.id) && section.order === index) ||
      parsedSections.find((section) => !usedIds.has(section.id)) ||
      null;

    const desiredValues = {
      title:
        typeof templateSection.title === "string" && templateSection.title.trim()
          ? templateSection.title.trim()
          : `Section ${index + 1}`,
      description:
        typeof templateSection.description === "string" && templateSection.description.trim()
          ? templateSection.description.trim()
          : existingSection?.description ?? null,
      subjectLabel:
        typeof templateSection.subjectLabel === "string" && templateSection.subjectLabel.trim()
          ? templateSection.subjectLabel.trim()
          : existingSection?.subjectLabel ?? null,
      questionCount:
        templateSection.questionCount === undefined || templateSection.questionCount === null || String(templateSection.questionCount).trim() === ""
          ? null
          : Number(templateSection.questionCount),
      marksPerQuestion:
        templateSection.marksPerQuestion === undefined || templateSection.marksPerQuestion === null || String(templateSection.marksPerQuestion).trim() === ""
          ? null
          : Number(templateSection.marksPerQuestion),
      negativeMarks:
        templateSection.negativeMarks === undefined || templateSection.negativeMarks === null || String(templateSection.negativeMarks).trim() === ""
          ? null
          : Number(templateSection.negativeMarks),
      meta: templateSection.meta ?? existingSection?.meta ?? null,
      order: index,
    };

    if (!existingSection) {
      const [createdSection] = await db.insert(testSectionsTable).values({
        testId,
        title: desiredValues.title,
        description: desiredValues.description,
        subjectLabel: desiredValues.subjectLabel,
        questionCount: desiredValues.questionCount,
        marksPerQuestion: desiredValues.marksPerQuestion,
        negativeMarks: desiredValues.negativeMarks,
        meta: desiredValues.meta ? JSON.stringify(desiredValues.meta) : null,
        order: desiredValues.order,
      }).returning();
      existingSection = {
        ...createdSection,
        meta: safeParseJson(createdSection.meta, null),
      };
      usedIds.add(existingSection.id);
    } else {
      usedIds.add(existingSection.id);
      const currentMeta = existingSection.meta ?? null;
      const desiredMetaString = desiredValues.meta ? JSON.stringify(desiredValues.meta) : null;
      const currentMetaString = currentMeta ? JSON.stringify(currentMeta) : null;
      const needsUpdate =
        existingSection.title !== desiredValues.title ||
        (existingSection.description ?? null) !== desiredValues.description ||
        (existingSection.subjectLabel ?? null) !== desiredValues.subjectLabel ||
        (existingSection.questionCount ?? null) !== desiredValues.questionCount ||
        (existingSection.marksPerQuestion ?? null) !== desiredValues.marksPerQuestion ||
        (existingSection.negativeMarks ?? null) !== desiredValues.negativeMarks ||
        existingSection.order !== desiredValues.order ||
        currentMetaString !== desiredMetaString;

      if (needsUpdate) {
        const [updatedSection] = await db.update(testSectionsTable).set({
          title: desiredValues.title,
          description: desiredValues.description,
          subjectLabel: desiredValues.subjectLabel,
          questionCount: desiredValues.questionCount,
          marksPerQuestion: desiredValues.marksPerQuestion,
          negativeMarks: desiredValues.negativeMarks,
          meta: desiredMetaString,
          order: desiredValues.order,
        }).where(eq(testSectionsTable.id, existingSection.id)).returning();
        existingSection = {
          ...updatedSection,
          meta: safeParseJson(updatedSection.meta, null),
        };
      }
    }

    resolvedSections.push(existingSection);
  }

  const unusedSections = parsedSections
    .filter((section) => !resolvedSections.some((resolved) => resolved.id === section.id))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return [...resolvedSections, ...unusedSections];
}

// GET /api/tests — list tests
router.get("/tests", requireAuth, async (req, res) => {
  try {
    const userId = parseInt(req.cookies.userId, 10);
    const user = await getUser(userId);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    if (user.role === "super_admin") {
      const tests = await db.select({
        id: testsTable.id,
        classId: testsTable.classId,
        title: testsTable.title,
        chapterId: testsTable.chapterId,
        durationMinutes: testsTable.durationMinutes,
        passingScore: testsTable.passingScore,
        isPublished: testsTable.isPublished,
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
        examType: testsTable.examType,
        durationMinutes: testsTable.durationMinutes,
      defaultPositiveMarks: testsTable.defaultPositiveMarks,
      defaultNegativeMarks: testsTable.defaultNegativeMarks,
      passingScore: testsTable.passingScore,
      isPublished: testsTable.isPublished,
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
    const studentExamKeys = new Set<string>();
    const primaryExamKey = normalizeExamKey(user.subject);
    if (primaryExamKey) studentExamKeys.add(primaryExamKey);
    for (const exam of user.additionalExams ?? []) {
      const key = normalizeExamKey(exam);
      if (key) studentExamKeys.add(key);
    }
    if (studentExamKeys.size === 0) return res.json([]);

    const tests = await db.select({
      id: testsTable.id,
      title: testsTable.title,
      examType: testsTable.examType,
      durationMinutes: testsTable.durationMinutes,
      passingScore: testsTable.passingScore,
      scheduledAt: testsTable.scheduledAt,
      className: classesTable.title, chapterName: chaptersTable.title, subjectName: subjectsTable.title,
    }).from(testsTable)
      .leftJoin(classesTable, eq(testsTable.classId, classesTable.id))
      .leftJoin(chaptersTable, eq(testsTable.chapterId, chaptersTable.id))
      .leftJoin(subjectsTable, eq(chaptersTable.subjectId, subjectsTable.id))
      .where(eq(testsTable.isPublished, true))
      .orderBy(testsTable.scheduledAt);

    const visibleTests = tests.filter((test) => {
      const examKey = normalizeExamKey(test.examType);
      return examKey ? studentExamKeys.has(examKey) : false;
    });

    const submissions = await db.select({ testId: testSubmissionsTable.testId })
      .from(testSubmissionsTable).where(eq(testSubmissionsTable.studentId, userId));
    const submittedTestIds = new Set(submissions.map((s) => s.testId));
    return res.json(visibleTests.map((t) => ({ ...t, alreadySubmitted: submittedTestIds.has(t.id) })));
  } catch { return res.status(500).json({ error: "Internal server error" }); }
});

// GET /api/tests/review-bucket — all non-correct student test questions grouped later in UI
router.get("/tests/review-bucket", requireAuth, async (req, res) => {
  try {
    const userId = parseInt(req.cookies.userId, 10);
    const user = await getUser(userId);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (user.role !== "student") return res.status(403).json({ error: "Forbidden" });
    const dismissedQuestionIds = new Set(
      (user.reviewBucketDismissedQuestionIds ?? [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value)),
    );

    const submissions = await db.select()
      .from(testSubmissionsTable)
      .where(eq(testSubmissionsTable.studentId, userId))
      .orderBy(desc(testSubmissionsTable.submittedAt), desc(testSubmissionsTable.id));

    const latestByTest = new Map<number, typeof submissions[number]>();
    for (const submission of submissions) {
      if (!latestByTest.has(submission.testId)) latestByTest.set(submission.testId, submission);
    }

    const testIds = [...latestByTest.keys()];
    if (testIds.length === 0) return res.json([]);

    const allSubmissions = await db
      .select({
        testId: testSubmissionsTable.testId,
        answers: testSubmissionsTable.answers,
        questionTimings: testSubmissionsTable.questionTimings,
      })
      .from(testSubmissionsTable)
      .where(inArray(testSubmissionsTable.testId, testIds));

    const tests = await db.select({
      id: testsTable.id,
      title: testsTable.title,
      chapterName: chaptersTable.title,
      subjectName: subjectsTable.title,
    }).from(testsTable)
      .leftJoin(chaptersTable, eq(testsTable.chapterId, chaptersTable.id))
      .leftJoin(subjectsTable, eq(chaptersTable.subjectId, subjectsTable.id))
      .where(inArray(testsTable.id, testIds));

    const sections = await db.select().from(testSectionsTable)
      .where(inArray(testSectionsTable.testId, testIds))
      .orderBy(asc(testSectionsTable.order));

    const questions = await db.select().from(testQuestionsTable)
      .where(inArray(testQuestionsTable.testId, testIds))
      .orderBy(asc(testQuestionsTable.order));

    const testMetaById = new Map(tests.map((test) => [test.id, test]));
    const sectionById = new Map(sections.map((section) => [section.id, section]));
    const allSubmissionsByTest = new Map<number, typeof allSubmissions>();
    allSubmissions.forEach((submission) => {
      const bucket = allSubmissionsByTest.get(submission.testId) ?? [];
      bucket.push(submission);
      allSubmissionsByTest.set(submission.testId, bucket);
    });

    const entries = questions.flatMap((question) => {
      const submission = latestByTest.get(question.testId);
      if (!submission) return [];
      if (dismissedQuestionIds.has(question.id)) return [];
      const answers = safeParseJson<Record<string, unknown>>(submission.answers, {});
      const timings = safeParseJson<Record<string, number>>(submission.questionTimings, {});
      const answer = answers[String(question.id)];
      const answered = hasAnsweredQuestion(question, answer);
      const correct = answered && gradeQuestion(question, answer);
      if (correct) return [];

      const testMeta = testMetaById.get(question.testId);
      const section = question.sectionId ? sectionById.get(question.sectionId) : null;
      const meta = safeParseJson<Record<string, unknown> | null>(question.meta, null);
      const chapterName = typeof meta?.chapterName === "string" && meta.chapterName.trim()
        ? meta.chapterName.trim()
        : testMeta?.chapterName ?? "General";
      const topicTag = typeof meta?.topicTag === "string" && meta.topicTag.trim()
        ? meta.topicTag.trim()
        : null;
      const questionTimings = allSubmissionsByTest.get(question.testId) ?? [];
      let attemptedCount = 0;
      let correctCount = 0;
      let wrongCount = 0;
      let skippedCount = 0;
      const recordedTimes: number[] = [];
      const optionCounts = normalizeArrayValue(question.options, []).map(() => 0);

      questionTimings.forEach((item) => {
        const parsedAnswers = safeParseJson<Record<string, unknown>>(item.answers, {});
        const parsedAnswer = parsedAnswers[String(question.id)] ?? parsedAnswers[question.id as unknown as keyof typeof parsedAnswers];
        const didAnswer = hasAnsweredQuestion(question, parsedAnswer);
        if (didAnswer) {
          attemptedCount += 1;
          if (gradeQuestion(question, parsedAnswer)) correctCount += 1;
          else wrongCount += 1;

          if ((question.questionType ?? "mcq") === "mcq") {
            const index = Number(parsedAnswer);
            if (optionCounts[index] !== undefined) optionCounts[index] += 1;
          }

          if ((question.questionType ?? "mcq") === "multi" && Array.isArray(parsedAnswer)) {
            parsedAnswer.forEach((value) => {
              const index = Number(value);
              if (optionCounts[index] !== undefined) optionCounts[index] += 1;
            });
          }
        } else {
          skippedCount += 1;
        }

        const parsedTimings = safeParseJson<Record<string, number>>(item.questionTimings, {});
        const recorded = Number(parsedTimings[String(question.id)] ?? parsedTimings[question.id as unknown as keyof typeof parsedTimings] ?? 0);
        if (Number.isFinite(recorded) && recorded > 0) recordedTimes.push(recorded);
      });

      const totalSubmissions = questionTimings.length;
      const attemptedBase = attemptedCount > 0 ? attemptedCount : 1;
      const averageTimeSeconds =
        recordedTimes.length > 0
          ? Math.round(recordedTimes.reduce((sum, value) => sum + value, 0) / recordedTimes.length)
          : 0;
      const analytics = {
        myTimeSeconds: Number(timings[String(question.id)] ?? timings[question.id as unknown as keyof typeof timings] ?? 0) || 0,
        allottedTimeSeconds: Number(meta?.estimatedTimeSeconds ?? 0) || 0,
        averageTimeSeconds,
        gotRightPercent: attemptedCount > 0 ? Number(((correctCount / attemptedBase) * 100).toFixed(2)) : 0,
        gotWrongPercent: attemptedCount > 0 ? Number(((wrongCount / attemptedBase) * 100).toFixed(2)) : 0,
        skippedPercent: totalSubmissions > 0 ? Number(((skippedCount / totalSubmissions) * 100).toFixed(2)) : 0,
      };
      const optionSelectionPercentages = optionCounts.map((count) =>
        attemptedCount > 0 ? Number(((count / attemptedCount) * 100).toFixed(2)) : 0,
      );
      const subjectLabel =
        (typeof question.subjectLabel === "string" && question.subjectLabel.trim() ? question.subjectLabel.trim() : null) ??
        (typeof section?.subjectLabel === "string" && section.subjectLabel.trim() ? section.subjectLabel.trim() : null) ??
        (typeof section?.title === "string" && section.title.trim() ? section.title.trim() : null) ??
        testMeta?.subjectName ??
        "General";

      return [{
        testId: question.testId,
        questionId: question.id,
        questionIndex: Number(question.order ?? 0),
        status: answered ? "incorrect" : "unattempted",
        subjectLabel,
        chapterName,
        topicTag,
        sectionLabel: section?.title ?? subjectLabel,
        yourAnswerLabel: answered ? formatSubmissionAnswerLabel(question, answer) : "Not attempted",
        correctAnswerLabel: formatQuestionCorrectLabel(question),
        analytics,
        question: {
          ...serializeTestQuestion(question, { showCorrect: true, includeSolutions: true }),
          optionSelectionCounts: optionCounts,
          optionSelectionPercentages,
        },
      }];
    });

    return res.json(entries);
  } catch (error) {
    console.error("GET /api/tests/review-bucket failed", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/tests/review-bucket/:questionId/remove", requireAuth, async (req, res) => {
  try {
    const userId = parseInt(req.cookies.userId, 10);
    const questionId = parseInt(req.params.questionId, 10);
    if (!Number.isFinite(questionId)) return res.status(400).json({ error: "Invalid question id" });

    const user = await getUser(userId);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (user.role !== "student") return res.status(403).json({ error: "Forbidden" });

    const nextDismissedIds = Array.from(
      new Set(
        [...(user.reviewBucketDismissedQuestionIds ?? []), questionId]
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value)),
      ),
    );
    await db
      .update(usersTable)
      .set({
        reviewBucketDismissedQuestionIds: nextDismissedIds,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));

    return res.json({ ok: true });
  } catch (error) {
    console.error("POST /api/tests/review-bucket/:questionId/remove failed", error);
    return res.status(500).json({ error: "Internal server error" });
  }
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
    const sections = isHtmlImportedTestConfig(test.examConfig)
      ? rawSections.map((section) => ({ ...section, meta: safeParseJson(section.meta, null) }))
      : await syncTestSectionsFromTemplate(test.id, test.examType, rawSections);

    const isAdmin = user.role === "admin" || user.role === "super_admin";
    let submission = null;
    if (user.role === "student") {
      const [sub] = await db.select().from(testSubmissionsTable)
        .where(and(eq(testSubmissionsTable.testId, testId), eq(testSubmissionsTable.studentId, userId)))
        .orderBy(desc(testSubmissionsTable.submittedAt), desc(testSubmissionsTable.id))
        .limit(1);
      submission = sub ?? null;
    }

    const richSubmission = submission ? {
      ...submission,
      questionTimings: safeParseJson(submission.questionTimings, null),
      flaggedQuestions: safeParseJson(submission.flaggedQuestions, null),
      visitedQuestionIds: safeParseJson(submission.visitedQuestionIds, null),
      reviewQuestionIds: safeParseJson(submission.reviewQuestionIds, null),
      interactionLog: safeParseJson(submission.interactionLog, null),
    } : null;

    const showCorrect = isAdmin || submission !== null;
    const safeQuestions = questions.map((q) =>
      serializeTestQuestion(q, { showCorrect, includeSolutions: showCorrect })
    );

    return res.json({ ...test, sections, questions: safeQuestions, submission: richSubmission });
  } catch (error) {
    console.error("GET /api/tests/:id failed", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/tests/:id/export — export a full test bundle with sections + questions
router.get("/tests/:id/export", requireAuth, async (req, res) => {
  try {
    const testId = parseInt(req.params.id, 10);
    const userId = parseInt(req.cookies.userId, 10);
    const user = await getUser(userId);
    if (!user || (user.role !== "admin" && user.role !== "super_admin")) return res.status(403).json({ error: "Forbidden" });

    const [test] = await db.select().from(testsTable).where(eq(testsTable.id, testId));
    if (!test) return res.status(404).json({ error: "Test not found" });

    const rawSections = await db.select().from(testSectionsTable)
      .where(eq(testSectionsTable.testId, testId))
      .orderBy(asc(testSectionsTable.order));
    const sections = isHtmlImportedTestConfig(test.examConfig)
      ? rawSections.map((section) => ({ ...section, meta: safeParseJson(section.meta, null) }))
      : await syncTestSectionsFromTemplate(test.id, test.examType, rawSections);
    const questions = await db.select().from(testQuestionsTable)
      .where(eq(testQuestionsTable.testId, testId))
      .orderBy(asc(testQuestionsTable.order));

    const allSubmissions = await db
      .select({ answers: testSubmissionsTable.answers })
      .from(testSubmissionsTable)
      .where(eq(testSubmissionsTable.testId, testId));

    const bundle = {
      version: 1,
      exportedAt: new Date().toISOString(),
      source: {
        testId: test.id,
        title: test.title,
        examType: test.examType,
      },
      test: {
        title: test.title,
        description: test.description ?? null,
        examType: test.examType,
        examHeader: test.examHeader ?? null,
        examSubheader: test.examSubheader ?? null,
        instructions: test.instructions ?? null,
        examConfig: normalizeObjectValue(test.examConfig, null),
        durationMinutes: test.durationMinutes,
        passingScore: test.passingScore ?? null,
        defaultPositiveMarks: test.defaultPositiveMarks,
        defaultNegativeMarks: test.defaultNegativeMarks,
        scheduledAt: test.scheduledAt ? new Date(test.scheduledAt).toISOString() : null,
        sections: sections.map((section, index) => ({
          exportRef: `section-${section.id}`,
          title: section.title,
          description: section.description ?? null,
          subjectLabel: section.subjectLabel ?? null,
          questionCount: section.questionCount ?? null,
          marksPerQuestion: section.marksPerQuestion ?? null,
          negativeMarks: section.negativeMarks ?? null,
          meta: normalizeObjectValue(section.meta, null),
          order: section.order ?? index,
        })),
        questions: questions.map((question, index) => ({
          question: question.question,
          questionType: question.questionType ?? "mcq",
          sectionRef: question.sectionId ? `section-${question.sectionId}` : null,
          questionCode: question.questionCode ?? null,
          sourceType: question.sourceType ?? "manual",
          subjectLabel: question.subjectLabel ?? null,
          options: normalizeArrayValue<string>(question.options, []),
          optionImages: normalizeArrayValue<string | null>(question.optionImages, []),
          correctAnswer: question.correctAnswer,
          correctAnswerMulti: normalizeArrayValue<number>(question.correctAnswerMulti, []),
          correctAnswerMin: question.correctAnswerMin ?? null,
          correctAnswerMax: question.correctAnswerMax ?? null,
          points: question.points,
          negativeMarks: question.negativeMarks ?? 0,
          meta: normalizeObjectValue(question.meta, null),
          solutionText: question.solutionText ?? null,
          solutionImageData: question.solutionImageData ?? null,
          order: question.order ?? index,
          imageData: question.imageData ?? null,
        })),
      },
    };

    return res.json(bundle);
  } catch (error) {
    console.error("GET /api/tests/:id/export failed", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/tests — create test
router.post("/tests", requireAuth, async (req, res) => {
  try {
    const userId = parseInt(req.cookies.userId, 10);
    const user = await getUser(userId);
    if (!user || user.role !== "admin") return res.status(403).json({ error: "Forbidden" });

    const { title, description, examType, examHeader, examSubheader, instructions, examConfig, durationMinutes, passingScore, defaultPositiveMarks, defaultNegativeMarks, scheduledAt, sections } = req.body;
    if (!title) return res.status(400).json({ error: "title required" });

    const resolvedExamType = examType ? String(examType) : "custom";
    const [template] = resolvedExamType && resolvedExamType !== "custom"
      ? await db.select().from(examTemplatesTable).where(eq(examTemplatesTable.key, resolvedExamType))
      : [null];

    const resolvedDuration = durationMinutes ? Number(durationMinutes) : template?.durationMinutes ?? 30;
    const resolvedInstructions = typeof instructions === "string"
      ? (instructions.trim() || null)
      : template?.instructions?.trim() || null;

    const [test] = await db.insert(testsTable).values({
      classId: null,
      chapterId: null,
      title: String(title), description: description ? String(description) : null,
      examType: resolvedExamType,
      examHeader: examHeader ? String(examHeader) : template?.examHeader ?? null,
      examSubheader: examSubheader ? String(examSubheader) : template?.examSubheader ?? null,
      instructions: resolvedInstructions,
      examConfig: examConfig ? JSON.stringify(examConfig) : null,
      durationMinutes: resolvedDuration,
      passingScore: passingScore === undefined || passingScore === null || String(passingScore).trim() === ""
        ? template?.passingScore ?? null
        : Number(passingScore),
      defaultPositiveMarks: defaultPositiveMarks !== undefined ? Number(defaultPositiveMarks) : template?.defaultPositiveMarks ?? 1,
      defaultNegativeMarks: defaultNegativeMarks !== undefined ? Number(defaultNegativeMarks) : template?.defaultNegativeMarks ?? 0,
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

// POST /api/tests/import — recreate a full test from an exported bundle
router.post("/tests/import", requireAuth, async (req, res) => {
  try {
    const userId = parseInt(req.cookies.userId, 10);
    const user = await getUser(userId);
    if (!user || user.role !== "admin") return res.status(403).json({ error: "Forbidden" });

    const payload = req.body?.test ? req.body : { test: req.body };
    const test = payload?.test;
    if (!test || typeof test !== "object") return res.status(400).json({ error: "Invalid import payload" });

    const title = typeof test.title === "string" ? test.title.trim() : "";
    if (!title) return res.status(400).json({ error: "Imported test title missing" });

    const importedSections = Array.isArray(test.sections) ? test.sections : [];
    const questions = Array.isArray(test.questions) ? test.questions : [];
    const normalizedExamType = normalizeExamKey(test.examType) ?? (typeof test.examType === "string" && test.examType.trim() ? test.examType.trim() : "custom");
    const [matchedTemplate] = normalizedExamType && normalizedExamType !== "custom"
      ? await db.select().from(examTemplatesTable).where(eq(examTemplatesTable.key, normalizedExamType)).limit(1)
      : [null];

    const isHtmlImport = isHtmlImportedTestConfig(test.examConfig);
    const templateSections = matchedTemplate
      ? normalizeArrayValue<Record<string, unknown>>(matchedTemplate.sections, [])
      : [];
    const resolvedSections = isHtmlImport
      ? importedSections
      : templateSections.length > 0
        ? templateSections
        : importedSections;

    const normalizeSectionLabel = (value: unknown) =>
      typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, " ") : "";

    const importedSectionsByRef = new Map<string, any>();
    const importedSectionsByLabel = new Map<string, any>();
    importedSections.forEach((section: any, index: number) => {
      const ref = String(section.exportRef ?? `section-${index}`);
      importedSectionsByRef.set(ref, section);
      const label = normalizeSectionLabel(section.subjectLabel ?? section.title);
      if (label && !importedSectionsByLabel.has(label)) importedSectionsByLabel.set(label, section);
    });

    const [createdTest] = await db.insert(testsTable).values({
      classId: null,
      chapterId: null,
      title,
      description: typeof test.description === "string" && test.description.trim() ? test.description.trim() : null,
      examType: normalizedExamType,
      examHeader: typeof test.examHeader === "string" && test.examHeader.trim() ? test.examHeader.trim() : matchedTemplate?.examHeader ?? null,
      examSubheader: typeof test.examSubheader === "string" && test.examSubheader.trim() ? test.examSubheader.trim() : matchedTemplate?.examSubheader ?? null,
      instructions: typeof test.instructions === "string" && test.instructions.trim() ? test.instructions.trim() : null,
      examConfig: test.examConfig ? JSON.stringify(test.examConfig) : null,
      durationMinutes: Number(test.durationMinutes) || matchedTemplate?.durationMinutes || 30,
      passingScore: test.passingScore === undefined || test.passingScore === null || String(test.passingScore).trim() === "" ? null : Number(test.passingScore),
      defaultPositiveMarks: test.defaultPositiveMarks !== undefined ? Number(test.defaultPositiveMarks) : matchedTemplate?.defaultPositiveMarks ?? 1,
      defaultNegativeMarks: test.defaultNegativeMarks !== undefined ? Number(test.defaultNegativeMarks) : matchedTemplate?.defaultNegativeMarks ?? 0,
      scheduledAt: typeof test.scheduledAt === "string" && test.scheduledAt.trim() ? new Date(test.scheduledAt) : null,
      createdBy: userId,
      isPublished: false,
    }).returning();

    const sectionIdMap = new Map<string, number>();
    const createdSections: Array<{ id: number; label: string; index: number }> = [];
    for (let index = 0; index < resolvedSections.length; index += 1) {
      const section = resolvedSections[index] as any;
      const templateLabel = normalizeSectionLabel(section.subjectLabel ?? section.title);
      const importedMatch = templateSections.length > 0
        ? importedSectionsByLabel.get(templateLabel) ?? importedSections[index] ?? null
        : importedSections[index] ?? null;

      const [createdSection] = await db.insert(testSectionsTable).values({
        testId: createdTest.id,
        title: typeof section.title === "string" && section.title.trim() ? section.title.trim() : `Section ${index + 1}`,
        description: typeof section.description === "string" && section.description.trim()
          ? section.description.trim()
          : (typeof importedMatch?.description === "string" && importedMatch.description.trim() ? importedMatch.description.trim() : null),
        subjectLabel: typeof section.subjectLabel === "string" && section.subjectLabel.trim()
          ? section.subjectLabel.trim()
          : (typeof importedMatch?.subjectLabel === "string" && importedMatch.subjectLabel.trim() ? importedMatch.subjectLabel.trim() : null),
        questionCount: section.questionCount === undefined || section.questionCount === null || String(section.questionCount).trim() === ""
          ? (importedMatch?.questionCount === undefined || importedMatch?.questionCount === null || String(importedMatch.questionCount).trim() === "" ? null : Number(importedMatch.questionCount))
          : Number(section.questionCount),
        marksPerQuestion: section.marksPerQuestion === undefined || section.marksPerQuestion === null || String(section.marksPerQuestion).trim() === ""
          ? (importedMatch?.marksPerQuestion === undefined || importedMatch?.marksPerQuestion === null || String(importedMatch.marksPerQuestion).trim() === "" ? null : Number(importedMatch.marksPerQuestion))
          : Number(section.marksPerQuestion),
        negativeMarks: section.negativeMarks === undefined || section.negativeMarks === null || String(section.negativeMarks).trim() === ""
          ? (importedMatch?.negativeMarks === undefined || importedMatch?.negativeMarks === null || String(importedMatch.negativeMarks).trim() === "" ? null : Number(importedMatch.negativeMarks))
          : Number(section.negativeMarks),
        meta: section.meta ? JSON.stringify(section.meta) : (importedMatch?.meta ? JSON.stringify(importedMatch.meta) : null),
        order: section.order !== undefined ? Number(section.order) : index,
      }).returning();
      createdSections.push({ id: createdSection.id, label: normalizeSectionLabel(createdSection.subjectLabel ?? createdSection.title), index });
      if (importedMatch) {
        sectionIdMap.set(String(importedMatch.exportRef ?? `section-${index}`), createdSection.id);
      }
      sectionIdMap.set(String(section.exportRef ?? `section-${index}`), createdSection.id);
    }

    for (let index = 0; index < importedSections.length; index += 1) {
      const importedSection = importedSections[index] as any;
      const ref = String(importedSection.exportRef ?? `section-${index}`);
      if (sectionIdMap.has(ref)) continue;
      const importedLabel = normalizeSectionLabel(importedSection.subjectLabel ?? importedSection.title);
      const matchedCreatedSection =
        createdSections.find((section) => section.label && section.label === importedLabel) ??
        createdSections[index] ??
        createdSections[0];
      if (matchedCreatedSection) sectionIdMap.set(ref, matchedCreatedSection.id);
    }

    for (let index = 0; index < questions.length; index += 1) {
      const question = questions[index];
      const sectionId = question.sectionRef ? sectionIdMap.get(String(question.sectionRef)) ?? null : null;
      const questionType = typeof question.questionType === "string" ? question.questionType : "mcq";
      const options = normalizeArrayValue<string>(question.options, []);
      const optionImages = normalizeArrayValue<string | null>(question.optionImages, []);
      const correctAnswerMulti = normalizeArrayValue<number>(question.correctAnswerMulti, []);

      await db.insert(testQuestionsTable).values({
        testId: createdTest.id,
        sectionId,
        question: typeof question.question === "string" ? question.question : "",
        questionType,
        questionCode: typeof question.questionCode === "string" && question.questionCode.trim() ? question.questionCode.trim() : null,
        sourceType: typeof question.sourceType === "string" && question.sourceType.trim() ? question.sourceType.trim() : "manual",
        subjectLabel: typeof question.subjectLabel === "string" && question.subjectLabel.trim() ? question.subjectLabel.trim() : null,
        options: JSON.stringify(options),
        optionImages: optionImages.length > 0 ? JSON.stringify(optionImages) : null,
        correctAnswer: question.correctAnswer !== undefined && question.correctAnswer !== null ? Number(question.correctAnswer) : 0,
        correctAnswerMulti: questionType === "multi" ? JSON.stringify(correctAnswerMulti) : null,
        correctAnswerMin: question.correctAnswerMin !== undefined && question.correctAnswerMin !== null ? Number(question.correctAnswerMin) : null,
        correctAnswerMax: question.correctAnswerMax !== undefined && question.correctAnswerMax !== null ? Number(question.correctAnswerMax) : null,
        points: question.points !== undefined && question.points !== null ? Number(question.points) : 1,
        negativeMarks: question.negativeMarks !== undefined && question.negativeMarks !== null ? Number(question.negativeMarks) : 0,
        meta: question.meta ? JSON.stringify(question.meta) : null,
        solutionText: typeof question.solutionText === "string" && question.solutionText.trim() ? question.solutionText.trim() : null,
        solutionImageData: typeof question.solutionImageData === "string" && question.solutionImageData.trim() ? question.solutionImageData : null,
        order: question.order !== undefined ? Number(question.order) : index,
        imageData: typeof question.imageData === "string" && question.imageData ? question.imageData : null,
      });
    }

    const persistedSections = await db.select().from(testSectionsTable)
      .where(eq(testSectionsTable.testId, createdTest.id))
      .orderBy(asc(testSectionsTable.order));
    const syncedSections = isHtmlImport
      ? persistedSections.map((section) => ({ ...section, meta: safeParseJson(section.meta, null) }))
      : await syncTestSectionsFromTemplate(createdTest.id, createdTest.examType, persistedSections);

    return res.status(201).json({
      id: createdTest.id,
      title: createdTest.title,
      sectionCount: syncedSections.length,
      questionCount: questions.length,
      isPublished: createdTest.isPublished,
    });
  } catch (error) {
    console.error("POST /api/tests/import failed", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/tests/:id — update test
router.patch("/tests/:id", requireAuth, async (req, res) => {
  try {
    const testId = parseInt(req.params.id, 10);
    const userId = parseInt(req.cookies.userId, 10);
    const user = await getUser(userId);
    if (!user || user.role !== "admin") return res.status(403).json({ error: "Forbidden" });

    const [beforeTest] = await db.select().from(testsTable).where(eq(testsTable.id, testId));
    if (!beforeTest) return res.status(404).json({ error: "Test not found" });

    const { isPublished, title, description, examType, examHeader, examSubheader, instructions, examConfig, durationMinutes, passingScore, defaultPositiveMarks, defaultNegativeMarks, scheduledAt } = req.body;
    const updates: any = {};
    if (isPublished !== undefined) updates.isPublished = Boolean(isPublished);
    if (title) updates.title = String(title);
    if (description !== undefined) updates.description = description ? String(description) : null;
    let selectedTemplate: any = null;
    const normalizedPatchExamKey = examType !== undefined ? normalizeExamKey(examType) : null;
    if (normalizedPatchExamKey) {
      const [matchedTemplate] = await db.select().from(examTemplatesTable).where(eq(examTemplatesTable.key, normalizedPatchExamKey)).limit(1);
      selectedTemplate = matchedTemplate ?? null;
    }
    if (examType !== undefined) updates.examType = normalizedPatchExamKey ?? (examType ? String(examType) : "custom");
    if (examHeader !== undefined) updates.examHeader = examHeader ? String(examHeader) : null;
    if (examSubheader !== undefined) updates.examSubheader = examSubheader ? String(examSubheader) : null;
    if (instructions !== undefined) updates.instructions = instructions ? String(instructions) : null;
    if (examConfig !== undefined) updates.examConfig = examConfig ? JSON.stringify(examConfig) : null;
    if (durationMinutes) updates.durationMinutes = Number(durationMinutes);
    if (passingScore !== undefined) {
      updates.passingScore = passingScore === null || String(passingScore).trim() === "" ? null : Number(passingScore);
    }
    if (defaultPositiveMarks !== undefined) updates.defaultPositiveMarks = Number(defaultPositiveMarks);
    if (defaultNegativeMarks !== undefined) updates.defaultNegativeMarks = Number(defaultNegativeMarks);
    if (scheduledAt !== undefined) updates.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;

    const importedFromHtml = isHtmlImportedTestConfig(beforeTest?.examConfig);
    if (selectedTemplate && !importedFromHtml) {
      updates.examType = selectedTemplate.key;
      updates.examHeader = selectedTemplate.examHeader ?? null;
      updates.examSubheader = selectedTemplate.examSubheader ?? null;
      if (instructions === undefined) {
        updates.instructions = typeof selectedTemplate.customInstructions === "string" && selectedTemplate.customInstructions.trim()
          ? selectedTemplate.customInstructions.trim()
          : null;
      }
      if (durationMinutes === undefined) updates.durationMinutes = selectedTemplate.durationMinutes;
      if (passingScore === undefined) updates.passingScore = selectedTemplate.passingScore ?? null;
      if (defaultPositiveMarks === undefined) updates.defaultPositiveMarks = selectedTemplate.defaultPositiveMarks ?? 1;
      if (defaultNegativeMarks === undefined) updates.defaultNegativeMarks = selectedTemplate.defaultNegativeMarks ?? 0;
    }

    const [test] = await db.update(testsTable).set(updates).where(eq(testsTable.id, testId)).returning();
    const rawSections = await db.select().from(testSectionsTable)
      .where(eq(testSectionsTable.testId, testId))
      .orderBy(asc(testSectionsTable.order));
    const syncedSections = importedFromHtml
      ? rawSections.map((section) => ({ ...section, meta: safeParseJson(section.meta, null) }))
      : await syncTestSectionsFromTemplate(testId, test.examType, rawSections);

    // Notify enrolled students when a test is first published
    if (updates.isPublished === true && !beforeTest?.isPublished) {
      let studentIds: number[] = [];
      const examKey = normalizeExamKey(test.examType);
      if (examKey) {
        const students = await db.select({
          id: usersTable.id,
          subject: usersTable.subject,
          additionalExams: usersTable.additionalExams,
        }).from(usersTable).where(eq(usersTable.role, "student"));
        studentIds = students
          .filter((student) => {
            const keys = new Set<string>();
            const primary = normalizeExamKey(student.subject);
            if (primary) keys.add(primary);
            for (const exam of student.additionalExams ?? []) {
              const normalized = normalizeExamKey(exam);
              if (normalized) keys.add(normalized);
            }
            return keys.has(examKey);
          })
          .map((student) => student.id);
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

    return res.json({ ...test, sections: syncedSections });
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

    const {
      question,
      questionType = "mcq",
      sectionId,
      questionCode,
      sourceType,
      subjectLabel,
      options = [],
      optionImages,
      correctAnswer,
      correctAnswerMulti,
      correctAnswerMin,
      correctAnswerMax,
      points,
      negativeMarks,
      imageData,
      meta,
      solutionText,
      solutionImageData,
    } = req.body;
    if (!question && !imageData) return res.status(400).json({ error: "question text or image required" });

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
      question: question ? String(question) : "",
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
      solutionText: typeof solutionText === "string" && solutionText.trim() ? solutionText.trim() : null,
      solutionImageData: typeof solutionImageData === "string" && solutionImageData.trim() ? solutionImageData : null,
      order: existing.length,
      imageData: imageData ? String(imageData) : null,
    }).returning();

    return res.status(201).json(serializeTestQuestion(q, { showCorrect: true, includeSolutions: true }));
  } catch { return res.status(500).json({ error: "Internal server error" }); }
});

// PATCH /api/tests/:id/questions/:qid — update question
router.patch("/tests/:id/questions/:qid", requireAuth, async (req, res) => {
  try {
    const testId = parseInt(req.params.id, 10);
    const questionId = parseInt(req.params.qid, 10);
    const userId = parseInt(req.cookies.userId, 10);
    const user = await getUser(userId);
    if (!user || user.role !== "admin") return res.status(403).json({ error: "Forbidden" });

    const {
      question,
      questionType = "mcq",
      sectionId,
      questionCode,
      sourceType,
      subjectLabel,
      options = [],
      optionImages,
      correctAnswer,
      correctAnswerMulti,
      correctAnswerMin,
      correctAnswerMax,
      points,
      negativeMarks,
      imageData,
      meta,
      solutionText,
      solutionImageData,
    } = req.body;
    if (!question && !imageData) return res.status(400).json({ error: "question text or image required" });

    if (questionType === "multi" && (!correctAnswerMulti || !Array.isArray(correctAnswerMulti))) {
      return res.status(400).json({ error: "correctAnswerMulti (array) required for multi type" });
    }
    if (questionType === "integer" && correctAnswer === undefined && (correctAnswerMin === undefined || correctAnswerMax === undefined)) {
      return res.status(400).json({ error: "correctAnswer or correctAnswerMin+correctAnswerMax required for integer type" });
    }
    if (questionType !== "multi" && questionType !== "integer" && correctAnswer === undefined) {
      return res.status(400).json({ error: "correctAnswer required" });
    }

    const isRange = questionType === "integer" && correctAnswerMin !== undefined && correctAnswerMax !== undefined;

    const [q] = await db.update(testQuestionsTable).set({
      testId,
      sectionId: sectionId ? Number(sectionId) : null,
      questionCode: questionCode ? String(questionCode) : null,
      sourceType: sourceType ? String(sourceType) : "manual",
      subjectLabel: subjectLabel ? String(subjectLabel) : null,
      question: question ? String(question) : "",
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
      solutionText: typeof solutionText === "string" && solutionText.trim() ? solutionText.trim() : null,
      solutionImageData: typeof solutionImageData === "string" && solutionImageData.trim() ? solutionImageData : null,
      imageData: imageData ? String(imageData) : null,
    }).where(and(eq(testQuestionsTable.id, questionId), eq(testQuestionsTable.testId, testId))).returning();

    if (!q) return res.status(404).json({ error: "Question not found" });

    return res.json(serializeTestQuestion(q, { showCorrect: true, includeSolutions: true }));
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
    const testId = parseInt(req.params.id, 10);
    const userId = parseInt(req.cookies.userId, 10);
    const user = await getUser(userId);
    if (!user || user.role !== "admin") return res.status(403).json({ error: "Forbidden" });
    const sectionId = parseInt(req.params.sectionId, 10);
    const [existingSection] = await db
      .select()
      .from(testSectionsTable)
      .where(and(eq(testSectionsTable.id, sectionId), eq(testSectionsTable.testId, testId)));
    if (!existingSection) return res.status(404).json({ error: "Section not found" });
    const { title, description, subjectLabel, questionCount, marksPerQuestion, negativeMarks, meta, order } = req.body;
    if (questionCount !== undefined && questionCount !== null) {
      const linkedQuestions = await db
        .select({ id: testQuestionsTable.id })
        .from(testQuestionsTable)
        .where(and(eq(testQuestionsTable.testId, testId), eq(testQuestionsTable.sectionId, sectionId)));
      if (Number(questionCount) < linkedQuestions.length) {
        return res.status(400).json({ error: `Section already has ${linkedQuestions.length} saved questions` });
      }
    }
    const updates: any = {};
    if (title !== undefined) updates.title = String(title);
    if (description !== undefined) updates.description = description ? String(description) : null;
    if (subjectLabel !== undefined) updates.subjectLabel = subjectLabel ? String(subjectLabel) : null;
    if (questionCount !== undefined) updates.questionCount = questionCount !== null ? Number(questionCount) : null;
    if (marksPerQuestion !== undefined) updates.marksPerQuestion = marksPerQuestion !== null ? Number(marksPerQuestion) : null;
    if (negativeMarks !== undefined) updates.negativeMarks = negativeMarks !== null ? Number(negativeMarks) : null;
    if (meta !== undefined) updates.meta = meta ? JSON.stringify(meta) : null;
    if (order !== undefined) updates.order = Number(order);
    const [section] = await db
      .update(testSectionsTable)
      .set(updates)
      .where(and(eq(testSectionsTable.id, sectionId), eq(testSectionsTable.testId, testId)))
      .returning();
    if (!section) return res.status(404).json({ error: "Section not found" });
    return res.json(section);
  } catch { return res.status(500).json({ error: "Internal server error" }); }
});

// DELETE /api/tests/:id/sections/:sectionId
router.delete("/tests/:id/sections/:sectionId", requireAuth, async (req, res) => {
  try {
    const testId = parseInt(req.params.id, 10);
    const userId = parseInt(req.cookies.userId, 10);
    const user = await getUser(userId);
    if (!user || user.role !== "admin") return res.status(403).json({ error: "Forbidden" });
    const sectionId = parseInt(req.params.sectionId, 10);
    const [existingSection] = await db
      .select()
      .from(testSectionsTable)
      .where(and(eq(testSectionsTable.id, sectionId), eq(testSectionsTable.testId, testId)));
    if (!existingSection) return res.status(404).json({ error: "Section not found" });
    const linkedQuestions = await db
      .select({ id: testQuestionsTable.id })
      .from(testQuestionsTable)
      .where(and(eq(testQuestionsTable.testId, testId), eq(testQuestionsTable.sectionId, sectionId)));
    if (linkedQuestions.length > 0) {
      return res.status(400).json({ error: "Remove saved questions before deleting this section" });
    }
    await db.delete(testSectionsTable).where(and(eq(testSectionsTable.id, sectionId), eq(testSectionsTable.testId, testId)));
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

    const {
      answers,
      questionTimings,
      flaggedQuestions,
      visitedQuestionIds,
      reviewQuestionIds,
      interactionLog,
    } = req.body;
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
    const passed = test?.passingScore == null ? true : percentage >= test.passingScore;

    const [submission] = await db.insert(testSubmissionsTable).values({
      testId, studentId: userId,
      answers: JSON.stringify(answers ?? {}),
      questionTimings: questionTimings ? JSON.stringify(questionTimings) : null,
      flaggedQuestions: flaggedQuestions ? JSON.stringify(flaggedQuestions) : null,
      visitedQuestionIds: visitedQuestionIds ? JSON.stringify(visitedQuestionIds) : null,
      reviewQuestionIds: reviewQuestionIds ? JSON.stringify(reviewQuestionIds) : null,
      interactionLog: interactionLog ? JSON.stringify(interactionLog) : null,
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
      examType: testsTable.examType,
      examHeader: testsTable.examHeader,
      examSubheader: testsTable.examSubheader,
      classId: testsTable.classId, className: classesTable.title,
    }).from(testsTable).leftJoin(classesTable, eq(testsTable.classId, classesTable.id))
      .where(eq(testsTable.id, testId));
    if (!test) return res.status(404).json({ error: "Not found" });

    // Student's own submission
    const [submission] = await db.select({
      id: testSubmissionsTable.id,
      answers: testSubmissionsTable.answers,
      questionTimings: testSubmissionsTable.questionTimings,
      flaggedQuestions: testSubmissionsTable.flaggedQuestions,
      visitedQuestionIds: testSubmissionsTable.visitedQuestionIds,
      reviewQuestionIds: testSubmissionsTable.reviewQuestionIds,
      interactionLog: testSubmissionsTable.interactionLog,
      score: testSubmissionsTable.score,
      totalPoints: testSubmissionsTable.totalPoints,
      percentage: testSubmissionsTable.percentage,
      passed: testSubmissionsTable.passed,
      submittedAt: testSubmissionsTable.submittedAt,
    }).from(testSubmissionsTable)
      .where(and(eq(testSubmissionsTable.testId, testId), eq(testSubmissionsTable.studentId, userId)))
      .orderBy(desc(testSubmissionsTable.submittedAt), desc(testSubmissionsTable.id))
      .limit(1);
    if (!submission) return res.status(403).json({ error: "You have not submitted this test" });

    const questions = await db.select().from(testQuestionsTable)
      .where(eq(testQuestionsTable.testId, testId)).orderBy(testQuestionsTable.order);
    const sections = await db.select().from(testSectionsTable)
      .where(eq(testSectionsTable.testId, testId)).orderBy(testSectionsTable.order);

    // All class submissions for aggregate stats
    const allSubRows = await db.select({
      id: testSubmissionsTable.id, percentage: testSubmissionsTable.percentage,
      passed: testSubmissionsTable.passed, answers: testSubmissionsTable.answers,
      questionTimings: testSubmissionsTable.questionTimings,
      studentId: testSubmissionsTable.studentId,
      submittedAt: testSubmissionsTable.submittedAt,
    }).from(testSubmissionsTable)
      .where(eq(testSubmissionsTable.testId, testId))
      .orderBy(desc(testSubmissionsTable.submittedAt), desc(testSubmissionsTable.id));

    const latestByStudent = new Map<number, typeof allSubRows[number]>();
    for (const row of allSubRows) {
      if (!latestByStudent.has(row.studentId)) latestByStudent.set(row.studentId, row);
    }
    const allSubs = Array.from(latestByStudent.values());

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
    const myVisited: number[] = submission.visitedQuestionIds ? JSON.parse(submission.visitedQuestionIds) : [];
    const myReview: number[] = submission.reviewQuestionIds ? JSON.parse(submission.reviewQuestionIds) : [];
    const myInteractionLog = submission.interactionLog ? JSON.parse(submission.interactionLog) : [];

    // Per-question analysis
    const perQuestion = questions.map((q, idx) => {
      const answer = myAnswers[q.id] ?? myAnswers[String(q.id)];
      const isSkipped = answer === undefined || answer === null || (Array.isArray(answer) && answer.length === 0) || answer === "";
      const isCorrect = !isSkipped ? gradeQuestion(q, answer) : false;
      const myTime = myTimings[q.id] ?? myTimings[String(q.id)] ?? 0;
      const isFlagged = myFlagged.includes(q.id) || myFlagged.includes(Number(q.id));

      // Class-level stats for this question
      let classCorrectCount = 0;
      let classAttemptedCount = 0;
      const classTimings: number[] = [];
      allSubs.forEach(s => {
        const parsedAns = JSON.parse(s.answers ?? "{}");
        const ans = parsedAns[q.id] ?? parsedAns[String(q.id)];
        if (hasAnsweredQuestion(q, ans)) classAttemptedCount++;
        if (gradeQuestion(q, ans)) classCorrectCount++;
        const timings: Record<string, number> = s.questionTimings ? JSON.parse(s.questionTimings) : {};
        const t = timings[q.id] ?? timings[String(q.id)] ?? 0;
        classTimings.push(Number(t) || 0);
      });
      const classWrongCount = Math.max(0, classAttemptedCount - classCorrectCount);
      const classSkippedCount = Math.max(0, totalSubs - classAttemptedCount);
      const classSuccessRate = totalSubs > 0 ? Math.round(classCorrectCount / totalSubs * 100) : 0;
      const classAvgTime = classTimings.length > 0 ? Math.round(classTimings.reduce((a, b) => a + b, 0) / classTimings.length) : 0;

      return {
        id: q.id, order: idx + 1,
        question: q.question, questionType: q.questionType ?? "mcq",
        options: q.options ? JSON.parse(q.options) : [],
        optionImages: q.optionImages ? JSON.parse(q.optionImages) : null,
        imageData: q.imageData ?? null,
        sectionId: q.sectionId ?? null,
        subjectLabel: q.subjectLabel ?? null,
        meta: q.meta ? JSON.parse(q.meta) : null,
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
        classCorrectCount,
        classAttemptedCount,
        classWrongCount,
        classSkippedCount,
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
        questionTimings: myTimings,
        flaggedQuestions: myFlagged,
        visitedQuestionIds: myVisited,
        reviewQuestionIds: myReview,
        interactionLog: myInteractionLog,
      },
      sections: sections.map((section) => ({
        ...section,
        meta: section.meta ? JSON.parse(section.meta) : null,
      })),
      classStats: { totalSubs, classAvg, classPassRate, rank, percentile },
      perQuestion,
      insights: { weakQuestions, hardQuestions, timeHogs, fasterThanClass, slowerThanClass },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/tests/:id/solutions — section-wise solutions after submission
router.get("/tests/:id/solutions", requireAuth, async (req, res) => {
  try {
    const testId = parseInt(req.params.id, 10);
    const userId = parseInt(req.cookies.userId, 10);
    const sectionId = req.query.sectionId ? parseInt(String(req.query.sectionId), 10) : null;
    const user = await getUser(userId);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const [test] = await db.select({
      id: testsTable.id,
      title: testsTable.title,
      examHeader: testsTable.examHeader,
      examSubheader: testsTable.examSubheader,
    }).from(testsTable).where(eq(testsTable.id, testId));
    if (!test) return res.status(404).json({ error: "Test not found" });

    const isAdmin = user.role === "admin" || user.role === "super_admin";
    if (!isAdmin) {
      const [submission] = await db.select({ id: testSubmissionsTable.id })
        .from(testSubmissionsTable)
        .where(and(eq(testSubmissionsTable.testId, testId), eq(testSubmissionsTable.studentId, userId)))
        .orderBy(desc(testSubmissionsTable.submittedAt), desc(testSubmissionsTable.id))
        .limit(1);
      if (!submission) {
        return res.status(403).json({ error: "You have not submitted this test" });
      }
    }

    const sections = await db.select().from(testSectionsTable)
      .where(eq(testSectionsTable.testId, testId))
      .orderBy(asc(testSectionsTable.order));

    const filteredSections = sectionId
      ? sections.filter((section) => section.id === sectionId)
      : sections;

    const questions = await db.select().from(testQuestionsTable)
      .where(eq(testQuestionsTable.testId, testId))
      .orderBy(asc(testQuestionsTable.order));

    const questionsBySection = new Map<number | null, any[]>();
    for (const question of questions) {
      const key = question.sectionId ?? null;
      const existing = questionsBySection.get(key) ?? [];
      existing.push(question);
      questionsBySection.set(key, existing);
    }

    const serializedSections = [];

    for (const section of filteredSections) {
      const sectionQuestions = questionsBySection.get(section.id) ?? [];
      const items = [];

      for (const question of sectionQuestions) {
        const optionStats = computeOptionSelectionStats(question, allSubmissions);
        items.push({
          ...serializeTestQuestion(question, { showCorrect: true, includeSolutions: true }),
          solutionText: question.solutionText?.trim() || null,
          solutionImageData: question.solutionImageData ?? null,
          solutionSource: question.solutionText?.trim() || question.solutionImageData?.trim() ? "teacher" : "none",
          optionSelectionCounts: optionStats.optionCounts,
          optionSelectionPercentages: optionStats.optionSelectionPercentages,
        });
      }

      serializedSections.push({
        id: section.id,
        title: section.title,
        subjectLabel: section.subjectLabel ?? null,
        order: section.order ?? 0,
        items,
      });
    }

    return res.json({
      test,
      sections: serializedSections,
    });
  } catch (error) {
    console.error("GET /api/tests/:id/solutions failed", error);
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
