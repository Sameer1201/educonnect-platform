import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bookmark,
  BookMarked,
  BookOpen,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  Clock3,
  Dna,
  Flag,
  FlaskConical,
  Hash,
  Layers3,
  Lightbulb,
  Palette,
  PlayCircle,
  Search,
  Sparkles,
  Target,
  Trophy,
  Zap,
  Calculator,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { ResponsiveContainer, AreaChart, Area, Tooltip, BarChart, Bar, Cell, XAxis } from "recharts";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type QuestionType = "mcq" | "multi" | "integer";
type Mode = "practice" | "test";

interface QuestionReport {
  id: number;
  reporterName: string;
  reason: string | null;
  status: string;
  createdAt: string;
}

interface QuestionItem {
  id: number;
  question: string;
  questionType: QuestionType;
  options: string[];
  optionImages?: (string | null)[];
  correctAnswer: number | null;
  correctAnswerMulti: number[];
  correctAnswerMin?: number | null;
  correctAnswerMax?: number | null;
  explanation?: string | null;
  difficulty: string;
  points: number;
  imageData?: string | null;
  reportCount: number;
  openReportCount: number;
  reports: QuestionReport[];
  isSaved: boolean;
}

interface ChapterItem {
  id: number;
  title: string;
  targetQuestions?: number | null;
  questions: QuestionItem[];
}

interface SubjectItem {
  id: number;
  title: string;
  teacherName?: string | null;
  chapters: ChapterItem[];
}

interface QuestionBankResponse {
  exam: { key: string; label: string };
  subjects: SubjectItem[];
  savedBucket: QuestionItem[];
}

interface ExamCardItem {
  key: string;
  label: string;
  subjectCount: number;
  chapterCount: number;
  questionCount: number;
  targetQuestionCount?: number;
  pendingQuestionCount?: number;
}

interface ChapterTestState {
  submitted: boolean;
  startedAt: number | null;
  durationSeconds: number;
}

const subjectIconMap: Record<string, typeof Calculator> = {
  aptitude: Calculator,
  mathematics: Calculator,
  math: Calculator,
  technical: Zap,
  physics: FlaskConical,
  chemistry: FlaskConical,
  biology: Dna,
};

function getSubjectIcon(title: string) {
  const normalized = title.toLowerCase();
  const match = Object.entries(subjectIconMap).find(([key]) => normalized.includes(key));
  return match?.[1] ?? BookOpen;
}

function BankActivityTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value ?? 0;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-[0_16px_40px_rgba(15,23,42,0.12)]">
      <p className="text-sm font-extrabold text-slate-950">{label}</p>
      <p className="mt-1 text-xs font-semibold text-slate-500">{value} questions ready</p>
    </div>
  );
}

function isCorrect(question: QuestionItem, answer: number | number[] | string | undefined) {
  if (answer === undefined || answer === null || answer === "") return false;
  if (question.questionType === "multi") {
    const expected = [...question.correctAnswerMulti].sort((a, b) => a - b);
    const selected = Array.isArray(answer) ? [...answer].sort((a, b) => a - b) : [];
    return JSON.stringify(expected) === JSON.stringify(selected);
  }
  if (question.questionType === "integer") {
    const value = Number(answer);
    if (question.correctAnswerMin !== null && question.correctAnswerMin !== undefined) {
      return value >= (question.correctAnswerMin ?? 0) && value <= (question.correctAnswerMax ?? 0);
    }
    return value === question.correctAnswer;
  }
  return Number(answer) === question.correctAnswer;
}

export default function StudentQuestionBank() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [selectedExamKey, setSelectedExamKey] = useState<string>("");
  const [activeSubjectId, setActiveSubjectId] = useState<number | null>(null);
  const [activeChapterId, setActiveChapterId] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("practice");
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [practiceAnswers, setPracticeAnswers] = useState<Record<number, number | number[] | string>>({});
  const [testAnswers, setTestAnswers] = useState<Record<number, number | number[] | string>>({});
  const [chapterTests, setChapterTests] = useState<Record<number, ChapterTestState>>({});
  const [reportingQuestionId, setReportingQuestionId] = useState<number | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [now, setNow] = useState(Date.now());

  const preferredExamKeys = useMemo(() => {
    return [
      user?.subject,
      ...(Array.isArray((user as any)?.additionalExams) ? (user as any).additionalExams : []),
    ]
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""));
  }, [user]);

  const { data: examCards = [] } = useQuery<ExamCardItem[]>({
    queryKey: ["student-question-bank-exams"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/question-bank/exams`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  useEffect(() => {
    if (selectedExamKey || examCards.length === 0) return;
    const preferred = examCards.find((exam) => preferredExamKeys.includes(exam.key)) ?? examCards[0];
    if (preferred) setSelectedExamKey(preferred.key);
  }, [examCards, preferredExamKeys, selectedExamKey]);

  const { data, isLoading } = useQuery<QuestionBankResponse>({
    queryKey: ["student-question-bank", selectedExamKey],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/question-bank/exams/${selectedExamKey}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!selectedExamKey,
  });

  useEffect(() => {
    if (mode !== "test") return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [mode]);

  useEffect(() => {
    setChapterTests({});
    setTestAnswers({});
    setActiveSubjectId(null);
    setActiveChapterId(null);
  }, [selectedExamKey]);

  useEffect(() => {
    if (!data || data.subjects.length === 0) {
      setActiveSubjectId(null);
      setActiveChapterId(null);
      return;
    }
    setActiveSubjectId((prev) => (
      prev && data.subjects.some((subject) => subject.id === prev) ? prev : null
    ));
  }, [data]);

  useEffect(() => {
    if (!data || activeSubjectId == null) {
      setActiveChapterId(null);
      return;
    }
    const subject = data.subjects.find((entry) => entry.id === activeSubjectId);
    if (!subject || subject.chapters.length === 0) {
      setActiveChapterId(null);
      return;
    }
    setActiveChapterId((prev) => (
      prev && subject.chapters.some((chapter) => chapter.id === prev)
        ? prev
        : subject.chapters[0].id
    ));
  }, [data, activeSubjectId]);

  const activeSubject = useMemo(() => {
    if (!data || data.subjects.length === 0 || activeSubjectId == null) return null;
    return data.subjects.find((subject) => subject.id === activeSubjectId) ?? null;
  }, [data, activeSubjectId]);

  const activeChapter = useMemo(() => {
    if (!activeSubject || activeSubject.chapters.length === 0) return null;
    return activeSubject.chapters.find((chapter) => chapter.id === activeChapterId) ?? activeSubject.chapters[0];
  }, [activeSubject, activeChapterId]);

  const activeSubjectStats = useMemo(() => {
    if (!activeSubject) {
      return { uploaded: 0, target: 0, pending: 0 };
    }

    return activeSubject.chapters.reduce((acc, chapter) => {
      const uploaded = chapter.questions.length;
      const target = Math.max(chapter.targetQuestions ?? 0, uploaded);
      acc.uploaded += uploaded;
      acc.target += target;
      acc.pending += Math.max(target - uploaded, 0);
      return acc;
    }, { uploaded: 0, target: 0, pending: 0 });
  }, [activeSubject]);

  const activeChapterStats = useMemo(() => {
    if (!activeChapter) {
      return { uploaded: 0, target: 0, pending: 0 };
    }

    const uploaded = activeChapter.questions.length;
    const target = Math.max(activeChapter.targetQuestions ?? 0, uploaded);
    return {
      uploaded,
      target,
      pending: Math.max(target - uploaded, 0),
    };
  }, [activeChapter]);

  const filteredSubjects = useMemo(() => {
    if (!data) return [];
    const query = searchQuery.trim().toLowerCase();
    if (!query) return data.subjects;
    return data.subjects.filter((subject) => subject.title.toLowerCase().includes(query));
  }, [data, searchQuery]);

  const totalQuestions = useMemo(
    () => data?.subjects.reduce((sum, subject) => sum + subject.chapters.reduce((chapterSum, chapter) => chapterSum + chapter.questions.length, 0), 0) ?? 0,
    [data],
  );

  const completedQuestions = useMemo(
    () =>
      data?.subjects.reduce(
        (sum, subject) =>
          sum +
          subject.chapters.reduce(
            (chapterSum, chapter) =>
              chapterSum +
              chapter.questions.filter((question) => {
                const answer = practiceAnswers[question.id];
                if (question.questionType === "multi") return Array.isArray(answer) && answer.length > 0;
                return answer !== undefined && answer !== null && answer !== "";
              }).length,
            0,
          ),
        0,
      ) ?? 0,
    [data, practiceAnswers],
  );

  const bookmarkedQuestions = useMemo(
    () => data?.savedBucket.length ?? 0,
    [data],
  );

  const subjectPerformance = useMemo(
    () =>
      (data?.subjects ?? []).map((subject) => {
        const questionCount = subject.chapters.reduce((sum, chapter) => sum + chapter.questions.length, 0);
        const answered = subject.chapters.reduce(
          (sum, chapter) =>
            sum +
            chapter.questions.filter((question) => {
              const answer = practiceAnswers[question.id];
              if (question.questionType === "multi") return Array.isArray(answer) && answer.length > 0;
              return answer !== undefined && answer !== null && answer !== "";
            }).length,
          0,
        );
        return {
          id: subject.id,
          name: subject.title,
          shortName: subject.title.length > 14 ? `${subject.title.slice(0, 14)}…` : subject.title,
          questionCount,
          answered,
          progress: questionCount > 0 ? Math.round((answered / questionCount) * 100) : 0,
        };
      }),
    [data, practiceAnswers],
  );

  const difficultyMix = useMemo(() => {
    const counts = { Easy: 0, Medium: 0, Hard: 0 };
    data?.subjects.forEach((subject) => {
      subject.chapters.forEach((chapter) => {
        chapter.questions.forEach((question) => {
          const normalized = question.difficulty.toLowerCase();
          if (normalized.includes("hard") || normalized.includes("tough")) counts.Hard += 1;
          else if (normalized.includes("med")) counts.Medium += 1;
          else counts.Easy += 1;
        });
      });
    });
    return [
      { label: "Easy", value: counts.Easy, color: "#22c55e" },
      { label: "Medium", value: counts.Medium, color: "#8b5cf6" },
      { label: "Hard", value: counts.Hard, color: "#f97316" },
    ];
  }, [data]);

  const topFocusSubject = subjectPerformance.reduce<{ name: string; progress: number; questionCount: number } | null>((best, subject) => {
    if (!best || subject.progress < best.progress) {
      return { name: subject.name, progress: subject.progress, questionCount: subject.questionCount };
    }
    return best;
  }, null);

  const focusSubject = useMemo(() => {
    if (activeSubject) return activeSubject;
    if (!topFocusSubject || !data) return null;
    return data.subjects.find((subject) => subject.title === topFocusSubject.name) ?? null;
  }, [activeSubject, data, topFocusSubject]);

  const focusSubjectStats = useMemo(() => {
    if (!focusSubject) {
      return { uploaded: 0, target: 0, pending: 0 };
    }
    return focusSubject.chapters.reduce((acc, chapter) => {
      const uploaded = chapter.questions.length;
      const target = Math.max(chapter.targetQuestions ?? 0, uploaded);
      acc.uploaded += uploaded;
      acc.target += target;
      acc.pending += Math.max(target - uploaded, 0);
      return acc;
    }, { uploaded: 0, target: 0, pending: 0 });
  }, [focusSubject]);

  const recommendedChapters = useMemo(() => {
    if (!data) return [];
    return data.subjects
      .flatMap((subject) =>
        subject.chapters.map((chapter) => {
          const uploaded = chapter.questions.length;
          const target = Math.max(chapter.targetQuestions ?? 0, uploaded);
          const pending = Math.max(target - uploaded, 0);
          const status = pending > 0 ? (pending > 10 ? "High priority" : "Revision") : "Ready";
          return {
            id: chapter.id,
            subjectTitle: subject.title,
            chapterTitle: chapter.title,
            pending,
            uploaded,
            status,
          };
        }),
      )
      .sort((a, b) => {
        if (b.pending !== a.pending) return b.pending - a.pending;
        return b.uploaded - a.uploaded;
      })
      .slice(0, 3);
  }, [data]);

  const saveQuestionMutation = useMutation({
    mutationFn: async (questionId: number) => {
      const r = await fetch(`${BASE}/api/question-bank-questions/${questionId}/save`, { method: "POST", credentials: "include" });
      if (!r.ok) throw new Error("Failed to save question");
      return r.json();
    },
    onSuccess: (payload) => {
      queryClient.invalidateQueries({ queryKey: ["student-question-bank", selectedExamKey] });
      toast({ title: payload.saved ? "Saved to bucket" : "Removed from bucket" });
    },
    onError: () => toast({ title: "Could not update bucket", variant: "destructive" }),
  });

  const reportQuestionMutation = useMutation({
    mutationFn: async ({ questionId, reason }: { questionId: number; reason: string }) => {
      const r = await fetch(`${BASE}/api/question-bank-questions/${questionId}/report`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!r.ok) {
        const payload = await r.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to report question");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-question-bank", selectedExamKey] });
      setReportingQuestionId(null);
      setReportReason("");
      toast({ title: "Question reported", description: "This has been sent to the corresponding teacher." });
    },
    onError: (err: Error) => toast({ title: "Could not report question", description: err.message, variant: "destructive" }),
  });

  const setAnswer = (
    store: "practice" | "test",
    question: QuestionItem,
    value: number | number[] | string,
  ) => {
    const setter = store === "practice" ? setPracticeAnswers : setTestAnswers;
    setter((prev) => ({ ...prev, [question.id]: value }));
  };

  const toggleReveal = (questionId: number) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      next.has(questionId) ? next.delete(questionId) : next.add(questionId);
      return next;
    });
  };

  const getChapterDurationSeconds = (chapter: ChapterItem) => Math.max(300, chapter.questions.length * 75);

  const getChapterState = (chapter: ChapterItem): ChapterTestState => {
    return chapterTests[chapter.id] ?? {
      submitted: false,
      startedAt: null,
      durationSeconds: getChapterDurationSeconds(chapter),
    };
  };

  const startChapterTest = (chapter: ChapterItem) => {
    setChapterTests((prev) => ({
      ...prev,
      [chapter.id]: {
        ...getChapterState(chapter),
        startedAt: Date.now(),
        submitted: false,
      },
    }));
  };

  const submitChapterTest = (chapterId: number) => {
    setChapterTests((prev) => {
      const current = prev[chapterId];
      return {
        ...prev,
        [chapterId]: {
          submitted: true,
          startedAt: current?.startedAt ?? Date.now(),
          durationSeconds: current?.durationSeconds ?? 300,
        },
      };
    });
  };

  const getRemainingSeconds = (chapter: ChapterItem) => {
    const state = getChapterState(chapter);
    if (!state.startedAt || state.submitted) return state.durationSeconds;
    const elapsed = Math.floor((now - state.startedAt) / 1000);
    return Math.max(0, state.durationSeconds - elapsed);
  };

  const formatSeconds = (value: number) => {
    const minutes = Math.floor(value / 60);
    const seconds = value % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  useEffect(() => {
    if (!data || mode !== "test") return;
    data.subjects.forEach((subject) => {
      subject.chapters.forEach((chapter) => {
        const state = getChapterState(chapter);
        if (state.startedAt && !state.submitted && getRemainingSeconds(chapter) === 0) {
          submitChapterTest(chapter.id);
        }
      });
    });
  }, [data, mode, now]);

  const countAnswered = (chapter: ChapterItem) => {
    return chapter.questions.filter((question) => {
      const value = testAnswers[question.id];
      if (question.questionType === "multi") return Array.isArray(value) && value.length > 0;
      return value !== undefined && value !== null && value !== "";
    }).length;
  };

  const renderQuestionCard = (question: QuestionItem, store: "practice" | "test", chapterTestSubmitted = false) => {
    const answers = store === "practice" ? practiceAnswers : testAnswers;
    const answer = answers[question.id];
    const showSolution = store === "practice" && revealed.has(question.id);
    const shouldShowResult = store === "test" && chapterTestSubmitted;

    return (
      <div key={question.id} className="rounded-lg border border-border p-3 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline">
                {question.questionType === "multi" ? <CheckSquare size={12} className="mr-1" /> : question.questionType === "integer" ? <Hash size={12} className="mr-1" /> : <Target size={12} className="mr-1" />}
                {question.questionType}
              </Badge>
              <Badge variant="secondary">{question.difficulty}</Badge>
              <Badge variant="outline">{question.points} pts</Badge>
              {question.isSaved && <Badge variant="outline">Saved</Badge>}
            </div>
            <p className="text-sm font-medium">{question.question}</p>
            {question.imageData && <img src={question.imageData} alt="" className="max-h-56 rounded-lg border object-contain bg-muted/20" />}
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Button className="w-full sm:w-auto" size="sm" variant="outline" onClick={() => saveQuestionMutation.mutate(question.id)}>
              <Bookmark size={13} className="mr-1" /> {question.isSaved ? "Saved" : "Save"}
            </Button>
            <Button className="w-full sm:w-auto" size="sm" variant="outline" onClick={() => setReportingQuestionId(question.id)}>
              <Flag size={13} className="mr-1" /> Report
            </Button>
          </div>
        </div>

        {question.questionType !== "integer" ? (
          <div className="grid gap-2 md:grid-cols-2">
            {question.options.map((option, index) => {
              const isSelected = question.questionType === "multi"
                ? Array.isArray(answer) && answer.includes(index)
                : Number(answer) === index;
              const isCorrectOption = question.questionType === "multi"
                ? question.correctAnswerMulti.includes(index)
                : question.correctAnswer === index;
              const shouldHighlight = (showSolution || shouldShowResult) && isCorrectOption;
              const isWrongSelection = (showSolution || shouldShowResult) && isSelected && !isCorrectOption;
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => {
                    if (store === "test" && shouldShowResult) return;
                    if (question.questionType === "multi") {
                      const current = Array.isArray(answer) ? answer : [];
                      setAnswer(store, question, current.includes(index) ? current.filter((item) => item !== index) : [...current, index]);
                    } else {
                      setAnswer(store, question, index);
                    }
                  }}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    shouldHighlight ? "border-green-500 bg-green-50 dark:bg-green-950/20" :
                    isWrongSelection ? "border-red-500 bg-red-50 dark:bg-red-950/20" :
                    isSelected ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"
                  }`}
                >
                  <span className="font-medium mr-2">{String.fromCharCode(65 + index)}.</span>{option}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            <Input
              value={typeof answer === "string" ? answer : answer !== undefined ? String(answer) : ""}
              onChange={(e) => {
                if (store === "test" && shouldShowResult) return;
                setAnswer(store, question, e.target.value);
              }}
              placeholder="Type integer answer"
            />
          </div>
        )}

        {store === "practice" && (
          <div className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="w-full sm:w-auto" size="sm" variant="outline" onClick={() => toggleReveal(question.id)}>
                {showSolution ? "Hide Solution" : "Check Answer"}
              </Button>
            </div>
            {showSolution && (
              <div className={`rounded-lg border p-3 text-sm ${isCorrect(question, answer) ? "border-green-500 bg-green-50 dark:bg-green-950/20" : "border-amber-400 bg-amber-50 dark:bg-amber-950/20"}`}>
                <p className="font-medium flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-green-600" />
                  {isCorrect(question, answer) ? "Correct" : "Review this answer"}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {question.questionType === "integer"
                    ? `Expected answer: ${question.correctAnswerMin !== null && question.correctAnswerMin !== undefined ? `${question.correctAnswerMin} to ${question.correctAnswerMax}` : question.correctAnswer}`
                    : "Correct option(s) highlighted above."}
                </p>
                {question.explanation && <p className="mt-2">{question.explanation}</p>}
              </div>
            )}
          </div>
        )}

        {store === "test" && (
          <div className="flex gap-2">
            {shouldShowResult && (
              <div className={`rounded-lg border px-3 py-2 text-sm ${isCorrect(question, answer) ? "border-green-500 bg-green-50 dark:bg-green-950/20" : "border-red-500 bg-red-50 dark:bg-red-950/20"}`}>
                {isCorrect(question, answer) ? "Correct in test mode" : "Wrong in test mode"}
              </div>
            )}
          </div>
        )}

        {reportingQuestionId === question.id && (
          <div className="rounded-lg border border-border p-3 space-y-2">
            <Label className="text-xs">Why are you reporting this question?</Label>
            <Textarea value={reportReason} onChange={(e) => setReportReason(e.target.value)} rows={3} placeholder="Wrong answer, typo, unclear wording, duplicate, etc." />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="w-full sm:w-auto" size="sm" onClick={() => reportQuestionMutation.mutate({ questionId: question.id, reason: reportReason })} disabled={reportQuestionMutation.isPending}>
                Send Report
              </Button>
              <Button className="w-full sm:w-auto" size="sm" variant="ghost" onClick={() => setReportingQuestionId(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderChapterWorkspace = (chapter: ChapterItem) => (
    <div className="space-y-3">
      {chapter.questions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No questions yet.</p>
      ) : (
        <>
          {mode === "test" && (
            <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline"><Clock3 size={12} className="mr-1" />Timer {formatSeconds(getRemainingSeconds(chapter))}</Badge>
                  <Badge variant="secondary">{countAnswered(chapter)}/{chapter.questions.length} answered</Badge>
                  <Badge variant="outline"><Palette size={12} className="mr-1" />Question Palette</Badge>
                </div>
                {!getChapterState(chapter).startedAt && !getChapterState(chapter).submitted ? (
                  <Button className="w-full sm:w-auto" size="sm" onClick={() => startChapterTest(chapter)}>Start Test</Button>
                ) : !getChapterState(chapter).submitted ? (
                  <Button className="w-full sm:w-auto" size="sm" onClick={() => submitChapterTest(chapter.id)}>Submit Test</Button>
                ) : (
                  <Badge variant="outline">Submitted</Badge>
                )}
              </div>
              <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2">
                {chapter.questions.map((question, index) => {
                  const value = testAnswers[question.id];
                  const isAnswered = question.questionType === "multi"
                    ? Array.isArray(value) && value.length > 0
                    : value !== undefined && value !== null && value !== "";
                  const isSubmitted = getChapterState(chapter).submitted;
                  const isCorrectlyAnswered = isSubmitted && isCorrect(question, value);
                  const isWrongAnswered = isSubmitted && isAnswered && !isCorrect(question, value);
                  return (
                    <div
                      key={question.id}
                      className={`flex h-9 items-center justify-center rounded-lg border text-xs font-semibold ${
                        isCorrectlyAnswered ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950/20" :
                        isWrongAnswered ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-950/20" :
                        isAnswered ? "border-primary bg-primary/10 text-primary" :
                        "border-border bg-background text-muted-foreground"
                      }`}
                    >
                      {index + 1}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Difficulty is shown on every question. Start the chapter test to begin the timer, then submit once at the end.
              </p>
            </div>
          )}
          {chapter.questions.map((item) => renderQuestionCard(item, mode, getChapterState(chapter).submitted))}
          {mode === "test" && getChapterState(chapter).startedAt && !getChapterState(chapter).submitted && (
            <div className="flex justify-stretch pt-2 sm:justify-end">
              <Button className="w-full sm:w-auto" onClick={() => submitChapterTest(chapter.id)}>
                Final Submit Test
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="h-full overflow-y-auto bg-[#f6f7fb] p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-violet-700 shadow-sm">
            <Sparkles className="h-3.5 w-3.5" />
            Smart Question Bank
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">Question cockpit</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Search by subject, pick a mode, and jump straight into the right chapter.
          </p>
        </div>
        <div className="flex h-11 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
            {[
              { label: "Practice Mode", icon: Layers3, value: "practice" as const },
              { label: "Test Mode", icon: Trophy, value: "test" as const },
            ].map((entry) => {
              const Icon = entry.icon;
              const active = mode === entry.value;
              return (
                <button
                  key={entry.value}
                  type="button"
                  onClick={() => setMode(entry.value)}
                  className={`flex min-w-[118px] items-center justify-center gap-2 rounded-[14px] px-4 text-xs font-bold transition ${
                    active
                      ? "bg-violet-600 text-white shadow-[0_10px_22px_rgba(99,102,241,0.28)]"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {entry.label}
                </button>
              );
            })}
          </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <section className="overflow-hidden rounded-[28px] border border-violet-100 bg-gradient-to-br from-violet-700 via-indigo-700 to-slate-950 p-5 text-white shadow-[0_22px_55px_rgba(79,70,229,0.24)]">
            <div className="grid gap-5 lg:grid-cols-[1fr_260px] lg:items-center">
              <div>
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/12 ring-1 ring-white/20">
                  <Target className="h-5 w-5 text-cyan-200" />
                </div>
                <h2 className="text-2xl font-extrabold leading-tight">Today’s focus plan</h2>
                <p className="mt-2 max-w-xl text-sm font-medium leading-6 text-violet-100">
                  Build momentum with saved questions first, then move into timed chapter practice for sharper recall.
                </p>
                <div className="mt-5 grid grid-cols-3 gap-3">
                  <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/10">
                    <p className="text-lg font-extrabold">{totalQuestions.toLocaleString()}</p>
                    <p className="text-[11px] font-semibold text-violet-100">Questions</p>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/10">
                    <p className="text-lg font-extrabold">{totalQuestions > 0 ? Math.round((completedQuestions / totalQuestions) * 100) : 0}%</p>
                    <p className="text-[11px] font-semibold text-violet-100">Solved</p>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/10">
                    <p className="text-lg font-extrabold">{bookmarkedQuestions}</p>
                    <p className="text-[11px] font-semibold text-violet-100">Bucket</p>
                  </div>
                </div>
              </div>
              <div className="rounded-[24px] bg-white p-4 text-slate-950 shadow-[0_18px_45px_rgba(15,23,42,0.22)]">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Focus subject</p>
                    <p className="text-xl font-extrabold">{focusSubject?.title ?? topFocusSubject?.name ?? "Question Bank"}</p>
                  </div>
                  <div className="rounded-full bg-violet-50 px-3 py-1 text-xs font-extrabold text-violet-700">
                    {focusSubject ? Math.min(Math.round((focusSubjectStats.uploaded / Math.max(focusSubjectStats.target || focusSubjectStats.uploaded, 1)) * 100), 100) : (topFocusSubject?.progress ?? 0)}% ready
                  </div>
                </div>
                <div className="grid grid-cols-[82px_1fr] gap-3">
                  <div className="space-y-2">
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xl font-extrabold">{focusSubjectStats.uploaded}</p>
                      <p className="text-[10px] font-bold text-slate-500">Uploaded</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xl font-extrabold">{focusSubjectStats.pending}</p>
                      <p className="text-[10px] font-bold text-slate-500">Pending</p>
                    </div>
                  </div>
                  <div className="h-36" data-testid="chart-question-bank-activity">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={subjectPerformance.length ? subjectPerformance : [{ name: "—", questionCount: 0 }]} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="questionBankActivityFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <Tooltip content={<BankActivityTooltip />} cursor={{ stroke: "#8b5cf6", strokeWidth: 1 }} />
                        <Area type="monotone" dataKey="questionCount" stroke="#7c3aed" strokeWidth={3} fill="url(#questionBankActivityFill)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Practice Library</p>
                <h2 className="mt-2 text-2xl font-extrabold text-slate-950">Find your subject quickly</h2>
              </div>
              <div className="relative w-full lg:max-w-xs">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search subjects"
                  className="h-11 rounded-2xl border-slate-200 bg-slate-50 pl-11 text-sm"
                />
              </div>
            </div>

            {examCards.length > 1 && (
              <div className="mb-5 flex gap-3 overflow-x-auto pb-1">
                {examCards.map((exam) => {
                  const examTarget = Math.max(exam.targetQuestionCount ?? 0, exam.questionCount);
                  const examPending = Math.max(exam.pendingQuestionCount ?? (examTarget - exam.questionCount), 0);
                  const active = selectedExamKey === exam.key;
                  return (
                    <button
                      key={exam.key}
                      type="button"
                      onClick={() => setSelectedExamKey(exam.key)}
                      className={`min-w-[230px] rounded-[24px] border px-4 py-4 text-left transition ${
                        active
                          ? "border-violet-200 bg-violet-50 shadow-[0_18px_45px_rgba(99,102,241,0.14)]"
                          : "border-slate-200 bg-slate-50/80 hover:border-violet-200 hover:bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-base font-semibold text-slate-950">{exam.label}</p>
                          <p className="mt-1 text-xs text-slate-500">{exam.subjectCount} subjects • {exam.chapterCount} chapters</p>
                        </div>
                        {active && <Badge variant="secondary">Active</Badge>}
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full rounded-full bg-violet-600" style={{ width: `${examTarget > 0 ? Math.min((exam.questionCount / examTarget) * 100, 100) : 100}%` }} />
                      </div>
                      <p className="mt-2 text-[11px] font-medium text-slate-500">Uploaded {exam.questionCount} • Pending {examPending}</p>
                    </button>
                  );
                })}
              </div>
            )}

            {!selectedExamKey ? (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-sm text-slate-500">
                We are loading your question bank.
              </div>
            ) : isLoading ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[...Array(3)].map((_, i) => <div key={i} className="h-48 animate-pulse rounded-[24px] bg-slate-100" />)}
              </div>
            ) : !data || data.subjects.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-sm text-slate-500">
                No question bank content found yet.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredSubjects.map((subject, idx) => {
                  const Icon = getSubjectIcon(subject.title);
                  const questionCount = subject.chapters.reduce((sum, chapter) => sum + chapter.questions.length, 0);
                  const targetCount = subject.chapters.reduce((sum, chapter) => sum + Math.max(chapter.targetQuestions ?? 0, chapter.questions.length), 0);
                  const pendingCount = Math.max(targetCount - questionCount, 0);
                  const progress = targetCount > 0 ? Math.min((questionCount / targetCount) * 100, 100) : 100;
                  const active = activeSubject?.id === subject.id;
                  return (
                    <button
                      key={subject.id}
                      type="button"
                      onClick={() => setActiveSubjectId(subject.id)}
                      className={`rounded-[28px] border bg-white p-6 text-left transition-all hover:-translate-y-1 hover:border-violet-200 hover:shadow-[0_18px_45px_rgba(99,102,241,0.12)] ${
                        active ? "border-violet-200 shadow-[0_18px_45px_rgba(99,102,241,0.12)]" : "border-slate-200"
                      }`}
                      style={{ animationDelay: `${idx * 60}ms` }}
                    >
                      <div className="mb-6 flex items-start justify-between gap-4">
                        <div className="rounded-2xl bg-violet-50 p-3 text-violet-600">
                          <Icon className="h-6 w-6" />
                        </div>
                        <ChevronRight className="h-5 w-5 text-slate-400" />
                      </div>
                      <h3 className="text-xl font-bold text-slate-950">{subject.title}</h3>
                      <p className="mt-2 text-sm text-slate-500">
                        {subject.teacherName ? `Practice set curated by ${subject.teacherName}.` : "Open chapters and solve questions."}
                      </p>
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-slate-50 px-3 py-3">
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Chapters</p>
                          <p className="mt-2 text-lg font-extrabold text-slate-950">{subject.chapters.length}</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 px-3 py-3">
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Questions</p>
                          <p className="mt-2 text-lg font-extrabold text-slate-950">{questionCount}</p>
                        </div>
                      </div>
                      <div className="mt-4 space-y-2">
                        <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                          <span>{progress}% ready</span>
                          <span>{pendingCount} pending</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-5">
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Weekly Mix</p>
                <h3 className="mt-2 text-xl font-extrabold text-slate-950">Difficulty balance</h3>
              </div>
              <div className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">
                {difficultyMix.reduce((sum, item) => sum + item.value, 0)} total
              </div>
            </div>
            <div className="h-56" data-testid="chart-question-bank-difficulty">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={difficultyMix} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12, fontWeight: 700 }} />
                  <Tooltip cursor={{ fill: "rgba(148,163,184,0.08)" }} />
                  <Bar dataKey="value" radius={[14, 14, 6, 6]}>
                    {difficultyMix.map((entry) => (
                      <Cell key={entry.label} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {difficultyMix.map((entry) => (
                <div key={entry.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-center">
                  <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400">{entry.label}</p>
                  <p className="mt-2 text-lg font-extrabold text-slate-950">{entry.value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-slate-950">Recommended next</h3>
                <p className="text-xs font-semibold text-slate-500">Jump into the next best chapter</p>
              </div>
              <BookMarked className="h-5 w-5 text-violet-500" />
            </div>
            <div className="space-y-3">
              {recommendedChapters.length > 0 ? (
                recommendedChapters.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="flex w-full items-center justify-between rounded-2xl bg-slate-50 px-3 py-3 text-left transition-colors hover:bg-violet-50"
                    onClick={() => {
                      const subject = data?.subjects.find((entry) => entry.title === item.subjectTitle);
                      if (!subject) return;
                      setActiveSubjectId(subject.id);
                      setActiveChapterId(item.id);
                    }}
                  >
                    <span>
                      <span className="block text-sm font-extrabold text-slate-950">{item.chapterTitle}</span>
                      <span className="block text-xs font-semibold text-slate-500">{item.subjectTitle}</span>
                    </span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-extrabold text-violet-700 shadow-sm">
                      {item.status}
                    </span>
                  </button>
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 py-10 text-center">
                  <BookOpen className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-3 text-sm font-medium text-slate-500">Recommendations will appear here once chapters are available.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {activeSubject && (
        <section className="mt-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Chapter Library</p>
              <h2 className="mt-2 text-2xl font-extrabold text-slate-950">{activeSubject.title}</h2>
              <p className="mt-1 text-sm text-slate-500">
                Uploaded {activeSubjectStats.uploaded} • Target {activeSubjectStats.target} • Pending {activeSubjectStats.pending}
              </p>
            </div>
            <Badge variant="outline" className="w-fit gap-1 rounded-full border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700">
              {mode === "practice" ? <PlayCircle size={12} className="mr-1" /> : <Target size={12} className="mr-1" />}
              {mode === "practice" ? "Practice Mode" : "Test Mode"}
            </Badge>
          </div>

          {activeSubject.chapters.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-sm text-slate-500">
              No chapters available in this subject yet.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {activeSubject.chapters.map((chapter, idx) => {
                const uploaded = chapter.questions.length;
                const target = Math.max(chapter.targetQuestions ?? 0, uploaded);
                const pending = Math.max(target - uploaded, 0);
                const chapterProgress = target > 0 ? Math.min((uploaded / target) * 100, 100) : 100;
                const active = activeChapter?.id === chapter.id;
                return (
                  <button
                    key={chapter.id}
                    type="button"
                    onClick={() => setActiveChapterId(chapter.id)}
                    className={`rounded-[26px] border bg-white p-5 text-left transition-all hover:-translate-y-1 hover:border-violet-200 hover:shadow-[0_18px_45px_rgba(99,102,241,0.12)] ${
                      active ? "border-violet-200 shadow-[0_18px_45px_rgba(99,102,241,0.12)]" : "border-slate-200"
                    }`}
                    style={{ animationDelay: `${idx * 60}ms` }}
                  >
                    <div className="mb-6 flex items-start justify-between gap-4">
                      <div className="rounded-2xl bg-violet-50 p-3 text-violet-600">
                        <BookOpen className="h-5 w-5" />
                      </div>
                      <ChevronRight className="h-5 w-5 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-950">{chapter.title}</h3>
                    <p className="mt-2 text-sm text-slate-500">{uploaded} ready • {pending} pending</p>
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                        <span>{target} target</span>
                        <span>{chapterProgress}% ready</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${chapterProgress}%` }} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {activeChapter && (
        <section className="mt-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Chapter Workspace</p>
              <h2 className="mt-2 text-2xl font-extrabold text-slate-950">{activeChapter.title}</h2>
              <p className="mt-1 text-sm text-slate-500">All questions for {activeSubject?.title}.</p>
            </div>
            <Badge variant="secondary" className="w-fit rounded-full px-3 py-1.5">
              {activeChapterStats.uploaded} uploaded / {activeChapterStats.target} target
            </Badge>
          </div>
          {renderChapterWorkspace(activeChapter)}
        </section>
      )}
    </div>
  );
}
