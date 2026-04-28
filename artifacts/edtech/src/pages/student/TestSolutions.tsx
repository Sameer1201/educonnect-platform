import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft,
  BookOpen,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Flag,
  Filter,
} from "lucide-react";
import { QuestionAnalysisSummary } from "@/components/student/QuestionAnalysisSummary";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RichQuestionContent } from "@/components/ui/rich-question-content";
import { SubjectSectionIcon } from "@/components/ui/subject-section-icon";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type SolutionQuestion = {
  id: number;
  question: string;
  questionType: string;
  questionCode?: string | null;
  options: string[];
  optionImages?: (string | null)[] | null;
  optionSelectionCounts?: number[] | null;
  optionSelectionPercentages?: number[] | null;
  imageData?: string | null;
  correctAnswer?: number | null;
  correctAnswerMulti?: number[] | null;
  correctAnswerMin?: number | null;
  correctAnswerMax?: number | null;
  points?: number | null;
  negativeMarks?: number | null;
  solutionText?: string | null;
  solutionImageData?: string | null;
  solutionSource?: "teacher" | "ai" | "none";
  report?: QuestionReport | null;
  meta?: Record<string, unknown> | null;
  order?: number | null;
};

type QuestionReport = {
  id: number;
  questionId: number;
  testId: number;
  reportedBy: number;
  teacherId: number;
  reason: string;
  status: "open" | "resolved" | "rejected";
  teacherNote?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  reporterName?: string;
};

type SolutionSection = {
  id: number;
  title: string;
  subjectLabel?: string | null;
  order: number;
  items: SolutionQuestion[];
};

type SolutionTestMeta = {
  title?: string | null;
  description?: string | null;
  examType?: string | null;
  examHeader?: string | null;
  examSubheader?: string | null;
};

type QuestionState = {
  classAttemptedCount?: number;
  classAvgTime?: number;
  classCorrectCount?: number;
  classSkippedCount?: number;
  classWrongCount?: number;
  id: number;
  myAnswer?: unknown;
  isCorrect?: boolean;
  isSkipped?: boolean;
  myTime?: number;
};

type EnrichedQuestion = SolutionQuestion & {
  sectionId: number;
  sectionLabel: string;
  displayNumber: number;
  userStatus: "correct" | "incorrect" | "unattempted";
  classAttemptedCount?: number;
  classAvgTime?: number;
  classCorrectCount?: number;
  classSkippedCount?: number;
  classWrongCount?: number;
  myAnswer?: unknown;
  myTime?: number;
};

type FilterKey = "all" | "correct" | "incorrect" | "unattempted";

type SubjectAccent = {
  line: string;
  border: string;
  text: string;
};

type FilterAccent = {
  line: string;
  border: string;
  text: string;
  badgeBg: string;
  badgeText: string;
};

const SUBJECT_ACCENTS: SubjectAccent[] = [
  { line: "#F97316", border: "#F97316", text: "#EA580C" },
  { line: "#22C55E", border: "#22C55E", text: "#15803D" },
  { line: "#4B8BFF", border: "#4B8BFF", text: "#2563EB" },
];

const FILTER_ACCENTS: Record<FilterKey, FilterAccent> = {
  all: {
    line: "#4F46E5",
    border: "#4F46E5",
    text: "#4F46E5",
    badgeBg: "#EEF2FF",
    badgeText: "#4F46E5",
  },
  correct: {
    line: "#059669",
    border: "#059669",
    text: "#64748B",
    badgeBg: "#D1FAE5",
    badgeText: "#059669",
  },
  incorrect: {
    line: "#F43F5E",
    border: "#F43F5E",
    text: "#64748B",
    badgeBg: "#FFE4E6",
    badgeText: "#F43F5E",
  },
  unattempted: {
    line: "#64748B",
    border: "#64748B",
    text: "#64748B",
    badgeBg: "#F1F5F9",
    badgeText: "#334155",
  },
};

const MOBILE_FILTERS: Array<{ key: FilterKey; label: string; dotClass: string }> = [
  { key: "all", label: "All", dotClass: "bg-violet-500" },
  { key: "correct", label: "Correct", dotClass: "bg-emerald-500" },
  { key: "incorrect", label: "Incorrect", dotClass: "bg-rose-500" },
  { key: "unattempted", label: "Unattempted", dotClass: "bg-zinc-400" },
];

function renderCorrectAnswer(question: SolutionQuestion) {
  const type = String(question.questionType ?? "mcq").toLowerCase();
  if (type === "multi") {
    const indexes = Array.isArray(question.correctAnswerMulti) ? question.correctAnswerMulti : [];
    return indexes.map((index) => String.fromCharCode(65 + index)).join(", ") || "—";
  }
  if (type === "integer" || type === "nat") {
    if (question.correctAnswerMin != null && question.correctAnswerMax != null) {
      return `${question.correctAnswerMin} — ${question.correctAnswerMax}`;
    }
    return String(question.correctAnswer ?? "—");
  }
  if (question.correctAnswer == null) return "—";
  return String.fromCharCode(65 + question.correctAnswer);
}

function renderUserAnswer(question: EnrichedQuestion) {
  const type = String(question.questionType ?? "mcq").toLowerCase();
  const answer = question.myAnswer;
  if (answer == null || answer === "" || (Array.isArray(answer) && answer.length === 0)) return "Not attempted";
  if (type === "multi" && Array.isArray(answer)) {
    return answer.map((index) => String.fromCharCode(65 + Number(index))).join(", ");
  }
  if (type === "integer" || type === "nat") return String(answer);
  const index = Number(answer);
  return Number.isFinite(index) ? String.fromCharCode(65 + index) : String(answer);
}

function getDifficulty(question: EnrichedQuestion) {
  const raw = question.meta && typeof question.meta === "object" ? question.meta.difficulty : null;
  if (typeof raw !== "string" || !raw.trim()) return "Moderate";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function getTopicLine(question: EnrichedQuestion) {
  const meta = question.meta && typeof question.meta === "object" ? question.meta : null;
  const chapter = typeof meta?.chapterName === "string" ? meta.chapterName.trim() : "";
  const topic =
    typeof meta?.topicName === "string"
      ? meta.topicName.trim()
      : typeof meta?.topicTag === "string"
        ? meta.topicTag.trim()
        : "";
  if (chapter && topic) return `${chapter} • ${topic}`;
  return chapter || topic || question.sectionLabel;
}

function normalizeSolutionKey(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9.+/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isMarksOnlySectionLabel(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return true;
  return /^[+-]?\d+(?:\.\d+)?\s*\/\s*-?\d+(?:\.\d+)?(?:\s*questions?)?$/i.test(normalized) ||
    /^[+-]?\d+(?:\.\d+)?\s*marks?\s*\/\s*-?\d+(?:\.\d+)?/i.test(normalized);
}

function isCpetTest(test: SolutionTestMeta | null | undefined) {
  const text = [
    test?.examType,
    test?.title,
    test?.examHeader,
    test?.examSubheader,
    test?.description,
  ].map((value) => normalizeSolutionKey(value)).join(" ");

  return /\bcpet\b/.test(text) || text.includes("common p g entrance") || text.includes("common pg entrance");
}

function getSolutionSectionLabel(section: SolutionSection, test: SolutionTestMeta | null | undefined) {
  const raw = String(section.subjectLabel ?? section.title ?? "").trim();
  if (isCpetTest(test) && (isMarksOnlySectionLabel(raw) || normalizeSolutionKey(raw).includes("cpet"))) {
    return "Chemistry";
  }
  return raw || "Section";
}

function isCorrectOption(question: EnrichedQuestion, optionIndex: number) {
  const type = String(question.questionType ?? "mcq").toLowerCase();
  if (type === "multi") {
    return Array.isArray(question.correctAnswerMulti) && question.correctAnswerMulti.includes(optionIndex);
  }
  return question.correctAnswer === optionIndex;
}

function isChosenOption(question: EnrichedQuestion, optionIndex: number) {
  const type = String(question.questionType ?? "mcq").toLowerCase();
  if (type === "multi") {
    return Array.isArray(question.myAnswer) && question.myAnswer.map(Number).includes(optionIndex);
  }
  return Number(question.myAnswer) === optionIndex;
}

function getOptionMarkedPercentage(question: EnrichedQuestion, optionIndex: number) {
  const percentages = Array.isArray(question.optionSelectionPercentages) ? question.optionSelectionPercentages : [];
  const value = Number(percentages[optionIndex] ?? 0);
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function matchesFilter(question: EnrichedQuestion, filter: FilterKey) {
  return filter === "all" ? true : question.userStatus === filter;
}

function getSubjectAccent(label: string, index: number): SubjectAccent {
  const normalized = label.trim().toLowerCase();
  if (normalized.includes("general aptitude") || normalized.includes("aptitude")) {
    return SUBJECT_ACCENTS[0];
  }
  if (
    normalized.includes("technical") ||
    normalized.includes("core") ||
    normalized.includes("engineering math") ||
    normalized.includes("mathematics")
  ) {
    return SUBJECT_ACCENTS[1];
  }
  return SUBJECT_ACCENTS[index % SUBJECT_ACCENTS.length];
}

function getQuestionButtonClass(active: boolean) {
  if (active) {
    return "h-10 w-10 rounded-[10px] border border-[#1F2A37] bg-[#1F2A37] text-sm font-semibold text-white shadow-[inset_0_-3px_0_0_#111827]";
  }
  return "h-10 w-10 rounded-[10px] border border-[#E5EBF5] bg-[#F7FAFF] text-sm font-semibold text-[#334155] transition hover:border-[#DCE5F2] hover:bg-[#EEF4FF] hover:text-[#1F2937] hover:shadow-[inset_0_-3px_0_0_#1F2937]";
}

function getReportStatusMeta(status?: string | null) {
  if (status === "resolved") {
    return {
      label: "Report fixed",
      chipClass: "border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]",
      buttonClass: "border-[#BBF7D0] bg-white text-[#15803D] hover:bg-[#F0FDF4]",
    };
  }
  if (status === "rejected") {
    return {
      label: "Report rejected",
      chipClass: "border-[#FDE68A] bg-[#FFF7D6] text-[#B45309]",
      buttonClass: "border-[#FDE68A] bg-white text-[#B45309] hover:bg-[#FFF7D6]",
    };
  }
  return {
    label: "Report issue",
    chipClass: "border-[#E2E8F0] bg-[#F8FAFC] text-[#475569]",
    buttonClass: "border-[#D6DFEA] bg-white text-[#334155] hover:bg-[#F8FAFC]",
  };
}

function formatCompactSeconds(seconds: number) {
  const safe = Math.max(0, Math.round(Number(seconds) || 0));
  if (safe <= 0) return "—";
  if (safe < 60) return `${safe}s`;
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
}

function formatMarkValue(value: unknown, fallback: number) {
  const numberValue = Number(value);
  const safe = Number.isFinite(numberValue) ? numberValue : fallback;
  return safe.toFixed(2).replace(/\.?0+$/, "");
}

function getQuestionMarkingScheme(question: EnrichedQuestion | null | undefined) {
  const points = formatMarkValue(question?.points, 1);
  const negative = formatMarkValue(Math.abs(Number(question?.negativeMarks ?? 0)), 0);
  return `+${points} / ${negative === "0" ? "0" : `-${negative}`}`;
}

function getMobileQuestionButtonClass(active: boolean, status: EnrichedQuestion["userStatus"]) {
  const base = "flex h-10 items-center justify-center rounded-md border text-[13px] font-medium transition-all active:scale-95";
  if (active) return `${base} border-zinc-900 bg-zinc-900 text-white`;
  if (status === "incorrect") return `${base} border-rose-100 bg-rose-50 text-rose-600`;
  if (status === "correct") return `${base} border-emerald-100 bg-emerald-50 text-emerald-600`;
  return `${base} border-zinc-200 bg-white text-zinc-700`;
}

function percentOf(value: number | undefined, total: number | undefined) {
  const safeTotal = Number(total ?? 0);
  if (!safeTotal) return 0;
  return ((Number(value ?? 0) / safeTotal) * 100);
}

export default function StudentTestSolutions() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const solutionRef = useRef<HTMLDivElement | null>(null);
  const scrollRegionRef = useRef<HTMLDivElement | null>(null);
  const [activeSubject, setActiveSubject] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [hoveredFilter, setHoveredFilter] = useState<FilterKey | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<number | null>(null);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [mobilePaletteOpen, setMobilePaletteOpen] = useState(false);
  const [mobileQuestionVisible, setMobileQuestionVisible] = useState(false);
  const [isAtSolutionSection, setIsAtSolutionSection] = useState(false);
  const [pendingReportQuestion, setPendingReportQuestion] = useState<EnrichedQuestion | null>(null);
  const [reportReason, setReportReason] = useState("");

  const analysisQuery = useQuery({
    queryKey: ["student-analysis", id],
    queryFn: async () => {
      const response = await fetch(`/api/tests/${id}/my-analysis`, { credentials: "include" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Failed to load analysis");
      }
      return response.json();
    },
    enabled: !!id,
  });

  const solutionsQuery = useQuery({
    queryKey: ["student-analysis-solutions", id],
    queryFn: async () => {
      const response = await fetch(`/api/tests/${id}/solutions`, { credentials: "include" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Failed to load solutions");
      }
      return response.json();
    },
    enabled: !!id,
  });

  const reportQuestionMutation = useMutation({
    mutationFn: async ({ questionId, reason }: { questionId: number; reason: string }) => {
      const response = await fetch(`${BASE}/api/tests/questions/${questionId}/report`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to submit report");
      }
      return payload as QuestionReport;
    },
    onSuccess: (report, variables) => {
      queryClient.setQueryData<any>(["student-analysis-solutions", id], (current: any) => {
        if (!current?.sections) return current;
        return {
          ...current,
          sections: current.sections.map((section: SolutionSection) => ({
            ...section,
            items: (section.items ?? []).map((question: SolutionQuestion) =>
              question.id === variables.questionId
                ? { ...question, report }
                : question,
            ),
          })),
        };
      });
      setPendingReportQuestion(null);
      setReportReason("");
      toast({
        title: "Report sent",
        description: "The teacher has been notified about this question.",
      });
    },
    onError: (error) => {
      toast({
        title: "Unable to send report",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["student-analysis-solutions", id] });
    },
  });

  const questionStateMap = useMemo(() => {
    const map = new Map<number, QuestionState>();
    (analysisQuery.data?.perQuestion ?? []).forEach((item: QuestionState) => map.set(item.id, item));
    return map;
  }, [analysisQuery.data?.perQuestion]);

  const grouped = useMemo(() => {
    let runningNumber = 1;
    const testMeta = analysisQuery.data?.test as SolutionTestMeta | null | undefined;
    return ((solutionsQuery.data?.sections ?? []) as SolutionSection[])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((section) => {
        const label = getSolutionSectionLabel(section, testMeta);
        const items = (section.items ?? []).map((question) => {
          const state = questionStateMap.get(question.id);
          const userStatus: EnrichedQuestion["userStatus"] = state?.isSkipped
            ? "unattempted"
            : state?.isCorrect
              ? "correct"
              : "incorrect";
          const enriched: EnrichedQuestion = {
            ...question,
            sectionId: section.id,
            sectionLabel: label,
            displayNumber: runningNumber,
            userStatus,
            myAnswer: state?.myAnswer,
            myTime: state?.myTime,
            classAttemptedCount: state?.classAttemptedCount,
            classAvgTime: state?.classAvgTime,
            classCorrectCount: state?.classCorrectCount,
            classSkippedCount: state?.classSkippedCount,
            classWrongCount: state?.classWrongCount,
          };
          runningNumber += 1;
          return enriched;
        });

        return {
          id: section.id,
          label,
          items,
        };
      });
  }, [analysisQuery.data?.test, questionStateMap, solutionsQuery.data?.sections]);

  useEffect(() => {
    if (!grouped.length) {
      setActiveSubject("");
      return;
    }
    setActiveSubject((current) => (grouped.some((subject) => subject.label === current) ? current : grouped[0].label));
  }, [grouped]);

  const selectedSubject = useMemo(
    () => grouped.find((subject) => subject.label === activeSubject) ?? grouped[0] ?? null,
    [activeSubject, grouped],
  );

  const visibleItems = useMemo(
    () => (selectedSubject?.items ?? []).filter((entry) => matchesFilter(entry, filter)),
    [filter, selectedSubject],
  );

  useEffect(() => {
    if (!visibleItems.length) {
      setSelectedQuestionId(null);
      return;
    }
    setSelectedQuestionId((current) =>
      visibleItems.some((entry) => entry.id === current) ? current : visibleItems[0].id,
    );
  }, [visibleItems]);

  const currentQuestion = useMemo(
    () => visibleItems.find((entry) => entry.id === selectedQuestionId) ?? visibleItems[0] ?? null,
    [selectedQuestionId, visibleItems],
  );

  useEffect(() => {
    setMobilePaletteOpen(false);
    setMobileQuestionVisible(false);
  }, [currentQuestion?.id]);

  const currentIndex = currentQuestion ? visibleItems.findIndex((entry) => entry.id === currentQuestion.id) : -1;
  const previousQuestion = currentIndex > 0 ? visibleItems[currentIndex - 1] : null;
  const nextQuestion = currentIndex >= 0 && currentIndex < visibleItems.length - 1 ? visibleItems[currentIndex + 1] : null;

  useEffect(() => {
    const scrollRegion = scrollRegionRef.current;
    if (!scrollRegion) return;

    const syncSolutionPosition = () => {
      if (!solutionRef.current) {
        setIsAtSolutionSection(false);
        return;
      }
      const threshold = Math.max(solutionRef.current.offsetTop - 72, 0);
      setIsAtSolutionSection(scrollRegion.scrollTop >= threshold);
    };

    syncSolutionPosition();
    scrollRegion.addEventListener("scroll", syncSolutionPosition, { passive: true });
    return () => scrollRegion.removeEventListener("scroll", syncSolutionPosition);
  }, [currentQuestion?.id]);

  const subjectSummary = useMemo(() => {
    const items = selectedSubject?.items ?? [];
    return {
      all: items.length,
      correct: items.filter((entry) => entry.userStatus === "correct").length,
      incorrect: items.filter((entry) => entry.userStatus === "incorrect").length,
      unattempted: items.filter((entry) => entry.userStatus === "unattempted").length,
    };
  }, [selectedSubject]);

  const selectedAccent = useMemo(() => {
    const selectedIndex = grouped.findIndex((subject) => subject.label === selectedSubject?.label);
    return getSubjectAccent(selectedSubject?.label ?? "General", selectedIndex >= 0 ? selectedIndex : 0);
  }, [grouped, selectedSubject]);

  const mobileAllottedSeconds = Number((currentQuestion?.meta as Record<string, unknown> | null)?.estimatedTimeSeconds ?? 0) || 0;
  const mobileAttemptedCount = currentQuestion?.classAttemptedCount ?? 0;
  const mobileRightPercent = percentOf(currentQuestion?.classCorrectCount, mobileAttemptedCount);
  const mobileWrongPercent = percentOf(currentQuestion?.classWrongCount, mobileAttemptedCount);
  const mobileTotalResponses = mobileAttemptedCount + (currentQuestion?.classSkippedCount ?? 0);
  const mobileSkippedPercent = percentOf(currentQuestion?.classSkippedCount, mobileTotalResponses);
  const mobileMarkingScheme = getQuestionMarkingScheme(currentQuestion);

  const loading = analysisQuery.isLoading || solutionsQuery.isLoading;
  const errorMessage =
    (analysisQuery.isError && (analysisQuery.error instanceof Error ? analysisQuery.error.message : "Failed to load analysis")) ||
    (solutionsQuery.isError && (solutionsQuery.error instanceof Error ? solutionsQuery.error.message : "Failed to load solutions")) ||
    null;

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-[#F8FAFC] text-[#111827]">
        <div className="flex h-full min-h-0 items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-[#4B8BFF] border-t-transparent" />
            <p className="text-sm text-[#64748B]">Loading solutions...</p>
          </div>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="min-h-[100dvh] bg-[#F8FAFC] px-4 py-10 text-[#111827] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-[24px] border border-[#FECACA] bg-[#FFF7F7] p-8 text-center">
          <p className="text-lg font-semibold text-[#111827]">Unable to load solutions</p>
          <p className="mt-2 text-sm text-[#B91C1C]">{errorMessage}</p>
        </div>
      </div>
    );
  }

  if (!grouped.length) {
    return (
      <div className="min-h-[100dvh] bg-[#F8FAFC] px-4 py-10 text-[#111827] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-[24px] border border-[#E2E8F0] bg-white p-10 text-center shadow-sm">
          <p className="text-lg font-semibold">No solution data available yet</p>
          <p className="mt-2 text-sm text-[#64748B]">Solutions will appear here after the submission analysis is ready.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-zinc-200 text-[#111827] lg:h-[100dvh] lg:overflow-hidden lg:bg-[#F8FAFC]">
      <div className="flex min-h-[100dvh] justify-center bg-zinc-200 lg:hidden">
        <div className="relative min-h-[100dvh] w-full max-w-[420px] bg-zinc-50 pb-32 font-sans text-zinc-900 antialiased shadow-xl">
          <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white">
            <div className="flex items-start gap-3 px-4 pb-3 pt-3">
              <button
                type="button"
                onClick={() => setLocation(`/student/tests/${id}/analysis`)}
                className="-ml-1 mt-0.5 rounded-md p-1 text-zinc-600 transition hover:bg-zinc-100 active:bg-zinc-200"
                aria-label="Back to Analysis"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Solutions</div>
                <h1 className="truncate text-[13px] font-semibold leading-snug text-zinc-900">
                  {analysisQuery.data?.test?.title ?? "Solutions"}
                </h1>
              </div>
            </div>
          </header>

          <div className="border-b border-zinc-200 bg-white px-4">
            <div className="inline-flex items-center gap-2 rounded-t-md border-t-2 border-orange-500 bg-orange-50/40 px-3 py-2">
              <Calculator className="h-3.5 w-3.5 text-orange-500" />
              <span className="text-[12px] font-semibold text-orange-600">{mobileMarkingScheme}</span>
            </div>
          </div>

          {currentQuestion ? (
            <>
              <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-[14px] font-bold text-zinc-900">Q{currentQuestion.displayNumber}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                    {getDifficulty(currentQuestion)}
                  </span>
                  {currentQuestion.report?.status === "rejected" ? (
                    <span className="ml-1 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      Report rejected
                    </span>
                  ) : currentQuestion.report?.status === "open" ? (
                    <span className="ml-1 whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      Reported
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPendingReportQuestion(currentQuestion);
                    setReportReason("");
                  }}
                  disabled={currentQuestion.report?.status === "open" || reportQuestionMutation.isPending}
                  className="flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-50 active:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Flag className="h-3 w-3" />
                  {currentQuestion.report?.status === "open" ? "Reported" : currentQuestion.report ? "Report again" : "Report"}
                </button>
              </div>

              <main className="space-y-4 px-4">
                {mobileQuestionVisible ? (
                  <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Question</div>
                    <RichQuestionContent content={currentQuestion.question} className="text-[14px] leading-relaxed text-zinc-800" />
                    {currentQuestion.imageData ? (
                      <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                        <img src={currentQuestion.imageData} alt="" className="max-h-72 rounded object-contain" />
                      </div>
                    ) : null}
                  </section>
                ) : null}

                <section className="space-y-2">
                  <div className="mb-1 mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Explanation</div>
                  {currentQuestion.solutionText?.trim() || currentQuestion.solutionImageData ? (
                    <>
                      {currentQuestion.solutionText?.trim() ? (
                        <RichQuestionContent content={currentQuestion.solutionText} className="text-[13px] leading-relaxed text-zinc-600" />
                      ) : null}
                      {currentQuestion.solutionImageData ? (
                        <div className="rounded-lg border border-zinc-200 bg-white p-3">
                          <img src={currentQuestion.solutionImageData} alt="" className="max-h-96 rounded object-contain" />
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-[13px] leading-relaxed text-zinc-600">No teacher solution was attached to this question.</p>
                  )}
                </section>

                <section className="grid grid-cols-2 gap-2 pt-2">
                  <MobileStatCard
                    label="Time spent"
                    sub="Out of allotted time"
                    value={`${formatCompactSeconds(currentQuestion.myTime ?? 0)} / ${formatCompactSeconds(mobileAllottedSeconds)}`}
                    valueClass={(currentQuestion.myTime ?? 0) > mobileAllottedSeconds * 0.7 && mobileAllottedSeconds > 0 ? "text-rose-500" : "text-orange-500"}
                  />
                  <MobileStatCard
                    label="Average time"
                    sub=" "
                    value={formatCompactSeconds(currentQuestion.classAvgTime ?? 0)}
                    valueClass="text-zinc-900"
                  />
                  <MobileStatCard
                    label="Got it right"
                    sub="Of those who attempted"
                    value={`${mobileRightPercent.toFixed(2)}%`}
                    valueClass="text-emerald-600"
                  />
                  <MobileStatCard
                    label="Got it wrong"
                    sub="Of those who attempted"
                    value={`${mobileWrongPercent.toFixed(2)}%`}
                    valueClass="text-rose-500"
                  />
                  <div className="col-span-2">
                    <MobileStatCard
                      label="Skipped"
                      sub=" "
                      value={`${mobileSkippedPercent.toFixed(2)}%`}
                      valueClass="text-zinc-900"
                    />
                  </div>
                </section>
              </main>

              <div className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center">
                <div className="flex w-full max-w-[420px] justify-end px-4">
                  <button
                    type="button"
                    onClick={() => setMobilePaletteOpen(true)}
                    className="pointer-events-auto flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2.5 text-white shadow-lg shadow-zinc-900/25 transition-transform active:scale-95"
                  >
                    <Filter className="h-4 w-4" />
                    <span className="text-[12px] font-semibold">All Questions</span>
                    <span className="rounded-full bg-white/15 px-1.5 py-0.5 text-[11px]">{subjectSummary.all}</span>
                  </button>
                </div>
              </div>

              <nav className="fixed bottom-0 left-1/2 z-20 w-full max-w-[420px] -translate-x-1/2 border-t border-zinc-200 bg-white">
                <div className="grid grid-cols-3 items-center gap-2 px-3 py-3">
                  <button
                    type="button"
                    onClick={() => previousQuestion && setSelectedQuestionId(previousQuestion.id)}
                    disabled={!previousQuestion}
                    className="h-11 rounded-full border border-zinc-200 text-[13px] font-medium transition disabled:bg-zinc-50 disabled:text-zinc-400 enabled:bg-white enabled:text-zinc-700 enabled:hover:bg-zinc-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileQuestionVisible((value) => !value)}
                    className="flex h-11 items-center justify-center gap-1.5 rounded-full bg-zinc-900 text-[13px] font-semibold text-white shadow transition-transform active:scale-[0.98]"
                  >
                    {mobileQuestionVisible ? "Hide Question" : "View Question"}
                    {mobileQuestionVisible ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => nextQuestion && setSelectedQuestionId(nextQuestion.id)}
                    disabled={!nextQuestion}
                    className="h-11 rounded-full border border-zinc-200 text-[13px] font-medium transition disabled:bg-zinc-50 disabled:text-zinc-400 enabled:bg-white enabled:text-zinc-700 enabled:hover:bg-zinc-50"
                  >
                    Next
                  </button>
                </div>
                <div style={{ height: "env(safe-area-inset-bottom)" }} />
              </nav>

              <MobilePaletteSheet
                open={mobilePaletteOpen}
                onClose={() => setMobilePaletteOpen(false)}
                markingScheme={mobileMarkingScheme}
                activeQuestionId={currentQuestion.id}
                filter={filter}
                setFilter={setFilter}
                counts={subjectSummary}
                questions={visibleItems}
                onSelect={(questionId) => {
                  setSelectedQuestionId(questionId);
                  setMobilePaletteOpen(false);
                }}
              />
            </>
          ) : (
            <div className="px-6 py-20 text-center text-sm text-zinc-500">No questions match the selected filter.</div>
          )}
        </div>
      </div>

      <div className="hidden h-full min-h-0 flex-col overflow-hidden font-sans lg:flex">
        <header className="border-b border-[#E2E8F0] bg-white px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setLocation(`/student/tests/${id}/analysis`)}
                className="rounded-full p-1 text-[#64748B] transition hover:bg-[#EEF4FF] hover:text-[#245BDB]"
                aria-label="Back to Analysis"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#64748B]">Solutions</p>
                <h1 className="truncate text-sm font-semibold text-[#111827] sm:text-base">
                  {analysisQuery.data?.test?.title ?? "Solutions"}
                </h1>
              </div>
            </div>

          </div>
        </header>

        <div className="relative flex flex-1 overflow-hidden">
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="relative bg-white px-3 pt-3">
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px]" style={{ backgroundColor: selectedAccent.line }} />
              <div className="no-scrollbar relative flex gap-2 overflow-x-auto pb-0">
                {grouped.map((subject, index) => {
                  const active = subject.label === selectedSubject?.label;
                  const accent = getSubjectAccent(subject.label, index);
                  return (
                    <button
                      key={subject.id}
                      type="button"
                      onClick={() => setActiveSubject(subject.label)}
                      className={`relative -mb-[2px] flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-t-[16px] border-2 border-b-0 px-5 py-2 text-sm font-semibold transition ${
                        active ? "" : "border-transparent bg-transparent text-[#64748B] hover:text-[#111827]"
                      }`}
                      style={active ? { borderColor: accent.border, backgroundColor: "white", color: accent.text } : undefined}
                    >
                      <SubjectSectionIcon label={subject.label} className="h-[18px] w-[18px] flex-shrink-0" />
                      {subject.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {currentQuestion ? (
              <>
                <div className="flex flex-col gap-3 border-b border-[#E2E8F0] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-bold text-[#111827]">Q{currentQuestion.displayNumber}</span>
                    <span className="rounded bg-[#F1F5F9] px-2 py-0.5 text-xs font-medium uppercase tracking-[0.08em] text-[#475569]">
                      {getDifficulty(currentQuestion)}
                    </span>
                    {currentQuestion.report ? (
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getReportStatusMeta(currentQuestion.report.status).chipClass}`}>
                        {getReportStatusMeta(currentQuestion.report.status).label}
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingReportQuestion(currentQuestion);
                      setReportReason("");
                    }}
                    disabled={currentQuestion.report?.status === "open" || reportQuestionMutation.isPending}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${getReportStatusMeta(currentQuestion.report?.status).buttonClass}`}
                  >
                    <Flag className="h-3.5 w-3.5" />
                    {currentQuestion.report?.status === "open" ? "Reported" : currentQuestion.report ? "Report again" : "Report"}
                  </button>
                </div>

                <div ref={scrollRegionRef} className="no-scrollbar flex-1 overflow-y-auto bg-white pb-36 sm:pb-28" id="test-solutions-scroll-region">
                  <div className="px-4 py-5 sm:px-5">
                    <RichQuestionContent content={currentQuestion.question} className="text-base font-medium leading-7 text-[#111827] sm:text-xl sm:leading-9" />
                  </div>

                  {currentQuestion.imageData ? (
                    <div className="px-4 pb-4 sm:px-5">
                      <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                        <img src={currentQuestion.imageData} alt="" className="max-h-[24rem] rounded object-contain" />
                      </div>
                    </div>
                  ) : null}

                  <div className="px-4 pb-4 sm:px-5">
                    {currentQuestion.userStatus === "unattempted" ? (
                      <span className="rounded bg-[#EEF2FF] px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#4338CA]">
                        You didn&apos;t attempt this question
                      </span>
                    ) : currentQuestion.userStatus === "incorrect" ? (
                      <span className="rounded bg-[#FEF2F2] px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#B91C1C]">
                        Your answer: {renderUserAnswer(currentQuestion)}
                      </span>
                    ) : (
                      <span className="rounded bg-[#F0FDF4] px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#15803D]">
                        Correctly answered
                      </span>
                    )}
                  </div>

                  {String(currentQuestion.questionType ?? "mcq").toLowerCase() !== "integer" && currentQuestion.options?.length > 0 ? (
                    <div className="grid gap-3 px-4 pb-6 sm:gap-4 sm:px-5 lg:grid-cols-2">
                      {currentQuestion.options.map((option, optionIndex) => {
                        const correct = isCorrectOption(currentQuestion, optionIndex);
                        const chosen = isChosenOption(currentQuestion, optionIndex);
                        const optionImage = currentQuestion.optionImages?.[optionIndex] ?? null;

                        let tone = "border-[#E2E8F0] bg-[#F8FAFC]";
                        if (correct) tone = "border-[#BBF7D0] bg-[#F0FDF4]";
                        else if (chosen && currentQuestion.userStatus === "incorrect") tone = "border-[#FECACA] bg-[#FEF2F2]";

                        return (
                          <div key={`${currentQuestion.id}-${optionIndex}`} className={`relative rounded-2xl border p-3 sm:p-4 ${tone}`}>
                            <div className="flex items-start gap-3 sm:gap-4">
                              <div
                                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                                  correct ? "bg-[#22C55E] text-white" : "border border-[#D6DFEA] bg-white text-[#334155]"
                                }`}
                              >
                                {String.fromCharCode(65 + optionIndex)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <RichQuestionContent content={option} className="text-base leading-7 text-[#111827] sm:text-lg sm:leading-8" />
                                <div className="mt-1 text-sm font-semibold text-[#4F46E5]">
                                  {getOptionMarkedPercentage(currentQuestion, optionIndex)}% marked this
                                </div>
                                {optionImage ? (
                                  <div className="mt-3 rounded-xl border border-[#E2E8F0] bg-white p-3">
                                    <img src={optionImage} alt="" className="max-h-32 rounded object-contain" />
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            {correct ? (
                              <div className="absolute right-4 top-4 flex items-center gap-1 text-xs font-semibold text-[#15803D]">
                                Correct
                                <CheckCircle2 className="h-4 w-4" />
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid gap-4 px-4 pb-6 sm:px-5 md:grid-cols-2">
                      <div className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#B91C1C]">Your Answer</p>
                        <p className="mt-2 text-lg font-semibold text-[#111827]">{renderUserAnswer(currentQuestion)}</p>
                      </div>
                      <div className="rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#15803D]">Correct Answer</p>
                        <p className="mt-2 text-lg font-semibold text-[#111827]">{renderCorrectAnswer(currentQuestion)}</p>
                      </div>
                    </div>
                  )}

                  <div className="border-t border-[#E2E8F0] px-4 py-5 sm:px-5">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#64748B]">Chapter & Topic</div>
                    <div className="mt-2 text-sm font-medium text-[#111827]">{getTopicLine(currentQuestion)}</div>
                  </div>

                  <div ref={solutionRef} className="border-t border-[#E2E8F0] px-4 pb-8 pt-5 sm:px-5">
                    <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#64748B]">
                      <BookOpen className="h-4 w-4 text-[#4B8BFF]" />
                      Teacher Solution
                    </div>
                    {currentQuestion.solutionText?.trim() || currentQuestion.solutionImageData ? (
                      <div className="space-y-4">
                        {currentQuestion.solutionText?.trim() ? (
                          <RichQuestionContent content={currentQuestion.solutionText} className="text-sm leading-8 text-[#334155]" />
                        ) : null}
                        {currentQuestion.solutionImageData ? (
                          <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                            <img src={currentQuestion.solutionImageData} alt="" className="max-h-[28rem] rounded object-contain" />
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-sm text-[#64748B]">No teacher solution was attached to this question.</p>
                    )}
                  </div>

                  <QuestionAnalysisSummary
                    myTimeSeconds={currentQuestion.myTime ?? 0}
                    allottedTimeSeconds={Number((currentQuestion.meta as Record<string, unknown> | null)?.estimatedTimeSeconds ?? 0) || 0}
                    averageTimeSeconds={currentQuestion.classAvgTime ?? 0}
                    gotRightPercent={
                      (currentQuestion.classAttemptedCount ?? 0) > 0
                        ? (((currentQuestion.classCorrectCount ?? 0) / (currentQuestion.classAttemptedCount ?? 1)) * 100)
                        : 0
                    }
                    gotWrongPercent={
                      (currentQuestion.classAttemptedCount ?? 0) > 0
                        ? (((currentQuestion.classWrongCount ?? 0) / (currentQuestion.classAttemptedCount ?? 1)) * 100)
                        : 0
                    }
                    skippedPercent={
                      ((currentQuestion.classAttemptedCount ?? 0) + (currentQuestion.classSkippedCount ?? 0)) > 0
                        ? (((currentQuestion.classSkippedCount ?? 0) /
                            ((currentQuestion.classAttemptedCount ?? 0) + (currentQuestion.classSkippedCount ?? 0))) *
                            100)
                        : 0
                    }
                  />
                </div>

                <div className="absolute inset-x-0 bottom-0 z-20 border-t border-[#E2E8F0] bg-[rgba(255,255,255,0.98)] px-4 py-3 backdrop-blur-sm sm:px-5 sm:py-4">
                  <div className="mx-auto grid max-w-[34rem] grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-center sm:gap-4">
                    <button
                      type="button"
                      onClick={() => previousQuestion && setSelectedQuestionId(previousQuestion.id)}
                      disabled={!previousQuestion}
                      className="min-w-0 rounded-full border border-[#D6DFEA] bg-white px-4 py-2.5 text-xs font-semibold text-[#6B7280] transition hover:bg-[#F8FAFC] hover:text-[#334155] disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-[9.5rem] sm:px-6 sm:py-3 sm:text-sm"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (isAtSolutionSection) {
                          scrollRegionRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                          return;
                        }
                        solutionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      className="col-span-2 inline-flex min-w-0 items-center justify-center gap-2 rounded-full border border-[#171717] bg-[#171717] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#111111] sm:min-w-[13.5rem] sm:px-6 sm:py-3 sm:text-sm"
                    >
                      {isAtSolutionSection ? "View Question" : "View Solution"}
                      {isAtSolutionSection ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => nextQuestion && setSelectedQuestionId(nextQuestion.id)}
                      disabled={!nextQuestion}
                      className="min-w-0 rounded-full border border-[#D6DFEA] bg-white px-4 py-2.5 text-xs font-semibold text-[#334155] transition hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-[9.5rem] sm:px-6 sm:py-3 sm:text-sm"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center bg-white px-6 text-sm text-[#64748B]">
                No questions match the selected filter.
              </div>
            )}
          </div>

          {showRightPanel ? (
            <aside className="hidden w-72 shrink-0 border-l border-[#E2E8F0] bg-white lg:flex lg:flex-col">
              <div className="flex items-center justify-between border-b border-[#E2E8F0] px-3 py-3">
                <span className="text-sm font-semibold text-[#111827]">All {selectedSubject?.label ?? "Solution"} Questions</span>
                <button
                  type="button"
                  onClick={() => setShowRightPanel(false)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#4B8BFF] transition hover:text-[#245BDB]"
                >
                  HIDE
                  <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
                    <rect x="1" y="2" width="10" height="1.5" rx="0.75" />
                    <rect x="1" y="5.25" width="10" height="1.5" rx="0.75" />
                    <rect x="1" y="8.5" width="10" height="1.5" rx="0.75" />
                  </svg>
                </button>
              </div>

              <div
                className="flex items-end gap-3 border-b-[3px] border-[#D7E1F1] px-1 pt-2"
                style={{ borderBottomColor: FILTER_ACCENTS[filter].line }}
              >
                {(
                  [
                    { key: "all", label: "All", count: subjectSummary.all },
                    { key: "correct", label: "Correct", count: subjectSummary.correct },
                    { key: "incorrect", label: "Incorrect", count: subjectSummary.incorrect },
                    { key: "unattempted", label: "Unattempted", count: subjectSummary.unattempted },
                  ] as const
                ).map((tab) => {
                  const active = filter === tab.key;
                  const hovered = hoveredFilter === tab.key;
                  const emphasized = active || hovered;
                  const tabAccent = FILTER_ACCENTS[tab.key];
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setFilter(tab.key)}
                      onMouseEnter={() => setHoveredFilter(tab.key)}
                      onMouseLeave={() => setHoveredFilter((current) => (current === tab.key ? null : current))}
                      className={`relative z-10 flex-1 rounded-t-[22px] px-1 pb-2.5 pt-2 transition-colors ${
                        emphasized ? "border-[3px] border-b-0 bg-white -mb-[3px]" : "border-[3px] border-transparent"
                      }`}
                      style={emphasized ? { borderColor: tabAccent.border, borderBottomColor: "white" } : undefined}
                    >
                      <div
                        className="text-[11px] font-semibold transition-colors"
                        style={{ color: active ? tabAccent.text : "#64748B" }}
                      >
                        {tab.label}
                      </div>
                      <div className="mt-1.5 flex justify-center">
                        <span
                          className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold"
                          style={{ backgroundColor: tabAccent.badgeBg, color: tabAccent.badgeText }}
                        >
                          {tab.count}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="no-scrollbar flex-1 space-y-5 overflow-y-auto px-3 py-3">
                <div className="grid grid-cols-5 gap-2">
                  {visibleItems.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setSelectedQuestionId(entry.id)}
                      className={getQuestionButtonClass(entry.id === currentQuestion?.id)}
                    >
                      {entry.displayNumber}
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          ) : (
            <button
              type="button"
              onClick={() => setShowRightPanel(true)}
              className="absolute right-0 top-1/2 hidden -translate-y-1/2 rounded-l-lg border border-r-0 border-[#D6DFEA] bg-white px-1 py-3 text-xs text-[#334155] shadow-sm lg:block"
            >
              ◁
            </button>
          )}
        </div>
      </div>

      <Dialog
        open={Boolean(pendingReportQuestion)}
        onOpenChange={(open) => {
          if (!open && !reportQuestionMutation.isPending) {
            setPendingReportQuestion(null);
            setReportReason("");
          }
        }}
      >
        <DialogContent className="max-w-md rounded-[24px] border border-[#E2E8F0] bg-white p-0 shadow-[0_24px_60px_rgba(15,23,42,0.18)]" hideClose>
          <div className="p-6">
            <DialogHeader className="space-y-2 text-left">
              <DialogTitle className="text-xl font-semibold text-[#111827]">Report this question?</DialogTitle>
              <DialogDescription className="text-sm leading-6 text-[#64748B]">
                Your report goes directly to the teacher who created this test question.
              </DialogDescription>
            </DialogHeader>

            {pendingReportQuestion ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#64748B]">
                    <span>{pendingReportQuestion.sectionLabel}</span>
                    <span className="text-[#CBD5E1]">•</span>
                    <span>{getTopicLine(pendingReportQuestion)}</span>
                  </div>
                  <RichQuestionContent
                    content={pendingReportQuestion.question}
                    className="line-clamp-3 text-sm leading-7 text-[#111827]"
                  />
                </div>

                {pendingReportQuestion.report ? (
                  <div className={`rounded-2xl border px-4 py-3 text-sm ${getReportStatusMeta(pendingReportQuestion.report.status).chipClass}`}>
                    <p className="font-semibold">{getReportStatusMeta(pendingReportQuestion.report.status).label}</p>
                    <p className="mt-1 text-xs opacity-80">{pendingReportQuestion.report.reason}</p>
                    {pendingReportQuestion.report.teacherNote ? (
                      <p className="mt-2 text-xs font-medium opacity-90">Teacher note: {pendingReportQuestion.report.teacherNote}</p>
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#64748B]">What should the teacher check?</p>
                  <Textarea
                    value={reportReason}
                    onChange={(event) => setReportReason(event.target.value)}
                    placeholder="Example: image is wrong, option mismatch, solution is incorrect, or question text has an issue."
                    className="min-h-[120px] rounded-2xl border-[#D6DFEA] bg-white text-sm leading-6"
                  />
                </div>
              </div>
            ) : null}

            <DialogFooter className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end sm:space-x-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPendingReportQuestion(null);
                  setReportReason("");
                }}
                disabled={reportQuestionMutation.isPending}
                className="rounded-full border-[#D6DFEA] px-5"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (pendingReportQuestion) {
                    reportQuestionMutation.mutate({
                      questionId: pendingReportQuestion.id,
                      reason: reportReason.trim(),
                    });
                  }
                }}
                disabled={!pendingReportQuestion || reportQuestionMutation.isPending}
                className="rounded-full bg-[#111827] px-5 text-white hover:bg-[#0F172A]"
              >
                {reportQuestionMutation.isPending ? "Sending..." : "Send Report"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MobileStatCard({
  label,
  sub,
  value,
  valueClass,
}: {
  label: string;
  sub: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-3 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
      <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{label}</div>
      <div className="min-h-[12px] text-[10px] leading-tight text-zinc-400">{sub}</div>
      <div className={`mt-1.5 text-[15px] font-bold ${valueClass}`}>{value}</div>
    </div>
  );
}

function MobilePaletteSheet({
  open,
  onClose,
  markingScheme,
  activeQuestionId,
  filter,
  setFilter,
  counts,
  questions,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  markingScheme: string;
  activeQuestionId: number | null;
  filter: FilterKey;
  setFilter: (key: FilterKey) => void;
  counts: Record<FilterKey, number>;
  questions: EnrichedQuestion[];
  onSelect: (questionId: number) => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 bg-zinc-900/40 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="absolute bottom-0 left-1/2 flex max-h-[85dvh] w-full max-w-[420px] -translate-x-1/2 flex-col rounded-t-2xl bg-white"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-col items-center border-b border-zinc-100 pb-3 pt-2">
          <div className="mb-3 h-1 w-10 rounded-full bg-zinc-200" />
          <div className="flex w-full items-center justify-between px-4">
            <div className="text-[14px] font-semibold text-zinc-900">All {markingScheme} Questions</div>
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1 text-[12px] font-semibold text-blue-600"
            >
              Hide
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 border-b border-zinc-100 px-4 pb-3 pt-3">
          {MOBILE_FILTERS.map((item) => {
            const active = filter === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                className={`flex flex-col items-center gap-1 rounded-lg border py-2 transition-colors ${
                  active ? "border-violet-300 bg-violet-50" : "border-zinc-200 bg-white"
                }`}
              >
                <span className={`text-[10px] font-semibold uppercase tracking-wide ${active ? "text-violet-700" : "text-zinc-500"}`}>
                  {item.label}
                </span>
                <span className="flex items-center gap-1">
                  <span className={`h-1.5 w-1.5 rounded-full ${item.dotClass}`} />
                  <span className="text-[12px] font-bold text-zinc-900">{counts[item.key]}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {questions.length > 0 ? (
            <div className="grid grid-cols-5 gap-2">
              {questions.map((question) => (
                <button
                  key={question.id}
                  type="button"
                  onClick={() => onSelect(question.id)}
                  className={getMobileQuestionButtonClass(question.id === activeQuestionId, question.userStatus)}
                  aria-label={`Question ${question.displayNumber}`}
                >
                  {question.displayNumber}
                </button>
              ))}
            </div>
          ) : (
            <div className="px-6 py-10 text-center">
              <div className="text-[14px] font-semibold text-zinc-900">No questions here</div>
              <p className="mt-1 text-[12px] text-zinc-500">Try another filter bucket.</p>
            </div>
          )}
          <div className="h-6" />
        </div>
      </div>
    </div>
  );
}
