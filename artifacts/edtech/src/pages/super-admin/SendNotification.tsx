import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Bell, Users, GraduationCap, UserCheck, Globe, Send,
  CheckCircle, AlertTriangle, Sparkles, Link as LinkIcon,
  Tag, ChevronDown, Mail, RefreshCw, PlusCircle,
  KeyRound, ShieldCheck, Clock3, Server, AtSign,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Target = "all" | "admins" | "students";
type NotifType = "system" | "grade" | "test";

type ProviderStatus = "active" | "soft-limit-reached" | "limit-reached" | "inactive";

type ProviderUsage = {
  id: number | null;
  key: string;
  providerName: string;
  providerSource: string;
  senderEmail: string;
  senderName: string;
  dailyLimit: number;
  dailySoftLimit: number;
  usedToday: number;
  remainingDaily: number;
  remainingBeforeSoftLimit: number;
  lastSentAt: string | null;
  status: ProviderStatus;
  maskedApiKey: string;
  isActive: boolean;
};

type ProviderUsageResponse = {
  usageDate: string;
  totals: {
    configuredProviders: number;
    totalUsedToday: number;
    totalRemainingDaily: number;
  };
  providers: ProviderUsage[];
};

type EmailLogEntry = {
  id: number;
  providerKey: string;
  providerName: string;
  providerSource: string;
  providerMaskedApiKey: string;
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  messageType: string;
  status: "sent" | "failed" | string;
  errorMessage: string | null;
  metadata: string | null;
  sentAt: string | null;
};

interface HistoryEntry {
  target: string;
  title: string;
  message?: string;
  type: string;
  sent: number;
  time: Date;
}

const TARGETS: { value: Target; label: string; desc: string; icon: React.ReactNode; color: string }[] = [
  {
    value: "all",
    label: "Everyone",
    desc: "All teachers & students",
    icon: <Globe size={18} />,
    color: "from-violet-500 to-purple-600",
  },
  {
    value: "admins",
    label: "Admins / Teachers",
    desc: "Admin accounts only",
    icon: <UserCheck size={18} />,
    color: "from-orange-500 to-amber-600",
  },
  {
    value: "students",
    label: "Students",
    desc: "All student accounts",
    icon: <GraduationCap size={18} />,
    color: "from-emerald-500 to-teal-600",
  },
];

const TYPES: { value: NotifType; label: string; color: string }[] = [
  { value: "system", label: "System", color: "bg-amber-50 text-amber-700 border border-amber-200" },
  { value: "grade", label: "Grade", color: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  { value: "test", label: "Test", color: "bg-orange-50 text-orange-700 border border-orange-200" },
];

const PROVIDER_STATUS_COPY: Record<ProviderStatus, { label: string; className: string }> = {
  active: {
    label: "Active",
    className: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  },
  "soft-limit-reached": {
    label: "Soft limit reached",
    className: "bg-amber-50 text-amber-700 border border-amber-200",
  },
  "limit-reached": {
    label: "Limit reached",
    className: "bg-red-50 text-red-700 border border-red-200",
  },
  inactive: {
    label: "Off",
    className: "bg-slate-100 text-slate-600 border border-slate-200",
  },
};

function formatDateTime(value: string | null) {
  if (!value) return "No sends yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No sends yet";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function prettifyMessageType(value: string) {
  return value
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function SendNotification() {
  const { toast } = useToast();
  const [target, setTarget] = useState<Target>("all");
  const [notifType, setNotifType] = useState<NotifType>("system");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showTypes, setShowTypes] = useState(false);

  const [providerUsage, setProviderUsage] = useState<ProviderUsageResponse | null>(null);
  const [emailLogs, setEmailLogs] = useState<EmailLogEntry[]>([]);
  const [loadingEmailOps, setLoadingEmailOps] = useState(true);
  const [emailOpsError, setEmailOpsError] = useState("");
  const [showAddProviderDialog, setShowAddProviderDialog] = useState(false);
  const [addingProvider, setAddingProvider] = useState(false);
  const [togglingProviderId, setTogglingProviderId] = useState<number | null>(null);
  const [providerForm, setProviderForm] = useState({
    providerName: "",
    apiKey: "",
    senderEmail: "sameermajhi339@gmail.com",
    senderName: "Rank Pulse",
    dailyLimit: "300",
    dailySoftLimit: "250",
  });

  const selectedTarget = TARGETS.find((t) => t.value === target)!;
  const selectedType = TYPES.find((t) => t.value === notifType)!;

  const usageCards = useMemo(() => providerUsage?.providers ?? [], [providerUsage]);

  const fetchEmailOps = async () => {
    setLoadingEmailOps(true);
    setEmailOpsError("");
    try {
      const [usageRes, logsRes] = await Promise.all([
        fetch(`${BASE}/api/notifications/email-providers/usage`, {
          credentials: "include",
        }),
        fetch(`${BASE}/api/notifications/email-log?limit=40`, {
          credentials: "include",
        }),
      ]);

      if (!usageRes.ok) {
        const payload = await usageRes.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to load Brevo usage.");
      }
      if (!logsRes.ok) {
        const payload = await logsRes.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to load email delivery log.");
      }

      const usagePayload = await usageRes.json();
      const logsPayload = await logsRes.json();
      setProviderUsage(usagePayload);
      setEmailLogs(logsPayload.logs ?? []);
    } catch (err: any) {
      setEmailOpsError(err.message ?? "Failed to load email operations data.");
    } finally {
      setLoadingEmailOps(false);
    }
  };

  useEffect(() => {
    void fetchEmailOps();
  }, []);

  const handleSend = async () => {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setError("");
    setSending(true);
    try {
      const res = await fetch(`${BASE}/api/notifications/broadcast`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim() || undefined,
          link: link.trim() || undefined,
          type: notifType,
          target,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Failed to send");
      }
      const data = await res.json();
      const entry: HistoryEntry = {
        target: selectedTarget.label,
        title: title.trim(),
        message: message.trim() || undefined,
        type: notifType,
        sent: data.sent,
        time: new Date(),
      };
      setHistory((h) => [entry, ...h].slice(0, 10));
      toast({
        title: "Notification sent",
        description: `Delivered to ${data.sent} user${data.sent !== 1 ? "s" : ""}.`,
      });
      setTitle("");
      setMessage("");
      setLink("");
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setSending(false);
    }
  };

  const handleAddProvider = async () => {
    if (!providerForm.providerName.trim() || !providerForm.apiKey.trim() || !providerForm.senderEmail.trim()) {
      toast({
        title: "Missing details",
        description: "Account label, API key, and sender email are required.",
        variant: "destructive",
      });
      return;
    }

    setAddingProvider(true);
    try {
      const res = await fetch(`${BASE}/api/notifications/email-providers`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerName: providerForm.providerName.trim(),
          apiKey: providerForm.apiKey.trim(),
          senderEmail: providerForm.senderEmail.trim(),
          senderName: providerForm.senderName.trim() || "Rank Pulse",
          dailyLimit: Number(providerForm.dailyLimit),
          dailySoftLimit: Number(providerForm.dailySoftLimit),
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error ?? "Failed to add Brevo account.");
      }

      toast({
        title: "Brevo account added",
        description: `${payload.provider?.providerName ?? "New provider"} is ready for rotation.`,
      });
      setShowAddProviderDialog(false);
      setProviderForm({
        providerName: "",
        apiKey: "",
        senderEmail: "sameermajhi339@gmail.com",
        senderName: "Rank Pulse",
        dailyLimit: "300",
        dailySoftLimit: "250",
      });
      await fetchEmailOps();
    } catch (err: any) {
      toast({
        title: "Could not add Brevo account",
        description: err.message ?? "Please check the details and try again.",
        variant: "destructive",
      });
    } finally {
      setAddingProvider(false);
    }
  };

  const handleToggleProvider = async (provider: ProviderUsage) => {
    if (provider.providerSource !== "database" || provider.id == null) return;
    setTogglingProviderId(provider.id);
    try {
      const res = await fetch(`${BASE}/api/notifications/email-providers/${provider.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !provider.isActive }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error ?? "Failed to update Brevo account.");
      }
      toast({
        title: provider.isActive ? "Brevo account turned off" : "Brevo account turned on",
        description: `${provider.providerName} is now ${provider.isActive ? "inactive" : "active"} for email rotation.`,
      });
      await fetchEmailOps();
    } catch (err: any) {
      toast({
        title: "Could not update account",
        description: err.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setTogglingProviderId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#111827] via-[#7C2D12] to-[#F59E0B] p-6 text-white shadow-lg">
        <div className="relative z-10">
          <div className="mb-1 flex items-center gap-2 text-sm text-white/70">
            <Bell size={14} /> Notifications & Email Operations
          </div>
          <h1 className="text-2xl font-bold">Send Notification</h1>
          <p className="mt-1 text-sm text-white/75">
            Broadcast push updates, track Brevo usage, review email delivery, and add new Brevo API keys from one place.
          </p>
        </div>
        <div className="absolute right-0 top-0 h-40 w-40 translate-x-10 -translate-y-10 rounded-full bg-white/10" />
        <div className="absolute bottom-0 right-24 h-24 w-24 translate-y-8 rounded-full bg-white/10" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users size={14} className="text-[#D97706]" /> Audience
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {TARGETS.map((t) => (
              <button
                key={t.value}
                onClick={() => setTarget(t.value)}
                data-testid={`target-${t.value}`}
                className={`relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all duration-150 ${
                  target === t.value
                    ? "border-[#F59E0B] bg-[#FFF7E8]"
                    : "border-border hover:border-[#F59E0B]/40 hover:bg-muted/50"
                }`}
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${t.color} text-white shadow`}>
                  {t.icon}
                </div>
                <div>
                  <p className="text-sm font-semibold">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.desc}</p>
                </div>
                {target === t.value && (
                  <CheckCircle size={14} className="absolute right-2 top-2 text-[#D97706]" />
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles size={14} className="text-[#D97706]" /> Compose Message
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            {error && (
              <Alert variant="destructive" className="py-2.5">
                <AlertTriangle size={14} className="mr-2" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label className="text-sm flex items-center gap-1.5"><Tag size={13} /> Notification Type</Label>
              <div className="relative">
                <button
                  onClick={() => setShowTypes((v) => !v)}
                  data-testid="button-type-selector"
                  className="flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors hover:border-ring"
                >
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${selectedType.color}`}>
                    {selectedType.label}
                  </span>
                  <ChevronDown size={14} className={`text-muted-foreground transition-transform ${showTypes ? "rotate-180" : ""}`} />
                </button>
                {showTypes && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-border bg-background shadow-lg">
                    {TYPES.map((t) => (
                      <button
                        key={t.value}
                        className="flex w-full items-center px-3 py-2 text-sm transition-colors hover:bg-muted"
                        onClick={() => { setNotifType(t.value); setShowTypes(false); }}
                        data-testid={`type-option-${t.value}`}
                      >
                        <span className={`mr-3 rounded-full px-2 py-0.5 text-xs font-medium ${t.color}`}>{t.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm flex items-center gap-1.5"><Bell size={13} /> Title <span className="text-destructive">*</span></Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. School is closed tomorrow"
                data-testid="input-notif-title"
                maxLength={100}
              />
              <p className="text-right text-xs text-muted-foreground">{title.length}/100</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Message <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Add more context or details..."
                rows={3}
                className="resize-none"
                data-testid="input-notif-message"
                maxLength={500}
              />
              <p className="text-right text-xs text-muted-foreground">{message.length}/500</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm flex items-center gap-1.5"><LinkIcon size={13} /> Link <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="e.g. /leaderboard"
                data-testid="input-notif-link"
              />
            </div>

            <div className="space-y-2 rounded-xl border border-border bg-[#FFF7E8]/60 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview</p>
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#F59E0B] to-[#D97706] text-white">
                  <Bell size={15} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{title || "Your notification title"}</p>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${selectedType.color}`}>{selectedType.label}</span>
                  </div>
                  {message && <p className="text-xs text-muted-foreground">{message}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">→ {selectedTarget.label} · Just now</p>
                </div>
              </div>
            </div>

            <Button
              className="w-full gap-2 bg-gradient-to-r from-[#F59E0B] to-[#D97706] hover:from-[#E28B06] hover:to-[#B45309]"
              onClick={handleSend}
              disabled={sending || !title.trim()}
              data-testid="button-send-notification"
            >
              {sending ? (
                <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Sending…</>
              ) : (
                <><Send size={15} /> Send to {selectedTarget.label}</>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Server size={14} className="text-[#D97706]" /> Brevo Accounts
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Track which Brevo account is being used today and add new API keys without leaving this page.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => void fetchEmailOps()}
                  disabled={loadingEmailOps}
                >
                  <RefreshCw size={14} className={loadingEmailOps ? "animate-spin" : ""} />
                  Refresh
                </Button>
                <Button
                  size="sm"
                  className="gap-1 bg-gradient-to-r from-[#F59E0B] to-[#D97706] hover:from-[#E28B06] hover:to-[#B45309]"
                  onClick={() => setShowAddProviderDialog(true)}
                >
                  <PlusCircle size={14} />
                  Add Brevo
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            {emailOpsError && (
              <Alert variant="destructive" className="py-2.5">
                <AlertTriangle size={14} className="mr-2" />
                <AlertDescription>{emailOpsError}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#FDE7BE] bg-[#FFF7E8] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#B45309]">Configured</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{providerUsage?.totals.configuredProviders ?? 0}</p>
                <p className="mt-1 text-xs text-muted-foreground">Brevo accounts ready for rotation</p>
              </div>
              <div className="rounded-2xl border border-[#FDE7BE] bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#B45309]">Used Today</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{providerUsage?.totals.totalUsedToday ?? 0}</p>
                <p className="mt-1 text-xs text-muted-foreground">Emails sent across all active Brevo accounts</p>
              </div>
              <div className="rounded-2xl border border-[#FDE7BE] bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#B45309]">Remaining Today</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{providerUsage?.totals.totalRemainingDaily ?? 0}</p>
                <p className="mt-1 text-xs text-muted-foreground">Remaining daily quota across configured accounts</p>
              </div>
            </div>

            <div className="space-y-3">
              {loadingEmailOps ? (
                <div className="grid gap-3">
                  {[...Array(2)].map((_, index) => (
                    <div key={index} className="h-28 animate-pulse rounded-2xl bg-muted" />
                  ))}
                </div>
              ) : usageCards.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
                  <ShieldCheck size={18} className="mx-auto mb-2 text-[#D97706]" />
                  <p className="text-sm font-semibold">No Brevo accounts configured yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Add a new API key and sender email here so email rotation can start immediately.
                  </p>
                </div>
              ) : (
                usageCards.map((provider) => {
                  const statusCopy = PROVIDER_STATUS_COPY[provider.status];
                  const progress = provider.dailyLimit > 0 ? Math.min(100, Math.round((provider.usedToday / provider.dailyLimit) * 100)) : 0;
                  return (
                    <div key={provider.key} className="rounded-2xl border border-[#FDE7BE] bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">{provider.providerName}</p>
                            <Badge variant="outline" className={statusCopy.className}>{statusCopy.label}</Badge>
                            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                              {provider.providerSource}
                            </Badge>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1"><AtSign size={12} className="text-[#D97706]" /> {provider.senderEmail}</span>
                            <span className="inline-flex items-center gap-1"><KeyRound size={12} className="text-[#D97706]" /> {provider.maskedApiKey}</span>
                            <span className="inline-flex items-center gap-1"><Clock3 size={12} className="text-[#D97706]" /> {formatDateTime(provider.lastSentAt)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="rounded-2xl bg-[#FFF7E8] px-4 py-3 text-right">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#B45309]">Usage today</p>
                            <p className="mt-1 text-xl font-black text-slate-900">{provider.usedToday}<span className="ml-1 text-sm font-semibold text-muted-foreground">/ {provider.dailyLimit}</span></p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className={provider.providerSource === "database"
                              ? provider.isActive
                                ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                                : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              : "border-slate-200 bg-slate-50 text-slate-500"}
                            onClick={() => void handleToggleProvider(provider)}
                            disabled={provider.providerSource !== "database" || togglingProviderId === provider.id}
                          >
                            {provider.providerSource !== "database"
                              ? "Env locked"
                              : togglingProviderId === provider.id
                                ? "Saving..."
                                : provider.isActive
                                  ? "Turn Off"
                                  : "Turn On"}
                          </Button>
                        </div>
                      </div>
                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#FFF7E8]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#F59E0B] to-[#D97706]"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <div className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Soft limit</p>
                          <p className="mt-1 font-semibold text-slate-900">{provider.dailySoftLimit}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Before fallback</p>
                          <p className="mt-1 font-semibold text-slate-900">{provider.remainingBeforeSoftLimit}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Remaining today</p>
                          <p className="mt-1 font-semibold text-slate-900">{provider.remainingDaily}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <Mail size={14} className="text-[#D97706]" /> Email Delivery Log
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                See which email was sent to whom, from which Brevo account, and whether it was delivered or failed.
              </p>
            </div>
            <Badge variant="outline" className="border-[#FDE7BE] bg-[#FFF7E8] text-[#B45309]">
              {emailLogs.length} recent entries
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {loadingEmailOps ? (
            <div className="grid gap-3">
              {[...Array(4)].map((_, index) => (
                <div key={index} className="h-20 animate-pulse rounded-2xl bg-muted" />
              ))}
            </div>
          ) : emailLogs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
              <Mail size={18} className="mx-auto mb-2 text-[#D97706]" />
              <p className="text-sm font-semibold">No email activity yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Once Brevo starts sending reset, approval, rejection, or escalation emails, the log will appear here.
              </p>
            </div>
          ) : (
            emailLogs.map((log) => (
              <div key={log.id} className="rounded-2xl border border-border bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">{log.subject}</p>
                      <Badge
                        variant="outline"
                        className={log.status === "sent"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-red-200 bg-red-50 text-red-700"}
                      >
                        {log.status === "sent" ? "Sent" : "Failed"}
                      </Badge>
                      <Badge variant="outline" className="border-[#FDE7BE] bg-[#FFF7E8] text-[#B45309]">
                        {prettifyMessageType(log.messageType)}
                      </Badge>
                    </div>
                    <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                      <span className="inline-flex items-center gap-1"><Mail size={12} className="text-[#D97706]" /> To: {log.recipientEmail}</span>
                      <span className="inline-flex items-center gap-1"><Server size={12} className="text-[#D97706]" /> {log.providerName} ({log.providerKey})</span>
                      <span className="inline-flex items-center gap-1"><KeyRound size={12} className="text-[#D97706]" /> {log.providerMaskedApiKey}</span>
                      <span className="inline-flex items-center gap-1"><AtSign size={12} className="text-[#D97706]" /> From: {log.senderEmail}</span>
                      <span className="inline-flex items-center gap-1"><Clock3 size={12} className="text-[#D97706]" /> {formatDateTime(log.sentAt)}</span>
                    </div>
                    {log.errorMessage && (
                      <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                        {log.errorMessage}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle size={14} className="text-emerald-500" /> Sent This Session
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {history.map((h, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/40 p-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle size={13} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{h.title}</p>
                  {h.message && <p className="truncate text-xs text-muted-foreground">{h.message}</p>}
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">{h.target}</Badge>
                    <span className="text-[10px] text-muted-foreground">{h.sent} recipients · {h.time.toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={showAddProviderDialog} onOpenChange={setShowAddProviderDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add Brevo Account</DialogTitle>
            <DialogDescription>
              Add a new Brevo API key here so it becomes part of the live daily rotation without restarting the app.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label>Account Label</Label>
              <Input
                value={providerForm.providerName}
                onChange={(e) => setProviderForm((prev) => ({ ...prev, providerName: e.target.value }))}
                placeholder="e.g. Brevo Account 2"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Brevo API Key</Label>
              <Input
                type="password"
                value={providerForm.apiKey}
                onChange={(e) => setProviderForm((prev) => ({ ...prev, apiKey: e.target.value }))}
                placeholder="xkeysib-..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Sender Email</Label>
              <Input
                value={providerForm.senderEmail}
                onChange={(e) => setProviderForm((prev) => ({ ...prev, senderEmail: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Sender Name</Label>
              <Input
                value={providerForm.senderName}
                onChange={(e) => setProviderForm((prev) => ({ ...prev, senderName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Daily Limit</Label>
              <Input
                type="number"
                value={providerForm.dailyLimit}
                onChange={(e) => setProviderForm((prev) => ({ ...prev, dailyLimit: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Daily Soft Limit</Label>
              <Input
                type="number"
                value={providerForm.dailySoftLimit}
                onChange={(e) => setProviderForm((prev) => ({ ...prev, dailySoftLimit: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowAddProviderDialog(false)} disabled={addingProvider}>
              Cancel
            </Button>
            <Button
              className="bg-gradient-to-r from-[#F59E0B] to-[#D97706] hover:from-[#E28B06] hover:to-[#B45309]"
              onClick={() => void handleAddProvider()}
              disabled={addingProvider}
            >
              {addingProvider ? "Adding..." : "Add Brevo Account"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
