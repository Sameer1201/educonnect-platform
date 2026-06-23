import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatExamDisplayName } from "@/lib/exam-display";

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
  isLocked?: boolean;
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

function isGateExamKey(examKey?: string | null) {
  return String(examKey ?? "").trim().toLowerCase() === "gate";
}

function normalizeExamSummary(exam: StudentQuestionBankExamSummary): StudentQuestionBankExamSummary {
  return {
    ...exam,
    label: formatExamDisplayName(exam.label || exam.key) || exam.label,
  };
}

function normalizeExamResponse(data: StudentQuestionBankExamResponse): StudentQuestionBankExamResponse {
  return {
    ...data,
    exam: {
      ...data.exam,
      label: formatExamDisplayName(data.exam.label || data.exam.key) || data.exam.label,
    },
  };
}

export function applyPendingPreviewLocksToExamSummaries(exams: StudentQuestionBankExamSummary[]) {
  return exams.map((exam) => ({
    ...normalizeExamSummary(exam),
    isLocked: !isGateExamKey(exam.key),
  }));
}

export function applyPendingPreviewLocksToExam(data: StudentQuestionBankExamResponse): StudentQuestionBankExamResponse {
  const normalized = normalizeExamResponse(data);

  if (!isGateExamKey(normalized.exam.key)) {
    return {
      ...normalized,
      exam: {
        ...normalized.exam,
        isLocked: true,
      },
      subjects: normalized.subjects.map((subject) => ({
        ...subject,
        isLocked: true,
        chapters: subject.chapters.map((chapter) => ({
          ...chapter,
          isLocked: true,
        })),
      })),
    };
  }

  return {
    ...normalized,
    exam: {
      ...normalized.exam,
      isLocked: false,
    },
    subjects: normalized.subjects.map((subject, subjectIndex) => {
      const isUnlockedSubject = subjectIndex === 0;

      return {
        ...subject,
        isLocked: !isUnlockedSubject,
        chapters: subject.chapters.map((chapter, chapterIndex) => ({
          ...chapter,
          isLocked: !isUnlockedSubject || chapterIndex !== 0,
        })),
      };
    }),
  };
}

export function useStudentQuestionBankExams(enabled = true) {
  return useQuery<StudentQuestionBankExamSummary[]>({
    queryKey: ["student-question-bank-exams"],
    queryFn: async () => {
      const exams = await api.get<StudentQuestionBankExamSummary[]>("/question-bank/exams");
      return exams.map(normalizeExamSummary);
    },
    enabled,
    staleTime: 60_000,
  });
}

export function useStudentQuestionBankExam(examKey: string, enabled = true) {
  return useQuery<StudentQuestionBankExamResponse>({
    queryKey: ["student-question-bank-exam", examKey],
    queryFn: async () => normalizeExamResponse(await api.get<StudentQuestionBankExamResponse>(`/question-bank/exams/${examKey}`)),
    enabled: enabled && Boolean(examKey),
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
