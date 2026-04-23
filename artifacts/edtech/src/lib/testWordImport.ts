type ImportedQuestionType = "mcq" | "multi" | "integer";
type ImportedDifficulty = "easy" | "moderate" | "tough";

export interface ImportedTestBundle {
  version: number;
  exportedAt: string;
  source: {
    testId: number;
    title: string;
    examType: string;
  };
  test: {
    title: string;
    description: string | null;
    examType: string;
    examHeader: string | null;
    examSubheader: string | null;
    instructions: string | null;
    examConfig: Record<string, unknown>;
    durationMinutes: number;
    passingScore: null;
    defaultPositiveMarks: number | null;
    defaultNegativeMarks: number | null;
    scheduledAt: null;
    sections: Array<Record<string, unknown>>;
    questions: Array<Record<string, unknown>>;
  };
}

export type TestWordImageAssets = Record<string, string>;

type ActiveField =
  | { kind: "description" }
  | { kind: "instructions" }
  | { kind: "question" }
  | { kind: "explanation" }
  | { kind: "sectionDescription"; sectionKey: string }
  | { kind: "option"; index: number };

interface WorkingQuestion {
  sectionTitle: string;
  question: string;
  questionCode: string;
  questionType: string;
  difficulty: string;
  points: string;
  negativeMarks: string;
  subjectName: string;
  chapterName: string;
  topicTag: string;
  explanation: string;
  explanationImageToken: string;
  answer: string;
  answerMin: string;
  answerMax: string;
  questionImageToken: string;
  options: Map<number, string>;
  optionImageTokens: Map<number, string>;
}

interface SectionEntry {
  exportRef: string;
  title: string;
  description: string | null;
  subjectLabel: string;
  questionCount: number;
  marksPerQuestion: number | null;
  negativeMarks: number | null;
  order: number;
}

interface ParseContext {
  title: string;
  description: string;
  instructions: string;
  durationMinutes: number;
  examHeader: string;
  examSubheader: string;
  currentSectionTitle: string;
  currentSectionMarks: number | null;
  currentSectionNegative: number | null;
}

const SEPARATOR_RE = /^[-_=*]{3,}$/;
const OPTION_RE = /^option\s*([a-z]|\d+)\s*:\s*(.*)$/i;
const OPTION_IMAGE_RE = /^option\s*([a-z]|\d+)\s*image\s*:\s*(.*)$/i;
const KEY_VALUE_RE = /^(title|description|instructions|duration|header|subheader|section|section description|section marks|section negative|question|question no|question image|type|difficulty|marks|negative|subject|chapter|topic|explanation|explanation image|answer|answer min|answer max)\s*:\s*(.*)$/i;
const IMAGE_TOKEN_RE = /^\[\[image:([a-z0-9-]+)\]\]$/i;

function createWorkingQuestion(sectionTitle: string): WorkingQuestion {
  return {
    sectionTitle,
    question: "",
    questionCode: "",
    questionType: "mcq",
    difficulty: "moderate",
    points: "",
    negativeMarks: "",
    subjectName: "",
    chapterName: "",
    topicTag: "",
    explanation: "",
    explanationImageToken: "",
    answer: "",
    answerMin: "",
    answerMax: "",
    questionImageToken: "",
    options: new Map<number, string>(),
    optionImageTokens: new Map<number, string>(),
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

function normalizeQuestionType(value: string): ImportedQuestionType {
  const normalized = normalizeLookupKey(value);
  if (normalized === "msq" || normalized.includes("multi") || normalized.includes("multiple")) return "multi";
  if (normalized === "nat" || normalized.includes("integer") || normalized.includes("numeric") || normalized.includes("numerical")) return "integer";
  return "mcq";
}

function normalizeDifficulty(value: string): ImportedDifficulty {
  const normalized = normalizeLookupKey(value);
  if (normalized === "easy") return "easy";
  if (normalized === "hard" || normalized === "tough" || normalized === "advanced" || normalized === "expert") return "tough";
  return "moderate";
}

function defaultIdealTimeSeconds(difficulty: ImportedDifficulty) {
  if (difficulty === "easy") return 60;
  if (difficulty === "tough") return 180;
  return 90;
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

function parseNumericValue(value: string) {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseIntegerLike(value: string) {
  const parsed = parseNumericValue(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

function parseAnswerIndex(token: string, options: string[]) {
  const trimmed = normalizeWhitespace(token);
  if (!trimmed) return null;

  const optionIndex = optionLabelToIndex(trimmed);
  if (optionIndex != null && optionIndex >= 0 && optionIndex < options.length) return optionIndex;

  const matchedIndex = options.findIndex((option) => normalizeLookupKey(option) === normalizeLookupKey(trimmed));
  return matchedIndex >= 0 ? matchedIndex : null;
}

function resolveImageValue(value: string, assets?: TestWordImageAssets) {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed) return null;
  if (/^data:image\//i.test(trimmed)) return trimmed;
  const tokenMatch = trimmed.match(IMAGE_TOKEN_RE);
  if (!tokenMatch) return trimmed;
  const assetKey = tokenMatch[1];
  const assetValue = assetKey ? assets?.[assetKey] : null;
  if (!assetValue) {
    throw new Error(`Image token ${trimmed} was not found in Word Setup assets.`);
  }
  return assetValue;
}

function ensureSection(sections: Map<string, SectionEntry>, title: string, defaults?: { marks?: number | null; negative?: number | null }) {
  const safeTitle = title.trim() || "Imported Section";
  const key = normalizeLookupKey(safeTitle);
  if (!sections.has(key)) {
    sections.set(key, {
      exportRef: `section-${sections.size + 1}`,
      title: safeTitle,
      description: null,
      subjectLabel: safeTitle,
      questionCount: 0,
      marksPerQuestion: defaults?.marks ?? null,
      negativeMarks: defaults?.negative ?? null,
      order: sections.size,
    });
  }

  const section = sections.get(key)!;
  if (section.marksPerQuestion == null && defaults?.marks != null) section.marksPerQuestion = defaults.marks;
  if (section.negativeMarks == null && defaults?.negative != null) section.negativeMarks = defaults.negative;
  return section;
}

export function buildTestWordTemplateText() {
  return [
    "Title: Communication Systems Chapter Test",
    "Description: Type your test directly in this word-style setup.",
    "Duration: 60",
    "Header: COMMON PG ENTRANCE TEST 2026",
    "Subheader: COMMUNICATION SYSTEMS",
    "Instructions: Read each question carefully before answering.",
    "",
    "Section: Communication Systems",
    "Section Marks: 1",
    "Section Negative: 0.33",
    "",
    "Question No: Q01",
    "Question: A delta modulation system is mainly used for?",
    "Type: mcq",
    "Difficulty: easy",
    "Marks: 1",
    "Negative: 0.33",
    "Subject: Communication Systems",
    "Chapter: Sampling",
    "Topic: Delta Modulation",
    "Option A: Analog to digital conversion",
    "Option B: Power amplification",
    "Option C: Antenna matching",
    "Option D: Phase locking",
    "Answer: A",
    "Explanation: Delta modulation is a simple analog-to-digital conversion technique.",
    "---",
    "Question No: Q02",
    "Question: Select the line coding techniques.",
    "Type: multi",
    "Difficulty: moderate",
    "Subject: Communication Systems",
    "Chapter: Digital Communication",
    "Topic: Line Coding",
    "Option A: NRZ",
    "Option B: RZ",
    "Option C: PCM",
    "Option D: Manchester",
    "Answer: A,B,D",
    "Explanation: NRZ, RZ, and Manchester are line coding schemes.",
    "---",
    "Question No: Q03",
    "Question: Enter the Nyquist minimum sampling multiple.",
    "Type: integer",
    "Difficulty: easy",
    "Subject: Communication Systems",
    "Chapter: Sampling",
    "Topic: Nyquist Criterion",
    "Answer: 2",
    "Explanation: The minimum sampling frequency is twice the highest frequency.",
  ].join("\n");
}

export function parseTestWordText(rawText: string, assets?: TestWordImageAssets): ImportedTestBundle {
  const lines = rawText
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\u200b/g, "").trimEnd());

  const sections = new Map<string, SectionEntry>();
  const questions: Array<Record<string, unknown>> = [];
  const context: ParseContext = {
    title: "",
    description: "",
    instructions: "",
    durationMinutes: 60,
    examHeader: "",
    examSubheader: "",
    currentSectionTitle: "Imported Section",
    currentSectionMarks: null,
    currentSectionNegative: null,
  };

  let currentQuestion: WorkingQuestion | null = null;
  let activeField: ActiveField | null = null;

  const finalizeQuestion = () => {
    if (!currentQuestion) return;
    const question = currentQuestion;
    const hasContent = currentQuestion.question.trim() || currentQuestion.options.size > 0 || currentQuestion.answer.trim();
    if (!hasContent) {
      currentQuestion = null;
      activeField = null;
      return;
    }

    const section = ensureSection(sections, question.sectionTitle || context.currentSectionTitle, {
      marks: context.currentSectionMarks,
      negative: context.currentSectionNegative,
    });

    const questionType = normalizeQuestionType(question.questionType);
    const difficulty = normalizeDifficulty(question.difficulty);
    const optionEntries = Array.from(question.options.entries()).sort((left, right) => left[0] - right[0]);
    const questionText = question.question.trim();
    const questionImage = resolveImageValue(question.questionImageToken, assets);
    if (!questionText && !questionImage) {
      throw new Error(`A question in ${section.title} needs "Question:" text or "Question Image:".`);
    }

    const optionAssets = optionEntries.map(([index, value]) => ({
      text: normalizeWhitespace(value),
      image: resolveImageValue(question.optionImageTokens.get(index) ?? "", assets),
    }));
    const options = optionAssets.map((entry) => entry.text);
    const optionImages = optionAssets.map((entry) => entry.image);
    const points = parseNumericValue(question.points) ?? section.marksPerQuestion ?? 1;
    const negativeMarks = parseNumericValue(question.negativeMarks) ?? section.negativeMarks ?? 0;

    if (questionType !== "integer" && optionAssets.filter((entry) => entry.text || entry.image).length < 2) {
      throw new Error(`"${(questionText || question.questionCode || "Question").slice(0, 60)}" in ${section.title} needs at least 2 options.`);
    }

    const questionRecord: Record<string, unknown> = {
      question: questionText,
      questionType,
      sectionRef: section.exportRef,
      questionCode: question.questionCode.trim() || `Q${String(questions.length + 1).padStart(2, "0")}`,
      sourceType: "word-setup",
      subjectLabel: section.subjectLabel,
      options: questionType === "integer" ? [] : options,
      optionImages: questionType === "integer" || optionImages.every((entry) => !entry) ? [] : optionImages,
      points,
      negativeMarks,
      meta: {
        difficulty,
        estimatedTimeSeconds: defaultIdealTimeSeconds(difficulty),
        ...(question.subjectName.trim() ? { subjectName: question.subjectName.trim() } : {}),
        ...(question.chapterName.trim() ? { chapterName: question.chapterName.trim() } : {}),
        ...(question.topicTag.trim() ? { topicTag: question.topicTag.trim() } : {}),
        importedFromWordSetup: true,
      },
      solutionText: question.explanation.trim() || null,
      solutionImageData: resolveImageValue(question.explanationImageToken, assets),
      order: questions.length,
      imageData: questionImage,
    };

    if (questionType === "mcq") {
      const correctAnswer = parseAnswerIndex(question.answer, options);
      if (correctAnswer == null) {
        throw new Error(`"${questionText.slice(0, 60)}" in ${section.title} needs a valid single answer.`);
      }
      questionRecord.correctAnswer = correctAnswer;
    } else if (questionType === "multi") {
      const answerIndexes = Array.from(
        new Set(
          question.answer
            .split(/[,&/]/)
            .map((token) => parseAnswerIndex(token, options))
            .filter((value): value is number => value != null),
        ),
      );
      if (answerIndexes.length === 0) {
        throw new Error(`"${questionText.slice(0, 60)}" in ${section.title} needs at least one valid multi answer.`);
      }
      questionRecord.correctAnswerMulti = answerIndexes;
    } else {
      const exactAnswer = parseIntegerLike(question.answer);
      const answerMin = parseIntegerLike(question.answerMin);
      const answerMax = parseIntegerLike(question.answerMax);
      if (exactAnswer == null && (answerMin == null || answerMax == null || answerMin > answerMax)) {
        throw new Error(`"${questionText.slice(0, 60)}" in ${section.title} needs Answer or Answer Min/Max.`);
      }
      if (exactAnswer != null) {
        questionRecord.correctAnswer = exactAnswer;
      } else {
        questionRecord.correctAnswerMin = answerMin;
        questionRecord.correctAnswerMax = answerMax;
      }
    }

    questions.push(questionRecord);
    section.questionCount += 1;
    currentQuestion = null;
    activeField = null;
  };

  const ensureQuestion = () => {
    if (!currentQuestion) currentQuestion = createWorkingQuestion(context.currentSectionTitle);
    return currentQuestion;
  };

  const applyContinuation = (value: string) => {
    if (!activeField) return;
    if (activeField.kind === "description") {
      context.description = appendFieldValue(context.description, value);
      return;
    }
    if (activeField.kind === "instructions") {
      context.instructions = appendFieldValue(context.instructions, value);
      return;
    }
    if (activeField.kind === "sectionDescription") {
      const section = sections.get(activeField.sectionKey);
      if (section) section.description = appendFieldValue(section.description ?? "", value);
      return;
    }
    if (!currentQuestion) return;
    if (activeField.kind === "question") {
      currentQuestion.question = appendFieldValue(currentQuestion.question, value);
      return;
    }
    if (activeField.kind === "explanation") {
      currentQuestion.explanation = appendFieldValue(currentQuestion.explanation, value);
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
      if (optionIndex == null) throw new Error(`Could not understand option label "${optionMatch[1] ?? ""}".`);
      const question = ensureQuestion();
      question.options.set(optionIndex, normalizeWhitespace(optionMatch[2] ?? ""));
      activeField = { kind: "option", index: optionIndex };
      continue;
    }

    const optionImageMatch = line.match(OPTION_IMAGE_RE);
    if (optionImageMatch) {
      const optionIndex = optionLabelToIndex(optionImageMatch[1] ?? "");
      if (optionIndex == null) throw new Error(`Could not understand option image label "${optionImageMatch[1] ?? ""}".`);
      const question = ensureQuestion();
      question.optionImageTokens.set(optionIndex, normalizeWhitespace(optionImageMatch[2] ?? ""));
      activeField = null;
      continue;
    }

    const match = line.match(KEY_VALUE_RE);
    if (match) {
      const rawKey = normalizeLookupKey(match[1] ?? "");
      const rawValue = normalizeWhitespace(match[2] ?? "");

      if (rawKey === "title") {
        finalizeQuestion();
        context.title = rawValue;
        activeField = null;
        continue;
      }
      if (rawKey === "description") {
        finalizeQuestion();
        context.description = rawValue;
        activeField = { kind: "description" };
        continue;
      }
      if (rawKey === "instructions") {
        finalizeQuestion();
        context.instructions = rawValue;
        activeField = { kind: "instructions" };
        continue;
      }
      if (rawKey === "duration") {
        finalizeQuestion();
        context.durationMinutes = Math.max(1, Number.parseInt(rawValue, 10) || 60);
        activeField = null;
        continue;
      }
      if (rawKey === "header") {
        finalizeQuestion();
        context.examHeader = rawValue;
        activeField = null;
        continue;
      }
      if (rawKey === "subheader") {
        finalizeQuestion();
        context.examSubheader = rawValue;
        activeField = null;
        continue;
      }
      if (rawKey === "section") {
        finalizeQuestion();
        context.currentSectionTitle = rawValue || "Imported Section";
        ensureSection(sections, context.currentSectionTitle, {
          marks: context.currentSectionMarks,
          negative: context.currentSectionNegative,
        });
        activeField = null;
        continue;
      }
      if (rawKey === "section description") {
        finalizeQuestion();
        const section = ensureSection(sections, context.currentSectionTitle, {
          marks: context.currentSectionMarks,
          negative: context.currentSectionNegative,
        });
        section.description = rawValue || null;
        activeField = { kind: "sectionDescription", sectionKey: normalizeLookupKey(section.title) };
        continue;
      }
      if (rawKey === "section marks") {
        finalizeQuestion();
        const parsed = parseNumericValue(rawValue);
        context.currentSectionMarks = parsed;
        ensureSection(sections, context.currentSectionTitle, { marks: parsed, negative: context.currentSectionNegative });
        activeField = null;
        continue;
      }
      if (rawKey === "section negative") {
        finalizeQuestion();
        const parsed = parseNumericValue(rawValue);
        context.currentSectionNegative = parsed;
        ensureSection(sections, context.currentSectionTitle, { marks: context.currentSectionMarks, negative: parsed });
        activeField = null;
        continue;
      }

      const question = ensureQuestion();
      if (rawKey === "question") {
        if (question.question.trim() || question.answer.trim() || question.options.size > 0) {
          finalizeQuestion();
          ensureQuestion().question = rawValue;
        } else {
          question.question = rawValue;
        }
        question.sectionTitle = context.currentSectionTitle;
        activeField = { kind: "question" };
        continue;
      }
      if (rawKey === "question no") {
        question.questionCode = rawValue;
        activeField = null;
        continue;
      }
      if (rawKey === "question image") {
        question.questionImageToken = rawValue;
        activeField = null;
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
      if (rawKey === "marks") {
        question.points = rawValue;
        activeField = null;
        continue;
      }
      if (rawKey === "negative") {
        question.negativeMarks = rawValue;
        activeField = null;
        continue;
      }
      if (rawKey === "subject") {
        question.subjectName = rawValue;
        activeField = null;
        continue;
      }
      if (rawKey === "chapter") {
        question.chapterName = rawValue;
        activeField = null;
        continue;
      }
      if (rawKey === "topic") {
        question.topicTag = rawValue;
        activeField = null;
        continue;
      }
      if (rawKey === "explanation") {
        question.explanation = rawValue;
        activeField = { kind: "explanation" };
        continue;
      }
      if (rawKey === "explanation image") {
        question.explanationImageToken = rawValue;
        activeField = null;
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

  const finalTitle = context.title.trim() || "Imported Test";
  const exportedSections = Array.from(sections.values())
    .sort((left, right) => left.order - right.order)
    .map((section) => ({
      exportRef: section.exportRef,
      title: section.title,
      description: section.description,
      subjectLabel: section.subjectLabel,
      questionCount: section.questionCount,
      marksPerQuestion: section.marksPerQuestion,
      negativeMarks: section.negativeMarks,
      meta: {
        preferredQuestionType: "mcq",
        importedFromWordSetup: true,
      },
      order: section.order,
    }));

  if (questions.length === 0) {
    throw new Error("No valid questions were found in the Word Setup text.");
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: {
      testId: 0,
      title: finalTitle,
      examType: "custom",
    },
    test: {
      title: finalTitle,
      description: context.description.trim() || "Imported from in-app Word Setup",
      examType: "custom",
      examHeader: context.examHeader.trim() || finalTitle,
      examSubheader: context.examSubheader.trim() || "Imported",
      instructions: context.instructions.trim() || null,
      examConfig: {
        importedFromWordSetup: true,
      },
      durationMinutes: context.durationMinutes,
      passingScore: null,
      defaultPositiveMarks: null,
      defaultNegativeMarks: null,
      scheduledAt: null,
      sections: exportedSections,
      questions,
    },
  };
}
