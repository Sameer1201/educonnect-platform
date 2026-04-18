import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useGetSuperAdminDashboard, useApproveStudent, getListUsersQueryKey } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCountUp } from "@/hooks/useCountUp";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { DashboardScene, TiltCard } from "@/components/dashboard-3d";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { APP_NAME } from "@/lib/brand";
import {
  AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Users, UserCheck, BookOpen, Zap, Clock, CheckCircle,
  TrendingUp, Bell, LifeBuoy, Trophy, GraduationCap,
  Medal, FileText, ClipboardList, ArrowRight,
  Shield, Activity, Flame, Plus, ChevronRight,
} from "lucide-react";

/* ─── helpers ─── */
function getHour() { return new Date().getHours(); }
function getGreeting() {
  const h = getHour();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}
function shortDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" });
}

/* ─── Animated KPI tile ─── */
function KpiTile({
  title, value, icon, from, to, sub, badge, onClick,
}: {
  title: string; value: number; icon: React.ReactNode;
  from: string; to: string; sub?: string;
  badge?: { label: string; variant: "default" | "destructive" | "outline" | "secondary" };
  onClick?: () => void;
}) {
  const count = useCountUp(value, 900, true);
  return (
    <TiltCard>
    <div
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br ${from} ${to} text-white shadow-[0_24px_56px_rgba(15,23,42,0.32)] ring-1 ring-white/15 hover:shadow-lg transition-all duration-200 ${onClick ? "cursor-pointer" : ""}`}
      data-testid={`kpi-${title.toLowerCase().replace(/\s/g, "-")}`}
    >
      {/* bg glow */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -translate-y-4 translate-x-4" />
      <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/5 rounded-full translate-y-4 -translate-x-4" />

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            {icon}
          </div>
          {badge && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white uppercase tracking-wide">
              {badge.label}
            </span>
          )}
        </div>
        <p className="text-3xl font-black tracking-tight">{count.toLocaleString()}</p>
        <p className="text-white/70 text-xs mt-0.5 font-medium">{title}</p>
        {sub && <p className="text-white/50 text-[10px] mt-1">{sub}</p>}
      </div>
    </div>
    </TiltCard>
  );
}

/* ─── Quick action card ─── */
function QuickAction({ icon, label, desc, href, color }: {
  icon: React.ReactNode; label: string; desc: string; href: string; color: string;
}) {
  return (
    <TiltCard>
    <Link href={href}>
      <div className={`group flex items-center gap-3 p-4 rounded-xl border border-border hover:border-transparent hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer bg-card hover:bg-gradient-to-br ${color}`}>
        <div className="w-9 h-9 rounded-lg bg-muted group-hover:bg-white/20 flex items-center justify-center transition-colors shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold group-hover:text-white transition-colors">{label}</p>
          <p className="text-xs text-muted-foreground group-hover:text-white/70 truncate transition-colors">{desc}</p>
        </div>
        <ChevronRight size={15} className="text-muted-foreground group-hover:text-white/70 transition-colors shrink-0" />
      </div>
    </Link>
    </TiltCard>
  );
}

/* ─── Teacher row ─── */
function TeacherRow({ teacher, rank }: {
  teacher: { id: number; fullName: string; subject: string | null; classesCount: number; studentsCount: number };
  rank: number;
}) {
  const medal = rank === 1 ? <Trophy size={12} className="text-amber-400" />
    : rank === 2 ? <Medal size={12} className="text-slate-400" />
    : rank === 3 ? <Medal size={12} className="text-orange-400" />
    : <span className="text-xs text-muted-foreground font-bold w-3 text-center">{rank}</span>;

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/50 transition-colors">
      <div className="w-6 flex items-center justify-center shrink-0">{medal}</div>
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
        {getInitials(teacher.fullName)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate">{teacher.fullName}</p>
        {teacher.subject && <p className="text-[10px] text-muted-foreground truncate">{teacher.subject}</p>}
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs font-bold">{teacher.classesCount} <span className="text-muted-foreground font-normal">cls</span></p>
        <p className="text-[10px] text-muted-foreground">{teacher.studentsCount} students</p>
      </div>
    </div>
  );
}

/* ─── Main Dashboard ─── */
export default function SuperAdminDashboard() {
  const { data, isLoading, isError, error, refetch } = useGetSuperAdminDashboard();
  const { data: platformSettings } = usePlatformSettings();
  const approveStudent = useApproveStudent();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [greeting] = useState(getGreeting());
  const [time, setTime] = useState(new Date());
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const updatePlatformSettings = useMutation({
    mutationFn: async (learningAccessEnabled: boolean) => {
      const response = await fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/platform-settings`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ learningAccessEnabled }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to update platform settings");
      }
      return response.json();
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["platform-settings"], updated);
      toast({
        title: updated.learningAccessEnabled ? "Learning access enabled" : "Focus mode enabled",
        description: updated.learningAccessEnabled
          ? "The legacy learning access flag is enabled again."
          : "The platform is now focused on question bank and tests.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Could not update access", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const handleApprove = (id: number, name: string) => {
    setApprovingId(id);
    approveStudent.mutate(
      { id, data: { status: "approved" } },
      {
        onSuccess: () => {
          toast({ title: "Student approved", description: `${name} can now access the platform.` });
          refetch();
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey({ role: "student" }) });
        },
        onError: () => toast({ title: "Failed to approve", variant: "destructive" }),
        onSettled: () => setApprovingId(null),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-36 bg-muted rounded-2xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <div key={i} className="h-28 bg-muted rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-muted rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => <div key={i} className="h-64 bg-muted rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <DashboardScene accent="from-orange-500/18 via-red-500/12 to-violet-500/12">
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-6 text-white shadow-[0_24px_56px_rgba(15,23,42,0.32)]">
          <div className="flex items-start gap-4">
            <div className="mt-0.5 rounded-xl bg-red-500/20 p-3">
              <Activity size={20} className="text-red-200" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold">Unable to load dashboard data</h2>
              <p className="mt-2 text-sm text-white/75">
                {error instanceof Error ? error.message : "Super admin dashboard request failed."}
              </p>
              <div className="mt-4 flex gap-3">
                <Button onClick={() => refetch()} className="bg-white text-slate-900 hover:bg-white/90">
                  Retry
                </Button>
                <Link href="/super-admin/students">
                  <Button variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10">
                    Open Students
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </DashboardScene>
    );
  }

  if (!data) {
    return (
      <DashboardScene accent="from-orange-500/18 via-red-500/12 to-violet-500/12">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-white shadow-[0_24px_56px_rgba(15,23,42,0.32)]">
          <h2 className="text-lg font-semibold">Dashboard data is not available yet</h2>
          <p className="mt-2 text-sm text-white/65">
            Summary cards will appear as soon as dashboard data is available.
          </p>
          <div className="mt-4">
            <Button onClick={() => refetch()} className="bg-white text-slate-900 hover:bg-white/90">
              Refresh
            </Button>
          </div>
        </div>
      </DashboardScene>
    );
  }

  const d = data as any;

  /* chart data */
  const trendData = (d.signupTrend ?? []).map((s: any) => ({
    date: shortDate(s.date),
    Students: s.students,
    Admins: s.admins,
  }));

  return (
    <DashboardScene accent="from-orange-500/18 via-red-500/12 to-violet-500/12">
    <div className="space-y-6">

      {/* ── Hero banner ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-red-950/60 to-orange-900 p-4 sm:p-6 text-white shadow-xl">
        {/* Decorative blobs */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/10 rounded-full -translate-y-24 translate-x-24 blur-2xl" />
        <div className="absolute bottom-0 left-20 w-48 h-48 bg-red-500/10 rounded-full translate-y-16 blur-2xl" />

        <div className="relative z-10 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-white/50 font-medium">Platform Live</span>
              <span className="text-xs text-white/30 ml-2 sm:ml-4">
                {time.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              {greeting}, <span className="text-orange-300">Sameer</span> 👋
            </h1>
            <p className="text-white/50 text-sm mt-1">
              {APP_NAME} Platform — Super Administrator
            </p>

            {/* health badges */}
            <div className="flex flex-wrap gap-2 mt-4">
              {d.liveClasses > 0 && (
                <div className="flex items-center gap-1.5 bg-red-500/20 border border-red-400/30 rounded-full px-3 py-1 text-xs font-medium">
                  <Flame size={11} className="text-red-400" />
                  <span>{d.liveClasses} Live Class{d.liveClasses > 1 ? "es" : ""}</span>
                </div>
              )}
              {d.pendingStudents > 0 && (
                <div className="flex items-center gap-1.5 bg-amber-500/20 border border-amber-400/30 rounded-full px-3 py-1 text-xs font-medium">
                  <Clock size={11} className="text-amber-400" />
                  <span>{d.pendingStudents} Pending Approval{d.pendingStudents > 1 ? "s" : ""}</span>
                </div>
              )}
              {d.openTickets > 0 && (
                <div className="flex items-center gap-1.5 bg-blue-500/20 border border-blue-400/30 rounded-full px-3 py-1 text-xs font-medium">
                  <LifeBuoy size={11} className="text-blue-400" />
                  <span>{d.openTickets} Open Ticket{d.openTickets > 1 ? "s" : ""}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-400/30 rounded-full px-3 py-1 text-xs font-medium">
                <CheckCircle size={11} className="text-emerald-400" />
                <span>{d.approvedStudents} Active Students</span>
              </div>
            </div>
          </div>

          {/* Platform score ring */}
          <div className="relative flex items-center justify-center w-24 h-24 shrink-0">
            <svg className="absolute inset-0 w-full h-full -rotate-90">
              <circle cx="48" cy="48" r="40" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
              <circle
                cx="48" cy="48" r="40" fill="none"
                stroke="url(#scoreGrad)" strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 40}`}
                strokeDashoffset={`${2 * Math.PI * 40 * (1 - Math.min(d.totalStudents / Math.max(d.totalStudents + 10, 1), 1))}`}
                style={{ transition: "stroke-dashoffset 1.2s ease-out" }}
              />
              <defs>
                <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#fb923c" />
                  <stop offset="100%" stopColor="#f97316" />
                </linearGradient>
              </defs>
            </svg>
            <div className="text-center">
              <p className="text-xl font-black">{d.totalStudents}</p>
              <p className="text-[9px] text-white/50 leading-tight">students</p>
            </div>
          </div>
        </div>
      </div>

      <TiltCard>
      <Card className="border-white/10 bg-white/[0.04] shadow-[0_20px_48px_rgba(15,23,42,0.28)] backdrop-blur-xl">
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold">Teacher + Student Learning Access</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Turn off legacy learning flows for teachers and students so current focus stays on question bank and tests.
            </p>
          </div>
          <div className="flex items-center gap-4 rounded-2xl border border-border bg-background/70 px-4 py-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Mode</p>
              <p className="text-sm font-semibold">
                {platformSettings?.learningAccessEnabled ?? true ? "Learning Access On" : "Focus Mode On"}
              </p>
            </div>
            <Switch
              checked={platformSettings?.learningAccessEnabled ?? true}
              onCheckedChange={(checked) => updatePlatformSettings.mutate(checked)}
              disabled={updatePlatformSettings.isPending}
            />
          </div>
        </CardContent>
      </Card>
      </TiltCard>

      {/* ── KPI tiles ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiTile
          title="Total Teachers"
          value={d.totalAdmins}
          icon={<UserCheck size={18} className="text-white" />}
          from="from-blue-600" to="to-cyan-600"
          sub="Admin accounts"
        />
        <KpiTile
          title="Total Students"
          value={d.totalStudents}
          icon={<Users size={18} className="text-white" />}
          from="from-violet-600" to="to-purple-600"
          sub={`${d.approvedStudents} approved`}
        />
        <KpiTile
          title="Total Classes"
          value={d.totalClasses}
          icon={<BookOpen size={18} className="text-white" />}
          from="from-emerald-600" to="to-teal-600"
          sub={`${d.scheduledClasses} scheduled`}
        />
        <KpiTile
          title="Live Right Now"
          value={d.liveClasses}
          icon={<Zap size={18} className="text-white" />}
          from="from-red-600" to="to-orange-600"
          badge={{ label: "LIVE", variant: "default" }}
        />
        <KpiTile
          title="Enrollments"
          value={d.totalEnrollments}
          icon={<GraduationCap size={18} className="text-white" />}
          from="from-amber-500" to="to-orange-500"
          sub="Total class joins"
        />
        <KpiTile
          title="Tests Created"
          value={d.totalTests}
          icon={<ClipboardList size={18} className="text-white" />}
          from="from-fuchsia-600" to="to-pink-600"
          sub="Platform-wide"
        />
        <KpiTile
          title="Assignments"
          value={d.totalAssignments}
          icon={<FileText size={18} className="text-white" />}
          from="from-indigo-600" to="to-blue-600"
          sub="Given by teachers"
        />
        <KpiTile
          title="Pending Approvals"
          value={d.pendingStudents}
          icon={<Clock size={18} className="text-white" />}
          from="from-yellow-500" to="to-amber-600"
          badge={d.pendingStudents > 0 ? { label: "Action", variant: "default" } : undefined}
        />
      </div>

      {/* ── Quick actions ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <QuickAction
          href="/super-admin/admins"
          icon={<Plus size={16} className="text-blue-600" />}
          label="Add Teacher"
          desc="Create admin account"
          color="from-blue-600 to-cyan-600"
        />
        <QuickAction
          href="/super-admin/send-notification"
          icon={<Bell size={16} className="text-violet-600" />}
          label="Broadcast"
          desc="Send notification"
          color="from-violet-600 to-purple-600"
        />
        <QuickAction
          href="/super-admin/teacher-performance"
          icon={<Trophy size={16} className="text-amber-600" />}
          label="Performance"
          desc="Teacher rankings"
          color="from-amber-500 to-orange-500"
        />
        <QuickAction
          href="/super-admin/activity"
          icon={<Activity size={16} className="text-rose-600" />}
          label="Activity"
          desc="Review recent platform activity"
          color="from-rose-600 to-pink-600"
        />
      </div>

      {/* ── 3-column section ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Sign-up trend chart */}
        <TiltCard className="lg:col-span-1">
        <Card className="lg:col-span-1 border-white/10 bg-white/[0.04] shadow-[0_20px_48px_rgba(15,23,42,0.28)] backdrop-blur-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp size={14} className="text-emerald-500" /> 7-Day Signup Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={trendData} margin={{ top: 4, right: 4, left: -30, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gStudents" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gAdmins" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: "11px", borderRadius: "8px" }} />
                  <Area type="monotone" dataKey="Students" stroke="#8b5cf6" fill="url(#gStudents)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="Admins" stroke="#3b82f6" fill="url(#gAdmins)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-40 flex items-center justify-center text-muted-foreground text-xs">No signup data yet</div>
            )}
            <div className="flex gap-4 mt-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-2 h-2 rounded-full bg-violet-500" /> Students
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-2 h-2 rounded-full bg-blue-500" /> Teachers
              </div>
            </div>
          </CardContent>
        </Card>
        </TiltCard>

        {/* Teacher leaderboard */}
        <TiltCard>
        <Card className="border-white/10 bg-white/[0.04] shadow-[0_20px_48px_rgba(15,23,42,0.28)] backdrop-blur-xl">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Trophy size={14} className="text-amber-500" /> Top Teachers
              </CardTitle>
              <Link href="/super-admin/teacher-performance">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-muted-foreground">
                  See all <ArrowRight size={11} />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {(d.topTeachers ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">No teacher activity yet</p>
            ) : (
              <div className="space-y-1">
                {(d.topTeachers ?? []).map((t: any, i: number) => (
                  <TeacherRow key={t.id} teacher={t} rank={i + 1} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        </TiltCard>

        {/* Pending approvals */}
        <TiltCard>
        <Card className="border-amber-200/60 dark:border-amber-800/30 bg-white/[0.04] shadow-[0_20px_48px_rgba(15,23,42,0.28)] backdrop-blur-xl">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock size={14} className="text-amber-500" /> Pending Approvals
                {d.pendingStudents > 0 && (
                  <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {d.pendingStudents}
                  </span>
                )}
              </CardTitle>
              <Link href="/super-admin/students">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-muted-foreground">
                  All <ArrowRight size={11} />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {(d.pendingApprovals ?? []).length === 0 ? (
              <div className="flex flex-col items-center py-5 text-muted-foreground gap-1.5">
                <CheckCircle size={24} className="text-emerald-500 opacity-60" />
                <p className="text-xs">All caught up!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(d.pendingApprovals ?? []).slice(0, 5).map((student: any) => (
                  <div key={student.id} className="flex items-center gap-2.5 p-2 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30">
                    <div className="w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-700 dark:text-amber-300 text-xs font-bold shrink-0">
                      {getInitials(student.fullName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{student.fullName}</p>
                      <p className="text-[10px] text-muted-foreground">@{student.username}</p>
                    </div>
                    <Button
                      size="sm"
                      className="h-6 px-2 text-[10px] bg-emerald-600 hover:bg-emerald-700 shrink-0"
                      disabled={approvingId === student.id}
                      onClick={() => handleApprove(student.id, student.fullName)}
                    >
                      {approvingId === student.id ? (
                        <span className="w-2.5 h-2.5 border border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <CheckCircle size={10} className="mr-0.5" />
                      )}
                      Approve
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        </TiltCard>
      </div>

      {/* ── Bottom row: recent people ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Recent admins */}
        <TiltCard>
        <Card className="border-white/10 bg-white/[0.04] shadow-[0_20px_48px_rgba(15,23,42,0.28)] backdrop-blur-xl">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield size={14} className="text-blue-500" /> Recent Teachers
              </CardTitle>
              <Link href="/super-admin/admins">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-muted-foreground">
                  Manage <ArrowRight size={11} />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {(d.recentAdmins ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No teachers added yet</p>
            ) : (
              (d.recentAdmins ?? []).map((admin: any) => (
                <div key={admin.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/50 transition-colors" data-testid={`admin-item-${admin.id}`}>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {getInitials(admin.fullName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{admin.fullName}</p>
                    <p className="text-[10px] text-muted-foreground">
                      @{admin.username}{admin.subject ? ` · ${admin.subject}` : ""}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-[9px] shrink-0">Admin</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        </TiltCard>

        {/* Recent students */}
        <TiltCard>
        <Card className="border-white/10 bg-white/[0.04] shadow-[0_20px_48px_rgba(15,23,42,0.28)] backdrop-blur-xl">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <GraduationCap size={14} className="text-violet-500" /> Recent Students
              </CardTitle>
              <Link href="/super-admin/students">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-muted-foreground">
                  All <ArrowRight size={11} />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {(d.recentStudents ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No students yet</p>
            ) : (
              (d.recentStudents ?? []).map((student: any) => (
                <div key={student.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/50 transition-colors" data-testid={`student-item-${student.id}`}>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {getInitials(student.fullName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{student.fullName}</p>
                    <p className="text-[10px] text-muted-foreground">@{student.username}</p>
                  </div>
                  <Badge
                    className="text-[9px] shrink-0"
                    variant={student.status === "approved" ? "default" : student.status === "pending" ? "outline" : "destructive"}
                  >
                    {student.status === "approved" && <CheckCircle size={9} className="mr-0.5" />}
                    {student.status}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        </TiltCard>
      </div>

    </div>
    </DashboardScene>
  );
}
