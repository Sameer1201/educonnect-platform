import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ReferenceLine, LineChart, Line,
} from "recharts";
import {
  ArrowLeft, CheckCircle2, XCircle, MinusCircle, Clock, Flag, Trophy,
  TrendingUp, TrendingDown, Brain, Target, AlertTriangle, Zap, BookOpen,
  ChevronDown, ChevronRight, BarChart3, Star, Info, Timer, Activity,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type QType = "mcq" | "multi" | "integer";

interface PerQuestion {
  id: number; order: number;
  question: string; questionType: QType;
  options: string[]; optionImages: (string | null)[] | null;
  imageData: string | null; points: number;
  correctAnswer: number;
  correctAnswerMulti: number[] | null;
  correctAnswerMin: number | null; correctAnswerMax: number | null;
  myAnswer: any; isCorrect: boolean; isSkipped: boolean; isFlagged: boolean;
  myTime: number; classSuccessRate: number; classAvgTime: number; timeVsClass: number;
}

interface Analysis {
  test: { id: number; title: string; description: string | null; durationMinutes: number; passingScore: number; className: string | null; totalQuestions: number };
  submission: { id: number; score: number; totalPoints: number; percentage: number; passed: boolean; submittedAt: string; totalTime: number; correctCount: number; wrongCount: number; skippedCount: number; flaggedCount: number };
  classStats: { totalSubs: number; classAvg: number; classPassRate: number; rank: number; percentile: number };
  perQuestion: PerQuestion[];
  insights: { weakQuestions: PerQuestion[]; hardQuestions: PerQuestion[]; timeHogs: PerQuestion[]; fasterThanClass: number; slowerThanClass: number };
}

const PIE_COLORS = ["#22c55e", "#ef4444", "#94a3b8"];

function fmtTime(s: number) {
  if (!s || s <= 0) return "—";
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function MyAnswerDisplay({ q }: { q: PerQuestion }) {
  if (q.isSkipped) return <span className="text-xs text-muted-foreground italic">Not answered</span>;
  const qType = q.questionType;
  if (qType === "integer") return <span className="text-sm font-bold">{q.myAnswer}</span>;
  if (qType === "multi") {
    const indices: number[] = Array.isArray(q.myAnswer) ? q.myAnswer : [];
    return <span className="text-sm font-medium">{indices.map(i => String.fromCharCode(65 + i)).join(", ") || "None"}</span>;
  }
  const idx = Number(q.myAnswer);
  return <span className="text-sm font-medium">{String.fromCharCode(65 + idx)}. {q.options[idx] ?? "?"}</span>;
}

function CorrectAnswerDisplay({ q }: { q: PerQuestion }) {
  const qType = q.questionType;
  if (qType === "integer") {
    if (q.correctAnswerMin !== null && q.correctAnswerMax !== null) {
      return <span className="text-sm font-bold text-green-700">{q.correctAnswerMin} — {q.correctAnswerMax}</span>;
    }
    return <span className="text-sm font-bold text-green-700">{q.correctAnswer}</span>;
  }
  if (qType === "multi") {
    const indices: number[] = q.correctAnswerMulti ?? [];
    return <span className="text-sm font-bold text-green-700">{indices.map(i => String.fromCharCode(65 + i)).join(", ")}</span>;
  }
  return <span className="text-sm font-bold text-green-700">{String.fromCharCode(65 + q.correctAnswer)}. {q.options[q.correctAnswer] ?? "?"}</span>;
}

type Tab = "overview" | "questions" | "compare" | "insights";

export default function StudentTestAnalysis() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const testId = parseInt(params.id, 10);
  const [tab, setTab] = useState<Tab>("overview");
  const [expandedQ, setExpandedQ] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "correct" | "wrong" | "skipped" | "flagged">("all");

  const { data, isLoading, error } = useQuery<Analysis>({
    queryKey: ["my-analysis", testId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/tests/${testId}/my-analysis`, { credentials: "include" });
      if (!r.ok) throw new Error(r.status === 403 ? "You haven't submitted this test yet." : "Failed to load analysis");
      return r.json();
    },
    enabled: !isNaN(testId),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading your analysis...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertTriangle size={36} className="mx-auto text-destructive mb-3" />
          <p className="font-medium text-destructive">{(error as Error)?.message ?? "Failed to load analysis"}</p>
          <Button variant="outline" className="mt-3" onClick={() => setLocation("/student/tests")}>Back to Tests</Button>
        </div>
      </div>
    );
  }

  const { test, submission, classStats, perQuestion, insights } = data;

  const filteredQ = perQuestion.filter(q => {
    if (filter === "correct") return q.isCorrect;
    if (filter === "wrong") return !q.isCorrect && !q.isSkipped;
    if (filter === "skipped") return q.isSkipped;
    if (filter === "flagged") return q.isFlagged;
    return true;
  });

  const pieData = [
    { name: "Correct", value: submission.correctCount },
    { name: "Wrong", value: submission.wrongCount },
    { name: "Skipped", value: submission.skippedCount },
  ].filter(d => d.value > 0);

  const radarData = perQuestion.map(q => ({
    name: `Q${q.order}`,
    mine: q.isCorrect ? 100 : 0,
    class: q.classSuccessRate,
  }));

  const timeData = perQuestion.map(q => ({
    name: `Q${q.order}`,
    myTime: q.myTime,
    classAvg: q.classAvgTime,
    correct: q.isCorrect,
  }));

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "overview", label: "Overview", icon: <BarChart3 size={14} /> },
    { key: "questions", label: "Questions", icon: <BookOpen size={14} /> },
    { key: "compare", label: "vs Class", icon: <Activity size={14} /> },
    { key: "insights", label: "Insights", icon: <Brain size={14} /> },
  ];

  const scoreColor = submission.passed ? "text-green-700" : "text-red-700";
  const scoreBg = submission.passed ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200";

  return (
    <div className="space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/student/tests")} className="gap-1.5">
          <ArrowLeft size={15} />Back
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold flex items-center gap-2 truncate">
            <Brain size={20} className="text-primary shrink-0" />My Analysis
          </h1>
          <p className="text-sm text-muted-foreground truncate">{test.title}{test.className ? ` · ${test.className}` : ""}</p>
        </div>
        <Badge className={submission.passed ? "bg-green-600" : "bg-red-600"}>
          {submission.passed ? "Passed" : "Not Passed"}
        </Badge>
      </div>

      {/* Score banner */}
      <div className={`rounded-2xl p-5 border ${scoreBg} flex items-center gap-5 flex-wrap`}>
        <div className="text-center min-w-[80px]">
          {submission.passed
            ? <CheckCircle2 size={36} className="mx-auto text-green-600 mb-1" />
            : <XCircle size={36} className="mx-auto text-red-600 mb-1" />}
          <p className={`text-3xl font-black ${scoreColor}`}>{submission.percentage}%</p>
          <p className="text-xs text-muted-foreground">{submission.score}/{submission.totalPoints} pts</p>
        </div>
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="text-center">
            <p className="text-lg font-bold text-green-700">{submission.correctCount}</p>
            <p className="text-xs text-muted-foreground">Correct</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-red-700">{submission.wrongCount}</p>
            <p className="text-xs text-muted-foreground">Wrong</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold">{submission.skippedCount}</p>
            <p className="text-xs text-muted-foreground">Skipped</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-blue-700">{fmtTime(submission.totalTime)}</p>
            <p className="text-xs text-muted-foreground">Total time</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/40 p-1 rounded-xl flex-wrap">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === t.key ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ══ OVERVIEW ══ */}
      {tab === "overview" && (
        <div className="space-y-4">
          {/* Rank & percentile */}
          {classStats.totalSubs > 1 && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-center">
                <Trophy size={16} className="mx-auto text-indigo-600 mb-1" />
                <p className="text-2xl font-bold text-indigo-700">#{classStats.rank}</p>
                <p className="text-xs text-indigo-600">Class Rank</p>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-center">
                <Star size={16} className="mx-auto text-purple-600 mb-1" />
                <p className="text-2xl font-bold text-purple-700">{classStats.percentile}%ile</p>
                <p className="text-xs text-purple-600">Percentile</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                <Target size={16} className="mx-auto text-blue-600 mb-1" />
                <p className="text-2xl font-bold text-blue-700">{classStats.classAvg}%</p>
                <p className="text-xs text-blue-600">Class Average</p>
              </div>
            </div>
          )}

          {/* Score vs Class avg visual bar */}
          {classStats.totalSubs > 1 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <TrendingUp size={14} className="text-primary" />Your Score vs Class Average
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium">You</span>
                    <span className={`font-bold ${scoreColor}`}>{submission.percentage}%</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${submission.passed ? "bg-green-500" : "bg-red-500"}`} style={{ width: `${submission.percentage}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Class Average ({classStats.totalSubs} students)</span>
                    <span className="font-bold text-blue-700">{classStats.classAvg}%</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-blue-400 transition-all" style={{ width: `${classStats.classAvg}%` }} />
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  {submission.percentage >= classStats.classAvg ? (
                    <span className="flex items-center gap-1 text-xs text-green-700 font-medium bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                      <TrendingUp size={11} />+{submission.percentage - classStats.classAvg}% above class average
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-red-700 font-medium bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                      <TrendingDown size={11} />{classStats.classAvg - submission.percentage}% below class average
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">· Class pass rate: {classStats.classPassRate}%</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pie + time chart */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-1.5"><Target size={14} className="text-primary" />Answer Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={44} outerRadius={68} paddingAngle={3} dataKey="value">
                      {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12 }} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-1.5"><Timer size={14} className="text-primary" />Time per Question</CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={timeData} margin={{ top: 0, right: 8, left: -22, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}s`} />
                    <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [fmtTime(Number(v)), "Time"]} />
                    <Bar dataKey="myTime" radius={[3, 3, 0, 0]}>
                      {timeData.map((d, i) => (
                        <Cell key={i} fill={d.correct ? "#22c55e" : d.myTime === 0 ? "#e2e8f0" : "#ef4444"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-xs text-center text-muted-foreground mt-1">Green = correct · Red = wrong · Gray = skipped</p>
              </CardContent>
            </Card>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-muted/40 border border-border rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Questions</p>
              <p className="text-xl font-bold">{test.totalQuestions}</p>
            </div>
            <div className="bg-muted/40 border border-border rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Passing Mark</p>
              <p className="text-xl font-bold">{test.passingScore}%</p>
            </div>
            <div className="bg-muted/40 border border-border rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Time Allowed</p>
              <p className="text-xl font-bold">{test.durationMinutes}m</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
              <Flag size={14} className="mx-auto text-amber-600 mb-1" />
              <p className="text-xl font-bold text-amber-700">{submission.flaggedCount}</p>
              <p className="text-xs text-amber-600">Flagged</p>
            </div>
          </div>
        </div>
      )}

      {/* ══ QUESTIONS ══ */}
      {tab === "questions" && (
        <div className="space-y-3">
          {/* Filter bar */}
          <div className="flex gap-1.5 flex-wrap">
            {([
              { key: "all", label: `All (${perQuestion.length})` },
              { key: "correct", label: `✓ Correct (${submission.correctCount})` },
              { key: "wrong", label: `✗ Wrong (${submission.wrongCount})` },
              { key: "skipped", label: `— Skipped (${submission.skippedCount})` },
              { key: "flagged", label: `⚑ Flagged (${submission.flaggedCount})` },
            ] as const).map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${filter === f.key ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground bg-background"}`}>
                {f.label}
              </button>
            ))}
          </div>

          {filteredQ.length === 0 && (
            <div className="text-center py-10 text-muted-foreground text-sm">No questions match this filter.</div>
          )}

          {filteredQ.map(q => (
            <div key={q.id} className={`border rounded-xl overflow-hidden ${q.isCorrect ? "border-green-300" : q.isSkipped ? "border-border" : "border-red-300"}`}>
              {/* Header */}
              <button
                className={`w-full flex items-start gap-2 px-4 py-3 text-left ${q.isCorrect ? "bg-green-50 hover:bg-green-100/60" : q.isSkipped ? "bg-muted/30 hover:bg-muted/50" : "bg-red-50 hover:bg-red-100/60"}`}
                onClick={() => setExpandedQ(expandedQ === q.id ? null : q.id)}
              >
                <div className="shrink-0 mt-0.5">
                  {q.isCorrect ? <CheckCircle2 size={16} className="text-green-600" />
                    : q.isSkipped ? <MinusCircle size={16} className="text-muted-foreground" />
                    : <XCircle size={16} className="text-red-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <span className="text-xs font-bold text-muted-foreground">Q{q.order}</span>
                    {q.isFlagged && <Flag size={11} className="text-amber-500 fill-amber-400" />}
                    <p className="text-sm font-medium truncate flex-1">{q.question}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    {q.myTime > 0 && <span className="flex items-center gap-0.5"><Clock size={10} />{fmtTime(q.myTime)}</span>}
                    <span>Class: {q.classSuccessRate}% correct</span>
                    <span>{q.points} pt{q.points !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                <div className="shrink-0 text-muted-foreground">
                  {expandedQ === q.id ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </div>
              </button>

              {/* Detail */}
              {expandedQ === q.id && (
                <div className="px-4 py-3 bg-background border-t border-border space-y-3">
                  {q.imageData && <img src={q.imageData} alt="" className="max-h-40 rounded border border-border object-contain" />}

                  {/* Your answer vs correct */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className={`rounded-lg border p-2.5 ${q.isCorrect ? "bg-green-50 border-green-200" : q.isSkipped ? "bg-muted border-border" : "bg-red-50 border-red-200"}`}>
                      <p className="text-xs text-muted-foreground mb-1">Your answer</p>
                      <MyAnswerDisplay q={q} />
                    </div>
                    {!q.isCorrect && (
                      <div className="rounded-lg border border-green-200 bg-green-50 p-2.5">
                        <p className="text-xs text-muted-foreground mb-1">Correct answer</p>
                        <CorrectAnswerDisplay q={q} />
                      </div>
                    )}
                  </div>

                  {/* Options with selection highlight for MCQ/multi */}
                  {(q.questionType === "mcq" || q.questionType === "multi") && q.options.length > 0 && (
                    <div className="space-y-1">
                      {q.options.map((opt, i) => {
                        const isCorrect = q.questionType === "multi"
                          ? (q.correctAnswerMulti ?? []).includes(i)
                          : i === q.correctAnswer;
                        const wasSelected = q.questionType === "multi"
                          ? (Array.isArray(q.myAnswer) ? q.myAnswer.includes(i) : false)
                          : !q.isSkipped && Number(q.myAnswer) === i;
                        const optImg = q.optionImages?.[i];
                        return (
                          <div key={i} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs border transition-all ${
                            isCorrect ? "bg-green-50 border-green-300"
                            : wasSelected ? "bg-red-50 border-red-300"
                            : "border-border/40 text-muted-foreground"
                          }`}>
                            <span className="font-semibold w-5 shrink-0">{String.fromCharCode(65 + i)}.</span>
                            <span className="flex-1">{opt}</span>
                            {optImg && <img src={optImg} alt="" className="h-6 w-6 rounded object-cover border" />}
                            {isCorrect && wasSelected && <CheckCircle2 size={13} className="text-green-600 shrink-0" />}
                            {isCorrect && !wasSelected && <span className="text-green-600 font-bold shrink-0">✓ Correct</span>}
                            {!isCorrect && wasSelected && <span className="text-red-600 font-bold shrink-0">✗ Wrong</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Time vs class */}
                  {q.myTime > 0 && q.classAvgTime > 0 && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg p-2">
                      <Clock size={12} />
                      <span>You: <strong>{fmtTime(q.myTime)}</strong></span>
                      <span>· Class avg: <strong>{fmtTime(q.classAvgTime)}</strong></span>
                      {q.timeVsClass !== 0 && (
                        <span className={`ml-auto font-medium ${q.timeVsClass > 20 ? "text-red-600" : q.timeVsClass < -20 ? "text-green-600" : "text-muted-foreground"}`}>
                          {q.timeVsClass > 0 ? "+" : ""}{q.timeVsClass}% vs class
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ══ vs CLASS ══ */}
      {tab === "compare" && (
        <div className="space-y-4">
          {classStats.totalSubs <= 1 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed rounded-xl">
              <Info size={36} className="text-muted-foreground mb-3" />
              <p className="font-medium text-muted-foreground">Not enough class data yet</p>
              <p className="text-sm text-muted-foreground mt-1">Comparison data appears when more students submit this test.</p>
            </div>
          ) : (
            <>
              {/* Radar: me vs class per question */}
              {perQuestion.length <= 14 && (
                <Card>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm flex items-center gap-1.5"><Zap size={14} className="text-primary" />Per-Question: You vs Class</CardTitle>
                  </CardHeader>
                  <CardContent className="px-2 pb-4">
                    <ResponsiveContainer width="100%" height={230}>
                      <RadarChart data={radarData}>
                        <PolarGrid stroke="#e5e7eb" />
                        <PolarAngleAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9 }} />
                        <Radar name="You" dataKey="mine" stroke={submission.passed ? "#22c55e" : "#ef4444"} fill={submission.passed ? "#22c55e" : "#ef4444"} fillOpacity={0.25} />
                        <Radar name="Class Avg" dataKey="class" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} />
                        <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v, name) => [`${v}%`, name]} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Time comparison bar chart */}
              {perQuestion.some(q => q.myTime > 0 && q.classAvgTime > 0) && (
                <Card>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm flex items-center gap-1.5"><Timer size={14} className="text-primary" />Time Spent vs Class Average</CardTitle>
                  </CardHeader>
                  <CardContent className="px-2 pb-4">
                    <ResponsiveContainer width="100%" height={Math.max(160, perQuestion.length * 28)}>
                      <BarChart data={timeData} layout="vertical" margin={{ top: 0, right: 60, left: 24, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${v}s`} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={28} />
                        <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v, name) => [fmtTime(Number(v)), name === "myTime" ? "You" : "Class Avg"]} />
                        <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="myTime" name="You" fill="#6366f1" radius={[0, 3, 3, 0]} />
                        <Bar dataKey="classAvg" name="Class Avg" fill="#c4b5fd" radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Question-by-question success comparison */}
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-1.5"><BarChart3 size={14} className="text-primary" />Question Success Rate (Class %)</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2">
                  {perQuestion.map(q => (
                    <div key={q.id} className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground w-6 shrink-0">Q{q.order}</span>
                        <div className="flex-1 flex items-center gap-1.5">
                          {q.isCorrect
                            ? <CheckCircle2 size={11} className="text-green-600 shrink-0" />
                            : q.isSkipped
                              ? <MinusCircle size={11} className="text-muted-foreground shrink-0" />
                              : <XCircle size={11} className="text-red-500 shrink-0" />}
                          <p className="truncate text-xs text-muted-foreground flex-1">{q.question.slice(0, 50)}{q.question.length > 50 ? "…" : ""}</p>
                        </div>
                        <span className={`font-bold shrink-0 ${q.classSuccessRate >= 70 ? "text-green-700" : q.classSuccessRate >= 40 ? "text-amber-700" : "text-red-700"}`}>{q.classSuccessRate}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden ml-6">
                        <div className={`h-full rounded-full ${q.classSuccessRate >= 70 ? "bg-green-400" : q.classSuccessRate >= 40 ? "bg-amber-400" : "bg-red-400"}`}
                          style={{ width: `${q.classSuccessRate}%` }} />
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground pt-2">Class pass rate: {classStats.classPassRate}% · {classStats.totalSubs} submissions</p>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {/* ══ INSIGHTS ══ */}
      {tab === "insights" && (
        <div className="space-y-4">
          {/* Performance summary */}
          <Card className={submission.passed ? "border-green-200 bg-green-50/30" : "border-amber-200 bg-amber-50/30"}>
            <CardContent className="p-4">
              <p className="font-semibold mb-2 flex items-center gap-1.5">
                <Brain size={15} className="text-primary" />Performance Summary
              </p>
              <div className="space-y-1.5 text-sm text-muted-foreground">
                {submission.passed ? (
                  <p className="text-green-700 font-medium">🎉 You passed this test with {submission.percentage}%!</p>
                ) : (
                  <p className="text-red-700 font-medium">You scored {submission.percentage}% — {test.passingScore - submission.percentage}% more needed to pass.</p>
                )}
                {classStats.totalSubs > 1 && (
                  <p>{submission.percentage >= classStats.classAvg
                    ? `You scored ${submission.percentage - classStats.classAvg}% above the class average (${classStats.classAvg}%).`
                    : `You scored ${classStats.classAvg - submission.percentage}% below the class average (${classStats.classAvg}%).`}
                  </p>
                )}
                {classStats.totalSubs > 1 && (
                  <p>You ranked #{classStats.rank} out of {classStats.totalSubs} students — {classStats.percentile}th percentile.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Areas needing practice */}
          {(insights.weakQuestions.length > 0 || insights.hardQuestions.length > 0) && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-1.5"><AlertTriangle size={14} className="text-amber-500" />Areas to Practice</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                {insights.weakQuestions.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1">
                      <TrendingDown size={11} />Questions you got wrong but most classmates got right
                    </p>
                    <div className="space-y-1.5">
                      {insights.weakQuestions.map(q => (
                        <div key={q.id} className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          <XCircle size={12} className="text-red-500 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-foreground truncate">Q{q.order}: {q.question}</p>
                            <p className="text-muted-foreground mt-0.5">{q.classSuccessRate}% of class got this right</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {insights.hardQuestions.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-red-700 mb-2 flex items-center gap-1">
                      <Brain size={11} />Difficult questions (most students got wrong too)
                    </p>
                    <div className="space-y-1.5">
                      {insights.hardQuestions.map(q => (
                        <div key={q.id} className="flex items-start gap-2 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                          <XCircle size={12} className="text-red-500 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-foreground truncate">Q{q.order}: {q.question}</p>
                            <p className="text-muted-foreground mt-0.5">Only {q.classSuccessRate}% success rate — challenging for everyone</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Time insights */}
          {insights.timeHogs.length > 0 && insights.timeHogs[0].myTime > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-1.5"><Timer size={14} className="text-blue-500" />Time Insights</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Most time spent on:</p>
                  <div className="space-y-1.5">
                    {insights.timeHogs.filter(q => q.myTime > 0).map(q => (
                      <div key={q.id} className="flex items-center gap-2 text-xs bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                        <Clock size={12} className="text-blue-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="truncate">Q{q.order}: {q.question}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-blue-700">{fmtTime(q.myTime)}</p>
                          {q.classAvgTime > 0 && <p className="text-muted-foreground">class: {fmtTime(q.classAvgTime)}</p>}
                        </div>
                        {!q.isCorrect && <AlertTriangle size={12} className="text-amber-500 shrink-0" />}
                      </div>
                    ))}
                  </div>
                </div>
                {(insights.fasterThanClass > 0 || insights.slowerThanClass > 0) && (
                  <div className="flex gap-3 text-xs">
                    {insights.fasterThanClass > 0 && (
                      <span className="flex items-center gap-1 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1.5 text-green-700">
                        <TrendingUp size={11} />{insights.fasterThanClass} questions faster than class
                      </span>
                    )}
                    {insights.slowerThanClass > 0 && (
                      <span className="flex items-center gap-1 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 text-red-700">
                        <TrendingDown size={11} />{insights.slowerThanClass} questions slower than class
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* All good message */}
          {insights.weakQuestions.length === 0 && insights.hardQuestions.length === 0 && submission.correctCount > 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-green-300 rounded-xl bg-green-50/30">
              <CheckCircle2 size={36} className="text-green-500 mb-2" />
              <p className="font-semibold text-green-700">Great performance!</p>
              <p className="text-sm text-green-600 mt-1">You didn't miss any questions that most classmates got right.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
