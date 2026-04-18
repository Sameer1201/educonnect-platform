import { ArrowLeft, ChevronRight, Filter } from "lucide-react";
import { Link, useParams } from "wouter";
import { useState } from "react";
import {
  formatDifficultyLabel,
  getChapterDifficultyLabel,
  useStudentQuestionBankExam,
} from "@/pages/student/question-bank/api";
import { SubjectThemeIcon, getSubjectAccent, getSubjectTheme } from "@/lib/subject-theme";

const difficultyColor: Record<string, string> = {
  Easy: "bg-emerald-100 text-emerald-700",
  Medium: "bg-amber-100 text-amber-700",
  Hard: "bg-red-100 text-red-700",
};

export default function StudentQuestionBankSubjectPage() {
  const { examId, subjectId } = useParams<{ examId: string; subjectId: string }>();
  const [diffFilter, setDiffFilter] = useState<"All" | "Easy" | "Medium" | "Hard">("All");
  const { data, isLoading } = useStudentQuestionBankExam(examId);

  if (isLoading) {
    return <div className="py-20 text-center text-muted-foreground">Loading subject question bank...</div>;
  }

  const exam = data?.exam;
  const subject = data?.subjects.find((entry) => String(entry.id) === subjectId);

  if (!exam || !subject) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Not found. <Link to="/student/question-bank" className="text-primary underline">Go home</Link>
      </div>
    );
  }

  const allSubjectQuestions = subject.chapters.flatMap((chapter) => chapter.questions);
  const subjectChapters = subject.chapters.filter((chapter) => {
    if (diffFilter === "All") return true;
    return getChapterDifficultyLabel(chapter) === diffFilter;
  });
  const attempted = allSubjectQuestions.filter((question) => (question.progress?.attemptCount ?? 0) > 0).length;
  const subjectTheme = getSubjectTheme(subject.title);
  const subjectAccent = getSubjectAccent(subject.title);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to={`/student/question-bank/exam/${examId}`}>
          <button className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition hover:border-primary/40 hover:text-primary">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
        </Link>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link to="/student/question-bank" className="hover:text-primary">Dashboard</Link>
          <span>/</span>
          <Link to={`/student/question-bank/exam/${examId}`} className="hover:text-primary">{exam.label}</Link>
          <span>/</span>
          <span className="font-medium text-foreground">{subject.title}</span>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full border"
                style={{
                  backgroundColor: subjectTheme.softBgStrong,
                  borderColor: subjectTheme.softBorder,
                  color: subjectTheme.color,
                }}
              >
                <SubjectThemeIcon label={subject.title} className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">{subject.title}</h1>
                <p className="text-xs text-muted-foreground">{exam.label}</p>
              </div>
            </div>
          </div>
          <div className="flex gap-4 text-center">
            {[
              { label: "Chapters", value: subjectChapters.length },
              { label: "Questions", value: allSubjectQuestions.length },
              { label: "Attempted", value: attempted },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-2xl font-bold text-foreground">{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-foreground">Chapters</h2>
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="mr-1 text-xs text-muted-foreground">Difficulty:</span>
            {(["All", "Easy", "Medium", "Hard"] as const).map((difficulty) => (
              <button
                key={difficulty}
                onClick={() => setDiffFilter(difficulty)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  diffFilter === difficulty
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary"
                }`}
              >
                {difficulty}
              </button>
            ))}
          </div>
        </div>

        {subjectChapters.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">No chapters match the filter.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {subjectChapters.map((chapter) => {
              const chapterQuestions = chapter.questions;
              const chapterAttempted = chapterQuestions.filter((question) => (question.progress?.attemptCount ?? 0) > 0).length;
              const chapterDifficulty = getChapterDifficultyLabel(chapter);
              const totalQuestions = chapterQuestions.length;
              const pct = totalQuestions > 0 ? Math.round((chapterAttempted / totalQuestions) * 100) : 0;

              return (
                <Link key={chapter.id} to={`/student/question-bank/exam/${examId}/subject/${subjectId}/chapter/${chapter.id}`}>
                  <div className="group cursor-pointer rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/40 hover:shadow-md">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground">{chapter.title}</h3>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${difficultyColor[formatDifficultyLabel(chapterDifficulty)]}`}>
                            {chapterDifficulty}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{totalQuestions} questions</p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                    </div>
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{chapterAttempted}/{totalQuestions} attempted</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: subjectAccent.line }}
                        />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
