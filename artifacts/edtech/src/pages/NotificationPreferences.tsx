import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Bell, BookOpen, GraduationCap, FlaskConical, Users,
  MessageCircle, Megaphone, BarChart3, CalendarDays, Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

interface Prefs {
  assignment: boolean;
  grade: boolean;
  test: boolean;
  class: boolean;
  system: boolean;
  community: boolean;
  digest: boolean;
  weeklyDigest: boolean;
}

const PREF_FIELDS: {
  key: keyof Prefs;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}[] = [
  {
    key: "assignment",
    label: "Assignments",
    description: "New assignments published, submission received, due date reminders",
    icon: <BookOpen size={18} />,
    color: "text-orange-600",
  },
  {
    key: "grade",
    label: "Grades & Feedback",
    description: "When your assignments or tests are graded and feedback is posted",
    icon: <GraduationCap size={18} />,
    color: "text-green-600",
  },
  {
    key: "test",
    label: "Tests & Quizzes",
    description: "New tests published, results available, scheduled test reminders",
    icon: <FlaskConical size={18} />,
    color: "text-purple-600",
  },
  {
    key: "class",
    label: "Classes",
    description: "Class starting live, new class scheduled, class updates",
    icon: <Users size={18} />,
    color: "text-blue-600",
  },
  {
    key: "community",
    label: "Community",
    description: "New posts, replies to your comments, mentions in discussions",
    icon: <MessageCircle size={18} />,
    color: "text-teal-600",
  },
  {
    key: "system",
    label: "System Announcements",
    description: "Platform updates, maintenance notices, important alerts",
    icon: <Megaphone size={18} />,
    color: "text-slate-600",
  },
  {
    key: "digest",
    label: "Digest Summaries",
    description: "Periodic summary of all your recent activity",
    icon: <BarChart3 size={18} />,
    color: "text-indigo-600",
  },
];

const DEFAULT_PREFS: Prefs = {
  assignment: true,
  grade: true,
  test: true,
  class: true,
  system: true,
  community: true,
  digest: true,
  weeklyDigest: true,
};

export default function NotificationPreferences() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  useEffect(() => {
    fetch(`${BASE}/api/notification-preferences`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setPrefs({ ...DEFAULT_PREFS, ...data }))
      .catch(() => {});
  }, [BASE]);

  function toggle(key: keyof Prefs) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      await fetch(`${BASE}/api/notification-preferences`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(prefs),
      });
      setDirty(false);
      toast({ title: "Preferences saved!" });
    } catch {
      toast({ title: "Failed to save preferences", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="text-primary" size={22} /> Notification Preferences
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Choose which events trigger notifications for you
          </p>
        </div>
        {dirty && (
          <Button onClick={save} disabled={saving} className="gap-1.5">
            <Save size={14} /> {saving ? "Saving…" : "Save"}
          </Button>
        )}
      </div>

      {/* Per-type toggles */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Notification Types
        </h2>
        {PREF_FIELDS.map((f) => (
          <div
            key={f.key}
            className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-card hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 shrink-0 ${f.color}`}>{f.icon}</div>
              <div>
                <p className="text-sm font-medium">{f.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{f.description}</p>
              </div>
            </div>
            <Switch
              checked={prefs[f.key]}
              onCheckedChange={() => toggle(f.key)}
            />
          </div>
        ))}
      </div>

      {/* Weekly digest */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Weekly Digest
        </h2>
        <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-card hover:bg-muted/30 transition-colors">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0 text-indigo-600">
              <CalendarDays size={18} />
            </div>
            <div>
              <p className="text-sm font-medium">Weekly Activity Digest</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Receive a weekly summary of all your activity — assignments, tests, grades, and more
              </p>
            </div>
          </div>
          <Switch
            checked={prefs.weeklyDigest}
            onCheckedChange={() => toggle("weeklyDigest")}
          />
        </div>
      </div>

      {/* Save footer */}
      {dirty && (
        <div className="flex justify-end pt-2">
          <Button onClick={save} disabled={saving} className="gap-1.5">
            <Save size={14} /> {saving ? "Saving…" : "Save preferences"}
          </Button>
        </div>
      )}
    </div>
  );
}
