import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// Generate a stable session token per browser tab
function getSessionToken(): string {
  let token = sessionStorage.getItem("edtech_session_token");
  if (!token) {
    token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem("edtech_session_token", token);
  }
  return token;
}

const PAGE_LABELS: Record<string, string> = {
  "/": "Dashboard",
  "/admin/dashboard": "Admin Dashboard",
  "/admin/classes": "Admin Classes",
  "/admin/students": "Admin Students",
  "/admin/tests": "Admin Tests",
  "/admin/support": "Admin Support",
  "/student/dashboard": "Student Dashboard",
  "/student/classes": "Student Classes",
  "/student/tests": "Student Tests",
  "/student/feedback": "Student Feedback",
  "/student/support": "Student Support",
  "/super-admin/dashboard": "Super Admin Dashboard",
  "/super-admin/admins": "Manage Admins",
  "/super-admin/students": "All Students",
  "/super-admin/classes": "All Classes",
  "/super-admin/hr": "HR Dashboard",
  "/super-admin/finance": "Finance",
  "/super-admin/support": "Support Tickets",
  "/super-admin/tests": "Tests Overview",
  "/super-admin/activity": "User Activity",
  "/planner/dashboard": "Planner Dashboard",
  "/planner/courses": "Planner Courses",
  "/community": "Community",
  "/schedule": "Schedule",
};

function getPageLabel(path: string): string {
  // Check exact match first
  if (PAGE_LABELS[path]) return PAGE_LABELS[path];
  // Dynamic routes
  if (path.startsWith("/admin/class/")) return "Class Detail";
  if (path.startsWith("/admin/live-class/")) return "Live Class (Teacher)";
  if (path.startsWith("/admin/whiteboard/")) return "Whiteboard";
  if (path.startsWith("/planner/courses/")) return "Planner Course Detail";
  if (path.startsWith("/student/class/")) return "Class Detail";
  if (path.startsWith("/student/live-class/")) return "Live Class (Student)";
  if (path.startsWith("/student/whiteboard/")) return "Whiteboard";
  return path;
}

export function useActivityTracker(isAuthenticated: boolean) {
  const [location] = useLocation();
  const sessionToken = useRef(getSessionToken());
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPageRef = useRef<string>("");

  const logActivity = useCallback(async (action: string, page?: string, detail?: string) => {
    try {
      await fetch(`${BASE}/api/activity/log`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, page, detail }),
      });
    } catch { /* silent — don't block UI */ }
  }, []);

  const sendHeartbeat = useCallback(async () => {
    try {
      await fetch(`${BASE}/api/activity/heartbeat`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken: sessionToken.current }),
      });
    } catch { /* silent */ }
  }, []);

  // Start session when user is authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    const startSession = async () => {
      try {
        await fetch(`${BASE}/api/activity/session/start`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionToken: sessionToken.current }),
        });
        await logActivity("login", location, "Session started");
      } catch { /* silent */ }
    };

    startSession();

    // Heartbeat every 60 seconds
    heartbeatRef.current = setInterval(sendHeartbeat, 60_000);

    // End session on tab close
    const handleUnload = () => {
      navigator.sendBeacon(`${BASE}/api/activity/session/end`,
        JSON.stringify({ sessionToken: sessionToken.current }));
    };
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      window.removeEventListener("beforeunload", handleUnload);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Log page views on route change
  useEffect(() => {
    if (!isAuthenticated) return;
    if (location === lastPageRef.current) return;
    lastPageRef.current = location;
    logActivity("page_view", location, getPageLabel(location));
  }, [location, isAuthenticated, logActivity]);
}

// Exported helper to log specific actions from any component
export async function logAction(action: string, page?: string, detail?: string) {
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
  try {
    await fetch(`${BASE}/api/activity/log`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, page, detail }),
    });
  } catch { /* silent */ }
}
