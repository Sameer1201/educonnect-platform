import { useGetStudentDashboard } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BookOpen, Zap, CalendarClock, ClipboardList, Clock, ArrowRight,
  AlertTriangle, BarChart2, Trophy, MessageSquare, FileText,
} from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useCountUp } from "@/hooks/useCountUp";
import { DashboardScene, TiltCard } from "@/components/dashboard-3d";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function StatTile({ label, value, icon, gradient, pulse }: {
  label: string; value: number; icon: React.ReactNode; gradient: string; pulse?: boolean;
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

export default function StudentDashboard() {
  const { user } = useAuth();
  const { data, isLoading } = useGetStudentDashboard();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-36 bg-muted rounded-2xl animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-muted rounded-2xl animate-pulse" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[...Array(2)].map((_, i) => <div key={i} className="h-52 bg-muted rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const pendingTests = (data as any).pendingTests ?? [];
  const liveClasses = data.liveClasses ?? 0;
  const firstName = user?.fullName?.split(" ")[0] ?? "there";

  return (
    <DashboardScene accent="from-violet-500/20 via-fuchsia-500/10 to-blue-500/16">
    <div className="space-y-6">
      {/* ── Hero ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 p-6 text-white shadow-lg">
        <div className="relative z-10">
          <p className="text-sm font-medium text-white/65">{greeting()},</p>
          <h1 className="text-2xl sm:text-3xl font-bold mt-0.5">{firstName} 👋</h1>
          <p className="text-white/60 text-sm mt-2 max-w-md">
            {data.enrolledClasses > 0
              ? <>Enrolled in <span className="text-white font-semibold">{data.enrolledClasses}</span> {data.enrolledClasses === 1 ? "class" : "classes"}{pendingTests.length > 0 && <> · <span className="text-yellow-300 font-semibold">{pendingTests.length} test{pendingTests.length > 1 ? "s" : ""} pending</span></>}</>
              : "Browse classes and start your learning journey!"}
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            <Link href="/student/progress">
              <Button size="sm" className="bg-white/18 hover:bg-white/28 text-white border-0 gap-1.5 text-xs backdrop-blur-sm h-8 shadow-sm">
                <BarChart2 size={13} /> My Progress
              </Button>
            </Link>
            <Link href="/leaderboard">
              <Button size="sm" className="bg-white/18 hover:bg-white/28 text-white border-0 gap-1.5 text-xs backdrop-blur-sm h-8 shadow-sm">
                <Trophy size={13} /> Leaderboard
              </Button>
            </Link>
            <Link href="/community">
              <Button size="sm" className="bg-white/18 hover:bg-white/28 text-white border-0 gap-1.5 text-xs backdrop-blur-sm h-8 shadow-sm">
                <MessageSquare size={13} /> Community
              </Button>
            </Link>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-52 h-52 bg-white/5 rounded-full -translate-y-14 translate-x-14" />
        <div className="absolute bottom-0 right-16 w-36 h-36 bg-white/4 rounded-full translate-y-12" />
        <div className="absolute top-1/2 right-4 w-20 h-20 bg-white/3 rounded-full -translate-y-1/2" />
      </div>

      {/* ── Stat tiles ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile
          label="Enrolled Classes" value={data.enrolledClasses}
          icon={<BookOpen size={18} className="text-white" />}
          gradient="bg-gradient-to-br from-blue-500 to-blue-700"
        />
        <StatTile
          label="Live Now" value={liveClasses}
          icon={<Zap size={18} className="text-white" />}
          gradient={liveClasses > 0 ? "bg-gradient-to-br from-red-500 to-rose-700" : "bg-gradient-to-br from-slate-400 to-slate-600"}
          pulse={liveClasses > 0}
        />
        <StatTile
          label="Pending Tests" value={pendingTests.length}
          icon={<ClipboardList size={18} className="text-white" />}
          gradient={pendingTests.length > 0 ? "bg-gradient-to-br from-amber-500 to-orange-600" : "bg-gradient-to-br from-emerald-500 to-teal-600"}
        />
        <StatTile
          label="My Assignments" value={data.availableClasses?.length ?? 0}
          icon={<FileText size={18} className="text-white" />}
          gradient="bg-gradient-to-br from-violet-500 to-purple-700"
        />
      </div>

      {/* ── Live class urgent CTA ── */}
      {liveClasses > 0 && (
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
                <p className="font-bold text-base">Class is Live Now!</p>
                <p className="text-white/70 text-xs">{liveClasses} session{liveClasses > 1 ? "s" : ""} streaming</p>
              </div>
            </div>
            <Link href="/student/classes">
              <Button size="sm" className="bg-white text-red-600 hover:bg-white/90 font-semibold gap-1.5 shadow-md">
                Join Now <ArrowRight size={13} />
              </Button>
            </Link>
          </div>
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/6 rounded-full" />
        </div>
      )}

      {/* ── Pending tests ── */}
      {pendingTests.length > 0 && (
        <TiltCard>
        <Card className="border-amber-200 bg-gradient-to-br from-amber-50/80 to-orange-50/60 dark:from-amber-950/30 dark:to-orange-950/20 dark:border-amber-800 shadow-[0_20px_50px_rgba(120,53,15,0.18)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-800 dark:text-amber-300">
              <AlertTriangle size={15} className="text-amber-500" />
              Tests awaiting you
              <Badge className="ml-auto bg-amber-500 hover:bg-amber-500 text-white text-xs">{pendingTests.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingTests.map((test: any) => (
                <TiltCard>
                <Link
                  key={test.id}
                  href="/student/tests"
                  data-testid={`pending-test-${test.id}`}
                  className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-amber-950/40 border border-amber-200 dark:border-amber-700 hover:border-amber-400 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold truncate">{test.title}</p>
                      {test.className && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 font-medium shrink-0">
                          {test.className}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {test.durationMinutes && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock size={11} /> {test.durationMinutes} min</span>
                      )}
                      {test.scheduledAt && (
                        <span className="text-xs text-muted-foreground">{format(new Date(test.scheduledAt), "MMM d, h:mm a")}</span>
                      )}
                    </div>
                  </div>
                  <span className="flex items-center gap-1 text-xs text-amber-600 font-semibold shrink-0 ml-3 group-hover:gap-2 transition-all">
                    Take Test <ArrowRight size={12} />
                  </span>
                </Link>
                </TiltCard>
              ))}
            </div>
            <div className="mt-3">
              <Link href="/student/tests">
                <Button variant="outline" size="sm" className="w-full border-amber-300 text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-xs">
                  View All Tests
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
        </TiltCard>
      )}

      {/* ── Class grids ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <TiltCard>
        <Card className="overflow-hidden border-white/10 bg-white/[0.04] shadow-[0_20px_48px_rgba(15,23,42,0.28)] backdrop-blur-xl transition-shadow duration-200">
          <CardHeader className="pb-3 border-b bg-muted/30">
            <CardTitle className="text-sm flex items-center gap-2">
              <CalendarClock size={15} className="text-violet-500" />
              Upcoming Classes
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {data.upcomingClasses.length === 0 ? (
              <div className="flex flex-col items-center py-6 text-muted-foreground">
                <CalendarClock size={28} className="opacity-20 mb-2" />
                <p className="text-sm">No upcoming classes scheduled</p>
              </div>
            ) : (
              <div className="space-y-2">
                {data.upcomingClasses.map((cls) => (
                  <div
                    key={cls.id}
                    data-testid={`upcoming-class-${cls.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border/50 hover:bg-muted/60 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                      <BookOpen size={15} className="text-violet-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{cls.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {cls.subject}{cls.scheduledAt ? ` · ${format(new Date(cls.scheduledAt), "MMM d, h:mm a")}` : ""}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[11px] shrink-0">Scheduled</Badge>
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
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen size={15} className="text-blue-500" />
              Browse Classes
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {data.availableClasses.length === 0 ? (
              <div className="flex flex-col items-center py-6 text-muted-foreground">
                <BookOpen size={28} className="opacity-20 mb-2" />
                <p className="text-sm">No classes available right now</p>
              </div>
            ) : (
              <div className="space-y-2">
                {data.availableClasses.slice(0, 5).map((cls) => (
                  <Link
                    href={`/student/class/${cls.id}`}
                    key={cls.id}
                    data-testid={`available-class-${cls.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl border border-border/50 hover:border-blue-300 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-150 group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                      <BookOpen size={15} className="text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{cls.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{cls.subject} · by {cls.adminName}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {cls.status === "live" ? (
                        <Badge className="bg-red-500 hover:bg-red-500 text-white text-[11px] gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse inline-block" />Live
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[11px]">{cls.status}</Badge>
                      )}
                      <ArrowRight size={13} className="text-muted-foreground/30 group-hover:text-blue-500 transition-colors" />
                    </div>
                  </Link>
                ))}
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
