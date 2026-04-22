import { useMemo, useState } from "react";
import { ArrowLeft, ChevronRight, Lock, Search } from "lucide-react";
import { Link, useLocation, useParams } from "wouter";
import PendingVerificationDialog from "@/components/student/PendingVerificationDialog";
import { useAuth } from "@/contexts/AuthContext";
import { isStudentPendingVerification } from "@/lib/student-access";
import {
  applyPendingPreviewLocksToExam,
  useStudentQuestionBankExam,
} from "@/pages/student/question-bank/api";
import { SubjectThemeIcon, getSubjectAccent, getSubjectTheme } from "@/lib/subject-theme";

export default function StudentQuestionBankExamPage() {
  const { examId } = useParams<{ examId: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isPreviewMode = isStudentPendingVerification(user);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: liveData, isLoading } = useStudentQuestionBankExam(examId);
  const data = useMemo(() => {
    if (!liveData) return null;
    return isPreviewMode ? applyPendingPreviewLocksToExam(liveData) : liveData;
  }, [isPreviewMode, liveData]);

  if (isLoading) {
    return <div className="py-20 text-center text-muted-foreground">Loading exam question bank...</div>;
  }

  const exam = data?.exam;
  const subjects = data?.subjects ?? [];

  if (!exam) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Exam not found.{" "}
        <Link to="/student/question-bank" className="text-primary underline">
          Go back
        </Link>
      </div>
    );
  }

  const examSubjects = subjects.filter((subject) => search === "" || subject.title.toLowerCase().includes(search.toLowerCase()));
  const isLockedExam = Boolean(exam.isLocked);

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Link to="/student/question-bank">
            <button className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition hover:border-primary/40 hover:text-primary">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Student Dashboard</span>
              <span className="text-xs text-muted-foreground">/</span>
              <span className="text-xs font-medium text-foreground">{exam.label}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="chip-orange-soft inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold">
                  {exam.label}
                </span>
                <span className="chip-orange-solid rounded-full px-2 py-0.5 text-xs font-medium">
                  {isLockedExam ? "Locked" : isPreviewMode ? "Review Preview" : "Open"}
                </span>
              </div>
              <h1 className="mt-2 text-xl font-bold text-foreground">{exam.label}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {isLockedExam
                  ? "This exam is locked in review mode. Complete verification to access it."
                  : isPreviewMode
                    ? "Only one subject is unlocked in review mode. The remaining GATE subjects unlock after verification."
                    : "Select a subject to browse chapters and questions."}
              </p>
            </div>
            <div className="grid w-full grid-cols-3 gap-3 text-center sm:w-auto sm:flex sm:gap-4">
              {[
                { label: "Subjects", value: examSubjects.length },
                { label: "Chapters", value: examSubjects.reduce((sum, subject) => sum + subject.chapters.length, 0) },
                { label: "Questions", value: examSubjects.reduce((sum, subject) => sum + subject.chapters.reduce((chapterSum, chapter) => chapterSum + chapter.questions.length, 0), 0) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div className="text-xl font-bold text-foreground sm:text-2xl">{value}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {isLockedExam ? (
          <div className="rounded-2xl border border-[#F3D39A] bg-[linear-gradient(180deg,#FFF8ED_0%,#FFFFFF_100%)] p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-[#F3D39A] bg-[#FFF2D8] px-3 py-1 text-xs font-semibold text-[#B45309]">
                  <Lock className="h-3.5 w-3.5" />
                  Locked exam
                </div>
                <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
                  This exam stays locked in review mode. Complete verification to unlock the full question bank.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDialogOpen(true)}
                className="rounded-full bg-[#F59E0B] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#EA580C]"
              >
                Unlock after verification
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <h2 className="text-base font-semibold text-foreground">Subjects</h2>
              <div className="relative w-full sm:ml-auto sm:w-56">
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
                  const isLockedSubject = Boolean(subject.isLocked);

                  return (
                    <button
                      key={subject.id}
                      type="button"
                      onClick={() => {
                        if (isLockedSubject) {
                          setDialogOpen(true);
                          return;
                        }
                        setLocation(`/student/question-bank/exam/${examId}/subject/${subject.id}`);
                      }}
                      className="text-left"
                    >
                      <div className="group rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/40 hover:shadow-md sm:p-5">
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
                              <div className="mt-1 flex items-center gap-2">
                                <span className="chip-orange-solid rounded-full px-2 py-0.5 text-[10px] font-medium">
                                  {isLockedSubject ? "Locked" : "Preview Open"}
                                </span>
                              </div>
                            </div>
                          </div>
                          {isLockedSubject ? (
                            <Lock className="h-4 w-4 text-amber-600" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                          )}
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                          <div>
                            <div className="text-base font-bold text-foreground sm:text-lg">{subjectChapters.length}</div>
                            <div className="text-[10px] text-muted-foreground">Chapters</div>
                          </div>
                          <div>
                            <div className="text-base font-bold text-foreground sm:text-lg">{subjectQuestions.length}</div>
                            <div className="text-[10px] text-muted-foreground">Questions</div>
                          </div>
                          <div>
                            <div className="text-base font-bold text-foreground sm:text-lg">{pct}%</div>
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
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <PendingVerificationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCheckStatus={() => setLocation("/student/pending-approval")}
      />
    </>
  );
}
