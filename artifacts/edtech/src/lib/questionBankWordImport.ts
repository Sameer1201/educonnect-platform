export type QuestionBankImportedQuestionType = "mcq" | "multi" | "integer";

export interface QuestionBankImportedQuestion {
  question: string;
  questionType: QuestionBankImportedQuestionType;
  options: string[];
  optionImages: Array<string | null>;
  correctAnswer: number | null;
  correctAnswerMulti: number[];
  correctAnswerMin: number | null;
  correctAnswerMax: number | null;
  explanation: string | null;
  topicTag: string | null;
  difficulty: "easy" | "medium" | "hard";
  points: number;
  imageData: null;
}

export interface QuestionBankImportedChapter {
  title: string;
  description: null;
  questions: QuestionBankImportedQuestion[];
}

export interface QuestionBankImportedSubject {
  title: string;
  chapters: QuestionBankImportedChapter[];
}

export interface QuestionBankWordImportBundle {
  subjects: QuestionBankImportedSubject[];
  questionCount: number;
  warnings: string[];
}

type ActiveField =
  | { kind: "question" }
  | { kind: "explanation" }
  | { kind: "topicTag" }
  | { kind: "option"; index: number };

interface WorkingQuestion {
  question: string;
  questionType: string;
  difficulty: string;
  points: string;
  topicTag: string;
  explanation: string;
  answer: string;
  answerMin: string;
  answerMax: string;
  options: Map<number, string>;
}

interface TemplateArgs {
  examLabel?: string | null;
  subjectTitle?: string | null;
  chapterTitle?: string | null;
}

const SEPARATOR_RE = /^[-_=*]{3,}$/;
const OPTION_RE = /^option\s*([a-z]|\d+)\s*:\s*(.*)$/i;
const KEY_VALUE_RE = /^(subject|chapter|question|type|difficulty|points|marks|topic|tag|explanation|answer|answer min|answer max)\s*:\s*(.*)$/i;

function createWorkingQuestion(): WorkingQuestion {
  return {
    question: "",
    questionType: "mcq",
    difficulty: "medium",
    points: "1",
    topicTag: "",
    explanation: "",
    answer: "",
    answerMin: "",
    answerMax: "",
    options: new Map<number, string>(),
  };
}

function normalizeWhitespace(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

function normalizeLookupKey(value: string) {
  return normalizeWhitespace(value).toLowerCase();
}

function appendFieldValue(current: string, next: string) {
  const cleaned = next.trim();
  if (!cleaned) return current;
  return current ? `${current}\n${cleaned}` : cleaned;
}

function optionLabelToIndex(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed - 1 : null;
  }
  const char = trimmed[0]?.toUpperCase();
  if (!char || char < "A" || char > "Z") return null;
  return char.charCodeAt(0) - 65;
}

function normalizeDifficulty(value: string): "easy" | "medium" | "hard" {
  const normalized = normalizeLookupKey(value);
  if (normalized === "easy") return "easy";
  if (normalized === "hard" || normalized === "tough") return "hard";
  return "medium";
}

function normalizeQuestionType(value: string): QuestionBankImportedQuestionType {
  const normalized = normalizeLookupKey(value);
  if (normalized === "multi" || normalized === "multi-select" || normalized === "multiselect" || normalized === "multiple") {
    return "multi";
  }
  if (normalized === "integer" || normalized === "int" || normalized === "nat" || normalized === "numeric") {
    return "integer";
  }
  return "mcq";
}

function parseAnswerToken(token: string, options: string[]) {
  const trimmed = normalizeWhitespace(token);
  if (!trimmed) return null;

  const byIndex = optionLabelToIndex(trimmed);
  if (byIndex != null && byIndex >= 0 && byIndex < options.length) {
    return byIndex;
  }

  const matchedIndex = options.findIndex((option) => normalizeLookupKey(option) === normalizeLookupKey(trimmed));
  return matchedIndex >= 0 ? matchedIndex : null;
}

function parseIntegerLike(value: string) {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed) return null;
  if (!/^-?\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseIntegerRange(answer: string, answerMin: string, answerMax: string) {
  const parsedMin = parseIntegerLike(answerMin);
  const parsedMax = parseIntegerLike(answerMax);
  if (parsedMin != null && parsedMax != null && parsedMin <= parsedMax) {
    return { min: parsedMin, max: parsedMax };
  }

  const normalizedAnswer = normalizeWhitespace(answer);
  if (!normalizedAnswer) return { min: null, max: null };
  const rangeMatch = normalizedAnswer.match(/^(-?\d+)\s*(?:to|-)\s*(-?\d+)$/i);
  if (!rangeMatch) return { min: null, max: null };

  const low = Number.parseInt(rangeMatch[1] ?? "", 10);
  const high = Number.parseInt(rangeMatch[2] ?? "", 10);
  if (!Number.isFinite(low) || !Number.isFinite(high) || low > high) {
    return { min: null, max: null };
  }
  return { min: low, max: high };
}

function buildImportedQuestion(draft: WorkingQuestion, context: { subjectTitle: string; chapterTitle: string }) {
  const question = draft.question.trim();
  if (!question) {
    throw new Error(`A question in ${context.subjectTitle} / ${context.chapterTitle} is missing "Question:" text.`);
  }

  const questionType = normalizeQuestionType(draft.questionType);
  const optionEntries = Array.from(draft.options.entries()).sort((left, right) => left[0] - right[0]);
  const options = optionEntries.map(([, value]) => normalizeWhitespace(value)).filter(Boolean);
  const difficulty = normalizeDifficulty(draft.difficulty);
  const points = Math.max(1, Number.parseInt(draft.points, 10) || 1);
  const topicTag = draft.topicTag.trim() ? draft.topicTag.trim() : null;
  const explanation = draft.explanation.trim() ? draft.explanation.trim() : null;

  if (questionType !== "integer" && options.length < 2) {
    throw new Error(`"${question.slice(0, 60)}" in ${context.chapterTitle} needs at least 2 options.`);
  }

  if (questionType === "mcq") {
    const correctAnswer = parseAnswerToken(draft.answer, options);
    if (correctAnswer == null) {
      throw new Error(`"${question.slice(0, 60)}" in ${context.chapterTitle} needs a valid single "Answer:".`);
    }

    return {
      question,
      questionType,
      options,
      optionImages: options.map(() => null),
      correctAnswer,
      correctAnswerMulti: [],
      correctAnswerMin: null,
      correctAnswerMax: null,
      explanation,
      topicTag,
      difficulty,
      points,
      imageData: null,
    } satisfies QuestionBankImportedQuestion;
  }

  if (questionType === "multi") {
    const tokens = draft.answer
      .split(/[,&/]/)
      .map((token) => normalizeWhitespace(token))
      .filter(Boolean);
    const answerIndexes = Array.from(new Set(tokens.map((token) => parseAnswerToken(token, options)).filter((value): value is number => value != null)));

    if (answerIndexes.length === 0) {
      throw new Error(`"${question.slice(0, 60)}" in ${context.chapterTitle} needs a valid multi-select "Answer:".`);
    }

    return {
      question,
      questionType,
      options,
      optionImages: options.map(() => null),
      correctAnswer: null,
      correctAnswerMulti: answerIndexes,
      correctAnswerMin: null,
      correctAnswerMax: null,
      explanation,
      topicTag,
      difficulty,
      points,
      imageData: null,
    } satisfies QuestionBankImportedQuestion;
  }

  const exactAnswer = parseIntegerLike(draft.answer);
  const range = parseIntegerRange(draft.answer, draft.answerMin, draft.answerMax);
  if (exactAnswer == null && (range.min == null || range.max == null)) {
    throw new Error(`"${question.slice(0, 60)}" in ${context.chapterTitle} needs "Answer:" or "Answer Min/Max:".`);
  }

  return {
    question,
    questionType,
    options: [],
    optionImages: [],
    correctAnswer: exactAnswer,
    correctAnswerMulti: [],
    correctAnswerMin: exactAnswer == null ? range.min : null,
    correctAnswerMax: exactAnswer == null ? range.max : null,
    explanation,
    topicTag,
    difficulty,
    points,
    imageData: null,
  } satisfies QuestionBankImportedQuestion;
}

export function parseQuestionBankWordText(
  rawText: string,
  options?: { defaultSubjectTitle?: string | null },
): QuestionBankWordImportBundle {
  const lines = rawText
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\u200b/g, "").trimEnd());

  const subjects = new Map<string, QuestionBankImportedSubject>();
  let currentSubjectTitle = options?.defaultSubjectTitle?.trim() ?? "";
  let currentChapterTitle = "";
  let currentQuestion: WorkingQuestion | null = null;
  let activeField: ActiveField | null = null;
  let questionCount = 0;

  const finalizeQuestion = () => {
    if (!currentQuestion) return;
    const hasContent = currentQuestion.question.trim() || currentQuestion.options.size > 0 || currentQuestion.answer.trim();
    if (!hasContent) {
      currentQuestion = null;
      activeField = null;
      return;
    }

    const subjectTitle = currentSubjectTitle.trim() || options?.defaultSubjectTitle?.trim() || "";
    if (!subjectTitle) {
      throw new Error("Each document block needs a Subject: line before the first question.");
    }
    if (!currentChapterTitle.trim()) {
      throw new Error(`Each question in ${subjectTitle} needs a Chapter: line before the first question.`);
    }

    const subjectKey = normalizeLookupKey(subjectTitle);
    if (!subjects.has(subjectKey)) {
      subjects.set(subjectKey, { title: subjectTitle, chapters: [] });
    }
    const subject = subjects.get(subjectKey)!;

    const chapterKey = normalizeLookupKey(currentChapterTitle);
    let chapter = subject.chapters.find((item) => normalizeLookupKey(item.title) === chapterKey);
    if (!chapter) {
      chapter = { title: currentChapterTitle.trim(), description: null, questions: [] };
      subject.chapters.push(chapter);
    }

    chapter.questions.push(buildImportedQuestion(currentQuestion, { subjectTitle: subject.title, chapterTitle: chapter.title }));
    questionCount += 1;
    currentQuestion = null;
    activeField = null;
  };

  const ensureQuestion = () => {
    if (!currentQuestion) currentQuestion = createWorkingQuestion();
    return currentQuestion;
  };

  const applyContinuation = (value: string) => {
    if (!activeField || !currentQuestion) return;
    if (activeField.kind === "question") {
      currentQuestion.question = appendFieldValue(currentQuestion.question, value);
      return;
    }
    if (activeField.kind === "explanation") {
      currentQuestion.explanation = appendFieldValue(currentQuestion.explanation, value);
      return;
    }
    if (activeField.kind === "topicTag") {
      currentQuestion.topicTag = appendFieldValue(currentQuestion.topicTag, value);
      return;
    }
    const existing = currentQuestion.options.get(activeField.index) ?? "";
    currentQuestion.options.set(activeField.index, appendFieldValue(existing, value));
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (SEPARATOR_RE.test(line)) {
      finalizeQuestion();
      continue;
    }

    const optionMatch = line.match(OPTION_RE);
    if (optionMatch) {
      const optionIndex = optionLabelToIndex(optionMatch[1] ?? "");
      if (optionIndex == null) {
        throw new Error(`Could not understand option label "${optionMatch[1] ?? ""}".`);
      }
      const question = ensureQuestion();
      question.options.set(optionIndex, normalizeWhitespace(optionMatch[2] ?? ""));
      activeField = { kind: "option", index: optionIndex };
      continue;
    }

    const keyValueMatch = line.match(KEY_VALUE_RE);
    if (keyValueMatch) {
      const rawKey = normalizeLookupKey(keyValueMatch[1] ?? "");
      const rawValue = normalizeWhitespace(keyValueMatch[2] ?? "");

      if (rawKey === "subject") {
        finalizeQuestion();
        currentSubjectTitle = rawValue || options?.defaultSubjectTitle?.trim() || "";
        currentChapterTitle = "";
        continue;
      }
      if (rawKey === "chapter") {
        finalizeQuestion();
        currentChapterTitle = rawValue;
        continue;
      }

      const question = ensureQuestion();
      if (rawKey === "question") {
        if (question.question.trim() || question.options.size > 0 || question.answer.trim()) {
          finalizeQuestion();
          ensureQuestion().question = rawValue;
        } else {
          question.question = rawValue;
        }
        activeField = { kind: "question" };
        continue;
      }
      if (rawKey === "type") {
        question.questionType = rawValue;
        activeField = null;
        continue;
      }
      if (rawKey === "difficulty") {
        question.difficulty = rawValue;
        activeField = null;
        continue;
      }
      if (rawKey === "points" || rawKey === "marks") {
        question.points = rawValue;
        activeField = null;
        continue;
      }
      if (rawKey === "topic" || rawKey === "tag") {
        question.topicTag = rawValue;
        activeField = { kind: "topicTag" };
        continue;
      }
      if (rawKey === "explanation") {
        question.explanation = rawValue;
        activeField = { kind: "explanation" };
        continue;
      }
      if (rawKey === "answer") {
        question.answer = rawValue;
        activeField = null;
        continue;
      }
      if (rawKey === "answer min") {
        question.answerMin = rawValue;
        activeField = null;
        continue;
      }
      if (rawKey === "answer max") {
        question.answerMax = rawValue;
        activeField = null;
        continue;
      }
    }

    applyContinuation(line);
  }

  finalizeQuestion();

  const bundle = Array.from(subjects.values()).filter((subject) => subject.chapters.some((chapter) => chapter.questions.length > 0));
  if (bundle.length === 0 || questionCount === 0) {
    throw new Error("No valid questions were found. Use the Subject / Chapter / Question format before importing.");
  }

  return {
    subjects: bundle,
    questionCount,
    warnings: [],
  };
}

export function buildQuestionBankWordTemplateText({
  examLabel,
  subjectTitle,
  chapterTitle,
}: TemplateArgs = {}) {
  const safeExamLabel = examLabel?.trim() || "RankPulse Question Bank";
  const safeSubjectTitle = subjectTitle?.trim() || "Sample Subject";
  const safeChapterTitle = chapterTitle?.trim() || "Sample Chapter";

  return [
    `${safeExamLabel} typing template`,
    "",
    "Rules:",
    "1. Keep Subject and Chapter before question blocks.",
    "2. Separate questions with ---",
    "3. Use Type: mcq, multi, or integer",
    "4. For multi-select use Answer: A,C",
    "5. For integer range use Answer Min and Answer Max",
    "",
    `Subject: ${safeSubjectTitle}`,
    `Chapter: ${safeChapterTitle}`,
    "",
    "Question: Which theorem is valid for linear bilateral networks?",
    "Type: mcq",
    "Difficulty: medium",
    "Points: 1",
    "Topic: Fundamentals",
    "Option A: Maximum power transfer theorem",
    "Option B: Reciprocity theorem",
    "Option C: Millman theorem",
    "Option D: Norton's theorem",
    "Answer: B",
    "Explanation: Reciprocity theorem applies to linear bilateral networks.",
    "---",
    "Question: Select the passive elements.",
    "Type: multi",
    "Difficulty: easy",
    "Points: 1",
    "Topic: Elements",
    "Option A: Resistor",
    "Option B: Capacitor",
    "Option C: Operational amplifier",
    "Option D: Inductor",
    "Answer: A,B,D",
    "Explanation: Resistor, capacitor, and inductor are passive elements.",
    "---",
    "Question: Enter the pole count of a first-order network.",
    "Type: integer",
    "Difficulty: easy",
    "Points: 1",
    "Topic: Basics",
    "Answer: 1",
    "Explanation: A first-order network has one pole.",
  ].join("\n");
}
