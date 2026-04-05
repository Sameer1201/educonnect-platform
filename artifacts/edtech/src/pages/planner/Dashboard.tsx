import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  addDays,
  differenceInHours,
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameDay,
  isWithinInterval,
  startOfDay,
  startOfWeek,
} from "date-fns";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  BookOpen,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Layers3,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
} from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { useCountUp } from "@/hooks/useCountUp";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardScene, TiltCard } from "@/components/dashboard-3d";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface LecturePlan {
  id: number;
  title: string;
  subject: string;
  description?: string | null;
  scheduledAt: string;
  teacherId: number;
  teacherName?: string | null;
  teacherUsername?: string | null;
  plannerId: number;
  plannerName?: string | null;
  plannerUsername?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TeacherUser {
  id: number;
  fullName: string;
  username: string;
  subject?: string | null;
}

interface PlannerInsights {
  batchCapacityPlanner: Array<{
    classId: number;
    classTitle: string;
    exam: string;
    teacherName?: string | null;
    enrolledCount: number;
    maxStudents: number | null;
    utilization: number | null;
    seatsLeft: number | null;
    waitlistRisk: boolean;
  }>;
  teacherAvailability: Array<{
    teacherId: number;
    teacherName: string;
    subject?: string | null;
    classesCount: number;
    lecturePlansCount: number;
    nextClassAt?: string | null;
  }>;
  conflictDetection: Array<{
    teacherName?: string | null;
    classTitle: string;
    scheduledAt: string;
    conflictingLecturePlans: Array<{ id: number; title: string; scheduledAt: string }>;
    conflictingClasses: Array<{ id: number; title: string; scheduledAt: string }>;
  }>;
  curriculumTimeline: Array<{
    classId: number;
    classTitle: string;
    exam: string;
    subjects: Array<{
      subjectId: number;
      subjectTitle: string;
      teacherName?: string | null;
      chapterCount: number;
      lectureCount: number;
      questionCount: number;
      testCount: number;
      completionScore: number;
    }>;
  }>;
  analyticsDashboard: {
    totalBatches: number;
    totalTeachers: number;
    totalLecturePlans: number;
    uncoveredTeachers: number;
  };
  teacherReplacementFlow: Array<{
    classId: number;
    classTitle: string;
    currentTeacherName?: string | null;
    suggestions: Array<{ teacherId: number; teacherName: string; subject?: string | null }>;
  }>;
  contentReadinessTracker: Array<{
    classId: number;
    classTitle: string;
    notesReady: boolean;
    questionBankReady: boolean;
    testsReady: boolean;
    lecturesReady: boolean;
    assignmentsReady: boolean;
    chapterCoverage: number;
  }>;
  examCalendarMapping: Array<{ exam: string; batchCount: number; reversePlanHint: string }>;
  plannerApprovalQueue: Array<{ type: string; priority: string; title: string; detail: string }>;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function shortWindowLabel(dateString: string) {
  const target = new Date(dateString);
  const hoursAway = differenceInHours(target, new Date());

  if (hoursAway < 24) return `${Math.max(hoursAway, 0)}h away`;
  if (hoursAway < 24 * 7) return `${Math.ceil(hoursAway / 24)}d away`;
  return format(target, "MMM d");
}

function MetricTile({
  label,
  value,
  icon,
  gradient,
  subtext,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  gradient: string;
  subtext: string;
}) {
  const count = useCountUp(value);

  return (
    <TiltCard className="group">
    <div className={`relative overflow-hidden rounded-2xl p-5 text-white shadow-[0_22px_55px_rgba(15,23,42,0.3)] ring-1 ring-white/15 ${gradient}`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.2),transparent_34%)]" />
      <div className="flex items-start justify-between gap-4 relative z-10">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-white/65 font-semibold">{label}</p>
          <p className="text-4xl font-black mt-1 leading-none">{count}</p>
          <p className="text-xs text-white/60 mt-2 max-w-[14rem]">{subtext}</p>
        </div>
        <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
          {icon}
        </div>
      </div>
      <div className="absolute -right-6 -bottom-8 w-28 h-28 rounded-full bg-white/8" />
      <div className="absolute right-12 top-6 w-12 h-12 rounded-full bg-white/6" />
    </div>
    </TiltCard>
  );
}

export default function PlannerDashboard() {
  const { user } = useAuth();

  const { data: lecturePlans = [], isLoading: plansLoading } = useQuery<LecturePlan[]>({
    queryKey: ["planner-dashboard", "lecture-plans"],
    queryFn: async () => {
      const response = await fetch(`${BASE}/api/lecture-plans`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load lecture plans");
      return response.json();
    },
    refetchInterval: 60000,
  });

  const { data: teachers = [], isLoading: teachersLoading } = useQuery<TeacherUser[]>({
    queryKey: ["planner-dashboard", "teachers"],
    queryFn: async () => {
      const response = await fetch(`${BASE}/api/users?role=admin`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load teachers");
      return response.json();
    },
    staleTime: 30000,
  });

  const { data: insights } = useQuery<PlannerInsights>({
    queryKey: ["planner-dashboard", "insights"],
    queryFn: async () => {
      const response = await fetch(`${BASE}/api/planner/insights`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load planner insights");
      return response.json();
    },
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const isLoading = plansLoading || teachersLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-40 rounded-3xl bg-muted animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, index) => (
            <div key={index} className="h-32 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 h-80 rounded-2xl bg-muted animate-pulse" />
          <div className="h-80 rounded-2xl bg-muted animate-pulse" />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="h-72 rounded-2xl bg-muted animate-pulse" />
          <div className="h-72 rounded-2xl bg-muted animate-pulse" />
        </div>
      </div>
    );
  }

  const now = new Date();
  const today = startOfDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const upcomingPlans = [...lecturePlans]
    .filter((plan) => new Date(plan.scheduledAt) >= now)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const upcomingThisWeek = upcomingPlans.filter((plan) =>
    isWithinInterval(new Date(plan.scheduledAt), { start: weekStart, end: weekEnd }),
  );
  const assignedTeacherIds = new Set(lecturePlans.map((plan) => plan.teacherId));
  const teacherCoverage = teachers.length > 0 ? Math.round((assignedTeacherIds.size / teachers.length) * 100) : 0;
  const nextPlan = upcomingPlans[0] ?? null;
  const plansWithin24Hours = upcomingPlans.filter((plan) => differenceInHours(new Date(plan.scheduledAt), now) <= 24).length;
  const plansMissingNotes = upcomingPlans.filter((plan) => !plan.description?.trim()).length;

  const cadenceData = eachDayOfInterval({ start: today, end: addDays(today, 6) }).map((day) => {
    const dayPlans = upcomingPlans.filter((plan) => isSameDay(new Date(plan.scheduledAt), day));
    return {
      label: format(day, "EEE"),
      fullLabel: format(day, "MMM d"),
      total: dayPlans.length,
    };
  });

  const busiestCadenceDay = [...cadenceData].sort((a, b) => b.total - a.total)[0];
  const teachersWithoutUpcoming = teachers.filter(
    (teacher) => !upcomingPlans.some((plan) => plan.teacherId === teacher.id),
  );

  const teacherLoad = teachers
    .map((teacher) => {
      const allPlans = lecturePlans.filter((plan) => plan.teacherId === teacher.id);
      const weeklyPlans = upcomingThisWeek.filter((plan) => plan.teacherId === teacher.id);
      const nextAssignment = upcomingPlans.find((plan) => plan.teacherId === teacher.id) ?? null;
      return {
        ...teacher,
        totalPlans: allPlans.length,
        weeklyPlans: weeklyPlans.length,
        nextAssignment,
      };
    })
    .sort((a, b) => {
      if (b.weeklyPlans !== a.weeklyPlans) return b.weeklyPlans - a.weeklyPlans;
      return b.totalPlans - a.totalPlans;
    });

  const subjectMix = Object.entries(
    lecturePlans.reduce<Record<string, number>>((accumulator, plan) => {
      accumulator[plan.subject] = (accumulator[plan.subject] ?? 0) + 1;
      return accumulator;
    }, {}),
  )
    .map(([subject, count]) => ({ subject, count }))
    .sort((a, b) => b.count - a.count);

  const recentPlans = [...lecturePlans]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const alerts = [];
  if (teachersWithoutUpcoming.length > 0) {
    alerts.push({
      title: "Teacher coverage gap",
      body: `${teachersWithoutUpcoming.length} teacher${teachersWithoutUpcoming.length > 1 ? "s" : ""} still have no upcoming lecture plan.`,
      tone: "amber",
    });
  }
  if (plansMissingNotes > 0) {
    alerts.push({
      title: "Missing teaching notes",
      body: `${plansMissingNotes} upcoming lecture plan${plansMissingNotes > 1 ? "s are" : " is"} missing planner notes.`,
      tone: "blue",
    });
  }
  if (plansWithin24Hours > 0) {
    alerts.push({
      title: "Approaching soon",
      body: `${plansWithin24Hours} lecture plan${plansWithin24Hours > 1 ? "s start" : " starts"} within the next 24 hours.`,
      tone: "emerald",
    });
  }
  if (alerts.length === 0) {
    alerts.push({
      title: "Planning board is clear",
      body: "Every teacher currently has coverage and your upcoming plans are documented.",
      tone: "emerald",
    });
  }

  const plannerName = user?.fullName?.split(" ")[0] ?? "Planner";

  return (
    <DashboardScene accent="from-fuchsia-500/18 via-cyan-500/10 to-blue-500/18">
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-[28px] bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.24),_transparent_35%),linear-gradient(135deg,_#0f766e,_#115e59_48%,_#1d4ed8)] p-6 text-white shadow-xl">
        <div className="relative z-10 flex items-start justify-between gap-6 flex-wrap">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100/80">
              <Sparkles size={14} />
              Planner Command Center
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight mt-3">
              {greeting()}, {plannerName}
            </h1>
            <p className="text-sm sm:text-base text-white/72 mt-3 max-w-xl leading-relaxed">
              You have {lecturePlans.length} lecture plans in motion across {assignedTeacherIds.size} teacher{assignedTeacherIds.size === 1 ? "" : "s"}.
              {nextPlan ? ` The next session is ${format(new Date(nextPlan.scheduledAt), "EEE, MMM d · h:mm a")} for ${nextPlan.teacherName ?? "your assigned teacher"}.` : " Start by creating the first lecture plan for your teaching team."}
            </p>
            <div className="flex flex-wrap gap-2.5 mt-5">
              <Link href="/schedule">
                <Button size="sm" className="bg-white text-teal-700 hover:bg-white/92 shadow-sm gap-1.5">
                  <CalendarDays size={14} /> Open Planner Schedule
                </Button>
              </Link>
              <Button size="sm" className="bg-white/14 hover:bg-white/20 border-0 text-white gap-1.5" disabled>
                <BellRing size={14} /> Notifications Always On
              </Button>
            </div>
          </div>

          <div className="min-w-[280px] max-w-sm w-full rounded-3xl border border-white/15 bg-white/10 backdrop-blur-sm p-5 shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">Coverage</p>
                <p className="text-3xl font-black mt-1">{teacherCoverage}%</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-white/14 flex items-center justify-center">
                <Target size={20} />
              </div>
            </div>
            <div className="mt-4 h-2 rounded-full bg-white/12 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-300 via-cyan-200 to-white" style={{ width: `${teacherCoverage}%` }} />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="rounded-2xl bg-black/10 p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/45">Teachers Planned</p>
                <p className="text-lg font-bold mt-1">{assignedTeacherIds.size}/{teachers.length}</p>
              </div>
              <div className="rounded-2xl bg-black/10 p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/45">This Week</p>
                <p className="text-lg font-bold mt-1">{upcomingThisWeek.length} sessions</p>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute -top-12 right-12 w-52 h-52 rounded-full bg-white/8 blur-2xl" />
        <div className="absolute bottom-0 left-1/3 w-44 h-44 rounded-full bg-cyan-300/10 blur-2xl" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricTile
          label="Total Plans"
          value={lecturePlans.length}
          icon={<Layers3 size={20} className="text-white" />}
          gradient="bg-gradient-to-br from-teal-600 to-cyan-700"
          subtext="All lecture plans created under the planner account."
        />
        <MetricTile
          label="Upcoming This Week"
          value={upcomingThisWeek.length}
          icon={<CalendarClock size={20} className="text-white" />}
          gradient="bg-gradient-to-br from-blue-600 to-indigo-700"
          subtext="Sessions scheduled between Monday and Sunday."
        />
        <MetricTile
          label="Teachers Covered"
          value={assignedTeacherIds.size}
          icon={<Users size={20} className="text-white" />}
          gradient="bg-gradient-to-br from-violet-600 to-fuchsia-700"
          subtext="Teachers with at least one lecture plan assigned."
        />
        <MetricTile
          label="Within 24 Hours"
          value={plansWithin24Hours}
          icon={<Clock3 size={20} className="text-white" />}
          gradient={plansWithin24Hours > 0 ? "bg-gradient-to-br from-amber-500 to-orange-600" : "bg-gradient-to-br from-emerald-500 to-teal-600"}
          subtext={plansWithin24Hours > 0 ? "Short-term plans that may need a last review." : "No immediate schedule pressure right now."}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Card className="xl:col-span-2 overflow-hidden">
          <CardHeader className="border-b bg-muted/20">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarDays size={16} className="text-teal-600" />
                  Planning Cadence
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Lecture volume across the next 7 days.
                </p>
              </div>
              <Badge variant="outline" className="text-xs">
                {busiestCadenceDay?.total ? `${busiestCadenceDay.label} is busiest` : "No plans in the next 7 days"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cadenceData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="plannerCadence" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.8} />
                      <stop offset="100%" stopColor="#14b8a6" stopOpacity={0.06} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                  <RechartsTooltip
                    cursor={{ stroke: "#14b8a6", strokeOpacity: 0.3 }}
                    formatter={(value: number) => [`${value} plan${value === 1 ? "" : "s"}`, "Scheduled"]}
                    labelFormatter={(label, payload) => `${payload?.[0]?.payload?.fullLabel ?? label}`}
                  />
                  <Area type="monotone" dataKey="total" stroke="#0f766e" strokeWidth={3} fill="url(#plannerCadence)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              {cadenceData.map((day) => (
                <div key={day.fullLabel} className="rounded-2xl border bg-muted/25 p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{day.label}</p>
                  <p className="text-2xl font-bold mt-1">{day.total}</p>
                  <p className="text-xs text-muted-foreground mt-1">{day.fullLabel}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/20">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-500" />
              Planner Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-5 space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.title}
                className={`rounded-2xl border p-4 ${
                  alert.tone === "amber"
                    ? "border-amber-200 bg-amber-50/70"
                    : alert.tone === "blue"
                      ? "border-blue-200 bg-blue-50/70"
                      : "border-emerald-200 bg-emerald-50/70"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 ${
                      alert.tone === "amber"
                        ? "bg-amber-100 text-amber-700"
                        : alert.tone === "blue"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {alert.tone === "emerald" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{alert.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{alert.body}</p>
                  </div>
                </div>
              </div>
            ))}

            <div className="rounded-3xl bg-slate-950 text-white p-5 mt-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/45">Next Planned Session</p>
              {nextPlan ? (
                <>
                  <p className="text-lg font-bold mt-2">{nextPlan.title}</p>
                  <p className="text-sm text-white/70 mt-1">
                    {nextPlan.teacherName ?? nextPlan.teacherUsername ?? "Assigned teacher"} · {format(new Date(nextPlan.scheduledAt), "EEE, MMM d · h:mm a")}
                  </p>
                  <Badge className="mt-3 bg-white/12 hover:bg-white/12 text-white border-0">
                    {shortWindowLabel(nextPlan.scheduledAt)}
                  </Badge>
                </>
              ) : (
                <p className="text-sm text-white/70 mt-2">No upcoming lecture plans yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/20">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen size={16} className="text-indigo-600" />
                Teacher Allocation
              </CardTitle>
              <Badge variant="outline" className="text-xs">
                {teachersWithoutUpcoming.length} without upcoming plan
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-5 space-y-3">
            {teacherLoad.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
                No teachers available for planning.
              </div>
            ) : (
              teacherLoad.map((teacher) => {
                const width = upcomingThisWeek.length > 0 ? Math.max((teacher.weeklyPlans / upcomingThisWeek.length) * 100, teacher.weeklyPlans > 0 ? 10 : 0) : 0;
                return (
                  <div key={teacher.id} className="rounded-2xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{teacher.fullName}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          @{teacher.username}
                          {teacher.nextAssignment ? ` · next ${format(new Date(teacher.nextAssignment.scheduledAt), "MMM d, h:mm a")}` : " · no upcoming plan"}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold">{teacher.weeklyPlans}</p>
                        <p className="text-[11px] text-muted-foreground">this week</p>
                      </div>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500" style={{ width: `${width}%` }} />
                    </div>
                    <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground">
                      <span>{teacher.totalPlans} total plans</span>
                      <span>{teacher.nextAssignment ? "Scheduled" : "Needs coverage"}</span>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/20">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles size={16} className="text-fuchsia-600" />
                Subject Mix
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              {subjectMix.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
                  No lecture plans created yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {subjectMix.slice(0, 5).map((item) => {
                    const percent = Math.round((item.count / lecturePlans.length) * 100);
                    return (
                      <div key={item.subject} className="rounded-2xl border p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold">{item.subject}</p>
                          <Badge variant="outline">{item.count}</Badge>
                        </div>
                        <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500" style={{ width: `${percent}%` }} />
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-2">{percent}% of all lecture plans</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/20">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarClock size={16} className="text-teal-600" />
                  Recently Created Plans
                </CardTitle>
                <Link href="/schedule">
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                    Open Schedule <ArrowRight size={12} />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-3">
              {recentPlans.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
                  Your recent lecture plans will appear here.
                </div>
              ) : (
                recentPlans.map((plan) => (
                  <div key={plan.id} className="rounded-2xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{plan.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {plan.subject} · {plan.teacherName ?? plan.teacherUsername ?? "Teacher"}
                        </p>
                      </div>
                      <Badge variant="outline">{format(new Date(plan.createdAt), "MMM d")}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                      Scheduled for {format(new Date(plan.scheduledAt), "EEE, MMM d · h:mm a")}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {insights && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Card className="overflow-hidden">
              <CardHeader className="border-b bg-muted/20">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users size={16} className="text-cyan-600" />
                  Batch Capacity Planner
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5 space-y-3">
                {insights.batchCapacityPlanner.map((item) => (
                  <div key={item.classId} className="rounded-2xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{item.classTitle}</p>
                        <p className="text-xs text-muted-foreground mt-1">{item.exam} · {item.teacherName ?? "Teacher not assigned"}</p>
                      </div>
                      {item.waitlistRisk ? <Badge variant="destructive">Full</Badge> : <Badge variant="outline">{item.seatsLeft ?? "NA"} seats left</Badge>}
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${item.waitlistRisk ? "bg-gradient-to-r from-red-500 to-orange-500" : "bg-gradient-to-r from-cyan-500 to-blue-500"}`} style={{ width: `${Math.min(item.utilization ?? 0, 100)}%` }} />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2">{item.enrolledCount} enrolled / {item.maxStudents ?? "unlimited"} capacity</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader className="border-b bg-muted/20">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle size={16} className="text-red-500" />
                  Conflict Detection & Approval Queue
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5 space-y-3">
                {insights.conflictDetection.length === 0 && insights.plannerApprovalQueue.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">No teacher conflicts or approval blockers right now.</div>
                ) : (
                  <>
                    {insights.conflictDetection.map((conflict, index) => (
                      <div key={`${conflict.classTitle}-${index}`} className="rounded-2xl border border-red-200 bg-red-50/70 p-4">
                        <p className="text-sm font-semibold">{conflict.teacherName ?? "Teacher"} conflict</p>
                        <p className="text-xs text-muted-foreground mt-1">{conflict.classTitle} · {format(new Date(conflict.scheduledAt), "MMM d, h:mm a")}</p>
                        <p className="text-xs mt-2 text-red-700">Overlaps with {conflict.conflictingClasses.length + conflict.conflictingLecturePlans.length} other scheduled item(s).</p>
                      </div>
                    ))}
                    {insights.plannerApprovalQueue.slice(0, 4).map((item) => (
                      <div key={item.title} className="rounded-2xl border p-4">
                        <div className="flex items-center gap-2">
                          <Badge variant={item.priority === "high" ? "destructive" : "outline"}>{item.priority}</Badge>
                          <p className="text-sm font-semibold">{item.title}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">{item.detail}</p>
                      </div>
                    ))}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Card className="overflow-hidden">
              <CardHeader className="border-b bg-muted/20">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target size={16} className="text-emerald-600" />
                  Curriculum Timeline & Readiness
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5 space-y-4">
                {insights.curriculumTimeline.map((batch) => (
                  <div key={batch.classId} className="rounded-2xl border p-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-sm font-semibold">{batch.classTitle}</p>
                        <p className="text-xs text-muted-foreground mt-1">{batch.exam}</p>
                      </div>
                      <Badge variant="outline">{batch.subjects.length} subjects</Badge>
                    </div>
                    <div className="mt-3 space-y-2">
                      {batch.subjects.slice(0, 4).map((subject) => (
                        <div key={subject.subjectId} className="rounded-xl bg-muted/30 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium">{subject.subjectTitle}</p>
                            <Badge variant="secondary">{subject.completionScore}% ready</Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-2">
                            {subject.chapterCount} chapters · {subject.lectureCount} lectures · {subject.questionCount} questions · {subject.testCount} tests
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader className="border-b bg-muted/20">
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen size={16} className="text-violet-600" />
                  Replacement, Exam Mapping, Automation
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Total Batches</p>
                    <p className="text-2xl font-bold mt-1">{insights.analyticsDashboard.totalBatches}</p>
                  </div>
                  <div className="rounded-2xl border p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Uncovered Teachers</p>
                    <p className="text-2xl font-bold mt-1">{insights.analyticsDashboard.uncoveredTeachers}</p>
                  </div>
                </div>
                {insights.teacherReplacementFlow.slice(0, 3).map((item) => (
                  <div key={item.classId} className="rounded-2xl border p-4">
                    <p className="text-sm font-semibold">{item.classTitle}</p>
                    <p className="text-xs text-muted-foreground mt-1">Current teacher: {item.currentTeacherName ?? "Unassigned"}</p>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mt-3">Suggested substitutes</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {item.suggestions.map((suggestion) => (
                        <Badge key={suggestion.teacherId} variant="outline">{suggestion.teacherName}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
                {insights.examCalendarMapping.slice(0, 3).map((item) => (
                  <div key={item.exam} className="rounded-2xl bg-muted/30 p-4">
                    <p className="text-sm font-semibold">{item.exam}</p>
                    <p className="text-xs text-muted-foreground mt-1">{item.batchCount} batch(es)</p>
                    <p className="text-xs mt-2 leading-relaxed text-muted-foreground">{item.reversePlanHint}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
    </DashboardScene>
  );
}
