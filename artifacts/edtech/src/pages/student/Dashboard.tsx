import { useEffect, useMemo, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import PendingVerificationDialog from "@/components/student/PendingVerificationDialog";
import StudentPreviewLockBanner from "@/components/student/StudentPreviewLockBanner";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { formatExamDisplayName } from "@/lib/exam-display";
import { isStudentPendingVerification } from "@/lib/student-access";
import {
  BrainCircuit,
  Target,
  Timer,
  Award,
  ChevronRight,
  Flame,
  Pencil,
  Check,
  X,
} from "lucide-react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  addDays,
  format,
  isSameDay,
  startOfWeek,
  subDays,
} from "date-fns";
import { api } from "@/lib/api";
import type {
  StudentQuestionBankExamResponse,
  StudentQuestionBankExamSummary,
} from "@/pages/student/question-bank/api";

type AnswerAction = "open" | "answer" | "clear" | "review";

type QuestionBankProgressSummary = {
  totalSolvedQuestions: number;
  totalAttempts: number;
  correctAttempts: number;
  latestCorrectQuestions: number;
  accuracy: number;
  dailySolvedCounts: Array<{ date: string; questions: number }>;
};

interface StudentTestItem {
  id: number;
  title: string;
  durationMinutes: number;
  passingScore: number | null;
  scheduledAt: string | null;
  className: string | null;
  chapterName?: string | null;
  subjectName?: string | null;
  alreadySubmitted: boolean;
}

interface AnalysisQuestion {
  id: number;
  subjectLabel?: string | null;
  subjectName?: string | null;
  chapterName?: string | null;
  topicTag?: string | null;
  meta?: Record<string, unknown> | null;
  isCorrect: boolean;
  isSkipped: boolean;
  myTime: number;
  classSuccessRate: number;
}

interface AnalysisResponse {
  test: {
    id: number;
    title: string;
    className?: string | null;
    totalQuestions: number;
  };
  submission: {
    score: number;
    totalPoints: number;
    percentage: number;
    passed: boolean;
    submittedAt: string;
    totalTime: number;
    correctCount: number;
    wrongCount: number;
    skippedCount: number;
    interactionLog?: Array<{
      at: number;
      questionId: number;
      sectionLabel: string;
      action: AnswerAction;
    }> | null;
  };
  classStats: {
    totalSubs: number;
    classAvg: number;
    classPassRate: number;
    rank: number;
    percentile: number;
  };
  perQuestion: AnalysisQuestion[];
}

type CompletedAnalysis = AnalysisResponse & {
  testItem: StudentTestItem;
};

type FocusAreaMetrics = {
  correct: number;
  exposure: number;
  testQuestions: number;
  questionBankQuestions: number;
  questionBankAttempts: number;
};

const TIME_SERIES_COLORS = ["hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-5))"];
const DEFAULT_DAILY_GOAL = 150;
const PERFORMANCE_TREND_LINE_COLOR = "#D97706";
const PERFORMANCE_TREND_FILL_COLOR = "#F59E0B";
const SUBJECT_ACCURACY_BAR_COLOR = "#F59E0B";
const SUBJECT_PEER_BAR_COLOR = "#FCD34D";
const SUBJECT_PEER_LABEL_COLOR = "#B45309";

function safeNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function shortLabel(value: string, max = 14) {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(1, max - 1))}…`;
}

function renderSubjectLegendLabel(value: string, index: number) {
  const color = index === 0 ? SUBJECT_ACCURACY_BAR_COLOR : SUBJECT_PEER_LABEL_COLOR;
  return <span style={{ color }}>{value}</span>;
}

function isBroadSubjectLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "" || ["technical", "general", "overall", "section", "subject", "all subjects"].includes(normalized);
}

function normalizeFocusKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getQuestionSubject(question: AnalysisQuestion, testItem: StudentTestItem) {
  const explicitSubjectName = typeof question.subjectName === "string" ? question.subjectName.trim() : "";
  if (explicitSubjectName && !isBroadSubjectLabel(explicitSubjectName)) return explicitSubjectName;

  const metaSubject = typeof question.meta?.subjectName === "string" ? question.meta.subjectName.trim() : "";
  if (metaSubject && !isBroadSubjectLabel(metaSubject)) return metaSubject;

  const explicitChapterName = typeof question.chapterName === "string" ? question.chapterName.trim() : "";
  if (explicitChapterName) return explicitChapterName;

  const chapterName = typeof question.meta?.chapterName === "string" ? question.meta.chapterName.trim() : "";
  if (chapterName) return chapterName;

  const explicitSubject = typeof question.subjectLabel === "string" ? question.subjectLabel.trim() : "";
  if (explicitSubject) return explicitSubject;

  return testItem.subjectName?.trim() || testItem.chapterName?.trim() || testItem.className?.trim() || "General";
}

function getQuestionTopic(question: AnalysisQuestion, testItem: StudentTestItem) {
  const explicitTopic = typeof question.topicTag === "string" ? question.topicTag.trim() : "";
  if (explicitTopic) return explicitTopic;

  const metaTopic = typeof question.meta?.topicTag === "string" ? question.meta.topicTag.trim() : "";
  if (metaTopic) return metaTopic;

  const explicitChapter = typeof question.chapterName === "string" ? question.chapterName.trim() : "";
  if (explicitChapter) return explicitChapter;

  const metaChapter = typeof question.meta?.chapterName === "string" ? question.meta.chapterName.trim() : "";
  if (metaChapter) return metaChapter;

  return getQuestionSubject(question, testItem);
}

function mergeFocusArea(
  buckets: Map<string, { topic: string; subject: string; metrics: FocusAreaMetrics }>,
  subject: string,
  topic: string,
  partial: Partial<FocusAreaMetrics>,
) {
  const resolvedSubject = subject.trim() || "General";
  const resolvedTopic = topic.trim() || resolvedSubject;
  const key = `${normalizeFocusKey(resolvedSubject)}::${normalizeFocusKey(resolvedTopic)}`;
  if (!key || key === "::") return;

  const existing = buckets.get(key) ?? {
    topic: resolvedTopic,
    subject: resolvedSubject,
    metrics: {
      correct: 0,
      exposure: 0,
      testQuestions: 0,
      questionBankQuestions: 0,
      questionBankAttempts: 0,
    },
  };

  existing.metrics.correct += safeNumber(partial.correct);
  existing.metrics.exposure += safeNumber(partial.exposure);
  existing.metrics.testQuestions += safeNumber(partial.testQuestions);
  existing.metrics.questionBankQuestions += safeNumber(partial.questionBankQuestions);
  existing.metrics.questionBankAttempts += safeNumber(partial.questionBankAttempts);

  buckets.set(key, existing);
}

function getDifficultyBucket(question: AnalysisQuestion): "easy" | "medium" | "hard" {
  const raw = typeof question.meta?.difficulty === "string" ? question.meta.difficulty.trim().toLowerCase() : "";
  if (raw.includes("easy")) return "easy";
  if (raw.includes("hard")) return "hard";
  return "medium";
}

function formatMinutes(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "--";
  return `${value.toFixed(1)}m`;
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getAttemptedCount(item: CompletedAnalysis) {
  return item.submission.correctCount + item.submission.wrongCount;
}

function resolveDailyGoal(value: number | undefined) {
  return Number.isInteger(value) && value && value > 0 ? value : DEFAULT_DAILY_GOAL;
}

type PendingPreviewState = {
  solvedToday: number;
  streak: number;
  totalTestsTaken: number;
  testsThisWeek: number;
  averageScore: number;
  averageScoreSub: string;
  avgTimeMinutes: number;
  averageTimeSub: string;
  bestScore: number;
  bestScoreTotal: number;
  bestTestTitle: string;
  performanceData: Array<{ name: string; score: number; index: number }>;
  subjectData: Array<{ subject: string; accuracy: number; avgAccuracy: number; attempted: number }>;
  timeSubjects: string[];
  timeData: Array<Record<string, string | number>>;
  difficultyData: Array<{ name: string; value: number; color: string }>;
  recentTests: Array<{ id: number; name: string; date: string; score: string; accuracy: string; time: string }>;
  weakTopics: Array<{ topic: string; subject: string; accuracy: number }>;
  weeklyData: Array<{ day: string; questions: number; isToday: boolean }>;
};

function getPendingPreviewSubjects(targetExam?: string | null) {
  const exam = (targetExam ?? "").trim().toLowerCase();
  if (exam.includes("gate")) {
    return [
      "General Aptitude",
      "Engineering Mathematics",
      "Network Theory",
      "Control Systems",
      "Communication Systems",
      "Electronic Devices",
      "Signals & Systems",
      "Electromagnetics",
      "Digital Electronics",
      "Analog Circuits",
    ];
  }
  if (exam.includes("jee")) {
    return ["Physics", "Chemistry", "Mathematics", "Algebra", "Calculus", "Mechanics"];
  }
  if (exam.includes("neet")) {
    return ["Biology", "Botany", "Zoology", "Physics", "Chemistry", "Organic Chemistry"];
  }
  return ["General Aptitude", "Logical Reasoning", "Quantitative Aptitude", "Core Concepts", "Practice Sets"];
}

function buildPendingDashboardPreview(targetExam?: string | null): PendingPreviewState {
  const subjects = getPendingPreviewSubjects(targetExam);
  const weekPattern = [42, 58, 64, 51, 75, 83, 67];
  const weeklyData = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, index) => ({
    day,
    questions: weekPattern[index] ?? 0,
    isToday: index === 6,
  }));

  const performanceData = [
    { name: "Mock 1", score: 54, index: 1 },
    { name: "Mock 2", score: 61, index: 2 },
    { name: "Mock 3", score: 58, index: 3 },
    { name: "Mock 4", score: 66, index: 4 },
    { name: "Mock 5", score: 72, index: 5 },
  ];

  const subjectData = subjects.map((subject, index) => ({
    subject,
    accuracy: Math.max(38, 76 - index * 3),
    avgAccuracy: Math.max(42, 68 - index * 2),
    attempted: Math.max(10, 42 - index * 2),
  }));

  const timeSubjects = subjects.slice(0, 3);
  const timeData = [
    { test: "Mock 1", [timeSubjects[0]]: 1.6, [timeSubjects[1]]: 1.3, [timeSubjects[2]]: 1.4 },
    { test: "Mock 2", [timeSubjects[0]]: 1.4, [timeSubjects[1]]: 1.2, [timeSubjects[2]]: 1.3 },
    { test: "Mock 3", [timeSubjects[0]]: 1.5, [timeSubjects[1]]: 1.1, [timeSubjects[2]]: 1.2 },
    { test: "Mock 4", [timeSubjects[0]]: 1.2, [timeSubjects[1]]: 1.0, [timeSubjects[2]]: 1.1 },
  ];

  const difficultyData = [
    { name: "Easy (Correct)", value: 24, color: "hsl(var(--chart-5))" },
    { name: "Medium (Correct)", value: 31, color: "hsl(var(--chart-1))" },
    { name: "Hard (Correct)", value: 14, color: "hsl(var(--chart-2))" },
    { name: "Incorrect/Unattempted", value: 19, color: "hsl(var(--muted))" },
  ];

  const label = formatExamDisplayName(targetExam) || "Practice";
  const recentTests = [
    { id: 901, name: `${label} Preview Test 1`, date: "Apr 16, 2026", score: "58/100", accuracy: "58%", time: "89 min" },
    { id: 902, name: `${label} Preview Test 2`, date: "Apr 17, 2026", score: "64/100", accuracy: "64%", time: "84 min" },
    { id: 903, name: `${label} Preview Test 3`, date: "Apr 18, 2026", score: "72/100", accuracy: "72%", time: "78 min" },
  ];

  const weakTopics = subjects.slice(-5).map((subject, index) => ({
    topic: `${subject} Practice`,
    subject,
    accuracy: 42 + index * 4,
  }));

  return {
    solvedToday: 67,
    streak: 6,
    totalTestsTaken: 12,
    testsThisWeek: 3,
    averageScore: 66,
    averageScoreSub: "Sample preview trend until verification is complete",
    avgTimeMinutes: 1.3,
    averageTimeSub: "Sample speed insight visible in preview mode",
    bestScore: 72,
    bestScoreTotal: 100,
    bestTestTitle: `${label} Preview Test 3`,
    performanceData,
    subjectData,
    timeSubjects,
    timeData,
    difficultyData,
    recentTests,
    weakTopics,
    weeklyData,
  };
}

function DailyGoalTracker({
  solved,
  streak,
  goal,
  isEditing,
  draftGoal,
  onDraftChange,
  onEdit,
  onCancel,
  onSave,
  isSaving,
}: {
  solved: number;
  streak: number;
  goal: number;
  isEditing: boolean;
  draftGoal: string;
  onDraftChange: (value: string) => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  const progress = Math.min((solved / goal) * 100, 100);
  const milestones = [
    { at: 0, icon: "🚶", color: "#a78bfa" },
    { at: Math.max(1, Math.round(goal * 0.25)), icon: "🏃", color: "#818cf8" },
    { at: Math.max(1, Math.round(goal * 0.5)), icon: "🏃‍♂️", color: "#38bdf8" },
    { at: Math.max(1, Math.round(goal * 0.8)), icon: "⚡", color: "#34d399" },
    { at: goal, icon: "🏁", color: "#f59e0b" },
  ];

  return (
    <div
      className="relative overflow-hidden rounded-2xl px-4 py-4 shadow-sm sm:px-6"
      style={{
        background: "linear-gradient(135deg, #6d28d9 0%, #4f46e5 45%, #0ea5e9 100%)",
      }}
    >
      <div className="relative flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:shrink-0">
          <Flame className="h-4 w-4 text-orange-300" />
          <span className="text-white font-semibold text-sm">Your Daily Goal</span>
          {isEditing ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-white/80 text-sm">
                (<span className="text-white font-bold">{solved}</span>/
              </span>
              <Input
                value={draftGoal}
                onChange={(event) => onDraftChange(event.target.value)}
                inputMode="numeric"
                className="h-8 w-20 border-white/20 bg-white/10 px-2 text-sm text-white placeholder:text-white/60"
                placeholder={String(goal)}
              />
              <span className="text-white/80 text-sm">Qs)</span>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10 hover:text-white" onClick={onSave} disabled={isSaving}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10 hover:text-white" onClick={onCancel} disabled={isSaving}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <span className="text-white/80 text-sm">
                (<span className="text-white font-bold">{solved}</span>/{goal} Qs)
              </span>
              <button
                type="button"
                className="inline-flex items-center justify-center text-white/80 transition hover:text-white"
                onClick={onEdit}
                aria-label="Edit daily goal"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </>
          )}
        </div>

        <div className="hidden items-center gap-6 sm:flex">
          <div className="relative h-3 w-full flex-1 overflow-visible rounded-full bg-white/20 sm:mx-4">
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
              style={{
                width: `${progress}%`,
                background: "linear-gradient(90deg, #c4b5fd 0%, #60a5fa 50%, #34d399 100%)",
                boxShadow: "0 0 10px rgba(196,181,253,0.5)",
              }}
            />
            {milestones.map((milestone) => {
              const pct = (milestone.at / goal) * 100;
              const reached = solved >= milestone.at;
              return (
                <div
                  key={milestone.at}
                  className="absolute top-1/2 flex h-7 w-7 items-center justify-center rounded-full border-2 text-sm shadow-md transition-all duration-500"
                  style={{
                    left: `${pct}%`,
                    transform: "translate(-50%, -50%)",
                    backgroundColor: reached ? milestone.color : "rgba(255,255,255,0.15)",
                    borderColor: reached ? milestone.color : "rgba(255,255,255,0.25)",
                  }}
                >
                  <span style={{ fontSize: "12px", lineHeight: 1 }}>{milestone.icon}</span>
                </div>
              );
            })}
          </div>

          <div className="flex w-full items-center justify-between gap-4 text-white sm:w-auto sm:shrink-0 sm:justify-start">
            <div className="text-center">
              <p className="text-white/60 text-[10px] uppercase tracking-wide">Streak</p>
              <p className="font-bold text-sm">{streak} 🔥</p>
            </div>
            <div className="h-6 w-px bg-white/20" />
            <div className="text-center">
              <p className="text-white/60 text-[10px] uppercase tracking-wide">Progress</p>
              <p className="font-bold text-sm">{Math.round(progress)}%</p>
            </div>
          </div>
        </div>

        <div className="space-y-3 sm:hidden">
          <div className="grid grid-cols-5 gap-2">
            {milestones.map((milestone) => {
              const reached = solved >= milestone.at;
              return (
                <div key={`mobile-${milestone.at}`} className="flex flex-col items-center gap-1">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-full border text-sm shadow-sm transition-all duration-500"
                    style={{
                      backgroundColor: reached ? milestone.color : "rgba(255,255,255,0.14)",
                      borderColor: reached ? milestone.color : "rgba(255,255,255,0.2)",
                    }}
                  >
                    <span style={{ fontSize: "12px", lineHeight: 1 }}>{milestone.icon}</span>
                  </div>
                  <span className="text-[10px] font-medium text-white/75">{milestone.at}</span>
                </div>
              );
            })}
          </div>

          <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${progress}%`,
                background: "linear-gradient(90deg, #c4b5fd 0%, #60a5fa 50%, #34d399 100%)",
                boxShadow: "0 0 10px rgba(196,181,253,0.45)",
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 text-white">
            <div className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/60">Streak</p>
              <p className="mt-1 text-base font-bold">{streak} 🔥</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/60">Progress</p>
              <p className="mt-1 text-base font-bold">{Math.round(progress)}%</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PendingPreviewDashboard({
  preview,
  goal,
  onLockedAction,
  onOpenStatusPage,
}: {
  preview: PendingPreviewState;
  goal: number;
  onLockedAction: () => void;
  onOpenStatusPage: () => void;
}) {
  const subjectAxisAngle = preview.subjectData.length > 5 ? -18 : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Dashboard</h1>
      </div>

      <StudentPreviewLockBanner
        title="Dashboard preview locked"
        description="Sample metrics are visible for now. Tests and question bank unlock after approval."
        onCheckStatus={onOpenStatusPage}
        onOpenLocked={onLockedAction}
      />

      <DailyGoalTracker
        solved={preview.solvedToday}
        streak={preview.streak}
        goal={goal}
        isEditing={false}
        draftGoal={String(goal)}
        onDraftChange={() => undefined}
        onEdit={onLockedAction}
        onCancel={() => undefined}
        onSave={() => undefined}
        isSaving={false}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="hover-elevate transition-all border-l-4 border-l-primary">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Tests Taken</CardTitle>
            <div className="p-2 bg-primary/10 rounded-full">
              <Target className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{preview.totalTestsTaken}</div>
            <p className="text-xs text-muted-foreground mt-1">+{preview.testsThisWeek} this week</p>
          </CardContent>
        </Card>

        <Card className="hover-elevate transition-all border-l-4 border-l-chart-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Average Score</CardTitle>
            <div className="p-2 bg-chart-2/10 rounded-full">
              <BrainCircuit className="h-4 w-4 text-chart-2" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{preview.averageScore}%</div>
            <p className="text-xs text-chart-5 font-medium mt-1">{preview.averageScoreSub}</p>
          </CardContent>
        </Card>

        <Card className="hover-elevate transition-all border-l-4 border-l-chart-4">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Best Score</CardTitle>
            <div className="p-2 bg-chart-4/10 rounded-full">
              <Award className="h-4 w-4 text-chart-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {preview.bestScore}
              <span className="text-sm font-normal text-muted-foreground">/{preview.bestScoreTotal}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{preview.bestTestTitle}</p>
          </CardContent>
        </Card>

        <Card className="hover-elevate transition-all border-l-4 border-l-chart-3">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg. Time / Question</CardTitle>
            <div className="p-2 bg-chart-3/10 rounded-full">
              <Timer className="h-4 w-4 text-chart-3" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatMinutes(preview.avgTimeMinutes)}</div>
            <p className="text-xs text-chart-5 font-medium mt-1">{preview.averageTimeSub}</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="shadow-sm border-border/60">
          <CardHeader>
            <CardTitle>Performance Trend</CardTitle>
            <CardDescription>Sample mock trend available before verification</CardDescription>
          </CardHeader>
          <CardContent className="px-2">
            <div className="h-[240px] w-full sm:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={preview.performanceData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorScorePreview" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={PERFORMANCE_TREND_FILL_COLOR} stopOpacity={0.32} />
                      <stop offset="95%" stopColor={PERFORMANCE_TREND_FILL_COLOR} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} dx={-10} domain={[0, 100]} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke={PERFORMANCE_TREND_LINE_COLOR}
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorScorePreview)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/60">
          <CardHeader>
            <CardTitle>Subject-wise Accuracy</CardTitle>
            <CardDescription>Sample subject accuracy preview</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[240px] w-full sm:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={preview.subjectData} margin={{ top: 10, right: 10, left: 0, bottom: 36 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="subject"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(value) => shortLabel(String(value), 12)}
                    angle={subjectAxisAngle}
                    textAnchor={subjectAxisAngle === 0 ? "middle" : "end"}
                    interval={0}
                    height={subjectAxisAngle === 0 ? 38 : 56}
                    tickMargin={10}
                  />
                  <YAxis axisLine={false} tickLine={false} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(value) => `${value}%`} />
                  <Tooltip />
                  <Legend
                    wrapperStyle={{ paddingTop: "20px", fontSize: "12px" }}
                    formatter={(value, _entry, index) => renderSubjectLegendLabel(String(value), index)}
                  />
                  <Bar dataKey="accuracy" name="Preview Accuracy %" fill={SUBJECT_ACCURACY_BAR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="avgAccuracy" name="Peer Average %" fill={SUBJECT_PEER_BAR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="shadow-sm border-border/60">
          <CardHeader>
            <CardTitle>Difficulty Breakdown</CardTitle>
            <CardDescription>Sample performance by question level</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center">
            <div className="h-[220px] w-full sm:h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={preview.difficultyData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value" stroke="none">
                    {preview.difficultyData.map((entry, index) => (
                      <Cell key={`preview-cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 grid w-full grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
              {preview.difficultyData.map((item, index) => (
                <div key={index} className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-muted-foreground truncate">{item.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 shadow-sm border-border/60">
          <CardHeader>
            <CardTitle>Time Analysis (mins/question)</CardTitle>
            <CardDescription>Sample time spent per subject</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[220px] w-full sm:h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={preview.timeData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="test" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} domain={[0, 3]} />
                  <Tooltip />
                  <Legend wrapperStyle={{ paddingTop: "10px", fontSize: "12px" }} />
                  {preview.timeSubjects.map((subject, index) => (
                    <Line
                      key={subject}
                      type="monotone"
                      dataKey={subject}
                      name={subject}
                      stroke={TIME_SERIES_COLORS[index % TIME_SERIES_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
        <Card className="md:col-span-2 shadow-sm border-border/60 overflow-hidden">
          <CardHeader className="bg-muted/30 border-b border-border/50">
            <CardTitle>Recent Tests</CardTitle>
            <CardDescription>Sample attempts visible in preview mode</CardDescription>
          </CardHeader>
          <div className="space-y-3 px-4 pb-4 md:hidden">
            {preview.recentTests.map((test) => (
              <div key={test.id} className="rounded-2xl border border-border/60 bg-background px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{test.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{test.date}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-foreground">{test.score}</span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Accuracy</span>
                      <span>{test.accuracy}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: test.accuracy }} />
                    </div>
                  </div>
                  <button className="shrink-0 text-xs font-semibold text-primary transition-colors hover:text-primary/80" onClick={onLockedAction}>
                    Analysis
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground bg-muted/20">
                <tr>
                  <th className="px-6 py-3 font-medium">Test Name</th>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Score</th>
                  <th className="px-6 py-3 font-medium">Accuracy</th>
                  <th className="px-6 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {preview.recentTests.map((test) => (
                  <tr key={test.id} className="border-b border-border/50 last:border-0 hover:bg-muted/10 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{test.name}</td>
                    <td className="px-6 py-4 text-muted-foreground">{test.date}</td>
                    <td className="px-6 py-4 font-medium">{test.score}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span>{test.accuracy}</span>
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: test.accuracy }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="text-primary hover:text-primary/80 font-medium flex items-center justify-end gap-1 ml-auto text-xs transition-colors" onClick={onLockedAction}>
                        Analysis <ChevronRight className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="shadow-sm border-border/60 bg-gradient-to-br from-card to-primary/5 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-destructive" />
              Priority Focus Areas
            </CardTitle>
            <CardDescription>Sample weak-topic preview before approval</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <div className="divide-y divide-border/50">
              {preview.weakTopics.map((topic, index) => (
                <div key={`${topic.topic}-${index}`} className="flex items-center justify-between px-6 py-3 hover:bg-white/50 transition-colors">
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none text-foreground">{topic.topic}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {topic.subject}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-sm font-bold text-destructive">{topic.accuracy}%</span>
                    <span className="text-[10px] text-muted-foreground">Accuracy</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-border/60">
        <CardHeader>
          <CardTitle>Weekly Questions Solved</CardTitle>
          <CardDescription>Sample weekly consistency view</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[160px] w-full sm:h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={preview.weeklyData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} dy={8} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip formatter={(value: number) => [`${value} Qs`, "Solved"]} />
                <Bar dataKey="questions" radius={[6, 6, 0, 0]} maxBarSize={48}>
                  {preview.weeklyData.map((entry, index) => (
                    <Cell
                      key={`preview-week-${index}`}
                      fill={entry.isToday ? "hsl(var(--primary))" : entry.questions >= 80 ? "hsl(var(--chart-3))" : "hsl(var(--muted))"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user, login } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isPendingPreview = isStudentPendingVerification(user);
  const initialDailyGoal = resolveDailyGoal(user?.profileDetails?.dashboard?.dailyQuestionGoal);
  const [isEditingDailyGoal, setIsEditingDailyGoal] = useState(false);
  const [dailyGoalDraft, setDailyGoalDraft] = useState(String(initialDailyGoal));
  const [dailyGoal, setDailyGoal] = useState(initialDailyGoal);
  const [isSavingDailyGoal, setIsSavingDailyGoal] = useState(false);
  const [pendingDialogOpen, setPendingDialogOpen] = useState(false);

  useEffect(() => {
    const nextGoal = resolveDailyGoal(user?.profileDetails?.dashboard?.dailyQuestionGoal);
    setDailyGoal(nextGoal);
    if (!isEditingDailyGoal) {
      setDailyGoalDraft(String(nextGoal));
    }
  }, [isEditingDailyGoal, user]);

  const { data: tests = [], isLoading: isTestsLoading, isError: isTestsError, error: testsError } = useQuery<StudentTestItem[]>({
    queryKey: ["dashboard-tests"],
    queryFn: () => api.get("/tests"),
    staleTime: 60_000,
    enabled: !isPendingPreview,
  });

  const completedTests = useMemo(
    () => tests.filter((test) => test.alreadySubmitted),
    [tests],
  );

  const analysisQueries = useQueries({
    queries: isPendingPreview ? [] : completedTests.map((test) => ({
      queryKey: ["dashboard-test-analysis", test.id],
      queryFn: () => api.get(`/tests/${test.id}/my-analysis`) as Promise<AnalysisResponse>,
      staleTime: 5 * 60_000,
    })),
  });

  const { data: questionBankProgress } = useQuery<QuestionBankProgressSummary>({
    queryKey: ["dashboard-question-bank-progress"],
    queryFn: () => api.get("/question-bank/progress/summary"),
    staleTime: 60_000,
    enabled: !isPendingPreview,
  });

  const { data: questionBankExams = [] } = useQuery<StudentQuestionBankExamSummary[]>({
    queryKey: ["dashboard-question-bank-exams"],
    queryFn: () => api.get("/question-bank/exams"),
    staleTime: 60_000,
    enabled: !isPendingPreview,
  });

  const questionBankExamQueries = useQueries({
    queries: isPendingPreview ? [] : questionBankExams.map((exam) => ({
      queryKey: ["dashboard-question-bank-exam", exam.key],
      queryFn: () => api.get(`/question-bank/exams/${exam.key}`) as Promise<StudentQuestionBankExamResponse>,
      staleTime: 60_000,
    })),
  });

  const saveDailyGoal = async () => {
    const parsedGoal = Number(dailyGoalDraft);
    if (!Number.isInteger(parsedGoal) || parsedGoal <= 0 || parsedGoal > 5000) {
      toast({ title: "Invalid goal", description: "Daily goal must be between 1 and 5000.", variant: "destructive" });
      return;
    }

    try {
      setIsSavingDailyGoal(true);
      const updatedUser = await api.patch("/auth/profile", { dailyQuestionGoal: parsedGoal });
      login(updatedUser);
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      setDailyGoal(parsedGoal);
      setDailyGoalDraft(String(parsedGoal));
      setIsEditingDailyGoal(false);
      toast({ title: "Daily goal updated" });
    } catch (error) {
      toast({
        title: "Goal update failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSavingDailyGoal(false);
    }
  };

  const isAnalysisLoading = completedTests.length > 0 && analysisQueries.some((query) => query.isLoading && !query.data);
  const analysisErrors = analysisQueries.filter((query) => query.isError);
  const pendingPreview = useMemo(() => buildPendingDashboardPreview(user?.subject), [user?.subject]);

  const analyses = useMemo<CompletedAnalysis[]>(() => {
    return completedTests
      .map((test, index) => {
        const data = analysisQueries[index]?.data;
        if (!data) return null;
        return {
          ...data,
          testItem: test,
        };
      })
      .filter((item): item is CompletedAnalysis => item !== null)
      .sort((a, b) => new Date(a.submission.submittedAt).getTime() - new Date(b.submission.submittedAt).getTime());
  }, [analysisQueries, completedTests]);

  const questionBankExamDetails = useMemo<StudentQuestionBankExamResponse[]>(() => (
    questionBankExamQueries
      .map((query) => query.data)
      .filter((item): item is StudentQuestionBankExamResponse => Boolean(item))
  ), [questionBankExamQueries]);

  const dashboardState = useMemo(() => {
    const completedPercentages = analyses.map((item) => safeNumber(item.submission.percentage));
    const recentThreeScores = completedPercentages.slice(-3);
    const previousThreeScores = completedPercentages.slice(-6, -3);
    const averageScore = average(completedPercentages);
    const recentAverageScore = average(recentThreeScores);
    const previousAverageScore = average(previousThreeScores);
    const averageScoreDelta = recentAverageScore != null && previousAverageScore != null
      ? recentAverageScore - previousAverageScore
      : null;

    const perQuestionTimes = analyses.flatMap((item) =>
      item.perQuestion
        .map((question) => safeNumber(question.myTime))
        .filter((value) => value > 0),
    );
    const avgSecondsPerQuestion = average(perQuestionTimes);

    const recentTimeValues = analyses.slice(-3).flatMap((item) =>
      item.perQuestion.map((question) => safeNumber(question.myTime)).filter((value) => value > 0),
    );
    const previousTimeValues = analyses.slice(-6, -3).flatMap((item) =>
      item.perQuestion.map((question) => safeNumber(question.myTime)).filter((value) => value > 0),
    );
    const recentAvgSeconds = average(recentTimeValues);
    const previousAvgSeconds = average(previousTimeValues);
    const averageTimeDelta = recentAvgSeconds != null && previousAvgSeconds != null
      ? recentAvgSeconds - previousAvgSeconds
      : null;

    const bestAnalysis = analyses.reduce<CompletedAnalysis | null>((best, item) => {
      if (!best) return item;
      return safeNumber(item.submission.percentage) > safeNumber(best.submission.percentage) ? item : best;
    }, null);

    const performanceData = analyses.slice(-10).map((item, index) => ({
      name: shortLabel(item.testItem.title, 10),
      score: Math.round(safeNumber(item.submission.percentage)),
      index: index + 1,
    }));

    const subjectStats = new Map<string, { correct: number; attempted: number; classRates: number[] }>();
    analyses.forEach((item) => {
      item.perQuestion.forEach((question) => {
        const subject = getQuestionSubject(question, item.testItem);
        const bucket = subjectStats.get(subject) ?? { correct: 0, attempted: 0, classRates: [] };
        if (!question.isSkipped) {
          bucket.attempted += 1;
          if (question.isCorrect) bucket.correct += 1;
        }
        bucket.classRates.push(safeNumber(question.classSuccessRate));
        subjectStats.set(subject, bucket);
      });
    });

    const subjectData = [...subjectStats.entries()]
      .map(([subject, stats]) => ({
        subject,
        accuracy: stats.attempted > 0 ? Math.round((stats.correct / stats.attempted) * 100) : 0,
        avgAccuracy: Math.round(average(stats.classRates) ?? 0),
        attempted: stats.attempted,
      }))
      .sort((a, b) => b.attempted - a.attempted || a.subject.localeCompare(b.subject));

    const timeSubjects = subjectData.length > 0
      ? subjectData.map((entry) => entry.subject).slice(0, 3)
      : ["General"];

    const timeData = analyses.slice(-5).map((item) => {
      const row: Record<string, string | number> = {
        test: shortLabel(item.testItem.title, 10),
      };

      timeSubjects.forEach((subject) => {
        const matching = item.perQuestion.filter((question) => getQuestionSubject(question, item.testItem) === subject);
        const totalTime = matching.reduce((sum, question) => sum + safeNumber(question.myTime), 0);
        row[subject] = matching.length > 0 ? Number((totalTime / matching.length / 60).toFixed(1)) : 0;
      });

      return row;
    });

    let easyCorrect = 0;
    let mediumCorrect = 0;
    let hardCorrect = 0;
    let incorrectOrUnattempted = 0;
    analyses.forEach((item) => {
      item.perQuestion.forEach((question) => {
        if (question.isCorrect) {
          const bucket = getDifficultyBucket(question);
          if (bucket === "easy") easyCorrect += 1;
          else if (bucket === "hard") hardCorrect += 1;
          else mediumCorrect += 1;
        } else {
          incorrectOrUnattempted += 1;
        }
      });
    });

    const difficultyData = [
      { name: "Easy (Correct)", value: easyCorrect, color: "hsl(var(--chart-5))" },
      { name: "Medium (Correct)", value: mediumCorrect, color: "hsl(var(--chart-1))" },
      { name: "Hard (Correct)", value: hardCorrect, color: "hsl(var(--chart-2))" },
      { name: "Incorrect/Unattempted", value: incorrectOrUnattempted, color: "hsl(var(--muted))" },
    ];

    const recentTests = [...analyses]
      .sort((a, b) => new Date(b.submission.submittedAt).getTime() - new Date(a.submission.submittedAt).getTime())
      .slice(0, 5)
      .map((item) => ({
        id: item.test.id,
        name: item.test.title,
        date: format(new Date(item.submission.submittedAt), "MMM d, yyyy"),
        score: `${Math.round(safeNumber(item.submission.score))}/${item.submission.totalPoints}`,
        accuracy: `${Math.round(safeNumber(item.submission.percentage))}%`,
        time: `${Math.max(1, Math.round(safeNumber(item.submission.totalTime) / 60))} min`,
      }));

    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const submissionCountByDate = new Map<string, number>();
    analyses.forEach((item) => {
      const date = new Date(item.submission.submittedAt);
      const key = format(date, "yyyy-MM-dd");
      submissionCountByDate.set(
        key,
        (submissionCountByDate.get(key) ?? 0) + getAttemptedCount(item),
      );
    });
    (questionBankProgress?.dailySolvedCounts ?? []).forEach((entry) => {
      const key = typeof entry.date === "string" ? entry.date : "";
      if (!key) return;
      submissionCountByDate.set(key, (submissionCountByDate.get(key) ?? 0) + safeNumber(entry.questions));
    });

    const weeklyData = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(weekStart, index);
      const key = format(date, "yyyy-MM-dd");
      return {
        day: format(date, "EEE"),
        questions: submissionCountByDate.get(key) ?? 0,
        isToday: isSameDay(date, new Date()),
      };
    });

    const solvedToday = weeklyData.find((entry) => entry.isToday)?.questions ?? 0;

    let streak = 0;
    for (let offset = 0; offset < 30; offset += 1) {
      const key = format(subDays(new Date(), offset), "yyyy-MM-dd");
      if ((submissionCountByDate.get(key) ?? 0) > 0) streak += 1;
      else break;
    }

    const focusAreaBuckets = new Map<string, { topic: string; subject: string; metrics: FocusAreaMetrics }>();

    analyses.forEach((item) => {
      item.perQuestion.forEach((question) => {
        const subject = getQuestionSubject(question, item.testItem);
        const topic = getQuestionTopic(question, item.testItem);
        mergeFocusArea(focusAreaBuckets, subject, topic, {
          correct: question.isCorrect ? 1 : 0,
          exposure: 1,
          testQuestions: 1,
        });
      });
    });

    questionBankExamDetails.forEach((exam) => {
      exam.subjects.forEach((subject) => {
        const subjectLabel = subject.title?.trim() || exam.exam.label || "General";
        subject.chapters.forEach((chapter) => {
          const chapterLabel = chapter.title?.trim() || subjectLabel;
          chapter.questions.forEach((question) => {
            const attempts = Math.max(safeNumber(question.progress?.attemptCount), 0);
            if (attempts <= 0) return;

            const correct = Math.min(Math.max(safeNumber(question.progress?.correctCount), 0), attempts);
            const topic = question.topicTag?.trim() || chapterLabel;

            mergeFocusArea(focusAreaBuckets, subjectLabel, topic, {
              correct,
              exposure: attempts,
              questionBankQuestions: 1,
              questionBankAttempts: attempts,
            });
          });
        });
      });
    });

    const weakTopics = [...focusAreaBuckets.values()]
      .map((entry) => ({
        topic: entry.topic,
        subject: entry.subject,
        accuracy: entry.metrics.exposure > 0 ? Math.round((entry.metrics.correct / entry.metrics.exposure) * 100) : 0,
        activity: entry.metrics.testQuestions + entry.metrics.questionBankAttempts,
      }))
      .filter((entry) => entry.activity > 0 && entry.accuracy < 100)
      .sort((a, b) => a.accuracy - b.accuracy || b.activity - a.activity || a.subject.localeCompare(b.subject) || a.topic.localeCompare(b.topic))
      .slice(0, 5);

    const testsThisWeek = analyses.filter((item) => {
      const date = new Date(item.submission.submittedAt);
      return date >= weekStart;
    }).length;

    return {
      totalTestsTaken: analyses.length,
      averageScore,
      averageScoreDelta,
      avgSecondsPerQuestion,
      averageTimeDelta,
      bestAnalysis,
      performanceData,
      subjectData,
      timeSubjects,
      timeData,
      difficultyData,
      recentTests,
      weeklyData,
      solvedToday,
      streak,
      weakTopics,
      testsThisWeek,
    };
  }, [analyses, questionBankExamDetails, questionBankProgress]);

  const isLoading = isTestsLoading || isAnalysisLoading;
  const errorMessage = isTestsError
    ? (testsError instanceof Error ? testsError.message : "Failed to load dashboard")
    : analysisErrors[0]?.error instanceof Error
      ? analysisErrors[0].error.message
      : null;

  if (isPendingPreview) {
    return (
      <>
        <PendingPreviewDashboard
          preview={pendingPreview}
          goal={dailyGoal}
          onLockedAction={() => setPendingDialogOpen(true)}
          onOpenStatusPage={() => setLocation("/student/pending-approval")}
        />
        <PendingVerificationDialog
          open={pendingDialogOpen}
          onOpenChange={setPendingDialogOpen}
          onCheckStatus={() => setLocation("/student/pending-approval")}
        />
      </>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500 max-w-[1600px] mx-auto">
        <div className="h-12 w-56 bg-muted rounded animate-pulse" />
        <div className="h-20 rounded-2xl bg-muted animate-pulse" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />)}
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
          <div className="lg:col-span-4 h-[380px] rounded-xl bg-muted animate-pulse" />
          <div className="lg:col-span-3 h-[380px] rounded-xl bg-muted animate-pulse" />
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dashboard unavailable</CardTitle>
          <CardDescription>{errorMessage}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const performanceData = dashboardState.performanceData.length > 0
    ? dashboardState.performanceData
    : [{ name: "No Data", score: 0, index: 0 }];

  const subjectDisplayLimit = 10;
  const subjectData = dashboardState.subjectData.length > 0
    ? dashboardState.subjectData.slice(0, subjectDisplayLimit)
    : [{ subject: "General", accuracy: 0, avgAccuracy: 0, attempted: 0 }];
  const subjectAxisAngle = subjectData.length > 5 ? -18 : 0;

  const timeSubjects = dashboardState.timeSubjects.length > 0
    ? dashboardState.timeSubjects
    : ["General"];

  const timeData = dashboardState.timeData.length > 0
    ? dashboardState.timeData
    : [{ test: "No Data", General: 0 }];

  const difficultyData = dashboardState.difficultyData;
  const recentTests = dashboardState.recentTests;
  const weeklyData = dashboardState.weeklyData;
  const weakTopics = dashboardState.weakTopics;
  const bestAnalysis = dashboardState.bestAnalysis;
  const avgTimeMinutes = dashboardState.avgSecondsPerQuestion != null ? dashboardState.avgSecondsPerQuestion / 60 : null;
  const averageScoreText = dashboardState.averageScore != null ? `${Math.round(dashboardState.averageScore)}%` : "--";
  const averageScoreSub = dashboardState.averageScoreDelta != null
    ? `${dashboardState.averageScoreDelta >= 0 ? "+" : ""}${dashboardState.averageScoreDelta.toFixed(1)}% from recent tests`
    : "Take a few tests to unlock trend";
  const averageTimeSub = dashboardState.averageTimeDelta != null
    ? dashboardState.averageTimeDelta <= 0
      ? `-${Math.abs(dashboardState.averageTimeDelta / 60).toFixed(1)}m improvement`
      : `+${Math.abs(dashboardState.averageTimeDelta / 60).toFixed(1)}m slower`
    : "Speed trend will appear soon";

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Welcome back. Here is your preparation summary.</p>
      </div>

      <DailyGoalTracker
        solved={dashboardState.solvedToday}
        streak={dashboardState.streak}
        goal={dailyGoal}
        isEditing={isEditingDailyGoal}
        draftGoal={dailyGoalDraft}
        onDraftChange={setDailyGoalDraft}
        onEdit={() => setIsEditingDailyGoal(true)}
        onCancel={() => {
          setDailyGoalDraft(String(dailyGoal));
          setIsEditingDailyGoal(false);
        }}
        onSave={saveDailyGoal}
        isSaving={isSavingDailyGoal}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="hover-elevate transition-all border-l-4 border-l-primary">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Tests Taken</CardTitle>
            <div className="p-2 bg-primary/10 rounded-full">
              <Target className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardState.totalTestsTaken}</div>
            <p className="text-xs text-muted-foreground mt-1">+{dashboardState.testsThisWeek} this week</p>
          </CardContent>
        </Card>

        <Card className="hover-elevate transition-all border-l-4 border-l-chart-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Average Score</CardTitle>
            <div className="p-2 bg-chart-2/10 rounded-full">
              <BrainCircuit className="h-4 w-4 text-chart-2" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{averageScoreText}</div>
            <p className="text-xs text-chart-5 font-medium mt-1">{averageScoreSub}</p>
          </CardContent>
        </Card>

        <Card className="hover-elevate transition-all border-l-4 border-l-chart-4">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Best Score</CardTitle>
            <div className="p-2 bg-chart-4/10 rounded-full">
              <Award className="h-4 w-4 text-chart-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {bestAnalysis ? Math.round(safeNumber(bestAnalysis.submission.score)) : "--"}
              <span className="text-sm font-normal text-muted-foreground">
                {bestAnalysis ? `/${bestAnalysis.submission.totalPoints}` : ""}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{bestAnalysis?.test.title ?? "No submitted test yet"}</p>
          </CardContent>
        </Card>

        <Card className="hover-elevate transition-all border-l-4 border-l-chart-3">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg. Time / Question</CardTitle>
            <div className="p-2 bg-chart-3/10 rounded-full">
              <Timer className="h-4 w-4 text-chart-3" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatMinutes(avgTimeMinutes)}</div>
            <p className="text-xs text-chart-5 font-medium mt-1">{averageTimeSub}</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="shadow-sm border-border/60">
          <CardHeader>
            <CardTitle>Performance Trend</CardTitle>
            <CardDescription>Your mock test scores over time</CardDescription>
          </CardHeader>
          <CardContent className="px-2">
            <div className="h-[240px] w-full sm:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={performanceData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={PERFORMANCE_TREND_FILL_COLOR} stopOpacity={0.32} />
                      <stop offset="95%" stopColor={PERFORMANCE_TREND_FILL_COLOR} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    dx={-10}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    formatter={(value: number) => [`${value}%`, "Score"]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      borderRadius: "8px",
                      border: "1px solid hsl(var(--border))",
                      boxShadow: "var(--shadow-md)",
                    }}
                    itemStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke={PERFORMANCE_TREND_LINE_COLOR}
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorScore)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/60">
          <CardHeader>
            <CardTitle>Subject-wise Accuracy</CardTitle>
            <CardDescription>Your accuracy vs peer average</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[240px] w-full sm:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={subjectData} margin={{ top: 10, right: 10, left: 0, bottom: 36 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="subject"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(value) => shortLabel(String(value), 12)}
                    angle={subjectAxisAngle}
                    textAnchor={subjectAxisAngle === 0 ? "middle" : "end"}
                    interval={0}
                    height={subjectAxisAngle === 0 ? 38 : 56}
                    tickMargin={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 75, 100]}
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <Tooltip
                    labelFormatter={(value) => `Subject: ${String(value)}`}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      borderRadius: "8px",
                      border: "1px solid hsl(var(--border))",
                      boxShadow: "var(--shadow-md)",
                    }}
                    cursor={{ fill: "hsl(var(--muted)/0.4)" }}
                  />
                  <Legend
                    wrapperStyle={{ paddingTop: "20px", fontSize: "12px" }}
                    formatter={(value, _entry, index) => renderSubjectLegendLabel(String(value), index)}
                  />
                  <Bar dataKey="accuracy" name="Your Accuracy %" fill={SUBJECT_ACCURACY_BAR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="avgAccuracy" name="Peer Average %" fill={SUBJECT_PEER_BAR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="shadow-sm border-border/60">
          <CardHeader>
            <CardTitle>Difficulty Breakdown</CardTitle>
            <CardDescription>Performance by question level</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center">
            <div className="h-[220px] w-full sm:h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={difficultyData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {difficultyData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      borderRadius: "8px",
                      border: "1px solid hsl(var(--border))",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 grid w-full grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
              {difficultyData.map((item, index) => (
                <div key={index} className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-muted-foreground truncate">{item.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 shadow-sm border-border/60">
          <CardHeader>
            <CardTitle>Time Analysis (mins/question)</CardTitle>
            <CardDescription>Time spent per subject across recent tests</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[220px] w-full sm:h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="test"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    domain={[0, 3]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      borderRadius: "8px",
                      border: "1px solid hsl(var(--border))",
                    }}
                  />
                  <Legend wrapperStyle={{ paddingTop: "10px", fontSize: "12px" }} />
                  {timeSubjects.map((subject, index) => (
                    <Line
                      key={subject}
                      type="monotone"
                      dataKey={subject}
                      name={subject}
                      stroke={TIME_SERIES_COLORS[index % TIME_SERIES_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
        <Card className="md:col-span-2 shadow-sm border-border/60 overflow-hidden">
          <CardHeader className="bg-muted/30 border-b border-border/50">
            <CardTitle>Recent Tests</CardTitle>
            <CardDescription>Your latest mock attempts and performance</CardDescription>
          </CardHeader>
          <div className="space-y-3 px-4 pb-4 md:hidden">
            {recentTests.length === 0 ? (
              <div className="rounded-xl border border-border/60 bg-background px-4 py-8 text-center text-sm text-muted-foreground">
                No submitted tests yet. Start a test to populate your dashboard.
              </div>
            ) : (
              recentTests.map((test) => (
                <div key={test.id} className="rounded-2xl border border-border/60 bg-background px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{test.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{test.date}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-foreground">{test.score}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Accuracy</span>
                        <span>{test.accuracy}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: test.accuracy }} />
                      </div>
                    </div>
                    <button
                      className="shrink-0 text-xs font-semibold text-primary transition-colors hover:text-primary/80"
                      onClick={() => setLocation(`/student/tests/${test.id}/analysis`)}
                    >
                      Analysis
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground bg-muted/20">
                <tr>
                  <th className="px-6 py-3 font-medium">Test Name</th>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Score</th>
                  <th className="px-6 py-3 font-medium">Accuracy</th>
                  <th className="px-6 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {recentTests.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                      No submitted tests yet. Start a test to populate your dashboard.
                    </td>
                  </tr>
                ) : (
                  recentTests.map((test) => (
                    <tr key={test.id} className="border-b border-border/50 last:border-0 hover:bg-muted/10 transition-colors">
                      <td className="px-6 py-4 font-medium text-foreground">{test.name}</td>
                      <td className="px-6 py-4 text-muted-foreground">{test.date}</td>
                      <td className="px-6 py-4 font-medium">{test.score}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span>{test.accuracy}</span>
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: test.accuracy }} />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          className="text-primary hover:text-primary/80 font-medium flex items-center justify-end gap-1 ml-auto text-xs transition-colors"
                          onClick={() => setLocation(`/student/tests/${test.id}/analysis`)}
                        >
                          Analysis <ChevronRight className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="shadow-sm border-border/60 bg-gradient-to-br from-card to-primary/5 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-destructive" />
              Priority Focus Areas
            </CardTitle>
            <CardDescription>Topics needing immediate attention</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <div className="divide-y divide-border/50">
              {weakTopics.length === 0 ? (
                <div className="px-6 py-8 text-sm text-muted-foreground">
                  Your weak-topic insights will appear here after more test activity.
                </div>
              ) : (
                weakTopics.map((topic, index) => (
                  <div key={`${topic.topic}-${index}`} className="flex items-center justify-between px-6 py-3 hover:bg-white/50 transition-colors">
                    <div className="space-y-1">
                      <p className="text-sm font-medium leading-none text-foreground">{topic.topic}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {topic.subject}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-sm font-bold text-destructive">{topic.accuracy}%</span>
                      <span className="text-[10px] text-muted-foreground">Accuracy</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-border/60">
        <CardHeader>
          <CardTitle>Weekly Questions Solved</CardTitle>
          <CardDescription>Questions you solved each day this week</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[160px] w-full sm:h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} dy={8} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    borderRadius: "8px",
                    border: "1px solid hsl(var(--border))",
                    boxShadow: "var(--shadow-md)",
                  }}
                  cursor={{ fill: "hsl(var(--muted)/0.3)" }}
                  formatter={(value: number) => [`${value} Qs`, "Solved"]}
                />
                <Bar dataKey="questions" radius={[6, 6, 0, 0]} maxBarSize={48}>
                  {weeklyData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        entry.isToday
                          ? "hsl(var(--primary))"
                          : entry.questions >= 150
                            ? "#34d399"
                            : entry.questions >= 80
                              ? "hsl(var(--chart-3))"
                              : "hsl(var(--muted))"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-primary" />
              <span>Today</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-chart-3" />
              <span>Good progress</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-[#34d399]" />
              <span>Goal achieved</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
