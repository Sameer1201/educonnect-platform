import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ClipboardList, Plus, Trash2, CheckCircle2, XCircle, ChevronDown, ChevronRight,
  ToggleLeft, ToggleRight, Clock, BarChart3, ImagePlus, X, Hash, ListChecks, CheckSquare,
  TrendingUp, Users, Award, Target
} from "lucide-react";
import { format } from "date-fns";
import { useListClasses } from "@workspace/api-client-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, RadialBarChart, RadialBar
} from "recharts";
import { DashboardScene, HoloGrid, TiltCard } from "@/components/dashboard-3d";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type QuestionType = "mcq" | "multi" | "integer";

interface Test {
  id: number; classId: number | null; title: string; description: string | null;
  chapterId: number | null; durationMinutes: number; passingScore: number; isPublished: boolean;
  scheduledAt: string | null; className: string | null; chapterName?: string | null; subjectName?: string | null;
}
interface Question {
  id: number; question: string; questionType: QuestionType; options: string[];
  optionImages?: (string | null)[] | null;
  correctAnswer: number; correctAnswerMulti: number[] | null;
  correctAnswerMin?: number | null; correctAnswerMax?: number | null;
  points: number; order: number; imageData?: string | null;
}
interface Analytics {
  test: { id: number; title: string; passingScore: number };
  total: number; passCount: number; failCount: number;
  avgPercentage: number; avgScore: number; maxScore: number; minScore: number;
  scoreDistribution: { range: string; count: number }[];
  perQuestion: {
    id: number; question: string; questionType: QuestionType;
    options: string[]; optionImages: (string | null)[] | null;
    correctAnswer: number; correctAnswerMulti: number[] | null;
    correctAnswerMin: number | null; correctAnswerMax: number | null;
    points: number; correctCount: number; wrongCount: number; successRate: number;
    optionCounts: number[]; imageData: string | null;
  }[];
  submissions: {
    id: number; studentName: string; studentUsername: string;
    score: number; totalPoints: number; percentage: number; passed: boolean; submittedAt: string;
  }[];
}

interface ChapterOptionItem {
  id: number;
  title: string;
  description: string | null;
  lectures: { id: number }[];
}

interface SubjectStructureItem {
  id: number;
  title: string;
  description: string | null;
  chapters: ChapterOptionItem[];
}

const PIE_COLORS = ["#22c55e", "#ef4444"];
const BAR_COLORS = ["#6366f1", "#f59e0b", "#22c55e", "#ef4444"];

const qTypeLabel: Record<QuestionType, string> = {
  mcq: "MCQ (Single select)",
  multi: "Multi-select",
  integer: "Integer answer",
};
const qTypeIcon: Record<QuestionType, React.ReactNode> = {
  mcq: <CheckCircle2 size={13} />,
  multi: <CheckSquare size={13} />,
  integer: <Hash size={13} />,
};

export default function AdminTests() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { data: classes = [] } = useListClasses();

  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newClassId, setNewClassId] = useState<string>("");
  const [newChapterId, setNewChapterId] = useState<string>("");
  const [newDuration, setNewDuration] = useState("30");
  const [newPassing, setNewPassing] = useState("60");
  const [newScheduled, setNewScheduled] = useState("");

  const [expandedTest, setExpandedTest] = useState<number | null>(null);
  const [questionsMap, setQuestionsMap] = useState<Record<number, Question[]>>({});
  const [analyticsTest, setAnalyticsTest] = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const [addQOpen, setAddQOpen] = useState<number | null>(null);
  const [qType, setQType] = useState<QuestionType>("mcq");
  const [qText, setQText] = useState("");
  const [qOptions, setQOptions] = useState(["", "", "", ""]);
  const [qCorrect, setQCorrect] = useState(0);
  const [qCorrectMulti, setQCorrectMulti] = useState<number[]>([]);
  const [qCorrectInt, setQCorrectInt] = useState("");
  const [qIntegerMode, setQIntegerMode] = useState<"exact" | "range">("exact");
  const [qCorrectIntMin, setQCorrectIntMin] = useState("");
  const [qCorrectIntMax, setQCorrectIntMax] = useState("");
  const [qPoints, setQPoints] = useState("1");
  const [qImageData, setQImageData] = useState<string | null>(null);
  const [qOptionImages, setQOptionImages] = useState<(string | null)[]>([null, null, null, null]);
  const activeOptIdxRef = useRef<number>(-1);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const optionImgInputRef = useRef<HTMLInputElement>(null);

  const { data: tests = [], isLoading } = useQuery<Test[]>({
    queryKey: ["admin-tests"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/tests`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const { data: classStructure = [] } = useQuery<SubjectStructureItem[]>({
    queryKey: ["test-chapters", newClassId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/classes/${newClassId}/subjects`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!newClassId,
  });

  useEffect(() => {
    setNewChapterId("");
  }, [newClassId]);

  const chapterOptions = classStructure.flatMap((subject) =>
    subject.chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      subjectTitle: subject.title,
      lectureCount: chapter.lectures.length,
    })),
  );

  const createMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/tests`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: newClassId || null,
          chapterId: newChapterId || null,
          title: newTitle.trim(),
          description: newDesc.trim() || null,
          durationMinutes: parseInt(newDuration) || 30,
          passingScore: parseInt(newPassing) || 60,
          scheduledAt: newScheduled || null,
        }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tests"] });
      setCreateOpen(false); setNewTitle(""); setNewDesc(""); setNewClassId(""); setNewChapterId(""); setNewDuration("30"); setNewPassing("60"); setNewScheduled("");
      toast({ title: "Test created" });
    },
    onError: () => toast({ title: "Failed to create test", variant: "destructive" }),
  });

  const togglePublish = useMutation({
    mutationFn: async ({ id, isPublished }: { id: number; isPublished: boolean }) => {
      const r = await fetch(`${BASE}/api/tests/${id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isPublished }) });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-tests"] }); toast({ title: "Test updated" }); },
  });

  const deleteTestMutation = useMutation({
    mutationFn: async (id: number) => { await fetch(`${BASE}/api/tests/${id}`, { method: "DELETE", credentials: "include" }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-tests"] }); toast({ title: "Test deleted" }); },
  });

  const addQuestionMutation = useMutation({
    mutationFn: async (testId: number) => {
      const body: any = { question: qText.trim(), questionType: qType, points: parseInt(qPoints) || 1, imageData: qImageData || null };
      if (qType === "mcq") {
        body.options = qOptions;
        body.correctAnswer = qCorrect;
        const hasOptImg = qOptionImages.some((img) => img !== null);
        if (hasOptImg) body.optionImages = qOptionImages;
      } else if (qType === "multi") {
        body.options = qOptions;
        body.correctAnswerMulti = qCorrectMulti;
        const hasOptImg = qOptionImages.some((img) => img !== null);
        if (hasOptImg) body.optionImages = qOptionImages;
      } else if (qType === "integer") {
        body.options = [];
        if (qIntegerMode === "range") {
          body.correctAnswerMin = parseInt(qCorrectIntMin);
          body.correctAnswerMax = parseInt(qCorrectIntMax);
        } else {
          body.correctAnswer = parseInt(qCorrectInt) || 0;
        }
      }
      const r = await fetch(`${BASE}/api/tests/${testId}/questions`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: (data, testId) => {
      setQuestionsMap((prev) => ({ ...prev, [testId]: [...(prev[testId] ?? []), data] }));
      resetQuestionForm();
      toast({ title: "Question added" });
    },
    onError: () => toast({ title: "Failed to add question", variant: "destructive" }),
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: async ({ testId, qid }: { testId: number; qid: number }) => { await fetch(`${BASE}/api/tests/${testId}/questions/${qid}`, { method: "DELETE", credentials: "include" }); },
    onSuccess: (_, { testId, qid }) => { setQuestionsMap((prev) => ({ ...prev, [testId]: (prev[testId] ?? []).filter((q) => q.id !== qid) })); toast({ title: "Question removed" }); },
  });

  const resetQuestionForm = () => {
    setAddQOpen(null); setQType("mcq"); setQText(""); setQOptions(["", "", "", ""]);
    setQCorrect(0); setQCorrectMulti([]); setQCorrectInt("");
    setQIntegerMode("exact"); setQCorrectIntMin(""); setQCorrectIntMax("");
    setQPoints("1"); setQImageData(null); setQOptionImages([null, null, null, null]);
  };

  const loadQuestions = async (testId: number) => {
    if (questionsMap[testId]) return;
    const r = await fetch(`${BASE}/api/tests/${testId}`, { credentials: "include" });
    if (!r.ok) return;
    const data = await r.json();
    setQuestionsMap((prev) => ({ ...prev, [testId]: data.questions ?? [] }));
  };

  const openAnalytics = async (test: Test) => {
    setAnalyticsLoading(true);
    setAnalyticsTest(null);
    const r = await fetch(`${BASE}/api/tests/${test.id}/analytics`, { credentials: "include" });
    setAnalyticsLoading(false);
    if (!r.ok) { toast({ title: "Failed to load analytics", variant: "destructive" }); return; }
    setAnalyticsTest(await r.json());
  };

  const toggleExpand = (testId: number) => {
    if (expandedTest === testId) { setExpandedTest(null); return; }
    setExpandedTest(testId);
    loadQuestions(testId);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast({ title: "Image too large", description: "Max 5MB", variant: "destructive" }); return; }
    const reader = new FileReader();
    reader.onload = () => setQImageData(reader.result as string);
    reader.readAsDataURL(file); e.target.value = "";
  };

  const toggleMultiOption = (i: number) => {
    setQCorrectMulti((prev) => prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]);
  };

  const canSaveQuestion = () => {
    if (!qText.trim()) return false;
    if (qType === "mcq") return qOptions.every((o) => o.trim());
    if (qType === "multi") return qOptions.every((o) => o.trim()) && qCorrectMulti.length >= 1;
    if (qType === "integer") {
      if (qIntegerMode === "range") {
        return qCorrectIntMin.trim() !== "" && !isNaN(parseInt(qCorrectIntMin)) &&
               qCorrectIntMax.trim() !== "" && !isNaN(parseInt(qCorrectIntMax)) &&
               parseInt(qCorrectIntMin) <= parseInt(qCorrectIntMax);
      }
      return qCorrectInt.trim() !== "" && !isNaN(parseInt(qCorrectInt));
    }
    return false;
  };

  const handleOptionImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast({ title: "Image too large", description: "Max 5MB", variant: "destructive" }); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const idx = activeOptIdxRef.current;
      if (idx < 0) return;
      setQOptionImages((prev) => { const n = [...prev]; n[idx] = reader.result as string; return n; });
    };
    reader.readAsDataURL(file); e.target.value = "";
  };

  return (
    <div className="space-y-6">
      <DashboardScene accent="from-fuchsia-500/20 via-indigo-500/10 to-cyan-500/20">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_360px]">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-400/20 bg-fuchsia-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-fuchsia-100/90">
              <ClipboardList size={12} />
              Assessment Core
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white flex items-center gap-2">
                <ClipboardList size={24} className="text-cyan-300" />
                Tests & Quizzes
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Build chapter-based assessments, mix question types, and inspect student performance through a high-visibility analytics layer.
              </p>
            </div>
          </div>
          <TiltCard className="rounded-3xl">
            <HoloGrid title="Quick Launch" subtitle="Spin up a new test flow without leaving the dashboard rhythm.">
              <Button onClick={() => setCreateOpen(true)} className="w-full" data-testid="button-create-test">
                <Plus size={15} className="mr-2" />
                Create Test
              </Button>
            </HoloGrid>
          </TiltCard>
        </div>
      </DashboardScene>

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : tests.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><ClipboardList size={40} className="mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground">No tests yet. Create your first test.</p></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {tests.map((test) => {
            const isOpen = expandedTest === test.id;
            const qs = questionsMap[test.id] ?? [];
            return (
              <TiltCard key={test.id} className="rounded-3xl">
                <Card className={test.isPublished ? "border-primary/20" : ""} data-testid={`test-card-${test.id}`}>
                  <CardContent className="p-0">
                  <div className="flex items-center gap-3 p-4">
                    <button className="flex-1 text-left flex items-center gap-3 min-w-0" onClick={() => toggleExpand(test.id)}>
                      {isOpen ? <ChevronDown size={16} className="text-muted-foreground shrink-0" /> : <ChevronRight size={16} className="text-muted-foreground shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{test.title}</span>
                          <Badge variant={test.isPublished ? "default" : "secondary"} className="text-xs">{test.isPublished ? "Published" : "Draft"}</Badge>
                          {test.className && <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{test.className}</span>}
                          {test.subjectName && <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{test.subjectName}</span>}
                          {test.chapterName && <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">{test.chapterName}</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1"><Clock size={11} />{test.durationMinutes} min</span>
                          <span>Pass: {test.passingScore}%</span>
                          {test.scheduledAt && <span>{format(new Date(test.scheduledAt), "MMM d, yyyy")}</span>}
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" className="h-8 px-2 text-xs gap-1.5" onClick={() => openAnalytics(test)} data-testid={`button-view-results-${test.id}`}>
                        <BarChart3 size={13} />Analytics
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 px-2 text-xs gap-1.5 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                        onClick={() => setLocation(`/admin/tests/${test.id}/analytics`)} data-testid={`button-advanced-analytics-${test.id}`}>
                        <TrendingUp size={13} />Advanced
                      </Button>
                      <Button size="sm" variant="ghost" className={`h-8 px-2 text-xs gap-1.5 ${test.isPublished ? "text-orange-600" : "text-green-600"}`}
                        onClick={() => togglePublish.mutate({ id: test.id, isPublished: !test.isPublished })} data-testid={`button-toggle-publish-${test.id}`}>
                        {test.isPublished ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                        {test.isPublished ? "Unpublish" : "Publish"}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => { if (confirm("Delete this test?")) deleteTestMutation.mutate(test.id); }} data-testid={`button-delete-test-${test.id}`}>
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="border-t border-border bg-muted/20 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Questions ({qs.length})</p>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAddQOpen(test.id)} data-testid={`button-add-question-${test.id}`}>
                          <Plus size={12} className="mr-1" />Add Question
                        </Button>
                      </div>
                      {qs.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No questions yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {qs.map((q, idx) => (
                            <div key={q.id} className="bg-background rounded-lg border border-border p-3" data-testid={`question-${q.id}`}>
                              <div className="flex items-start gap-2">
                                <span className="text-xs font-semibold text-muted-foreground shrink-0 mt-0.5">Q{idx + 1}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <p className="text-sm font-medium flex-1">{q.question}</p>
                                    <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${q.questionType === "multi" ? "bg-purple-100 text-purple-700" : q.questionType === "integer" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>
                                      {qTypeIcon[q.questionType ?? "mcq"]}{qTypeLabel[q.questionType ?? "mcq"]}
                                    </span>
                                  </div>
                                  {q.imageData && <div className="mt-1 mb-2"><img src={q.imageData} alt="Q visual" className="max-h-32 rounded-lg border border-border object-contain" /></div>}
                                  {q.questionType === "integer" ? (
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                      <span className="text-xs text-muted-foreground">Correct answer:</span>
                                      {(q.correctAnswerMin !== null && q.correctAnswerMin !== undefined && q.correctAnswerMax !== null && q.correctAnswerMax !== undefined) ? (
                                        <span className="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{q.correctAnswerMin} — {q.correctAnswerMax}</span>
                                      ) : (
                                        <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded">{q.correctAnswer}</span>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-2 gap-1 mt-1">
                                      {q.options.map((opt, i) => {
                                        const isCorrect = q.questionType === "multi"
                                          ? (q.correctAnswerMulti ?? []).includes(i)
                                          : i === q.correctAnswer;
                                        const optImg = q.optionImages?.[i];
                                        return (
                                          <div key={i} className={`text-xs px-2 py-1 rounded flex flex-col gap-1 ${isCorrect ? "bg-green-50 text-green-700 font-medium border border-green-200" : "bg-muted/50 text-muted-foreground"}`}>
                                            <div className="flex items-center gap-1">
                                              {isCorrect && <CheckCircle2 size={11} />}
                                              {String.fromCharCode(65 + i)}. {opt}
                                            </div>
                                            {optImg && <img src={optImg} alt="" className="max-h-16 rounded object-contain border border-border/50" />}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                  <p className="text-xs text-muted-foreground mt-1">{q.points} pt{q.points !== 1 ? "s" : ""}</p>
                                </div>
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive shrink-0"
                                  onClick={() => deleteQuestionMutation.mutate({ testId: test.id, qid: q.id })}>
                                  <Trash2 size={11} />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  </CardContent>
                </Card>
              </TiltCard>
            );
          })}
        </div>
      )}

      {/* ─── Create Test Dialog ─── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create New Test</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Test Title *</Label><Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Chapter 1 Quiz" className="mt-1" data-testid="input-test-title" /></div>
            <div><Label className="text-xs">Description</Label><Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={2} className="mt-1 resize-none" /></div>
            <div>
              <Label className="text-xs">Class <span className="text-destructive">*</span></Label>
              <Select value={newClassId} onValueChange={setNewClassId}>
                <SelectTrigger className={`mt-1 ${!newClassId ? "border-destructive/50" : ""}`}><SelectValue placeholder="Select a class (required)" /></SelectTrigger>
                <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Students will only see tests assigned to their enrolled class.</p>
            </div>
            <div>
              <Label className="text-xs">Chapter <span className="text-destructive">*</span></Label>
              <Select value={newChapterId} onValueChange={setNewChapterId} disabled={!newClassId || chapterOptions.length === 0}>
                <SelectTrigger className={`mt-1 ${!newChapterId ? "border-destructive/50" : ""}`}>
                  <SelectValue placeholder={newClassId ? "Select a chapter" : "Select class first"} />
                </SelectTrigger>
                <SelectContent>
                  {chapterOptions.map((chapter) => (
                    <SelectItem key={chapter.id} value={String(chapter.id)}>
                      {chapter.subjectTitle} - {chapter.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Teacher tests are now chapter-based. Lectures under the chapter are optional.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Duration (minutes)</Label><Input type="number" value={newDuration} onChange={(e) => setNewDuration(e.target.value)} className="mt-1" min={5} /></div>
              <div><Label className="text-xs">Passing Score (%)</Label><Input type="number" value={newPassing} onChange={(e) => setNewPassing(e.target.value)} className="mt-1" min={1} max={100} /></div>
            </div>
            <div><Label className="text-xs">Scheduled Date (optional)</Label><Input type="datetime-local" value={newScheduled} onChange={(e) => setNewScheduled(e.target.value)} className="mt-1" /></div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button disabled={!newTitle.trim() || !newClassId || !newChapterId || createMutation.isPending} onClick={() => createMutation.mutate()} data-testid="button-confirm-create-test">
                {createMutation.isPending ? "Creating..." : "Create Test"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Add Question Dialog ─── */}
      <Dialog open={addQOpen !== null} onOpenChange={(o) => { if (!o) resetQuestionForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Question</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Question type selector */}
            <div>
              <Label className="text-xs">Question Type</Label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {(["mcq", "multi", "integer"] as QuestionType[]).map((t) => (
                  <button key={t} type="button" onClick={() => { setQType(t); setQCorrect(0); setQCorrectMulti([]); }}
                    className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 text-xs font-medium transition-all ${qType === t ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/30"}`}
                    data-testid={`button-qtype-${t}`}>
                    <span className="text-base">{t === "mcq" ? "🔵" : t === "multi" ? "☑️" : "🔢"}</span>
                    {t === "mcq" ? "MCQ" : t === "multi" ? "Multi-Select" : "Integer"}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {qType === "mcq" && "Single correct option — student picks one answer"}
                {qType === "multi" && "Multiple correct options — student checks all that apply"}
                {qType === "integer" && "Numeric answer — student types a number"}
              </p>
            </div>

            <div>
              <Label className="text-xs">Question *</Label>
              <Textarea value={qText} onChange={(e) => setQText(e.target.value)} rows={2} className="mt-1 resize-none" placeholder="Type your question here..." data-testid="input-question-text" />
            </div>

            {/* Image upload */}
            <div>
              <Label className="text-xs">Question Image (optional)</Label>
              <div className="mt-1">
                {qImageData ? (
                  <div className="relative inline-block">
                    <img src={qImageData} alt="Preview" className="max-h-40 rounded-lg border border-border object-contain" />
                    <button onClick={() => setQImageData(null)} className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-white rounded-full flex items-center justify-center hover:bg-destructive/80"><X size={11} /></button>
                  </div>
                ) : (
                  <button type="button" onClick={() => imgInputRef.current?.click()}
                    className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-dashed border-border hover:border-primary hover:bg-primary/5 transition-colors text-muted-foreground" data-testid="button-upload-image">
                    <ImagePlus size={15} />Upload image (JPG, PNG — max 5MB)
                  </button>
                )}
                <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                <input ref={optionImgInputRef} type="file" accept="image/*" className="hidden" onChange={handleOptionImageUpload} />
              </div>
            </div>

            {/* Options (MCQ and Multi) */}
            {(qType === "mcq" || qType === "multi") && (
              <div className="space-y-2">
                <Label className="text-xs">
                  {qType === "mcq" ? "Options — click circle to mark correct" : "Options — check all correct answers"}
                </Label>
                {qOptions.map((opt, i) => {
                  const isSelected = qType === "mcq" ? qCorrect === i : qCorrectMulti.includes(i);
                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <button type="button"
                          onClick={() => qType === "mcq" ? setQCorrect(i) : toggleMultiOption(i)}
                          className={`flex items-center justify-center shrink-0 transition-colors ${qType === "mcq" ? "w-6 h-6 rounded-full border-2" : "w-6 h-6 rounded border-2"} ${isSelected ? "border-primary bg-primary" : "border-border"}`}
                          data-testid={`button-correct-option-${i}`}>
                          {isSelected && (qType === "mcq"
                            ? <div className="w-2 h-2 rounded-full bg-white" />
                            : <CheckCircle2 size={12} className="text-white" />)}
                        </button>
                        <span className="text-xs font-semibold w-5 shrink-0">{String.fromCharCode(65 + i)}.</span>
                        <Input value={opt} onChange={(e) => { const n = [...qOptions]; n[i] = e.target.value; setQOptions(n); }}
                          placeholder={`Option ${String.fromCharCode(65 + i)}`} className="h-8 text-sm flex-1" data-testid={`input-option-${i}`} />
                        {qOptionImages[i] ? (
                          <div className="relative shrink-0">
                            <img src={qOptionImages[i]!} alt="" className="h-8 w-8 rounded border border-border object-cover" />
                            <button type="button" onClick={() => setQOptionImages((prev) => { const n = [...prev]; n[i] = null; return n; })}
                              className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-destructive text-white rounded-full flex items-center justify-center hover:bg-destructive/80">
                              <X size={8} />
                            </button>
                          </div>
                        ) : (
                          <button type="button"
                            onClick={() => { activeOptIdxRef.current = i; optionImgInputRef.current?.click(); }}
                            className="shrink-0 w-8 h-8 rounded border border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                            title="Add image to this option">
                            <ImagePlus size={13} />
                          </button>
                        )}
                      </div>
                      {qOptionImages[i] && (
                        <div className="pl-[52px]">
                          <img src={qOptionImages[i]!} alt={`Option ${String.fromCharCode(65 + i)}`} className="max-h-24 rounded-lg border border-border object-contain" />
                        </div>
                      )}
                    </div>
                  );
                })}
                {qType === "multi" && qCorrectMulti.length === 0 && (
                  <p className="text-xs text-amber-600">Select at least one correct answer</p>
                )}
              </div>
            )}

            {/* Integer answer */}
            {qType === "integer" && (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs mb-1 block">Answer Type</Label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setQIntegerMode("exact")}
                      className={`flex-1 py-2 px-3 rounded-lg border-2 text-xs font-medium transition-all ${qIntegerMode === "exact" ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/30"}`}
                      data-testid="button-integer-exact">
                      🎯 Exact Answer
                    </button>
                    <button type="button" onClick={() => setQIntegerMode("range")}
                      className={`flex-1 py-2 px-3 rounded-lg border-2 text-xs font-medium transition-all ${qIntegerMode === "range" ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/30"}`}
                      data-testid="button-integer-range">
                      ↔️ Answer Range
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {qIntegerMode === "exact" ? "Student must enter this exact number" : "Any number within the range will be accepted as correct"}
                  </p>
                </div>
                {qIntegerMode === "exact" ? (
                  <div>
                    <Label className="text-xs">Correct Answer *</Label>
                    <Input type="number" value={qCorrectInt} onChange={(e) => setQCorrectInt(e.target.value)}
                      placeholder="e.g. 42" className="mt-1 w-40" data-testid="input-integer-answer" />
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div>
                      <Label className="text-xs">Minimum *</Label>
                      <Input type="number" value={qCorrectIntMin} onChange={(e) => setQCorrectIntMin(e.target.value)}
                        placeholder="e.g. 10" className="mt-1 w-28" data-testid="input-integer-min" />
                    </div>
                    <span className="text-muted-foreground mt-5">—</span>
                    <div>
                      <Label className="text-xs">Maximum *</Label>
                      <Input type="number" value={qCorrectIntMax} onChange={(e) => setQCorrectIntMax(e.target.value)}
                        placeholder="e.g. 20" className="mt-1 w-28" data-testid="input-integer-max" />
                    </div>
                    {qCorrectIntMin && qCorrectIntMax && parseInt(qCorrectIntMin) > parseInt(qCorrectIntMax) && (
                      <p className="text-xs text-destructive mt-5">Min must be ≤ Max</p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="w-32"><Label className="text-xs">Points</Label><Input type="number" value={qPoints} onChange={(e) => setQPoints(e.target.value)} className="mt-1 h-8" min={1} /></div>

            <div className="flex gap-2 justify-end pt-1">
              <Button variant="ghost" onClick={resetQuestionForm}>Cancel</Button>
              <Button disabled={!canSaveQuestion() || addQuestionMutation.isPending}
                onClick={() => addQOpen !== null && addQuestionMutation.mutate(addQOpen)} data-testid="button-save-question">
                {addQuestionMutation.isPending ? "Adding..." : "Add Question"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Analytics Dialog ─── */}
      <Dialog open={analyticsTest !== null || analyticsLoading} onOpenChange={(o) => { if (!o) setAnalyticsTest(null); }}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0">
          {analyticsLoading && (
            <div className="p-8 text-center">
              <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Loading analytics...</p>
            </div>
          )}
          {analyticsTest && !analyticsLoading && (
            <>
              <div className="sticky top-0 z-10 bg-background border-b border-border px-6 py-4">
                <DialogHeader><DialogTitle className="flex items-center gap-2"><BarChart3 size={18} className="text-primary" />Analytics: {analyticsTest.test.title}</DialogTitle></DialogHeader>
              </div>

              <div className="p-6 space-y-6">
                {analyticsTest.total === 0 ? (
                  <div className="text-center py-12">
                    <Users size={40} className="mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">No submissions yet.</p>
                  </div>
                ) : (
                  <>
                    {/* ── Summary Cards ── */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                        <Users size={16} className="mx-auto text-blue-600 mb-1" />
                        <p className="text-2xl font-bold text-blue-700">{analyticsTest.total}</p>
                        <p className="text-xs text-blue-600">Submissions</p>
                      </div>
                      <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                        <Award size={16} className="mx-auto text-green-600 mb-1" />
                        <p className="text-2xl font-bold text-green-700">{analyticsTest.passCount}</p>
                        <p className="text-xs text-green-600">Passed ({Math.round(analyticsTest.passCount / analyticsTest.total * 100)}%)</p>
                      </div>
                      <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-center">
                        <TrendingUp size={16} className="mx-auto text-purple-600 mb-1" />
                        <p className="text-2xl font-bold text-purple-700">{analyticsTest.avgPercentage}%</p>
                        <p className="text-xs text-purple-600">Avg Score</p>
                      </div>
                      <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-center">
                        <Target size={16} className="mx-auto text-orange-600 mb-1" />
                        <p className="text-2xl font-bold text-orange-700">{analyticsTest.test.passingScore}%</p>
                        <p className="text-xs text-orange-600">Passing Mark</p>
                      </div>
                    </div>

                    {/* ── Charts Row ── */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Score Distribution */}
                      <div className="bg-muted/30 rounded-xl p-4">
                        <p className="text-sm font-semibold mb-3 flex items-center gap-1.5"><BarChart3 size={14} className="text-primary" />Score Distribution</p>
                        <ResponsiveContainer width="100%" height={160}>
                          <BarChart data={analyticsTest.scoreDistribution} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="range" tick={{ fontSize: 10 }} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                            <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [v, "Students"]} />
                            <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Pass/Fail Pie */}
                      <div className="bg-muted/30 rounded-xl p-4">
                        <p className="text-sm font-semibold mb-3 flex items-center gap-1.5"><Award size={14} className="text-primary" />Pass vs Fail</p>
                        <ResponsiveContainer width="100%" height={160}>
                          <PieChart>
                            <Pie data={[{ name: "Passed", value: analyticsTest.passCount }, { name: "Failed", value: analyticsTest.failCount }]}
                              cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                              {[0, 1].map((i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                            </Pie>
                            <Tooltip contentStyle={{ fontSize: 12 }} />
                            <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* ── Per-Question Success Rate ── */}
                    <div className="bg-muted/30 rounded-xl p-4">
                      <p className="text-sm font-semibold mb-3 flex items-center gap-1.5"><ListChecks size={14} className="text-primary" />Per-Question Success Rate</p>
                      <ResponsiveContainer width="100%" height={Math.max(140, analyticsTest.perQuestion.length * 36)}>
                        <BarChart data={analyticsTest.perQuestion.map((q, i) => ({ name: `Q${i + 1}`, rate: q.successRate, correct: q.correctCount, total: analyticsTest.total }))}
                          layout="vertical" margin={{ top: 0, right: 40, left: 24, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={28} />
                          <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v, _, p) => [`${v}% (${p.payload.correct}/${p.payload.total})`, "Success Rate"]} />
                          <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                            {analyticsTest.perQuestion.map((q, i) => (
                              <Cell key={i} fill={q.successRate >= 70 ? "#22c55e" : q.successRate >= 40 ? "#f59e0b" : "#ef4444"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      <p className="text-xs text-muted-foreground mt-2">Green ≥70% · Orange 40–69% · Red &lt;40%</p>
                    </div>

                    {/* ── Per-Question Breakdown ── */}
                    <div>
                      <p className="text-sm font-semibold mb-3">Question-by-Question Breakdown</p>
                      <div className="space-y-3">
                        {analyticsTest.perQuestion.map((q, idx) => (
                          <div key={q.id} className="border border-border rounded-xl overflow-hidden">
                            <div className={`px-3 py-2 flex items-start gap-2 ${q.successRate >= 70 ? "bg-green-50" : q.successRate < 40 ? "bg-red-50" : "bg-amber-50"}`}>
                              <span className="text-xs font-bold text-muted-foreground shrink-0 mt-0.5">Q{idx + 1}</span>
                              <p className="text-xs font-medium flex-1 leading-relaxed">{q.question}</p>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium ${q.questionType === "multi" ? "bg-purple-100 text-purple-700" : q.questionType === "integer" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>
                                  {qTypeIcon[q.questionType]}{q.questionType.toUpperCase()}
                                </span>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${q.successRate >= 70 ? "bg-green-100 text-green-700" : q.successRate < 40 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                                  {q.successRate}% correct
                                </span>
                              </div>
                            </div>
                            {q.imageData && (
                              <div className="px-3 pt-2">
                                <img src={q.imageData} alt="Q" className="max-h-32 rounded border border-border object-contain" />
                              </div>
                            )}
                            <div className="p-3 bg-background">
                              {q.questionType === "integer" ? (
                                <div className="flex items-center gap-3 text-xs flex-wrap">
                                  <span className="text-muted-foreground">Correct answer:</span>
                                  {(q.correctAnswerMin !== null && q.correctAnswerMax !== null) ? (
                                    <span className="font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{q.correctAnswerMin} — {q.correctAnswerMax}</span>
                                  ) : (
                                    <span className="font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded">{q.correctAnswer}</span>
                                  )}
                                  <span className="text-muted-foreground">{q.correctCount}/{analyticsTest.total} got it right</span>
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  {q.options.map((opt, i) => {
                                    const isCorrect = q.questionType === "multi" ? (q.correctAnswerMulti ?? []).includes(i) : i === q.correctAnswer;
                                    const pickCount = q.optionCounts[i] ?? 0;
                                    const pct = analyticsTest.total > 0 ? Math.round((pickCount / analyticsTest.total) * 100) : 0;
                                    const optImg = q.optionImages?.[i];
                                    return (
                                      <div key={i} className="flex items-center gap-2">
                                        <span className={`text-xs font-semibold w-5 shrink-0 ${isCorrect ? "text-green-700" : "text-muted-foreground"}`}>{String.fromCharCode(65 + i)}.</span>
                                        <div className={`flex-1 flex items-center gap-1.5 ${isCorrect ? "text-green-700 font-medium" : "text-muted-foreground"}`}>
                                          <span className="text-xs">{opt}</span>
                                          {optImg && <img src={optImg} alt="" className="h-6 w-6 rounded object-cover border border-border/50 shrink-0" />}
                                        </div>
                                        {isCorrect && <CheckCircle2 size={12} className="text-green-600 shrink-0" />}
                                        <div className="w-20 h-4 bg-muted rounded-full overflow-hidden shrink-0">
                                          <div className={`h-full rounded-full ${isCorrect ? "bg-green-500" : "bg-gray-400"}`} style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="text-xs text-muted-foreground w-16 text-right shrink-0">{pct}% ({pickCount})</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* ── Student Leaderboard ── */}
                    <div>
                      <p className="text-sm font-semibold mb-3 flex items-center gap-1.5"><Users size={14} className="text-primary" />Student Results</p>
                      <div className="border border-border rounded-xl overflow-hidden">
                        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-2 bg-muted/50 text-xs text-muted-foreground font-medium">
                          <span>Student</span><span>Score</span><span>%</span><span>Result</span>
                        </div>
                        {[...analyticsTest.submissions].sort((a, b) => b.percentage - a.percentage).map((s) => (
                          <div key={s.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-2.5 border-t border-border items-center hover:bg-muted/20">
                            <div>
                              <p className="text-sm font-medium">{s.studentName}</p>
                              <p className="text-xs text-muted-foreground">@{s.studentUsername}</p>
                            </div>
                            <span className="text-sm font-semibold">{s.score}/{s.totalPoints}</span>
                            <span className={`text-sm font-bold ${s.percentage >= analyticsTest.test.passingScore ? "text-green-600" : "text-red-600"}`}>{s.percentage}%</span>
                            <div>
                              {s.passed
                                ? <span className="flex items-center gap-1 text-xs text-green-600 font-medium"><CheckCircle2 size={12} />Pass</span>
                                : <span className="flex items-center gap-1 text-xs text-red-600 font-medium"><XCircle size={12} />Fail</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5 text-right">Sorted by score (highest first)</p>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
