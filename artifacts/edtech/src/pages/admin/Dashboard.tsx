import { useGetAdminDashboard } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BookOpen, Users, Zap, Clock, CalendarClock,
  ArrowRight, Plus, ClipboardList, FileText,
} from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useCountUp } from "@/hooks/useCountUp";
import { DashboardScene, TiltCard } from "@/components/dashboard-3d";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function StatTile({ label, value, icon, gradient, sub, pulse }: {
  label: string; value: number; icon: React.ReactNode; gradient: string; sub?: string; pulse?: boolean;
}) {
  const displayVal = useCountUp(value);
  return (
    <TiltCard className="group">
    <div className={`relative overflow-hidden rounded-2xl p-5 text-white ${gradient} shadow-[0_20px_48px_rgba(15,23,42,0.28)] ring-1 ring-white/15 hover:shadow-xl transition-all duration-200 cursor-default`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.2),transparent_35%)]" />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-white/70 uppercase tracking-wider">{label}</p>
          <p className="text-4xl font-bold mt-1 leading-none tabular-nums">{displayVal}</p>
          {sub && <p className="text-xs text-white/55 mt-1">{sub}</p>}
        </div>
        <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">{icon}</div>
      </div>
      {pulse && (
        <div className="absolute top-3 right-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
          </span>
        </div>
      )}
      <div className="absolute -bottom-4 -right-4 w-20 h-20 rounded-full bg-white/8" />
      <div className="absolute -bottom-2 -right-8 w-28 h-28 rounded-full bg-white/5" />
    </div>
    </TiltCard>
  );
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const { data, isLoading } = useGetAdminDashboard();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-36 bg-muted rounded-2xl animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-muted rounded-2xl animate-pulse" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[...Array(2)].map((_, i) => <div key={i} className="h-52 bg-muted rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const firstName = user?.fullName?.split(" ")[0] ?? "there";

  return (
    <DashboardScene accent="from-cyan-500/16 via-blue-500/10 to-emerald-500/14">
    <div className="space-y-6">
      {/* ── Hero ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-cyan-600 to-teal-600 p-6 text-white shadow-lg">
        <div className="relative z-10">
          <p className="text-sm font-medium text-white/65">{greeting()},</p>
          <h1 className="text-2xl sm:text-3xl font-bold mt-0.5">{firstName} 👋</h1>
          <p className="text-white/60 text-sm mt-2 max-w-md">
            Managing <span className="text-white font-semibold">{data.totalClasses}</span> {data.totalClasses === 1 ? "class" : "classes"} with <span className="text-white font-semibold">{data.totalStudents}</span> {data.totalStudents === 1 ? "student" : "students"}
            {data.pendingStudents > 0 && <> · <span className="text-yellow-300 font-semibold">{data.pendingStudents} pending approval</span></>}.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            <Link href="/admin/classes">
              <Button size="sm" className="bg-white/18 hover:bg-white/28 text-white border-0 gap-1.5 text-xs backdrop-blur-sm h-8 shadow-sm">
                <Plus size={13} /> New Class
              </Button>
            </Link>
            <Link href="/admin/tests">
              <Button size="sm" className="bg-white/18 hover:bg-white/28 text-white border-0 gap-1.5 text-xs backdrop-blur-sm h-8 shadow-sm">
                <ClipboardList size={13} /> Tests
              </Button>
            </Link>
            <Link href="/admin/assignments">
              <Button size="sm" className="bg-white/18 hover:bg-white/28 text-white border-0 gap-1.5 text-xs backdrop-blur-sm h-8 shadow-sm">
                <FileText size={13} /> Assignments
              </Button>
            </Link>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-52 h-52 bg-white/5 rounded-full -translate-y-14 translate-x-14" />
        <div className="absolute bottom-0 right-16 w-36 h-36 bg-white/4 rounded-full translate-y-12" />
        <div className="absolute top-1/2 right-4 w-20 h-20 bg-white/3 rounded-full -translate-y-1/2" />
      </div>

      {/* ── Stat tiles ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="My Classes" value={data.totalClasses}
          icon={<BookOpen size={18} className="text-white" />}
          gradient="bg-gradient-to-br from-blue-500 to-blue-700"
        />
        <StatTile
          label="Live Now" value={data.liveClasses}
          icon={<Zap size={18} className="text-white" />}
          gradient={data.liveClasses > 0 ? "bg-gradient-to-br from-red-500 to-rose-700" : "bg-gradient-to-br from-slate-400 to-slate-600"}
          pulse={data.liveClasses > 0}
        />
        <StatTile
          label="My Students" value={data.totalStudents}
          icon={<Users size={18} className="text-white" />}
          gradient="bg-gradient-to-br from-violet-500 to-purple-700"
        />
        <StatTile
          label="Pending Approval" value={data.pendingStudents}
          icon={<Clock size={18} className="text-white" />}
          gradient={data.pendingStudents > 0 ? "bg-gradient-to-br from-amber-500 to-orange-600" : "bg-gradient-to-br from-emerald-500 to-teal-600"}
          sub={data.pendingStudents > 0 ? "needs action" : "all clear"}
        />
      </div>

      {/* ── Live CTA ── */}
      {data.liveClasses > 0 && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-red-500 to-rose-600 p-4 text-white shadow-md">
          <div className="flex items-center justify-between gap-4 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
                </span>
              </div>
              <div>
                <p className="font-bold text-base">You have a live class!</p>
                <p className="text-white/70 text-xs">{data.liveClasses} session{data.liveClasses > 1 ? "s" : ""} streaming</p>
              </div>
            </div>
            <Link href="/admin/classes">
              <Button size="sm" className="bg-white text-red-600 hover:bg-white/90 font-semibold gap-1.5 shadow-md">
                Go Live <ArrowRight size={13} />
              </Button>
            </Link>
          </div>
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/6 rounded-full" />
        </div>
      )}

      {/* ── Upcoming + Students ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <TiltCard>
        <Card className="overflow-hidden border-white/10 bg-white/[0.04] shadow-[0_20px_48px_rgba(15,23,42,0.28)] backdrop-blur-xl transition-shadow duration-200">
          <CardHeader className="pb-3 border-b bg-muted/30">
            <CardTitle className="text-sm flex items-center gap-2">
              <CalendarClock size={15} className="text-blue-500" />
              Upcoming Classes
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {data.upcomingClasses.length === 0 ? (
              <div className="flex flex-col items-center py-6 text-muted-foreground">
                <CalendarClock size={28} className="opacity-20 mb-2" />
                <p className="text-sm">No upcoming classes</p>
                <Link href="/admin/classes">
                  <Button variant="outline" size="sm" className="mt-3 text-xs gap-1.5"><Plus size={12} /> Create a Class</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {data.upcomingClasses.map((cls) => (
                  <div
                    key={cls.id}
                    data-testid={`upcoming-class-${cls.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border/50 hover:bg-muted/60 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                      <BookOpen size={15} className="text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{cls.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {cls.subject}{cls.scheduledAt ? ` · ${format(new Date(cls.scheduledAt), "MMM d, h:mm a")}` : ""}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[11px] shrink-0">{cls.enrolledCount} students</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        </TiltCard>

        <TiltCard>
        <Card className="overflow-hidden border-white/10 bg-white/[0.04] shadow-[0_20px_48px_rgba(15,23,42,0.28)] backdrop-blur-xl transition-shadow duration-200">
          <CardHeader className="pb-3 border-b bg-muted/30">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users size={15} className="text-violet-500" />
                Recent Students
              </CardTitle>
              {data.pendingStudents > 0 && (
                <Link href="/admin/students">
                  <Badge className="text-[11px] bg-amber-500 hover:bg-amber-600 cursor-pointer gap-1 transition-colors">
                    <Clock size={10} /> {data.pendingStudents} pending
                  </Badge>
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {data.recentStudents.length === 0 ? (
              <div className="flex flex-col items-center py-6 text-muted-foreground">
                <Users size={28} className="opacity-20 mb-2" />
                <p className="text-sm">No students yet</p>
              </div>
            ) : (
              <div className="space-y-1">
                {data.recentStudents.map((student) => {
                  const initials = student.fullName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
                  return (
                    <div
                      key={student.id}
                      data-testid={`recent-student-${student.id}`}
                      className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/50 transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{student.fullName}</p>
                        <p className="text-xs text-muted-foreground">@{student.username}</p>
                      </div>
                      <Badge
                        variant={student.status === "pending" ? "outline" : "default"}
                        className={`text-[11px] shrink-0 ${student.status === "pending" ? "border-amber-300 text-amber-600 dark:text-amber-400" : "bg-green-500 hover:bg-green-500"}`}
                      >
                        {student.status}
                      </Badge>
                    </div>
                  );
                })}
                <Link href="/admin/students">
                  <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground mt-1 gap-1.5 hover:text-foreground">
                    View all students <ArrowRight size={11} />
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
        </TiltCard>
      </div>
    </div>
    </DashboardScene>
  );
}
