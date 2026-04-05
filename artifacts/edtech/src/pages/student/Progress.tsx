import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, Legend, PieChart, Pie,
} from "recharts";
import {
  BookOpen, ClipboardList, FileText, UserCheck, TrendingUp, TrendingDown,
  Minus, Award, Flame, Target, Lightbulb, AlertCircle, CheckCircle, Info,
  Download, Star, ChevronRight, BarChart2, Zap, Brain,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRef } from "react";

/* ── helpers ── */
const gradeColor: Record<string, string> = { A: "#22c55e", B: "#3b82f6", C: "#f59e0b", D: "#f97316", F: "#ef4444" };
const pctColor = (p: number) => p >= 80 ? "#22c55e" : p >= 60 ? "#3b82f6" : p >= 40 ? "#f59e0b" : "#ef4444";

function GradeRing({ score, letter }: { score: number; letter: string }) {
  const r = 52, cx = 64, cy = 64;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = gradeColor[letter] ?? "#94a3b8";
  return (
    <svg width={128} height={128} className="drop-shadow-sm">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={10} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={10}
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} style={{ transition: "stroke-dasharray 0.8s ease" }} />
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize={28} fontWeight={700} fill={color}>{letter}</text>
      <text x={cx} y={cy + 16} textAnchor="middle" fontSize={13} fill="#64748b">{score}%</text>
    </svg>
  );
}

function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold leading-tight">{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function TrendBadge({ trend }: { trend: string }) {
  if (trend === "improving") return (
    <Badge className="gap-1 bg-green-100 text-green-700 hover:bg-green-100 border-green-200">
      <TrendingUp size={13} /> Improving
    </Badge>
  );
  if (trend === "declining") return (
    <Badge className="gap-1 bg-red-100 text-red-700 hover:bg-red-100 border-red-200">
      <TrendingDown size={13} /> Needs attention
    </Badge>
  );
  return (
    <Badge className="gap-1 bg-slate-100 text-slate-600 hover:bg-slate-100 border-slate-200">
      <Minus size={13} /> Stable
    </Badge>
  );
}

function RecCard({ type, text }: { type: string; text: string }) {
  const map = {
    success: { icon: <CheckCircle size={16} />, bg: "bg-green-50 border-green-200", text: "text-green-700" },
    warning: { icon: <AlertCircle size={16} />, bg: "bg-amber-50 border-amber-200", text: "text-amber-700" },
    info: { icon: <Info size={16} />, bg: "bg-blue-50 border-blue-200", text: "text-blue-700" },
  }[type] ?? { icon: <Info size={16} />, bg: "bg-slate-50 border-slate-200", text: "text-slate-700" };
  return (
    <div className={`flex gap-3 p-3 rounded-lg border ${map.bg}`}>
      <span className={`${map.text} mt-0.5 shrink-0`}>{map.icon}</span>
      <p className={`text-sm ${map.text}`}>{text}</p>
    </div>
  );
}

function printReport(ref: React.RefObject<HTMLDivElement | null>) {
  if (!ref.current) return;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<html><head><title>Progress Report</title>
    <style>body{font-family:sans-serif;padding:24px;color:#1e293b}
    h1{font-size:22px;margin-bottom:4px}h2{font-size:15px;color:#64748b;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;margin-bottom:16px}
    th,td{text-align:left;padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:13px}
    th{background:#f8fafc;font-weight:600}.badge{display:inline-block;padding:2px 8px;border-radius:9999px;font-size:12px}
    .green{background:#dcfce7;color:#166534}.yellow{background:#fef9c3;color:#713f12}
    .red{background:#fee2e2;color:#991b1b}.blue{background:#dbeafe;color:#1e40af}
    .card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;margin-bottom:12px}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
    .stat{padding:12px;background:#fff;border:1px solid #e2e8f0;border-radius:8px}
    .stat-val{font-size:22px;font-weight:700;margin:4px 0}
    .stat-lbl{font-size:11px;color:#64748b}</style></head><body>`);
  win.document.write(ref.current.innerHTML);
  win.document.write("</body></html>");
  win.document.close();
  setTimeout(() => { win.print(); }, 400);
}

export default function StudentProgress() {
  const { user } = useAuth();
  const reportRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["progress", user?.id],
    queryFn: () => api.get(`/progress/${user!.id}`),
    enabled: !!user?.id,
  });

  if (isLoading) return (
    <div className="space-y-4">
      <div className="h-8 w-40 bg-muted animate-pulse rounded" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}
      </div>
    </div>
  );

  if (!data) return null;

  const {
    summary, gradeDistribution, weeklyTrend, monthlyAttendance,
    subjectBreakdown, recommendations, tests, assignments, attendance,
  } = data;

  /* ── derived chart data ── */
  const testLineData = tests.slice(-20).map((t: any) => ({
    name: (t.testTitle ?? "Test").slice(0, 14),
    score: t.percentage,
  }));

  const attByClass = new Map<string, { present: number; total: number }>();
  for (const a of attendance) {
    const key = a.className ?? "Unknown";
    if (!attByClass.has(key)) attByClass.set(key, { present: 0, total: 0 });
    const c = attByClass.get(key)!; c.total++;
    if (a.status === "present") c.present++;
  }
  const attClassData = [...attByClass.entries()].map(([name, v]) => ({
    name: name.slice(0, 12),
    pct: v.total > 0 ? Math.round((v.present / v.total) * 100) : 0,
  }));

  const pieData = [
    { name: "A (≥90%)", value: gradeDistribution.A, fill: "#22c55e" },
    { name: "B (≥80%)", value: gradeDistribution.B, fill: "#3b82f6" },
    { name: "C (≥70%)", value: gradeDistribution.C, fill: "#f59e0b" },
    { name: "D (≥60%)", value: gradeDistribution.D, fill: "#f97316" },
    { name: "F (<60%)", value: gradeDistribution.F, fill: "#ef4444" },
  ].filter((d) => d.value > 0);

  const radarData = subjectBreakdown.map((s: any) => ({
    subject: s.className.slice(0, 10),
    Tests: s.avgTestScore ?? 0,
    Attendance: s.attPct ?? 0,
    Assignments: s.avgAssignGrade ?? 0,
  }));

  const strengths = subjectBreakdown.filter((s: any) => (s.composite ?? 0) >= 70);
  const weakAreas = subjectBreakdown.filter((s: any) => (s.composite ?? 0) < 60);

  const recentActivity = [
    ...tests.slice(-5).map((t: any) => ({ type: "test", title: t.testTitle ?? "Test", score: `${t.percentage}%`, date: t.submittedAt })),
    ...assignments.slice(-5).filter((a: any) => a.grade !== null).map((a: any) => ({ type: "assignment", title: a.title ?? "Assignment", score: `${a.grade}/${a.maxMarks}`, date: a.submittedAt })),
  ].sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()).slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">My Progress</h1>
          <p className="text-sm text-muted-foreground">Detailed analytics & learning path for {user?.fullName}</p>
        </div>
        <div className="flex items-center gap-2">
          <TrendBadge trend={summary.trend} />
          {summary.streak.current > 0 && (
            <Badge className="gap-1 bg-orange-100 text-orange-700 hover:bg-orange-100 border-orange-200">
              <Flame size={13} /> {summary.streak.current}-day streak
            </Badge>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="overview" className="flex items-center gap-1.5 text-xs"><BarChart2 size={13} />Overview</TabsTrigger>
          <TabsTrigger value="trends" className="flex items-center gap-1.5 text-xs"><TrendingUp size={13} />Trends</TabsTrigger>
          <TabsTrigger value="subjects" className="flex items-center gap-1.5 text-xs"><BookOpen size={13} />Subjects</TabsTrigger>
          <TabsTrigger value="path" className="flex items-center gap-1.5 text-xs"><Brain size={13} />Learning Path</TabsTrigger>
          <TabsTrigger value="report" className="flex items-center gap-1.5 text-xs"><FileText size={13} />Full Report</TabsTrigger>
        </TabsList>

        {/* ── TAB 1: OVERVIEW ── */}
        <TabsContent value="overview" className="space-y-5">
          {/* Hero: Grade Ring + Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-5">
            <Card className="flex flex-col items-center justify-center p-5 min-w-[180px]">
              <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Overall Grade</p>
              <GradeRing score={summary.compositeScore} letter={summary.gradeLetter} />
              <p className="text-xs text-muted-foreground mt-2 text-center">Based on tests · assignments · attendance</p>
            </Card>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard icon={<BookOpen size={17} />} label="Classes" value={`${summary.enrolledClasses}`} color="bg-blue-50 text-blue-600" />
              <StatCard icon={<ClipboardList size={17} />} label="Tests Done" value={`${summary.testsCompleted}`} color="bg-purple-50 text-purple-600" />
              <StatCard icon={<TrendingUp size={17} />} label="Avg Test Score" value={`${summary.avgTestScore}%`} color="bg-orange-50 text-orange-600" />
              <StatCard icon={<FileText size={17} />} label="Assignments" value={`${summary.assignmentsSubmitted}`} color="bg-teal-50 text-teal-600" />
              <StatCard icon={<UserCheck size={17} />} label="Attendance" value={`${summary.attendancePercentage}%`} color="bg-yellow-50 text-yellow-600" />
              <StatCard icon={<Award size={17} />} label="Avg Assignment" value={summary.avgAssignmentGrade > 0 ? `${summary.avgAssignmentGrade}%` : "–"} sub={summary.avgAssignmentGrade > 0 ? "of graded" : "none graded yet"} color="bg-green-50 text-green-600" />
            </div>
          </div>

          {/* Streak + Grade Distribution */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Study Streak</CardTitle></CardHeader>
              <CardContent className="flex items-center gap-6">
                <div className="text-center">
                  <div className="flex items-center gap-1 text-orange-500">
                    <Flame size={22} />
                    <span className="text-3xl font-bold">{summary.streak.current}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Current streak</p>
                </div>
                <div className="w-px h-12 bg-border" />
                <div className="text-center">
                  <div className="flex items-center gap-1 text-blue-500">
                    <Star size={22} />
                    <span className="text-3xl font-bold">{summary.streak.longest}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Best streak</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-xs text-muted-foreground">Keep active every day to</p>
                  <p className="text-xs text-muted-foreground">build your streak!</p>
                </div>
              </CardContent>
            </Card>

            {pieData.length > 0 ? (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Grade Distribution (Tests)</CardTitle></CardHeader>
                <CardContent className="flex items-center gap-3">
                  <ResponsiveContainer width={120} height={120}>
                    <PieChart>
                      <Pie data={pieData} cx={55} cy={55} innerRadius={32} outerRadius={52} dataKey="value" paddingAngle={2}>
                        {pieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 flex-1">
                    {pieData.map((d) => (
                      <div key={d.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: d.fill }} />
                          <span>{d.name}</span>
                        </div>
                        <span className="font-medium">{d.value} test{d.value !== 1 ? "s" : ""}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-6 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
                  <ClipboardList size={28} className="opacity-30" />
                  <p>No tests taken yet</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Recent Activity */}
          {recentActivity.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Recent Activity</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {recentActivity.map((item, i) => (
                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${item.type === "test" ? "bg-purple-100 text-purple-600" : "bg-teal-100 text-teal-600"}`}>
                        {item.type === "test" ? <ClipboardList size={13} /> : <FileText size={13} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.type === "test" ? "Test" : "Assignment"} · {item.date ? format(new Date(item.date), "MMM d, yyyy") : "–"}</p>
                      </div>
                      <Badge variant="secondary" className="shrink-0 font-medium">{item.score}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── TAB 2: TRENDS ── */}
        <TabsContent value="trends" className="space-y-5">
          {weeklyTrend.length > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Weekly Performance Trend</CardTitle>
                <p className="text-xs text-muted-foreground">Test scores and assignment grades by week</p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={weeklyTrend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="testGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="assignGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any, n: string) => [`${v ?? "–"}%`, n]} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="avgTestScore" name="Test Score" stroke="#8b5cf6" fill="url(#testGrad)" strokeWidth={2} dot connectNulls />
                    <Area type="monotone" dataKey="avgAssignGrade" name="Assignment Grade" stroke="#06b6d4" fill="url(#assignGrad)" strokeWidth={2} dot connectNulls />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
                <TrendingUp size={32} className="opacity-20" />
                <p>Complete some tests or assignments to see your performance trend.</p>
              </CardContent>
            </Card>
          )}

          {testLineData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Individual Test Scores</CardTitle>
                <p className="text-xs text-muted-foreground">Your last {testLineData.length} test results</p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={testLineData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => [`${v}%`, "Score"]} />
                    <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                      {testLineData.map((_: any, i: number) => (
                        <Cell key={i} fill={pctColor(testLineData[i].score)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {monthlyAttendance.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Monthly Attendance</CardTitle>
                <p className="text-xs text-muted-foreground">Attendance percentage by month</p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={monthlyAttendance} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number, _: any, p: any) => [`${v}% (${p.payload.present}/${p.payload.total})`, "Attendance"]} />
                    <Bar dataKey="attPct" name="Attendance %" radius={[4, 4, 0, 0]}>
                      {monthlyAttendance.map((m: any, i: number) => (
                        <Cell key={i} fill={m.attPct >= 75 ? "#22c55e" : m.attPct >= 50 ? "#f59e0b" : "#ef4444"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" />≥75% (Good)</div>
                  <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" />50–74% (At risk)</div>
                  <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block" />&lt;50% (Critical)</div>
                </div>
              </CardContent>
            </Card>
          )}

          {attClassData.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Attendance by Class</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {attClassData.map((item: any) => (
                    <div key={item.name}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">{item.name}</span>
                        <span style={{ color: pctColor(item.pct) }} className="font-semibold">{item.pct}%</span>
                      </div>
                      <Progress value={item.pct} className={`h-2 ${item.pct < 75 ? "[&>div]:bg-red-400" : "[&>div]:bg-green-500"}`} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── TAB 3: SUBJECTS ── */}
        <TabsContent value="subjects" className="space-y-5">
          {subjectBreakdown.length === 0 ? (
            <Card>
              <CardContent className="p-8 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
                <BookOpen size={32} className="opacity-20" />
                <p>Enroll in classes and take tests to see subject-wise analytics.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {radarData.length >= 3 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Multi-Subject Performance Radar</CardTitle>
                    <p className="text-xs text-muted-foreground">Tests · Assignments · Attendance across subjects</p>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={260}>
                      <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                        <PolarGrid />
                        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
                        <Radar name="Tests" dataKey="Tests" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} />
                        <Radar name="Assignments" dataKey="Assignments" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.2} />
                        <Radar name="Attendance" dataKey="Attendance" stroke="#22c55e" fill="#22c55e" fillOpacity={0.2} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {subjectBreakdown.map((s: any) => (
                  <Card key={s.classId} className="overflow-hidden">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-sm">{s.className}</p>
                        <Badge style={{ background: gradeColor[s.gradeLetter] + "20", color: gradeColor[s.gradeLetter], borderColor: gradeColor[s.gradeLetter] + "40" }} className="border font-bold">
                          {s.gradeLetter}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-muted/50 rounded-lg p-2">
                          <p className="text-xs text-muted-foreground">Tests</p>
                          <p className="font-bold text-sm" style={{ color: pctColor(s.avgTestScore ?? 0) }}>
                            {s.avgTestScore !== null ? `${s.avgTestScore}%` : "–"}
                          </p>
                          <p className="text-xs text-muted-foreground">{s.testCount} taken</p>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-2">
                          <p className="text-xs text-muted-foreground">Attendance</p>
                          <p className="font-bold text-sm" style={{ color: pctColor(s.attPct ?? 0) }}>
                            {s.attPct !== null ? `${s.attPct}%` : "–"}
                          </p>
                          <p className="text-xs text-muted-foreground">{s.attPresent}/{s.attTotal}</p>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-2">
                          <p className="text-xs text-muted-foreground">Assignments</p>
                          <p className="font-bold text-sm" style={{ color: pctColor(s.avgAssignGrade ?? 0) }}>
                            {s.avgAssignGrade !== null ? `${s.avgAssignGrade}%` : "–"}
                          </p>
                          <p className="text-xs text-muted-foreground">{s.assignCount} done</p>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1 text-muted-foreground">
                          <span>Overall composite score</span>
                          <span className="font-medium">{s.composite}%</span>
                        </div>
                        <Progress value={s.composite ?? 0} className={`h-1.5 ${(s.composite ?? 0) >= 80 ? "[&>div]:bg-green-500" : (s.composite ?? 0) >= 60 ? "[&>div]:bg-blue-500" : "[&>div]:bg-red-400"}`} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* ── TAB 4: LEARNING PATH ── */}
        <TabsContent value="path" className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Strengths */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><CheckCircle size={15} className="text-green-500" /> Your Strengths</CardTitle>
              </CardHeader>
              <CardContent>
                {strengths.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Keep taking tests to identify your strengths!</p>
                ) : (
                  <div className="space-y-2">
                    {strengths.map((s: any) => (
                      <div key={s.classId} className="flex items-center justify-between p-2.5 bg-green-50 border border-green-100 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Star size={13} className="text-green-600 shrink-0" />
                          <span className="text-sm font-medium">{s.className}</span>
                        </div>
                        <Badge className="bg-green-100 text-green-700 border-green-200 border hover:bg-green-100">{s.composite}%</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Weak areas */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Target size={15} className="text-red-500" /> Areas to Improve</CardTitle>
              </CardHeader>
              <CardContent>
                {weakAreas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Great — no critical weak areas detected!</p>
                ) : (
                  <div className="space-y-2">
                    {weakAreas.map((s: any) => (
                      <div key={s.classId} className="flex items-center justify-between p-2.5 bg-red-50 border border-red-100 rounded-lg">
                        <div className="flex items-center gap-2">
                          <AlertCircle size={13} className="text-red-500 shrink-0" />
                          <span className="text-sm font-medium">{s.className}</span>
                        </div>
                        <Badge className="bg-red-100 text-red-700 border-red-200 border hover:bg-red-100">{s.composite}%</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recommendations */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Lightbulb size={15} className="text-amber-500" /> Personalised Recommendations</CardTitle>
            </CardHeader>
            <CardContent>
              {recommendations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recommendations yet — keep up your progress!</p>
              ) : (
                <div className="space-y-2">
                  {recommendations.map((r: any, i: number) => <RecCard key={i} type={r.type} text={r.text} />)}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Study habits */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Zap size={15} className="text-amber-500" /> Study Habits</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="text-center p-3 bg-orange-50 rounded-xl border border-orange-100">
                  <Flame size={22} className="mx-auto text-orange-500 mb-1" />
                  <p className="text-2xl font-bold text-orange-600">{summary.streak.current}</p>
                  <p className="text-xs text-orange-600/80">Day streak</p>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded-xl border border-blue-100">
                  <Star size={22} className="mx-auto text-blue-500 mb-1" />
                  <p className="text-2xl font-bold text-blue-600">{summary.streak.longest}</p>
                  <p className="text-xs text-blue-600/80">Best streak</p>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded-xl border border-purple-100">
                  <ClipboardList size={22} className="mx-auto text-purple-500 mb-1" />
                  <p className="text-2xl font-bold text-purple-600">{summary.testsCompleted}</p>
                  <p className="text-xs text-purple-600/80">Tests done</p>
                </div>
                <div className="text-center p-3 bg-teal-50 rounded-xl border border-teal-100">
                  <FileText size={22} className="mx-auto text-teal-500 mb-1" />
                  <p className="text-2xl font-bold text-teal-600">{summary.assignmentsSubmitted}</p>
                  <p className="text-xs text-teal-600/80">Assignments submitted</p>
                </div>
              </div>
              <div className="mt-4 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground space-y-1">
                <p><span className="font-medium text-foreground">Tip:</span> Studying every day — even for 20 minutes — is more effective than cramming.</p>
                {summary.streak.current === 0 && <p>You haven't been active today. Submit an assignment or take a test to restart your streak!</p>}
                {summary.trend === "improving" && <p>Your scores are on an upward trend. Keep the momentum going!</p>}
                {summary.attendancePercentage < 75 && <p>Your overall attendance is below 75%. Try not to miss classes.</p>}
              </div>
            </CardContent>
          </Card>

          {/* Full subject performance table */}
          {subjectBreakdown.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Subject Performance Summary</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                        <th className="pb-2 pr-4">Subject</th>
                        <th className="pb-2 pr-3 text-center">Grade</th>
                        <th className="pb-2 pr-3 text-center">Tests</th>
                        <th className="pb-2 pr-3 text-center">Attendance</th>
                        <th className="pb-2 text-center">Assignments</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subjectBreakdown.map((s: any) => (
                        <tr key={s.classId} className="border-b last:border-0">
                          <td className="py-2 pr-4 font-medium">{s.className}</td>
                          <td className="py-2 pr-3 text-center">
                            <Badge style={{ background: gradeColor[s.gradeLetter] + "20", color: gradeColor[s.gradeLetter] }} className="border-0 font-bold w-7 justify-center">{s.gradeLetter}</Badge>
                          </td>
                          <td className="py-2 pr-3 text-center" style={{ color: pctColor(s.avgTestScore ?? 0) }}>
                            {s.avgTestScore !== null ? `${s.avgTestScore}%` : "–"}
                          </td>
                          <td className="py-2 pr-3 text-center" style={{ color: pctColor(s.attPct ?? 0) }}>
                            {s.attPct !== null ? `${s.attPct}%` : "–"}
                          </td>
                          <td className="py-2 text-center" style={{ color: pctColor(s.avgAssignGrade ?? 0) }}>
                            {s.avgAssignGrade !== null ? `${s.avgAssignGrade}%` : "–"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── TAB 5: FULL REPORT ── */}
        <TabsContent value="report" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">A comprehensive, printable progress report</p>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => printReport(reportRef)}>
              <Download size={14} /> Print / Save PDF
            </Button>
          </div>

          <div ref={reportRef} className="space-y-5">
            {/* Report header */}
            <div className="p-5 rounded-xl border bg-gradient-to-r from-slate-50 to-blue-50">
              <h1 className="text-xl font-bold">{user?.fullName} — Progress Report</h1>
              <h2 className="text-sm text-muted-foreground">Generated {format(new Date(), "MMMM d, yyyy")}</h2>
              <div className="grid grid-cols-3 gap-4 mt-4">
                <div className="stat">
                  <p className="stat-lbl">Overall Grade</p>
                  <p className="stat-val" style={{ color: gradeColor[summary.gradeLetter] }}>{summary.gradeLetter}</p>
                  <p className="text-xs text-muted-foreground">{summary.compositeScore}% composite</p>
                </div>
                <div className="stat">
                  <p className="stat-lbl">Performance Trend</p>
                  <p className="stat-val capitalize">{summary.trend}</p>
                </div>
                <div className="stat">
                  <p className="stat-lbl">Best Study Streak</p>
                  <p className="stat-val">{summary.streak.longest} days</p>
                </div>
              </div>
            </div>

            {/* Summary stats grid */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Summary Statistics</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { label: "Enrolled Classes", value: summary.enrolledClasses },
                    { label: "Tests Completed", value: summary.testsCompleted },
                    { label: "Average Test Score", value: `${summary.avgTestScore}%` },
                    { label: "Assignments Submitted", value: summary.assignmentsSubmitted },
                    { label: "Avg Assignment Grade", value: summary.avgAssignmentGrade > 0 ? `${summary.avgAssignmentGrade}%` : "–" },
                    { label: "Overall Attendance", value: `${summary.attendancePercentage}%` },
                  ].map((item) => (
                    <div key={item.label} className="p-3 rounded-lg bg-muted/40">
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="text-xl font-bold mt-0.5">{item.value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Subject breakdown table */}
            {subjectBreakdown.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Subject-wise Performance</CardTitle></CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                        <th className="pb-2 pr-4">Subject</th>
                        <th className="pb-2 pr-3 text-center">Grade</th>
                        <th className="pb-2 pr-3 text-center">Composite</th>
                        <th className="pb-2 pr-3 text-center">Tests Avg</th>
                        <th className="pb-2 pr-3 text-center">Attendance</th>
                        <th className="pb-2 text-center">Assignments</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subjectBreakdown.map((s: any) => (
                        <tr key={s.classId} className="border-b last:border-0">
                          <td className="py-2 pr-4 font-medium">{s.className}</td>
                          <td className="py-2 pr-3 text-center font-bold" style={{ color: gradeColor[s.gradeLetter] }}>{s.gradeLetter}</td>
                          <td className="py-2 pr-3 text-center">{s.composite}%</td>
                          <td className="py-2 pr-3 text-center">{s.avgTestScore !== null ? `${s.avgTestScore}%` : "–"}</td>
                          <td className="py-2 pr-3 text-center">{s.attPct !== null ? `${s.attPct}%` : "–"}</td>
                          <td className="py-2 text-center">{s.avgAssignGrade !== null ? `${s.avgAssignGrade}%` : "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}

            {/* Test history */}
            {tests.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Test History</CardTitle></CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                        <th className="pb-2 pr-4">Test</th>
                        <th className="pb-2 pr-4">Score</th>
                        <th className="pb-2 pr-4">Percentage</th>
                        <th className="pb-2">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tests.map((t: any) => (
                        <tr key={t.id} className="border-b last:border-0">
                          <td className="py-2 pr-4 font-medium">{t.testTitle ?? "Test"}</td>
                          <td className="py-2 pr-4">{t.score}/{t.totalMarks}</td>
                          <td className="py-2 pr-4">
                            <Badge className={`${t.percentage >= 80 ? "bg-green-500 hover:bg-green-500" : t.percentage >= 60 ? "bg-blue-500 hover:bg-blue-500" : t.percentage >= 40 ? "bg-yellow-500 hover:bg-yellow-500" : "bg-red-500 hover:bg-red-500"}`}>
                              {t.percentage}%
                            </Badge>
                          </td>
                          <td className="py-2 text-muted-foreground">{t.submittedAt ? format(new Date(t.submittedAt), "MMM d, yyyy") : "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}

            {/* Assignment history */}
            {assignments.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Assignment History</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {assignments.map((a: any) => (
                      <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                        <div>
                          <p className="text-sm font-medium">{a.title ?? "Assignment"}</p>
                          <p className="text-xs text-muted-foreground">{a.submittedAt ? format(new Date(a.submittedAt), "MMM d, yyyy") : "–"}</p>
                        </div>
                        {a.grade !== null ? (
                          <Badge className="bg-green-500 hover:bg-green-500">{a.grade}/{a.maxMarks}</Badge>
                        ) : (
                          <Badge variant="secondary">Ungraded</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recommendations in report */}
            {recommendations.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Recommendations</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {recommendations.map((r: any, i: number) => <RecCard key={i} type={r.type} text={r.text} />)}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
