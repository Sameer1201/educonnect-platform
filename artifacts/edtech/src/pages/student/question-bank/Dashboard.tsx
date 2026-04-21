import { useState } from "react";
import { BookOpen, CheckCircle, ChevronRight, Clock, Target } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { api } from "@/lib/api";
import PendingVerificationDialog from "@/components/student/PendingVerificationDialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { isStudentPendingVerification } from "@/lib/student-access";
import { useStudentQuestionBankExams } from "@/pages/student/question-bank/api";

type QuestionBankProgressSummary = {
  totalSolvedQuestions: number;
};

const PENDING_PREVIEW_EXAMS = [
  {
    key: "gate-preview",
    label: "GATE",
    subjectCount: 10,
    chapterCount: 56,
    questionCount: 650,
    attemptedQuestionCount: 124,
  },
  {
    key: "ese-preview",
    label: "ESE",
    subjectCount: 8,
    chapterCount: 42,
    questionCount: 420,
    attemptedQuestionCount: 87,
  },
  {
    key: "iitjam-preview",
    label: "IIT JAM",
    subjectCount: 6,
    chapterCount: 28,
    questionCount: 320,
    attemptedQuestionCount: 63,
  },
] satisfies Array<{
  key: string;
  label: string;
  subjectCount: number;
  chapterCount: number;
  questionCount: number;
  attemptedQuestionCount: number;
}>;

function PendingQuestionBankPreview() {
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const totalExams = PENDING_PREVIEW_EXAMS.length;
  const totalQuestions = PENDING_PREVIEW_EXAMS.reduce((sum, exam) => sum + exam.questionCount, 0);
  const totalChapters = PENDING_PREVIEW_EXAMS.reduce((sum, exam) => sum + exam.chapterCount, 0);
  const attemptedQuestions = PENDING_PREVIEW_EXAMS.reduce((sum, exam) => sum + exam.attemptedQuestionCount, 0);

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">My Question Banks</h1>
            <p className="mt-1 text-sm text-muted-foreground">Preview mode active. Sample question bank values visible until verification is approved.</p>
          </div>

          <Button
            variant="outline"
            className="w-full self-start rounded-full border-[#D9D6FE] bg-white px-5 py-3 text-sm font-semibold text-[#5B4DFF] hover:bg-[#EEF2FF] sm:w-auto md:self-auto"
            onClick={() => setLocation("/student/pending-approval")}
          >
            Check verification
          </Button>
        </div>

        <div className="rounded-[28px] border border-[#D9D6FE] bg-[linear-gradient(135deg,#F5F3FF_0%,#F8FAFC_100%)] px-5 py-5 shadow-[0_12px_32px_rgba(91,77,255,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#5B4DFF]">Verification pending</p>
              <h2 className="mt-2 text-[28px] font-black tracking-tight text-[#111827]">Sample question bank unlocked</h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-[#6B7280]">
                Question Bank tab active rahega, lekin abhi sample exams, subjects, chapters, and progress values dikhengi. Real practice access approval ke baad open hoga.
              </p>
            </div>
            <Button
              type="button"
              className="rounded-full bg-[#F59E0B] px-6 py-3 text-white hover:bg-[#EA580C]"
              onClick={() => setDialogOpen(true)}
            >
              Open locked features
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Active Exams" value={totalExams} icon={<BookOpen className="h-4 w-4" />} color="text-primary" bg="bg-primary/10" />
          <StatCard label="Total Questions" value={totalQuestions} icon={<Target className="h-4 w-4" />} color="text-amber-600" bg="bg-amber-50" />
          <StatCard label="Attempted" value={attemptedQuestions} icon={<CheckCircle className="h-4 w-4" />} color="text-emerald-600" bg="bg-emerald-50" />
          <StatCard label="Chapters" value={totalChapters} icon={<Clock className="h-4 w-4" />} color="text-violet-600" bg="bg-violet-50" />
        </div>

        <div>
          <h2 className="mb-3 text-base font-semibold text-foreground">Available Exam Question Banks</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PENDING_PREVIEW_EXAMS.map((exam) => {
              const attempted = exam.attemptedQuestionCount ?? 0;
              const pct = exam.questionCount > 0 ? Math.round((attempted / exam.questionCount) * 100) : 0;

              return (
                <button
                  key={exam.key}
                  type="button"
                  onClick={() => setDialogOpen(true)}
                  className="group cursor-pointer rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-md sm:p-5"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="chip-orange-soft inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold">
                          {exam.label}
                        </span>
                        <span className="chip-orange-solid rounded-full px-2 py-0.5 text-xs font-medium">
                          Preview
                        </span>
                      </div>
                      <h3 className="mt-2 text-sm font-semibold leading-tight text-foreground">{exam.label}</h3>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-base font-bold text-foreground sm:text-lg">{exam.subjectCount}</div>
                      <div className="text-[10px] text-muted-foreground">Subjects</div>
                    </div>
                    <div>
                      <div className="text-base font-bold text-foreground sm:text-lg">{exam.chapterCount}</div>
                      <div className="text-[10px] text-muted-foreground">Chapters</div>
                    </div>
                    <div>
                      <div className="text-base font-bold text-foreground sm:text-lg">{exam.questionCount}</div>
                      <div className="text-[10px] text-muted-foreground">Questions</div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Progress</span>
                      <span>{attempted}/{exam.questionCount} attempted</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

      </div>

      <PendingVerificationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCheckStatus={() => setLocation("/student/pending-approval")}
      />
    </>
  );
}

function ApprovedQuestionBankDashboard() {
  const { data: exams = [], isLoading } = useStudentQuestionBankExams();
  const { data: progress } = useQuery<QuestionBankProgressSummary>({
    queryKey: ["dashboard-question-bank-progress"],
    queryFn: () => api.get("/question-bank/progress/summary"),
    staleTime: 30_000,
  });
  const totalExams = exams.length;
  const totalQuestions = exams.reduce((sum, exam) => sum + exam.questionCount, 0);
  const totalChapters = exams.reduce((sum, exam) => sum + exam.chapterCount, 0);
  const attemptedQuestions = progress?.totalSolvedQuestions ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Question Banks</h1>
        <p className="mt-1 text-sm text-muted-foreground">Browse exams, subjects and chapters to practise questions.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Active Exams" value={totalExams} icon={<BookOpen className="h-4 w-4" />} color="text-primary" bg="bg-primary/10" />
        <StatCard label="Total Questions" value={totalQuestions} icon={<Target className="h-4 w-4" />} color="text-amber-600" bg="bg-amber-50" />
        <StatCard label="Attempted" value={attemptedQuestions} icon={<CheckCircle className="h-4 w-4" />} color="text-emerald-600" bg="bg-emerald-50" />
        <StatCard label="Chapters" value={totalChapters} icon={<Clock className="h-4 w-4" />} color="text-violet-600" bg="bg-violet-50" />
      </div>

      <div>
        <h2 className="mb-3 text-base font-semibold text-foreground">Available Exam Question Banks</h2>
        {isLoading ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
            Loading question banks...
          </div>
        ) : exams.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
            No question bank is available for your exam profile yet.
          </div>
        ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {exams.map((exam) => {
            const attempted = exam.attemptedQuestionCount ?? 0;
            const pct = exam.questionCount > 0 ? Math.round((attempted / exam.questionCount) * 100) : 0;

            return (
              <Link key={exam.key} to={`/student/question-bank/exam/${exam.key}`}>
                <div className="group cursor-pointer rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/40 hover:shadow-md sm:p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="chip-orange-soft inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold">
                          {exam.label}
                        </span>
                        <span className="chip-orange-solid rounded-full px-2 py-0.5 text-xs font-medium">
                          Open
                        </span>
                      </div>
                      <h3 className="mt-2 text-sm font-semibold leading-tight text-foreground">{exam.label}</h3>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-base font-bold text-foreground sm:text-lg">{exam.subjectCount}</div>
                      <div className="text-[10px] text-muted-foreground">Subjects</div>
                    </div>
                    <div>
                      <div className="text-base font-bold text-foreground sm:text-lg">{exam.chapterCount}</div>
                      <div className="text-[10px] text-muted-foreground">Chapters</div>
                    </div>
                    <div>
                      <div className="text-base font-bold text-foreground sm:text-lg">{exam.questionCount}</div>
                      <div className="text-[10px] text-muted-foreground">Questions</div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Progress</span>
                      <span>{attempted}/{exam.questionCount} attempted</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
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

export default function StudentQuestionBankDashboard() {
  const { user } = useAuth();

  if (isStudentPendingVerification(user)) {
    return <PendingQuestionBankPreview />;
  }

  return <ApprovedQuestionBankDashboard />;
}

function StatCard({
  label,
  value,
  icon,
  color,
  bg,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  bg: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm sm:p-4">
      <div className={`inline-flex items-center justify-center rounded-lg p-2 ${bg}`}>
        <span className={color}>{icon}</span>
      </div>
      <div className="mt-3 text-xl font-bold text-foreground sm:text-2xl">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
