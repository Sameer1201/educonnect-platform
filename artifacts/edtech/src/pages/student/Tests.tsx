import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { RichQuestionContent } from "@/components/ui/rich-question-content";
import { TcsCalculator } from "@/components/student/TcsCalculator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { filterReviewBucketEntries, getReviewBucketRemovedQuestionIds } from "@/lib/reviewBucket";
import {
  ClipboardList, Clock, CheckCircle2, AlertCircle, BookOpen,
  Hash, CheckSquare, Timer, Brain,
  Calculator, PanelRightClose, PanelRightOpen, Circle, Square,
  CalendarClock, ChevronDown, HelpCircle, PlayCircle, Trophy, X
} from "lucide-react";
import { differenceInDays, format } from "date-fns";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const TEST_DRAFT_PREFIX = "educonnect-test-draft";

type QuestionType = "mcq" | "multi" | "integer";
type AnswerValue = number | number[] | string;
type PaletteStatus = "not-visited" | "not-answered" | "answered" | "review" | "answered-review";

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
  action: "open" | "answer" | "clear" | "review";
}

type TestPreviewAction = "result" | "resume" | "start";

function formatSeconds(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60), s = secs % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
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

function getNumericAnswerValue(answer: AnswerValue | undefined): string {
  if (answer === undefined || answer === null) return "";
  return String(answer);
}

function hasMeaningfulNumericAnswer(answer: AnswerValue | undefined): boolean {
  const value = getNumericAnswerValue(answer).trim();
  return value !== "" && value !== "-" && value !== "." && value !== "-.";
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
    button: "bg-[#5B4DFF] hover:bg-[#4C3FF2] text-white",
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
      accent: "bg-[#5B4DFF]",
      line: "#5B4DFF",
      glow: "bg-[#F5F3FF]",
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className="relative w-full overflow-hidden rounded-[20px] border border-[#E5E7EB] bg-white px-4 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.05)]"
        >
          <div className={`absolute left-0 top-0 h-full w-1 ${card.accent}`} />
          <div className="flex items-start justify-between gap-3 pl-2">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-[13px] font-medium text-[#6B7280]">{card.label}</p>
                {card.label === "Ongoing" && card.rawValue > 0 && (
                  <span className="relative inline-flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#F59E0B] opacity-35" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />
                  </span>
                )}
              </div>
              <p className="mt-1 text-[22px] font-bold tracking-tight text-[#0F172A]">{card.value}</p>
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
  onPrimaryAction,
}: {
  test: TestItem;
  status: StudentTestCardStatus;
  questionCount: number | null;
  detail?: TestDetail | null;
  hasSavedDraft?: boolean;
  onPrimaryAction: () => void;
}) {
  const subject = getStudentTestSubject(test);
  const accent = getStudentTestAccent(subject);
  const isCompleted = status === "completed";
  const isUpcoming = status === "upcoming";
  const daysUntil = isUpcoming && test.scheduledAt
    ? differenceInDays(new Date(test.scheduledAt), new Date())
    : 0;

  const answeredCount = (() => {
    if (!detail?.submission?.answers) return 0;
    try {
      const parsed = JSON.parse(detail.submission.answers) as Record<string, AnswerValue>;
      return detail.questions.filter((question) => {
        const answer = parsed[String(question.id)];
        if (question.questionType === "multi") return Array.isArray(answer) && answer.length > 0;
        if (question.questionType === "integer") return hasMeaningfulNumericAnswer(answer);
        return answer !== undefined && answer !== null && answer !== "";
      }).length;
    } catch {
      return 0;
    }
  })();

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
      ? (daysUntil > 0 ? `In ${daysUntil} days` : "Upcoming")
      : "Ongoing";
  const statusClass = isCompleted
    ? "border-[#BBF7D0] bg-[#F0FDF4] text-[#166534]"
    : isUpcoming
      ? "border-[#DBEAFE] bg-[#EFF6FF] text-[#1D4ED8]"
      : "border-[#FED7AA] bg-[#FFF7ED] text-[#C2410C]";

  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-[26px] border border-[#E5E7EB] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(15,23,42,0.10)]">
      <div className={`h-1.5 w-full ${accent.line}`} />
      <div className="flex h-full flex-col p-6">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${accent.dot}`} />
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6B7280]">{subject}</span>
          </div>
          <span className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs font-bold ${statusClass}`}>
            {!isCompleted && !isUpcoming && <span className="mr-2 h-1.5 w-1.5 rounded-full bg-[#F59E0B] shadow-[0_0_0_2px_rgba(245,158,11,0.14)]" />}
            {statusLabel}
          </span>
        </div>

        <h3 className="line-clamp-2 text-[19px] font-bold leading-tight text-[#0F172A]">{test.title}</h3>
        <p className="mt-2 line-clamp-2 min-h-[48px] text-[13px] leading-6 text-[#6B7280]">
          {test.description?.trim() || `${subject} practice test with exam-style timing and section flow.`}
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
            className={`flex-1 rounded-full px-4 py-3 text-sm font-semibold transition-colors ${isCompleted ? "border border-[#E5E7EB] bg-white text-[#0F172A] hover:bg-[#F8FAFC]" : accent.button}`}
          >
            {isCompleted ? "View Result" : hasSavedDraft ? "Resume" : "Start Test"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StudentTests() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"all" | "upcoming" | "active" | "completed">("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [previewTestId, setPreviewTestId] = useState<number | null>(null);

  const [activeTest, setActiveTest] = useState<TestDetail | null>(null);
  const [answers, setAnswers] = useState<Record<number, AnswerValue>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [visitedSet, setVisitedSet] = useState<Set<number>>(new Set());
  const [reviewSet, setReviewSet] = useState<Set<number>>(new Set());
  const [showInstructions, setShowInstructions] = useState(false);
  const [showSubmitReview, setShowSubmitReview] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [mobilePaletteOpen, setMobilePaletteOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const integerInputRef = useRef<HTMLInputElement | null>(null);

  const [questionTimings, setQuestionTimings] = useState<Record<number, number>>({});
  const timingActiveRef = useRef<{ qId: number; startMs: number } | null>(null);
  const [interactionLog, setInteractionLog] = useState<InteractionLogEntry[]>([]);

  const getDraftKey = (testId: number) => `${TEST_DRAFT_PREFIX}-${testId}`;
  const clearDraft = (testId: number) => localStorage.removeItem(getDraftKey(testId));
  const saveDraft = (test: TestDetail, draft: SavedTestDraft) => {
    localStorage.setItem(getDraftKey(test.id), JSON.stringify(draft));
  };
  const buildCurrentDraft = (test: TestDetail, overrides?: Partial<SavedTestDraft>): SavedTestDraft => ({
    answers,
    timeLeft,
    currentQuestionIndex,
    visitedQuestionIds: Array.from(visitedSet),
    reviewQuestionIds: Array.from(reviewSet),
    questionTimings,
    interactionLog,
    showInstructions,
    ...overrides,
  });

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
    return Math.max(0, activeTest.durationMinutes * 60 - timeLeft);
  };

  const logInteraction = (questionId: number, action: InteractionLogEntry["action"], testOverride?: TestDetail) => {
    const sourceTest = testOverride ?? activeTest;
    if (!sourceTest) return;
    const entry: InteractionLogEntry = {
      at: testOverride ? 0 : getElapsedSeconds(),
      questionId,
      sectionLabel: getQuestionSectionLabel(sourceTest, questionId),
      action,
    };
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
    })),
  });

  const { data: reviewBucketEntries = [] } = useQuery<any[]>({
    queryKey: ["student-review-bucket-count"],
    queryFn: async () => {
      const response = await fetch(`${BASE}/api/tests/review-bucket`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load review bucket");
      return response.json();
    },
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

    setActiveTest(cleanTest);
    setAnswers(shouldResume ? parsedDraft?.answers ?? {} : {});
    setTimeLeft(shouldResume ? Math.max(parsedDraft?.timeLeft ?? cleanTest.durationMinutes * 60, 0) : cleanTest.durationMinutes * 60);
    setQuestionTimings(shouldResume ? parsedDraft?.questionTimings ?? {} : {});
    setInteractionLog(
      shouldResume
        ? parsedDraft?.interactionLog ?? []
        : (initialQuestion ? [{
            at: 0,
            questionId: initialQuestion.id,
            sectionLabel: getQuestionSectionLabel(cleanTest, initialQuestion.id),
            action: "open" as const,
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

        setActiveTest(cleanTest);
        setAnswers(parsedDraft.answers ?? {});
        setTimeLeft(Math.max(parsedDraft.timeLeft ?? cleanTest.durationMinutes * 60, 0));
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
        return;
      }
      launchTestAttempt(data, false);
      return;
    }
    launchTestAttempt(data, draftMode === "prompt");
  };

  const openTest = async (testId: number) => {
    await openTestWithMode(testId, "prompt");
  };

  const reattemptTest = async (testId: number) => {
    const r = await fetch(`${BASE}/api/tests/${testId}`, { credentials: "include" });
    if (!r.ok) {
      toast({ title: "Could not open reattempt", variant: "destructive" });
      return;
    }
    const data: TestDetail = await r.json();
    launchTestAttempt({ ...data, submission: null }, false);
  };

  useEffect(() => {
    if (!activeTest) { if (timerRef.current) clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => { if (t <= 1) { clearInterval(timerRef.current!); return 0; } return t - 1; });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeTest]);

  useEffect(() => {
    if (!activeTest || activeTest.submission) return;
    saveDraft(activeTest, buildCurrentDraft(activeTest));
  }, [activeTest, answers, timeLeft, currentQuestionIndex, visitedSet, reviewSet, questionTimings, interactionLog, showInstructions]);

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
      const updated = { ...questionTimings, [active.qId]: (questionTimings[active.qId] ?? 0) + elapsed };
      setQuestionTimings(updated);
      return updated;
    }
    return questionTimings;
  };

  const isAnswered = (question: Question, answer: AnswerValue | undefined) => {
    if (question.questionType === "multi") return Array.isArray(answer) && answer.length > 0;
    if (question.questionType === "integer") return hasMeaningfulNumericAnswer(answer);
    return answer !== undefined && answer !== null && answer !== "";
  };

  const getPaletteStatus = (question: Question): PaletteStatus => {
    const visited = visitedSet.has(question.id);
    const answered = isAnswered(question, answers[question.id]);
    const review = reviewSet.has(question.id);
    if (!visited) return "not-visited";
    if (answered && review) return "answered-review";
    if (review) return "review";
    if (answered) return "answered";
    return "not-answered";
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!activeTest) throw new Error("No test");
      const finalTimings = finalizeTimings();
      const r = await fetch(`${BASE}/api/tests/${activeTest.id}/submit`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers,
          questionTimings: finalTimings,
          flaggedQuestions: [],
          visitedQuestionIds: Array.from(visitedSet),
          reviewQuestionIds: Array.from(reviewSet),
          interactionLog,
        }),
      });
      if (!r.ok) throw new Error("Failed to submit");
      return r.json();
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["student-tests"] });
      if (timerRef.current) clearInterval(timerRef.current);
      clearDraft(activeTest!.id);
      setShowSubmitReview(false);
      setActiveTest(null);
      setMobilePaletteOpen(false);
      setPaletteCollapsed(false);
      toast({ title: "Test submitted successfully" });
    },
    onError: () => toast({ title: "Submission failed", variant: "destructive" }),
  });

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const answeredCount = activeTest?.questions.filter((q) => {
    const a = answers[q.id];
    return isAnswered(q, a);
  }).length ?? 0;
  const totalQ = activeTest?.questions.length ?? 0;
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

  const setMcqAnswer = (qId: number, idx: number) => { startInteraction(qId); logInteraction(qId, "answer"); setAnswers(p => ({ ...p, [qId]: idx })); };
  const toggleMultiAnswer = (qId: number, idx: number) => {
    startInteraction(qId);
    logInteraction(qId, "answer");
    setAnswers(p => { const cur = (p[qId] as number[] | undefined) ?? []; return { ...p, [qId]: cur.includes(idx) ? cur.filter(x => x !== idx) : [...cur, idx] }; });
  };
  const setIntegerAnswer = (qId: number, val: string) => {
    startInteraction(qId);
    const sanitized = val.replace(/\s+/g, "");
    if (!/^-?(?:\d+)?(?:\.\d*)?$/.test(sanitized)) return;
    if (sanitized === "") {
      logInteraction(qId, "clear");
      setAnswers(p => { const n = { ...p }; delete n[qId]; return n; });
      return;
    }
    logInteraction(qId, "answer");
    setAnswers(p => ({ ...p, [qId]: sanitized }));
  };

  const goToQuestion = (index: number) => {
    if (!activeTest) return;
    const bounded = Math.max(0, Math.min(index, activeTest.questions.length - 1));
    const question = activeTest.questions[bounded];
    setCurrentQuestionIndex(bounded);
    setMobilePaletteOpen(false);
    setVisitedSet((prev) => new Set(prev).add(question.id));
    logInteraction(question.id, "open");
    startInteraction(question.id);
  };

  const clearResponse = (question: Question) => {
    logInteraction(question.id, "clear");
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[question.id];
      return next;
    });
  };

  const saveAndNext = () => {
    if (!activeTest) return;
    const current = activeTest.questions[currentQuestionIndex];
    setReviewSet((prev) => {
      const next = new Set(prev);
      next.delete(current.id);
      return next;
    });
    if (currentQuestionIndex < activeTest.questions.length - 1) goToQuestion(currentQuestionIndex + 1);
  };

  const markForReviewAndNext = () => {
    if (!activeTest) return;
    const current = activeTest.questions[currentQuestionIndex];
    logInteraction(current.id, "review");
    setReviewSet((prev) => new Set(prev).add(current.id));
    if (currentQuestionIndex < activeTest.questions.length - 1) goToQuestion(currentQuestionIndex + 1);
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
  const currentSectionAnsweredCount = currentSectionQuestions.filter(({ question }) => isAnswered(question, answers[question.id])).length;
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

  const paletteStyle: Record<PaletteStatus, string> = {
    "not-visited": "border-slate-400 bg-slate-100 text-slate-700",
    "not-answered": "border-orange-500 bg-orange-500 text-white",
    "answered": "border-lime-500 bg-lime-500 text-white",
    "review": "border-violet-600 bg-violet-600 text-white",
    "answered-review": "border-violet-600 bg-violet-600 text-white",
  };

  const renderPaletteBadge = (number: number, status: PaletteStatus, size: "sm" | "md" = "md") => {
    const baseSize = size === "sm" ? "h-7 w-7 text-[11px]" : "h-10 w-10 text-sm";
    const label = <span className="relative z-10 font-bold">{number}</span>;

    if (status === "not-visited" || status === "answered") {
      return <span className={`inline-flex items-center justify-center rounded-sm border shadow-sm ${baseSize} ${paletteStyle[status]}`}>{label}</span>;
    }

    if (status === "review") {
      return <span className={`inline-flex items-center justify-center rounded-full border shadow-sm ${baseSize} ${paletteStyle[status]}`}>{label}</span>;
    }

    if (status === "not-answered") {
      return (
        <span
          className={`relative inline-flex items-center justify-center border shadow-sm ${baseSize} ${paletteStyle[status]}`}
          style={{ clipPath: "polygon(16% 0%, 84% 0%, 100% 20%, 100% 76%, 50% 100%, 0% 76%, 0% 20%)" }}
        >
          {label}
        </span>
      );
    }

    return (
      <span className={`relative inline-flex items-center justify-center rounded-full border shadow-sm ${baseSize} ${paletteStyle[status]}`}>
        {label}
        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border border-white bg-lime-400" />
      </span>
    );
  };

  const exitTest = () => {
    if (!activeTest || submitMutation.isPending) return;
    const finalTimings = finalizeTimings();
    saveDraft(activeTest, buildCurrentDraft(activeTest, { questionTimings: finalTimings }));
    if (timerRef.current) clearInterval(timerRef.current);
    setMobilePaletteOpen(false);
    setShowCalculator(false);
    setActiveTest(null);
    toast({ title: "Test saved", description: "You can continue this test later from the test list." });
  };
  const examHeading = activeTest?.examHeader?.trim() || activeTest?.description?.trim() || activeTest?.title || "Exam Interface";
  const examSubheading = activeTest?.examSubheader?.trim() || activeTest?.className || activeTest?.subjectName || activeTest?.chapterName || "Online Test";
  const defaultInstructionItems = getDefaultInstructionItems(activeTest?.durationMinutes ?? 30);
  const additionalInstructionItems = extractAdditionalInstructionItems(activeTest?.instructions, activeTest?.durationMinutes ?? 30);

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
            className="relative overflow-visible self-start rounded-full border-[#E5E7EB] bg-white px-5 py-3 text-sm font-semibold text-[#111827] shadow-[0_8px_30px_rgba(15,23,42,0.04)] hover:bg-[#F8FAFC] md:self-auto"
            onClick={() => setLocation("/student/tests/review-bucket")}
            data-testid="button-top-wrong-bucket"
          >
            <BookOpen className="mr-2 h-4 w-4 text-[#5B4DFF]" />
            Review Bucket
            {visibleReviewBucketEntries.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#EF4444] px-1 text-[10px] font-bold text-white">
                {visibleReviewBucketEntries.length}
              </span>
            )}
          </Button>
        </div>

        <StudentTestsStatsBar
          total={testStats.total}
          upcoming={testStats.upcoming}
          active={testStats.active}
          completed={testStats.completed}
          averageScore={averageCompletedScore}
        />

        <div className="flex flex-col gap-2.5 rounded-[28px] border border-[#E5E7EB] bg-white px-4 py-2.5 shadow-[0_8px_24px_rgba(15,23,42,0.05)] md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
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
                  className={`rounded-full px-6 py-2.5 text-base font-semibold transition-colors ${
                    isActive
                      ? "bg-[#5B4DFF] text-white shadow-[0_10px_30px_rgba(91,77,255,0.28)]"
                      : "text-[#64748B] hover:text-[#0F172A]"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <div className="relative min-w-[220px]">
              <select
                value={subjectFilter}
                onChange={(event) => setSubjectFilter(event.target.value)}
                className="h-10 w-full appearance-none rounded-full border-0 bg-white py-2 pl-4 pr-11 text-base font-semibold text-[#0F172A] outline-none"
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
                  className="mt-6 rounded-full bg-[#5B4DFF] px-5 text-white hover:bg-[#4C3FF2]"
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
            {filteredTests.map((test, index) => {
              const status = getStudentTestStatus(test);
              const detail = testDetailQueries[tests.findIndex((entry) => entry.id === test.id)]?.data;
              return (
                <StudentTestSeriesCard
                  key={test.id}
                  test={test}
                  status={status}
                  questionCount={questionCountByTestId[test.id] ?? null}
                  detail={detail}
                  hasSavedDraft={typeof window !== "undefined" && !!localStorage.getItem(getDraftKey(test.id))}
                  onPrimaryAction={() => {
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
          className="max-w-[820px] rounded-[28px] border border-[#D8DEEF] bg-white p-0 shadow-[0_20px_56px_rgba(15,23,42,0.16)]"
        >
          {previewTest && (
            <div className="overflow-hidden rounded-[28px] bg-white">
              <div className="flex items-start justify-between gap-4 border-b border-[#ECEEF8] px-8 pb-7 pt-6">
                <div>
                  <div className="inline-flex rounded-full border border-[#1F2937] px-3.5 py-1 text-sm font-semibold text-[#1F2937]">
                    {getStudentTestSubject(previewTest)}
                  </div>
                  <h2 className="mt-5 max-w-[540px] text-[24px] font-bold tracking-tight text-[#111827]">{previewTest.title}</h2>
                  <p className="mt-4 text-[15px] text-[#6B7280]">
                    {previewTest.description?.trim() || `${getStudentTestSubject(previewTest)} practice test with exam-style timing and section flow.`}
                  </p>
                </div>
                <div className="flex items-start gap-3">
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

              <div className="border-b border-[#ECEEF8] bg-[#F8F9FF] px-8 py-6">
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

              <div className="px-8 py-4">
                <div className="grid gap-4 border-b border-[#ECEEF8] py-5 md:grid-cols-[220px_1fr]">
                  <p className="text-[16px] text-[#6B7280]">Scheduled Date</p>
                  <p className="text-right text-[17px] font-semibold text-[#111827]">
                    {previewTest.scheduledAt ? format(new Date(previewTest.scheduledAt), "MMMM do, yyyy 'at' h:mm aa") : "Available now"}
                  </p>
                </div>

                {previewAction === "result" && previewDetail?.submission && (
                  <>
                    <div className="grid gap-4 border-b border-[#ECEEF8] py-5 md:grid-cols-[220px_1fr]">
                      <p className="text-[16px] text-[#6B7280]">Completed Date</p>
                      <p className="text-right text-[17px] font-semibold text-[#111827]">
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

                <div className="flex items-center justify-end gap-4 px-8 pb-7 pt-2">
                  <button
                    type="button"
                    onClick={() => setPreviewTestId(null)}
                    className="rounded-[18px] border-2 border-[#1F2937] px-7 py-2.5 text-[16px] font-semibold text-[#1F2937] transition hover:bg-[#F8FAFC]"
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
                  className="rounded-[18px] bg-[#6366F1] px-7 py-2.5 text-[16px] font-semibold text-white transition hover:bg-[#5558E8]"
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
          className="left-0 top-0 h-screen max-h-screen w-screen max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-none border-0 bg-white p-0 shadow-none dark:bg-white"
        >
          {activeTest && (
            <>
              <div className="flex h-full min-h-0 flex-col bg-white text-black [color-scheme:light]">
                <div className="border-b border-[#7f7f7f] bg-white text-black">
                  <div className="flex items-center justify-between border-b border-[#a76d1c] px-3 py-2 sm:px-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#7f7f7f] bg-[#f3f3f3] text-[10px] font-bold text-[#57438f] sm:h-10 sm:w-10">EC</div>
                    <div className="min-w-0 flex-1 px-2 text-center leading-tight sm:px-4">
                      <p className="truncate text-base font-bold uppercase tracking-tight text-[#6e4ca5] sm:text-xl">{examHeading}</p>
                      <p className="truncate text-[10px] font-semibold uppercase text-[#3a8b2e] sm:text-xs">{examSubheading}</p>
                    </div>
                    <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#7f7f7f] bg-[#f3f3f3] text-[10px] font-bold text-[#d58a00] sm:h-10 sm:w-10">QB</div>
                  </div>
                  <div className="flex items-center justify-between gap-2 bg-[#d7edf6] px-3 py-2 sm:px-4">
                    <p className="min-w-0 truncate text-[14px] font-bold text-[#4d4d4d] sm:text-[16px]">{showInstructions ? "Instructions" : activeTest.title}</p>
                    {!showInstructions && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={openScientificCalculator}
                          className="inline-flex items-center gap-1 rounded-sm border border-[#7f7f7f] bg-white px-2 py-1 text-[12px] font-semibold text-[#2b2b2b] shadow-sm hover:bg-[#f6f6f6] sm:text-[13px]"
                        >
                          <Calculator size={13} />
                          Calculator
                        </button>
                        <div className={`shrink-0 rounded-sm bg-white/60 px-2 py-1 font-mono text-[12px] font-bold sm:text-[14px] ${timeLeft <= 60 ? "text-red-700" : "text-[#2b2b2b]"}`}>
                          <Clock size={13} /> Time Left : {formatTime(timeLeft)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {showInstructions ? (
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white text-black md:flex-row">
                    <div className="min-h-0 flex-1 overflow-y-auto bg-white p-4 sm:p-6 md:border-r md:border-[#2f2f2f]">
                      <div className="mx-auto max-w-5xl space-y-6">
                        <div className="text-center">
                          <h2 className="text-[16px] font-bold text-black">General Instructions</h2>
                        </div>
                        <div className="space-y-4 text-[14px] leading-7 text-black">
                          <p><strong>Please read the following carefully.</strong></p>
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
                            onClick={() => submitMutation.mutate()}
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
                  <div className="flex min-h-0 flex-1 overflow-hidden">
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white md:border-r md:border-slate-300">
                      <div className="border-b border-slate-300 bg-white px-2 py-2">
                        <p className="px-1 text-sm font-bold text-[#5b5b5b]">Sections</p>
                        <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1 text-xs font-medium">
                          {sectionGroups.map((section) => {
                            const isActiveSection = currentSection?.id === section.id;
                            return (
                              <button
                                key={section.id}
                                type="button"
                                onClick={() => {
                                  const firstQuestion = section.questionEntries[0];
                                  if (firstQuestion) goToQuestion(firstQuestion.globalIndex);
                                }}
                                className={`whitespace-nowrap rounded-sm border px-3 py-2 shadow-sm transition-colors ${
                                  isActiveSection
                                    ? "border-[#7aa9d4] bg-[#7aa9d4] text-white"
                                    : "border-slate-300 bg-white text-[#4b6f96] hover:border-[#7aa9d4]"
                                }`}
                              >
                                {section.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex items-center justify-between border-b border-slate-300 bg-white px-2 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[13px] font-bold text-black">Question Type: {currentQuestion.questionType.toUpperCase()}</span>
                          </div>
                        </div>
                        <div className="hidden text-[13px] text-black sm:block">Marks for correct answer: <span className="font-bold">{currentQuestion.points}</span> | Negative Marks: <span className="font-bold text-[#c55f00]">{getNegativeMark(currentQuestion)}</span></div>
                        <button
                          type="button"
                          onClick={() => setMobilePaletteOpen(true)}
                          className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 md:hidden"
                        >
                          <PanelRightOpen size={14} />
                          Palette
                        </button>
                      </div>

                      <div className="border-b border-slate-300 px-2 py-2 text-[16px] font-bold text-black sm:text-[18px]">
                        Question No. {currentSectionQuestionNumber}
                      </div>

                      <div className="min-h-0 flex-1 overflow-y-auto bg-white p-3 sm:p-4">
                        <div className="relative mx-auto max-w-none border border-slate-200 bg-white p-3 shadow-sm before:pointer-events-none before:absolute before:inset-0 before:bg-[repeating-linear-gradient(-60deg,transparent,transparent_180px,rgba(40,70,110,0.06)_180px,rgba(40,70,110,0.06)_240px)] sm:p-6">
                          <div className="space-y-4">
                            <RichQuestionContent content={currentQuestion.question} className="text-[15px] leading-7 text-slate-900 sm:text-base" />
                            {currentQuestion.imageData && <img src={currentQuestion.imageData} alt="" className="max-h-[420px] w-full rounded-xl border border-slate-200 object-contain bg-white" />}

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
                                      className={`relative w-full border-0 p-2 text-left transition-colors ${selected ? "bg-[#f5f8fd]" : "bg-transparent hover:bg-[#f9fbff]"}`}
                                      data-testid={`option-${currentQuestion.id}-${i}`}
                                    >
                                      <div className="flex items-start gap-3">
                                        <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center ${currentQuestion.questionType === "multi" ? "rounded-sm" : "rounded-full"} border text-xs font-bold ${selected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-600"}`}>
                                          {currentQuestion.questionType === "multi" ? (selected ? <CheckSquare size={12} /> : <Square size={12} />) : (selected ? <Circle size={12} fill="currentColor" /> : <Circle size={12} />)}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-start gap-2">
                                            <span className="font-semibold text-slate-700">{String.fromCharCode(65 + i)}.</span>
                                            <RichQuestionContent content={opt} className="text-sm text-slate-800" />
                                          </div>
                                          {optImg && <img src={optImg} alt="" className="mt-3 max-h-40 rounded-lg border border-slate-200 object-contain bg-white" />}
                                        </div>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            {currentQuestion.questionType === "integer" && (
                              <div className="mx-auto w-[176px] border border-[#ececec] bg-[#efefef] px-[10px] py-[8px] sm:mx-0 sm:w-[182px]">
                                <input
                                  ref={integerInputRef}
                                  type="text"
                                  inputMode="decimal"
                                  value={integerDisplayValue}
                                  onChange={(e) => setIntegerAnswer(currentQuestion.id, e.target.value)}
                                  placeholder=""
                                  className="h-[40px] w-full rounded-[4px] border-2 border-[#7a7a7a] bg-white px-[8px] text-left text-[24px] font-semibold leading-none text-black outline-none focus:border-[#7a7a7a]"
                                  data-testid={`integer-input-${currentQuestion.id}`}
                                />
                                  <div className="mt-[18px] flex flex-col items-center gap-[8px]">
                                    <button
                                      type="button"
                                      onClick={backspaceIntegerChar}
                                      className="flex h-[56px] w-[148px] items-center justify-center rounded-[12px] border-2 border-[#7a7a7a] bg-[#e8e5f1] text-[24px] font-bold tracking-[-0.02em] text-black hover:bg-[#e1ddee] sm:h-[62px] sm:w-[152px] sm:text-[28px]"
                                    >
                                      Backspace
                                    </button>

                                    <div className="grid grid-cols-3 gap-[10px]">
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
                                        className="flex h-[46px] w-[46px] items-center justify-center rounded-[10px] border-2 border-[#7a7a7a] bg-[#f8f8f8] text-[22px] font-bold leading-none text-black hover:bg-white sm:h-[48px] sm:w-[48px] sm:text-[24px]"
                                      >
                                        {key}
                                      </button>
                                    ))}
                                  </div>

                                  <div className="grid grid-cols-2 gap-[10px]">
                                    <button
                                      type="button"
                                      onClick={() => moveIntegerCaret("left")}
                                      className="flex h-[50px] w-[64px] items-center justify-center rounded-[10px] border-2 border-[#7a7a7a] bg-[#e8e5f1] text-[26px] font-bold leading-none text-black hover:bg-[#e1ddee] sm:h-[52px] sm:text-[28px]"
                                    >
                                      ←
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => moveIntegerCaret("right")}
                                      className="flex h-[50px] w-[64px] items-center justify-center rounded-[10px] border-2 border-[#7a7a7a] bg-[#e8e5f1] text-[26px] font-bold leading-none text-black hover:bg-[#e1ddee] sm:h-[52px] sm:text-[28px]"
                                    >
                                      →
                                    </button>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={clearIntegerAnswer}
                                    className="flex h-[56px] w-[142px] items-center justify-center rounded-[12px] border-2 border-[#7a7a7a] bg-[#e8e5f1] text-[24px] font-bold tracking-[-0.02em] text-black hover:bg-[#e1ddee] sm:h-[62px] sm:w-[144px] sm:text-[28px]"
                                  >
                                    Clear All
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-slate-300 bg-white px-2 py-3">
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                            <Button variant="outline" className="rounded-none border border-[#bdbdbd] bg-white text-black shadow-none hover:bg-[#f3f3f3]" onClick={exitTest}>
                              Exit
                            </Button>
                            <Button variant="outline" className="rounded-none border border-[#bdbdbd] bg-white text-black shadow-none hover:bg-[#f3f3f3] disabled:bg-[#f5f5f5] disabled:text-[#9a9a9a]" onClick={previousQuestion} disabled={currentQuestionIndex === 0}>
                              Previous
                            </Button>
                            <Button variant="outline" className="rounded-none border border-[#bdbdbd] bg-white text-black shadow-none hover:bg-[#f3f3f3]" onClick={() => clearResponse(currentQuestion)}>
                              Clear Response
                            </Button>
                            <Button
                              variant="outline"
                              className="rounded-none border border-[#bdbdbd] bg-white text-black shadow-none hover:bg-[#f3f3f3] md:hidden"
                              onClick={() => setMobilePaletteOpen(true)}
                            >
                              Palette
                            </Button>
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
                            <Button variant="outline" className="rounded-none border border-[#bdbdbd] bg-white text-black shadow-none hover:bg-[#f3f3f3]" onClick={markForReviewAndNext}>
                              {currentQuestionIndex === totalQ - 1 ? "Mark for Review" : "Mark for Review & Next"}
                            </Button>
                            <Button className="rounded-none border border-[#6d9cc8] bg-[#4a8ac5] text-white shadow-none hover:bg-[#417bb1]" onClick={saveAndNext}>
                              {currentQuestionIndex === totalQ - 1 ? "Save Response" : "Save & Next"}
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
                          <div className="max-h-[calc(78vh-57px)] overflow-y-auto">
                            <div className="border-b border-[#c8c8c8] bg-white p-4">
                              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                                <div className="flex items-start gap-2">{renderPaletteBadge(currentSectionAnsweredCount, "answered")}<div><p className="font-medium leading-4 text-black">Answered</p></div></div>
                                <div className="flex items-start gap-2">{renderPaletteBadge(currentSectionNotAnsweredCount, "not-answered")}<div><p className="font-medium leading-4 text-black">Not Answered</p></div></div>
                                <div className="flex items-start gap-2">{renderPaletteBadge(currentSectionNotVisitedCount, "not-visited")}<div><p className="font-medium leading-4 text-black">Not Visited</p></div></div>
                                <div className="flex items-start gap-2">{renderPaletteBadge(currentSectionReviewCount, "review")}<div><p className="font-medium leading-4 text-black">Marked for Review</p></div></div>
                                <div className="col-span-2 flex items-start gap-2">{renderPaletteBadge(currentSectionAnsweredReviewCount, "answered-review")}<div><p className="font-medium leading-4 text-black">Answered & Marked for Review</p></div></div>
                              </div>
                            </div>

                            <div className="bg-[#d9eaf5]">
                              <p className="bg-[#2a85b8] px-3 py-2 text-sm font-bold text-white">{currentSection?.label ?? activeTest.subjectName ?? "Section"}</p>
                              <p className="px-4 py-3 text-[13px] font-semibold text-black">Choose a Question</p>
                            </div>

                            <div className="grid grid-cols-5 gap-2 px-4 pb-4">
                              {currentSectionQuestions.map(({ question, globalIndex }, index) => {
                                const status = getPaletteStatus(question);
                                const isCurrent = currentQuestion.id === question.id;
                                return (
                                  <button
                                    key={question.id}
                                    type="button"
                                    onClick={() => goToQuestion(globalIndex)}
                                    className={`flex h-11 items-center justify-center ${isCurrent ? "ring-2 ring-[#f28a27] ring-offset-1" : ""}`}
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
                      <aside className="hidden min-h-0 w-[260px] shrink-0 flex-col border-l border-[#2f2f2f] bg-[#d9eaf5] md:flex">
                        <div className="border-b border-[#c8c8c8] bg-[#f7f7f7] p-4">
                          <div className="mb-4 flex items-start gap-3 rounded-none bg-white p-0">
                            <div className="flex h-24 w-20 items-center justify-center overflow-hidden rounded-sm border border-[#7f7f7f] bg-white shadow-inner">
                              {user && (user as any).avatarUrl ? (
                                <img src={(user as any).avatarUrl} alt={user.fullName ?? user.username ?? "Candidate"} className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_35%,#dce8f4,#8ea4bf_65%,#5d728e)] text-[10px] font-bold text-white">
                                  PHOTO
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-lg font-bold text-[#3f4d5c]">Candidate</p>
                              <p className="mt-1 text-sm font-semibold text-[#607a98]">{user?.fullName ?? user?.username ?? "John Smith"}</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">Question Palette</p>
                              <p className="text-xs text-slate-500">{currentSectionAnsweredCount}/{currentSectionQuestions.length} answered</p>
                            </div>
                            <button type="button" onClick={() => setPaletteCollapsed(true)} className="rounded-none border border-slate-300 bg-black p-2 text-white hover:bg-slate-800">
                              <PanelRightClose size={16} />
                            </button>
                          </div>
                        </div>
                        <div className="flex min-h-0 flex-1 flex-col bg-[#d9eaf5]">
                          <div className="overflow-y-auto space-y-0">
                          <div className="border-b border-[#c8c8c8] bg-white p-4">
                          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                            <div className="flex items-start gap-2">{renderPaletteBadge(currentSectionAnsweredCount, "answered")}<div><p className="font-medium leading-4 text-black">Answered</p></div></div>
                            <div className="flex items-start gap-2">{renderPaletteBadge(currentSectionNotAnsweredCount, "not-answered")}<div><p className="font-medium leading-4 text-black">Not Answered</p></div></div>
                            <div className="flex items-start gap-2">{renderPaletteBadge(currentSectionNotVisitedCount, "not-visited")}<div><p className="font-medium leading-4 text-black">Not Visited</p></div></div>
                            <div className="flex items-start gap-2">{renderPaletteBadge(currentSectionReviewCount, "review")}<div><p className="font-medium leading-4 text-black">Marked for Review</p></div></div>
                            <div className="col-span-2 flex items-start gap-2">{renderPaletteBadge(currentSectionAnsweredReviewCount, "answered-review")}<div><p className="font-medium leading-4 text-black">Answered & Marked for Review (will also be evaluated)</p></div></div>
                          </div>
                          </div>

                          <div className="bg-[#d9eaf5]">
                            <p className="bg-[#2a85b8] px-3 py-2 text-sm font-bold text-white">{currentSection?.label ?? activeTest.subjectName ?? "Section"}</p>
                            <p className="px-4 py-3 text-[13px] font-semibold text-black">Choose a Question</p>
                          </div>

                          <div className="grid grid-cols-4 gap-2 px-4 pb-4">
                            {currentSectionQuestions.map(({ question, globalIndex }, index) => {
                              const status = getPaletteStatus(question);
                              const isCurrent = currentQuestion.id === question.id;
                              return (
                                <button
                                  key={question.id}
                                  type="button"
                                  onClick={() => goToQuestion(globalIndex)}
                                  className={`flex h-11 items-center justify-center ${isCurrent ? "ring-2 ring-[#f28a27] ring-offset-1" : ""}`}
                                >
                                  {renderPaletteBadge(index + 1, status)}
                                </button>
                              );
                            })}
                          </div>
                          </div>
                        </div>
                        <div className="border-t border-[#c8c8c8] bg-[#d9eaf5] p-4">
                          <Button
                            className="w-full rounded-none border border-[#8fb4d6] bg-[#78a7d3] text-white shadow-none hover:bg-[#6897c4]"
                            onClick={openSubmitReview}
                            disabled={submitMutation.isPending}
                            data-testid="button-submit-test"
                          >
                            Final Submit
                          </Button>
                        </div>
                      </aside>
                    )}

                    {paletteCollapsed && (
                      <button type="button" onClick={() => setPaletteCollapsed(false)} className="hidden md:flex h-full w-10 shrink-0 items-center justify-center border-l border-slate-300 bg-slate-200 text-slate-700">
                        <PanelRightOpen size={18} />
                      </button>
                    )}
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
