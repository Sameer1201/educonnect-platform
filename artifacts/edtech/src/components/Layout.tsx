import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useLogout } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import NotificationBell from "@/components/NotificationBell";
import CommandPalette from "@/components/CommandPalette";
import DeadlineAlertPopup from "@/components/DeadlineAlertPopup";
import { useDeadlineAlerts } from "@/hooks/useDeadlineAlerts";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import {
  LayoutDashboard, Users, BookOpen, GraduationCap,
  LogOut, Menu, X, UserCheck, TrendingUp, LifeBuoy, Star,
  MessageSquare, DollarSign, ClipboardList, CalendarDays, Activity,
  FileText, Trophy, BarChart2, ChevronLeft, ChevronRight, Zap,
  Search, Sun, Moon, Bell, Medal, UserCircle, CreditCard,
} from "lucide-react";
import { useState, useEffect } from "react";

interface NavItem { label: string; href: string; icon: React.ReactNode; }
interface NavGroup { label?: string; items: NavItem[]; }

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function getRoleConfig(role: string) {
  if (role === "super_admin") return { label: "Super Admin", iconBg: "bg-gradient-to-br from-red-600 to-orange-500" };
  if (role === "admin") return { label: "Teacher", iconBg: "bg-gradient-to-br from-blue-600 to-cyan-500" };
  if (role === "planner") return { label: "Planner", iconBg: "bg-gradient-to-br from-emerald-600 to-teal-500" };
  return { label: "Student", iconBg: "bg-gradient-to-br from-violet-600 to-purple-500" };
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
      { label: "Leaderboard", href: "/leaderboard", icon: <Trophy size={17} /> },
      { label: "Community", href: "/community", icon: <MessageSquare size={17} /> },
      { label: "Schedule", href: "/schedule", icon: <CalendarDays size={17} /> },
      { label: "Support Tickets", href: "/super-admin/support", icon: <LifeBuoy size={17} /> },
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
      { label: "Leaderboard", href: "/leaderboard", icon: <Trophy size={17} /> },
      { label: "Community", href: "/community", icon: <MessageSquare size={17} /> },
      { label: "Schedule", href: "/schedule", icon: <CalendarDays size={17} /> },
      { label: "Support Tickets", href: "/admin/support", icon: <LifeBuoy size={17} /> },
    ]},
    { label: "Account", items: [
      { label: "My Profile", href: "/admin/profile", icon: <UserCircle size={17} /> },
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
      { label: "Leaderboard", href: "/leaderboard", icon: <Trophy size={17} /> },
      { label: "Community", href: "/community", icon: <MessageSquare size={17} /> },
      { label: "Schedule", href: "/schedule", icon: <CalendarDays size={17} /> },
    ]},
    { label: "Help", items: [
      { label: "My Payments", href: "/student/payments", icon: <CreditCard size={17} /> },
      { label: "Feedback", href: "/student/feedback", icon: <Star size={17} /> },
      { label: "Support", href: "/student/support", icon: <LifeBuoy size={17} /> },
      { label: "My Profile", href: "/student/profile", icon: <UserCircle size={17} /> },
    ]},
  ];
}

function getPlannerGroups(): NavGroup[] {
  return [
    { items: [{ label: "Dashboard", href: "/planner/dashboard", icon: <LayoutDashboard size={17} /> }] },
    { label: "Planning", items: [
      { label: "Courses", href: "/planner/courses", icon: <BookOpen size={17} /> },
      { label: "Lecture Plans", href: "/schedule", icon: <CalendarDays size={17} /> },
    ]},
    { label: "Community", items: [
      { label: "Community", href: "/community", icon: <MessageSquare size={17} /> },
      { label: "Leaderboard", href: "/leaderboard", icon: <Trophy size={17} /> },
    ]},
  ];
}

function NavLink({ item, isActive, collapsed, onClick }: { item: NavItem; isActive: boolean; collapsed: boolean; onClick: () => void }) {
  return (
    <Link
      href={item.href}
      data-testid={`nav-${item.label.toLowerCase().replace(/\s/g, "-")}`}
      onClick={onClick}
      className={`relative flex items-center gap-3 rounded-xl text-sm transition-all duration-300 group border border-transparent ${
        collapsed ? "px-2.5 py-2.5 justify-center" : "px-3 py-2"
      } ${
        isActive
          ? "bg-[linear-gradient(135deg,rgba(0,212,255,0.18),rgba(110,86,255,0.12)_52%,rgba(255,84,214,0.16))] border-cyan-300/20 text-white font-medium shadow-[0_16px_30px_rgba(0,0,0,0.2),0_0_22px_rgba(34,211,238,0.12)] backdrop-blur-md -translate-y-0.5"
          : "text-white/58 hover:bg-[linear-gradient(135deg,rgba(0,212,255,0.1),rgba(255,255,255,0.04)_48%,rgba(255,84,214,0.1))] hover:border-white/10 hover:text-white/90 hover:-translate-y-0.5 hover:shadow-[0_14px_26px_rgba(0,0,0,0.18),0_0_18px_rgba(255,84,214,0.08)]"
      }`}
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-gradient-to-b from-cyan-300 via-fuchsia-300 to-amber-300" />
      )}
      <span className={`icon-3d h-8 w-8 shrink-0 transition-colors ${isActive ? "text-white" : "text-white/70 group-hover:text-white/90"}`}>
        {item.icon}
      </span>
      {!collapsed && <span className="truncate">{item.label}</span>}
      {collapsed && (
        <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-gray-900/95 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 z-50 shadow-xl border border-white/10">
          {item.label}
          <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-gray-900/95 rotate-45 border-l border-b border-white/10" />
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
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebar-collapsed") === "true"; } catch { return false; }
  });
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem("theme");
      if (saved === "dark") return true;
      if (saved === "light") return false;
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch {
      return true;
    }
  });
  const queryClient = useQueryClient();
  const logoutMutation = useLogout();
  const { data: platformSettings } = usePlatformSettings(!!user);

  useEffect(() => {
    try { localStorage.setItem("sidebar-collapsed", String(collapsed)); } catch {}
  }, [collapsed]);

  useEffect(() => {
    const root = document.documentElement;
    if (dark) root.classList.add("dark");
    else root.classList.remove("dark");
    try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch {}
  }, [dark]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const supportHref = user?.role === "super_admin" ? "/super-admin/support"
    : user?.role === "admin" ? "/admin/support"
    : user?.role === "planner" ? "/planner/dashboard"
    : "/student/support";

  const { alerts: deadlineAlerts, show: showDeadlinePopup, dismiss: dismissDeadlines } = useDeadlineAlerts(!!user);

  if (!user) return <>{children}</>;

  const baseNavGroups =
    user.role === "super_admin" ? getSuperAdminGroups() :
    user.role === "admin" ? getAdminGroups() :
    user.role === "planner" ? getPlannerGroups() : getStudentGroups();

  const learningAccessEnabled = platformSettings?.learningAccessEnabled ?? true;
  const navGroups = (user.role === "admin" || user.role === "student") && !learningAccessEnabled
    ? baseNavGroups.map((group) => ({
        ...group,
        items: group.items.filter((item) => ![
          "/admin/classes",
          "/admin/assignments",
          "/student/feedback",
          "/student/payments",
          "/student/classes",
          "/student/assignments",
        ].includes(item.href)),
      })).filter((group) => group.items.length > 0)
    : baseNavGroups;

  const roleConfig = getRoleConfig(user.role);
  const initials = getInitials(user.fullName ?? user.username ?? "?");

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => { logout(); queryClient.clear(); setLocation("/"); },
    });
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`px-3 py-3 border-b border-white/8 ${collapsed ? "items-center" : ""}`}>
        <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between"} gap-2`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8 h-8 rounded-xl shrink-0 flex items-center justify-center shadow-md ${roleConfig.iconBg}`}>
              <GraduationCap size={15} className="text-white" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-sm font-bold text-white leading-tight">EduConnect</p>
                <p className="text-[10px] text-white/40">{roleConfig.label} Portal</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2 space-y-0.5">
        {navGroups.map((group, gi) => (
          <div key={gi} className={gi > 0 ? "mt-3" : ""}>
            {!collapsed && group.label && (
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/22 px-3 mb-1">
                {group.label}
              </p>
            )}
            {collapsed && gi > 0 && group.label && (
              <div className="my-2 mx-auto w-5 h-px bg-white/10" />
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

      {/* Bottom: dark mode + user + collapse */}
      <div className="border-t border-white/8 p-2 space-y-1">
        {/* Dark mode toggle */}
        <button
          onClick={() => setDark((d) => !d)}
          className={`w-full flex items-center gap-3 rounded-lg text-xs text-white/45 hover:text-white/80 hover:bg-white/7 transition-all px-3 py-2 ${collapsed ? "justify-center px-2.5" : ""}`}
          title={dark ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {dark ? <Sun size={15} className="shrink-0" /> : <Moon size={15} className="shrink-0" />}
          {!collapsed && <span>{dark ? "Light Mode" : "Dark Mode"}</span>}
        </button>

        {/* User row */}
        {!collapsed ? (
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            {(user as any).avatarUrl ? (
              <img
                src={(user as any).avatarUrl}
                alt={user.fullName}
                className={`w-8 h-8 rounded-full object-cover shrink-0 border-2 border-white/20`}
              />
            ) : (
              <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white ${roleConfig.iconBg}`}>
                {initials}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate leading-tight">{user.fullName}</p>
              <p className="text-[11px] text-white/38 truncate">@{user.username}</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-white/30 hover:text-white/70 transition-colors p-1 rounded shrink-0"
              title="Logout"
            >
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={handleLogout}
            className="w-full flex justify-center py-2 text-white/30 hover:text-white/70 hover:bg-white/7 transition-colors rounded-lg"
            title="Logout"
          >
            <LogOut size={15} />
          </button>
        )}

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className={`w-full flex items-center justify-center gap-2 text-[11px] text-white/22 hover:text-white/50 transition-colors py-1.5 rounded-lg hover:bg-white/6`}
        >
          {collapsed ? <ChevronRight size={13} /> : <><ChevronLeft size={13} /><span>Collapse sidebar</span></>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="platform-shell flex h-screen bg-background overflow-hidden">
      <div className="platform-orb platform-orb-cyan" />
      <div className="platform-orb platform-orb-fuchsia" />
      <div className="platform-orb platform-orb-blue" />
      <div className="floating-bubble floating-bubble-sm left-[9%] top-[16%]" />
      <div className="floating-bubble floating-bubble-md right-[10%] top-[22%]" />
      <div className="floating-bubble floating-bubble-lg left-[22%] bottom-[12%]" />
      <div className="floating-bubble floating-bubble-sm right-[24%] bottom-[20%]" />
      <div className="platform-grid" />
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Desktop sidebar */}
      <aside className={`relative z-10 hidden lg:flex flex-col shrink-0 ${collapsed ? "w-[68px]" : "w-60"} bg-sidebar/92 backdrop-blur-xl border-r border-white/8 transition-all duration-200 ${collapsed ? "overflow-visible" : "overflow-hidden"}`}>
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      <aside className={`fixed lg:hidden inset-y-0 left-0 z-30 w-60 bg-sidebar/95 backdrop-blur-xl border-r border-white/8 flex flex-col transition-transform duration-200 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <SidebarContent />
      </aside>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        <header className="lg:hidden flex items-center gap-3 px-3 py-3 bg-sidebar/95 border-b border-white/8 backdrop-blur-xl">
          <button onClick={() => setMobileOpen(!mobileOpen)} className="text-white/70 hover:text-white p-1" data-testid="button-menu">
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${roleConfig.iconBg}`}>
              <GraduationCap size={12} className="text-white" />
            </div>
            <span className="font-semibold text-sm text-white truncate">EduConnect</span>
          </div>
          <button onClick={() => setCmdOpen(true)} className="text-white/60 hover:text-white p-1">
            <Search size={18} />
          </button>
          <NotificationBell />
        </header>

        {/* Desktop topbar */}
        <header className="hidden lg:flex items-center justify-end gap-2 px-6 py-2.5 border-b border-white/8 bg-background/55 backdrop-blur-xl shrink-0">
          <button onClick={() => setCmdOpen(true)} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground border border-white/10 rounded-xl px-3 py-1.5 hover:bg-white/6 transition-colors mr-2 backdrop-blur-md shadow-[0_10px_30px_rgba(15,23,42,0.12)]">
            <Search size={13} />
            <span>Search</span>
            <kbd className="text-[10px] bg-white/6 px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
          </button>
          <NotificationBell />
        </header>

        <main className="flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4 lg:p-6">
          {children}
        </main>
      </div>

      {/* Command Palette */}
      <CommandPalette isOpen={cmdOpen} onClose={() => setCmdOpen(false)} role={user.role} />

      {/* Deadline Alert Popup */}
      <DeadlineAlertPopup
        open={showDeadlinePopup}
        alerts={deadlineAlerts}
        onDismiss={dismissDeadlines}
        supportHref={supportHref}
      />
    </div>
  );
}
