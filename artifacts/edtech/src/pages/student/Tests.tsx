import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { RichQuestionContent } from "@/components/ui/rich-question-content";
import { TcsCalculator } from "@/components/student/TcsCalculator";
import PendingVerificationDialog from "@/components/student/PendingVerificationDialog";
import StudentPreviewLockBanner from "@/components/student/StudentPreviewLockBanner";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { isStudentFeatureLocked, isStudentPendingVerification } from "@/lib/student-access";
import { filterReviewBucketEntries, getReviewBucketRemovedQuestionIds } from "@/lib/reviewBucket";
import { buildStudentUnlockPath } from "@/lib/student-unlock";
import {
  ClipboardList, Clock, CheckCircle2, AlertCircle, BookOpen,
  Calculator, PanelRightOpen,
  ChevronDown, ChevronLeft, ChevronRight, HelpCircle, Info, PlayCircle, X, Search, FileText, Eraser, BookmarkPlus, ArrowRight
} from "lucide-react";
import { differenceInDays, format } from "date-fns";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const TEST_DRAFT_PREFIX = "educonnect-test-draft";

type QuestionType = "mcq" | "multi" | "integer";
type AnswerValue = number | number[] | string;
type PaletteStatus = "not-visited" | "not-answered" | "answered" | "review" | "answered-review";
type TestCategory = "mock" | "subject-wise" | "multi-subject";

interface TestItem {
  id: number; title: string; description: string | null; durationMinutes: number;
  examHeader?: string | null; examSubheader?: string | null;
  passingScore: number | null; scheduledAt: string | null; className: string | null;
  subjectName?: string | null; chapterName?: string | null; alreadySubmitted: boolean;
}
type StudentTestCardStatus = "upcoming" | "active" | "completed";
interface Question {
  id: number; question: string; questionType: QuestionType; options: string[];
  optionImages?: (string | null)[] | null;
  points: number; negativeMarks?: number | null; order: number; imageData?: string | null;
  sectionId?: number | null;
  correctAnswer?: number; correctAnswerMulti?: number[] | null;
  correctAnswerMin?: number | null; correctAnswerMax?: number | null;
}
interface SubmissionData {
  score: number; totalPoints: number; percentage: number; passed: boolean; submittedAt: string;
  answers: string;
  questionTimings?: Record<string, number> | null;
  flaggedQuestions?: number[] | null;
  visitedQuestionIds?: number[] | null;
  reviewQuestionIds?: number[] | null;
  interactionLog?: InteractionLogEntry[] | null;
}
interface TestSectionItem {
  id: number;
  title: string;
  subjectLabel?: string | null;
  order: number;
  questionCount?: number | null;
  marksPerQuestion?: number | null;
  negativeMarks?: number | null;
}
interface TestDetail {
  id: number; title: string; description: string | null; durationMinutes: number;
  examHeader?: string | null; examSubheader?: string | null;
  instructions?: string | null;
  examConfig?: Record<string, unknown> | null;
  passingScore: number | null; questions: Question[]; sections?: TestSectionItem[]; submission: SubmissionData | null;
  className?: string | null; subjectName?: string | null; chapterName?: string | null;
}

interface SavedTestDraft {
  answers: Record<number, AnswerValue>;
  timeLeft: number;
  currentQuestionIndex: number;
  visitedQuestionIds: number[];
  reviewQuestionIds: number[];
  questionTimings: Record<number, number>;
  interactionLog: InteractionLogEntry[];
  showInstructions: boolean;
}

interface InteractionLogEntry {
  at: number;
  questionId: number;
  sectionLabel: string;
  action: "open" | "answer" | "clear" | "review" | "save";
  answerSnapshot?: AnswerValue | null;
  reviewState?: "marked" | "removed";
}
interface SubmitAttemptPayload {
  answers?: Record<number, AnswerValue>;
  questionTimings?: Record<number, number>;
  visitedQuestionIds?: number[];
  reviewQuestionIds?: number[];
  interactionLog?: InteractionLogEntry[];
  isAuto?: boolean;
}

type TestPreviewAction = "result" | "resume" | "start";
type MobileViewportState = {
  isMobile: boolean;
  isPortrait: boolean;
};
type ScreenWithOptionalOrientation = Screen & {
  orientation?: {
    lock?: (orientation: "landscape" | "portrait" | "landscape-primary" | "landscape-secondary" | "portrait-primary" | "portrait-secondary" | "natural" | "any") => Promise<void>;
    unlock?: () => void;
    type?: string;
  };
};

function getMobileViewportState(): MobileViewportState {
  if (typeof window === "undefined") {
    return { isMobile: false, isPortrait: false };
  }
  return {
    isMobile: window.matchMedia("(max-width: 1023px)").matches,
    isPortrait: window.matchMedia("(orientation: portrait)").matches,
  };
}

function getDefaultInstructionItems(durationMinutes: number) {
  return [
    `The duration of the examination is ${durationMinutes} minutes. The countdown timer at the top right-hand corner of your screen displays the remaining time.`,
    "When the timer reaches zero, the examination will end automatically and your responses will be submitted.",
    "The screen is divided into two panels. The panel on the left shows the questions one at a time and the panel on the right has the Question Palette.",
    "Click on Save & Next to save your answer and move to the next question.",
    "Click on Mark for Review & Next to mark the current question for review and continue.",
    "Click on a question number in the Question Palette to navigate directly without auto-saving the current question.",
    "Use Clear Response to remove the selected answer from the current question.",
    "MCQ uses circular selection, MSQ uses square selection, and integer questions use the numeric input area.",
  ];
}

function extractAdditionalInstructionItems(storedInstructions: string | null | undefined, durationMinutes: number) {
  if (!storedInstructions?.trim()) return [];
  const defaultItems = getDefaultInstructionItems(durationMinutes);
  const allItems = storedInstructions
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const matchesDefaultPrefix =
    allItems.length >= defaultItems.length &&
    defaultItems.every((item, index) => allItems[index] === item);
  return matchesDefaultPrefix ? allItems.slice(defaultItems.length) : allItems;
}

function getCalculatorEnabledFromExamConfig(value: unknown) {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      return Boolean(parsed?.calculatorEnabled);
    } catch {
      return false;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Boolean((value as Record<string, unknown>).calculatorEnabled);
}

function normalizeExamConfigObject(value: unknown) {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeTestCategory(value: unknown): TestCategory | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "mock" || normalized === "mock-test") return "mock";
  if (normalized === "subject-wise" || normalized === "subject wise" || normalized === "subject") return "subject-wise";
  if (normalized === "multi-subject" || normalized === "multi subject" || normalized === "multi-subject-wise") return "multi-subject";
  return null;
}

function getTestCategoryLabel(value: TestCategory) {
  if (value === "subject-wise") return "Subject-wise Test";
  if (value === "multi-subject") return "Multi-subject Test";
  return "Mock Test";
}

function getTestCategoryTone(value: TestCategory) {
  if (value === "subject-wise") {
    return {
      pill: "border-[#BAE6FD] bg-[#F0F9FF] text-[#0369A1]",
      chip: "bg-[#E0F2FE] text-[#075985]",
    };
  }
  if (value === "multi-subject") {
    return {
      pill: "border-[#DDD6FE] bg-[#F5F3FF] text-[#6D28D9]",
      chip: "bg-[#EDE9FE] text-[#5B21B6]",
    };
  }
  return {
    pill: "border-[#FED7AA] bg-[#FFF7ED] text-[#C2410C]",
    chip: "bg-[#FFEDD5] text-[#9A3412]",
  };
}

function getStudentVisibleTestDescription(description: string | null | undefined) {
  if (typeof description !== "string") return null;
  const trimmed = description.trim();
  if (!trimmed) return null;
  if (/^imported from saved html\s*:/i.test(trimmed)) return null;
  return trimmed;
}

function getResolvedTestCategory(
  test: Pick<TestItem, "title" | "description" | "examHeader" | "examSubheader" | "subjectName" | "chapterName">,
  detail?: Pick<TestDetail, "examConfig" | "sections"> | null,
): TestCategory {
  const stored = normalizeTestCategory(normalizeExamConfigObject(detail?.examConfig).testCategory);
  if (stored) return stored;

  const text = [
    test.title,
    test.description,
    test.examHeader,
    test.examSubheader,
  ].filter(Boolean).join(" ").toLowerCase();

  if (/multi[\s-]?subject|combined subject/.test(text)) return "multi-subject";
  if (/subject[\s-]?wise|chapter[\s-]?wise|chapter test/.test(text)) return "subject-wise";
  if (/mock|grand test|full test|full syllabus/.test(text)) return "mock";

  const sectionLabels = new Set(
    (detail?.sections ?? [])
      .map((section) => section.subjectLabel?.trim() || section.title?.trim() || "")
      .map((value) => value.toLowerCase().replace(/\s+/g, " ").trim())
      .filter((value) => value && !/^section\b/.test(value)),
  );

  if (test.chapterName?.trim() || test.subjectName?.trim()) return "subject-wise";
  if (sectionLabels.size > 1) return "multi-subject";
  return "mock";
}

function getNumericAnswerValue(answer: AnswerValue | undefined): string {
  if (answer === undefined || answer === null) return "";
  return String(answer);
}

function hasMeaningfulNumericAnswer(answer: AnswerValue | undefined): boolean {
  const value = getNumericAnswerValue(answer).trim();
  return value !== "" && value !== "-" && value !== "." && value !== "-.";
}

function cloneAnswerValue(answer: AnswerValue | undefined): AnswerValue | undefined {
  return Array.isArray(answer) ? [...answer] : answer;
}

function getAnswerSnapshot(answer: AnswerValue | null | undefined): AnswerValue | null {
  if (answer === undefined || answer === null) return null;
  return cloneAnswerValue(answer) ?? null;
}

const PENDING_PREVIEW_TESTS: TestItem[] = [
  {
    id: -101,
    title: "GATE 2026 Grand Preview Test",
    description: "Sample preview values visible until verification is approved.",
    durationMinutes: 180,
    passingScore: 60,
    scheduledAt: null,
    className: "Preview mode",
    subjectName: "General Aptitude",
    chapterName: null,
    alreadySubmitted: false,
  },
  {
    id: -102,
    title: "Communication Systems Chapter Test",
    description: "Preview-only test card for verification pending students.",
    durationMinutes: 60,
    passingScore: 40,
    scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    className: "Preview mode",
    subjectName: "Communication Systems",
    chapterName: "Digital Modulation",
    alreadySubmitted: false,
  },
  {
    id: -103,
    title: "Signals & Systems Practice Result",
    description: "Sample completed attempt shown in preview mode.",
    durationMinutes: 45,
    passingScore: 35,
    scheduledAt: null,
    className: "Preview mode",
    subjectName: "Signals & Systems",
    chapterName: "Fourier Transform",
    alreadySubmitted: true,
  },
];

const PENDING_PREVIEW_TEST_QUESTION_COUNTS: Record<number, number> = {
  [-101]: 65,
  [-102]: 20,
  [-103]: 15,
};

const PENDING_PREVIEW_TEST_RESULTS: Record<number, {
  answeredCount: number;
  percentage: number;
  score: number;
  totalPoints: number;
  submittedAt: string;
}> = {
  [-103]: {
    answeredCount: 14,
    percentage: 68,
    score: 20.5,
    totalPoints: 30,
    submittedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
};

function cloneAnswerRecord(answerRecord?: Record<number, AnswerValue> | null): Record<number, AnswerValue> {
  if (!answerRecord) return {};
  return Object.entries(answerRecord).reduce<Record<number, AnswerValue>>((acc, [questionId, answer]) => {
    const cloned = cloneAnswerValue(answer);
    if (cloned !== undefined) {
      acc[Number(questionId)] = cloned;
    }
    return acc;
  }, {});
}

function syncQuestionAnswerFromSource(
  answerRecord: Record<number, AnswerValue>,
  questionId: number,
  sourceRecord: Record<number, AnswerValue>,
): Record<number, AnswerValue> {
  const next = { ...answerRecord };
  if (Object.prototype.hasOwnProperty.call(sourceRecord, questionId)) {
    const cloned = cloneAnswerValue(sourceRecord[questionId]);
    if (cloned !== undefined) {
      next[questionId] = cloned;
    }
  } else {
    delete next[questionId];
  }
  return next;
}

function getNegativeMark(question: Question): string {
  return Number(question.negativeMarks ?? 0).toFixed(2).replace(/\.00$/, "");
}

function getStudentTestSubject(test: TestItem) {
  return (
    test.subjectName?.trim()
      || test.chapterName?.trim()
      || test.className?.trim()
      || test.examSubheader?.trim()
      || "General"
  );
}

function getStudentTestStatus(test: TestItem): StudentTestCardStatus {
  if (test.alreadySubmitted) return "completed";
  if (test.scheduledAt && new Date(test.scheduledAt).getTime() > Date.now()) return "upcoming";
  return "active";
}

function getStudentTestAccent(subject: string) {
  const value = subject.toLowerCase();
  if (value.includes("chem")) {
    return {
      line: "bg-[#8B5CF6]",
      dot: "bg-[#8B5CF6]",
      pill: "border-[#DDD6FE] bg-[#F5F3FF] text-[#6D28D9]",
      button: "bg-[#8B5CF6] hover:bg-[#7C3AED] text-white",
    };
  }
  if (value.includes("math")) {
    return {
      line: "bg-[#F97316]",
      dot: "bg-[#F97316]",
      pill: "border-[#FED7AA] bg-[#FFF7ED] text-[#C2410C]",
      button: "bg-[#F97316] hover:bg-[#EA580C] text-white",
    };
  }
  if (value.includes("phys")) {
    return {
      line: "bg-[#3B82F6]",
      dot: "bg-[#3B82F6]",
      pill: "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]",
      button: "bg-[#3B82F6] hover:bg-[#2563EB] text-white",
    };
  }
  if (value.includes("aptitude")) {
    return {
      line: "bg-[#F97316]",
      dot: "bg-[#F97316]",
      pill: "border-[#FDBA74] bg-[#FFF7ED] text-[#C2410C]",
      button: "bg-[#F97316] hover:bg-[#EA580C] text-white",
    };
  }
  if (value.includes("tech") || value.includes("core") || value.includes("math")) {
    return {
      line: "bg-[#2563EB]",
      dot: "bg-[#2563EB]",
      pill: "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]",
      button: "bg-[#2563EB] hover:bg-[#1D4ED8] text-white",
    };
  }
  if (value.includes("reason")) {
    return {
      line: "bg-[#0F766E]",
      dot: "bg-[#0F766E]",
      pill: "border-[#99F6E4] bg-[#F0FDFA] text-[#0F766E]",
      button: "bg-[#0F766E] hover:bg-[#115E59] text-white",
    };
  }
  return {
    line: "bg-[#6D28D9]",
    dot: "bg-[#6D28D9]",
    pill: "border-[#DDD6FE] bg-[#F5F3FF] text-[#6D28D9]",
    button: "bg-[#F97316] hover:bg-[#EA580C] text-white",
  };
}

function StudentTestsStatsBar({
  total,
  upcoming,
  active,
  completed,
  averageScore,
}: {
  total: number;
  upcoming: number;
  active: number;
  completed: number;
  averageScore: number | null;
}) {
  const positiveAverageScore = averageScore == null ? 0 : Math.max(0, averageScore);
  const totalTests = Math.max(total, 1);
  const cards = [
    {
      label: "Total Tests",
      rawValue: total,
      value: total,
      accent: "bg-[#F97316]",
      line: "#F97316",
      glow: "bg-[#FFF7ED]",
      kind: "stack" as const,
    },
    {
      label: "Upcoming",
      rawValue: upcoming,
      value: upcoming,
      accent: "bg-[#3B82F6]",
      line: "#3B82F6",
      glow: "bg-[#EFF6FF]",
      kind: "progress" as const,
      progress: upcoming / totalTests,
    },
    {
      label: "Ongoing",
      rawValue: active,
      value: active,
      accent: "bg-[#F59E0B]",
      line: "#F59E0B",
      glow: "bg-[#FFFBEB]",
      kind: "progress" as const,
      progress: active / totalTests,
    },
    {
      label: "Completed",
      rawValue: completed,
      value: completed,
      accent: "bg-[#10B981]",
      line: "#10B981",
      glow: "bg-[#ECFDF5]",
      kind: "progress" as const,
      progress: completed / totalTests,
    },
    {
      label: "Avg. Score",
      rawValue: positiveAverageScore,
      value: averageScore == null ? "--" : `${Math.round(averageScore)}%`,
      accent: "bg-[#8B5CF6]",
      line: "#8B5CF6",
      glow: "bg-[#F5F3FF]",
      kind: "progress" as const,
      progress: positiveAverageScore / 100,
    },
  ];

  const totalSegments = [
    { color: "#3B82F6", value: upcoming },
    { color: "#F59E0B", value: active },
    { color: "#10B981", value: completed },
  ];

  const buildTotalRing = () => {
    if (total <= 0) {
      return "conic-gradient(#E5E7EB 0 100%)";
    }

    let offset = 0;
    const stops: string[] = [];
    totalSegments.forEach((segment) => {
      const share = (segment.value / total) * 100;
      if (share <= 0) return;
      stops.push(`${segment.color} ${offset}% ${offset + share}%`);
      offset += share;
    });

    if (offset < 100) {
      stops.push(`#E5E7EB ${offset}% 100%`);
    }

    return `conic-gradient(${stops.join(", ")})`;
  };

  const renderCardGraphic = (card: (typeof cards)[number]) => {
    if (card.kind === "stack") {
      return (
        <div className={`mt-0.5 flex h-12 w-[74px] items-center justify-between rounded-[16px] px-2 ${card.glow}`}>
          <div
            className="relative h-10 w-10 rounded-full"
            style={{ background: buildTotalRing() }}
          >
            <div className="absolute inset-[5px] rounded-full bg-white" />
          </div>
          <div className="flex flex-col gap-1">
            {totalSegments.map((segment) => (
              <span
                key={segment.color}
                className="h-2 w-3.5 rounded-full"
                style={{ backgroundColor: segment.value > 0 ? segment.color : "#E5E7EB", opacity: segment.value > 0 ? 1 : 0.7 }}
              />
            ))}
          </div>
        </div>
      );
    }

    const clampedProgress = Math.max(0, Math.min(card.progress, 1));

    return (
      <div className={`mt-0.5 flex h-12 w-[74px] items-center justify-center rounded-[16px] px-2 ${card.glow}`}>
        <div
          className="relative h-10 w-10 rounded-full"
          style={{
            background: `conic-gradient(${card.line} 0 ${Math.max(clampedProgress * 100, clampedProgress > 0 ? 8 : 0)}%, #E5E7EB ${Math.max(
              clampedProgress * 100,
              clampedProgress > 0 ? 8 : 0,
            )}% 100%)`,
          }}
        >
          <div className="absolute inset-[5px] rounded-full bg-white" />
          <div className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold text-[#475569]">
            {Math.round(clampedProgress * 100)}%
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className="relative w-full overflow-hidden rounded-[18px] border border-[#E5E7EB] bg-white px-3 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.05)] sm:rounded-[20px] sm:px-4"
        >
          <div className={`absolute left-0 top-0 h-full w-1 ${card.accent}`} />
          <div className="flex items-start justify-between gap-3 pl-2">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-[12px] font-medium text-[#6B7280] sm:text-[13px]">{card.label}</p>
                {card.label === "Ongoing" && card.rawValue > 0 && (
                  <span className="relative inline-flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#F59E0B] opacity-35" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />
                  </span>
                )}
              </div>
              <p className="mt-1 text-[19px] font-bold tracking-tight text-[#0F172A] sm:text-[22px]">{card.value}</p>
            </div>
            {renderCardGraphic(card)}
          </div>
        </div>
      ))}
    </div>
  );
}

function StudentTestSeriesCard({
  test,
  status,
  questionCount,
  detail,
  hasSavedDraft,
  locked = false,
  onPrimaryAction,
}: {
  test: TestItem;
  status: StudentTestCardStatus;
  questionCount: number | null;
  detail?: TestDetail | null;
  hasSavedDraft?: boolean;
  locked?: boolean;
  onPrimaryAction: () => void;
}) {
  const subject = getStudentTestSubject(test);
  const accent = getStudentTestAccent(subject);
  const testCategory = getResolvedTestCategory(test, detail);
  const categoryTone = getTestCategoryTone(testCategory);
  const isCompleted = status === "completed";
  const isUpcoming = status === "upcoming";
  const daysUntil = isUpcoming && test.scheduledAt
    ? differenceInDays(new Date(test.scheduledAt), new Date())
    : 0;
  const visibleDescription = getStudentVisibleTestDescription(test.description);

  const completionPercent = detail?.submission?.percentage != null ? Math.round(detail.submission.percentage) : null;
  const scoredMarks = detail?.submission?.score;
  const totalMarks = detail?.submission?.totalPoints;
  const formatMarkValue = (value: number) => {
    const rounded = Math.round(value * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, "");
  };
  const completedSummary = scoredMarks != null && totalMarks != null && completionPercent != null
    ? `${formatMarkValue(scoredMarks)}/${formatMarkValue(totalMarks)} (${completionPercent}%)`
    : completionPercent != null
      ? `${completionPercent}%`
      : "Completed";

  const statusLabel = isCompleted
    ? completedSummary
    : isUpcoming
      ? (daysUntil > 1 ? `${daysUntil} days left` : daysUntil === 1 ? "1 day left" : "Upcoming")
      : "Ongoing";
  const statusClass = isCompleted
    ? "border-[#BBF7D0] bg-[#F0FDF4] text-[#166534]"
    : isUpcoming
      ? "border-[#DBEAFE] bg-[#EFF6FF] text-[#1D4ED8]"
      : "border-[#FED7AA] bg-[#FFF7ED] text-[#C2410C]";

  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-[26px] border border-[#E5E7EB] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(15,23,42,0.10)]">
      <div className={`h-1.5 w-full ${accent.line}`} />
      <div className="flex h-full flex-col p-4 sm:p-6">
        <div className="mb-3 flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`h-2.5 w-2.5 rounded-full ${accent.dot}`} />
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6B7280]">{subject}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start sm:justify-end">
            <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold ${categoryTone.pill}`}>
              {getTestCategoryLabel(testCategory)}
            </span>
            {locked ? (
              <span className="inline-flex shrink-0 whitespace-nowrap items-center rounded-full border border-[#F5D0A5] bg-[#FFF7E8] px-3 py-1 text-xs font-bold text-[#B45309]">
                Locked
              </span>
            ) : null}
            <span className={`inline-flex shrink-0 whitespace-nowrap items-center rounded-full border px-3 py-1 text-xs font-bold ${statusClass}`}>
              {!isCompleted && !isUpcoming && <span className="mr-2 h-1.5 w-1.5 rounded-full bg-[#F59E0B] shadow-[0_0_0_2px_rgba(245,158,11,0.14)]" />}
              {statusLabel}
            </span>
          </div>
        </div>

        <h3 className="line-clamp-2 text-[17px] font-bold leading-tight text-[#0F172A] sm:text-[19px]">{test.title}</h3>
        <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-[#6B7280] sm:min-h-[48px] sm:text-[13px] sm:leading-6">
          {visibleDescription || `${subject} practice test with exam-style timing and section flow.`}
        </p>

        <div className="mt-5 flex flex-wrap gap-2.5">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#F8FAFC] px-3 py-1.5 text-xs font-semibold text-[#475569]">
            <HelpCircle className="h-3.5 w-3.5" />
            <span>{questionCount == null ? "--" : `${questionCount} Qs`}</span>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#F8FAFC] px-3 py-1.5 text-xs font-semibold text-[#475569]">
            <Clock className="h-3.5 w-3.5" />
            <span>{test.durationMinutes} min</span>
          </div>
        </div>

        <div className="mt-3 text-xs font-medium text-[#94A3B8]">
          {test.scheduledAt ? `Scheduled: ${format(new Date(test.scheduledAt), "MMM d, yyyy")}` : "Available now"}
        </div>

        <div className="mt-auto flex items-center gap-3 pt-5">
          <button
            type="button"
            onClick={onPrimaryAction}
            className={`w-full flex-1 rounded-full px-4 py-3 text-sm font-semibold transition-colors ${locked ? "bg-[#D97706] text-white hover:bg-[#B45309]" : isCompleted ? "border border-[#E5E7EB] bg-white text-[#0F172A] hover:bg-[#F8FAFC]" : accent.button}`}
          >
            {locked ? "Unlock" : isCompleted ? "View Result" : hasSavedDraft ? "Resume" : "Start Test"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TruncatedPentagonBadge({
  count,
  variant,
  size = "md",
}: {
  count: number;
  variant: "answered" | "not-answered";
  size?: "sm" | "md" | "lg";
}) {
  const gradientId = useId().replace(/:/g, "");
  const shineId = `${gradientId}-shine`;
  const countLabel = String(count);
  const dimensions = variant === "not-answered"
    ? size === "sm"
      ? "h-[30px] w-[30px]"
      : size === "lg"
        ? "h-[56px] w-[56px]"
        : "h-[52px] w-[52px]"
    : size === "sm"
      ? "h-8 w-8"
      : size === "lg"
        ? "h-[56px] w-[56px]"
        : "h-[52px] w-[52px]";
  const fontSize = countLabel.length >= 3
    ? size === "sm"
      ? "text-[9px]"
      : size === "lg"
        ? "text-[8px]"
        : "text-[10px]"
    : countLabel.length === 2
      ? size === "sm"
        ? "text-[11px]"
        : size === "lg"
          ? "text-[11px]"
          : "text-[14px]"
      : size === "sm"
        ? "text-xs"
      : size === "lg"
          ? "text-[11px]"
          : "text-lg";
  const textOffset = variant === "answered"
    ? size === "sm"
      ? "-translate-y-px"
      : size === "lg"
        ? "-translate-y-[1.5px]"
        : "-translate-y-[1px]"
    : size === "sm"
      ? "translate-y-[0.5px]"
      : size === "lg"
        ? "translate-y-[1.5px]"
        : "translate-y-[1px]";
  const outerPath = variant === "answered"
    ? "M2 38V14L10 2H34L42 14V38H2Z"
    : "M1 1H43V26L31 39H13L1 26V1Z";
  const innerPath = variant === "answered"
    ? "M4 36V15L11 4H33L40 15V36H4Z"
    : "M3 3H41V25L30 36H14L3 25V3Z";
  const outerFill = variant === "answered" ? "#7FAE45" : "#DD6A27";
  const gradientStart = variant === "answered" ? "#A6D15E" : "#FF7424";
  const gradientEnd = variant === "answered" ? "#89B647" : "#EA5A10";

  return (
    <span className={`relative inline-flex items-center justify-center ${dimensions} select-none`}>
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 44 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <path d={outerPath} fill={outerFill} />
        <path d={innerPath} fill={`url(#${gradientId})`} />
        {variant === "not-answered" && (
          <>
            <path d="M4 4H40V6.5H4Z" fill={`url(#${shineId})`} />
            <path d="M4 7H40" stroke="#FFB38D" strokeOpacity="0.7" strokeWidth="1" />
          </>
        )}
        <defs>
          <linearGradient id={gradientId} x1="22" y1="4" x2="22" y2="36" gradientUnits="userSpaceOnUse">
            <stop stopColor={gradientStart} />
            {variant === "not-answered" && <stop offset="0.54" stopColor="#F04A00" />}
            <stop offset="1" stopColor={gradientEnd} />
          </linearGradient>
          {variant === "not-answered" && (
            <linearGradient id={shineId} x1="22" y1="4" x2="22" y2="6.5" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FFF3EB" stopOpacity="0.95" />
              <stop offset="1" stopColor="#FFF3EB" stopOpacity="0" />
            </linearGradient>
          )}
        </defs>
      </svg>
      <span className={`relative z-10 font-bold leading-none text-white ${fontSize} ${textOffset}`}>
        {countLabel}
      </span>
    </span>
  );
}

function formatTimeLabel(totalSeconds: number) {
  return `${Math.floor(totalSeconds / 60).toString().padStart(2, "0")}:${(totalSeconds % 60).toString().padStart(2, "0")}`;
}

function LiveTimeIndicator({
  initialSeconds,
  deadlineAtMs,
  onTick,
  onExpire,
  className,
}: {
  initialSeconds: number;
  deadlineAtMs?: number | null;
  onTick: (seconds: number) => void;
  onExpire: () => void;
  className: string;
}) {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const didExpireRef = useRef(false);
  const onTickRef = useRef(onTick);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    setSecondsLeft(initialSeconds);
    onTickRef.current(initialSeconds);
    didExpireRef.current = false;

    const startedAt = Date.now();
    const seed = initialSeconds;
    const deadline = deadlineAtMs ?? startedAt + seed * 1000;

    const update = () => {
      const nextSeconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      onTickRef.current(nextSeconds);
      setSecondsLeft((current) => (current === nextSeconds ? current : nextSeconds));

      if (nextSeconds === 0 && !didExpireRef.current) {
        didExpireRef.current = true;
        onExpireRef.current();
      }
    };

    update();
    const intervalId = window.setInterval(update, 250);
    return () => window.clearInterval(intervalId);
  }, [deadlineAtMs, initialSeconds]);

  return (
    <div className={`${className} ${secondsLeft <= 300 ? "animate-pulse text-red-700" : "text-[#2b2b2b]"}`}>
      <Clock size={13} /> Time Left : {formatTimeLabel(secondsLeft)}
    </div>
  );
}

function StudentTestsPreview() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"all" | "upcoming" | "active" | "completed">("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [pendingDialogOpen, setPendingDialogOpen] = useState(false);
  const [previewTestId, setPreviewTestId] = useState<number | null>(null);

  const subjectOptions = useMemo(
    () =>
      Array.from(new Set(PENDING_PREVIEW_TESTS.map((test) => getStudentTestSubject(test)).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [],
  );

  const filteredTests = useMemo(() => {
    const filteredByTab = PENDING_PREVIEW_TESTS.filter((test) => activeTab === "all" || getStudentTestStatus(test) === activeTab);
    if (subjectFilter === "all") return filteredByTab;
    return filteredByTab.filter((test) => getStudentTestSubject(test) === subjectFilter);
  }, [activeTab, subjectFilter]);

  const testStats = useMemo(
    () => ({
      total: PENDING_PREVIEW_TESTS.length,
      upcoming: PENDING_PREVIEW_TESTS.filter((test) => getStudentTestStatus(test) === "upcoming").length,
      active: PENDING_PREVIEW_TESTS.filter((test) => getStudentTestStatus(test) === "active").length,
      completed: PENDING_PREVIEW_TESTS.filter((test) => getStudentTestStatus(test) === "completed").length,
    }),
    [],
  );
  const previewTest = useMemo(
    () => PENDING_PREVIEW_TESTS.find((test) => test.id === previewTestId) ?? null,
    [previewTestId],
  );
  const previewStatus = previewTest ? getStudentTestStatus(previewTest) : null;
  const previewTestCategory = previewTest ? getResolvedTestCategory(previewTest, null) : null;
  const previewResult = previewTest ? PENDING_PREVIEW_TEST_RESULTS[previewTest.id] ?? null : null;

  return (
    <>
      <div className="space-y-7">
        <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">My Tests</h1>
        </div>

        <StudentPreviewLockBanner
          title="Tests preview locked"
          description="Preview only for now. Full test access unlocks after approval."
          onCheckStatus={() => setLocation("/student/pending-approval")}
          onOpenLocked={() => setPendingDialogOpen(true)}
        />

          <StudentTestsStatsBar
            total={testStats.total}
            upcoming={testStats.upcoming}
            active={testStats.active}
            completed={testStats.completed}
            averageScore={68}
          />

          <div className="flex flex-col gap-3 rounded-[24px] border border-[#E5E7EB] bg-white px-3 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.05)] sm:px-4 md:flex-row md:items-center md:justify-between">
            <div className="grid w-full grid-cols-4 gap-1.5 md:flex md:w-auto md:flex-wrap md:items-center md:gap-2">
              {[
                { id: "all", label: "All" },
                { id: "upcoming", label: "Upcoming" },
                { id: "active", label: "Active" },
                { id: "completed", label: "Completed" },
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                    className={`min-w-0 rounded-full px-2 py-2.5 text-center text-[13px] font-semibold transition-colors sm:text-sm md:px-6 md:text-base ${
                      isActive ? "chip-orange-solid" : "text-[#64748B] hover:text-[#0F172A]"
                    } whitespace-nowrap`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="flex w-full items-center gap-3 md:w-auto">
              <div className="relative w-full md:min-w-[220px]">
                <select
                  value={subjectFilter}
                  onChange={(event) => setSubjectFilter(event.target.value)}
                  className="h-10 w-full appearance-none rounded-full border-0 bg-white py-2 pl-4 pr-11 text-sm font-semibold text-[#0F172A] outline-none sm:text-base"
                >
                  <option value="all">All Subjects</option>
                  {subjectOptions.map((subject) => (
                    <option key={subject} value={subject}>
                      {subject}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filteredTests.map((test) => (
              <StudentTestSeriesCard
                key={test.id}
                test={test}
                status={getStudentTestStatus(test)}
                questionCount={PENDING_PREVIEW_TEST_QUESTION_COUNTS[test.id] ?? null}
                detail={null}
                hasSavedDraft={false}
                onPrimaryAction={() => {
                  if (getStudentTestStatus(test) === "completed") {
                    setLocation(`/student/tests/${test.id}/analysis`);
                    return;
                  }
                  setPreviewTestId(test.id);
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <Dialog open={previewTest !== null} onOpenChange={(open) => !open && setPreviewTestId(null)}>
        <DialogContent
          hideClose
          className="max-h-[calc(100dvh-1rem)] max-w-[calc(100vw-1rem)] overflow-hidden rounded-[24px] border border-[#D8DEEF] bg-white p-0 shadow-[0_20px_56px_rgba(15,23,42,0.16)] sm:max-h-[44rem] sm:max-w-[820px] sm:rounded-[28px]"
        >
          {previewTest ? (
            <div className="max-h-[calc(100dvh-1rem)] overflow-y-auto bg-white sm:max-h-[44rem]">
              <div className="flex flex-col gap-4 border-b border-[#ECEEF8] px-4 pb-5 pt-5 sm:flex-row sm:items-start sm:justify-between sm:px-8 sm:pb-7 sm:pt-6">
                <div>
                  <div className="inline-flex rounded-full border border-[#1F2937] px-3.5 py-1 text-sm font-semibold text-[#1F2937]">
                    {getStudentTestSubject(previewTest)}
                  </div>
                  {previewTestCategory ? (
                    <div className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getTestCategoryTone(previewTestCategory).chip}`}>
                      {getTestCategoryLabel(previewTestCategory)}
                    </div>
                  ) : null}
                  <h2 className="mt-4 max-w-[540px] text-[20px] font-bold tracking-tight text-[#111827] sm:mt-5 sm:text-[24px]">{previewTest.title}</h2>
                  <p className="mt-3 max-w-[560px] text-sm leading-7 text-[#64748B]">
                    {getStudentVisibleTestDescription(previewTest.description) || `${getStudentTestSubject(previewTest)} preview test with sample metrics visible before verification approval.`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewTestId(null)}
                  className="self-end rounded-full border border-[#E2E8F0] p-2 text-[#64748B] transition hover:bg-[#F8FAFC] hover:text-[#0F172A] sm:self-start"
                  aria-label="Close test preview"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-6 px-4 py-5 sm:px-8 sm:py-7">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[24px] border border-[#E5E7EB] bg-[#F8FAFC] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#94A3B8]">Questions</p>
                    <p className="mt-2 text-[22px] font-bold text-[#111827]">{PENDING_PREVIEW_TEST_QUESTION_COUNTS[previewTest.id] ?? "--"}</p>
                  </div>
                  <div className="rounded-[24px] border border-[#E5E7EB] bg-[#F8FAFC] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#94A3B8]">Duration</p>
                    <p className="mt-2 text-[22px] font-bold text-[#111827]">{previewTest.durationMinutes} min</p>
                  </div>
                  <div className="rounded-[24px] border border-[#E5E7EB] bg-[#F8FAFC] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#94A3B8]">Status</p>
                    <p className="mt-2 text-[22px] font-bold text-[#111827]">
                      {previewStatus === "completed" ? "Completed" : previewStatus === "upcoming" ? "Upcoming" : "Ongoing"}
                    </p>
                  </div>
                </div>

                {previewStatus === "completed" && previewResult ? (
                  <div className="rounded-[28px] border border-[#D8DEEF] bg-[linear-gradient(135deg,#EEF2FF_0%,#F8FAFC_100%)] p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6366F1]">Sample result preview</p>
                        <p className="mt-2 text-sm font-medium text-[#475569]">
                          Submitted on {format(new Date(previewResult.submittedAt), "MMMM do, yyyy 'at' h:mm aa")}
                        </p>
                      </div>
                      <div className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#6366F1] shadow-[0_8px_20px_rgba(99,102,241,0.12)]">
                        {Math.round(previewResult.percentage)}% Accuracy
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-[22px] border border-white/60 bg-white/80 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#94A3B8]">Score</p>
                        <p className="mt-2 text-[24px] font-bold text-[#111827]">
                          {previewResult.score}/{previewResult.totalPoints}
                        </p>
                      </div>
                      <div className="rounded-[22px] border border-white/60 bg-white/80 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#94A3B8]">Answered</p>
                        <p className="mt-2 text-[24px] font-bold text-[#111827]">
                          {previewResult.answeredCount}/{PENDING_PREVIEW_TEST_QUESTION_COUNTS[previewTest.id] ?? "--"}
                        </p>
                      </div>
                      <div className="rounded-[22px] border border-white/60 bg-white/80 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#94A3B8]">Mode</p>
                        <p className="mt-2 text-[24px] font-bold text-[#111827]">Preview</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[28px] border border-[#D8DEEF] bg-[linear-gradient(135deg,#EEF2FF_0%,#F8FAFC_100%)] p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6366F1]">Preview only</p>
                    <p className="mt-3 text-sm leading-7 text-[#64748B]">
                      This is a sample {previewStatus === "upcoming" ? "upcoming" : "ongoing"} test card. Real instructions, resume flow, timer, results, and attempt actions will unlock after verification is approved.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-[#ECEEF8] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full border-[#FED7AA] px-5 text-[#F97316] hover:bg-[#FFF7ED]"
                  onClick={() => {
                    setPreviewTestId(null);
                    setLocation("/student/pending-approval");
                  }}
                >
                  Check verification
                </Button>
                <Button
                  type="button"
                  className="rounded-full bg-[#F59E0B] px-6 text-white hover:bg-[#EA580C]"
                  onClick={() => {
                    if (previewStatus === "completed") {
                      setPreviewTestId(null);
                      setLocation(`/student/tests/${previewTest.id}/analysis`);
                      return;
                    }
                    setPreviewTestId(null);
                    setPendingDialogOpen(true);
                  }}
                >
                  {previewStatus === "completed" ? "Open sample result" : previewStatus === "upcoming" ? "Unlock test access" : "Resume after approval"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <PendingVerificationDialog
        open={pendingDialogOpen}
        onOpenChange={setPendingDialogOpen}
        onCheckStatus={() => setLocation("/student/pending-approval")}
      />
    </>
  );
}

function ApprovedStudentTests({ featureLocked = false }: { featureLocked?: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"all" | "upcoming" | "active" | "completed">("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [previewTestId, setPreviewTestId] = useState<number | null>(null);

  const [activeTest, setActiveTest] = useState<TestDetail | null>(null);
  const [answers, setAnswers] = useState<Record<number, AnswerValue>>({});
  const [savedAnswers, setSavedAnswers] = useState<Record<number, AnswerValue>>({});
  const [timerInitialSeconds, setTimerInitialSeconds] = useState(0);
  const [timerDeadlineMs, setTimerDeadlineMs] = useState<number | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [visitedSet, setVisitedSet] = useState<Set<number>>(new Set());
  const [reviewSet, setReviewSet] = useState<Set<number>>(new Set());
  const [showInstructions, setShowInstructions] = useState(false);
  const [showSubmitReview, setShowSubmitReview] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [mobilePaletteOpen, setMobilePaletteOpen] = useState(false);
  const [openSectionInfoId, setOpenSectionInfoId] = useState<number | null>(null);
  const [sectionInfoPopupLeft, setSectionInfoPopupLeft] = useState(0);
  const integerInputRef = useRef<HTMLInputElement | null>(null);
  const sectionInfoCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sectionInfoAreaRef = useRef<HTMLDivElement | null>(null);
  const mobileQuestionStripRef = useRef<HTMLDivElement | null>(null);

  const [questionTimings, setQuestionTimings] = useState<Record<number, number>>({});
  const timingActiveRef = useRef<{ qId: number; startMs: number } | null>(null);
  const timeLeftRef = useRef(0);
  const timerDeadlineMsRef = useRef<number | null>(null);
  const autoSubmitTriggeredRef = useRef(false);
  const autoSubmitRetryAtRef = useRef(0);
  const activeTestRef = useRef<TestDetail | null>(null);
  const answersRef = useRef<Record<number, AnswerValue>>({});
  const savedAnswersRef = useRef<Record<number, AnswerValue>>({});
  const currentQuestionIndexRef = useRef(0);
  const visitedSetRef = useRef<Set<number>>(new Set());
  const reviewSetRef = useRef<Set<number>>(new Set());
  const questionTimingsRef = useRef<Record<number, number>>({});
  const interactionLogRef = useRef<InteractionLogEntry[]>([]);
  const [interactionLog, setInteractionLog] = useState<InteractionLogEntry[]>([]);
  const [mobileViewport, setMobileViewport] = useState<MobileViewportState>(() => getMobileViewportState());
  const [allowPortraitTestView, setAllowPortraitTestView] = useState(true);
  const fullscreenRequestedRef = useRef(false);

  useEffect(() => {
    activeTestRef.current = activeTest;
  }, [activeTest]);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    savedAnswersRef.current = savedAnswers;
  }, [savedAnswers]);

  useEffect(() => {
    currentQuestionIndexRef.current = currentQuestionIndex;
  }, [currentQuestionIndex]);

  useEffect(() => {
    visitedSetRef.current = visitedSet;
  }, [visitedSet]);

  useEffect(() => {
    reviewSetRef.current = reviewSet;
  }, [reviewSet]);

  useEffect(() => {
    questionTimingsRef.current = questionTimings;
  }, [questionTimings]);

  useEffect(() => {
    interactionLogRef.current = interactionLog;
  }, [interactionLog]);

  const getDraftKey = (testId: number) => `${TEST_DRAFT_PREFIX}-${testId}`;
  const clearDraft = (testId: number) => localStorage.removeItem(getDraftKey(testId));
  const saveDraft = (test: TestDetail, draft: SavedTestDraft) => {
    localStorage.setItem(getDraftKey(test.id), JSON.stringify(draft));
  };
  const getCurrentTimeLeftSeconds = () => {
    const deadline = timerDeadlineMsRef.current;
    if (!deadline) return Math.max(0, timeLeftRef.current);
    return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  };
  const seedAttemptTimer = (initialSeconds: number) => {
    const normalizedSeconds = Math.max(0, Math.floor(initialSeconds));
    const deadline = Date.now() + normalizedSeconds * 1000;
    timeLeftRef.current = normalizedSeconds;
    timerDeadlineMsRef.current = deadline;
    setTimerInitialSeconds(normalizedSeconds);
    setTimerDeadlineMs(deadline);
  };
  const clearAttemptTimer = () => {
    timeLeftRef.current = 0;
    timerDeadlineMsRef.current = null;
    setTimerDeadlineMs(null);
  };
  const buildCurrentDraft = (overrides?: Partial<SavedTestDraft>): SavedTestDraft => ({
    answers: savedAnswers,
    timeLeft: getCurrentTimeLeftSeconds(),
    currentQuestionIndex,
    visitedQuestionIds: Array.from(visitedSet),
    reviewQuestionIds: Array.from(reviewSet),
    questionTimings,
    interactionLog,
    showInstructions,
    ...overrides,
  });
  const syncMobileViewportState = () => {
    setMobileViewport(getMobileViewportState());
  };
  const requestLandscapeExperience = async () => {
    if (typeof window === "undefined") return;
    const nextViewportState = getMobileViewportState();
    if (!nextViewportState.isMobile) return;
    const orientationApi = (window.screen as ScreenWithOptionalOrientation).orientation;
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen();
        fullscreenRequestedRef.current = true;
      } catch {
        fullscreenRequestedRef.current = false;
      }
    }
    if (orientationApi?.lock) {
      try {
        await orientationApi.lock("landscape");
      } catch {
        // Some browsers only allow lock in fullscreen/PWA modes.
      }
    }
    syncMobileViewportState();
  };
  const releaseLandscapeExperience = async () => {
    if (typeof window === "undefined") return;
    const orientationApi = (window.screen as ScreenWithOptionalOrientation).orientation;
    try {
      orientationApi?.unlock?.();
    } catch {
      // Ignore browsers without unlock support.
    }
    if (fullscreenRequestedRef.current && document.fullscreenElement && document.exitFullscreen) {
      try {
        await document.exitFullscreen();
      } catch {
        // Ignore browsers that reject exit during teardown.
      }
    }
    fullscreenRequestedRef.current = false;
  };

  const getQuestionSectionLabel = (test: TestDetail, questionId: number) => {
    const question = test.questions.find((entry) => entry.id === questionId);
    const defaultLabel = test.subjectName ?? test.title ?? "Section";
    if (!question) return test.subjectName ?? test.title ?? "Section";
    if (question.sectionId != null) {
      const section = test.sections?.find((entry) => entry.id === question.sectionId);
      if (section) return section.subjectLabel?.trim() || section.title?.trim() || defaultLabel;
    }
    return test.sections?.[0]?.subjectLabel?.trim() || test.sections?.[0]?.title?.trim() || defaultLabel;
  };

  const getElapsedSeconds = () => {
    if (!activeTest) return 0;
    return Math.max(0, activeTest.durationMinutes * 60 - timeLeftRef.current);
  };

  const logInteraction = (
    questionId: number,
    action: InteractionLogEntry["action"],
    options?: {
      testOverride?: TestDetail;
      answerSnapshot?: AnswerValue | null;
      reviewState?: InteractionLogEntry["reviewState"];
    },
  ) => {
    const sourceTest = options?.testOverride ?? activeTest;
    if (!sourceTest) return;
    const entry: InteractionLogEntry = {
      at: options?.testOverride ? 0 : getElapsedSeconds(),
      questionId,
      sectionLabel: getQuestionSectionLabel(sourceTest, questionId),
      action,
    };
    if (options && "answerSnapshot" in options) {
      entry.answerSnapshot = getAnswerSnapshot(options.answerSnapshot);
    }
    if (options?.reviewState) {
      entry.reviewState = options.reviewState;
    }
    setInteractionLog((prev) => [...prev, entry]);
  };

  const { data: tests = [], isLoading } = useQuery<TestItem[]>({
    queryKey: ["student-tests"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/tests`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const testDetailQueries = useQueries({
    queries: tests.map((test) => ({
      queryKey: ["student-test-card-detail", test.id],
      queryFn: async () => {
        const response = await fetch(`${BASE}/api/tests/${test.id}`, { credentials: "include" });
        if (!response.ok) throw new Error("Failed to load test detail");
        return response.json() as Promise<TestDetail>;
      },
      staleTime: 300000,
      enabled: !featureLocked,
    })),
  });

  const { data: reviewBucketEntries = [] } = useQuery<any[]>({
    queryKey: ["student-review-bucket-count"],
    queryFn: async () => {
      const response = await fetch(`${BASE}/api/tests/review-bucket`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load review bucket");
      return response.json();
    },
    enabled: !featureLocked,
  });
  const [removedReviewBucketQuestionIds, setRemovedReviewBucketQuestionIds] = useState<number[]>(() =>
    getReviewBucketRemovedQuestionIds(),
  );
  const visibleReviewBucketEntries = useMemo(
    () => filterReviewBucketEntries(reviewBucketEntries, removedReviewBucketQuestionIds),
    [reviewBucketEntries, removedReviewBucketQuestionIds],
  );

  const questionCountByTestId = useMemo(
    () =>
      tests.reduce<Record<number, number | null>>((acc, test, index) => {
        const detail = testDetailQueries[index]?.data;
        acc[test.id] = detail?.questions?.length ?? null;
        return acc;
      }, {}),
    [tests, testDetailQueries],
  );

  const averageCompletedScore = useMemo(() => {
    const percentages = tests
      .map((test, index) => ({ test, detail: testDetailQueries[index]?.data }))
      .filter(({ test, detail }) => test.alreadySubmitted && detail?.submission)
      .map(({ detail }) => detail?.submission?.percentage ?? 0);
    if (percentages.length === 0) return null;
    return percentages.reduce((sum, value) => sum + value, 0) / percentages.length;
  }, [tests, testDetailQueries]);

  const subjectOptions = useMemo(
    () =>
      Array.from(new Set(tests.map((test) => getStudentTestSubject(test)).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [tests],
  );

  const filteredTests = useMemo(() => {
    const filteredByTab = tests.filter((test) => activeTab === "all" || getStudentTestStatus(test) === activeTab);
    if (subjectFilter === "all") return filteredByTab;
    return filteredByTab.filter((test) => getStudentTestSubject(test) === subjectFilter);
  }, [activeTab, subjectFilter, tests]);

  const previewTest = useMemo(
    () => tests.find((test) => test.id === previewTestId) ?? null,
    [previewTestId, tests],
  );

  const previewDetail = useMemo(() => {
    if (!previewTest) return null;
    const detailIndex = tests.findIndex((entry) => entry.id === previewTest.id);
    return detailIndex >= 0 ? testDetailQueries[detailIndex]?.data ?? null : null;
  }, [previewTest, testDetailQueries, tests]);

  const previewStatus = previewTest ? getStudentTestStatus(previewTest) : null;
  const previewHasSavedDraft = previewTest ? !!localStorage.getItem(getDraftKey(previewTest.id)) : false;
  const previewAction: TestPreviewAction | null = previewTest
    ? previewStatus === "completed"
      ? "result"
      : previewHasSavedDraft
        ? "resume"
        : "start"
    : null;
  const previewQuestionCount = previewTest ? questionCountByTestId[previewTest.id] ?? null : null;
  const previewTestCategory = previewTest ? getResolvedTestCategory(previewTest, previewDetail) : null;
  const previewAnsweredCount = (() => {
    if (!previewDetail?.submission?.answers) return 0;
    try {
      const parsed = JSON.parse(previewDetail.submission.answers) as Record<string, AnswerValue>;
      return previewDetail.questions.filter((question) => {
        const answer = parsed[String(question.id)];
        if (question.questionType === "multi") return Array.isArray(answer) && answer.length > 0;
        if (question.questionType === "integer") return hasMeaningfulNumericAnswer(answer);
        return answer !== undefined && answer !== null && answer !== "";
      }).length;
    } catch {
      return 0;
    }
  })();

  const testStats = useMemo(() => {
    const counts = tests.reduce(
      (acc, test) => {
        const status = getStudentTestStatus(test);
        acc.total += 1;
        acc[status] += 1;
        return acc;
      },
      { total: 0, upcoming: 0, active: 0, completed: 0 },
    );
    return counts;
  }, [tests]);

  useEffect(() => {
    const syncRemovedReviewBucketIds = () => {
      setRemovedReviewBucketQuestionIds(getReviewBucketRemovedQuestionIds());
    };

    window.addEventListener("focus", syncRemovedReviewBucketIds);
    document.addEventListener("visibilitychange", syncRemovedReviewBucketIds);
    window.addEventListener("storage", syncRemovedReviewBucketIds);

    return () => {
      window.removeEventListener("focus", syncRemovedReviewBucketIds);
      document.removeEventListener("visibilitychange", syncRemovedReviewBucketIds);
      window.removeEventListener("storage", syncRemovedReviewBucketIds);
    };
  }, []);

  useEffect(() => {
    syncMobileViewportState();
    window.addEventListener("resize", syncMobileViewportState);
    window.addEventListener("orientationchange", syncMobileViewportState);
    document.addEventListener("fullscreenchange", syncMobileViewportState);

    return () => {
      window.removeEventListener("resize", syncMobileViewportState);
      window.removeEventListener("orientationchange", syncMobileViewportState);
      document.removeEventListener("fullscreenchange", syncMobileViewportState);
    };
  }, []);

  useEffect(() => {
    if (!activeTest) {
      void releaseLandscapeExperience();
      return;
    }
    setAllowPortraitTestView(true);

    return () => {
      void releaseLandscapeExperience();
    };
  }, [activeTest]);

  const launchTestAttempt = (data: TestDetail, allowDraftResume = true) => {
    const rawDraft = localStorage.getItem(getDraftKey(data.id));
    const parsedDraft: SavedTestDraft | null = rawDraft ? JSON.parse(rawDraft) : null;
    const shouldResume = allowDraftResume && parsedDraft
      ? window.confirm("A saved test attempt was found. Do you want to continue from where you left off?")
      : false;

    if (!shouldResume) clearDraft(data.id);

    const cleanTest: TestDetail = { ...data, submission: null };
    const initialIndex = shouldResume
      ? Math.min(parsedDraft?.currentQuestionIndex ?? 0, Math.max(cleanTest.questions.length - 1, 0))
      : 0;
    const initialQuestion = cleanTest.questions[initialIndex];
    const initialSavedAnswers = cloneAnswerRecord(shouldResume ? parsedDraft?.answers : undefined);

    setActiveTest(cleanTest);
    setAnswers(initialSavedAnswers);
    setSavedAnswers(initialSavedAnswers);
    const initialSeconds = shouldResume ? Math.max(parsedDraft?.timeLeft ?? cleanTest.durationMinutes * 60, 0) : cleanTest.durationMinutes * 60;
    seedAttemptTimer(initialSeconds);
    autoSubmitTriggeredRef.current = false;
    autoSubmitRetryAtRef.current = 0;
    setQuestionTimings(shouldResume ? parsedDraft?.questionTimings ?? {} : {});
    setInteractionLog(
      shouldResume
        ? parsedDraft?.interactionLog ?? []
        : (initialQuestion ? [{
            at: 0,
            questionId: initialQuestion.id,
            sectionLabel: getQuestionSectionLabel(cleanTest, initialQuestion.id),
            action: "open" as const,
            answerSnapshot: getAnswerSnapshot(initialSavedAnswers[initialQuestion.id]),
          }] : []),
    );
    timingActiveRef.current = null;
    setCurrentQuestionIndex(initialIndex);
    setVisitedSet(new Set(
      shouldResume
        ? parsedDraft?.visitedQuestionIds ?? (initialQuestion ? [initialQuestion.id] : [])
        : (initialQuestion ? [initialQuestion.id] : [])
    ));
    setReviewSet(new Set(shouldResume ? parsedDraft?.reviewQuestionIds ?? [] : []));
    setShowInstructions(shouldResume ? parsedDraft?.showInstructions ?? false : true);
    setShowSubmitReview(false);
    setPaletteCollapsed(false);
    setMobilePaletteOpen(false);
    setShowCalculator(false);
  };

  const openTestWithMode = async (testId: number, draftMode: "prompt" | "resume" | "fresh") => {
    const r = await fetch(`${BASE}/api/tests/${testId}`, { credentials: "include" });
    if (!r.ok) return;
    const data: TestDetail = await r.json();
    if (data.submission) {
      return;
    }
    if (draftMode === "resume") {
      const rawDraft = localStorage.getItem(getDraftKey(data.id));
      const parsedDraft: SavedTestDraft | null = rawDraft ? JSON.parse(rawDraft) : null;
      if (parsedDraft) {
        const cleanTest: TestDetail = { ...data, submission: null };
        const initialIndex = Math.min(parsedDraft.currentQuestionIndex ?? 0, Math.max(cleanTest.questions.length - 1, 0));
        const initialQuestion = cleanTest.questions[initialIndex];
        const initialSavedAnswers = cloneAnswerRecord(parsedDraft.answers);

        setActiveTest(cleanTest);
        setAnswers(initialSavedAnswers);
        setSavedAnswers(initialSavedAnswers);
        const initialSeconds = Math.max(parsedDraft.timeLeft ?? cleanTest.durationMinutes * 60, 0);
        seedAttemptTimer(initialSeconds);
        autoSubmitTriggeredRef.current = false;
        autoSubmitRetryAtRef.current = 0;
        setQuestionTimings(parsedDraft.questionTimings ?? {});
        setInteractionLog(parsedDraft.interactionLog ?? []);
        timingActiveRef.current = null;
        setCurrentQuestionIndex(initialIndex);
        setVisitedSet(new Set(parsedDraft.visitedQuestionIds ?? (initialQuestion ? [initialQuestion.id] : [])));
        setReviewSet(new Set(parsedDraft.reviewQuestionIds ?? []));
        setShowInstructions(parsedDraft.showInstructions ?? false);
        setShowSubmitReview(false);
        setPaletteCollapsed(false);
        setMobilePaletteOpen(false);
        setShowCalculator(false);
        return;
      }
      launchTestAttempt(data, false);
      return;
    }
    launchTestAttempt(data, draftMode === "prompt");
  };

  useEffect(() => {
    if (!activeTest || activeTest.submission) return;
    saveDraft(activeTest, buildCurrentDraft());
  }, [activeTest, savedAnswers, currentQuestionIndex, visitedSet, reviewSet, questionTimings, interactionLog, showInstructions]);

  useEffect(() => {
    if (!activeTest || activeTest.submission) return;
    const intervalId = window.setInterval(() => {
      saveDraft(activeTest, buildCurrentDraft());
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [activeTest, savedAnswers, currentQuestionIndex, visitedSet, reviewSet, questionTimings, interactionLog, showInstructions]);

  useEffect(() => () => {
    if (sectionInfoCloseTimeoutRef.current) clearTimeout(sectionInfoCloseTimeoutRef.current);
  }, []);

  const startInteraction = (qId: number) => {
    const now = Date.now();
    const prev = timingActiveRef.current;
    if (prev && prev.qId !== qId) {
      const elapsed = Math.round((now - prev.startMs) / 1000);
      setQuestionTimings(pt => ({ ...pt, [prev.qId]: (pt[prev.qId] ?? 0) + elapsed }));
      timingActiveRef.current = { qId, startMs: now };
    } else if (!prev) {
      timingActiveRef.current = { qId, startMs: now };
    }
  };

  const finalizeTimings = (): Record<number, number> => {
    const active = timingActiveRef.current;
    if (active) {
      const elapsed = Math.round((Date.now() - active.startMs) / 1000);
      timingActiveRef.current = null;
      const latestTimings = questionTimingsRef.current;
      const updated = { ...latestTimings, [active.qId]: (latestTimings[active.qId] ?? 0) + elapsed };
      questionTimingsRef.current = updated;
      setQuestionTimings(updated);
      return updated;
    }
    return questionTimingsRef.current;
  };

  const isAnswered = (question: Question, answer: AnswerValue | undefined) => {
    if (question.questionType === "multi") return Array.isArray(answer) && answer.length > 0;
    if (question.questionType === "integer") return hasMeaningfulNumericAnswer(answer);
    return answer !== undefined && answer !== null && answer !== "";
  };

  const getPaletteStatus = (question: Question): PaletteStatus => {
    const visited = visitedSet.has(question.id);
    const answered = isAnswered(question, savedAnswers[question.id]);
    const review = reviewSet.has(question.id);
    if (!visited) return "not-visited";
    if (answered && review) return "answered-review";
    if (review) return "review";
    if (answered) return "answered";
    return "not-answered";
  };

  const getSectionPaletteCounts = (questionEntries: Array<{ question: Question; globalIndex: number }>) => {
    const statuses = questionEntries.map(({ question }) => getPaletteStatus(question));
    return {
      answered: statuses.filter((status) => status === "answered").length,
      notAnswered: statuses.filter((status) => status === "not-answered").length,
      notVisited: statuses.filter((status) => status === "not-visited").length,
      review: statuses.filter((status) => status === "review").length,
      answeredReview: statuses.filter((status) => status === "answered-review").length,
    };
  };
  const getCommittedAnswersSnapshot = () => {
    const test = activeTestRef.current;
    const current = test?.questions[currentQuestionIndexRef.current];
    const nextSavedAnswers = { ...savedAnswersRef.current };

    if (current) {
      const nextAnswer = cloneAnswerValue(answersRef.current[current.id]);
      if (isAnswered(current, nextAnswer)) {
        nextSavedAnswers[current.id] = nextAnswer as AnswerValue;
      } else {
        delete nextSavedAnswers[current.id];
      }
    }

    return nextSavedAnswers;
  };
  const submitMutation = useMutation({
    mutationFn: async (payload?: SubmitAttemptPayload) => {
      const test = activeTestRef.current;
      if (!test) throw new Error("No test");
      const finalTimings = payload?.questionTimings ?? finalizeTimings();
      const finalAnswers = payload?.answers ?? getCommittedAnswersSnapshot();
      const finalVisitedQuestionIds = payload?.visitedQuestionIds ?? Array.from(visitedSetRef.current);
      const finalReviewQuestionIds = payload?.reviewQuestionIds ?? Array.from(reviewSetRef.current);
      const finalInteractionLog = payload?.interactionLog ?? interactionLogRef.current;
      const r = await fetch(`${BASE}/api/tests/${test.id}/submit`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: finalAnswers,
          questionTimings: finalTimings,
          flaggedQuestions: [],
          visitedQuestionIds: finalVisitedQuestionIds,
          reviewQuestionIds: finalReviewQuestionIds,
          interactionLog: finalInteractionLog,
        }),
      });
      if (!r.ok) throw new Error("Failed to submit");
      return { data: await r.json(), testId: test.id, isAuto: Boolean(payload?.isAuto) };
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ["student-tests"] });
      autoSubmitTriggeredRef.current = false;
      autoSubmitRetryAtRef.current = 0;
      clearAttemptTimer();
      clearDraft(result.testId);
      setShowSubmitReview(false);
      setActiveTest(null);
      setMobilePaletteOpen(false);
      setPaletteCollapsed(false);
      toast({ title: result.isAuto ? "Time is over. Test submitted automatically" : "Test submitted successfully" });
    },
    onError: (_error, payload) => {
      if (payload?.isAuto) {
        autoSubmitRetryAtRef.current = Date.now() + 5000;
      }
      autoSubmitTriggeredRef.current = false;
      toast({ title: "Submission failed", variant: "destructive" });
    },
  });
  const submitMutationRef = useRef(submitMutation);

  useEffect(() => {
    submitMutationRef.current = submitMutation;
  }, [submitMutation]);

  const totalQ = activeTest?.questions.length ?? 0;
  const allQuestionEntries = activeTest
    ? activeTest.questions.map((question, globalIndex) => ({ question, globalIndex }))
    : [];
  const sectionGroups = activeTest
    ? ((activeTest.sections?.length
        ? activeTest.sections
        : [{
            id: -1,
            title: activeTest.subjectName ?? activeTest.title ?? "Section",
            subjectLabel: activeTest.subjectName ?? activeTest.title ?? "Section",
            order: 0,
          } as TestSectionItem])
        .map((section, sectionIndex) => {
          const questionEntries = activeTest.questions
            .map((question, globalIndex) => ({ question, globalIndex }))
            .filter(({ question }) => {
              if (!activeTest.sections?.length) return true;
              if (question.sectionId != null) return question.sectionId === section.id;
              return sectionIndex === 0;
            });
          return {
            id: section.id,
            label: section.subjectLabel?.trim() || section.title?.trim() || `Section ${sectionIndex + 1}`,
            questionEntries,
          };
        })
        .filter((section) => section.questionEntries.length > 0))
    : [];

  const setMcqAnswer = (qId: number, idx: number) => {
    startInteraction(qId);
    logInteraction(qId, "answer", { answerSnapshot: idx });
    setAnswers((p) => ({ ...p, [qId]: idx }));
  };
  const toggleMultiAnswer = (qId: number, idx: number) => {
    startInteraction(qId);
    const current = ((answers[qId] as number[] | undefined) ?? []);
    const nextAnswer = current.includes(idx) ? current.filter((x) => x !== idx) : [...current, idx];
    logInteraction(qId, "answer", { answerSnapshot: nextAnswer });
    setAnswers((p) => ({ ...p, [qId]: nextAnswer }));
  };
  const setIntegerAnswer = (qId: number, val: string) => {
    startInteraction(qId);
    const sanitized = val.replace(/\s+/g, "");
    if (!/^-?(?:\d+)?(?:\.\d*)?$/.test(sanitized)) return;
    if (sanitized === "") {
      logInteraction(qId, "clear", { answerSnapshot: null });
      setAnswers(p => { const n = { ...p }; delete n[qId]; return n; });
      return;
    }
    logInteraction(qId, "answer", { answerSnapshot: sanitized });
    setAnswers(p => ({ ...p, [qId]: sanitized }));
  };

  const commitQuestionAnswer = (question: Question) => {
    const nextSavedAnswers = { ...savedAnswers };
    const nextAnswer = cloneAnswerValue(answers[question.id]);
    if (isAnswered(question, nextAnswer)) {
      nextSavedAnswers[question.id] = nextAnswer as AnswerValue;
    } else {
      delete nextSavedAnswers[question.id];
    }
    setSavedAnswers(nextSavedAnswers);
    setAnswers((prev) => syncQuestionAnswerFromSource(prev, question.id, nextSavedAnswers));
    return nextSavedAnswers;
  };

  const goToQuestion = (index: number, options?: { savedAnswersOverride?: Record<number, AnswerValue> }) => {
    if (!activeTest) return;
    const bounded = Math.max(0, Math.min(index, activeTest.questions.length - 1));
    const current = activeTest.questions[currentQuestionIndex];
    const question = activeTest.questions[bounded];
    const sourceAnswers = options?.savedAnswersOverride ?? savedAnswers;
    if (current && current.id !== question.id) {
      setAnswers((prev) => {
        const restoredCurrent = syncQuestionAnswerFromSource(prev, current.id, sourceAnswers);
        return syncQuestionAnswerFromSource(restoredCurrent, question.id, sourceAnswers);
      });
    }
    setCurrentQuestionIndex(bounded);
    setMobilePaletteOpen(false);
    setVisitedSet((prev) => new Set(prev).add(question.id));
    logInteraction(question.id, "open", {
      answerSnapshot: sourceAnswers[question.id] ?? null,
    });
    startInteraction(question.id);
  };

  const clearResponse = (question: Question) => {
    logInteraction(question.id, "clear", {
      answerSnapshot: null,
      reviewState: reviewSet.has(question.id) ? "removed" : undefined,
    });
    setSavedAnswers((prev) => {
      const next = { ...prev };
      delete next[question.id];
      return next;
    });
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[question.id];
      return next;
    });
    setReviewSet((prev) => {
      const next = new Set(prev);
      next.delete(question.id);
      return next;
    });
    setVisitedSet((prev) => new Set(prev).add(question.id));
  };

  const saveAndNext = () => {
    if (!activeTest) return;
    const current = activeTest.questions[currentQuestionIndex];
    const nextSavedAnswers = commitQuestionAnswer(current);
    logInteraction(current.id, "save", {
      answerSnapshot: nextSavedAnswers[current.id] ?? null,
      reviewState: reviewSet.has(current.id) ? "removed" : undefined,
    });
    setReviewSet((prev) => {
      const next = new Set(prev);
      next.delete(current.id);
      return next;
    });
    if (currentQuestionIndex < activeTest.questions.length - 1) goToQuestion(currentQuestionIndex + 1, { savedAnswersOverride: nextSavedAnswers });
  };

  const markForReviewAndNext = () => {
    if (!activeTest) return;
    const current = activeTest.questions[currentQuestionIndex];
    const nextSavedAnswers = commitQuestionAnswer(current);
    logInteraction(current.id, "review", {
      answerSnapshot: nextSavedAnswers[current.id] ?? answers[current.id] ?? null,
      reviewState: "marked",
    });
    setReviewSet((prev) => new Set(prev).add(current.id));
    if (currentQuestionIndex < activeTest.questions.length - 1) goToQuestion(currentQuestionIndex + 1, { savedAnswersOverride: nextSavedAnswers });
  };

  const previousQuestion = () => {
    if (currentQuestionIndex > 0) goToQuestion(currentQuestionIndex - 1);
  };

  const currentQuestion = activeTest?.questions[currentQuestionIndex] ?? null;
  const integerDisplayValue = currentQuestion?.questionType === "integer"
    ? getNumericAnswerValue(answers[currentQuestion.id])
    : "";
  const currentSection = currentQuestion
    ? sectionGroups.find((section) => section.questionEntries.some((entry) => entry.question.id === currentQuestion.id)) ?? sectionGroups[0]
    : sectionGroups[0];
  const currentSectionQuestions = currentSection?.questionEntries ?? [];
  const currentSectionQuestionNumber = currentQuestion
    ? Math.max(1, currentSectionQuestions.findIndex((entry) => entry.question.id === currentQuestion.id) + 1)
    : 1;
  const openSectionInfoSection = openSectionInfoId !== null
    ? sectionGroups.find((section) => section.id === openSectionInfoId) ?? null
    : null;
  const openSectionInfoCounts = openSectionInfoSection
    ? getSectionPaletteCounts(openSectionInfoSection.questionEntries)
    : null;
  const currentSectionAnsweredCount = currentSectionQuestions.filter(({ question }) => isAnswered(question, savedAnswers[question.id])).length;
  const currentSectionNotVisitedCount = currentSectionQuestions.filter(({ question }) => getPaletteStatus(question) === "not-visited").length;
  const currentSectionNotAnsweredCount = currentSectionQuestions.filter(({ question }) => getPaletteStatus(question) === "not-answered").length;
  const currentSectionAnsweredReviewCount = currentSectionQuestions.filter(({ question }) => getPaletteStatus(question) === "answered-review").length;
  const currentSectionReviewCount = currentSectionQuestions.filter(({ question }) => getPaletteStatus(question) === "review").length;

  const submitSectionSummaries = activeTest
    ? sectionGroups.map((section) => {
        const statuses = section.questionEntries.map(({ question }) => getPaletteStatus(question));
        const answeredAndReview = statuses.filter((status) => status === "answered-review").length;
        return {
          id: section.id,
          label: section.label,
          totalQuestions: section.questionEntries.length,
          answered: statuses.filter((status) => status === "answered" || status === "answered-review").length,
          notAnswered: statuses.filter((status) => status === "not-answered").length,
          markedForReview: statuses.filter((status) => status === "review").length,
          answeredAndMarkedForReview: answeredAndReview,
          notVisited: statuses.filter((status) => status === "not-visited").length,
        };
      })
    : [];

  const openSubmitReview = () => {
    if (!activeTest) return;
    setMobilePaletteOpen(false);
    setShowSubmitReview(true);
  };

  const openScientificCalculator = () => {
    setShowCalculator(true);
  };

  const openSectionInfo = (sectionId: number, anchorEl?: HTMLElement | null) => {
    if (sectionInfoCloseTimeoutRef.current) clearTimeout(sectionInfoCloseTimeoutRef.current);
    setOpenSectionInfoId(sectionId);
    if (anchorEl && sectionInfoAreaRef.current) {
      const areaRect = sectionInfoAreaRef.current.getBoundingClientRect();
      const anchorRect = anchorEl.getBoundingClientRect();
      const popupWidth = 480;
      const maxLeft = Math.max(0, areaRect.width - popupWidth);
      const rawLeft = anchorRect.left - areaRect.left;
      setSectionInfoPopupLeft(Math.max(0, Math.min(rawLeft, maxLeft)));
    }
  };

  const scheduleCloseSectionInfo = () => {
    if (sectionInfoCloseTimeoutRef.current) clearTimeout(sectionInfoCloseTimeoutRef.current);
    sectionInfoCloseTimeoutRef.current = setTimeout(() => {
      setOpenSectionInfoId(null);
      sectionInfoCloseTimeoutRef.current = null;
    }, 120);
  };

  const paletteStyle: Record<PaletteStatus, string> = {
    "not-visited": "border-[#b7c2cf] bg-slate-100 text-slate-700",
    "not-answered": "border-orange-500 bg-orange-500 text-white",
    "answered": "border-lime-500 bg-lime-500 text-white",
    "review": "border-[#9a79f7] bg-violet-600 text-white",
    "answered-review": "border-[#9a79f7] bg-violet-600 text-white",
  };

  const renderPaletteBadge = (number: number, status: PaletteStatus, size: "sm" | "md" | "lg" = "md") => {
    const baseSize = size === "sm"
      ? "h-7 w-7 text-[11px]"
      : size === "lg"
        ? "h-[54px] w-[54px] text-[11px]"
        : "h-[50px] w-[50px] text-[16px]";
    const label = <span className="relative z-10 font-bold">{number}</span>;

    if (status === "answered") {
      return <TruncatedPentagonBadge count={number} variant="answered" size={size} />;
    }

    if (status === "not-answered") {
      return <TruncatedPentagonBadge count={number} variant="not-answered" size={size} />;
    }

    if (status === "not-visited") {
      return <span className={`inline-flex items-center justify-center rounded-sm border ${baseSize} ${paletteStyle[status]}`}>{label}</span>;
    }

    if (status === "review") {
      return <span className={`inline-flex items-center justify-center rounded-full border ${baseSize} ${paletteStyle[status]}`}>{label}</span>;
    }

    return (
      <span className={`relative inline-flex items-center justify-center rounded-full border ${baseSize} ${paletteStyle[status]}`}>
        {label}
        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border border-white bg-lime-400" />
      </span>
    );
  };

  const exitTest = () => {
    if (!activeTest || submitMutation.isPending) return;
    const finalTimings = finalizeTimings();
    saveDraft(activeTest, buildCurrentDraft({ questionTimings: finalTimings }));
    autoSubmitTriggeredRef.current = false;
    clearAttemptTimer();
    setMobilePaletteOpen(false);
    setShowCalculator(false);
    setActiveTest(null);
    toast({ title: "Test saved", description: "You can continue this test later from the test list." });
  };
  const examHeading = activeTest?.examHeader?.trim()
    || getStudentVisibleTestDescription(activeTest?.description)
    || activeTest?.title
    || "Exam Interface";
  const examSubheading = activeTest?.examSubheader?.trim() || activeTest?.className || activeTest?.subjectName || activeTest?.chapterName || "Online Test";
  const candidateDisplayName = user?.fullName ?? user?.username ?? "John Smith";
  const isCompactMobileRunner = mobileViewport.isMobile;
  const hideMobileExamHeader = isCompactMobileRunner && !showInstructions && !showSubmitReview;
  const questionWatermarkLines = useMemo(
    () => [user?.email?.trim(), user?.phone?.trim()].filter((value): value is string => Boolean(value)),
    [user?.email, user?.phone],
  );
  const defaultInstructionItems = getDefaultInstructionItems(activeTest?.durationMinutes ?? 30);
  const additionalInstructionItems = extractAdditionalInstructionItems(activeTest?.instructions, activeTest?.durationMinutes ?? 30);
  const calculatorEnabled = getCalculatorEnabledFromExamConfig(activeTest?.examConfig);
  const showRotateOverlay = Boolean(activeTest && mobileViewport.isMobile && mobileViewport.isPortrait && !allowPortraitTestView);

  useEffect(() => {
    if (!isCompactMobileRunner || !activeTest || showInstructions || showSubmitReview) return;
    const strip = mobileQuestionStripRef.current;
    if (!strip) return;

    const frameId = window.requestAnimationFrame(() => {
      const activeButton = strip.querySelector<HTMLElement>('[data-mobile-strip-current="true"]');
      activeButton?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeTest, currentQuestionIndex, isCompactMobileRunner, showInstructions, showSubmitReview]);

  const handleTimerTick = useCallback((seconds: number) => {
    timeLeftRef.current = seconds;
  }, []);
  const handleTimerExpire = useCallback(() => {
    const test = activeTestRef.current;
    const submitter = submitMutationRef.current;
    if (!test || submitter.isPending || autoSubmitTriggeredRef.current) return;
    if (Date.now() < autoSubmitRetryAtRef.current) return;
    autoSubmitTriggeredRef.current = true;
    timeLeftRef.current = 0;
    const current = test.questions[currentQuestionIndexRef.current];
    const finalVisitedSet = new Set(visitedSetRef.current);
    if (current) finalVisitedSet.add(current.id);
    submitter.mutate({
      answers: getCommittedAnswersSnapshot(),
      questionTimings: finalizeTimings(),
      visitedQuestionIds: Array.from(finalVisitedSet),
      reviewQuestionIds: Array.from(reviewSetRef.current),
      interactionLog: interactionLogRef.current,
      isAuto: true,
    });
  }, []);

  useEffect(() => {
    if (!activeTest || activeTest.submission) return;
    const intervalId = window.setInterval(() => {
      const nextSeconds = getCurrentTimeLeftSeconds();
      timeLeftRef.current = nextSeconds;
      if (nextSeconds <= 0) {
        handleTimerExpire();
      }
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [activeTest, handleTimerExpire]);

  const applyIntegerEdit = (transform: (value: string, start: number, end: number) => { value: string; caret: number }) => {
    if (!currentQuestion || currentQuestion.questionType !== "integer") return;
    const input = integerInputRef.current;
    const currentValue = getNumericAnswerValue(answers[currentQuestion.id]);
    const start = input?.selectionStart ?? currentValue.length;
    const end = input?.selectionEnd ?? currentValue.length;
    const next = transform(currentValue, start, end);
    setIntegerAnswer(currentQuestion.id, next.value);
    requestAnimationFrame(() => {
      const target = integerInputRef.current;
      if (!target) return;
      target.focus();
      target.setSelectionRange(next.caret, next.caret);
    });
  };

  const insertIntegerChar = (char: string) => {
    applyIntegerEdit((value, start, end) => ({
      value: value.slice(0, start) + char + value.slice(end),
      caret: start + char.length,
    }));
  };

  const backspaceIntegerChar = () => {
    applyIntegerEdit((value, start, end) => {
      if (start !== end) return { value: value.slice(0, start) + value.slice(end), caret: start };
      if (start === 0) return { value, caret: 0 };
      return { value: value.slice(0, start - 1) + value.slice(end), caret: start - 1 };
    });
  };

  const moveIntegerCaret = (direction: "left" | "right") => {
    requestAnimationFrame(() => {
      const input = integerInputRef.current;
      if (!input) return;
      const position = input.selectionStart ?? integerDisplayValue.length;
      const nextPosition = direction === "left"
        ? Math.max(0, position - 1)
        : Math.min(integerDisplayValue.length, position + 1);
      input.focus();
      input.setSelectionRange(nextPosition, nextPosition);
    });
  };

  const clearIntegerAnswer = () => {
    if (!currentQuestion || currentQuestion.questionType !== "integer") return;
    setIntegerAnswer(currentQuestion.id, "");
    requestAnimationFrame(() => integerInputRef.current?.focus());
  };

  return (
    <div className="space-y-7">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">My Tests</h1>
            <p className="mt-1 text-sm font-medium text-[#64748B]">
              Track upcoming papers, resume ongoing attempts, and review completed tests.
            </p>
          </div>

          <Button
            variant="outline"
            className="relative w-full overflow-visible self-start rounded-full border-[#E5E7EB] bg-white px-5 py-3 text-sm font-semibold text-[#111827] shadow-[0_8px_30px_rgba(15,23,42,0.04)] hover:bg-[#F8FAFC] sm:w-auto md:self-auto"
            onClick={() => {
              if (featureLocked) {
                setLocation(buildStudentUnlockPath({
                  feature: "tests",
                  kind: "feature",
                  returnTo: "/student/tests/review-bucket",
                }));
                return;
              }
              setLocation("/student/tests/review-bucket");
            }}
            data-testid="button-top-wrong-bucket"
          >
            <BookOpen className="mr-2 h-4 w-4 text-[#F97316]" />
            Review Bucket
            {visibleReviewBucketEntries.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#EF4444] px-1 text-[10px] font-bold text-white">
                {visibleReviewBucketEntries.length}
              </span>
            )}
          </Button>
        </div>

        {featureLocked ? (
          <div className="rounded-[24px] border border-[#F5D0A5] bg-[linear-gradient(135deg,#FFF8ED_0%,#FFFFFF_100%)] px-4 py-4 shadow-[0_10px_26px_rgba(249,115,22,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#B45309]">Locked access</p>
            <p className="mt-2 text-sm leading-6 text-[#6B7280]">
              Your test list stays visible. Payment will be asked only when you try to open a locked test.
            </p>
          </div>
        ) : null}

        <StudentTestsStatsBar
          total={testStats.total}
          upcoming={testStats.upcoming}
          active={testStats.active}
          completed={testStats.completed}
          averageScore={averageCompletedScore}
        />

        <div className="flex flex-col gap-3 rounded-[24px] border border-[#E5E7EB] bg-white px-3 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.05)] sm:px-4 md:flex-row md:items-center md:justify-between">
          <div className="grid w-full grid-cols-4 gap-1.5 md:flex md:w-auto md:flex-wrap md:items-center md:gap-2">
            {[
              { id: "all", label: "All" },
              { id: "upcoming", label: "Upcoming" },
              { id: "active", label: "Active" },
              { id: "completed", label: "Completed" },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`min-w-0 rounded-full px-2 py-2.5 text-center text-[13px] font-semibold transition-colors sm:text-sm md:px-6 md:text-base ${
                    isActive
                      ? "chip-orange-solid"
                      : "text-[#64748B] hover:text-[#0F172A]"
                  } whitespace-nowrap`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex w-full items-center gap-3 md:w-auto">
            <div className="relative w-full md:min-w-[220px]">
              <select
                value={subjectFilter}
                onChange={(event) => setSubjectFilter(event.target.value)}
                className="h-10 w-full appearance-none rounded-full border-0 bg-white py-2 pl-4 pr-11 text-sm font-semibold text-[#0F172A] outline-none sm:text-base"
              >
                <option value="all">All Subjects</option>
                {subjectOptions.map((subject) => (
                  <option key={subject} value={subject}>
                    {subject}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-[285px] animate-pulse rounded-[24px] border border-[#E5E7EB] bg-white" />
            ))}
          </div>
        ) : filteredTests.length === 0 ? (
          <Card className="rounded-[32px] border border-dashed border-[#CBD5E1] bg-white/80 shadow-none">
            <CardContent className="py-16 text-center">
              <ClipboardList size={44} className="mx-auto mb-4 text-[#94A3B8]" />
              <h3 className="text-2xl font-bold text-[#0F172A]">No tests found</h3>
              <p className="mx-auto mt-3 max-w-md text-sm font-medium text-[#64748B]">
                No tests match the current filters. Try another subject or switch back to all tests.
              </p>
              {(activeTab !== "all" || subjectFilter !== "all") && (
                <Button
                  className="chip-orange-solid mt-6 rounded-full px-5"
                  onClick={() => {
                    setActiveTab("all");
                    setSubjectFilter("all");
                  }}
                >
                  Clear filters
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filteredTests.map((test) => {
              const status = getStudentTestStatus(test);
              const detail = testDetailQueries[tests.findIndex((entry) => entry.id === test.id)]?.data;
              return (
                <StudentTestSeriesCard
                  key={test.id}
                  test={test}
                  status={status}
                  questionCount={questionCountByTestId[test.id] ?? null}
                  detail={detail}
                  locked={featureLocked}
                  hasSavedDraft={typeof window !== "undefined" && !!localStorage.getItem(getDraftKey(test.id))}
                  onPrimaryAction={() => {
                    if (featureLocked) {
                      setLocation(buildStudentUnlockPath({
                        feature: "tests",
                        kind: "test",
                        label: test.title,
                        subjectLabel: getStudentTestSubject(test),
                        returnTo: "/student/tests",
                      }));
                      return;
                    }
                    setPreviewTestId(test.id);
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={previewTest !== null} onOpenChange={(open) => !open && setPreviewTestId(null)}>
        <DialogContent
          hideClose
          className="max-h-[calc(100dvh-1rem)] max-w-[calc(100vw-1rem)] overflow-hidden rounded-[24px] border border-[#D8DEEF] bg-white p-0 shadow-[0_20px_56px_rgba(15,23,42,0.16)] sm:max-h-[44rem] sm:max-w-[820px] sm:rounded-[28px]"
        >
          {previewTest && (
            <div className="max-h-[calc(100dvh-1rem)] overflow-y-auto bg-white sm:max-h-[44rem]">
              <div className="flex flex-col gap-4 border-b border-[#ECEEF8] px-4 pb-5 pt-5 sm:flex-row sm:items-start sm:justify-between sm:px-8 sm:pb-7 sm:pt-6">
                <div>
                  <div className="inline-flex rounded-full border border-[#1F2937] px-3.5 py-1 text-sm font-semibold text-[#1F2937]">
                    {getStudentTestSubject(previewTest)}
                  </div>
                  {previewTestCategory ? (
                    <div className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getTestCategoryTone(previewTestCategory).chip}`}>
                      {getTestCategoryLabel(previewTestCategory)}
                    </div>
                  ) : null}
                  <h2 className="mt-4 max-w-[540px] text-[20px] font-bold tracking-tight text-[#111827] sm:mt-5 sm:text-[24px]">{previewTest.title}</h2>
                  <p className="mt-3 text-[14px] text-[#6B7280] sm:mt-4 sm:text-[15px]">
                    {getStudentVisibleTestDescription(previewTest.description) || `${getStudentTestSubject(previewTest)} practice test with exam-style timing and section flow.`}
                  </p>
                </div>
                <div className="flex items-start justify-between gap-3 sm:justify-end">
                  <div
                    className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold ${
                      previewAction === "result"
                        ? "bg-[#DCFCE7] text-[#166534]"
                        : previewAction === "resume"
                          ? "bg-[#FFEDD5] text-[#C2410C]"
                          : "border border-[#D1D5DB] text-[#6B7280]"
                    }`}
                  >
                    {previewAction === "result" ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Completed
                      </>
                    ) : previewAction === "resume" ? (
                      <>
                        <PlayCircle className="h-4 w-4" />
                        Ongoing
                        <span className="ml-1 h-1.5 w-1.5 rounded-full bg-[#F59E0B] shadow-[0_0_0_2px_rgba(245,158,11,0.14)]" />
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-4 w-4" />
                        Upcoming
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewTestId(null)}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-[#CBD5E1] text-[#6B7280] transition hover:bg-[#F8FAFC]"
                    aria-label="Close test preview"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="border-b border-[#ECEEF8] bg-[#F8F9FF] px-4 py-5 sm:px-8 sm:py-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="flex items-center gap-5">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EEF2FF] text-[#6366F1]">
                      <ClipboardList className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-[14px] font-medium uppercase tracking-[0.14em] text-[#6B7280]">Questions</p>
                      <p className="mt-1 text-[18px] font-bold text-[#111827]">{previewQuestionCount ?? "--"} Total</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-5">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#111827]">
                      <Clock className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-[14px] font-medium uppercase tracking-[0.14em] text-[#6B7280]">Duration</p>
                      <p className="mt-1 text-[18px] font-bold text-[#111827]">{previewTest.durationMinutes} Minutes</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-4 py-4 sm:px-8">
                <div className="grid gap-4 border-b border-[#ECEEF8] py-5 md:grid-cols-[220px_1fr]">
                  <p className="text-[16px] text-[#6B7280]">Scheduled Date</p>
                  <p className="text-left text-[16px] font-semibold text-[#111827] md:text-right md:text-[17px]">
                    {previewTest.scheduledAt ? format(new Date(previewTest.scheduledAt), "MMMM do, yyyy 'at' h:mm aa") : "Available now"}
                  </p>
                </div>

                {previewAction === "result" && previewDetail?.submission && (
                  <>
                    <div className="grid gap-4 border-b border-[#ECEEF8] py-5 md:grid-cols-[220px_1fr]">
                      <p className="text-[16px] text-[#6B7280]">Completed Date</p>
                      <p className="text-left text-[16px] font-semibold text-[#111827] md:text-right md:text-[17px]">
                        {format(new Date(previewDetail.submission.submittedAt), "MMMM do, yyyy 'at' h:mm aa")}
                      </p>
                    </div>
                    <div className="mt-6 rounded-[24px] border border-[#ECEEF8] bg-white px-5 py-5">
                      <div className="flex items-end justify-between gap-4">
                        <p className="text-[14px] font-semibold uppercase tracking-[0.16em] text-[#6B7280]">Final Score</p>
                        <p className="text-[18px] font-medium text-[#6B7280]">
                          <span className="text-[32px] font-bold text-[#6366F1]">{previewAnsweredCount}</span>
                          {" / "}
                          {previewQuestionCount ?? Math.round(previewDetail.submission.totalPoints)}
                        </p>
                      </div>
                      <div className="mt-5 h-4 overflow-hidden rounded-full bg-[#E9E7FF]">
                        <div
                          className="h-full rounded-full bg-[#6366F1]"
                          style={{ width: `${Math.max(0, Math.min(previewDetail.submission.percentage, 100))}%` }}
                        />
                      </div>
                      <p className="mt-4 text-right text-[15px] font-medium text-[#6B7280]">
                        {Math.round(previewDetail.submission.percentage)}% Accuracy
                      </p>
                    </div>
                  </>
                )}
              </div>

                <div className="flex flex-col-reverse gap-3 px-4 pb-5 pt-2 sm:flex-row sm:items-center sm:justify-end sm:gap-4 sm:px-8 sm:pb-7">
                  <button
                    type="button"
                    onClick={() => setPreviewTestId(null)}
                    className="w-full rounded-[18px] border-2 border-[#1F2937] px-7 py-2.5 text-[15px] font-semibold text-[#1F2937] transition hover:bg-[#F8FAFC] sm:w-auto sm:text-[16px]"
                  >
                    Close
                  </button>
                <button
                  type="button"
                  onClick={async () => {
                    const currentTest = previewTest;
                    const currentAction = previewAction;
                    setPreviewTestId(null);
                    if (!currentTest || !currentAction) return;
                    if (currentAction === "result") {
                      setLocation(`/student/tests/${currentTest.id}/analysis`);
                      return;
                    }
                    await openTestWithMode(currentTest.id, currentAction === "resume" ? "resume" : "fresh");
                  }}
                  className="w-full rounded-[18px] bg-[#6366F1] px-7 py-2.5 text-[15px] font-semibold text-white transition hover:bg-[#5558E8] sm:w-auto sm:text-[16px]"
                >
                  {previewAction === "result" ? "Full Analysis" : previewAction === "resume" ? "Resume Test" : "Start Test"}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Active Test Dialog ─── */}
      <Dialog open={activeTest !== null} onOpenChange={() => {}}>
        <DialogContent
          hideClose
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          className="inset-0 h-[100svh] max-h-[100svh] w-screen max-w-screen translate-x-0 translate-y-0 overflow-hidden rounded-none border-0 bg-white p-0 shadow-none sm:h-[100dvh] sm:max-h-[100dvh] sm:w-screen sm:max-w-screen sm:rounded-none sm:p-0 dark:bg-white"
        >
          {activeTest && (
            <>
              <div className="relative flex h-full min-h-0 flex-col overflow-x-hidden bg-white text-black [color-scheme:light]">
                {showRotateOverlay && (
                  <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/80 px-4 md:hidden">
                    <div className="w-full max-w-sm rounded-[28px] bg-white p-5 text-center shadow-[0_24px_70px_rgba(15,23,42,0.32)]">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#D97706]">Best On Landscape</p>
                      <h2 className="mt-2 text-xl font-bold text-[#111827]">Rotate your phone horizontally</h2>
                      <p className="mt-2 text-sm leading-6 text-[#64748B]">
                        Landscape mode is more stable during tests. We are trying auto-rotate, but some browsers may ask for permission.
                      </p>
                      <div className="mt-5 space-y-2">
                        <Button
                          className="chip-orange-solid w-full rounded-full px-4 py-3 text-sm font-semibold"
                          onClick={() => {
                            void requestLandscapeExperience();
                          }}
                        >
                          Rotate Now
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full rounded-full border-[#D6DFEA] px-4 py-3 text-sm font-semibold text-[#334155]"
                          onClick={() => setAllowPortraitTestView(true)}
                        >
                          Continue In Portrait
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
                {!hideMobileExamHeader && (
                  <div className="overflow-hidden border-b border-[#7f7f7f] bg-white text-black">
                    <div className="flex items-start justify-between gap-2 border-b border-[#a76d1c] px-2 py-2 sm:items-center sm:px-4">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#7f7f7f] bg-[#f3f3f3] text-[9px] font-bold text-[#57438f] sm:h-10 sm:w-10 sm:text-[10px]">EC</div>
                      <div className="min-w-0 flex-1 px-0.5 text-center leading-tight sm:px-4">
                        <p className="line-clamp-2 break-words text-[12px] font-bold uppercase tracking-[-0.03em] text-[#6e4ca5] [overflow-wrap:anywhere] sm:truncate sm:text-xl sm:tracking-tight">{examHeading}</p>
                        <p className="mt-0.5 line-clamp-2 break-words text-[10px] font-semibold uppercase text-[#3a8b2e] [overflow-wrap:anywhere] sm:truncate sm:text-xs">{examSubheading}</p>
                      </div>
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#7f7f7f] bg-[#f3f3f3] text-[9px] font-bold text-[#d58a00] sm:h-10 sm:w-10 sm:text-[10px]">QB</div>
                    </div>
                    <div className="flex flex-col items-start gap-2 bg-[#d7edf6] px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                      <p className="min-w-0 max-w-full break-words text-[13px] font-bold leading-5 text-[#4d4d4d] [overflow-wrap:anywhere] sm:truncate sm:text-[16px]">{showInstructions ? "Instructions" : activeTest.title}</p>
                      {!showInstructions && (
                        <div className="flex w-full items-center justify-between gap-2 md:hidden">
                          <div className="flex min-w-0 items-center gap-2">
                            {calculatorEnabled ? (
                              <button
                                type="button"
                                onClick={openScientificCalculator}
                                className="inline-flex min-w-0 items-center gap-1 rounded-sm border border-[#7f7f7f] bg-white px-2 py-1 text-[12px] font-semibold text-[#2b2b2b] shadow-sm hover:bg-[#f6f6f6] sm:text-[13px]"
                              >
                                <Calculator size={13} />
                                Calculator
                              </button>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {isCompactMobileRunner ? (
                              <LiveTimeIndicator
                                initialSeconds={timerInitialSeconds}
                                deadlineAtMs={timerDeadlineMs}
                                onTick={handleTimerTick}
                                onExpire={handleTimerExpire}
                                className="max-w-full shrink-0 rounded-sm bg-white/60 px-2 py-1 font-mono text-[12px] font-bold sm:text-[14px]"
                              />
                            ) : null}
                            <button
                              type="button"
                              onClick={openSubmitReview}
                              disabled={submitMutation.isPending}
                              aria-label="Submit test"
                              title="Submit test"
                              className="inline-flex h-9 touch-manipulation items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-[#fecaca] bg-[#ef4444] px-3 text-[11px] font-bold text-white shadow-[0_10px_24px_rgba(239,68,68,0.28)] ring-2 ring-white/80 transition hover:bg-[#dc2626] disabled:cursor-not-allowed disabled:opacity-60"
                              data-testid="button-submit-test-mobile"
                            >
                              <CheckCircle2 className="h-4 w-4" strokeWidth={2.4} />
                              <span>Submit</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {showInstructions ? (
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white text-black md:flex-row">
                    <div className="min-h-0 flex-1 overflow-y-auto bg-white p-4 sm:p-6 md:border-r md:border-[#2f2f2f]">
                      <div className="mx-auto max-w-5xl space-y-6">
                        <div className="text-center">
                          <h2 className="text-[16px] font-bold text-black">General Instructions</h2>
                        </div>
                        <div className="space-y-4 text-[14px] leading-7 text-black">
                          <p><strong>Please read the following carefully.</strong></p>
                          <p><strong>Calculator:</strong> {calculatorEnabled ? "An on-screen calculator is available for this test." : "Calculator use is disabled for this test."}</p>
                          <ol className="list-decimal space-y-3 pl-5">
                            {defaultInstructionItems.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ol>
                          {additionalInstructionItems.length > 0 && (
                            <div className="rounded-sm border border-[#d0d0d0] bg-[#fafcff] p-4">
                              <h3 className="text-[15px] font-bold text-black">Additional Planner Instructions</h3>
                              <ol className="mt-3 list-decimal space-y-3 pl-5">
                                {additionalInstructionItems.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ol>
                            </div>
                          )}
                        <div className="max-w-2xl border border-[#7f7f7f] bg-white">
                          <div className="grid divide-y divide-[#7f7f7f]">
                            {[
                              { label: "Not Visited", cls: paletteStyle["not-visited"] },
                              { label: "Not Answered", cls: paletteStyle["not-answered"] },
                              { label: "Answered", cls: paletteStyle["answered"] },
                              { label: "Marked For Review", cls: paletteStyle["review"] },
                              { label: "Answered & Marked For Review", cls: paletteStyle["answered-review"] },
                            ].map((item, index) => (
                              <div key={item.label} className="flex items-center gap-3 px-3 py-2">
                                {renderPaletteBadge(index + 1, ["not-visited", "not-answered", "answered", "review", "answered-review"][index] as PaletteStatus, "sm")}
                                <span className="text-sm text-black">{item.label}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        </div>
                        <div className="flex justify-end gap-3 border-t border-[#d0d0d0] pt-4">
                          <Button variant="outline" className="rounded-none border-[#bdbdbd] bg-white text-black hover:bg-[#f3f3f3]" onClick={exitTest}>Exit</Button>
                          <Button className="rounded-none border border-[#bdbdbd] bg-white text-black shadow-none hover:bg-[#f3f3f3]" onClick={() => { setShowInstructions(false); if (activeTest.questions[currentQuestionIndex]) startInteraction(activeTest.questions[currentQuestionIndex].id); }}>Next</Button>
                        </div>
                      </div>
                    </div>
                    <aside className="border-t border-[#d0d0d0] bg-[#f5f5f5] md:flex md:w-[250px] md:shrink-0 md:flex-col md:border-l md:border-t-0 md:border-[#2f2f2f]">
                      <div className="flex flex-row items-center gap-4 px-4 py-5 text-left md:flex-1 md:flex-col md:text-center">
                        <div className="flex h-28 w-24 items-center justify-center overflow-hidden rounded-sm border border-[#7f7f7f] bg-white shadow-inner">
                          {user && (user as any).avatarUrl ? (
                            <img src={(user as any).avatarUrl} alt={user.fullName ?? user.username ?? "Candidate"} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_35%,#dce8f4,#8ea4bf_65%,#5d728e)] text-[10px] font-bold text-white">PHOTO</div>
                          )}
                        </div>
                        <div className="md:mt-6">
                          <p className="text-[14px] font-bold text-[#607a98]">Candidate</p>
                          <p className="mt-1 text-sm font-semibold text-[#607a98]">{user?.fullName ?? user?.username ?? "John Smith"}</p>
                        </div>
                      </div>
                    </aside>
                  </div>
                ) : showSubmitReview ? (
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white text-black">
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      <div className="flex items-center justify-between gap-3 border-b border-[#7f7f7f] bg-[#2f2f2f] px-3 py-2 text-sm font-bold uppercase tracking-wide text-[#e4d947] sm:px-4">
                        <span className="truncate">{activeTest.title}</span>
                        <div className="hidden items-center gap-4 text-[12px] font-semibold normal-case tracking-normal text-white sm:flex">
                          <button type="button" className="inline-flex items-center gap-1.5 opacity-90 transition hover:opacity-100">
                            <AlertCircle size={13} className="text-[#75cf71]" />
                            Accessibility
                          </button>
                          <button type="button" className="inline-flex items-center gap-1.5 opacity-90 transition hover:opacity-100">
                            <Search size={13} className="text-[#f0b03d]" />
                            Screen Magnifier
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowSubmitReview(false);
                              setShowInstructions(true);
                            }}
                            className="inline-flex items-center gap-1.5 opacity-90 transition hover:opacity-100"
                          >
                            <BookOpen size={13} className="text-[#63a5ff]" />
                            Instructions
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowSubmitReview(false)}
                            className="inline-flex items-center gap-1.5 opacity-90 transition hover:opacity-100"
                          >
                            <FileText size={13} className="text-[#76d27d]" />
                            Question Paper
                          </button>
                        </div>
                      </div>
                      <div className="overflow-x-auto px-2 py-3 sm:px-3 sm:py-4">
                        <table className="min-w-full border-collapse border border-[#7f7f7f] text-left text-[12px] sm:text-[13px]">
                          <thead className="bg-[#f8f8f8]">
                            <tr>
                              <th className="whitespace-nowrap border border-[#7f7f7f] px-2 py-2.5 font-bold uppercase tracking-wide text-black sm:px-3">Section Name</th>
                              <th className="whitespace-nowrap border border-[#7f7f7f] px-2 py-2.5 font-bold uppercase tracking-wide text-black sm:px-3">No. of Questions</th>
                              <th className="whitespace-nowrap border border-[#7f7f7f] px-2 py-2.5 font-bold uppercase tracking-wide text-black sm:px-3">Answered</th>
                              <th className="whitespace-nowrap border border-[#7f7f7f] px-2 py-2.5 font-bold uppercase tracking-wide text-black sm:px-3">Not Answered</th>
                              <th className="whitespace-nowrap border border-[#7f7f7f] px-2 py-2.5 font-bold uppercase tracking-wide text-black sm:px-3">Marked for Review</th>
                              <th className="whitespace-nowrap border border-[#7f7f7f] px-2 py-2.5 font-bold uppercase tracking-wide text-black sm:px-3">Answered and Marked for Review</th>
                              <th className="whitespace-nowrap border border-[#7f7f7f] px-2 py-2.5 font-bold uppercase tracking-wide text-black sm:px-3">Not Visited</th>
                            </tr>
                          </thead>
                          <tbody>
                            {submitSectionSummaries.map((section) => (
                              <tr key={section.id} className="bg-white">
                                <td className="border border-[#7f7f7f] px-2 py-2.5 text-black sm:px-3">{section.label}</td>
                                <td className="border border-[#7f7f7f] px-2 py-2.5 text-black sm:px-3">{section.totalQuestions}</td>
                                <td className="border border-[#7f7f7f] px-2 py-2.5 text-black sm:px-3">{section.answered}</td>
                                <td className="border border-[#7f7f7f] px-2 py-2.5 text-black sm:px-3">{section.notAnswered}</td>
                                <td className="border border-[#7f7f7f] px-2 py-2.5 text-black sm:px-3">{section.markedForReview}</td>
                                <td className="border border-[#7f7f7f] px-2 py-2.5 text-black sm:px-3">{section.answeredAndMarkedForReview}</td>
                                <td className="border border-[#7f7f7f] px-2 py-2.5 text-black sm:px-3">{section.notVisited}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex flex-col items-center justify-center gap-5 px-4 py-8 text-center">
                        <p className="text-base font-medium text-black sm:text-lg">Are you sure you want to submit this group of questions for marking?</p>
                        <div className="flex flex-wrap items-center justify-center gap-3">
                          <button
                            type="button"
                            onClick={() => setShowSubmitReview(false)}
                            className="min-w-[170px] rounded-[4px] bg-[#737981] px-6 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-[#646a72]"
                          >
                            No! Go Back to Paper
                          </button>
                          <button
                            type="button"
                            onClick={() => submitMutation.mutate({})}
                            disabled={submitMutation.isPending}
                            className="min-w-[170px] rounded-[4px] bg-[#df5a55] px-6 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-[#cc4b46] disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {submitMutation.isPending ? "Submitting..." : "Yes! Submit the Test"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : currentQuestion ? (
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <div className="flex min-h-0 flex-1 overflow-hidden">
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white md:border-r md:border-slate-300">
                      <div className="border-b border-slate-300 bg-white md:hidden">
                        <div className="flex items-start justify-between gap-3 px-2.5 py-2.5">
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6e4ca5]">
                              {currentSection?.label ?? examSubheading}
                            </p>
                            <p className="mt-0.5 text-[12px] font-bold text-black">
                              Question {currentQuestionIndex + 1}/{totalQ}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <LiveTimeIndicator
                              initialSeconds={timerInitialSeconds}
                              deadlineAtMs={timerDeadlineMs}
                              onTick={handleTimerTick}
                              onExpire={handleTimerExpire}
                              className="rounded-md bg-[#eef3f8] px-2 py-1 font-mono text-[12px] font-bold text-[#1f2937]"
                            />
                            <button
                              type="button"
                              onClick={openSubmitReview}
                              disabled={submitMutation.isPending}
                              aria-label="Submit test"
                              title="Submit test"
                              className="inline-flex h-8 touch-manipulation items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-[#fecaca] bg-[#ef4444] px-2.5 text-[11px] font-bold text-white shadow-[0_8px_18px_rgba(239,68,68,0.24)] transition hover:bg-[#dc2626] disabled:cursor-not-allowed disabled:opacity-60"
                              data-testid="button-submit-test-mobile"
                            >
                              <CheckCircle2 className="h-4 w-4" strokeWidth={2.4} />
                              <span>Submit</span>
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 border-t border-slate-200 px-2.5 py-2">
                          {calculatorEnabled ? (
                            <button
                              type="button"
                              onClick={openScientificCalculator}
                              className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-[12px] font-semibold text-[#334155] shadow-sm hover:bg-[#f8fafc]"
                            >
                              <Calculator className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                          <div ref={mobileQuestionStripRef} className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5">
                            {allQuestionEntries.map(({ question, globalIndex }) => {
                              const status = getPaletteStatus(question);
                              const isCurrent = currentQuestion?.id === question.id;
                              return (
                                <button
                                  key={`mobile-strip-${question.id}`}
                                  type="button"
                                  onClick={() => goToQuestion(globalIndex)}
                                  className={`shrink-0 rounded-md bg-transparent p-0.5 transition ${
                                    isCurrent ? "ring-2 ring-[#2563eb] ring-offset-1 ring-offset-white" : ""
                                  }`}
                                  aria-current={isCurrent ? "true" : undefined}
                                  data-mobile-strip-current={isCurrent ? "true" : "false"}
                                >
                                  {renderPaletteBadge(globalIndex + 1, status, "sm")}
                                </button>
                              );
                            })}
                          </div>
                          <button
                            type="button"
                            onClick={() => setMobilePaletteOpen(true)}
                            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 text-[12px] font-semibold text-[#334155] shadow-sm hover:bg-[#f8fafc]"
                          >
                            <PanelRightOpen className="h-3.5 w-3.5" />
                            Open Palette
                          </button>
                        </div>
                      </div>
                      <div className="hidden border-b border-slate-300 bg-white px-1.5 py-1.5 md:block">
                        <div className="flex items-center justify-between gap-2 px-0.5">
                          <p className="text-[13px] font-bold text-[#5b5b5b]">Sections</p>
                          {calculatorEnabled ? (
                            <button
                              type="button"
                              onClick={openScientificCalculator}
                              className="hidden md:flex h-7 w-7 items-center justify-center rounded-[4px] border border-[#f7d28f] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] hover:bg-[#fff8eb]"
                              aria-label="Open calculator"
                            >
                              <Calculator className="h-4 w-4 text-[#f59e0b]" strokeWidth={2.25} />
                            </button>
                          ) : (
                            <span className="hidden md:block h-7 w-7" />
                          )}
                        </div>
                        <div ref={sectionInfoAreaRef} className="mx-0 mt-1.5 relative flex items-center overflow-visible border-y border-slate-300 bg-white sm:-mx-1.5">
                          <div className="min-w-0 flex-1 overflow-x-auto overflow-y-visible px-2 py-1">
                            <div className="flex min-w-max items-center gap-2 text-xs font-medium">
                              {sectionGroups.map((section) => {
                                const isActiveSection = currentSection?.id === section.id;
                                return (
                                  <div key={section.id} className="relative shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenSectionInfoId(null);
                                        const firstQuestion = section.questionEntries[0];
                                        if (firstQuestion) goToQuestion(firstQuestion.globalIndex);
                                      }}
                                      className={`whitespace-nowrap rounded-sm border ${isCompactMobileRunner ? "px-3 py-1.5 text-[11px]" : "pl-3 pr-10 py-1.5"} shadow-sm transition-colors ${
                                        isActiveSection
                                          ? "border-[#7aa9d4] bg-[#7aa9d4] text-white"
                                          : "border-slate-300 bg-white text-[#4b6f96] hover:border-[#7aa9d4]"
                                      }`}
                                    >
                                      <span className="block max-w-[190px] truncate">{section.label}</span>
                                    </button>
                                    <button
                                      type="button"
                                      onMouseEnter={(event) => openSectionInfo(section.id, event.currentTarget.parentElement)}
                                      onMouseLeave={scheduleCloseSectionInfo}
                                      onFocus={(event) => openSectionInfo(section.id, event.currentTarget.parentElement)}
                                      onBlur={scheduleCloseSectionInfo}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        openSectionInfo(section.id, event.currentTarget.parentElement);
                                      }}
                                      className={`absolute right-2 top-1/2 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-[#78b2eb] bg-[#70b6f4] text-white transition-colors hover:bg-[#62acef] md:flex ${
                                        isActiveSection ? "border-[#8dc3f6] bg-[#7ec0f5]" : ""
                                      }`}
                                      aria-label={`Show ${section.label} details`}
                                    >
                                      <Info className="h-3.5 w-3.5" strokeWidth={2.5} />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          {openSectionInfoSection && openSectionInfoCounts && (
                            <div
                              className="absolute top-full z-40 mt-2 w-[280px] overflow-hidden rounded-md border border-[#aebcc6] bg-[#dff1fa] shadow-none"
                              style={{ left: `${sectionInfoPopupLeft}px` }}
                              onMouseEnter={() => openSectionInfo(openSectionInfoSection.id)}
                              onMouseLeave={scheduleCloseSectionInfo}
                            >
                              <div className="border-b border-[#aebcc6] px-3 py-2 text-[13px] font-semibold text-black">
                                {openSectionInfoSection.label}
                              </div>
                              <div className="space-y-2 px-3 py-2">
                                <div className="flex items-center gap-2">{renderPaletteBadge(openSectionInfoCounts.answered, "answered", "sm")}<p className="text-[13px] font-medium leading-5 text-[#2f2f2f]">Answered</p></div>
                                <div className="flex items-center gap-2">{renderPaletteBadge(openSectionInfoCounts.notAnswered, "not-answered", "sm")}<p className="text-[13px] font-medium leading-5 text-[#2f2f2f]">Not Answered</p></div>
                                <div className="flex items-center gap-2">{renderPaletteBadge(openSectionInfoCounts.notVisited, "not-visited", "sm")}<p className="text-[13px] font-medium leading-5 text-[#2f2f2f]">Not Visited</p></div>
                                <div className="flex items-center gap-2">{renderPaletteBadge(openSectionInfoCounts.review, "review", "sm")}<p className="text-[13px] font-medium leading-5 text-[#2f2f2f]">Marked for Review</p></div>
                                <div className="flex items-center gap-2">{renderPaletteBadge(openSectionInfoCounts.answeredReview, "answered-review", "sm")}<p className="text-[13px] font-medium leading-5 text-[#2f2f2f]">Answered & Marked for Review</p></div>
                              </div>
                            </div>
                          )}
                          {!isCompactMobileRunner ? (
                            <LiveTimeIndicator
                              initialSeconds={timerInitialSeconds}
                              deadlineAtMs={timerDeadlineMs}
                              onTick={handleTimerTick}
                              onExpire={handleTimerExpire}
                              className="hidden h-[48px] shrink-0 items-center px-3 text-[13px] font-bold md:flex"
                            />
                          ) : null}
                        </div>
                      </div>
                      <div className="hidden flex-col gap-2 border-b border-slate-300 bg-white px-2 py-2 sm:flex-row sm:items-center sm:justify-between md:flex">
                        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[13px] font-bold text-black">Question Type: {currentQuestion.questionType.toUpperCase()}</span>
                          </div>
                        </div>
                        <div className="hidden text-[13px] text-black sm:block">Marks for correct answer: <span className="font-bold">{currentQuestion.points}</span> | Negative Marks: <span className="font-bold text-[#c55f00]">{getNegativeMark(currentQuestion)}</span></div>
                        <button
                          type="button"
                          onClick={() => setMobilePaletteOpen(true)}
                          className="inline-flex touch-manipulation items-center gap-1 rounded-sm border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 md:hidden"
                        >
                          <PanelRightOpen size={14} />
                          Palette
                        </button>
                      </div>

                      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain bg-white px-2 py-2 pb-44 sm:px-4 sm:py-3 sm:pb-6">
                        <div className="relative mx-auto max-w-full overflow-hidden">
                          {!isCompactMobileRunner && questionWatermarkLines.length > 0 && (
                            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
                              <div className="grid min-h-full grid-cols-2 justify-items-center gap-x-14 gap-y-16 px-2 py-5 sm:grid-cols-3 sm:gap-x-20 sm:gap-y-20 lg:grid-cols-4">
                                {Array.from({ length: 12 }).map((_, index) => (
                                  <div
                                    key={index}
                                    className="flex min-h-[88px] min-w-[150px] select-none flex-col items-center justify-center whitespace-nowrap text-center text-[14px] font-semibold leading-[1.15] tracking-[0.01em] text-[#b9c7db]/45 sm:min-h-[104px] sm:min-w-[190px] sm:text-[16px]"
                                    style={{ transform: "rotate(-47deg)", transformOrigin: "center" }}
                                  >
                                    {questionWatermarkLines.map((line, lineIndex) => (
                                      <span key={`${index}-${lineIndex}`}>{line}</span>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="relative z-10 space-y-4">
                            <div className="text-[12px] font-semibold text-black sm:text-[13px]">
                              Question No. {currentSectionQuestionNumber}
                            </div>
                            <RichQuestionContent content={currentQuestion.question} className="max-w-full text-[14px] leading-6 text-slate-900 [overflow-wrap:anywhere] sm:text-base sm:leading-7" />
                            {currentQuestion.imageData && <img src={currentQuestion.imageData} alt="" className="mx-auto max-h-[240px] w-auto max-w-full rounded-xl border border-slate-200 object-contain bg-white sm:max-h-[420px]" />}

                            {(currentQuestion.questionType === "mcq" || currentQuestion.questionType === "multi") && (
                              <div className="space-y-3">
                                {currentQuestion.options.map((opt, i) => {
                                  const selected = currentQuestion.questionType === "multi"
                                    ? (((answers[currentQuestion.id] as number[] | undefined) ?? []).includes(i))
                                    : Number(answers[currentQuestion.id]) === i;
                                  const optImg = currentQuestion.optionImages?.[i];
                                  return (
                                    <button
                                      key={i}
                                      type="button"
                                      onClick={() => currentQuestion.questionType === "multi" ? toggleMultiAnswer(currentQuestion.id, i) : setMcqAnswer(currentQuestion.id, i)}
                                      className="relative w-full max-w-full touch-manipulation overflow-hidden border-0 bg-transparent px-1 py-2 text-left"
                                      data-testid={`option-${currentQuestion.id}-${i}`}
                                    >
                                      <div className="flex items-start gap-3 sm:gap-4">
                                        {currentQuestion.questionType === "multi" ? (
                                          <span
                                            className={`mt-[6px] flex h-6 w-6 shrink-0 items-center justify-center border-[2px] sm:h-7 sm:w-7 ${
                                              selected ? "border-[#1f7aff] bg-[#1f7aff]" : "border-[#9ca3af] bg-white"
                                            }`}
                                            aria-hidden="true"
                                          >
                                            {selected ? <span className="text-[14px] font-bold leading-none text-white sm:text-[16px]">✓</span> : null}
                                          </span>
                                        ) : (
                                          <span
                                            className={`relative mt-[5px] h-6 w-6 shrink-0 rounded-full border-[3px] sm:h-7 sm:w-7 ${
                                              selected ? "border-[#1677ff]" : "border-[#a8adb4]"
                                            } bg-white`}
                                            aria-hidden="true"
                                          >
                                            {selected ? (
                                              <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1677ff] sm:h-3.5 sm:w-3.5" />
                                            ) : null}
                                          </span>
                                        )}
                                        <div className="min-w-0 flex-1">
                                          <div
                                            className="pt-[1px] text-[15px] leading-[1.45] text-[#161616] sm:text-[24px] sm:leading-[1.45]"
                                            style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
                                          >
                                            <RichQuestionContent
                                              content={opt}
                                              className="[&_*]:font-inherit [&_*]:text-inherit [&_*]:leading-inherit"
                                            />
                                          </div>
                                          {optImg && <img src={optImg} alt="" className="mt-3 max-h-28 w-auto max-w-full rounded-lg border border-slate-200 object-contain bg-white sm:max-h-40" />}
                                        </div>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            {currentQuestion.questionType === "integer" && (
                              <div className="mx-auto w-[142px] border border-[#ececec] bg-[#efefef] px-[7px] py-[6px] sm:mx-0 sm:w-[146px]">
                                <input
                                  ref={integerInputRef}
                                  type="text"
                                  inputMode="decimal"
                                  value={integerDisplayValue}
                                  onChange={(e) => setIntegerAnswer(currentQuestion.id, e.target.value)}
                                  placeholder=""
                                  className="h-[30px] w-full rounded-[4px] border-2 border-[#7a7a7a] bg-white px-[6px] text-left text-[18px] font-semibold leading-none text-black outline-none focus:border-[#7a7a7a]"
                                  data-testid={`integer-input-${currentQuestion.id}`}
                                />
                                  <div className="mt-[10px] flex flex-col items-center gap-[6px]">
                                    <button
                                      type="button"
                                      onClick={backspaceIntegerChar}
                                      className="flex h-[32px] w-[94px] items-center justify-center rounded-[8px] border-2 border-[#7a7a7a] bg-[#e8e5f1] text-[12px] font-bold tracking-[-0.02em] text-black hover:bg-[#e1ddee] sm:h-[34px] sm:w-[98px] sm:text-[13px]"
                                    >
                                      Backspace
                                    </button>

                                    <div className="grid grid-cols-3 gap-[6px]">
                                    {[
                                      ["7", "8", "9"],
                                      ["4", "5", "6"],
                                      ["1", "2", "3"],
                                      ["0", ".", "-"],
                                    ].flat().map((key) => (
                                      <button
                                        key={key}
                                        type="button"
                                        onClick={() => insertIntegerChar(key)}
                                        className="flex h-[34px] w-[34px] items-center justify-center rounded-[8px] border-2 border-[#7a7a7a] bg-[#f8f8f8] text-[16px] font-bold leading-none text-black hover:bg-white sm:h-[36px] sm:w-[36px] sm:text-[18px]"
                                      >
                                        {key}
                                      </button>
                                    ))}
                                  </div>

                                  <div className="grid grid-cols-2 gap-[6px]">
                                    <button
                                      type="button"
                                      onClick={() => moveIntegerCaret("left")}
                                      className="flex h-[28px] w-[40px] items-center justify-center rounded-[7px] border-2 border-[#7a7a7a] bg-[#e8e5f1] text-[16px] font-bold leading-none text-black hover:bg-[#e1ddee] sm:h-[30px] sm:w-[42px] sm:text-[18px]"
                                    >
                                      ←
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => moveIntegerCaret("right")}
                                      className="flex h-[28px] w-[40px] items-center justify-center rounded-[7px] border-2 border-[#7a7a7a] bg-[#e8e5f1] text-[16px] font-bold leading-none text-black hover:bg-[#e1ddee] sm:h-[30px] sm:w-[42px] sm:text-[18px]"
                                    >
                                      →
                                    </button>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={clearIntegerAnswer}
                                    className="flex h-[32px] w-[92px] items-center justify-center rounded-[8px] border-2 border-[#7a7a7a] bg-[#e8e5f1] text-[12px] font-bold tracking-[-0.02em] text-black hover:bg-[#e1ddee] sm:h-[34px] sm:w-[96px] sm:text-[13px]"
                                  >
                                    Clear All
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div
                        className="sticky bottom-0 z-10 overflow-x-hidden border-t border-slate-300 bg-white px-2 py-2 md:hidden"
                        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
                      >
                        <div className="mx-auto max-w-full space-y-2 md:hidden">
                          <div className="grid min-w-0 grid-cols-3 gap-2">
                            <Button
                              variant="outline"
                              className="h-10 min-w-0 touch-manipulation rounded-md border border-[#bdbdbd] bg-white px-2 py-2 text-[10px] font-semibold leading-tight text-black shadow-none hover:bg-[#f3f3f3] disabled:bg-[#f5f5f5] disabled:text-[#9a9a9a]"
                              onClick={previousQuestion}
                              disabled={currentQuestionIndex === 0}
                            >
                              <span className="inline-flex items-center gap-1.5">
                                <ChevronLeft className="h-3.5 w-3.5" />
                                <span>Previous</span>
                              </span>
                            </Button>
                            <Button
                              variant="outline"
                              className="h-10 min-w-0 touch-manipulation rounded-md border border-[#bdbdbd] bg-white px-2 py-2 text-[10px] font-semibold leading-tight text-black shadow-none hover:bg-[#f3f3f3]"
                              onClick={() => clearResponse(currentQuestion)}
                            >
                              <span className="inline-flex items-center gap-1.5">
                                <Eraser className="h-3.5 w-3.5" />
                                <span>Clear</span>
                              </span>
                            </Button>
                            <Button
                              variant="outline"
                              className="h-10 min-w-0 touch-manipulation rounded-md border border-[#bdbdbd] bg-white px-2 py-2 text-[10px] font-semibold leading-tight text-black shadow-none hover:bg-[#f3f3f3]"
                              onClick={markForReviewAndNext}
                            >
                              <span className="inline-flex items-center gap-1.5">
                                <BookmarkPlus className="h-3.5 w-3.5" />
                                <span>{currentQuestionIndex === totalQ - 1 ? "Mark Review" : "Review & Next"}</span>
                              </span>
                            </Button>
                          </div>
                          <div className="grid min-w-0 grid-cols-1 gap-2">
                            <Button
                              className="h-10 min-w-0 touch-manipulation rounded-md border border-[#6d9cc8] bg-[#4a8ac5] px-2 py-2 text-[10px] font-semibold leading-tight text-white shadow-none hover:bg-[#417bb1]"
                              onClick={saveAndNext}
                            >
                              <span className="inline-flex items-center gap-1.5">
                                {currentQuestionIndex === totalQ - 1 ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
                                <span>{currentQuestionIndex === totalQ - 1 ? "Save" : "Save & Next"}</span>
                              </span>
                            </Button>
                          </div>
                        </div>

                      </div>
                    </div>

                    {mobilePaletteOpen && (
                      <div className="absolute inset-0 z-20 bg-black/45 md:hidden" onClick={() => setMobilePaletteOpen(false)}>
                        <div
                          className="absolute inset-x-0 bottom-0 max-h-[78vh] overflow-hidden rounded-t-[24px] border-t border-slate-300 bg-[#d9eaf5] shadow-2xl"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <div className="flex items-center justify-between border-b border-[#c8c8c8] bg-white px-4 py-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">Question Palette</p>
                              <p className="text-xs text-slate-500">{currentSectionAnsweredCount}/{currentSectionQuestions.length} answered</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setMobilePaletteOpen(false)}
                              className="rounded-sm border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                            >
                              Close
                            </button>
                          </div>
                          <div className="no-scrollbar max-h-[calc(82vh-57px)] overflow-y-auto">
                            <div className="border-b border-[#c8c8c8] bg-white px-3 py-3">
                              <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-[11px]">
                                <div className="flex items-start gap-1.5">{renderPaletteBadge(currentSectionAnsweredCount, "answered", "sm")}<div><p className="font-medium leading-4 text-black">Answered</p></div></div>
                                <div className="flex items-start gap-1.5">{renderPaletteBadge(currentSectionNotAnsweredCount, "not-answered", "sm")}<div><p className="font-medium leading-4 text-black">Not Answered</p></div></div>
                                <div className="flex items-start gap-1.5">{renderPaletteBadge(currentSectionNotVisitedCount, "not-visited", "sm")}<div><p className="font-medium leading-4 text-black">Not Visited</p></div></div>
                                <div className="flex items-start gap-1.5">{renderPaletteBadge(currentSectionReviewCount, "review", "sm")}<div><p className="font-medium leading-4 text-black">Marked for Review</p></div></div>
                                <div className="col-span-2 flex items-start gap-1.5">{renderPaletteBadge(currentSectionAnsweredReviewCount, "answered-review", "sm")}<div><p className="font-medium leading-4 text-black">Answered & Marked for Review</p></div></div>
                              </div>
                            </div>

                            <div className="bg-[#d9eaf5]">
                              <p className="bg-[#2a85b8] px-3 py-2 text-sm font-bold text-white">{currentSection?.label ?? activeTest.subjectName ?? "Section"}</p>
                              <p className="px-4 py-3 text-[13px] font-semibold text-black">Choose a Question</p>
                            </div>

                            <div className="grid grid-cols-4 gap-2 px-4 pb-4 sm:grid-cols-5">
                              {currentSectionQuestions.map(({ question, globalIndex }, index) => {
                                const status = getPaletteStatus(question);
                                const isCurrent = currentQuestion.id === question.id;
                                return (
                                  <button
                                    key={question.id}
                                    type="button"
                                    onClick={() => {
                                      goToQuestion(globalIndex);
                                      setMobilePaletteOpen(false);
                                    }}
                                    className="flex h-[56px] touch-manipulation items-center justify-center bg-transparent outline-none focus:outline-none focus-visible:outline-none"
                                    aria-current={isCurrent ? "true" : undefined}
                                  >
                                    {renderPaletteBadge(index + 1, status)}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {!paletteCollapsed && (
                      <aside className="relative hidden min-h-0 w-[244px] shrink-0 flex-col border-l border-[#b8b8b8] bg-[#d9eaf5] md:flex">
                        <button
                          type="button"
                          onClick={() => setPaletteCollapsed(true)}
                          className="absolute left-0 top-1/2 z-20 flex h-[44px] w-[18px] -translate-x-full -translate-y-1/2 items-center justify-center rounded-l-[3px] bg-black text-white hover:bg-[#111111]"
                          aria-label="Collapse question palette"
                        >
                          <ChevronRight className="h-[13px] w-[13px]" strokeWidth={2.5} />
                        </button>

                        <div className="border-b border-[#c8c8c8] bg-[#eef3f8]">
                          <div className="flex min-w-0 items-start gap-3 px-2.5 py-2.5">
                            <div className="flex h-[94px] w-[80px] shrink-0 items-center justify-center overflow-hidden border border-[#b7b7b7] bg-white shadow-inner">
                              {user && (user as any).avatarUrl ? (
                                <img src={(user as any).avatarUrl} alt={candidateDisplayName} className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_35%,#eef2f8,#98a8bc_65%,#5d728e)] text-[10px] font-bold text-white">
                                  PHOTO
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 pt-1.5">
                              <p className="truncate text-[15px] font-bold leading-tight text-[#2f3b48]">{candidateDisplayName}</p>
                            </div>
                          </div>
                        </div>

                        <div className="flex min-h-0 flex-1 flex-col bg-[#d9eaf5]">
                          <div className="shrink-0 border-b border-[#c8c8c8] bg-white px-3 py-3">
                            <div className="grid grid-cols-2 gap-x-3 gap-y-3 text-[11px]">
                              <div className="flex items-start gap-1.5">{renderPaletteBadge(currentSectionAnsweredCount, "answered", "sm")}<div><p className="font-medium leading-4 text-black">Answered</p></div></div>
                              <div className="flex items-start gap-1.5">{renderPaletteBadge(currentSectionNotAnsweredCount, "not-answered", "sm")}<div><p className="font-medium leading-4 text-black">Not Answered</p></div></div>
                              <div className="flex items-start gap-1.5">{renderPaletteBadge(currentSectionNotVisitedCount, "not-visited", "sm")}<div><p className="font-medium leading-4 text-black">Not Visited</p></div></div>
                              <div className="flex items-start gap-1.5">{renderPaletteBadge(currentSectionReviewCount, "review", "sm")}<div><p className="font-medium leading-4 text-black">Marked for Review</p></div></div>
                              <div className="col-span-2 flex items-start gap-1.5">{renderPaletteBadge(currentSectionAnsweredReviewCount, "answered-review", "sm")}<div><p className="font-medium leading-4 text-black">Answered & Marked for Review (will also be evaluated)</p></div></div>
                            </div>
                          </div>

                          <div className="shrink-0 bg-[#d9eaf5]">
                            <p className="bg-[#2a85b8] px-3 py-3 text-[16px] font-bold text-white">{currentSection?.label ?? activeTest.subjectName ?? "Section"}</p>
                            <p className="px-3 py-3 text-[13px] font-semibold text-black">Choose a Question</p>
                          </div>

                          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">
                            <div className="grid grid-cols-4 gap-1.5 px-3 pb-3">
                              {currentSectionQuestions.map(({ question, globalIndex }, index) => {
                                const status = getPaletteStatus(question);
                                const isCurrent = currentQuestion.id === question.id;
                                return (
                                  <button
                                    key={question.id}
                                    type="button"
                                    onClick={() => goToQuestion(globalIndex)}
                                    className="flex h-16 items-center justify-center bg-transparent outline-none focus:outline-none focus-visible:outline-none"
                                    aria-current={isCurrent ? "true" : undefined}
                                  >
                                    {renderPaletteBadge(index + 1, status, "lg")}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </aside>
                    )}

                    {paletteCollapsed && (
                      <button type="button" onClick={() => setPaletteCollapsed(false)} className="hidden md:flex h-full w-4 shrink-0 items-center justify-center border-l border-slate-300 bg-slate-200 text-slate-700">
                        <PanelRightOpen size={12} />
                      </button>
                    )}
                    </div>

                    <div className="hidden border-t border-[#c8c8c8] bg-white md:flex">
                      <div className="flex min-w-0 flex-1 items-center justify-between gap-4 px-4 py-1.5">
                        <div className="flex items-start gap-4">
                          <Button
                            variant="outline"
                            className="h-[40px] min-w-[232px] rounded-[2px] border border-[#c2c2c2] bg-white px-5 text-[13px] font-medium text-[#2f2f2f] shadow-none hover:bg-[#f7f7f7]"
                            onClick={markForReviewAndNext}
                          >
                            {currentQuestionIndex === totalQ - 1 ? "Mark for Review" : "Mark for Review & Next"}
                          </Button>
                          <Button
                            variant="outline"
                            className="h-[40px] min-w-[166px] rounded-[2px] border border-[#c2c2c2] bg-white px-5 text-[13px] font-medium text-[#2f2f2f] shadow-none hover:bg-[#f7f7f7]"
                            onClick={() => clearResponse(currentQuestion)}
                          >
                            Clear Response
                          </Button>
                        </div>

                        <Button
                          className="h-[40px] min-w-[116px] rounded-[2px] border border-[#1e618a] bg-[#2b84b9] px-4 text-[13px] font-medium text-white shadow-none hover:bg-[#236f9c]"
                          onClick={saveAndNext}
                        >
                          {currentQuestionIndex === totalQ - 1 ? "Save Response" : "Save & Next"}
                        </Button>
                      </div>

                      {!paletteCollapsed && (
                        <div className="flex w-[244px] shrink-0 items-center justify-center border-l border-[#c8c8c8] bg-[#d9eaf5] px-4 py-1.5">
                          <Button
                            className="h-[40px] w-[96px] rounded-[2px] border border-[#79aacb] bg-[#6ea9cd] text-[13px] font-medium text-white shadow-none hover:bg-[#6198ba]"
                            onClick={openSubmitReview}
                            disabled={submitMutation.isPending}
                            data-testid="button-submit-test"
                          >
                            Submit
                          </Button>
                        </div>
                      )}
                    </div>

                  </div>
                ) : null}
              </div>
              <TcsCalculator open={showCalculator} onClose={() => setShowCalculator(false)} />
            </>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}

export default function StudentTests() {
  const { user } = useAuth();
  const isTestsAccessLocked = isStudentFeatureLocked(user, "tests");

  if (isStudentPendingVerification(user)) {
    return <StudentTestsPreview />;
  }

  return <ApprovedStudentTests featureLocked={isTestsAccessLocked} />;
}
