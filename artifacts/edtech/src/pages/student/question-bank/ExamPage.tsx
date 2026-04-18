import { ArrowLeft, ChevronRight, Search } from "lucide-react";
import { Link, useParams } from "wouter";
import { useState } from "react";
import { useStudentQuestionBankExam } from "@/pages/student/question-bank/api";
import { SubjectThemeIcon, getSubjectAccent, getSubjectTheme } from "@/lib/subject-theme";

export default function StudentQuestionBankExamPage() {
  const { examId } = useParams<{ examId: string }>();
  const [search, setSearch] = useState("");
  const { data, isLoading } = useStudentQuestionBankExam(examId);

  if (isLoading) {
    return <div className="py-20 text-center text-muted-foreground">Loading exam question bank...</div>;
  }

  const exam = data?.exam;
  const subjects = data?.subjects ?? [];

  if (!exam) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Exam not found. <Link to="/student/question-bank" className="text-primary underline">Go back</Link>
      </div>
    );
  }

  const examSubjects = subjects.filter((subject) => search === "" || subject.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/student/question-bank">
          <button className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition hover:border-primary/40 hover:text-primary">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Student Dashboard</span>
            <span className="text-xs text-muted-foreground">/</span>
            <span className="text-xs font-medium text-foreground">{exam.label}</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="chip-orange-soft inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold">
                {exam.label}
              </span>
              <span className="chip-orange-solid rounded-full px-2 py-0.5 text-xs font-medium">Open</span>
            </div>
            <h1 className="mt-2 text-xl font-bold text-foreground">{exam.label}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Select a subject to browse chapters and questions.</p>
          </div>
          <div className="flex gap-4 text-center">
            {[
              { label: "Subjects", value: examSubjects.length },
              { label: "Chapters", value: examSubjects.reduce((sum, subject) => sum + subject.chapters.length, 0) },
              { label: "Questions", value: examSubjects.reduce((sum, subject) => sum + subject.chapters.reduce((chapterSum, chapter) => chapterSum + chapter.questions.length, 0), 0) },
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
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-base font-semibold text-foreground">Subjects</h2>
          <div className="relative ml-auto w-56">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search subjects..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-lg border border-border bg-card py-1.5 pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
        </div>

        {examSubjects.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">No subjects found.</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {examSubjects.map((subject) => {
              const subjectChapters = subject.chapters;
              const subjectQuestions = subjectChapters.flatMap((chapter) => chapter.questions);
              const attempted = subjectQuestions.filter((question) => (question.progress?.attemptCount ?? 0) > 0).length;
              const pct = subjectQuestions.length > 0 ? Math.round((attempted / subjectQuestions.length) * 100) : 0;
              const subjectTheme = getSubjectTheme(subject.title);
              const subjectAccent = getSubjectAccent(subject.title);

              return (
                <Link key={subject.id} to={`/student/question-bank/exam/${examId}/subject/${subject.id}`}>
                  <div className="group cursor-pointer rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
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
                          <div className="font-semibold text-foreground">{subject.title}</div>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                    </div>
                    <div className="mt-4 flex gap-4 text-center">
                      <div>
                        <div className="text-lg font-bold text-foreground">{subjectChapters.length}</div>
                        <div className="text-[10px] text-muted-foreground">Chapters</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-foreground">{subjectQuestions.length}</div>
                        <div className="text-[10px] text-muted-foreground">Questions</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-foreground">{pct}%</div>
                        <div className="text-[10px] text-muted-foreground">Done</div>
                      </div>
                    </div>
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: subjectAccent.line }}
                      />
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
