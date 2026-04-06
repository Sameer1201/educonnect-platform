import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  ClipboardList, Clock, CheckCircle2, XCircle, AlertCircle, BookOpen, ChevronRight,
  BarChart3, ListChecks, Hash, CheckSquare, Flag, Timer, TrendingUp, Target, Brain,
  Calculator, PanelRightClose, PanelRightOpen, Circle, Square
} from "lucide-react";
import { format } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const TEST_DRAFT_PREFIX = "educonnect-test-draft";

type QuestionType = "mcq" | "multi" | "integer";
type ResultTab = "score" | "analysis";
type AnalysisFilter = "all" | "correct" | "wrong" | "skipped" | "flagged";
type AnswerValue = number | number[];
type PaletteStatus = "not-visited" | "not-answered" | "answered" | "review" | "answered-review";

interface TestItem {
  id: number; title: string; description: string | null; durationMinutes: number;
  examHeader?: string | null; examSubheader?: string | null;
  passingScore: number; scheduledAt: string | null; className: string | null;
  subjectName?: string | null; chapterName?: string | null; alreadySubmitted: boolean;
}
interface Question {
  id: number; question: string; questionType: QuestionType; options: string[];
  optionImages?: (string | null)[] | null;
  points: number; negativeMarks?: number | null; order: number; imageData?: string | null;
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
  examHeader?: string | null; examSubheader?: string | null;
  passingScore: number; questions: Question[]; submission: SubmissionData | null;
  className?: string | null; subjectName?: string | null; chapterName?: string | null;
}

interface SavedTestDraft {
  answers: Record<number, AnswerValue>;
  timeLeft: number;
  currentQuestionIndex: number;
  visitedQuestionIds: number[];
  reviewQuestionIds: number[];
  flaggedQuestionIds: number[];
  questionTimings: Record<number, number>;
  showInstructions: boolean;
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

function getNegativeMark(question: Question): string {
  return Number(question.negativeMarks ?? 0).toFixed(2).replace(/\.00$/, "");
}

const PIE_COLORS = ["#22c55e", "#ef4444", "#94a3b8"];

export default function StudentTests() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const [activeTest, setActiveTest] = useState<TestDetail | null>(null);
  const [answers, setAnswers] = useState<Record<number, AnswerValue>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [resultTest, setResultTest] = useState<TestDetail | null>(null);
  const [resultTab, setResultTab] = useState<ResultTab>("score");
  const [analysisFilter, setAnalysisFilter] = useState<AnalysisFilter>("all");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [visitedSet, setVisitedSet] = useState<Set<number>>(new Set());
  const [reviewSet, setReviewSet] = useState<Set<number>>(new Set());
  const [showInstructions, setShowInstructions] = useState(false);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [questionTimings, setQuestionTimings] = useState<Record<number, number>>({});
  const timingActiveRef = useRef<{ qId: number; startMs: number } | null>(null);
  const [flaggedSet, setFlaggedSet] = useState<Set<number>>(new Set());

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
    flaggedQuestionIds: Array.from(flaggedSet),
    questionTimings,
    showInstructions,
    ...overrides,
  });

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
    const rawDraft = localStorage.getItem(getDraftKey(testId));
    const parsedDraft: SavedTestDraft | null = rawDraft ? JSON.parse(rawDraft) : null;
    const shouldResume = parsedDraft ? window.confirm("A saved test attempt was found. Do you want to continue from where you left off?") : false;
    const initialIndex = shouldResume ? Math.min(parsedDraft?.currentQuestionIndex ?? 0, Math.max(data.questions.length - 1, 0)) : 0;
    const initialQuestion = data.questions[initialIndex];

    setActiveTest(data);
    setAnswers(shouldResume ? parsedDraft?.answers ?? {} : {});
    setTimeLeft(shouldResume ? Math.max(parsedDraft?.timeLeft ?? data.durationMinutes * 60, 0) : data.durationMinutes * 60);
    setQuestionTimings(shouldResume ? parsedDraft?.questionTimings ?? {} : {});
    setFlaggedSet(new Set(shouldResume ? parsedDraft?.flaggedQuestionIds ?? [] : []));
    timingActiveRef.current = null;
    setCurrentQuestionIndex(initialIndex);
    setVisitedSet(new Set(
      shouldResume
        ? parsedDraft?.visitedQuestionIds ?? (initialQuestion ? [initialQuestion.id] : [])
        : (initialQuestion ? [initialQuestion.id] : [])
    ));
    setReviewSet(new Set(shouldResume ? parsedDraft?.reviewQuestionIds ?? [] : []));
    setShowInstructions(shouldResume ? parsedDraft?.showInstructions ?? false : true);
    setPaletteCollapsed(false);
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
  }, [activeTest, answers, timeLeft, currentQuestionIndex, visitedSet, reviewSet, flaggedSet, questionTimings, showInstructions]);

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

  const isAnswered = (question: Question, answer: AnswerValue | undefined) => {
    if (question.questionType === "multi") return Array.isArray(answer) && answer.length > 0;
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
        body: JSON.stringify({ answers, questionTimings: finalTimings, flaggedQuestions: Array.from(flaggedSet) }),
      });
      if (!r.ok) throw new Error("Failed to submit");
      return r.json();
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["student-tests"] });
      if (timerRef.current) clearInterval(timerRef.current);
      clearDraft(activeTest!.id);
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
    return isAnswered(q, a);
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

  const goToQuestion = (index: number) => {
    if (!activeTest) return;
    const bounded = Math.max(0, Math.min(index, activeTest.questions.length - 1));
    const question = activeTest.questions[bounded];
    setCurrentQuestionIndex(bounded);
    setVisitedSet((prev) => new Set(prev).add(question.id));
    startInteraction(question.id);
  };

  const clearResponse = (question: Question) => {
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
    setReviewSet((prev) => new Set(prev).add(current.id));
    if (currentQuestionIndex < activeTest.questions.length - 1) goToQuestion(currentQuestionIndex + 1);
  };

  const previousQuestion = () => {
    if (currentQuestionIndex > 0) goToQuestion(currentQuestionIndex - 1);
  };

  const currentQuestion = activeTest?.questions[currentQuestionIndex] ?? null;
  const notVisitedCount = activeTest?.questions.filter((q) => getPaletteStatus(q) === "not-visited").length ?? 0;
  const notAnsweredCount = activeTest?.questions.filter((q) => getPaletteStatus(q) === "not-answered").length ?? 0;
  const answeredReviewCount = activeTest?.questions.filter((q) => getPaletteStatus(q) === "answered-review").length ?? 0;
  const reviewCount = activeTest?.questions.filter((q) => getPaletteStatus(q) === "review").length ?? 0;

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
    setActiveTest(null);
    toast({ title: "Test saved", description: "You can continue this test later from the test list." });
  };

  const submittedAnswers: Record<number, AnswerValue> = resultTest?.submission?.answers ? JSON.parse(resultTest.submission.answers) : {};
  const savedTimings: Record<string, number> = resultTest?.submission?.questionTimings ?? {};
  const savedFlagged: number[] = resultTest?.submission?.flaggedQuestions ?? [];
  const totalTimeSecs = Object.values(savedTimings).reduce((a, b) => a + b, 0);

  const correctCount = resultTest?.questions.filter(q => isAnswerCorrect(q, submittedAnswers[q.id])).length ?? 0;
  const skippedCount = resultTest?.questions.filter(q => { const a = submittedAnswers[q.id]; return a === undefined || a === null || (Array.isArray(a) && a.length === 0); }).length ?? 0;
  const wrongCount = (resultTest?.questions.length ?? 0) - correctCount - skippedCount;
  const examHeading = activeTest?.examHeader?.trim() || activeTest?.description?.trim() || activeTest?.title || "Exam Interface";
  const examSubheading = activeTest?.examSubheader?.trim() || activeTest?.className || activeTest?.subjectName || activeTest?.chapterName || "Online Test";

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
                  <div className="flex items-center justify-between border-b border-[#a76d1c] px-4 py-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#7f7f7f] bg-[#f3f3f3] text-[10px] font-bold text-[#57438f]">EC</div>
                    <div className="flex-1 px-4 text-center leading-tight">
                      <p className="text-xl font-bold uppercase tracking-tight text-[#6e4ca5]">{examHeading}</p>
                      <p className="text-xs font-semibold uppercase text-[#3a8b2e]">{examSubheading}</p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#7f7f7f] bg-[#f3f3f3] text-[10px] font-bold text-[#d58a00]">QB</div>
                  </div>
                  <div className="flex items-center justify-between bg-[#d7edf6] px-4 py-2">
                    <p className="text-[16px] font-bold text-[#4d4d4d]">{showInstructions ? "Instructions" : activeTest.title}</p>
                    {!showInstructions && (
                      <div className={`flex items-center gap-1.5 px-2 py-1 font-mono text-[14px] font-bold ${timeLeft <= 60 ? "text-red-700" : "text-[#2b2b2b]"}`}>
                        <Clock size={13} /> Time Left : {formatTime(timeLeft)}
                      </div>
                    )}
                  </div>
                </div>

                {showInstructions ? (
                  <div className="flex min-h-0 flex-1 overflow-hidden bg-white text-black">
                    <div className="min-h-0 flex-1 overflow-y-auto border-r border-[#2f2f2f] bg-white p-6">
                      <div className="mx-auto max-w-5xl space-y-6">
                        <div className="text-center">
                          <h2 className="text-[16px] font-bold text-black">General Instructions</h2>
                        </div>
                        <div className="space-y-4 text-[14px] leading-7 text-black">
                          <p><strong>Please read the following carefully.</strong></p>
                          <ol className="list-decimal space-y-3 pl-5">
                          <li>The duration of the examination is {activeTest.durationMinutes} minutes. The countdown timer at the top right-hand corner of your screen displays the time available.</li>
                          <li>When the timer reaches zero, the examination will end automatically and your responses will be submitted.</li>
                          <li>The screen is divided into two panels. The panel on the left shows the questions one at a time and the panel on the right has the Question Palette.</li>
                          <li>Click on <strong>Save &amp; Next</strong> to save your answer and move to the next question.</li>
                          <li>Click on <strong>Mark for Review &amp; Next</strong> to mark the current question for review and continue.</li>
                          <li>Click on a question number in the Question Palette to navigate directly without auto-saving the current question.</li>
                          <li>Use <strong>Clear Response</strong> to remove the selected answer from the current question.</li>
                          <li>MCQ uses circular selection, MSQ uses square selection, and integer questions use the numeric input area.</li>
                          </ol>
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
                    <aside className="hidden w-[250px] shrink-0 border-l border-[#2f2f2f] bg-[#f5f5f5] md:flex md:flex-col">
                      <div className="flex flex-1 flex-col items-center px-4 py-6 text-center">
                        <div className="flex h-28 w-24 items-center justify-center overflow-hidden rounded-sm border border-[#7f7f7f] bg-white shadow-inner">
                          {user && (user as any).avatarUrl ? (
                            <img src={(user as any).avatarUrl} alt={user.fullName ?? user.username ?? "Candidate"} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_35%,#dce8f4,#8ea4bf_65%,#5d728e)] text-[10px] font-bold text-white">PHOTO</div>
                          )}
                        </div>
                        <p className="mt-6 text-[14px] font-bold text-[#607a98]">Candidate</p>
                        <p className="mt-1 text-sm font-semibold text-[#607a98]">{user?.fullName ?? user?.username ?? "John Smith"}</p>
                      </div>
                    </aside>
                  </div>
                ) : currentQuestion ? (
                  <div className="flex min-h-0 flex-1 overflow-hidden">
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-r border-slate-300 bg-white">
                      <div className="border-b border-slate-300 bg-[#ececec] px-2 py-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                          <button className="rounded-sm border border-[#7aa9d4] bg-[#7aa9d4] px-3 py-1 text-white shadow-sm">
                            {activeTest.subjectName ?? "Question Paper"}
                          </button>
                          {activeTest.chapterName && (
                            <button className="rounded-sm border border-slate-300 bg-white px-3 py-1 text-slate-700">
                              {activeTest.chapterName}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between border-b border-slate-300 bg-white px-2 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[13px] font-bold text-black">Question Type: {currentQuestion.questionType.toUpperCase()}</span>
                          </div>
                        </div>
                        <div className="text-[13px] text-black">Marks for correct answer: <span className="font-bold">{currentQuestion.points}</span> | Negative Marks: <span className="font-bold text-[#c55f00]">{getNegativeMark(currentQuestion)}</span></div>
                      </div>

                      <div className="border-b border-slate-300 px-2 py-2 text-[18px] font-bold text-black">
                        Question No. {currentQuestionIndex + 1}
                      </div>

                      <div className="min-h-0 flex-1 overflow-y-auto bg-white p-4">
                        <div className="relative mx-auto max-w-none border border-slate-200 bg-white p-4 sm:p-6 shadow-sm before:pointer-events-none before:absolute before:inset-0 before:bg-[repeating-linear-gradient(-60deg,transparent,transparent_180px,rgba(40,70,110,0.06)_180px,rgba(40,70,110,0.06)_240px)]">
                          <div className="space-y-4">
                            <p className="text-base leading-7 text-slate-900">{currentQuestion.question}</p>
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
                                            <span className="text-sm text-slate-800">{opt}</span>
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
                              <div className="space-y-4">
                                <input
                                  type="number"
                                  value={answers[currentQuestion.id] !== undefined ? String(answers[currentQuestion.id]) : ""}
                                  onChange={(e) => setIntegerAnswer(currentQuestion.id, e.target.value)}
                                  placeholder="Enter numerical answer"
                                  className="w-full max-w-xs rounded-sm border border-slate-300 bg-white px-4 py-3 font-mono text-sm outline-none focus:border-blue-500"
                                  data-testid={`integer-input-${currentQuestion.id}`}
                                />
                                <div className="rounded-sm border border-slate-200 bg-slate-50 p-4">
                                  <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                    <Calculator size={16} />
                                    Virtual Numeric Keypad
                                  </div>
                                  <div className="mt-3 grid max-w-xs grid-cols-3 gap-2">
                                    {["7","8","9","4","5","6","1","2","3","0","-","."].map((key) => (
                                      <button
                                        key={key}
                                        type="button"
                                        onClick={() => {
                                          const current = answers[currentQuestion.id] !== undefined ? String(answers[currentQuestion.id]) : "";
                                          setAnswers((prev) => ({ ...prev, [currentQuestion.id]: `${current}${key}` }));
                                          startInteraction(currentQuestion.id);
                                        }}
                                        className="rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                      >
                                        {key}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-slate-300 bg-white px-2 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button variant="outline" className="rounded-none border border-[#bdbdbd] bg-white text-black shadow-none hover:bg-[#f3f3f3]" onClick={exitTest}>
                              Exit
                            </Button>
                            <Button variant="outline" className="rounded-none border border-[#bdbdbd] bg-white text-black shadow-none hover:bg-[#f3f3f3] disabled:bg-[#f5f5f5] disabled:text-[#9a9a9a]" onClick={previousQuestion} disabled={currentQuestionIndex === 0}>
                              Previous
                            </Button>
                            <Button variant="outline" className="rounded-none border border-[#bdbdbd] bg-white text-black shadow-none hover:bg-[#f3f3f3]" onClick={() => toggleFlag(currentQuestion.id)}>
                              <Flag size={14} className="mr-2" />
                              {flaggedSet.has(currentQuestion.id) ? "Remove Flag" : "Flag"}
                            </Button>
                            <Button variant="outline" className="rounded-none border border-[#bdbdbd] bg-white text-black shadow-none hover:bg-[#f3f3f3]" onClick={() => clearResponse(currentQuestion)}>
                              Clear Response
                            </Button>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
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
                              <p className="text-xs text-slate-500">{answeredCount}/{totalQ} answered</p>
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
                            <div className="flex items-start gap-2">{renderPaletteBadge(answeredCount, "answered")}<div><p className="font-medium leading-4 text-black">Answered</p></div></div>
                            <div className="flex items-start gap-2">{renderPaletteBadge(notAnsweredCount, "not-answered")}<div><p className="font-medium leading-4 text-black">Not Answered</p></div></div>
                            <div className="flex items-start gap-2">{renderPaletteBadge(notVisitedCount, "not-visited")}<div><p className="font-medium leading-4 text-black">Not Visited</p></div></div>
                            <div className="flex items-start gap-2">{renderPaletteBadge(reviewCount, "review")}<div><p className="font-medium leading-4 text-black">Marked for Review</p></div></div>
                            <div className="col-span-2 flex items-start gap-2">{renderPaletteBadge(answeredReviewCount, "answered-review")}<div><p className="font-medium leading-4 text-black">Answered & Marked for Review (will also be evaluated)</p></div></div>
                          </div>
                          </div>

                          <div className="bg-[#d9eaf5]">
                            <p className="bg-[#2a85b8] px-3 py-2 text-sm font-bold text-white">{activeTest.subjectName ?? "Section"}</p>
                            <p className="px-4 py-3 text-[13px] font-semibold text-black">Choose a Question</p>
                          </div>

                          <div className="grid grid-cols-4 gap-2 px-4 pb-4">
                            {activeTest.questions.map((question, index) => {
                              const status = getPaletteStatus(question);
                              const isCurrent = currentQuestion.id === question.id;
                              return (
                                <button
                                  key={question.id}
                                  type="button"
                                  onClick={() => goToQuestion(index)}
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
                            onClick={() => {
                              if (answeredCount < totalQ && !confirm(`You have ${totalQ - answeredCount} unanswered question(s). Submit anyway?`)) return;
                              submitMutation.mutate();
                            }}
                            disabled={submitMutation.isPending}
                            data-testid="button-submit-test"
                          >
                            {submitMutation.isPending ? "Submitting..." : "Submit"}
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
                          const penalty = Number(q.negativeMarks ?? 0);
                          const earnedPoints = correct ? q.points : skipped ? 0 : -penalty;
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
                                      {skipped ? "⊘ Skipped" : correct ? `✓ +${earnedPoints}pt${earnedPoints !== 1 ? "s" : ""}` : `✗ ${earnedPoints} / ${q.points}pts`}
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
