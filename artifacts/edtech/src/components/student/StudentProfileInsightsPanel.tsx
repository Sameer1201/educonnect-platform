import { useMemo } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Activity,
  CalendarDays,
  Flame,
  Mail,
  MapPin,
  Phone,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

const ACTIVITY_COLORS = ["#f59e0b", "#fb923c", "#fcd34d", "#fdba74"];

export interface StudentProfileInsights {
  student: {
    id: number;
    username: string;
    fullName: string;
    email: string;
    phone: string | null;
    status: string;
    subject: string | null;
    additionalExams: string[];
    avatarUrl: string | null;
    onboardingComplete: boolean;
    approvedAt: string | null;
    approverName: string | null;
    createdAt: string;
    profileDetails: Record<string, unknown> | null;
  };
  overview: {
    testsAttempted: number;
    averageScore: number;
    bestScore: number;
    latestScore: number;
    passRate: number;
    savedQuestions: number;
    solvedQuestions: number;
    trackedPracticeQuestions: number;
    practiceAccuracy: number;
    totalPracticeAttempts: number;
    activeDaysLast7: number;
    accountAgeDays: number;
    lastActiveAt: string | null;
  };
  profileCompletion: {
    percent: number;
    completedSteps: number;
    totalSteps: number;
    steps: Array<{
      key: string;
      label: string;
      complete: boolean;
    }>;
  };
  scoreTrend: Array<{
    label: string;
    title: string;
    percentage: number;
    score: number;
    totalPoints: number;
    submittedAt: string | null;
    passed: boolean;
  }>;
  activityTrend: Array<{
    label: string;
    count: number;
    date: string;
  }>;
  activityBreakdown: Array<{
    name: string;
    value: number;
  }>;
  recentActivity: Array<{
    id: number;
    action: string;
    page: string | null;
    detail: string | null;
    createdAt: string;
  }>;
  preparationSnapshot: {
    dateOfBirth: string | null;
    whatsappOnSameNumber: boolean;
    address: {
      country: string;
      state: string;
      city: string;
      pincode: string;
    };
    preparation: {
      classLevel: string;
      board: string;
      targetYear: string;
      targetExam: string;
    };
    learningMode: {
      mode: string;
      provider: string;
    };
    hearAboutUs: string;
  };
}

function formatDateSafe(value: string | null | undefined, pattern = "MMM d, yyyy") {
  if (!value) return "Not available";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Not available" : format(parsed, pattern);
}

function formatRelativeSafe(value: string | null | undefined) {
  if (!value) return "No recent activity";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "No recent activity" : formatDistanceToNowStrict(parsed, { addSuffix: true });
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getStatusVariant(status: string): "default" | "outline" | "destructive" | "secondary" {
  if (status === "approved" || status === "active") return "default";
  if (status === "pending") return "outline";
  return "destructive";
}

function EmptyChartState({ message }: { message: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function OverviewMetric({
  label,
  value,
  helper,
  icon,
}: {
  label: string;
  value: string;
  helper: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-amber-200/70 bg-white/85 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">{label}</p>
        <div className="rounded-full bg-amber-100 p-2 text-amber-700">{icon}</div>
      </div>
      <p className="text-3xl font-black tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}

function SnapshotTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value || "Not provided"}</p>
    </div>
  );
}

export function StudentProfileInsightsPanel({
  insights,
  viewerLabel = "Verification review",
}: {
  insights: StudentProfileInsights;
  viewerLabel?: string;
}) {
  const exams = useMemo(
    () => [insights.student.subject, ...(insights.student.additionalExams ?? [])].filter(Boolean) as string[],
    [insights.student.additionalExams, insights.student.subject],
  );

  const location = [
    insights.preparationSnapshot.address.city,
    insights.preparationSnapshot.address.state,
    insights.preparationSnapshot.address.country,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[1.55fr_0.95fr]">
        <Card className="overflow-hidden border-amber-200/80 bg-gradient-to-br from-white via-amber-50/55 to-orange-50/70">
          <CardContent className="p-6">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <Avatar className="h-20 w-20 ring-4 ring-amber-100">
                  <AvatarImage src={insights.student.avatarUrl ?? undefined} alt={insights.student.fullName} />
                  <AvatarFallback className="bg-gradient-to-br from-amber-500 to-orange-600 text-xl font-bold text-white">
                    {getInitials(insights.student.fullName)}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-3xl font-black tracking-tight text-slate-900">{insights.student.fullName}</h2>
                      <Badge variant={getStatusVariant(insights.student.status)} className="capitalize">
                        {insights.student.status}
                      </Badge>
                      {insights.student.onboardingComplete && (
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                          Setup complete
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">@{insights.student.username}</p>
                  </div>

                  <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                    <div className="flex items-center gap-2 rounded-xl border border-white/70 bg-white/80 px-3 py-2">
                      <Mail size={14} className="text-amber-700" />
                      <span className="truncate">{insights.student.email}</span>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl border border-white/70 bg-white/80 px-3 py-2">
                      <Phone size={14} className="text-amber-700" />
                      <span>{insights.student.phone || "Phone not added"}</span>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl border border-white/70 bg-white/80 px-3 py-2">
                      <MapPin size={14} className="text-amber-700" />
                      <span>{location || "Location not added"}</span>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl border border-white/70 bg-white/80 px-3 py-2">
                      <CalendarDays size={14} className="text-amber-700" />
                      <span>Joined {formatDateSafe(insights.student.createdAt)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="min-w-0 rounded-3xl border border-amber-200/70 bg-white/85 p-4 shadow-sm xl:w-[320px]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-amber-700">Exam focus</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {exams.length > 0 ? (
                    exams.map((exam) => (
                      <Badge
                        key={exam}
                        variant="secondary"
                        className="rounded-full bg-amber-100 px-3 py-1 text-amber-800 hover:bg-amber-100"
                      >
                        {exam}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">Target exam not added yet.</span>
                  )}
                </div>
                <div className="mt-4 grid gap-2 text-sm">
                  <div className="flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2">
                    <span className="text-muted-foreground">Last active</span>
                    <span className="font-semibold text-slate-900">{formatRelativeSafe(insights.overview.lastActiveAt)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2">
                    <span className="text-muted-foreground">Account age</span>
                    <span className="font-semibold text-slate-900">{insights.overview.accountAgeDays} days</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2">
                    <span className="text-muted-foreground">Approved by</span>
                    <span className="font-semibold text-slate-900">{insights.student.approverName || "Not approved yet"}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <OverviewMetric
                label="Tests"
                value={String(insights.overview.testsAttempted)}
                helper="Completed test attempts"
                icon={<Target size={16} />}
              />
              <OverviewMetric
                label="Avg Score"
                value={`${insights.overview.averageScore}%`}
                helper={`Pass rate ${insights.overview.passRate}%`}
                icon={<TrendingUp size={16} />}
              />
              <OverviewMetric
                label="Best Score"
                value={`${insights.overview.bestScore}%`}
                helper={`Latest ${insights.overview.latestScore}%`}
                icon={<Flame size={16} />}
              />
              <OverviewMetric
                label="Practice"
                value={String(insights.overview.solvedQuestions)}
                helper={`${insights.overview.practiceAccuracy}% accuracy`}
                icon={<Activity size={16} />}
              />
              <OverviewMetric
                label="Saved"
                value={String(insights.overview.savedQuestions)}
                helper={`${insights.overview.activeDaysLast7}/7 active days`}
                icon={<Users size={16} />}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Profile completion</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-3xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-orange-50 p-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-4xl font-black tracking-tight text-slate-900">{insights.profileCompletion.percent}%</p>
                  <p className="text-sm text-muted-foreground">
                    {insights.profileCompletion.completedSteps} of {insights.profileCompletion.totalSteps} onboarding blocks complete
                  </p>
                </div>
                <Badge variant="secondary" className="bg-white text-amber-700 hover:bg-white">
                  {viewerLabel}
                </Badge>
              </div>
              <Progress value={insights.profileCompletion.percent} className="mt-4 h-3 bg-amber-100" />
            </div>

            <div className="space-y-2">
              {insights.profileCompletion.steps.map((step) => (
                <div
                  key={step.key}
                  className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${
                    step.complete
                      ? "border-emerald-200 bg-emerald-50/70"
                      : "border-border bg-muted/20"
                  }`}
                >
                  <span className="font-medium text-slate-900">{step.label}</span>
                  <Badge
                    variant="secondary"
                    className={
                      step.complete
                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-100"
                    }
                  >
                    {step.complete ? "Complete" : "Missing"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-border/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Score momentum</CardTitle>
          </CardHeader>
          <CardContent>
            {insights.scoreTrend.length === 0 ? (
              <EmptyChartState message="No submitted tests yet for this student." />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={insights.scoreTrend}>
                  <defs>
                    <linearGradient id="student-score-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#ece7df" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <RechartsTooltip
                    contentStyle={{ borderRadius: 16, border: "1px solid #f5e2bd", boxShadow: "0 18px 40px rgba(15,23,42,0.08)" }}
                    formatter={(value: number) => [`${value}%`, "Score"]}
                    labelFormatter={(_, payload) => {
                      const point = payload?.[0]?.payload as { title?: string; submittedAt?: string | null } | undefined;
                      if (!point) return "";
                      return `${point.title} · ${formatDateSafe(point.submittedAt)}`;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="percentage"
                    stroke="#d97706"
                    strokeWidth={3}
                    fill="url(#student-score-fill)"
                    activeDot={{ r: 6, fill: "#d97706", stroke: "#fff", strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Engagement pulse</CardTitle>
          </CardHeader>
          <CardContent>
            {insights.activityTrend.every((item) => item.count === 0) ? (
              <EmptyChartState message="No tracked activity in the last 7 days." />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={insights.activityTrend} barCategoryGap="28%">
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#ece7df" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <RechartsTooltip
                    cursor={{ fill: "rgba(245, 158, 11, 0.08)" }}
                    contentStyle={{ borderRadius: 16, border: "1px solid #f5e2bd", boxShadow: "0 18px 40px rgba(15,23,42,0.08)" }}
                    formatter={(value: number) => [value, "Events"]}
                    labelFormatter={(label) => `Day: ${label}`}
                  />
                  <Bar dataKey="count" radius={[10, 10, 0, 0]} fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Card className="border-border/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Preparation snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <SnapshotTile label="Current stage" value={insights.preparationSnapshot.preparation.classLevel} />
              <SnapshotTile label="Board" value={insights.preparationSnapshot.preparation.board} />
              <SnapshotTile label="Target year" value={insights.preparationSnapshot.preparation.targetYear} />
              <SnapshotTile label="Learning mode" value={insights.preparationSnapshot.learningMode.mode} />
              <SnapshotTile label="Learning provider" value={insights.preparationSnapshot.learningMode.provider} />
              <SnapshotTile label="Date of birth" value={formatDateSafe(insights.preparationSnapshot.dateOfBirth, "dd MMM yyyy")} />
              <SnapshotTile label="Pincode" value={insights.preparationSnapshot.address.pincode} />
              <SnapshotTile label="Lead source" value={insights.preparationSnapshot.hearAboutUs} />
            </div>

            <div className="rounded-2xl border border-border/80 bg-muted/20 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">Practice health</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">Question bank engagement</p>
                </div>
                <Badge variant="secondary" className="bg-orange-100 text-orange-700 hover:bg-orange-100">
                  {insights.overview.practiceAccuracy}% accuracy
                </Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <SnapshotTile label="Tracked" value={String(insights.overview.trackedPracticeQuestions)} />
                <SnapshotTile label="Solved" value={String(insights.overview.solvedQuestions)} />
                <SnapshotTile label="Attempts" value={String(insights.overview.totalPracticeAttempts)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Activity mix & recent timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
              <div>
                {insights.activityBreakdown.length === 0 ? (
                  <EmptyChartState message="No activity buckets yet." />
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={insights.activityBreakdown}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={3}
                      >
                        {insights.activityBreakdown.map((entry, index) => (
                          <Cell key={entry.name} fill={ACTIVITY_COLORS[index % ACTIVITY_COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{ borderRadius: 16, border: "1px solid #f5e2bd", boxShadow: "0 18px 40px rgba(15,23,42,0.08)" }}
                        formatter={(value: number) => [value, "Events"]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="space-y-3">
                {insights.activityBreakdown.length > 0 && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {insights.activityBreakdown.map((item, index) => (
                      <div key={item.name} className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: ACTIVITY_COLORS[index % ACTIVITY_COLORS.length] }}
                          />
                          <span className="text-sm font-semibold text-slate-900">{item.name}</span>
                        </div>
                        <p className="text-2xl font-black tracking-tight text-slate-900">{item.value}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  {insights.recentActivity.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                      No recent activity captured for this student.
                    </p>
                  ) : (
                    insights.recentActivity.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-border/70 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">{item.action}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {item.page || "Unknown page"}
                              {item.detail ? ` · ${item.detail}` : ""}
                            </p>
                          </div>
                          <Badge variant="outline" className="shrink-0">
                            {formatDateSafe(item.createdAt, "MMM d, h:mm a")}
                          </Badge>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
