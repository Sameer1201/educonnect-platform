import { lazy, useEffect, useRef, type ReactNode } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PremiumWhiteLoader } from "@/components/ui/PremiumWhiteLoader";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { isStudentFeatureLocked, isStudentPendingVerification, isStudentRejectedVerification } from "@/lib/student-access";

const importLayout = () => import("@/components/Layout");
const importSuperAdminDashboard = () => import("@/pages/super-admin/Dashboard");
const importSuperAdminManagement = () => import("@/pages/super-admin/Management");
const importSendNotification = () => import("@/pages/super-admin/SendNotification");
const importPlannerExamTemplates = () => import("@/pages/planner/ExamTemplates");
const importPlannerQuestionBank = () => import("@/pages/planner/QuestionBank");
const importAdminStudents = () => import("@/pages/admin/Students");
const importAdminQuestionBank = () => import("@/pages/admin/QuestionBank");
const importAdminTests = () => import("@/pages/admin/Tests");
const importStudentDashboard = () => import("@/pages/student/Dashboard");
const importStudentTests = () => import("@/pages/student/Tests");
const importStudentQuestionBankDashboard = () => import("@/pages/student/question-bank/Dashboard");
const importStudentProfile = () => import("@/pages/student/Profile");

const Layout = lazy(importLayout);
const NotFound = lazy(() => import("@/pages/not-found"));
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const RegisterPage = lazy(() => import("@/pages/RegisterPage"));
const ResetPasswordPage = lazy(() => import("@/pages/ResetPasswordPage"));
const SuperAdminDashboard = lazy(importSuperAdminDashboard);
const SuperAdminManagement = lazy(importSuperAdminManagement);
const SendNotification = lazy(importSendNotification);
const TeacherPerformance = lazy(() => import("@/pages/super-admin/TeacherPerformance"));
const SuperAdminTests = lazy(() => import("@/pages/super-admin/Tests"));
const SuperAdminActivity = lazy(() => import("@/pages/super-admin/Activity"));
const AdminStudents = lazy(importAdminStudents);
const AdminProfile = lazy(() => import("@/pages/admin/Profile"));
const AdminAnalytics = lazy(() => import("@/pages/admin/Analytics"));
const AdminQuestionBank = lazy(importAdminQuestionBank);
const AdminTests = lazy(importAdminTests);
const AdminTestBuilder = lazy(() => import("@/pages/admin/TestBuilder"));
const TestAnalytics = lazy(() => import("@/pages/admin/TestAnalytics"));
const PlannerExamTemplates = lazy(importPlannerExamTemplates);
const PlannerQuestionBank = lazy(importPlannerQuestionBank);
const PlannerQuestionBankDetail = lazy(() => import("@/pages/planner/QuestionBankDetail"));
const StudentDashboard = lazy(importStudentDashboard);
const StudentTestAnalysis = lazy(() => import("@/pages/student/TestAnalysis"));
const StudentTestSolutions = lazy(() => import("@/pages/student/TestSolutions"));
const StudentQuestionBankDashboard = lazy(importStudentQuestionBankDashboard);
const StudentQuestionBankExamPage = lazy(() => import("@/pages/student/question-bank/ExamPage"));
const StudentQuestionBankSubjectPage = lazy(() => import("@/pages/student/question-bank/SubjectPage"));
const StudentQuestionBankChapterPage = lazy(() => import("@/pages/student/question-bank/ChapterPage"));
const StudentQuestionBankQuestionPage = lazy(() => import("@/pages/student/question-bank/QuestionPage"));
const StudentReviewBucket = lazy(() => import("@/pages/student/ReviewBucket"));
const StudentProfile = lazy(importStudentProfile);
const StudentPendingApproval = lazy(() => import("@/pages/student/PendingApproval"));
const StudentTests = lazy(importStudentTests);
const Leaderboard = lazy(() => import("@/pages/Leaderboard"));
const ActivityFeed = lazy(() => import("@/pages/ActivityFeed"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
    },
  },
});

export type ViewMode = "personal" | "comparative";

function getCurrentIndexScriptPath() {
  if (typeof document === "undefined") return null;
  const script = document.querySelector('script[type="module"][src*="/assets/index-"]');
  const src = script?.getAttribute("src");
  if (!src) return null;

  try {
    return new URL(src, window.location.origin).pathname;
  } catch {
    return src;
  }
}

function extractIndexScriptPath(html: string) {
  const match = html.match(/src="([^"]*\/assets\/index-[^"]+\.js)"/i);
  if (!match?.[1]) return null;

  try {
    return new URL(match[1], window.location.origin).pathname;
  } catch {
    return match[1];
  }
}

function useDeployRefresh() {
  const currentScriptPathRef = useRef<string | null>(null);
  const reloadTriggeredRef = useRef(false);

  if (import.meta.env.DEV) {
    return;
  }

  useEffect(() => {
    currentScriptPathRef.current = getCurrentIndexScriptPath();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;

    const checkForNewDeploy = async () => {
      if (cancelled || reloadTriggeredRef.current) return;

      try {
        const response = await fetch(`${import.meta.env.BASE_URL || "/"}?deploy-check=${Date.now()}`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        const html = await response.text();
        const latestScriptPath = extractIndexScriptPath(html);
        const currentScriptPath = currentScriptPathRef.current ?? getCurrentIndexScriptPath();

        if (latestScriptPath && currentScriptPath && latestScriptPath !== currentScriptPath) {
          reloadTriggeredRef.current = true;
          window.location.reload();
        }
      } catch {
        // Ignore transient network errors; we'll retry on the next visibility change.
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkForNewDeploy();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void checkForNewDeploy();
      }
    }, 5 * 60_000);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, []);
}

function scheduleIdlePrefetch(work: () => void) {
  if (typeof window === "undefined") return () => {};

  if ("requestIdleCallback" in window) {
    const idleId = (window as Window & {
      requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number;
    }).requestIdleCallback(work, { timeout: 1800 });

    return () => {
      if ("cancelIdleCallback" in window) {
        (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId);
      }
    };
  }

  const timeoutId = globalThis.setTimeout(work, 900);
  return () => globalThis.clearTimeout(timeoutId);
}

function warmLikelyRouteChunks(role: string) {
  void importLayout();

  if (role === "super_admin") {
    void importSuperAdminDashboard();
    void importSuperAdminManagement();
    void importPlannerQuestionBank();
    void importPlannerExamTemplates();
    void importSendNotification();
    return;
  }

  if (role === "admin") {
    void importAdminQuestionBank();
    void importAdminStudents();
    void importAdminTests();
    return;
  }

  void importStudentDashboard();
  void importStudentTests();
  void importStudentQuestionBankDashboard();
  void importStudentProfile();
}

function AppLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fffaf2] px-4 py-8">
      <div className="w-full max-w-xl">
        <PremiumWhiteLoader progress={72} />
      </div>
    </div>
  );
}

function studentNeedsOnboarding(user: { role: string; onboardingComplete?: boolean }) {
  return user.role === "student" && !user.onboardingComplete;
}

function isPendingStudentPreviewAnalysisPath(location: string) {
  return /^\/student\/tests\/-\d+\/analysis$/.test(location);
}

function getLockedStudentRedirect(
  user: { role?: string | null; studentFeatureAccess?: { testsLocked?: boolean | null; questionBankLocked?: boolean | null } | null } | null | undefined,
  location: string,
) {
  if (user?.role !== "student") return null;

  if (isStudentFeatureLocked(user, "tests") && location.startsWith("/student/tests") && location !== "/student/tests") {
    return "/student/tests";
  }

  if (isStudentFeatureLocked(user, "question-bank") && location.startsWith("/student/question-bank") && location !== "/student/question-bank") {
    return "/student/question-bank";
  }

  return null;
}

function ProtectedRoute({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  if (isLoading) {
    return <AppLoader />;
  }

  if (!user) {
    setLocation("/");
    return null;
  }

  if (!roles.includes(user.role)) {
    setLocation("/");
    return null;
  }

  if (user.role === "student") {
    const lockedRedirect = getLockedStudentRedirect(user, location);
    if (lockedRedirect) {
      setLocation(lockedRedirect);
      return null;
    }

    if (studentNeedsOnboarding(user) && location !== "/student/profile") {
      setLocation("/student/profile");
      return null;
    }

    if (
      isStudentPendingVerification(user) &&
      ![
        "/student/dashboard",
        "/student/pending-approval",
        "/student/profile",
        "/student/tests",
        "/student/question-bank",
      ].includes(location)
      && !isPendingStudentPreviewAnalysisPath(location)
    ) {
      setLocation("/student/dashboard");
      return null;
    }

    if (isStudentRejectedVerification(user) && location !== "/student/pending-approval" && location !== "/student/profile") {
      setLocation("/student/pending-approval");
      return null;
    }

    if (!studentNeedsOnboarding(user) && user.status === "approved" && location === "/student/pending-approval") {
      setLocation("/student/dashboard");
      return null;
    }
  }

  return <>{children}</>;
}

function getRoleHomePath(role: string, user?: { onboardingComplete?: boolean; status?: string | null }) {
  if (role === "super_admin") return "/super-admin/dashboard";
  if (role === "admin") return "/admin/question-bank";
  if (!user?.onboardingComplete) return "/student/profile";
  if (user.status === "pending") return "/student/dashboard";
  if (user.status === "rejected") return "/student/pending-approval";
  return "/student/dashboard";
}

function RedirectTo({ href }: { href: string }) {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation(href);
  }, [href, setLocation]);

  return <AppLoader />;
}

function AppRouter() {
  const { user, isLoading } = useAuth();
  useActivityTracker(!!user);

  useEffect(() => {
    if (isLoading || !user) return;
    return scheduleIdlePrefetch(() => {
      warmLikelyRouteChunks(user.role);
    });
  }, [isLoading, user]);

  return (
    <Switch>
      <Route path="/">
        {isLoading ? (
          <AppLoader />
        ) : user ? (
          <RedirectTo href={getRoleHomePath(user.role, user)} />
        ) : (
          <LandingPage />
        )}
      </Route>
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />

      {/* Super Admin Routes */}
      <Route path="/super-admin/dashboard">
        <ProtectedRoute roles={["super_admin"]}>
          <Layout><SuperAdminDashboard /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/super-admin/management">
        <ProtectedRoute roles={["super_admin"]}>
          <Layout><SuperAdminManagement /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/super-admin/admins">
        <ProtectedRoute roles={["super_admin"]}>
          <Layout><SuperAdminManagement initialTab="admins" /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/super-admin/students">
        <ProtectedRoute roles={["super_admin"]}>
          <Layout><SuperAdminManagement initialTab="students" /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/super-admin/tests">
        <ProtectedRoute roles={["super_admin"]}>
          <Layout><SuperAdminTests /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/super-admin/activity">
        <ProtectedRoute roles={["super_admin"]}>
          <Layout><SuperAdminActivity /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/super-admin/send-notification">
        <ProtectedRoute roles={["super_admin"]}>
          <Layout><SendNotification /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/super-admin/teacher-performance">
        <ProtectedRoute roles={["super_admin"]}>
          <Layout><TeacherPerformance /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/super-admin/exam-templates">
        <ProtectedRoute roles={["super_admin"]}>
          <Layout><PlannerExamTemplates /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/super-admin/question-bank">
        <ProtectedRoute roles={["super_admin"]}>
          <Layout><PlannerQuestionBank /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/super-admin/question-bank/:id">
        <ProtectedRoute roles={["super_admin"]}>
          <Layout><PlannerQuestionBankDetail /></Layout>
        </ProtectedRoute>
      </Route>

      {/* Admin Routes */}
      <Route path="/admin/profile">
        <ProtectedRoute roles={["admin"]}>
          <Layout><AdminProfile /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/dashboard">
        <ProtectedRoute roles={["admin"]}>
          <RedirectTo href="/admin/question-bank" />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/students">
        <ProtectedRoute roles={["admin"]}>
          <Layout><AdminStudents /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/tests">
        <ProtectedRoute roles={["admin"]}>
          <Layout><AdminTests /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/tests/:id/builder">
        <ProtectedRoute roles={["admin"]}>
          <AdminTestBuilder />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/question-bank/exam/:examKey/subject/:subjectId/chapter/:chapterId">
        <ProtectedRoute roles={["admin"]}>
          <AdminQuestionBank />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/question-bank">
        <ProtectedRoute roles={["admin"]}>
          <Layout><AdminQuestionBank /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/tests/:id/analytics">
        <ProtectedRoute roles={["admin", "super_admin"]}>
          <Layout><TestAnalytics /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/analytics">
        <ProtectedRoute roles={["admin", "super_admin"]}>
          <Layout><AdminAnalytics /></Layout>
        </ProtectedRoute>
      </Route>

      {/* Student Routes */}
      <Route path="/student/dashboard">
        <ProtectedRoute roles={["student"]}>
          <Layout><StudentDashboard /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/student/tests">
        <ProtectedRoute roles={["student"]}>
          <Layout><StudentTests /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/student/tests/review-bucket">
        <ProtectedRoute roles={["student"]}>
          <StudentReviewBucket />
        </ProtectedRoute>
      </Route>
      <Route path="/student/question-bank">
        <ProtectedRoute roles={["student"]}>
          <Layout><StudentQuestionBankDashboard /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/student/question-bank/exam/:examId">
        <ProtectedRoute roles={["student"]}>
          <Layout><StudentQuestionBankExamPage /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/student/question-bank/exam/:examId/subject/:subjectId">
        <ProtectedRoute roles={["student"]}>
          <Layout><StudentQuestionBankSubjectPage /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/student/question-bank/exam/:examId/subject/:subjectId/chapter/:chapterId">
        <ProtectedRoute roles={["student"]}>
          <Layout><StudentQuestionBankChapterPage /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/student/question-bank/exam/:examId/subject/:subjectId/chapter/:chapterId/question/:questionId">
        <ProtectedRoute roles={["student"]}>
          <Layout><StudentQuestionBankQuestionPage /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/student/tests/:id/analysis">
        <ProtectedRoute roles={["student"]}>
          <StudentTestAnalysis />
        </ProtectedRoute>
      </Route>
      <Route path="/student/tests/:id/solutions">
        <ProtectedRoute roles={["student"]}>
          <StudentTestSolutions />
        </ProtectedRoute>
      </Route>
      <Route path="/student/profile">
        <ProtectedRoute roles={["student"]}>
          <Layout><StudentProfile /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/student/pending-approval">
        <ProtectedRoute roles={["student"]}>
          <StudentPendingApproval />
        </ProtectedRoute>
      </Route>

      {/* Shared — accessible to all logged-in roles */}
      <Route path="/leaderboard">
        <ProtectedRoute roles={["super_admin", "admin", "student"]}>
          <Layout><Leaderboard /></Layout>
        </ProtectedRoute>
      </Route>

      {/* Activity Feed — all logged-in roles */}
      <Route path="/activity">
        <ProtectedRoute roles={["super_admin", "admin", "student"]}>
          <Layout><ActivityFeed /></Layout>
        </ProtectedRoute>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useDeployRefresh();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <AppRouter />
            <Toaster />
          </AuthProvider>
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
