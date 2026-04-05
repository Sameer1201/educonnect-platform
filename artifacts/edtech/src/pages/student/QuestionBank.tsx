import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useListClasses } from "@workspace/api-client-react";
import {
  Bookmark,
  BookOpen,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Clock3,
  Flag,
  Hash,
  Palette,
  PlayCircle,
  Target,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

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
  questions: QuestionItem[];
}

interface SubjectItem {
  id: number;
  title: string;
  teacherName?: string | null;
  chapters: ChapterItem[];
}

interface QuestionBankResponse {
  class: { id: number; title: string; subject: string };
  subjects: SubjectItem[];
  savedBucket: QuestionItem[];
}

interface ChapterTestState {
  submitted: boolean;
  startedAt: number | null;
  durationSeconds: number;
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
  const { data: classes = [] } = useListClasses();
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [expandedSubjects, setExpandedSubjects] = useState<Set<number>>(new Set());
  const [expandedChapters, setExpandedChapters] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<Mode>("practice");
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [practiceAnswers, setPracticeAnswers] = useState<Record<number, number | number[] | string>>({});
  const [testAnswers, setTestAnswers] = useState<Record<number, number | number[] | string>>({});
  const [chapterTests, setChapterTests] = useState<Record<number, ChapterTestState>>({});
  const [reportingQuestionId, setReportingQuestionId] = useState<number | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [now, setNow] = useState(Date.now());
  const bucketRef = useRef<HTMLDivElement | null>(null);

  const classOptions = useMemo(() => classes.filter((cls: any) => cls.isEnrolled), [classes]);

  const { data, isLoading } = useQuery<QuestionBankResponse>({
    queryKey: ["student-question-bank", selectedClassId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/question-bank/classes/${selectedClassId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!selectedClassId,
  });

  useEffect(() => {
    if (mode !== "test") return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [mode]);

  useEffect(() => {
    setChapterTests({});
    setTestAnswers({});
  }, [selectedClassId]);

  const saveQuestionMutation = useMutation({
    mutationFn: async (questionId: number) => {
      const r = await fetch(`${BASE}/api/question-bank-questions/${questionId}/save`, { method: "POST", credentials: "include" });
      if (!r.ok) throw new Error("Failed to save question");
      return r.json();
    },
    onSuccess: (payload) => {
      queryClient.invalidateQueries({ queryKey: ["student-question-bank", selectedClassId] });
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
      queryClient.invalidateQueries({ queryKey: ["student-question-bank", selectedClassId] });
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
        <div className="flex items-start justify-between gap-3">
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
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => saveQuestionMutation.mutate(question.id)}>
              <Bookmark size={13} className="mr-1" /> {question.isSaved ? "Saved" : "Save"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setReportingQuestionId(question.id)}>
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
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => toggleReveal(question.id)}>
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
            <div className="flex gap-2">
              <Button size="sm" onClick={() => reportQuestionMutation.mutate({ questionId: question.id, reason: reportReason })} disabled={reportQuestionMutation.isPending}>
                Send Report
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setReportingQuestionId(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><BookOpen size={22} className="text-primary" />Question Bank</h1>
          <p className="text-muted-foreground text-sm mt-1">Select `Practice Mode` or `Test Mode`, report any question, and save useful questions into your bucket.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => bucketRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
            <Bookmark size={14} className="mr-2" />
            Bucket{data?.savedBucket?.length ? ` (${data.savedBucket.length})` : ""}
          </Button>
          <div className="flex rounded-xl border border-border p-1">
            <button type="button" onClick={() => setMode("practice")} className={`px-4 py-2 text-sm rounded-lg ${mode === "practice" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
              Practice Mode
            </button>
            <button type="button" onClick={() => setMode("test")} className={`px-4 py-2 text-sm rounded-lg ${mode === "test" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
              Test Mode
            </button>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <Label className="text-xs">Select Enrolled Batch</Label>
          <select value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)} className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Select batch</option>
            {classOptions.map((cls: any) => (
              <option key={cls.id} value={cls.id}>{cls.title}</option>
            ))}
          </select>
        </CardContent>
      </Card>

      <div ref={bucketRef}>
      {data && data.savedBucket.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bookmark size={16} className="text-primary" />Saved Question Bucket</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {data.savedBucket.map((question) => (
              <div key={question.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{question.question}</p>
                  <Button size="sm" variant="outline" onClick={() => saveQuestionMutation.mutate(question.id)}>Remove</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      </div>

      {!selectedClassId ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Select your batch to open its question bank.</CardContent></Card>
      ) : isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : !data || data.subjects.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No question bank content found for this batch.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {data.subjects.map((subject) => {
            const subjectOpen = expandedSubjects.has(subject.id);
            return (
              <Card key={subject.id}>
                <CardHeader className="py-4">
                  <button className="flex items-center gap-3 text-left" onClick={() => setExpandedSubjects((prev) => {
                    const next = new Set(prev); next.has(subject.id) ? next.delete(subject.id) : next.add(subject.id); return next;
                  })}>
                    {subjectOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <CardTitle className="text-base">{subject.title}</CardTitle>
                    {subject.teacherName && <Badge variant="outline">{subject.teacherName}</Badge>}
                  </button>
                </CardHeader>
                {subjectOpen && (
                  <CardContent className="space-y-3">
                    {subject.chapters.map((chapter) => {
                      const chapterOpen = expandedChapters.has(chapter.id);
                      return (
                        <div key={chapter.id} className="rounded-xl border border-border overflow-hidden">
                          <button className="w-full flex items-center gap-3 p-3 text-left bg-muted/30" onClick={() => setExpandedChapters((prev) => {
                            const next = new Set(prev); next.has(chapter.id) ? next.delete(chapter.id) : next.add(chapter.id); return next;
                          })}>
                            {chapterOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                            <span className="font-medium text-sm">{chapter.title}</span>
                            <Badge variant="secondary">{chapter.questions.length} questions</Badge>
                            <Badge variant="outline" className="ml-auto">{mode === "practice" ? <PlayCircle size={12} className="mr-1" /> : <Target size={12} className="mr-1" />}{mode}</Badge>
                          </button>
                          {chapterOpen && (
                            <div className="p-3 space-y-3">
                              {chapter.questions.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No questions yet.</p>
                              ) : (
                                <>
                                  {mode === "test" && (
                                    <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-3">
                                      <div className="flex items-center justify-between gap-3 flex-wrap">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <Badge variant="outline"><Clock3 size={12} className="mr-1" />Timer {formatSeconds(getRemainingSeconds(chapter))}</Badge>
                                          <Badge variant="secondary">{countAnswered(chapter)}/{chapter.questions.length} answered</Badge>
                                          <Badge variant="outline"><Palette size={12} className="mr-1" />Question Palette</Badge>
                                        </div>
                                        {!getChapterState(chapter).startedAt && !getChapterState(chapter).submitted ? (
                                          <Button size="sm" onClick={() => startChapterTest(chapter)}>Start Test</Button>
                                        ) : !getChapterState(chapter).submitted ? (
                                          <Button size="sm" onClick={() => submitChapterTest(chapter.id)}>Submit Test</Button>
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
                                    <div className="flex justify-end pt-2">
                                      <Button onClick={() => submitChapterTest(chapter.id)}>
                                        Final Submit Test
                                      </Button>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
