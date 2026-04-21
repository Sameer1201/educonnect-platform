import { useState } from "react";
import { ArrowLeft, CheckCircle2, Circle, Tag } from "lucide-react";
import { Link, useLocation, useParams } from "wouter";
import { stripRichHtmlToText } from "@/lib/richContent";
import { useAuth } from "@/contexts/AuthContext";
import { isStudentPendingVerification } from "@/lib/student-access";
import {
  formatDifficultyLabel,
  getChapterDifficultyLabel,
  getPendingPreviewQuestionBankExam,
  getQuestionAttempted,
  getQuestionDifficultyTone,
  useStudentQuestionBankExam,
} from "@/pages/student/question-bank/api";

const difficultyColor: Record<string, string> = {
  Easy: "bg-emerald-100 text-emerald-700",
  Medium: "bg-amber-100 text-amber-700",
  Hard: "bg-red-100 text-red-700",
};

function getQuestionPreview(content: string) {
  const preview = stripRichHtmlToText(content);
  return preview || "Image-based question";
}

function hasEmbeddedQuestionImage(questionHtml?: string | null) {
  return /<img\b/i.test(String(questionHtml ?? ""));
}

export default function StudentQuestionBankChapterPage() {
  const { examId, subjectId, chapterId } = useParams<{ examId: string; subjectId: string; chapterId: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isPreviewMode = isStudentPendingVerification(user);
  const previewData = isPreviewMode ? getPendingPreviewQuestionBankExam(examId) : null;
  const [filterAttempted, setFilterAttempted] = useState<"all" | "attempted" | "unattempted">("all");
  const { data: liveData, isLoading } = useStudentQuestionBankExam(isPreviewMode ? "" : examId);
  const data = previewData ?? liveData;

  if (!previewData && isLoading) {
    return <div className="py-20 text-center text-muted-foreground">Loading chapter questions...</div>;
  }

  const exam = data?.exam;
  const subject = data?.subjects.find((entry) => String(entry.id) === subjectId);
  const chapter = subject?.chapters.find((entry) => String(entry.id) === chapterId);

  if (!exam || !subject || !chapter || subject.isLocked) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Not found.{" "}
        <Link to="/student/question-bank" className="text-primary underline">
          Go home
        </Link>
      </div>
    );
  }

  const allQuestions = chapter.questions;
  const filteredQuestions = allQuestions.filter((question) => {
    const attempted = getQuestionAttempted(question);
    if (filterAttempted === "attempted") return attempted;
    if (filterAttempted === "unattempted") return !attempted;
    return true;
  });
  const attempted = allQuestions.filter((question) => getQuestionAttempted(question)).length;
  const chapterDifficulty = getChapterDifficultyLabel(chapter);

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <Link to={`/student/question-bank/exam/${examId}/subject/${subjectId}`}>
          <button className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition hover:border-primary/40 hover:text-primary">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
        </Link>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Link to="/student/question-bank" className="hover:text-primary">
            Dashboard
          </Link>
          <span>/</span>
          <Link to={`/student/question-bank/exam/${examId}`} className="hover:text-primary">
            {exam.label}
          </Link>
          <span>/</span>
          <Link to={`/student/question-bank/exam/${examId}/subject/${subjectId}`} className="hover:text-primary">
            {subject.title}
          </Link>
          <span>/</span>
          <span className="font-medium text-foreground">{chapter.title}</span>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">{chapter.title}</h1>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${difficultyColor[chapterDifficulty]}`}>{chapterDifficulty}</span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {exam.label} · {subject.title}
            </p>
          </div>
          <div className="grid w-full grid-cols-3 gap-3 text-center sm:w-auto sm:flex sm:gap-4">
            <div>
              <div className="text-xl font-bold text-foreground sm:text-2xl">{allQuestions.length}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </div>
            <div>
              <div className="text-xl font-bold text-emerald-600 sm:text-2xl">{attempted}</div>
              <div className="text-xs text-muted-foreground">Attempted</div>
            </div>
            <div>
              <div className="text-xl font-bold text-foreground sm:text-2xl">{allQuestions.length - attempted}</div>
              <div className="text-xs text-muted-foreground">Remaining</div>
            </div>
          </div>
        </div>
        {allQuestions.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Progress</span>
              <span>{Math.round((attempted / allQuestions.length) * 100)}%</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round((attempted / allQuestions.length) * 100)}%` }} />
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold text-foreground">
            Questions
            <span className="ml-2 text-sm font-normal text-muted-foreground">({filteredQuestions.length})</span>
          </h2>
          <div className="-mx-1 flex w-full items-center gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:w-auto sm:overflow-visible sm:px-0 sm:pb-0">
            {(["all", "unattempted", "attempted"] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setFilterAttempted(filter)}
                className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
                  filterAttempted === filter
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        {filteredQuestions.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">No questions match the filter.</div>
        ) : (
          <div className="space-y-3">
            {filteredQuestions.map((question, index) => (
              <div
                key={question.id}
                onClick={() => navigate(`/student/question-bank/exam/${examId}/subject/${subjectId}/chapter/${chapterId}/question/${question.id}`)}
                className="group cursor-pointer rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {getQuestionAttempted(question) ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Circle className="h-5 w-5 text-muted-foreground/50" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">Q{index + 1}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${getQuestionDifficultyTone(question.difficulty)}`}>
                        {formatDifficultyLabel(question.difficulty)}
                      </span>
                      {question.topicTag ? (
                        <span className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                          <Tag className="h-2.5 w-2.5" />
                          {question.topicTag}
                        </span>
                      ) : null}
                      {(question.imageData || hasEmbeddedQuestionImage(question.question)) ? (
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] text-sky-700">
                          Image
                        </span>
                      ) : null}
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                        {question.points ?? 1} {(question.points ?? 1) === 1 ? "mark" : "marks"}
                      </span>
                    </div>
                    <p className="line-clamp-2 break-words text-sm text-foreground">{getQuestionPreview(question.question)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {filteredQuestions.length > 0 && !allQuestions.every((question) => getQuestionAttempted(question)) && (
          <div className="mt-6 flex justify-center">
            <button
              onClick={() => {
                const firstUnattempted = filteredQuestions.find((question) => !getQuestionAttempted(question));
                if (firstUnattempted) {
                  navigate(`/student/question-bank/exam/${examId}/subject/${subjectId}/chapter/${chapterId}/question/${firstUnattempted.id}`);
                }
              }}
              className="w-full rounded-xl bg-primary px-8 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 sm:w-auto"
            >
              Start Practising
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
