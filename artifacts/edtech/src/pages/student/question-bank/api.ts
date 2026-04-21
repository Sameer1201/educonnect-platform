import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type QuestionType = "mcq" | "multi" | "integer";

export type QuestionProgress = {
  attemptCount: number;
  correctCount: number;
  incorrectCount: number;
  firstAttemptedAt: string;
  lastAttemptedAt: string;
  solvedAt: string | null;
  lastIsCorrect: boolean;
};

export type StudentQuestionBankQuestion = {
  id: number;
  question: string;
  questionType: QuestionType;
  options: string[];
  optionImages?: Array<string | null>;
  correctAnswer: number | null;
  correctAnswerMulti: number[];
  correctAnswerMin?: number | null;
  correctAnswerMax?: number | null;
  explanation?: string | null;
  topicTag?: string | null;
  difficulty?: string | null;
  points?: number | null;
  imageData?: string | null;
  progress?: QuestionProgress | null;
  isSaved?: boolean;
};

export type StudentQuestionBankChapter = {
  id: number;
  title: string;
  description?: string | null;
  targetQuestions?: number | null;
  questions: StudentQuestionBankQuestion[];
};

export type StudentQuestionBankSubject = {
  id: number;
  title: string;
  description?: string | null;
  isLocked?: boolean;
  chapters: StudentQuestionBankChapter[];
};

export type StudentQuestionBankExamSummary = {
  key: string;
  label: string;
  isLocked?: boolean;
  subjectCount: number;
  chapterCount: number;
  questionCount: number;
  targetQuestionCount?: number;
  pendingQuestionCount?: number;
  attemptedQuestionCount?: number;
};

export type StudentQuestionBankExamResponse = {
  exam: { key: string; label: string; isLocked?: boolean };
  subjects: StudentQuestionBankSubject[];
  savedBucket: StudentQuestionBankQuestion[];
};

const PENDING_PREVIEW_GATE_EXAM: StudentQuestionBankExamResponse = {
  exam: { key: "gate-preview", label: "GATE", isLocked: false },
  subjects: [
    {
      id: 101,
      title: "Engineering Mathematics",
      description: "Preview subject unlocked for review mode.",
      isLocked: false,
      chapters: [
        {
          id: 1001,
          title: "Linear Algebra",
          description: "Matrices, eigenvalues, and vector spaces",
          targetQuestions: 18,
          questions: [
            {
              id: 10001,
              question: "<p>If A is a 2x2 identity matrix, then det(A) equals</p>",
              questionType: "mcq",
              options: ["0", "1", "2", "4"],
              optionImages: [null, null, null, null],
              correctAnswer: 1,
              correctAnswerMulti: [],
              explanation: "The determinant of the identity matrix is always 1.",
              topicTag: "Matrices",
              difficulty: "easy",
              points: 1,
              imageData: null,
              progress: null,
              isSaved: false,
            },
            {
              id: 10002,
              question: "<p>The rank of a 3x3 zero matrix is</p>",
              questionType: "mcq",
              options: ["0", "1", "2", "3"],
              optionImages: [null, null, null, null],
              correctAnswer: 0,
              correctAnswerMulti: [],
              explanation: "A zero matrix has rank 0 because all rows are linearly dependent.",
              topicTag: "Rank",
              difficulty: "easy",
              points: 1,
              imageData: null,
              progress: null,
              isSaved: false,
            },
          ],
        },
        {
          id: 1002,
          title: "Calculus",
          description: "Differentiation, maxima-minima, and integration",
          targetQuestions: 20,
          questions: [
            {
              id: 10003,
              question: "<p>If f(x)=x<sup>2</sup>, then f'(x) equals</p>",
              questionType: "mcq",
              options: ["x", "2x", "x<sup>2</sup>", "2"],
              optionImages: [null, null, null, null],
              correctAnswer: 1,
              correctAnswerMulti: [],
              explanation: "The derivative of x squared is 2x.",
              topicTag: "Differentiation",
              difficulty: "easy",
              points: 1,
              imageData: null,
              progress: null,
              isSaved: false,
            },
            {
              id: 10004,
              question: "<p>The integral of 1 with respect to x over [0,1] is</p>",
              questionType: "mcq",
              options: ["0", "1", "2", "Undefined"],
              optionImages: [null, null, null, null],
              correctAnswer: 1,
              correctAnswerMulti: [],
              explanation: "Area under y=1 from 0 to 1 is 1.",
              topicTag: "Integration",
              difficulty: "medium",
              points: 1,
              imageData: null,
              progress: null,
              isSaved: false,
            },
          ],
        },
      ],
    },
    {
      id: 102,
      title: "Network Theory",
      description: "Locked until verification is approved.",
      isLocked: true,
      chapters: [
        { id: 1003, title: "Circuit Laws", description: null, targetQuestions: 16, questions: [] },
        { id: 1004, title: "Network Theorems", description: null, targetQuestions: 14, questions: [] },
      ],
    },
    {
      id: 103,
      title: "Signals and Systems",
      description: "Locked until verification is approved.",
      isLocked: true,
      chapters: [
        { id: 1005, title: "Signals", description: null, targetQuestions: 15, questions: [] },
        { id: 1006, title: "LTI Systems", description: null, targetQuestions: 18, questions: [] },
      ],
    },
    {
      id: 104,
      title: "Control Systems",
      description: "Locked until verification is approved.",
      isLocked: true,
      chapters: [
        { id: 1007, title: "Time Response", description: null, targetQuestions: 12, questions: [] },
        { id: 1008, title: "Frequency Response", description: null, targetQuestions: 13, questions: [] },
      ],
    },
  ],
  savedBucket: [],
};

const PENDING_PREVIEW_EXAM_SUMMARIES: StudentQuestionBankExamSummary[] = [
  {
    key: "gate-preview",
    label: "GATE",
    isLocked: false,
    subjectCount: PENDING_PREVIEW_GATE_EXAM.subjects.length,
    chapterCount: PENDING_PREVIEW_GATE_EXAM.subjects.reduce((sum, subject) => sum + subject.chapters.length, 0),
    questionCount: PENDING_PREVIEW_GATE_EXAM.subjects.reduce(
      (sum, subject) => sum + subject.chapters.reduce((chapterSum, chapter) => chapterSum + chapter.questions.length, 0),
      0,
    ),
    attemptedQuestionCount: 2,
  },
  {
    key: "ese-preview",
    label: "ESE",
    isLocked: true,
    subjectCount: 8,
    chapterCount: 42,
    questionCount: 420,
    attemptedQuestionCount: 0,
  },
  {
    key: "iitjam-preview",
    label: "IIT JAM",
    isLocked: true,
    subjectCount: 6,
    chapterCount: 28,
    questionCount: 320,
    attemptedQuestionCount: 0,
  },
];

export function getPendingPreviewQuestionBankExams() {
  return PENDING_PREVIEW_EXAM_SUMMARIES;
}

export function getPendingPreviewQuestionBankExam(examKey: string): StudentQuestionBankExamResponse | null {
  if (examKey === PENDING_PREVIEW_GATE_EXAM.exam.key) {
    return PENDING_PREVIEW_GATE_EXAM;
  }

  const summary = PENDING_PREVIEW_EXAM_SUMMARIES.find((exam) => exam.key === examKey);
  if (!summary) return null;

  return {
    exam: {
      key: summary.key,
      label: summary.label,
      isLocked: true,
    },
    subjects: [],
    savedBucket: [],
  };
}

export function useStudentQuestionBankExams() {
  return useQuery<StudentQuestionBankExamSummary[]>({
    queryKey: ["student-question-bank-exams"],
    queryFn: () => api.get("/question-bank/exams"),
    staleTime: 60_000,
  });
}

export function useStudentQuestionBankExam(examKey: string) {
  return useQuery<StudentQuestionBankExamResponse>({
    queryKey: ["student-question-bank-exam", examKey],
    queryFn: () => api.get(`/question-bank/exams/${examKey}`),
    enabled: Boolean(examKey),
    staleTime: 30_000,
  });
}

export function getQuestionAttempted(question: StudentQuestionBankQuestion) {
  return (question.progress?.attemptCount ?? 0) > 0;
}

export function getQuestionSolved(question: StudentQuestionBankQuestion) {
  return Boolean(question.progress?.solvedAt || question.progress?.lastIsCorrect);
}

export function formatDifficultyLabel(value?: string | null) {
  const normalized = String(value ?? "medium").trim().toLowerCase();
  if (normalized === "easy") return "Easy";
  if (normalized === "hard") return "Hard";
  return "Medium";
}

export function getQuestionDifficultyTone(value?: string | null) {
  const label = formatDifficultyLabel(value);
  if (label === "Easy") return "bg-emerald-100 text-emerald-700";
  if (label === "Hard") return "bg-red-100 text-red-700";
  return "bg-amber-100 text-amber-700";
}

export function getChapterDifficultyLabel(chapter: StudentQuestionBankChapter) {
  const questions = chapter.questions ?? [];
  if (questions.length === 0) return "Medium";

  const score = questions.reduce((total, question) => {
    const label = formatDifficultyLabel(question.difficulty);
    if (label === "Easy") return total + 1;
    if (label === "Hard") return total + 3;
    return total + 2;
  }, 0);

  const average = score / questions.length;
  if (average >= 2.4) return "Hard";
  if (average <= 1.4) return "Easy";
  return "Medium";
}
