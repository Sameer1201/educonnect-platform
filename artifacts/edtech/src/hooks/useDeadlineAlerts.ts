import { useEffect, useRef, useState, useCallback } from "react";

const BASE = () => import.meta.env.BASE_URL.replace(/\/$/, "");

export type AlertTicket = {
  id: number;
  subject: string;
  deadline: string;
  status: string;
  urgency: "overdue" | "critical" | "warning";
  minutesLeft: number;
};

function classifyDeadline(deadline: string): { urgency: AlertTicket["urgency"]; minutesLeft: number } | null {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - Date.now();
  const minutes = Math.floor(ms / 60000);
  if (minutes > 24 * 60) return null; // more than 24h away — no alert
  if (ms <= 0) return { urgency: "overdue", minutesLeft: minutes };
  if (minutes <= 60) return { urgency: "critical", minutesLeft: minutes };
  return { urgency: "warning", minutesLeft: minutes };
}

export function useDeadlineAlerts(enabled: boolean) {
  const [alerts, setAlerts] = useState<AlertTicket[]>([]);
  const [show, setShow] = useState(false);
  const seenRef = useRef<Set<string>>(new Set());
  const checkRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    // Mark all current alerts as seen for this session
    alerts.forEach((a) => seenRef.current.add(`${a.id}:${a.urgency}`));
    setShow(false);
  }, [alerts]);

  const checkNow = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch(`${BASE()}/api/support`, { credentials: "include" });
      if (!res.ok) return;
      const tickets: any[] = await res.json();
      const found: AlertTicket[] = [];
      for (const t of tickets) {
        if (!t.deadline || t.status === "resolved") continue;
        const info = classifyDeadline(t.deadline);
        if (!info) continue;
        const key = `${t.id}:${info.urgency}`;
        if (!seenRef.current.has(key)) {
          found.push({ id: t.id, subject: t.subject, deadline: t.deadline, status: t.status, ...info });
        }
      }
      if (found.length > 0) {
        setAlerts(found);
        setShow(true);
      }
    } catch {
      // silently ignore
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    checkNow();
    // Re-check every 5 minutes
    checkRef.current = setInterval(checkNow, 5 * 60 * 1000);
    return () => { if (checkRef.current) clearInterval(checkRef.current); };
  }, [enabled, checkNow]);

  return { alerts, show, dismiss, checkNow };
}
