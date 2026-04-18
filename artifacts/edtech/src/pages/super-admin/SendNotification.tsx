import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  Bell, Users, GraduationCap, UserCheck, Globe, Send,
  CheckCircle, AlertTriangle, Sparkles, Link as LinkIcon,
  Tag, ChevronDown,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Target = "all" | "admins" | "students";
type NotifType = "system" | "grade" | "test";

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
    color: "from-blue-500 to-cyan-600",
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
  { value: "system", label: "System", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  { value: "grade", label: "Grade", color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  { value: "test", label: "Test", color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
];

interface HistoryEntry {
  target: string;
  title: string;
  message?: string;
  type: string;
  sent: number;
  time: Date;
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

  const selectedTarget = TARGETS.find((t) => t.value === target)!;
  const selectedType = TYPES.find((t) => t.value === notifType)!;

  const handleSend = async () => {
    if (!title.trim()) { setError("Title is required."); return; }
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
        title: "Notification sent!",
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

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-purple-600 to-pink-600 p-6 text-white shadow-lg">
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-white/60 text-sm mb-1">
            <Bell size={14} /> Broadcast Notifications
          </div>
          <h1 className="text-2xl font-bold">Send Notification</h1>
          <p className="text-white/60 text-sm mt-1">
            Broadcast test, grade, or system updates to admins, students, or everyone on the platform.
          </p>
        </div>
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-10 translate-x-10" />
        <div className="absolute bottom-0 right-24 w-24 h-24 bg-white/4 rounded-full translate-y-8" />
      </div>

      {/* Target audience */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users size={14} className="text-violet-500" /> Audience
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-3 gap-3">
            {TARGETS.map((t) => (
              <button
                key={t.value}
                onClick={() => setTarget(t.value)}
                data-testid={`target-${t.value}`}
                className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-150 text-center ${
                  target === t.value
                    ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30"
                    : "border-border hover:border-violet-300 hover:bg-muted/50"
                }`}
              >
                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${t.color} flex items-center justify-center text-white shadow`}>
                  {t.icon}
                </div>
                <div>
                  <p className="text-sm font-semibold">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.desc}</p>
                </div>
                {target === t.value && (
                  <CheckCircle size={14} className="absolute top-2 right-2 text-violet-500" />
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Compose */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles size={14} className="text-violet-500" /> Compose Message
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          {error && (
            <Alert variant="destructive" className="py-2.5">
              <AlertTriangle size={14} className="mr-2" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Type selector */}
          <div className="space-y-1.5">
            <Label className="text-sm flex items-center gap-1.5"><Tag size={13} /> Notification Type</Label>
            <div className="relative">
              <button
                onClick={() => setShowTypes((v) => !v)}
                data-testid="button-type-selector"
                className="w-full flex items-center justify-between px-3 py-2 border border-border rounded-lg bg-background text-sm hover:border-ring transition-colors"
              >
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${selectedType.color}`}>
                  {selectedType.label}
                </span>
                <ChevronDown size={14} className={`text-muted-foreground transition-transform ${showTypes ? "rotate-180" : ""}`} />
              </button>
              {showTypes && (
                <div className="absolute top-full left-0 right-0 mt-1 border border-border rounded-lg bg-background shadow-lg z-20 overflow-hidden">
                  {TYPES.map((t) => (
                    <button
                      key={t.value}
                      className="w-full flex items-center px-3 py-2 text-sm hover:bg-muted transition-colors"
                      onClick={() => { setNotifType(t.value); setShowTypes(false); }}
                      data-testid={`type-option-${t.value}`}
                    >
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium mr-3 ${t.color}`}>{t.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-sm flex items-center gap-1.5"><Bell size={13} /> Title <span className="text-destructive">*</span></Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. School is closed tomorrow"
              data-testid="input-notif-title"
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground text-right">{title.length}/100</p>
          </div>

          {/* Message */}
          <div className="space-y-1.5">
            <Label className="text-sm">Message <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add more context or details..."
              rows={3}
              className="resize-none"
              data-testid="input-notif-message"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground text-right">{message.length}/500</p>
          </div>

          {/* Link */}
          <div className="space-y-1.5">
            <Label className="text-sm flex items-center gap-1.5"><LinkIcon size={13} /> Link <span className="text-muted-foreground text-xs">(optional — opens when notification is clicked)</span></Label>
            <Input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="e.g. /leaderboard"
              data-testid="input-notif-link"
            />
          </div>

          {/* Preview */}
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">Preview</p>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white shrink-0">
                <Bell size={15} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-semibold">{title || "Your notification title"}</p>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${selectedType.color}`}>{selectedType.label}</span>
                </div>
                {message && <p className="text-xs text-muted-foreground">{message}</p>}
                <p className="text-xs text-muted-foreground mt-1">
                  → {selectedTarget.label} · Just now
                </p>
              </div>
            </div>
          </div>

          {/* Send */}
          <Button
            className="w-full gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
            onClick={handleSend}
            disabled={sending || !title.trim()}
            data-testid="button-send-notification"
          >
            {sending ? (
              <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Sending…</>
            ) : (
              <><Send size={15} /> Send to {selectedTarget.label}</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* History */}
      {history.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle size={14} className="text-emerald-500" /> Sent This Session
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {history.map((h, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 border border-border/60">
                <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 shrink-0">
                  <CheckCircle size={13} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{h.title}</p>
                  {h.message && <p className="text-xs text-muted-foreground truncate">{h.message}</p>}
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-[10px]">{h.target}</Badge>
                    <span className="text-[10px] text-muted-foreground">{h.sent} recipients · {h.time.toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
