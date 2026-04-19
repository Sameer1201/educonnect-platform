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
  BookOpen,
  Building2,
  CalendarDays,
  Flame,
  Globe2,
  GraduationCap,
  Hash,
  MessageCircle,
  Mail,
  MapPin,
  Phone,
  Search,
  Target,
  TrendingUp,
  User,
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
    rejectionReason: string | null;
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
    whatsappNumber: string;
    address: {
      country: string;
      state: string;
      district: string;
      street: string;
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

function CompletionDetail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/80 bg-white/75 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900 break-words">{value || "Not provided"}</p>
    </div>
  );
}

function ReviewField({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-amber-200/70 bg-white/90 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        {icon ? (
          <div className="mt-0.5 text-amber-600">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">{label}</p>
          <p className="mt-2 break-words text-sm font-semibold leading-6 text-slate-900">{value || "Not provided"}</p>
        </div>
      </div>
    </div>
  );
}

export function StudentProfileInsightsPanel({
  insights,
  viewerLabel = "Verification review",
  mode = "full",
}: {
  insights: StudentProfileInsights;
  viewerLabel?: string;
  mode?: "full" | "submittedOnly";
}) {
  const primaryExam = useMemo(
    () => insights.preparationSnapshot.preparation.targetExam.trim() || insights.student.subject?.trim() || "",
    [insights.preparationSnapshot.preparation.targetExam, insights.student.subject],
  );
  const exams = useMemo(
    () =>
      [primaryExam, ...(insights.student.additionalExams ?? [])]
        .map((exam) => exam.trim())
        .filter((exam, index, all) => Boolean(exam) && all.indexOf(exam) === index),
    [insights.student.additionalExams, primaryExam],
  );
  const learningProvider = useMemo(
    () =>
      insights.preparationSnapshot.learningMode.provider
      || (insights.preparationSnapshot.learningMode.mode === "Self Study using Free Resources"
        ? "Self Study using Free Resources"
        : ""),
    [insights.preparationSnapshot.learningMode.mode, insights.preparationSnapshot.learningMode.provider],
  );

  const location = [
    insights.preparationSnapshot.address.street,
    insights.preparationSnapshot.address.city,
    insights.preparationSnapshot.address.district,
    insights.preparationSnapshot.address.state,
    insights.preparationSnapshot.address.country,
  ]
    .filter(Boolean)
    .join(", ");
  const isSubmittedOnly = mode === "submittedOnly";

  const completionStepDetails = useMemo(() => {
    const detailMap: Record<string, Array<{ label: string; value: string }>> = {
      personal: [
        { label: "Full name", value: insights.student.fullName },
        { label: "Email", value: insights.student.email },
        { label: "Phone", value: insights.student.phone || "Not provided" },
        { label: "Date of birth", value: formatDateSafe(insights.preparationSnapshot.dateOfBirth, "dd MMM yyyy") },
        {
          label: "WhatsApp",
          value: insights.preparationSnapshot.whatsappOnSameNumber
            ? `Same as phone${insights.student.phone ? ` (${insights.student.phone})` : ""}`
            : insights.preparationSnapshot.whatsappNumber || "Not provided",
        },
      ],
      address: [
        { label: "Country", value: insights.preparationSnapshot.address.country || "Not provided" },
        { label: "State", value: insights.preparationSnapshot.address.state || "Not provided" },
        { label: "District", value: insights.preparationSnapshot.address.district || "Not provided" },
        { label: "Street", value: insights.preparationSnapshot.address.street || "Not provided" },
        { label: "City", value: insights.preparationSnapshot.address.city || "Not provided" },
        { label: "Pincode", value: insights.preparationSnapshot.address.pincode || "Not provided" },
      ],
      preparation: [
        { label: "Stage", value: insights.preparationSnapshot.preparation.classLevel || "Not provided" },
        { label: "Board", value: insights.preparationSnapshot.preparation.board || "Not provided" },
        { label: "Target year", value: insights.preparationSnapshot.preparation.targetYear || "Not provided" },
        { label: "Target exam", value: insights.preparationSnapshot.preparation.targetExam || "Not provided" },
      ],
      learning: [
        { label: "Mode", value: insights.preparationSnapshot.learningMode.mode || "Not provided" },
        { label: "Provider", value: insights.preparationSnapshot.learningMode.provider || "Not provided" },
      ],
      discovery: [
        { label: "Lead source", value: insights.preparationSnapshot.hearAboutUs || "Not provided" },
        { label: "Joined", value: formatDateSafe(insights.student.createdAt) },
      ],
    };

    return insights.profileCompletion.steps.map((step) => ({
      ...step,
      details: detailMap[step.key] ?? [],
    }));
  }, [insights]);

  if (isSubmittedOnly) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.15fr]">
          <Card className="overflow-hidden border-amber-200/80 bg-gradient-to-br from-white via-amber-50/55 to-orange-50/70 shadow-sm">
            <CardContent className="p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                <Avatar className="h-24 w-24 ring-4 ring-amber-100">
                  <AvatarImage src={insights.student.avatarUrl ?? undefined} alt={insights.student.fullName} />
                  <AvatarFallback className="bg-gradient-to-br from-amber-500 to-orange-600 text-2xl font-bold text-white">
                    {getInitials(insights.student.fullName)}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1 space-y-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-3xl font-black tracking-tight text-slate-900">{insights.student.fullName}</h2>
                      <Badge variant={getStatusVariant(insights.student.status)} className="capitalize">
                        {insights.student.status}
                      </Badge>
                      {insights.student.onboardingComplete ? (
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                          Setup complete
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">@{insights.student.username}</p>
                    <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                      Student-submitted application details for approval review.
                    </p>
                  </div>

                  <div className="grid items-start gap-3 md:grid-cols-[0.9fr_1.1fr]">
                    <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-700">Exam focus</p>
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
                          <span className="text-sm text-muted-foreground">Target exam not provided</span>
                        )}
                      </div>
                      <div className="mt-4 rounded-xl bg-amber-50 px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-700">Selected exams</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {exams.length > 0 ? `${exams.length} exam${exams.length > 1 ? "s" : ""} selected` : "No exam added"}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-700">Quick review</p>
                      <div className="mt-3 grid gap-2 text-sm">
                        <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-3 rounded-xl bg-amber-50 px-3 py-2">
                          <span className="leading-6 text-muted-foreground">Target year</span>
                          <span className="min-w-0 break-words text-right font-semibold leading-6 text-slate-900">
                            {insights.preparationSnapshot.preparation.targetYear || "Not provided"}
                          </span>
                        </div>
                        <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-3 rounded-xl bg-amber-50 px-3 py-2">
                          <span className="leading-6 text-muted-foreground">Learning mode</span>
                          <span className="min-w-0 break-words text-right font-semibold leading-6 text-slate-900">
                            {insights.preparationSnapshot.learningMode.mode || "Not provided"}
                          </span>
                        </div>
                        <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-3 rounded-xl bg-amber-50 px-3 py-2">
                          <span className="leading-6 text-muted-foreground">Lead source</span>
                          <span className="min-w-0 break-words text-right font-semibold leading-6 text-slate-900">
                            {insights.preparationSnapshot.hearAboutUs || "Not provided"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {insights.student.rejectionReason ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-900">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-rose-600">Previous rejection reason</p>
                      <p className="mt-2 leading-6">{insights.student.rejectionReason}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-amber-200/80 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Target size={18} className="text-amber-600" />
                <span>Review summary</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-3xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-orange-50 p-4">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-4xl font-black tracking-tight text-slate-900">{insights.profileCompletion.percent}%</p>
                    <p className="text-sm text-muted-foreground">
                      {insights.profileCompletion.completedSteps} of {insights.profileCompletion.totalSteps} blocks completed
                    </p>
                  </div>
                  <Badge variant="secondary" className="bg-white text-amber-700 hover:bg-white">
                    {viewerLabel}
                  </Badge>
                </div>
                <Progress value={insights.profileCompletion.percent} className="mt-4 h-3 bg-amber-100" />
              </div>

              <div className="space-y-2">
                {completionStepDetails.map((step) => (
                  <div
                    key={step.key}
                    className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${
                      step.complete
                        ? "border-emerald-200 bg-emerald-50/70"
                        : "border-amber-200/70 bg-amber-50/60"
                    }`}
                  >
                    <span className="text-sm font-semibold text-slate-900">{step.label}</span>
                    <Badge
                      variant="secondary"
                      className={
                        step.complete
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                          : "bg-amber-100 text-amber-700 hover:bg-amber-100"
                      }
                    >
                      {step.complete ? "Ready" : "Missing"}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <Card className="border-border/80 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <User size={18} className="text-amber-600" />
                <span>Contact details</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="md:col-span-2">
                  <ReviewField label="Email" value={insights.student.email} icon={<Mail size={18} />} />
                </div>
                <ReviewField label="Phone number" value={insights.student.phone || "Not provided"} icon={<Phone size={18} />} />
                <ReviewField
                  label="WhatsApp number"
                  value={
                    insights.preparationSnapshot.whatsappOnSameNumber
                      ? `Same as phone${insights.student.phone ? ` (${insights.student.phone})` : ""}`
                      : insights.preparationSnapshot.whatsappNumber || "Not provided"
                  }
                  icon={<MessageCircle size={18} />}
                />
                <ReviewField
                  label="Date of birth"
                  value={formatDateSafe(insights.preparationSnapshot.dateOfBirth, "dd MMM yyyy")}
                  icon={<CalendarDays size={18} />}
                />
                <ReviewField label="Username" value={`@${insights.student.username}`} icon={<User size={18} />} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <GraduationCap size={18} className="text-amber-600" />
                <span>Schooling & target</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                <ReviewField
                  label="Current stage"
                  value={insights.preparationSnapshot.preparation.classLevel || "Not provided"}
                  icon={<GraduationCap size={18} />}
                />
                <ReviewField
                  label="Board"
                  value={insights.preparationSnapshot.preparation.board || "Not provided"}
                  icon={<BookOpen size={18} />}
                />
                <ReviewField label="Target exam" value={primaryExam || "Not provided"} icon={<Target size={18} />} />
                <ReviewField
                  label="Target year"
                  value={insights.preparationSnapshot.preparation.targetYear || "Not provided"}
                  icon={<CalendarDays size={18} />}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <Card className="border-border/80 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin size={18} className="text-amber-600" />
                <span>Address details</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div className="xl:col-span-3">
                  <ReviewField label="Full location" value={location || "Not provided"} icon={<MapPin size={18} />} />
                </div>
                <ReviewField
                  label="Street / village"
                  value={insights.preparationSnapshot.address.street || "Not provided"}
                  icon={<MapPin size={18} />}
                />
                <ReviewField
                  label="City / town"
                  value={insights.preparationSnapshot.address.city || "Not provided"}
                  icon={<Building2 size={18} />}
                />
                <ReviewField
                  label="District"
                  value={insights.preparationSnapshot.address.district || "Not provided"}
                  icon={<Building2 size={18} />}
                />
                <ReviewField
                  label="State"
                  value={insights.preparationSnapshot.address.state || "Not provided"}
                  icon={<MapPin size={18} />}
                />
                <ReviewField
                  label="Country"
                  value={insights.preparationSnapshot.address.country || "Not provided"}
                  icon={<Globe2 size={18} />}
                />
                <ReviewField
                  label="Pincode"
                  value={insights.preparationSnapshot.address.pincode || "Not provided"}
                  icon={<Hash size={18} />}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity size={18} className="text-amber-600" />
                <span>Learning & source</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                <ReviewField
                  label="Learning mode"
                  value={insights.preparationSnapshot.learningMode.mode || "Not provided"}
                  icon={<Activity size={18} />}
                />
                <ReviewField
                  label="Provider"
                  value={learningProvider || "Not provided"}
                  icon={<BookOpen size={18} />}
                />
                <ReviewField
                  label="Additional exams"
                  value={insights.student.additionalExams.length > 0 ? insights.student.additionalExams.join(", ") : "Not provided"}
                  icon={<Target size={18} />}
                />
                <ReviewField
                  label="Lead source"
                  value={insights.preparationSnapshot.hearAboutUs || "Not provided"}
                  icon={<Search size={18} />}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

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
                    {!isSubmittedOnly ? (
                      <div className="flex items-center gap-2 rounded-xl border border-white/70 bg-white/80 px-3 py-2">
                        <CalendarDays size={14} className="text-amber-700" />
                        <span>Joined {formatDateSafe(insights.student.createdAt)}</span>
                      </div>
                    ) : null}
                  </div>

                  {insights.student.rejectionReason ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-900">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-rose-600">Rejection reason</p>
                      <p className="mt-2 leading-6">{insights.student.rejectionReason}</p>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="min-w-0 rounded-3xl border border-amber-200/70 bg-white/85 p-4 shadow-sm xl:w-[320px]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-amber-700">
                  {isSubmittedOnly ? "Submitted focus" : "Exam focus"}
                </p>
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
                {isSubmittedOnly ? (
                  <div className="mt-4 grid gap-2 text-sm">
                    <div className="flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2">
                      <span className="text-muted-foreground">Learning mode</span>
                      <span className="font-semibold text-slate-900">
                        {insights.preparationSnapshot.learningMode.mode || "Not provided"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2">
                      <span className="text-muted-foreground">Target year</span>
                      <span className="font-semibold text-slate-900">
                        {insights.preparationSnapshot.preparation.targetYear || "Not provided"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2">
                      <span className="text-muted-foreground">Lead source</span>
                      <span className="font-semibold text-slate-900">
                        {insights.preparationSnapshot.hearAboutUs || "Not provided"}
                      </span>
                    </div>
                  </div>
                ) : (
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
                )}
              </div>
            </div>

            {!isSubmittedOnly ? (
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
            ) : null}
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

            <div className="space-y-3">
              {completionStepDetails.map((step) => (
                <div
                  key={step.key}
                  className={`rounded-2xl border px-4 py-3 ${
                    step.complete
                      ? "border-emerald-200 bg-emerald-50/70"
                      : "border-border bg-muted/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
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
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {step.details.map((detail) => (
                      <CompletionDetail
                        key={`${step.key}-${detail.label}`}
                        label={detail.label}
                        value={detail.value}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {!isSubmittedOnly ? (
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
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Card className="border-border/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Preparation snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <SnapshotTile label="Current stage" value={insights.preparationSnapshot.preparation.classLevel} />
              <SnapshotTile label="Board" value={insights.preparationSnapshot.preparation.board} />
              <SnapshotTile label="Target exam" value={primaryExam} />
              <SnapshotTile label="Target year" value={insights.preparationSnapshot.preparation.targetYear} />
              <SnapshotTile label="Learning mode" value={insights.preparationSnapshot.learningMode.mode} />
              <SnapshotTile label="Learning provider" value={learningProvider} />
              <SnapshotTile label="Date of birth" value={formatDateSafe(insights.preparationSnapshot.dateOfBirth, "dd MMM yyyy")} />
              <SnapshotTile
                label="WhatsApp"
                value={
                  insights.preparationSnapshot.whatsappOnSameNumber
                    ? `Same as phone${insights.student.phone ? ` (${insights.student.phone})` : ""}`
                    : insights.preparationSnapshot.whatsappNumber
                }
              />
              <SnapshotTile label="Country" value={insights.preparationSnapshot.address.country} />
              <SnapshotTile label="State" value={insights.preparationSnapshot.address.state} />
              <SnapshotTile label="District" value={insights.preparationSnapshot.address.district} />
              <SnapshotTile label="Street" value={insights.preparationSnapshot.address.street} />
              <SnapshotTile label="City" value={insights.preparationSnapshot.address.city} />
              <SnapshotTile label="Pincode" value={insights.preparationSnapshot.address.pincode} />
              <SnapshotTile label="Lead source" value={insights.preparationSnapshot.hearAboutUs} />
            </div>
          </CardContent>
        </Card>

        {isSubmittedOnly ? null : (
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
        )}
      </div>
    </div>
  );
}
