import { lazy, useEffect, type ReactNode } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useActivityTracker } from "@/hooks/useActivityTracker";

const Layout = lazy(() => import("@/components/Layout"));
const NotFound = lazy(() => import("@/pages/not-found"));
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const RegisterPage = lazy(() => import("@/pages/RegisterPage"));
const SuperAdminDashboard = lazy(() => import("@/pages/super-admin/Dashboard"));
const SuperAdminAdmins = lazy(() => import("@/pages/super-admin/Admins"));
const SuperAdminStudents = lazy(() => import("@/pages/super-admin/Students"));
const SendNotification = lazy(() => import("@/pages/super-admin/SendNotification"));
const TeacherPerformance = lazy(() => import("@/pages/super-admin/TeacherPerformance"));
const SuperAdminTests = lazy(() => import("@/pages/super-admin/Tests"));
const SuperAdminActivity = lazy(() => import("@/pages/super-admin/Activity"));
const AdminStudents = lazy(() => import("@/pages/admin/Students"));
const AdminProfile = lazy(() => import("@/pages/admin/Profile"));
const AdminAnalytics = lazy(() => import("@/pages/admin/Analytics"));
const AdminQuestionBank = lazy(() => import("@/pages/admin/QuestionBank"));
const AdminTests = lazy(() => import("@/pages/admin/Tests"));
const AdminTestBuilder = lazy(() => import("@/pages/admin/TestBuilder"));
const TestAnalytics = lazy(() => import("@/pages/admin/TestAnalytics"));
const PlannerExamTemplates = lazy(() => import("@/pages/planner/ExamTemplates"));
const PlannerQuestionBank = lazy(() => import("@/pages/planner/QuestionBank"));
const PlannerQuestionBankDetail = lazy(() => import("@/pages/planner/QuestionBankDetail"));
const StudentDashboard = lazy(() => import("@/pages/student/Dashboard"));
const StudentTestAnalysis = lazy(() => import("@/pages/student/TestAnalysis"));
const StudentTestSolutions = lazy(() => import("@/pages/student/TestSolutions"));
const StudentQuestionBankDashboard = lazy(() => import("@/pages/student/question-bank/Dashboard"));
const StudentQuestionBankExamPage = lazy(() => import("@/pages/student/question-bank/ExamPage"));
const StudentQuestionBankSubjectPage = lazy(() => import("@/pages/student/question-bank/SubjectPage"));
const StudentQuestionBankChapterPage = lazy(() => import("@/pages/student/question-bank/ChapterPage"));
const StudentQuestionBankQuestionPage = lazy(() => import("@/pages/student/question-bank/QuestionPage"));
const StudentReviewBucket = lazy(() => import("@/pages/student/ReviewBucket"));
const StudentProfile = lazy(() => import("@/pages/student/Profile"));
const StudentPendingApproval = lazy(() => import("@/pages/student/PendingApproval"));
const StudentTests = lazy(() => import("@/pages/student/Tests"));
const Leaderboard = lazy(() => import("@/pages/Leaderboard"));
const ActivityFeed = lazy(() => import("@/pages/ActivityFeed"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30 * 1000,
    },
  },
});

export type ViewMode = "personal" | "comparative";

function AppLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function studentNeedsOnboarding(user: { role: string; onboardingComplete?: boolean }) {
  return user.role === "student" && !user.onboardingComplete;
}

function studentAwaitingApproval(user: { role: string; onboardingComplete?: boolean; status?: string | null }) {
  return user.role === "student" && !!user.onboardingComplete && user.status === "pending";
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
    if (studentNeedsOnboarding(user) && location !== "/student/profile") {
      setLocation("/student/profile");
      return null;
    }

    if (studentAwaitingApproval(user) && location !== "/student/pending-approval") {
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
  if (user.status === "pending") return "/student/pending-approval";
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

  return (
    <Switch>
      <Route path="/">
        {isLoading ? (
          <div className="min-h-screen flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : user ? (
          <RedirectTo href={getRoleHomePath(user.role, user)} />
        ) : (
          <LandingPage />
        )}
      </Route>
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />

      {/* Super Admin Routes */}
      <Route path="/super-admin/dashboard">
        <ProtectedRoute roles={["super_admin"]}>
          <Layout><SuperAdminDashboard /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/super-admin/admins">
        <ProtectedRoute roles={["super_admin"]}>
          <Layout><SuperAdminAdmins /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/super-admin/students">
        <ProtectedRoute roles={["super_admin"]}>
          <Layout><SuperAdminStudents /></Layout>
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
