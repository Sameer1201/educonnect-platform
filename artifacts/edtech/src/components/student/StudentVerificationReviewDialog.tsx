import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  AlertCircle,
  BookOpen,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Globe,
  GraduationCap,
  Hash,
  Home,
  Landmark,
  Mail,
  Map,
  MapPin,
  Phone,
  Search,
  Shield,
  Target,
  User,
  Wifi,
  X,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { StudentProfileInsights } from "@/components/student/StudentProfileInsightsPanel";
import { PremiumWhiteLoader } from "@/components/ui/PremiumWhiteLoader";
import { formatExamDisplayName, formatExamDisplayNames } from "@/lib/exam-display";

interface StudentVerificationSummary {
  fullName: string;
  username: string;
  status: string;
  onboardingComplete?: boolean;
  rejectionReason?: string | null;
  targetExam?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  initials?: string;
}

interface StudentVerificationReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: StudentVerificationSummary | null;
  insights?: StudentProfileInsights | null;
  isLoading?: boolean;
  errorMessage?: string | null;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  primaryActionDisabled?: boolean;
  secondaryActionDisabled?: boolean;
  settingsContent?: React.ReactNode;
}

type VerificationTab = "overview" | "details" | "settings";

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatDateLabel(value: string | null | undefined, pattern = "dd MMM yyyy") {
  if (!value) return "Not provided";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not provided";
  return format(parsed, pattern);
}

function toStatusLabel(status: string | null | undefined) {
  if (!status) return "Pending";
  const normalized = status.trim().toLowerCase();
  if (normalized === "approved" || normalized === "active") return "Approved";
  if (normalized === "rejected" || normalized === "revoked") return "Rejected";
  return "Pending";
}

function getPreparationInstitutionMeta(preparation: StudentProfileInsights["preparationSnapshot"]["preparation"]) {
  const isUgUniversity = preparation.board.trim() === "UG University";
  const institutionValue = (
    isUgUniversity
      ? preparation.collegeName.trim()
      : preparation.institutionName.trim()
  ) || preparation.institutionName.trim() || preparation.collegeName.trim() || "Not provided";

  return {
    isUgUniversity,
    institutionLabel: isUgUniversity ? "College" : "School / College",
    institutionValue,
    universityValue: isUgUniversity ? (preparation.universityName.trim() || "Not provided") : "",
  };
}

function InfoCard({
  icon,
  label,
  value,
  iconBg = "bg-orange-50",
  iconColor = "text-orange-500",
  hoverBorder = "hover:border-orange-200",
  hoverBg = "group-hover:bg-orange-100",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  iconBg?: string;
  iconColor?: string;
  hoverBorder?: string;
  hoverBg?: string;
}) {
  return (
    <div className={`group rounded-xl border border-slate-100 bg-white p-4 transition-all duration-200 hover:shadow-sm ${hoverBorder}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBg} ${hoverBg} transition-colors`}>
          <span className={iconColor}>{icon}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
          <p className="break-words text-sm font-semibold leading-snug text-slate-800">{value || "Not provided"}</p>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  iconBg = "bg-orange-50",
  iconColor = "text-orange-500",
}: {
  icon: React.ReactNode;
  title: string;
  iconBg?: string;
  iconColor?: string;
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconBg}`}>
        <span className={iconColor}>{icon}</span>
      </div>
      <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">{title}</h3>
    </div>
  );
}

export function StudentVerificationReviewDialog({
  open,
  onOpenChange,
  student,
  insights,
  isLoading = false,
  errorMessage,
  onPrimaryAction,
  onSecondaryAction,
  primaryActionLabel = "Approve",
  secondaryActionLabel = "Reject",
  primaryActionDisabled = false,
  secondaryActionDisabled = false,
  settingsContent,
}: StudentVerificationReviewDialogProps) {
  const [activeTab, setActiveTab] = useState<VerificationTab>("overview");
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  const [highlightedSection, setHighlightedSection] = useState<string | null>(null);
  const [showLoader, setShowLoader] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setActiveTab("overview");
      setScrollTarget(null);
      setHighlightedSection(null);
      setShowLoader(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !isLoading) {
      setShowLoader(false);
      return;
    }
    const timer = window.setTimeout(() => setShowLoader(true), 180);
    return () => window.clearTimeout(timer);
  }, [open, isLoading]);

  useEffect(() => {
    if (activeTab !== "details" || !scrollTarget) return;
    const timer = setTimeout(() => {
      const target = document.getElementById(scrollTarget);
      if (!target || !contentRef.current) return;
      const container = contentRef.current;
      const offsetTop = target.offsetTop - container.offsetTop;
      container.scrollTo({ top: offsetTop - 16, behavior: "smooth" });
      setHighlightedSection(scrollTarget);
      setTimeout(() => setHighlightedSection(null), 1800);
      setScrollTarget(null);
    }, 120);
    return () => clearTimeout(timer);
  }, [activeTab, scrollTarget]);

  const summary = useMemo(() => {
    const fullName = insights?.student.fullName || student?.fullName || "Student";
    const username = insights?.student.username || student?.username || "";
    const status = toStatusLabel(insights?.student.status || student?.status);
    const onboardingComplete = insights?.student.onboardingComplete ?? student?.onboardingComplete ?? false;
    const rejectionReason = insights?.student.rejectionReason ?? student?.rejectionReason ?? null;
    const avatarUrl = insights?.student.avatarUrl ?? student?.avatarUrl ?? null;
    const initials = student?.initials || getInitials(fullName);
    return {
      fullName,
      username: username.startsWith("@") ? username : `@${username}`,
      status,
      onboardingComplete,
      rejectionReason,
      avatarUrl,
      initials,
    };
  }, [insights, student]);

  const primaryExam = useMemo(
    () => formatExamDisplayName(
      insights?.preparationSnapshot.preparation.targetExam?.trim()
      || insights?.student.subject?.trim()
      || student?.targetExam?.trim()
      || "",
    ),
    [insights, student?.targetExam],
  );

  const selectedExams = useMemo(() => {
    const exams = formatExamDisplayNames([
      primaryExam,
      ...(insights?.student.additionalExams ?? []),
    ]);
    return exams;
  }, [insights?.student.additionalExams, primaryExam]);

  const additionalExamLabels = useMemo(
    () => formatExamDisplayNames(insights?.student.additionalExams ?? []),
    [insights?.student.additionalExams],
  );

  const learningMode = useMemo(() => {
    if (!insights) return "";
    const values = [
      insights.preparationSnapshot.learningMode.mode,
      insights.preparationSnapshot.learningMode.provider,
    ]
      .map((value) => value.trim())
      .filter((value, index, all) => Boolean(value) && all.indexOf(value) === index);
    return values.join(" · ");
  }, [insights]);
  const preparationInstitution = useMemo(
    () => insights ? getPreparationInstitutionMeta(insights.preparationSnapshot.preparation) : null,
    [insights],
  );

  const fullLocation = useMemo(() => {
    if (!insights) return "";
    return [
      insights.preparationSnapshot.address.street,
      insights.preparationSnapshot.address.city,
      insights.preparationSnapshot.address.district,
      insights.preparationSnapshot.address.state,
      insights.preparationSnapshot.address.country,
    ]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(", ");
  }, [insights]);

  const reviewBlocks = useMemo(() => {
    if (!insights) return [];
    const sectionMap: Record<string, string> = {
      personal: "contact-details",
      address: "address-details",
      preparation: "schooling-target",
      learning: "learning-source",
      discovery: "learning-source",
    };
    return insights.profileCompletion.steps.map((step) => ({
      label: step.label,
      status: step.complete ? "Ready" : "Missing",
      sectionId: sectionMap[step.key] ?? "contact-details",
      complete: step.complete,
    }));
  }, [insights]);

  const showActionButtons = Boolean(onPrimaryAction || onSecondaryAction);
  const tabs: Array<{ id: VerificationTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "details", label: "Full Details" },
    ...(settingsContent ? [{ id: "settings" as VerificationTab, label: "Settings" }] : []),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(96vw,76rem)] overflow-hidden border-none bg-transparent p-0 shadow-none [&>button]:hidden">
        <div className="w-full overflow-hidden rounded-[28px] border border-slate-100 bg-white shadow-2xl shadow-slate-200/80">
          <div className="flex items-center justify-between bg-gradient-to-r from-slate-800 via-slate-800 to-slate-900 px-8 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-500/20 backdrop-blur">
                <Shield className="h-4 w-4 text-orange-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold leading-tight text-white">Student Verification Profile</h2>
                <p className="text-xs font-medium text-slate-400">{summary.username}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 transition-colors hover:bg-white/20"
            >
              <X className="h-4 w-4 text-slate-300" />
            </button>
          </div>

          <div className="flex items-center gap-5 border-b border-slate-100 bg-white px-8 py-5">
            <div className="relative">
              {summary.avatarUrl ? (
                <img src={summary.avatarUrl} alt={summary.fullName} className="h-20 w-20 rounded-2xl object-cover shadow-lg" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 shadow-lg">
                  <span className="text-2xl font-bold tracking-wide text-white">{summary.initials}</span>
                </div>
              )}
              <div className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-emerald-500">
                <CheckCircle2 className="h-3.5 w-3.5 text-white" />
              </div>
            </div>

            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-xl font-extrabold text-slate-900">{summary.fullName}</h1>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                    summary.status === "Pending"
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : summary.status === "Approved"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-rose-200 bg-rose-50 text-rose-700"
                  }`}
                >
                  {summary.status === "Pending" ? <Clock className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                  {summary.status}
                </span>
                {summary.onboardingComplete ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="h-3 w-3" />
                    Setup complete
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {summary.username} · Student-submitted application details for approval review.
              </p>
            </div>

            {showActionButtons ? (
              <div className="ml-auto flex gap-2">
                {onPrimaryAction ? (
                  <button
                    type="button"
                    onClick={onPrimaryAction}
                    disabled={primaryActionDisabled}
                    className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-200 transition-all hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {primaryActionLabel}
                  </button>
                ) : null}
                {onSecondaryAction ? (
                  <button
                    type="button"
                    onClick={onSecondaryAction}
                    disabled={secondaryActionDisabled}
                    className="rounded-xl border border-red-200 bg-red-50 px-5 py-2.5 text-sm font-semibold text-red-600 transition-all hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {secondaryActionLabel}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex gap-1 border-b border-slate-100 px-8 pt-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as VerificationTab)}
                className={`relative rounded-t-xl px-5 py-2.5 text-sm font-semibold transition-all ${
                  activeTab === tab.id
                    ? "bg-orange-50 text-orange-600"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                }`}
              >
                {tab.label}
                {activeTab === tab.id ? <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full bg-orange-500" /> : null}
              </button>
            ))}
          </div>

          <div ref={contentRef} className="max-h-[calc(100vh-280px)] overflow-y-auto bg-slate-50/60 p-8">
            {isLoading ? (
              <div className="rounded-[28px] border border-slate-100 bg-white p-4 shadow-sm">
                {showLoader ? (
                  <PremiumWhiteLoader progress={72} />
                ) : (
                  <div className="h-[280px] animate-pulse rounded-[24px] bg-gradient-to-br from-white via-slate-50 to-white" />
                )}
              </div>
            ) : errorMessage ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
                {errorMessage}
              </div>
            ) : activeTab === "settings" ? (
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                {settingsContent}
              </div>
            ) : !insights ? null : activeTab === "overview" ? (
              <div className="grid gap-6 lg:grid-cols-5">
                <div className="col-span-2 flex flex-col gap-5">
                  <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                    <SectionHeader icon={<Target className="h-4 w-4" />} title="Exam Focus" iconBg="bg-rose-50" iconColor="text-rose-500" />
                    <div className="mb-4 flex flex-wrap gap-2">
                      {selectedExams.length > 0 ? (
                        selectedExams.map((exam) => (
                          <span key={exam} className="rounded-lg bg-rose-100 px-3 py-1.5 text-sm font-semibold uppercase tracking-wide text-rose-700">
                            {exam}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm font-medium text-slate-500">No exam selected</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
                      <BookOpen className="h-4 w-4 text-amber-400" />
                      <span className="text-xs font-medium text-slate-500">
                        {selectedExams.length || 0} exam selected
                      </span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                    <SectionHeader icon={<GraduationCap className="h-4 w-4" />} title="Quick Review" iconBg="bg-violet-50" iconColor="text-violet-500" />
                    <div className="space-y-3">
                      <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 transition-colors hover:bg-violet-50">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Target Year</span>
                        <span className="text-sm font-bold text-slate-800">
                          {insights.preparationSnapshot.preparation.targetYear || "Not provided"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 transition-colors hover:bg-violet-50">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Learning Mode</span>
                        <span className="max-w-[160px] text-right text-xs font-semibold leading-tight text-violet-600">
                          {learningMode || "Not provided"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 transition-colors hover:bg-violet-50">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lead Source</span>
                        <div className="flex items-center gap-1.5">
                          <Search className="h-3 w-3 text-violet-400" />
                          <span className="text-xs font-semibold text-slate-700">
                            {insights.preparationSnapshot.hearAboutUs || "Not provided"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="col-span-3">
                  <div className="h-full rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                    <div className="mb-5 flex items-center justify-between">
                      <SectionHeader icon={<AlertCircle className="h-4 w-4" />} title="Review Summary" iconBg="bg-amber-50" iconColor="text-amber-500" />
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-600">
                        Admin Review Required
                      </span>
                    </div>

                    <div className="mb-5 rounded-xl border border-orange-100 bg-gradient-to-r from-orange-50 to-amber-50 p-4">
                      <div className="mb-1 flex items-end gap-2">
                        <span className="text-4xl font-black leading-none text-orange-700">{insights.profileCompletion.percent}%</span>
                      </div>
                      <p className="mb-3 text-xs font-semibold text-orange-500">
                        {insights.profileCompletion.completedSteps} of {insights.profileCompletion.totalSteps} blocks completed
                      </p>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-orange-100">
                        <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-500" style={{ width: `${insights.profileCompletion.percent}%` }} />
                      </div>
                    </div>

                    <div className="space-y-2">
                      {reviewBlocks.map((block) => (
                        <button
                          key={`${block.label}-${block.sectionId}`}
                          type="button"
                          onClick={() => {
                            setScrollTarget(block.sectionId);
                            setActiveTab("details");
                          }}
                          className="group flex w-full cursor-pointer items-center justify-between rounded-xl bg-slate-50 p-3.5 transition-all hover:bg-orange-50 active:scale-[0.99]"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`flex h-6 w-6 items-center justify-center rounded-full ${block.complete ? "bg-emerald-100" : "bg-amber-100"}`}>
                              {block.complete ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              ) : (
                                <AlertCircle className="h-4 w-4 text-amber-600" />
                              )}
                            </div>
                            <span className="text-sm font-semibold text-slate-700">{block.label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors ${
                              block.complete
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700 group-hover:bg-emerald-100"
                                : "border-amber-200 bg-amber-50 text-amber-700 group-hover:bg-amber-100"
                            }`}>
                              {block.status}
                            </span>
                            <div className="flex h-6 w-6 -translate-x-1 items-center justify-center rounded-full bg-orange-100 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100">
                              <ChevronRight className="h-3.5 w-3.5 text-orange-500" />
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid gap-6 xl:grid-cols-2">
                <div
                  id="contact-details"
                  className={`rounded-2xl border bg-white p-5 shadow-sm transition-all duration-500 ${highlightedSection === "contact-details" ? "border-sky-400 ring-2 ring-sky-200" : "border-slate-100"}`}
                >
                  <SectionHeader icon={<User className="h-4 w-4" />} title="Contact Details" iconBg="bg-sky-50" iconColor="text-sky-500" />
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <InfoCard icon={<Mail className="h-4 w-4" />} label="Email" value={insights.student.email} iconBg="bg-sky-50" iconColor="text-sky-500" hoverBorder="hover:border-sky-200" hoverBg="group-hover:bg-sky-100" />
                    </div>
                    <InfoCard icon={<Phone className="h-4 w-4" />} label="Phone Number" value={insights.student.phone || "Not provided"} iconBg="bg-emerald-50" iconColor="text-emerald-500" hoverBorder="hover:border-emerald-200" hoverBg="group-hover:bg-emerald-100" />
                    <InfoCard
                      icon={<Wifi className="h-4 w-4" />}
                      label="WhatsApp"
                      value={insights.preparationSnapshot.whatsappOnSameNumber ? `Same as phone${insights.student.phone ? ` (${insights.student.phone})` : ""}` : insights.preparationSnapshot.whatsappNumber || "Not provided"}
                      iconBg="bg-teal-50"
                      iconColor="text-teal-500"
                      hoverBorder="hover:border-teal-200"
                      hoverBg="group-hover:bg-teal-100"
                    />
                    <InfoCard icon={<Calendar className="h-4 w-4" />} label="Date of Birth" value={formatDateLabel(insights.preparationSnapshot.dateOfBirth)} iconBg="bg-violet-50" iconColor="text-violet-500" hoverBorder="hover:border-violet-200" hoverBg="group-hover:bg-violet-100" />
                    <InfoCard icon={<User className="h-4 w-4" />} label="Username" value={summary.username} iconBg="bg-orange-50" iconColor="text-orange-500" hoverBorder="hover:border-orange-200" hoverBg="group-hover:bg-orange-100" />
                  </div>
                </div>

                <div
                  id="schooling-target"
                  className={`rounded-2xl border bg-white p-5 shadow-sm transition-all duration-500 ${highlightedSection === "schooling-target" ? "border-emerald-400 ring-2 ring-emerald-200" : "border-slate-100"}`}
                >
                  <SectionHeader icon={<GraduationCap className="h-4 w-4" />} title="Schooling & Target" iconBg="bg-emerald-50" iconColor="text-emerald-500" />
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <InfoCard icon={<BookOpen className="h-4 w-4" />} label="Current Stage" value={insights.preparationSnapshot.preparation.classLevel || "Not provided"} iconBg="bg-amber-50" iconColor="text-amber-500" hoverBorder="hover:border-amber-200" hoverBg="group-hover:bg-amber-100" />
                    </div>
                    <InfoCard icon={<GraduationCap className="h-4 w-4" />} label="Board" value={insights.preparationSnapshot.preparation.board || "Not provided"} iconBg="bg-emerald-50" iconColor="text-emerald-500" hoverBorder="hover:border-emerald-200" hoverBg="group-hover:bg-emerald-100" />
                    <InfoCard icon={<Building2 className="h-4 w-4" />} label={preparationInstitution?.institutionLabel || "School / College"} value={preparationInstitution?.institutionValue || "Not provided"} iconBg="bg-sky-50" iconColor="text-sky-500" hoverBorder="hover:border-sky-200" hoverBg="group-hover:bg-sky-100" />
                    {preparationInstitution?.isUgUniversity ? (
                      <InfoCard icon={<Landmark className="h-4 w-4" />} label="University" value={preparationInstitution.universityValue} iconBg="bg-indigo-50" iconColor="text-indigo-500" hoverBorder="hover:border-indigo-200" hoverBg="group-hover:bg-indigo-100" />
                    ) : null}
                    <InfoCard icon={<Target className="h-4 w-4" />} label="Target Exam" value={primaryExam || "Not provided"} iconBg="bg-rose-50" iconColor="text-rose-500" hoverBorder="hover:border-rose-200" hoverBg="group-hover:bg-rose-100" />
                    <div className="md:col-span-2">
                      <InfoCard icon={<Calendar className="h-4 w-4" />} label="Target Year" value={insights.preparationSnapshot.preparation.targetYear || "Not provided"} iconBg="bg-violet-50" iconColor="text-violet-500" hoverBorder="hover:border-violet-200" hoverBg="group-hover:bg-violet-100" />
                    </div>
                  </div>
                </div>

                <div
                  id="address-details"
                  className={`rounded-2xl border bg-white p-5 shadow-sm transition-all duration-500 ${highlightedSection === "address-details" ? "border-pink-400 ring-2 ring-pink-200" : "border-slate-100"}`}
                >
                  <SectionHeader icon={<MapPin className="h-4 w-4" />} title="Address Details" iconBg="bg-pink-50" iconColor="text-pink-500" />
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="md:col-span-3">
                      <InfoCard icon={<Map className="h-4 w-4" />} label="Full Location" value={fullLocation || "Not provided"} iconBg="bg-pink-50" iconColor="text-pink-500" hoverBorder="hover:border-pink-200" hoverBg="group-hover:bg-pink-100" />
                    </div>
                    <InfoCard icon={<Home className="h-4 w-4" />} label="Street / Village" value={insights.preparationSnapshot.address.street || "Not provided"} iconBg="bg-orange-50" iconColor="text-orange-500" hoverBorder="hover:border-orange-200" hoverBg="group-hover:bg-orange-100" />
                    <InfoCard icon={<Building2 className="h-4 w-4" />} label="City / Town" value={insights.preparationSnapshot.address.city || "Not provided"} iconBg="bg-sky-50" iconColor="text-sky-500" hoverBorder="hover:border-sky-200" hoverBg="group-hover:bg-sky-100" />
                    <InfoCard icon={<Landmark className="h-4 w-4" />} label="District" value={insights.preparationSnapshot.address.district || "Not provided"} iconBg="bg-violet-50" iconColor="text-violet-500" hoverBorder="hover:border-violet-200" hoverBg="group-hover:bg-violet-100" />
                    <InfoCard icon={<MapPin className="h-4 w-4" />} label="State" value={insights.preparationSnapshot.address.state || "Not provided"} iconBg="bg-emerald-50" iconColor="text-emerald-500" hoverBorder="hover:border-emerald-200" hoverBg="group-hover:bg-emerald-100" />
                    <InfoCard icon={<Globe className="h-4 w-4" />} label="Country" value={insights.preparationSnapshot.address.country || "Not provided"} iconBg="bg-teal-50" iconColor="text-teal-500" hoverBorder="hover:border-teal-200" hoverBg="group-hover:bg-teal-100" />
                    <InfoCard icon={<Hash className="h-4 w-4" />} label="Pincode" value={insights.preparationSnapshot.address.pincode || "Not provided"} iconBg="bg-amber-50" iconColor="text-amber-500" hoverBorder="hover:border-amber-200" hoverBg="group-hover:bg-amber-100" />
                  </div>
                </div>

                <div
                  id="learning-source"
                  className={`rounded-2xl border bg-white p-5 shadow-sm transition-all duration-500 ${highlightedSection === "learning-source" ? "border-teal-400 ring-2 ring-teal-200" : "border-slate-100"}`}
                >
                  <SectionHeader icon={<Wifi className="h-4 w-4" />} title="Learning & Source" iconBg="bg-teal-50" iconColor="text-teal-500" />
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <InfoCard icon={<Wifi className="h-4 w-4" />} label="Learning Mode" value={insights.preparationSnapshot.learningMode.mode || "Not provided"} iconBg="bg-teal-50" iconColor="text-teal-500" hoverBorder="hover:border-teal-200" hoverBg="group-hover:bg-teal-100" />
                    </div>
                    <InfoCard icon={<BookOpen className="h-4 w-4" />} label="Provider" value={insights.preparationSnapshot.learningMode.provider || "Not provided"} iconBg="bg-amber-50" iconColor="text-amber-500" hoverBorder="hover:border-amber-200" hoverBg="group-hover:bg-amber-100" />
                    <InfoCard icon={<Search className="h-4 w-4" />} label="Lead Source" value={insights.preparationSnapshot.hearAboutUs || "Not provided"} iconBg="bg-violet-50" iconColor="text-violet-500" hoverBorder="hover:border-violet-200" hoverBg="group-hover:bg-violet-100" />
                    <div className="md:col-span-2">
                      <InfoCard icon={<Target className="h-4 w-4" />} label="Additional Exams" value={additionalExamLabels.length > 0 ? additionalExamLabels.join(", ") : "Not provided"} iconBg="bg-rose-50" iconColor="text-rose-500" hoverBorder="hover:border-rose-200" hoverBg="group-hover:bg-rose-100" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
