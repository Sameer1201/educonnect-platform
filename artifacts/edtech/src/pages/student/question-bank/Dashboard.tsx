import { BookOpen, CheckCircle, ChevronRight, Clock, Target } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { api } from "@/lib/api";
import { useStudentQuestionBankExams } from "@/pages/student/question-bank/api";

type QuestionBankProgressSummary = {
  totalSolvedQuestions: number;
};

export default function StudentQuestionBankDashboard() {
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

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
                <div className="group cursor-pointer rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md">
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
                      <div className="text-lg font-bold text-foreground">{exam.subjectCount}</div>
                      <div className="text-[10px] text-muted-foreground">Subjects</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-foreground">{exam.chapterCount}</div>
                      <div className="text-[10px] text-muted-foreground">Chapters</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-foreground">{exam.questionCount}</div>
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
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className={`inline-flex items-center justify-center rounded-lg p-2 ${bg}`}>
        <span className={color}>{icon}</span>
      </div>
      <div className="mt-3 text-2xl font-bold text-foreground">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
