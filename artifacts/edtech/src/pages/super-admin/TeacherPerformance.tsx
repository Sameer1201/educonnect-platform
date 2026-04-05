import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  Trophy, BookOpen, Users, ClipboardList, FileText, CalendarCheck,
  Star, TrendingUp, ChevronUp, ChevronDown, ChevronsUpDown,
  GraduationCap, Zap, CheckCircle, Medal,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface TeacherStat {
  id: number;
  fullName: string;
  username: string;
  subject: string | null;
  email: string | null;
  status: string;
  classesCount: number;
  uniqueStudents: number;
  testsCount: number;
  assignmentsCount: number;
  attendanceSessions: number;
  liveClasses: number;
  completedClasses: number;
  testSubmissions: number;
  assignmentSubmissions: number;
  avgScore: number | null;
  avgRating: number | null;
  feedbackCount: number;
  workloadScore: number;
}

type SortKey =
  | "workloadScore"
  | "classesCount"
  | "uniqueStudents"
  | "testsCount"
  | "assignmentsCount"
  | "attendanceSessions"
  | "avgRating";

const SORT_OPTIONS: { key: SortKey; label: string; icon: React.ReactNode }[] = [
  { key: "workloadScore", label: "Workload Score", icon: <Zap size={13} /> },
  { key: "classesCount", label: "Classes", icon: <BookOpen size={13} /> },
  { key: "uniqueStudents", label: "Students", icon: <Users size={13} /> },
  { key: "testsCount", label: "Tests", icon: <ClipboardList size={13} /> },
  { key: "assignmentsCount", label: "Assignments", icon: <FileText size={13} /> },
  { key: "attendanceSessions", label: "Attendance", icon: <CalendarCheck size={13} /> },
  { key: "avgRating", label: "Avg Rating", icon: <Star size={13} /> },
];

const RANK_COLORS = [
  "from-amber-400 to-yellow-500",
  "from-slate-400 to-slate-500",
  "from-orange-400 to-amber-600",
];

const BAR_COLORS = [
  "#8b5cf6", "#6366f1", "#3b82f6", "#06b6d4",
  "#10b981", "#84cc16", "#f59e0b", "#ef4444",
];

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function MetricPill({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${color} text-xs font-medium`}>
      {icon}
      <span>{label}:</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}

function StarRatingDisplay({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={11}
          className={i <= Math.round(value) ? "text-amber-400 fill-amber-400" : "text-muted-foreground/30"}
        />
      ))}
      <span className="ml-1 text-xs text-muted-foreground">{value.toFixed(1)}</span>
    </div>
  );
}

function SortButton({ label, sortKey, current, dir, onChange }: {
  label: string; sortKey: SortKey; current: SortKey; dir: "asc" | "desc";
  onChange: (key: SortKey) => void;
}) {
  const isActive = current === sortKey;
  return (
    <Button
      variant={isActive ? "default" : "outline"}
      size="sm"
      className={`gap-1 text-xs h-8 ${isActive ? "" : "text-muted-foreground"}`}
      onClick={() => onChange(sortKey)}
    >
      {label}
      {isActive ? (
        dir === "desc" ? <ChevronDown size={12} /> : <ChevronUp size={12} />
      ) : (
        <ChevronsUpDown size={12} className="opacity-40" />
      )}
    </Button>
  );
}

export default function TeacherPerformance() {
  const [sortBy, setSortBy] = useState<SortKey>("workloadScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [chartMetric, setChartMetric] = useState<SortKey>("workloadScore");
  const [view, setView] = useState<"cards" | "table">("cards");

  const { data: teachers = [], isLoading } = useQuery<TeacherStat[]>({
    queryKey: ["teacher-performance"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/teacher-performance`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch");
      return r.json();
    },
    staleTime: 30000,
  });

  const handleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortBy(key); setSortDir("desc"); }
  };

  const sorted = [...teachers].sort((a, b) => {
    const av = (a[sortBy] as number) ?? -1;
    const bv = (b[sortBy] as number) ?? -1;
    return sortDir === "desc" ? bv - av : av - bv;
  });

  const chartData = [...teachers]
    .sort((a, b) => ((b[chartMetric] as number) ?? 0) - ((a[chartMetric] as number) ?? 0))
    .slice(0, 10)
    .map((t) => ({
      name: t.fullName.split(" ")[0],
      value: (t[chartMetric] as number) ?? 0,
    }));

  const chartLabel = SORT_OPTIONS.find((o) => o.key === chartMetric)?.label ?? chartMetric;

  const maxScore = teachers.length > 0 ? Math.max(...teachers.map((t) => t.workloadScore)) : 1;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-36 bg-muted rounded-2xl animate-pulse" />
        <div className="grid gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-muted rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 p-6 text-white shadow-lg">
        <div className="relative z-10 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-white/60 text-sm mb-1">
              <Trophy size={14} /> Teacher Rankings
            </div>
            <h1 className="text-2xl font-bold">Teacher Performance</h1>
            <p className="text-white/60 text-sm mt-1">
              See which teachers are contributing the most — ranked by classes, students, tests, and more.
            </p>
          </div>
          <div className="flex gap-3 flex-wrap shrink-0">
            <div className="bg-white/10 rounded-xl px-4 py-2.5 text-center">
              <p className="text-xl font-bold">{teachers.length}</p>
              <p className="text-xs text-white/60">Teachers</p>
            </div>
            <div className="bg-white/10 rounded-xl px-4 py-2.5 text-center">
              <p className="text-xl font-bold">{teachers.reduce((a, t) => a + t.classesCount, 0)}</p>
              <p className="text-xs text-white/60">Total Classes</p>
            </div>
            <div className="bg-white/10 rounded-xl px-4 py-2.5 text-center">
              <p className="text-xl font-bold">{teachers.reduce((a, t) => a + t.uniqueStudents, 0)}</p>
              <p className="text-xs text-white/60">Total Students</p>
            </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-12 translate-x-12" />
      </div>

      {/* Sort + View controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium mr-1">Sort by:</span>
        {SORT_OPTIONS.map((o) => (
          <SortButton
            key={o.key}
            label={o.label}
            sortKey={o.key}
            current={sortBy}
            dir={sortDir}
            onChange={handleSort}
          />
        ))}
        <div className="ml-auto flex gap-2">
          <Button variant={view === "cards" ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setView("cards")}>Cards</Button>
          <Button variant={view === "table" ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setView("table")}>Table</Button>
        </div>
      </div>

      {teachers.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <GraduationCap size={44} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">No admin/teacher accounts found.</p>
          </CardContent>
        </Card>
      ) : view === "cards" ? (
        /* ========== Cards view ========== */
        <div className="space-y-3">
          {sorted.map((teacher, idx) => {
            const pct = maxScore > 0 ? Math.round((teacher.workloadScore / maxScore) * 100) : 0;
            const rankColor = idx < 3 ? RANK_COLORS[idx] : null;

            return (
              <Card
                key={teacher.id}
                className="hover:shadow-md transition-shadow duration-150"
                data-testid={`teacher-row-${teacher.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Rank badge */}
                    <div className="shrink-0 flex flex-col items-center gap-1 w-10">
                      {rankColor ? (
                        <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${rankColor} flex items-center justify-center text-white shadow`}>
                          {idx === 0 ? <Trophy size={16} /> : idx === 1 ? <Medal size={16} /> : <Medal size={14} />}
                        </div>
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-sm font-bold">
                          {idx + 1}
                        </div>
                      )}
                    </div>

                    {/* Avatar + info */}
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                      {getInitials(teacher.fullName)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className="font-semibold text-sm">{teacher.fullName}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-xs text-muted-foreground">@{teacher.username}</span>
                            {teacher.subject && (
                              <Badge variant="secondary" className="text-[10px]">{teacher.subject}</Badge>
                            )}
                            {teacher.status !== "approved" && (
                              <Badge variant="destructive" className="text-[10px]">{teacher.status}</Badge>
                            )}
                          </div>
                          {teacher.avgRating !== null && (
                            <div className="mt-1">
                              <StarRatingDisplay value={teacher.avgRating} />
                            </div>
                          )}
                        </div>

                        {/* Workload score */}
                        <div className="text-right shrink-0">
                          <div className="flex items-center gap-1.5 justify-end">
                            <Zap size={14} className="text-violet-500" />
                            <span className="text-lg font-bold text-violet-600">{teacher.workloadScore}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground">workload pts</p>
                        </div>
                      </div>

                      {/* Workload bar */}
                      <div className="mt-3 mb-3">
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{pct}% of top teacher</p>
                      </div>

                      {/* Metric pills */}
                      <div className="flex flex-wrap gap-2">
                        <MetricPill
                          icon={<BookOpen size={11} />}
                          label="Classes"
                          value={teacher.classesCount}
                          color="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300"
                        />
                        <MetricPill
                          icon={<Users size={11} />}
                          label="Students"
                          value={teacher.uniqueStudents}
                          color="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                        />
                        <MetricPill
                          icon={<ClipboardList size={11} />}
                          label="Tests"
                          value={teacher.testsCount}
                          color="border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-300"
                        />
                        <MetricPill
                          icon={<FileText size={11} />}
                          label="Assignments"
                          value={teacher.assignmentsCount}
                          color="border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-800 dark:bg-pink-950/30 dark:text-pink-300"
                        />
                        <MetricPill
                          icon={<CalendarCheck size={11} />}
                          label="Attendance"
                          value={teacher.attendanceSessions}
                          color="border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-300"
                        />
                        {teacher.completedClasses > 0 && (
                          <MetricPill
                            icon={<CheckCircle size={11} />}
                            label="Completed"
                            value={teacher.completedClasses}
                            color="border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950/30 dark:text-teal-300"
                          />
                        )}
                        {teacher.avgScore !== null && (
                          <MetricPill
                            icon={<TrendingUp size={11} />}
                            label="Avg Score"
                            value={`${teacher.avgScore}%`}
                            color="border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        /* ========== Table view ========== */
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground w-10">#</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Teacher</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground">Classes</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground">Students</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground">Tests</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground">Assignments</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground">Attendance</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground">Avg Score</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground">Rating</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-violet-600">Workload ↓</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((teacher, idx) => (
                  <tr key={teacher.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors" data-testid={`teacher-table-row-${teacher.id}`}>
                    <td className="px-4 py-3 text-center">
                      {idx === 0 ? <Trophy size={14} className="text-amber-500 mx-auto" />
                        : idx === 1 ? <Medal size={14} className="text-slate-400 mx-auto" />
                        : idx === 2 ? <Medal size={14} className="text-orange-400 mx-auto" />
                        : <span className="text-muted-foreground text-xs">{idx + 1}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {getInitials(teacher.fullName)}
                        </div>
                        <div>
                          <p className="font-medium text-xs">{teacher.fullName}</p>
                          {teacher.subject && <p className="text-[10px] text-muted-foreground">{teacher.subject}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center font-semibold">{teacher.classesCount}</td>
                    <td className="px-3 py-3 text-center font-semibold text-emerald-600">{teacher.uniqueStudents}</td>
                    <td className="px-3 py-3 text-center font-semibold">{teacher.testsCount}</td>
                    <td className="px-3 py-3 text-center font-semibold">{teacher.assignmentsCount}</td>
                    <td className="px-3 py-3 text-center font-semibold">{teacher.attendanceSessions}</td>
                    <td className="px-3 py-3 text-center">
                      {teacher.avgScore !== null ? <span className="text-violet-600 font-semibold">{teacher.avgScore}%</span> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {teacher.avgRating !== null ? <StarRatingDisplay value={teacher.avgRating} /> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="font-bold text-violet-600">{teacher.workloadScore}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Bar chart comparison */}
      {teachers.length > 1 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart className="w-4 h-4 text-violet-500" /> Teacher Comparison Chart
              </CardTitle>
              <div className="flex gap-1.5 flex-wrap">
                {SORT_OPTIONS.slice(0, 5).map((o) => (
                  <Button
                    key={o.key}
                    variant={chartMetric === o.key ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-[11px] gap-1"
                    onClick={() => setChartMetric(o.key)}
                  >
                    {o.icon} {o.label}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ fontSize: "12px", borderRadius: "8px" }}
                  formatter={(v) => [v, chartLabel]}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={40}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
