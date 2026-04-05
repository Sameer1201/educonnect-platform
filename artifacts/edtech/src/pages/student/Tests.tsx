import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ClipboardList, Clock, CheckCircle2, XCircle, AlertCircle, BookOpen, ChevronRight,
  BarChart3, ListChecks, Hash, CheckSquare, Flag, Timer, TrendingUp, Target, Brain
} from "lucide-react";
import { format } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type QuestionType = "mcq" | "multi" | "integer";
type ResultTab = "score" | "analysis";
type AnalysisFilter = "all" | "correct" | "wrong" | "skipped" | "flagged";
type AnswerValue = number | number[];

interface TestItem {
  id: number; title: string; description: string | null; durationMinutes: number;
  passingScore: number; scheduledAt: string | null; className: string | null;
  subjectName?: string | null; chapterName?: string | null; alreadySubmitted: boolean;
}
interface Question {
  id: number; question: string; questionType: QuestionType; options: string[];
  optionImages?: (string | null)[] | null;
  points: number; order: number; imageData?: string | null;
  correctAnswer?: number; correctAnswerMulti?: number[] | null;
  correctAnswerMin?: number | null; correctAnswerMax?: number | null;
}
interface SubmissionData {
  score: number; totalPoints: number; percentage: number; passed: boolean; submittedAt: string;
  answers: string;
  questionTimings?: Record<string, number> | null;
  flaggedQuestions?: number[] | null;
}
interface TestDetail {
  id: number; title: string; description: string | null; durationMinutes: number;
  passingScore: number; questions: Question[]; submission: SubmissionData | null;
}

function isAnswerCorrect(q: Question, answer: AnswerValue | undefined): boolean {
  if (answer === undefined || answer === null) return false;
  if (q.questionType === "multi") {
    const correct = [...(q.correctAnswerMulti ?? [])].sort((a, b) => a - b);
    const selected = Array.isArray(answer) ? [...answer].sort((a, b) => a - b) : [];
    return JSON.stringify(selected) === JSON.stringify(correct);
  }
  if (q.questionType === "integer") {
    const num = Number(answer);
    if (q.correctAnswerMin !== null && q.correctAnswerMin !== undefined &&
        q.correctAnswerMax !== null && q.correctAnswerMax !== undefined) {
      return num >= q.correctAnswerMin && num <= q.correctAnswerMax;
    }
    return num === q.correctAnswer;
  }
  return Number(answer) === q.correctAnswer;
}

function formatSeconds(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60), s = secs % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

const PIE_COLORS = ["#22c55e", "#ef4444", "#94a3b8"];

export default function StudentTests() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [activeTest, setActiveTest] = useState<TestDetail | null>(null);
  const [answers, setAnswers] = useState<Record<number, AnswerValue>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [resultTest, setResultTest] = useState<TestDetail | null>(null);
  const [resultTab, setResultTab] = useState<ResultTab>("score");
  const [analysisFilter, setAnalysisFilter] = useState<AnalysisFilter>("all");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [questionTimings, setQuestionTimings] = useState<Record<number, number>>({});
  const timingActiveRef = useRef<{ qId: number; startMs: number } | null>(null);
  const [flaggedSet, setFlaggedSet] = useState<Set<number>>(new Set());

  const { data: tests = [], isLoading } = useQuery<TestItem[]>({
    queryKey: ["student-tests"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/tests`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const openTest = async (testId: number) => {
    const r = await fetch(`${BASE}/api/tests/${testId}`, { credentials: "include" });
    if (!r.ok) return;
    const data: TestDetail = await r.json();
    if (data.submission) { setResultTest(data); setResultTab("score"); return; }
    setActiveTest(data); setAnswers({}); setTimeLeft(data.durationMinutes * 60);
    setQuestionTimings({}); setFlaggedSet(new Set()); timingActiveRef.current = null;
  };

  useEffect(() => {
    if (!activeTest) { if (timerRef.current) clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => { if (t <= 1) { clearInterval(timerRef.current!); return 0; } return t - 1; });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeTest]);

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

  const toggleFlag = (qId: number) =>
    setFlaggedSet(prev => { const n = new Set(prev); n.has(qId) ? n.delete(qId) : n.add(qId); return n; });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!activeTest) throw new Error("No test");
      const finalTimings = finalizeTimings();
      const r = await fetch(`${BASE}/api/tests/${activeTest.id}/submit`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, questionTimings: finalTimings, flaggedQuestions: Array.from(flaggedSet) }),
      });
      if (!r.ok) throw new Error("Failed to submit");
      return r.json();
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["student-tests"] });
      if (timerRef.current) clearInterval(timerRef.current);
      const r = await fetch(`${BASE}/api/tests/${activeTest!.id}`, { credentials: "include" });
      const data: TestDetail = await r.json();
      setActiveTest(null); setResultTest(data); setResultTab("score");
      toast({ title: data.submission?.passed ? "Test passed! 🎉" : "Test submitted" });
    },
    onError: () => toast({ title: "Submission failed", variant: "destructive" }),
  });

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const answeredCount = activeTest?.questions.filter((q) => {
    const a = answers[q.id];
    if (a === undefined || a === null) return false;
    if (q.questionType === "multi") return Array.isArray(a) && (a as number[]).length > 0;
    return true;
  }).length ?? 0;
  const totalQ = activeTest?.questions.length ?? 0;

  const setMcqAnswer = (qId: number, idx: number) => { startInteraction(qId); setAnswers(p => ({ ...p, [qId]: idx })); };
  const toggleMultiAnswer = (qId: number, idx: number) => {
    startInteraction(qId);
    setAnswers(p => { const cur = (p[qId] as number[] | undefined) ?? []; return { ...p, [qId]: cur.includes(idx) ? cur.filter(x => x !== idx) : [...cur, idx] }; });
  };
  const setIntegerAnswer = (qId: number, val: string) => {
    startInteraction(qId);
    if (val === "" || val === "-") { setAnswers(p => { const n = { ...p }; delete n[qId]; return n; }); return; }
    const num = parseInt(val);
    if (!isNaN(num)) setAnswers(p => ({ ...p, [qId]: num }));
  };

  const submittedAnswers: Record<number, AnswerValue> = resultTest?.submission?.answers ? JSON.parse(resultTest.submission.answers) : {};
  const savedTimings: Record<string, number> = resultTest?.submission?.questionTimings ?? {};
  const savedFlagged: number[] = resultTest?.submission?.flaggedQuestions ?? [];
  const totalTimeSecs = Object.values(savedTimings).reduce((a, b) => a + b, 0);

  const correctCount = resultTest?.questions.filter(q => isAnswerCorrect(q, submittedAnswers[q.id])).length ?? 0;
  const skippedCount = resultTest?.questions.filter(q => { const a = submittedAnswers[q.id]; return a === undefined || a === null || (Array.isArray(a) && a.length === 0); }).length ?? 0;
  const wrongCount = (resultTest?.questions.length ?? 0) - correctCount - skippedCount;

  const pieData = [
    { name: "Correct", value: correctCount },
    { name: "Wrong", value: wrongCount },
    { name: "Skipped", value: skippedCount },
  ].filter(d => d.value > 0);

  const timeBarData = resultTest?.questions.map((q, idx) => ({
    name: `Q${idx + 1}`, seconds: savedTimings[String(q.id)] ?? 0, qId: q.id,
  })) ?? [];

  const filteredQuestions = resultTest?.questions.filter(q => {
    const answer = submittedAnswers[q.id];
    const correct = isAnswerCorrect(q, answer);
    const skipped = answer === undefined || answer === null || (Array.isArray(answer) && answer.length === 0);
    if (analysisFilter === "all") return true;
    if (analysisFilter === "correct") return correct;
    if (analysisFilter === "wrong") return !correct && !skipped;
    if (analysisFilter === "skipped") return skipped;
    if (analysisFilter === "flagged") return savedFlagged.includes(q.id);
    return true;
  }) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardList size={22} className="text-primary" />My Tests</h1>
        <p className="text-muted-foreground text-sm mt-1">Take tests and review your performance with detailed analysis</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : tests.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <ClipboardList size={40} className="mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No tests available yet. Enroll in a class to see tests.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {tests.map((test) => (
            <Card key={test.id} className="hover:shadow-sm transition-shadow" data-testid={`test-item-${test.id}`}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${test.alreadySubmitted ? "bg-green-100" : "bg-primary/10"}`}>
                  {test.alreadySubmitted ? <CheckCircle2 size={20} className="text-green-600" /> : <ClipboardList size={20} className="text-primary" />}
                </div>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openTest(test.id)}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold truncate">{test.title}</p>
                    {test.alreadySubmitted ? <Badge variant="secondary" className="text-xs shrink-0">Completed</Badge> : <Badge className="text-xs shrink-0 bg-blue-600">Available</Badge>}
                    {test.subjectName && <Badge variant="outline" className="text-xs shrink-0">{test.subjectName}</Badge>}
                    {test.chapterName && <Badge variant="secondary" className="text-xs shrink-0">{test.chapterName}</Badge>}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                    {test.className && <span className="flex items-center gap-1"><BookOpen size={11} />{test.className}</span>}
                    <span className="flex items-center gap-1"><Clock size={11} />{test.durationMinutes} min</span>
                    <span>Pass: {test.passingScore}%</span>
                    {test.scheduledAt && <span>{format(new Date(test.scheduledAt), "MMM d, yyyy")}</span>}
                  </div>
                </div>
                {test.alreadySubmitted ? (
                  <Button size="sm" variant="outline"
                    className="shrink-0 border-indigo-300 text-indigo-700 hover:bg-indigo-50 gap-1.5 text-xs"
                    onClick={(e) => { e.stopPropagation(); setLocation(`/student/tests/${test.id}/analysis`); }}
                    data-testid={`btn-analysis-${test.id}`}>
                    <Brain size={13} />Advanced Analysis
                  </Button>
                ) : (
                  <ChevronRight size={16} className="text-muted-foreground shrink-0 cursor-pointer" onClick={() => openTest(test.id)} />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Active Test Dialog ─── */}
      <Dialog open={activeTest !== null} onOpenChange={(o) => {
        if (!o && !submitMutation.isPending) {
          if (confirm("Exit test? Your progress will be lost.")) { setActiveTest(null); if (timerRef.current) clearInterval(timerRef.current); }
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-0">
          {activeTest && (
            <>
              <div className="sticky top-0 z-10 bg-background border-b border-border px-6 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <DialogHeader><DialogTitle className="text-base">{activeTest.title}</DialogTitle></DialogHeader>
                  <p className="text-xs text-muted-foreground mt-0.5">{answeredCount}/{totalQ} answered {flaggedSet.size > 0 && `· ${flaggedSet.size} flagged`}</p>
                </div>
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-sm font-bold ${timeLeft <= 60 ? "bg-red-100 text-red-700 animate-pulse" : "bg-muted text-foreground"}`}>
                  <Clock size={13} />{formatTime(timeLeft)}
                </div>
              </div>

              <div className="p-6 space-y-4">
                {activeTest.questions.map((q, idx) => {
                  const qType = q.questionType ?? "mcq";
                  const selectedMcq = answers[q.id] as number | undefined;
                  const selectedMulti = (answers[q.id] as number[] | undefined) ?? [];
                  const integerVal = answers[q.id] !== undefined ? String(answers[q.id]) : "";
                  const isFlagged = flaggedSet.has(q.id);

                  return (
                    <div key={q.id} className={`space-y-3 rounded-xl p-4 border-2 transition-colors ${isFlagged ? "border-amber-300 bg-amber-50/30" : "border-border/50 hover:border-border"}`} data-testid={`question-block-${q.id}`}>
                      <div className="flex gap-2">
                        <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded shrink-0 mt-0.5">Q{idx + 1}</span>
                        <div className="flex-1">
                          <div className="flex items-start gap-2 flex-wrap mb-1">
                            <p className="text-sm font-medium leading-relaxed flex-1">{q.question}</p>
                            <div className="flex items-center gap-1 shrink-0">
                              {qType === "multi" && <span className="flex items-center gap-1 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium"><CheckSquare size={11} />Multi</span>}
                              {qType === "integer" && <span className="flex items-center gap-1 text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-medium"><Hash size={11} />Integer</span>}
                              <button type="button" onClick={() => toggleFlag(q.id)}
                                className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium border transition-colors ${isFlagged ? "bg-amber-100 text-amber-700 border-amber-300" : "bg-muted text-muted-foreground border-border hover:border-amber-300 hover:text-amber-600"}`}>
                                <Flag size={11} className={isFlagged ? "fill-amber-600" : ""} />
                                {isFlagged ? "Flagged" : "Flag"}
                              </button>
                            </div>
                          </div>
                          {q.imageData && <img src={q.imageData} alt="" className="mt-2 max-h-64 w-full rounded-lg border object-contain bg-muted/30" />}
                        </div>
                      </div>

                      {qType === "mcq" && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-8">
                          {q.options.map((opt, i) => {
                            const optImg = q.optionImages?.[i];
                            return (
                              <button key={i} onClick={() => setMcqAnswer(q.id, i)}
                                className={`text-left text-sm px-3 py-2.5 rounded-lg border-2 transition-all flex flex-col gap-1.5 ${selectedMcq === i ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/30 hover:bg-muted/50"}`}
                                data-testid={`option-${q.id}-${i}`}>
                                <div className="flex items-center gap-2">
                                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 text-xs font-bold ${selectedMcq === i ? "border-primary bg-primary text-white" : "border-border"}`}>{String.fromCharCode(65 + i)}</span>
                                  {opt}
                                </div>
                                {optImg && <img src={optImg} alt="" className="w-full max-h-32 rounded-lg object-contain border border-border/40 bg-white" />}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {qType === "multi" && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-8">
                          {q.options.map((opt, i) => {
                            const checked = selectedMulti.includes(i);
                            const optImg = q.optionImages?.[i];
                            return (
                              <button key={i} onClick={() => toggleMultiAnswer(q.id, i)}
                                className={`text-left text-sm px-3 py-2.5 rounded-lg border-2 transition-all flex flex-col gap-1.5 ${checked ? "border-purple-500 bg-purple-50 text-purple-900 font-medium" : "border-border hover:border-purple-300 hover:bg-purple-50/30"}`}
                                data-testid={`option-${q.id}-${i}`}>
                                <div className="flex items-center gap-2">
                                  <span className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${checked ? "border-purple-500 bg-purple-500" : "border-border"}`}>
                                    {checked && <CheckCircle2 size={11} className="text-white" />}
                                  </span>
                                  <span className="text-xs font-semibold w-4 shrink-0">{String.fromCharCode(65 + i)}.</span>
                                  {opt}
                                </div>
                                {optImg && <img src={optImg} alt="" className="w-full max-h-32 rounded-lg object-contain border border-border/40 bg-white" />}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {qType === "integer" && (
                        <div className="pl-8 space-y-2">
                          {q.correctAnswerMin !== null && q.correctAnswerMin !== undefined && q.correctAnswerMax !== null && q.correctAnswerMax !== undefined && (
                            <p className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 inline-flex items-center gap-1">
                              ↔️ Enter a number between <strong>{q.correctAnswerMin}</strong> and <strong>{q.correctAnswerMax}</strong>
                            </p>
                          )}
                          <input type="number" value={integerVal} onChange={(e) => setIntegerAnswer(q.id, e.target.value)}
                            placeholder="Type your numeric answer..."
                            className="w-48 px-3 py-2 text-sm border-2 border-border rounded-lg focus:border-primary focus:outline-none transition-colors font-mono"
                            data-testid={`integer-input-${q.id}`} />
                        </div>
                      )}

                      <p className="pl-8 text-xs text-muted-foreground">{q.points} pt{q.points !== 1 ? "s" : ""}</p>
                    </div>
                  );
                })}

                <div className="border-t border-border pt-4 flex items-center justify-between gap-3 flex-wrap">
                  {answeredCount < totalQ && (
                    <div className="flex items-center gap-2 text-sm text-amber-600"><AlertCircle size={15} /><span>{totalQ - answeredCount} unanswered</span></div>
                  )}
                  <div className="ml-auto">
                    <Button onClick={() => {
                      if (answeredCount < totalQ && !confirm(`You have ${totalQ - answeredCount} unanswered question(s). Submit anyway?`)) return;
                      submitMutation.mutate();
                    }} disabled={submitMutation.isPending} data-testid="button-submit-test">
                      {submitMutation.isPending ? "Submitting..." : "Submit Test"}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Result + Analysis Dialog ─── */}
      <Dialog open={resultTest !== null} onOpenChange={(o) => !o && setResultTest(null)}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-0">
          {resultTest?.submission && (
            <>
              <div className="sticky top-0 z-10 bg-background border-b border-border px-6 pt-4">
                <DialogHeader><DialogTitle className="text-base">{resultTest.title}</DialogTitle></DialogHeader>
                <div className="flex gap-0 mt-3">
                  <button onClick={() => setResultTab("score")}
                    className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${resultTab === "score" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`} data-testid="tab-score">
                    <BarChart3 size={14} />Score
                  </button>
                  <button onClick={() => { setResultTab("analysis"); setAnalysisFilter("all"); }}
                    className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${resultTab === "analysis" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`} data-testid="tab-analysis">
                    <ListChecks size={14} />Deep Analysis
                  </button>
                </div>
              </div>

              <div className="p-6">
                {/* ── Score Tab ── */}
                {resultTab === "score" && (
                  <div className="space-y-4">
                    <div className={`rounded-2xl p-6 text-center ${resultTest.submission.passed ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                      {resultTest.submission.passed
                        ? <CheckCircle2 size={44} className="mx-auto text-green-600 mb-2" />
                        : <XCircle size={44} className="mx-auto text-red-600 mb-2" />}
                      <p className={`text-4xl font-bold ${resultTest.submission.passed ? "text-green-700" : "text-red-700"}`}>{resultTest.submission.percentage}%</p>
                      <p className={`text-sm font-medium mt-1 ${resultTest.submission.passed ? "text-green-600" : "text-red-600"}`}>
                        {resultTest.submission.passed ? "Passed!" : "Not passed — keep practicing"}
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="bg-muted rounded-xl p-3"><p className="text-xl font-bold">{resultTest.submission.score}</p><p className="text-xs text-muted-foreground">Points earned</p></div>
                      <div className="bg-muted rounded-xl p-3"><p className="text-xl font-bold">{resultTest.submission.totalPoints}</p><p className="text-xs text-muted-foreground">Total points</p></div>
                      <div className="bg-muted rounded-xl p-3"><p className="text-xl font-bold">{resultTest.passingScore}%</p><p className="text-xs text-muted-foreground">Passing mark</p></div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl p-3">
                        <CheckCircle2 size={18} className="text-green-600 shrink-0" />
                        <div><p className="font-bold text-green-700 text-base">{correctCount}</p><p className="text-xs text-green-600">Correct</p></div>
                      </div>
                      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
                        <XCircle size={18} className="text-red-600 shrink-0" />
                        <div><p className="font-bold text-red-700 text-base">{wrongCount}</p><p className="text-xs text-red-600">Wrong</p></div>
                      </div>
                      <div className="flex items-center gap-2 bg-muted border border-border rounded-xl p-3">
                        <AlertCircle size={18} className="text-muted-foreground shrink-0" />
                        <div><p className="font-bold text-base">{skippedCount}</p><p className="text-xs text-muted-foreground">Skipped</p></div>
                      </div>
                    </div>

                    {totalTimeSecs > 0 && (
                      <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-3">
                        <Timer size={18} className="text-blue-600 shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-bold text-blue-700">{formatSeconds(totalTimeSecs)}</p>
                          <p className="text-xs text-blue-600">Total time recorded</p>
                        </div>
                        {savedFlagged.length > 0 && (
                          <div className="flex items-center gap-1.5 bg-amber-100 text-amber-700 rounded-lg px-2.5 py-1.5">
                            <Flag size={12} className="fill-amber-600" /><span className="text-xs font-medium">{savedFlagged.length} flagged</span>
                          </div>
                        )}
                      </div>
                    )}

                    <p className="text-xs text-center text-muted-foreground">Submitted {format(new Date(resultTest.submission.submittedAt), "MMMM d, yyyy h:mm a")}</p>
                    <Button className="w-full" variant="outline" onClick={() => { setResultTab("analysis"); setAnalysisFilter("all"); }} data-testid="button-view-analysis">
                      <ListChecks size={15} className="mr-2" />Open Deep Analysis
                    </Button>
                  </div>
                )}

                {/* ── Analysis Tab ── */}
                {resultTab === "analysis" && (
                  <div className="space-y-5">
                    {/* Summary stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                        <Timer size={14} className="mx-auto text-blue-600 mb-1" />
                        <p className="text-base font-bold text-blue-700">{formatSeconds(totalTimeSecs) || "—"}</p>
                        <p className="text-xs text-blue-600">Total time</p>
                      </div>
                      <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                        <CheckCircle2 size={14} className="mx-auto text-green-600 mb-1" />
                        <p className="text-base font-bold text-green-700">{correctCount}/{resultTest.questions.length}</p>
                        <p className="text-xs text-green-600">Correct</p>
                      </div>
                      <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-center">
                        <TrendingUp size={14} className="mx-auto text-purple-600 mb-1" />
                        <p className="text-base font-bold text-purple-700">
                          {totalTimeSecs > 0 && resultTest.questions.length > 0 ? formatSeconds(Math.round(totalTimeSecs / resultTest.questions.length)) : "—"}
                        </p>
                        <p className="text-xs text-purple-600">Avg / question</p>
                      </div>
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                        <Flag size={14} className="mx-auto text-amber-600 mb-1" />
                        <p className="text-base font-bold text-amber-700">{savedFlagged.length}</p>
                        <p className="text-xs text-amber-600">Flagged</p>
                      </div>
                    </div>

                    {/* Charts */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="bg-muted/30 rounded-xl p-4">
                        <p className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Target size={13} className="text-primary" />Result Breakdown</p>
                        <ResponsiveContainer width="100%" height={160}>
                          <PieChart>
                            <Pie data={pieData} cx="50%" cy="50%" innerRadius={38} outerRadius={62} paddingAngle={3} dataKey="value">
                              {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                            </Pie>
                            <Tooltip contentStyle={{ fontSize: 12 }} />
                            <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="bg-muted/30 rounded-xl p-4">
                        <p className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Timer size={13} className="text-primary" />Time per Question</p>
                        {timeBarData.some(d => d.seconds > 0) ? (
                          <ResponsiveContainer width="100%" height={160}>
                            <BarChart data={timeBarData} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}s`} />
                              <Tooltip contentStyle={{ fontSize: 12 }} formatter={v => [`${v}s`, "Time spent"]} />
                              <Bar dataKey="seconds" radius={[4, 4, 0, 0]}>
                                {timeBarData.map(d => {
                                  const q = resultTest.questions.find(q => q.id === d.qId);
                                  const correct = q ? isAnswerCorrect(q, submittedAnswers[d.qId]) : false;
                                  const skipped = submittedAnswers[d.qId] === undefined || submittedAnswers[d.qId] === null;
                                  return <Cell key={d.qId} fill={correct ? "#22c55e" : skipped ? "#94a3b8" : "#ef4444"} />;
                                })}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-40 flex items-center justify-center text-xs text-muted-foreground">No timing data — interact with questions during the test to record timings</div>
                        )}
                      </div>
                    </div>

                    {/* Filter buttons */}
                    <div className="flex gap-1.5 flex-wrap">
                      {([
                        { key: "all" as AnalysisFilter, label: "All", count: resultTest.questions.length, color: "border-border" },
                        { key: "correct" as AnalysisFilter, label: "Correct", count: correctCount, color: "border-green-400" },
                        { key: "wrong" as AnalysisFilter, label: "Wrong", count: wrongCount, color: "border-red-400" },
                        { key: "skipped" as AnalysisFilter, label: "Skipped", count: skippedCount, color: "border-gray-400" },
                        { key: "flagged" as AnalysisFilter, label: "Flagged", count: savedFlagged.length, color: "border-amber-400" },
                      ]).map(f => (
                        <button key={f.key} onClick={() => setAnalysisFilter(f.key)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all ${analysisFilter === f.key ? `${f.color} bg-foreground/5` : "border-border bg-background hover:border-foreground/20"}`}>
                          {f.label}
                          <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${analysisFilter === f.key ? "bg-foreground/10" : "bg-muted"}`}>{f.count}</span>
                        </button>
                      ))}
                    </div>

                    {filteredQuestions.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">No questions in this category.</p>
                    ) : (
                      <div className="space-y-3">
                        {filteredQuestions.map((q) => {
                          const qIdx = resultTest.questions.findIndex(x => x.id === q.id);
                          const qType = q.questionType ?? "mcq";
                          const answer = submittedAnswers[q.id];
                          const correct = isAnswerCorrect(q, answer);
                          const skipped = answer === undefined || answer === null || (Array.isArray(answer) && answer.length === 0);
                          const earnedPoints = correct ? q.points : 0;
                          const timeSecs = savedTimings[String(q.id)] ?? 0;
                          const isFlaggedQ = savedFlagged.includes(q.id);
                          const maxTimeSecs = Math.max(...Object.values(savedTimings).concat([1]));
                          const timePct = Math.round((timeSecs / maxTimeSecs) * 100);

                          return (
                            <div key={q.id} className={`rounded-xl border-2 overflow-hidden ${correct ? "border-green-200" : skipped ? "border-gray-200" : "border-red-200"}`} data-testid={`analysis-q-${q.id}`}>
                              {/* Header */}
                              <div className={`px-4 py-3 flex items-start gap-3 ${correct ? "bg-green-50" : skipped ? "bg-gray-50" : "bg-red-50"}`}>
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white mt-0.5 ${correct ? "bg-green-500" : skipped ? "bg-gray-400" : "bg-red-500"}`}>
                                  {qIdx + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${correct ? "bg-green-100 text-green-700" : skipped ? "bg-gray-100 text-gray-600" : "bg-red-100 text-red-700"}`}>
                                      {skipped ? "⊘ Skipped" : correct ? `✓ +${earnedPoints}pt${earnedPoints !== 1 ? "s" : ""}` : `✗ 0/${q.points}pts`}
                                    </span>
                                    <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium ${qType === "multi" ? "bg-purple-100 text-purple-700" : qType === "integer" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>
                                      {qType === "multi" ? <CheckSquare size={10} /> : qType === "integer" ? <Hash size={10} /> : <CheckCircle2 size={10} />}
                                      {qType === "mcq" ? "MCQ" : qType === "multi" ? "Multi" : "Integer"}
                                    </span>
                                    {isFlaggedQ && <span className="flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full"><Flag size={10} className="fill-amber-600" />Flagged</span>}
                                    {timeSecs > 0 && <span className="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full"><Clock size={10} />{formatSeconds(timeSecs)}</span>}
                                  </div>
                                  <p className="text-sm font-medium leading-relaxed">{q.question}</p>
                                </div>
                              </div>

                              {/* Time bar */}
                              {timeSecs > 0 && (
                                <div className="px-4 py-2 bg-background border-b border-border/40 flex items-center gap-2">
                                  <Timer size={11} className="text-muted-foreground shrink-0" />
                                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${correct ? "bg-green-400" : skipped ? "bg-gray-300" : "bg-red-400"}`} style={{ width: `${timePct}%` }} />
                                  </div>
                                  <span className="text-xs font-mono text-muted-foreground shrink-0">{formatSeconds(timeSecs)}</span>
                                </div>
                              )}

                              {/* Answer analysis */}
                              <div className="p-4 space-y-2 bg-background">
                                {q.imageData && <img src={q.imageData} alt="" className="max-h-40 w-full rounded-lg border object-contain bg-white mb-2" />}

                                {qType === "mcq" && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                    {q.options.map((opt, i) => {
                                      const isStudentChoice = Number(answer) === i;
                                      const isCorrectChoice = q.correctAnswer === i;
                                      const optImg = q.optionImages?.[i];
                                      let cls = "border-border/50 bg-muted/30 text-muted-foreground";
                                      let label = null;
                                      if (isCorrectChoice && isStudentChoice) { cls = "border-green-400 bg-green-100 text-green-800 font-semibold"; label = <span className="text-xs text-green-700 font-semibold shrink-0">✓ Your answer</span>; }
                                      else if (isCorrectChoice) { cls = "border-green-300 bg-green-50 text-green-700 font-semibold"; label = <span className="text-xs text-green-600 shrink-0">✓ Correct</span>; }
                                      else if (isStudentChoice) { cls = "border-red-400 bg-red-100 text-red-800 font-semibold"; label = <span className="text-xs text-red-700 shrink-0">✗ Your pick</span>; }
                                      return (
                                        <div key={i} className={`flex flex-col gap-1 text-xs px-2.5 py-2 rounded-lg border-2 ${cls}`}>
                                          <div className="flex items-center gap-2"><span className="font-bold shrink-0">{String.fromCharCode(65 + i)}.</span><span className="flex-1">{opt}</span>{label}</div>
                                          {optImg && <img src={optImg} alt="" className="w-full max-h-20 rounded object-contain border border-border/30 bg-white" />}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {qType === "multi" && (
                                  <div className="space-y-1.5">
                                    <p className="text-xs text-muted-foreground">Correct: <strong>{(q.correctAnswerMulti ?? []).map(i => String.fromCharCode(65 + i)).join(", ")}</strong></p>
                                    {q.options.map((opt, i) => {
                                      const isCorrectChoice = (q.correctAnswerMulti ?? []).includes(i);
                                      const isStudentChoice = Array.isArray(answer) && (answer as number[]).includes(i);
                                      const optImg = q.optionImages?.[i];
                                      let cls = "border-border/50 bg-muted/30 text-muted-foreground";
                                      let label = null;
                                      if (isCorrectChoice && isStudentChoice) { cls = "border-green-400 bg-green-100 text-green-800 font-semibold"; label = <span className="text-xs text-green-700 font-semibold shrink-0">✓</span>; }
                                      else if (isCorrectChoice && !isStudentChoice) { cls = "border-green-300 bg-green-50/70 text-green-700"; label = <span className="text-xs text-green-600 shrink-0">Missed</span>; }
                                      else if (!isCorrectChoice && isStudentChoice) { cls = "border-red-400 bg-red-100 text-red-800 font-semibold"; label = <span className="text-xs text-red-700 shrink-0">✗ Wrong</span>; }
                                      return (
                                        <div key={i} className={`flex flex-col gap-1 text-xs px-2.5 py-2 rounded-lg border-2 ${cls}`}>
                                          <div className="flex items-center gap-2"><span className="font-bold shrink-0">{String.fromCharCode(65 + i)}.</span><span className="flex-1">{opt}</span>{label}</div>
                                          {optImg && <img src={optImg} alt="" className="w-full max-h-20 rounded object-contain border border-border/30 bg-white" />}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {qType === "integer" && (
                                  <div className="flex items-center gap-3 flex-wrap text-sm">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground">Your answer:</span>
                                      <span className={`font-bold px-2 py-0.5 rounded text-xs ${!skipped && correct ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{skipped ? "—" : String(answer)}</span>
                                    </div>
                                    {!correct && (
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground">Correct:</span>
                                        {(q.correctAnswerMin !== null && q.correctAnswerMin !== undefined && q.correctAnswerMax !== null && q.correctAnswerMax !== undefined) ? (
                                          <span className="font-bold px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700">{q.correctAnswerMin} — {q.correctAnswerMax}</span>
                                        ) : (
                                          <span className="font-bold px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">{q.correctAnswer}</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {skipped && <p className="text-xs text-muted-foreground italic">You did not answer this question.</p>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="pt-2 border-t border-border flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Final: <strong>{resultTest.submission.score}/{resultTest.submission.totalPoints}</strong> ({resultTest.submission.percentage}%)</span>
                      <Button size="sm" variant="outline" onClick={() => setResultTab("score")}>Back to Score</Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
