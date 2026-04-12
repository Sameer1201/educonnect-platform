import { useQuery } from "@tanstack/react-query";
import { useGetStudentDashboard } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format } from "date-fns";
import {
  Activity, ArrowRight, BookOpen, CalendarClock, CheckCircle2, ClipboardList, Flame, LineChart, Target, Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DashboardScene } from "@/components/dashboard-3d";
import { useAuth } from "@/contexts/AuthContext";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { api } from "@/lib/api";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function MiniSparkline({ values }: { values: number[] }) {
  if (values.length < 2) {
    return <div className="h-10 rounded-lg bg-slate-100" />;
  }
  const max = Math.max(...values, 1);
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${100 - (v / max) * 80}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 100" className="h-10 w-full">
      <polyline
        fill="none"
        stroke="#0f172a"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function ProgressLine({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
      <div className="h-full rounded-full bg-slate-900" style={{ width: `${pct}%` }} />
    </div>
  );
}

function SubjectBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-medium text-slate-600">
        <span className="truncate">{label}</span>
        <span className="tabular-nums">{value}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-200">
        <div className="h-1.5 rounded-full bg-slate-900" style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const { data, isLoading } = useGetStudentDashboard();
  const { data: platformSettings } = usePlatformSettings();
  const { data: progressData } = useQuery({
    queryKey: ["progress", user?.id],
    queryFn: () => api.get(`/progress/${user!.id}`),
    enabled: !!user?.id,
  });

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="h-24 bg-slate-100 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-40 bg-slate-100 rounded-2xl animate-pulse" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => <div key={i} className="h-48 bg-slate-100 rounded-2xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const pendingTests = (data as any).pendingTests ?? [];
  const liveClasses = data.liveClasses ?? 0;
  const firstName = user?.fullName?.split(" ")[0] ?? "there";
  const learningAccessEnabled = platformSettings?.learningAccessEnabled ?? true;
  const summary = progressData?.summary;
  const weeklyTrend = progressData?.weeklyTrend ?? [];
  const subjectBreakdown = progressData?.subjectBreakdown ?? [];
  const tests = progressData?.tests ?? [];
  const todayKey = new Date().toISOString().slice(0, 10);
  const answeredToday = tests
    .filter((t: any) => (t.submittedAt ?? "").slice(0, 10) === todayKey)
    .reduce((sum: number, t: any) => sum + (t.answeredCount ?? 0), 0);
  const dailyGoal = 150;
  const weeklyScores = weeklyTrend.map((w: any) => w.avgTestScore ?? 0).slice(-7);

  return (
    <DashboardScene accent="from-transparent via-transparent to-transparent">
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Student Dashboard</p>
            <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900">{greeting()}, {firstName}</h1>
            <p className="text-sm text-slate-500 mt-1">A clean snapshot of your practice and progress.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/student/tests">
              <Button size="sm" className="gap-1.5">
                <ClipboardList size={14} /> Tests
              </Button>
            </Link>
            <Link href="/student/question-bank">
              <Button size="sm" variant="outline" className="gap-1.5">
                <BookOpen size={14} /> Question Bank
              </Button>
            </Link>
            <Link href="/leaderboard">
              <Button size="sm" variant="outline" className="gap-1.5">
                <Trophy size={14} /> Leaderboard
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.7fr_1fr] gap-4">
          <Card className="border-slate-200">
            <CardContent className="p-6 space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-700">
                    <Target size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Your Daily Goal</p>
                    <p className="text-xs text-slate-500">Track daily questions to build consistency.</p>
                  </div>
                </div>
                <Badge className="bg-slate-100 text-slate-700 border-slate-200">{answeredToday}/{dailyGoal} Qs</Badge>
              </div>
              <ProgressLine value={answeredToday} total={dailyGoal} />
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                {[
                  { icon: Activity, label: "Warm-up" },
                  { icon: BookOpen, label: "Concept" },
                  { icon: LineChart, label: "Practice" },
                  { icon: Flame, label: "Speed" },
                  { icon: CheckCircle2, label: "Wrap-up" },
                ].map((item) => (
                  <div key={item.label} className="flex flex-col items-center gap-2 flex-1">
                    <div className="h-8 w-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-500">
                      <item.icon size={14} />
                    </div>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Weekly Momentum</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <MiniSparkline values={weeklyScores.length ? weeklyScores : [18, 22, 30, 28, 35, 40, 46]} />
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{weeklyScores.length ? "Last 7 test scores" : "No trend yet"}</span>
                <span className="font-semibold text-slate-900">{summary?.avgTestScore ?? 0}% avg</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs text-slate-600">
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-slate-400">Tests Completed</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{summary?.testsCompleted ?? 0}</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-slate-400">Current Streak</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{summary?.streak?.current ?? 0} days</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-4">
          <Card className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Subject Pulse</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {subjectBreakdown.length === 0 && (
                <div className="text-sm text-slate-500">Attempt a test to unlock subject insights.</div>
              )}
              {subjectBreakdown.slice(0, 6).map((subject: any) => (
                <SubjectBar
                  key={subject.classId}
                  label={subject.className}
                  value={subject.avgTestScore ?? 0}
                />
              ))}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4">
            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Practice Snapshot</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Average score</span>
                  <span className="font-semibold text-slate-900">{summary?.avgTestScore ?? 0}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Assignments submitted</span>
                  <span className="font-semibold text-slate-900">{summary?.assignmentsSubmitted ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Attendance</span>
                  <span className="font-semibold text-slate-900">{summary?.attendancePercentage ?? 0}%</span>
                </div>
              </CardContent>
            </Card>

            {learningAccessEnabled && (
              <Card className="border-slate-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Classes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Live right now</span>
                    <span className="font-semibold text-slate-900">{liveClasses}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Upcoming classes</span>
                    <span className="font-semibold text-slate-900">{data.upcomingClasses.length}</span>
                  </div>
                  <Link href="/student/classes">
                    <Button variant="outline" size="sm" className="mt-2 w-full gap-1.5">
                      <CalendarClock size={14} /> View schedule
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {pendingTests.length > 0 && (
          <Card className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ClipboardList size={15} className="text-slate-700" />
                Tests awaiting you
                <Badge className="ml-auto bg-slate-100 text-slate-700 border-slate-200">{pendingTests.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {pendingTests.slice(0, 3).map((test: any) => (
                <Link
                  key={test.id}
                  href="/student/tests"
                  data-testid={`pending-test-${test.id}`}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-300 transition"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-900">{test.title}</p>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      {test.durationMinutes && <span>{test.durationMinutes} min</span>}
                      {test.scheduledAt && <span>{format(new Date(test.scheduledAt), "MMM d, h:mm a")}</span>}
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                    Open <ArrowRight size={12} />
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardScene>
  );
}
