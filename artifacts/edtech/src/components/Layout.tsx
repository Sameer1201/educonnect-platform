import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useLogout } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useDeadlineAlerts } from "@/hooks/useDeadlineAlerts";
import { useQuestionBankTargetAlerts } from "@/hooks/useQuestionBankTargetAlerts";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import StudentOnboardingGate from "@/components/student/StudentOnboardingGate";
import { APP_NAME } from "@/lib/brand";
import { BrandLogo } from "@/components/ui/brand-logo";
import {
  LayoutDashboard, Users, BookOpen, GraduationCap,
  LogOut, Menu, X, UserCheck, TrendingUp, LifeBuoy, Star,
  MessageSquare, DollarSign, ClipboardList, CalendarDays, Activity,
  FileText, BarChart2, ChevronLeft, ChevronRight, Zap,
  Bell, Medal, CreditCard,
} from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";

const NotificationBell = lazy(() => import("@/components/NotificationBell"));
const LeaderboardPanel = lazy(() => import("@/components/LeaderboardPanel"));
const CommandPalette = lazy(() => import("@/components/CommandPalette"));
const DeadlineAlertPopup = lazy(() => import("@/components/DeadlineAlertPopup"));
const QuestionBankTargetPopup = lazy(() => import("@/components/QuestionBankTargetPopup"));

interface NavItem { label: string; href: string; icon: React.ReactNode; }
interface NavGroup { label?: string; items: NavItem[]; }

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function getRoleConfig(role: string) {
  if (role === "super_admin") return { label: "Super Admin", iconBg: "bg-[#F97316]" };
  if (role === "admin") return { label: "Teacher", iconBg: "bg-[#5B4DFF]" };
  if (role === "planner") return { label: "Planner", iconBg: "bg-[#22C55E]" };
  return { label: "Student", iconBg: "bg-[#3B82F6]" };
}

function getNavIconTone(label: string) {
  const key = label.toLowerCase();
  if (key.includes("dashboard")) return "bg-[#EEF2FF] text-[#5B4DFF]";
  if (key.includes("student") || key.includes("user")) return "bg-[#ECFDF5] text-[#22C55E]";
  if (key.includes("question") || key.includes("test")) return "bg-[#EFF6FF] text-[#3B82F6]";
  if (key.includes("analytics") || key.includes("finance") || key.includes("payments")) return "bg-[#FFF7ED] text-[#F97316]";
  if (key.includes("leaderboard") || key.includes("community") || key.includes("notification")) return "bg-[#F5F3FF] text-[#5B4DFF]";
  return "bg-[#F3F4F6] text-[#6B7280]";
}

function getSuperAdminGroups(): NavGroup[] {
  return [
    { items: [{ label: "Dashboard", href: "/super-admin/dashboard", icon: <LayoutDashboard size={17} /> }] },
    { label: "Management", items: [
      { label: "Manage Admins", href: "/super-admin/admins", icon: <UserCheck size={17} /> },
      { label: "Students", href: "/super-admin/students", icon: <Users size={17} /> },
      { label: "All Classes", href: "/super-admin/classes", icon: <BookOpen size={17} /> },
    ]},
    { label: "Analytics", items: [
      { label: "HR Dashboard", href: "/super-admin/hr", icon: <TrendingUp size={17} /> },
      { label: "Teacher Performance", href: "/super-admin/teacher-performance", icon: <Medal size={17} /> },
      { label: "Finance", href: "/super-admin/finance", icon: <DollarSign size={17} /> },
      { label: "Fee Payments", href: "/super-admin/payments", icon: <CreditCard size={17} /> },
      { label: "Tests Overview", href: "/super-admin/tests", icon: <ClipboardList size={17} /> },
      { label: "User Activity", href: "/super-admin/activity", icon: <Activity size={17} /> },
    ]},
    { label: "Communication", items: [
      { label: "Send Notification", href: "/super-admin/send-notification", icon: <Bell size={17} /> },
      { label: "Community", href: "/community", icon: <MessageSquare size={17} /> },
      { label: "Schedule", href: "/schedule", icon: <CalendarDays size={17} /> },
    ]},
  ];
}

function getAdminGroups(): NavGroup[] {
  return [
    { items: [{ label: "Dashboard", href: "/admin/dashboard", icon: <LayoutDashboard size={17} /> }] },
    { label: "Teaching", items: [
      { label: "My Classes", href: "/admin/classes", icon: <BookOpen size={17} /> },
      { label: "Students", href: "/admin/students", icon: <Users size={17} /> },
      { label: "Question Bank", href: "/admin/question-bank", icon: <BookOpen size={17} /> },
      { label: "Tests", href: "/admin/tests", icon: <ClipboardList size={17} /> },
      { label: "Assignments", href: "/admin/assignments", icon: <FileText size={17} /> },
    ]},
    { label: "Analytics", items: [
      { label: "Analytics", href: "/admin/analytics", icon: <TrendingUp size={17} /> },
    ]},
    { label: "Community", items: [
      { label: "Community", href: "/community", icon: <MessageSquare size={17} /> },
      { label: "Schedule", href: "/schedule", icon: <CalendarDays size={17} /> },
    ]},
  ];
}

function getStudentGroups(): NavGroup[] {
  return [
    { items: [{ label: "Dashboard", href: "/student/dashboard", icon: <LayoutDashboard size={17} /> }] },
    { label: "Learning", items: [
      { label: "Browse Classes", href: "/student/classes", icon: <GraduationCap size={17} /> },
      { label: "Question Bank", href: "/student/question-bank", icon: <BookOpen size={17} /> },
      { label: "Tests", href: "/student/tests", icon: <ClipboardList size={17} /> },
      { label: "Assignments", href: "/student/assignments", icon: <FileText size={17} /> },
      { label: "My Progress", href: "/student/progress", icon: <BarChart2 size={17} /> },
    ]},
    { label: "Community", items: [
      { label: "Community", href: "/community", icon: <MessageSquare size={17} /> },
      { label: "Schedule", href: "/schedule", icon: <CalendarDays size={17} /> },
    ]},
    { label: "Help", items: [
      { label: "My Payments", href: "/student/payments", icon: <CreditCard size={17} /> },
      { label: "Feedback", href: "/student/feedback", icon: <Star size={17} /> },
    ]},
  ];
}

function getPlannerGroups(): NavGroup[] {
  return [
    { items: [{ label: "Dashboard", href: "/planner/dashboard", icon: <LayoutDashboard size={17} /> }] },
    { label: "Planning", items: [
      { label: "Exam Templates", href: "/planner/exam-templates", icon: <ClipboardList size={17} /> },
      { label: "Question Bank", href: "/planner/question-bank", icon: <BookOpen size={17} /> },
      { label: "Courses", href: "/planner/courses", icon: <BookOpen size={17} /> },
      { label: "Lecture Plans", href: "/schedule", icon: <CalendarDays size={17} /> },
    ]},
    { label: "Community", items: [
      { label: "Community", href: "/community", icon: <MessageSquare size={17} /> },
    ]},
  ];
}

function NavLink({ item, isActive, collapsed, onClick }: { item: NavItem; isActive: boolean; collapsed: boolean; onClick: () => void }) {
  const iconTone = getNavIconTone(item.label);
  return (
    <Link
      href={item.href}
      data-testid={`nav-${item.label.toLowerCase().replace(/\s/g, "-")}`}
      onClick={onClick}
      className={`relative flex items-center gap-3 rounded-[16px] text-sm transition-all duration-200 group border border-transparent ${
        collapsed ? "px-2.5 py-2.5 justify-center" : "px-3 py-2.5"
      } ${
        isActive
          ? "bg-[#5B4DFF] text-white font-semibold shadow-[0_8px_18px_rgba(91,77,255,0.22)]"
          : "text-[#1F2937] hover:bg-[#F3F5F9] hover:text-[#111827]"
      }`}
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-all ${isActive ? "border-white/10 bg-white text-[#5B4DFF]" : `${iconTone} border-transparent group-hover:scale-105`}`}>
        {item.icon}
      </span>
      {!collapsed && <span className="truncate">{item.label}</span>}
      {collapsed && (
        <div className="absolute left-full ml-3 whitespace-nowrap rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs text-[#111827] opacity-0 shadow-xl transition-all duration-150 pointer-events-none z-50 group-hover:opacity-100">
          {item.label}
          <div className="absolute top-1/2 -left-1 h-2 w-2 -translate-y-1/2 rotate-45 border-b border-l border-[#E5E7EB] bg-white" />
        </div>
      )}
    </Link>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [shellWidgetsReady, setShellWidgetsReady] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebar-collapsed") === "true"; } catch { return false; }
  });
  const queryClient = useQueryClient();
  const logoutMutation = useLogout();
  const { data: platformSettings } = usePlatformSettings(!!user);

  useEffect(() => {
    try { localStorage.setItem("sidebar-collapsed", String(collapsed)); } catch {}
  }, [collapsed]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark");
    try { localStorage.setItem("theme", "light"); } catch {}
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShellWidgetsReady(true);
        setCmdOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadWidgets = () => {
      if (!cancelled) setShellWidgetsReady(true);
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const idleId = (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback(loadWidgets, { timeout: 1500 });
      return () => {
        cancelled = true;
        if ("cancelIdleCallback" in window) {
          (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId);
        }
      };
    }

    const timeoutId = window.setTimeout(loadWidgets, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  const supportHref = user?.role === "super_admin" ? "/super-admin/support"
    : user?.role === "admin" ? "/admin/support"
    : user?.role === "student" ? "/student/support"
    : null;
  const showLeaderboardShortcut = user.role !== "planner";
  const supportBase = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: supportTickets = [] } = useQuery<any[]>({
    queryKey: ["support-shortcut-status", user?.id, user?.role],
    enabled: Boolean(user && supportHref),
    queryFn: async () => {
      const response = await fetch(`${supportBase}/api/support`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load support status");
      return response.json();
    },
    staleTime: 30_000,
  });

  const supportStage =
    supportTickets.some((ticket) => ticket.status === "open") ? "open" :
    supportTickets.some((ticket) => ticket.status === "in_progress") ? "in_progress" :
    supportTickets.some((ticket) => ticket.status === "resolved") ? "resolved" :
    "idle";

  const supportTone =
    supportStage === "open"
      ? "border-[#FDBA74] bg-[#FFF7ED] text-[#EA580C] hover:bg-[#FFEDD5] hover:text-[#C2410C]"
      : supportStage === "in_progress"
        ? "border-[#BFDBFE] bg-[#EFF6FF] text-[#2563EB] hover:bg-[#DBEAFE] hover:text-[#1D4ED8]"
        : supportStage === "resolved"
          ? "border-[#BBF7D0] bg-[#F0FDF4] text-[#16A34A] hover:bg-[#DCFCE7] hover:text-[#15803D]"
          : "border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#F8FAFC] hover:text-[#111827]";

  const { alerts: deadlineAlerts, show: showDeadlinePopup, dismiss: dismissDeadlines } = useDeadlineAlerts(!!user);
  const {
    alerts: questionBankAlerts,
    show: showQuestionBankPopup,
    dismiss: dismissQuestionBankAlerts,
  } = useQuestionBankTargetAlerts(user?.role === "admin", user?.id);

  if (!user) return <>{children}</>;

  const baseNavGroups =
    user.role === "super_admin" ? getSuperAdminGroups() :
    user.role === "admin" ? getAdminGroups() :
    user.role === "planner" ? getPlannerGroups() : getStudentGroups();

  const learningAccessEnabled = platformSettings?.learningAccessEnabled ?? true;
  const navGroups = (user.role === "admin" || user.role === "student" || user.role === "planner") && !learningAccessEnabled
    ? baseNavGroups.map((group) => ({
        ...group,
        items: group.items.filter((item) => ![
          "/admin/classes",
          "/admin/assignments",
          "/planner/courses",
          "/schedule",
          "/student/feedback",
          "/student/payments",
          "/student/classes",
          "/student/assignments",
        ].includes(item.href)),
      })).filter((group) => group.items.length > 0)
    : baseNavGroups;

  const roleConfig = getRoleConfig(user.role);
  const initials = getInitials(user.fullName ?? user.username ?? "?");
  const profileHref =
    user.role === "admin" ? "/admin/profile" :
    user.role === "student" ? "/student/profile" :
    null;

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => { logout(); queryClient.clear(); setLocation("/"); },
    });
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`border-b border-[#E5E7EB] px-4 py-4 ${collapsed ? "items-center" : ""}`}>
        <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between"} gap-2`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <BrandLogo variant={collapsed ? "icon" : "wordmark"} imageClassName={collapsed ? "h-8" : "h-10"} />
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-[10px] text-[#6B7280]">{roleConfig.label} Portal</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 space-y-0.5">
        {navGroups.map((group, gi) => (
          <div key={gi} className={gi > 0 ? "mt-3" : ""}>
            {!collapsed && group.label && (
              <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#9CA3AF]">
                {group.label}
              </p>
            )}
            {collapsed && gi > 0 && group.label && (
              <div className="my-2 mx-auto h-px w-5 bg-[#E5E7EB]" />
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = location === item.href || location.startsWith(item.href + "/");
                return (
                  <NavLink key={item.href} item={item} isActive={isActive} collapsed={collapsed} onClick={() => setMobileOpen(false)} />
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom: user + collapse */}
      <div className={`border-t border-[#E5E7EB] p-3 ${collapsed ? "space-y-3" : "space-y-1"}`}>
        {/* User row */}
        {!collapsed ? (
          <div className="flex items-center gap-2.5 px-1 py-1.5">
            <button
              type="button"
              onClick={() => profileHref && setLocation(profileHref)}
              className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-left transition-colors ${profileHref ? "hover:bg-[#F3F5F9]" : ""}`}
              title={profileHref ? "Open profile" : undefined}
            >
              {(user as any).avatarUrl ? (
                <img
                  src={(user as any).avatarUrl}
                  alt={user.fullName}
                  loading="lazy"
                  decoding="async"
                  className={`w-8 h-8 rounded-full object-cover shrink-0 border-2 border-[#E5E7EB]`}
                />
              ) : (
                <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white ${roleConfig.iconBg}`}>
                  {initials}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-tight text-[#111827]">{user.fullName}</p>
                <p className="truncate text-[11px] text-[#6B7280]">@{user.username}</p>
              </div>
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation();
                handleLogout();
              }}
              className="shrink-0 rounded p-1 text-[#6B7280] transition-colors hover:text-[#111827]"
              title="Logout"
            >
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-1">
            <button
              type="button"
              onClick={() => profileHref && setLocation(profileHref)}
              className={`flex h-14 w-14 items-center justify-center rounded-full transition-colors ${profileHref ? "hover:bg-[#F3F5F9]" : ""}`}
              title={profileHref ? "Open profile" : undefined}
            >
              {(user as any).avatarUrl ? (
                <img
                  src={(user as any).avatarUrl}
                  alt={user.fullName}
                  loading="lazy"
                  decoding="async"
                  className="h-12 w-12 rounded-full border-2 border-[#E5E7EB] object-cover"
                />
              ) : (
                <div className={`flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white ${roleConfig.iconBg}`}>
                  {initials}
                </div>
              )}
            </button>
            <button
              onClick={handleLogout}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-[#6B7280] transition-colors hover:bg-[#F3F5F9] hover:text-[#111827]"
              title="Logout"
            >
              <LogOut size={15} />
            </button>
          </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className={`rounded-lg py-1.5 text-[11px] text-[#9CA3AF] transition-colors hover:text-[#6B7280] ${collapsed ? "mx-auto flex h-8 w-8 items-center justify-center" : "flex w-full items-center justify-center gap-2"}`}
        >
          {collapsed ? <ChevronRight size={13} /> : <><ChevronLeft size={13} /><span>Collapse sidebar</span></>}
        </button>
      </div>
    </div>
  );

  const SupportShortcut = ({ mobile = false }: { mobile?: boolean }) => (
    <button
      type="button"
      onClick={() => supportHref && setLocation(supportHref)}
      className={
        mobile
          ? `inline-flex h-9 w-9 items-center justify-center rounded-xl border transition ${supportTone}`
          : `inline-flex h-9 w-9 items-center justify-center rounded-xl border transition ${supportTone}`
      }
      title="Support"
      aria-label="Support"
      data-testid="button-support-shortcut"
    >
      <LifeBuoy size={16} />
    </button>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[#F5F7FB]">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Desktop sidebar */}
      <aside className={`relative z-10 hidden shrink-0 flex-col border-r border-[#E5E7EB] bg-white transition-all duration-200 lg:flex ${collapsed ? "w-[68px] overflow-visible" : "w-60 overflow-hidden"}`}>
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-[#E5E7EB] bg-white transition-transform duration-200 lg:hidden ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <SidebarContent />
      </aside>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        <header className="flex items-center gap-3 border-b border-[#E5E7EB] bg-white px-3 py-3 lg:hidden">
          <button onClick={() => setMobileOpen(!mobileOpen)} className="p-1 text-[#6B7280] hover:text-[#111827]" data-testid="button-menu">
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex min-w-0 flex-1 items-center">
            <BrandLogo className="min-w-0" imageClassName="h-8" />
          </div>
          {showLeaderboardShortcut && (
            <Suspense fallback={<div className="h-9 w-9 rounded-lg bg-[#F3F4F6]" />}>
              {shellWidgetsReady ? <LeaderboardPanel showLabel={false} /> : <div className="h-9 w-9 rounded-lg bg-[#F3F4F6]" />}
            </Suspense>
          )}
          {supportHref ? <SupportShortcut mobile /> : null}
          <Suspense fallback={<div className="h-9 w-9 rounded-lg bg-[#F3F4F6]" />}>
            {shellWidgetsReady ? <NotificationBell /> : <div className="h-9 w-9 rounded-lg bg-[#F3F4F6]" />}
          </Suspense>
        </header>

        {/* Desktop topbar */}
        <header className="hidden shrink-0 items-center justify-end gap-2 border-b border-[#E5E7EB] bg-white px-6 py-2.5 lg:flex">
          {showLeaderboardShortcut && (
            <Suspense fallback={<div className="h-9 w-9 rounded-lg bg-[#F3F4F6]" />}>
              {shellWidgetsReady ? <LeaderboardPanel showLabel={false} /> : <div className="h-9 w-9 rounded-lg bg-[#F3F4F6]" />}
            </Suspense>
          )}
          {supportHref ? <SupportShortcut /> : null}
          <Suspense fallback={<div className="h-9 w-9 rounded-lg bg-[#F3F4F6]" />}>
            {shellWidgetsReady ? <NotificationBell /> : <div className="h-9 w-9 rounded-lg bg-[#F3F4F6]" />}
          </Suspense>
        </header>

        <main className="flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4 lg:p-6">
          {children}
        </main>
      </div>

      {/* Command Palette */}
      <Suspense fallback={null}>
        {shellWidgetsReady ? <CommandPalette isOpen={cmdOpen} onClose={() => setCmdOpen(false)} role={user.role} /> : null}
      </Suspense>

      {/* Deadline Alert Popup */}
      <Suspense fallback={null}>
        {shellWidgetsReady ? (
          <DeadlineAlertPopup
            open={showDeadlinePopup}
            alerts={deadlineAlerts}
            onDismiss={dismissDeadlines}
            supportHref={supportHref}
          />
        ) : null}
      </Suspense>

      <Suspense fallback={null}>
        {shellWidgetsReady ? (
          <QuestionBankTargetPopup
            open={!showDeadlinePopup && showQuestionBankPopup}
            alerts={questionBankAlerts}
            onDismiss={dismissQuestionBankAlerts}
            href="/admin/question-bank"
          />
        ) : null}
      </Suspense>

      <StudentOnboardingGate />
    </div>
  );
}
