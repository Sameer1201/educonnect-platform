import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Sparkles, Tag, Trophy, XCircle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import { RichQuestionContent } from "@/components/ui/rich-question-content";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { isStudentPendingVerification } from "@/lib/student-access";
import {
  applyPendingPreviewLocksToExam,
  formatDifficultyLabel,
  getQuestionAttempted,
  getQuestionDifficultyTone,
  getQuestionSolved,
  type QuestionType,
  type StudentQuestionBankQuestion,
  useStudentQuestionBankExam,
} from "@/pages/student/question-bank/api";

function isPreviewAnswerCorrect(questionType: QuestionType, answer: number | number[] | string, question: StudentQuestionBankQuestion) {
  if (questionType === "integer") {
    const normalized = String(answer).trim();
    if (question.correctAnswerMin != null && question.correctAnswerMax != null) {
      const parsed = Number(normalized);
      return Number.isFinite(parsed) && parsed >= question.correctAnswerMin && parsed <= question.correctAnswerMax;
    }
    return normalized === String(question.correctAnswer ?? "");
  }

  if (questionType === "multi") {
    const picked = [...(Array.isArray(answer) ? answer : [])].sort((left, right) => left - right);
    const expected = [...(question.correctAnswerMulti ?? [])].sort((left, right) => left - right);
    return picked.length === expected.length && picked.every((value, index) => value === expected[index]);
  }

  return Number(answer) === (question.correctAnswer ?? -1);
}

const CHEER_STREAK_MILESTONES = new Set([3, 5, 10]);

function getCorrectStreakTillQuestion(questions: StudentQuestionBankQuestion[], currentIndex: number, currentAttemptIsCorrect: boolean) {
  if (currentIndex < 0 || !currentAttemptIsCorrect) return 0;

  let streak = 0;
  for (let index = currentIndex; index >= 0; index -= 1) {
    const isCorrect = index === currentIndex ? currentAttemptIsCorrect : Boolean(questions[index]?.progress?.lastIsCorrect);
    if (!isCorrect) break;
    streak += 1;
  }

  return streak;
}

function getCheerCopy(streak: number) {
  if (streak === 10) {
    return {
      title: "10 in a row",
      description: "Brilliant streak. You are on fire.",
    };
  }

  if (streak === 5) {
    return {
      title: "5 in a row",
      description: "Great momentum. Keep the run going.",
    };
  }

  return {
    title: "3 in a row",
    description: "Nice streak. Keep it up.",
  };
}

export default function StudentQuestionBankQuestionPage() {
  const { examId, subjectId, chapterId, questionId } = useParams<{ examId: string; subjectId: string; chapterId: string; questionId: string }>();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const isPreviewMode = isStudentPendingVerification(user);
  const { data: liveData, isLoading } = useStudentQuestionBankExam(examId);
  const data = useMemo(() => {
    if (!liveData) return null;
    return isPreviewMode ? applyPendingPreviewLocksToExam(liveData) : liveData;
  }, [isPreviewMode, liveData]);
  const [selected, setSelected] = useState<number | null>(null);
  const [selectedMulti, setSelectedMulti] = useState<number[]>([]);
  const [integerAnswer, setIntegerAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [result, setResult] = useState<{ isCorrect: boolean } | null>(null);
  const [cheerStreak, setCheerStreak] = useState<number | null>(null);

  const exam = data?.exam;
  const subject = data?.subjects.find((entry) => String(entry.id) === subjectId);
  const chapter = subject?.chapters.find((entry) => String(entry.id) === chapterId);
  const question = chapter?.questions.find((entry) => String(entry.id) === questionId);

  const chapterQuestions = chapter?.questions ?? [];
  const currentIndex = chapterQuestions.findIndex((entry) => String(entry.id) === questionId);
  const prevQuestion = currentIndex > 0 ? chapterQuestions[currentIndex - 1] : null;
  const nextQuestion = currentIndex >= 0 && currentIndex < chapterQuestions.length - 1 ? chapterQuestions[currentIndex + 1] : null;
  const questionType: QuestionType = question?.questionType === "multi" || question?.questionType === "integer" ? question.questionType : "mcq";

  const attemptMutation = useMutation({
    mutationFn: async (answer: number | number[] | string) => {
      if (!question) throw new Error("Question not found");
      if (isPreviewMode) {
        return { isCorrect: isPreviewAnswerCorrect(questionType, answer, question) };
      }
      return api.post<{ isCorrect: boolean }>(`/question-bank-questions/${question.id}/attempt`, { answer });
    },
    onSuccess: (payload) => {
      setResult(payload);
      setRevealed(true);

      if (payload.isCorrect) {
        const streak = getCorrectStreakTillQuestion(chapterQuestions, currentIndex, true);
        if (CHEER_STREAK_MILESTONES.has(streak)) {
          setCheerStreak(streak);
        }
      }

      if (!isPreviewMode) {
        queryClient.invalidateQueries({ queryKey: ["student-question-bank-exam", examId] });
        queryClient.invalidateQueries({ queryKey: ["student-question-bank-exams"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-question-bank-progress"] });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Could not submit answer",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    setSelected(null);
    setSelectedMulti([]);
    setIntegerAnswer("");
    setRevealed(false);
    setResult(null);
  }, [questionId]);

  useEffect(() => {
    if (cheerStreak === null) return;
    const timer = window.setTimeout(() => setCheerStreak(null), 1800);
    return () => window.clearTimeout(timer);
  }, [cheerStreak]);

  const submittedMulti = useMemo(() => [...selectedMulti].sort((left, right) => left - right), [selectedMulti]);

  if (isLoading) {
    return <div className="py-20 text-center text-muted-foreground">Loading question...</div>;
  }

  if (!exam || !subject || !chapter || !question || subject.isLocked || chapter.isLocked) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Not found.{" "}
        <Link to="/student/question-bank" className="text-primary underline">
          Go home
        </Link>
      </div>
    );
  }

  const handleReveal = () => {
    if (questionType === "integer") {
      if (!integerAnswer.trim()) return;
      attemptMutation.mutate(integerAnswer.trim());
      return;
    }

    if (questionType === "multi") {
      if (submittedMulti.length === 0) return;
      attemptMutation.mutate(submittedMulti);
      return;
    }

    if (selected === null) return;
    attemptMutation.mutate(selected);
  };

  const toggleMulti = (index: number) => {
    if (revealed) return;
    setSelectedMulti((current) =>
      current.includes(index) ? current.filter((value) => value !== index) : [...current, index].sort((left, right) => left - right),
    );
  };

  const mcqCorrectIndex = question.correctAnswer ?? 0;
  const multiCorrectIndexes = [...(question.correctAnswerMulti ?? [])].sort((left, right) => left - right);
  const integerRangeText =
    question.correctAnswerMin != null && question.correctAnswerMax != null
      ? `${question.correctAnswerMin} to ${question.correctAnswerMax}`
      : question.correctAnswer != null
        ? String(question.correctAnswer)
        : null;

  const optionClass = (index: number) => {
    const base = "w-full cursor-pointer rounded-xl border p-3.5 text-left text-sm transition-all";

    if (!revealed) {
      if (questionType === "multi" && selectedMulti.includes(index)) {
        return `${base} border-primary bg-primary/5 font-medium text-primary`;
      }
      if (questionType === "mcq" && selected === index) {
        return `${base} border-primary bg-primary/5 font-medium text-primary`;
      }
      return `${base} border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/3`;
    }

    if (questionType === "multi") {
      if (multiCorrectIndexes.includes(index)) return `${base} border-emerald-400 bg-emerald-50 font-medium text-emerald-700`;
      if (selectedMulti.includes(index)) return `${base} border-red-400 bg-red-50 text-red-700`;
      return `${base} border-border bg-card text-muted-foreground`;
    }

    if (index === mcqCorrectIndex) return `${base} border-emerald-400 bg-emerald-50 font-medium text-emerald-700`;
    if (index === selected && selected !== mcqCorrectIndex) return `${base} border-red-400 bg-red-50 text-red-700`;
    return `${base} border-border bg-card text-muted-foreground`;
  };

  const isCorrect = result?.isCorrect ?? false;
  const cheerCopy = cheerStreak ? getCheerCopy(cheerStreak) : null;

  return (
    <div className="space-y-6">
      {cheerCopy ? (
        <div className="pointer-events-none fixed inset-x-0 top-5 z-50 flex justify-center px-4">
          <div className="animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-300">
            <div className="relative overflow-hidden rounded-full border border-[#FDE68A] bg-gradient-to-r from-[#FFF7E8] via-white to-[#ECFCCB] px-4 py-3 shadow-[0_12px_32px_rgba(217,119,6,0.16)]">
              <div className="absolute -left-2 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full bg-[#F59E0B]/15 blur-xl" />
              <div className="absolute -right-1 top-1 h-8 w-8 rounded-full bg-[#22C55E]/15 blur-lg" />
              <div className="relative flex items-center gap-3">
                <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[#F59E0B]/15 text-[#D97706]">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#F59E0B]/20" />
                  <Trophy className="relative h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 animate-pulse text-[#D97706]" />
                    <p className="text-sm font-bold text-[#111827]">{cheerCopy.title}</p>
                  </div>
                  <p className="text-xs font-medium text-[#6B7280]">{cheerCopy.description}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <Link to={`/student/question-bank/exam/${examId}/subject/${subjectId}/chapter/${chapterId}`}>
          <button className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition hover:border-primary/40 hover:text-primary">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
        </Link>
        <div className="flex w-full items-center gap-1.5 overflow-x-auto text-xs text-muted-foreground sm:w-auto sm:overflow-hidden">
          <Link to={`/student/question-bank/exam/${examId}`} className="shrink-0 hover:text-primary">
            {exam.label}
          </Link>
          <span className="shrink-0">/</span>
          <Link to={`/student/question-bank/exam/${examId}/subject/${subjectId}`} className="max-w-[80px] shrink-0 truncate hover:text-primary">
            {subject.title}
          </Link>
          <span className="shrink-0">/</span>
          <Link to={`/student/question-bank/exam/${examId}/subject/${subjectId}/chapter/${chapterId}`} className="max-w-[80px] shrink-0 truncate hover:text-primary">
            {chapter.title}
          </Link>
        </div>
        <div className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground sm:ml-auto">
          {currentIndex + 1} / {chapterQuestions.length}
        </div>
      </div>

      <div className="flex gap-1">
        {chapterQuestions.map((entry, index) => (
          <button
            key={entry.id}
            onClick={() => navigate(`/student/question-bank/exam/${examId}/subject/${subjectId}/chapter/${chapterId}/question/${entry.id}`)}
            className={`h-1.5 flex-1 rounded-full transition-all ${
              index === currentIndex
                ? "bg-primary"
                : getQuestionSolved(entry)
                  ? "bg-emerald-400"
                  : getQuestionAttempted(entry)
                    ? "bg-amber-300"
                    : "bg-muted"
            }`}
          />
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{chapter.title}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${getQuestionDifficultyTone(question.difficulty)}`}>
            {formatDifficultyLabel(question.difficulty)}
          </span>
          {question.topicTag ? (
            <span className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
              <Tag className="h-2.5 w-2.5" />
              {question.topicTag}
            </span>
          ) : null}
          <span className="ml-auto rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
            {question.points ?? 1} {(question.points ?? 1) === 1 ? "mark" : "marks"}
          </span>
        </div>

        {question.imageData ? (
          <div className="mb-4 overflow-hidden rounded-xl border border-border bg-muted/30 p-3">
            <img src={question.imageData} alt="Question" className="max-h-[320px] w-full object-contain" />
          </div>
        ) : null}

        <RichQuestionContent content={question.question} className="text-sm font-medium leading-6 text-foreground sm:text-base sm:leading-relaxed" />

        {questionType === "integer" ? (
          <div className="mt-6">
            <input
              type="text"
              value={integerAnswer}
              onChange={(event) => !revealed && setIntegerAnswer(event.target.value)}
              placeholder="Enter numeric answer"
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
              disabled={revealed}
            />
          </div>
        ) : (
          <div className="mt-6 space-y-2.5">
            {question.options.map((option, index) => (
              <button
                key={`${question.id}-${index}`}
                onClick={() => {
                  if (questionType === "multi") {
                    toggleMulti(index);
                  } else if (!revealed) {
                    setSelected(index);
                  }
                }}
                className={optionClass(index)}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[10px] font-bold">
                    {String.fromCharCode(65 + index)}
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    {question.optionImages?.[index] ? (
                      <img src={question.optionImages[index] ?? ""} alt={`Option ${String.fromCharCode(65 + index)}`} className="max-h-44 max-w-full rounded-md object-contain" />
                    ) : null}
                    <RichQuestionContent content={option} className="text-sm leading-6 sm:text-base sm:leading-7" />
                  </div>
                  {revealed && ((questionType === "multi" && multiCorrectIndexes.includes(index)) || (questionType === "mcq" && index === mcqCorrectIndex)) ? (
                    <CheckCircle2 className="ml-auto mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : null}
                  {revealed &&
                  ((questionType === "multi" && selectedMulti.includes(index) && !multiCorrectIndexes.includes(index)) ||
                    (questionType === "mcq" && index === selected && selected !== mcqCorrectIndex)) ? (
                    <XCircle className="ml-auto mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        )}

        {revealed ? (
          <div className={`mt-4 rounded-xl border p-4 ${isCorrect ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
            {isCorrect ? (
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Correct! Well done.
              </div>
            ) : (
              <div className="space-y-1 text-sm text-red-700">
                <div className="flex items-center gap-2 font-semibold">
                  <XCircle className="h-4 w-4" />
                  Incorrect
                </div>
                {questionType === "multi" ? (
                  <span>
                    Correct answer: <span className="font-semibold">{multiCorrectIndexes.map((index) => String.fromCharCode(65 + index)).join(", ")}</span>
                  </span>
                ) : questionType === "integer" ? (
                  <span>
                    Correct answer: <span className="font-semibold">{integerRangeText ?? "Not available"}</span>
                  </span>
                ) : (
                  <span>
                    Correct answer:{" "}
                    <span className="font-semibold">
                      {String.fromCharCode(65 + mcqCorrectIndex)}. {question.options[mcqCorrectIndex]}
                    </span>
                  </span>
                )}
              </div>
            )}

            {question.explanation ? (
              <div className="mt-3 border-t border-current/15 pt-3 text-sm">
                <p className="mb-1 font-semibold">Explanation</p>
                <RichQuestionContent content={question.explanation} />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center sm:justify-between">
        <button
          onClick={() => prevQuestion && navigate(`/student/question-bank/exam/${examId}/subject/${subjectId}/chapter/${chapterId}/question/${prevQuestion.id}`)}
          disabled={!prevQuestion}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-sm text-muted-foreground transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Previous
        </button>

        {!revealed ? (
          <button
            onClick={handleReveal}
            disabled={
              attemptMutation.isPending ||
              (questionType === "integer" ? integerAnswer.trim() === "" : questionType === "multi" ? selectedMulti.length === 0 : selected === null)
            }
            className="col-span-2 rounded-xl bg-primary px-8 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:col-auto"
          >
            {attemptMutation.isPending ? "Submitting..." : "Submit Answer"}
          </button>
        ) : (
          <button
            onClick={() =>
              nextQuestion
                ? navigate(`/student/question-bank/exam/${examId}/subject/${subjectId}/chapter/${chapterId}/question/${nextQuestion.id}`)
                : navigate(`/student/question-bank/exam/${examId}/subject/${subjectId}/chapter/${chapterId}`)
            }
            className="col-span-2 rounded-xl bg-primary px-8 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 sm:col-auto"
          >
            {nextQuestion ? "Next Question" : "Finish Chapter"}
          </button>
        )}

        <button
          onClick={() => nextQuestion && navigate(`/student/question-bank/exam/${examId}/subject/${subjectId}/chapter/${chapterId}/question/${nextQuestion.id}`)}
          disabled={!nextQuestion}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-sm text-muted-foreground transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
