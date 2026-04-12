import { lazy, Suspense, type ReactNode } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

const Layout = lazy(() => import("@/components/Layout"));
const NotFound = lazy(() => import("@/pages/not-found"));
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const RegisterPage = lazy(() => import("@/pages/RegisterPage"));
const SuperAdminDashboard = lazy(() => import("@/pages/super-admin/Dashboard"));
const SuperAdminAdmins = lazy(() => import("@/pages/super-admin/Admins"));
const SuperAdminStudents = lazy(() => import("@/pages/super-admin/Students"));
const SuperAdminClasses = lazy(() => import("@/pages/super-admin/Classes"));
const HRDashboard = lazy(() => import("@/pages/super-admin/HRDashboard"));
const Finance = lazy(() => import("@/pages/super-admin/Finance"));
const SuperAdminSupport = lazy(() => import("@/pages/super-admin/Support"));
const SendNotification = lazy(() => import("@/pages/super-admin/SendNotification"));
const TeacherPerformance = lazy(() => import("@/pages/super-admin/TeacherPerformance"));
const SuperAdminTests = lazy(() => import("@/pages/super-admin/Tests"));
const SuperAdminActivity = lazy(() => import("@/pages/super-admin/Activity"));
const SuperAdminPayments = lazy(() => import("@/pages/super-admin/Payments"));
const AdminDashboard = lazy(() => import("@/pages/admin/Dashboard"));
const AdminClasses = lazy(() => import("@/pages/admin/Classes"));
const AdminClassDetail = lazy(() => import("@/pages/admin/ClassDetail"));
const AdminStudents = lazy(() => import("@/pages/admin/Students"));
const AdminWhiteboard = lazy(() => import("@/pages/admin/Whiteboard"));
const AdminLiveClass = lazy(() => import("@/pages/admin/LiveClass"));
const AdminProfile = lazy(() => import("@/pages/admin/Profile"));
const AdminSupport = lazy(() => import("@/pages/admin/Support"));
const AdminAssignments = lazy(() => import("@/pages/admin/Assignments"));
const AdminAttendance = lazy(() => import("@/pages/admin/Attendance"));
const AdminAnalytics = lazy(() => import("@/pages/admin/Analytics"));
const AdminQuestionBank = lazy(() => import("@/pages/admin/QuestionBank"));
const AdminTests = lazy(() => import("@/pages/admin/Tests"));
const AdminTestBuilder = lazy(() => import("@/pages/admin/TestBuilder"));
const TestAnalytics = lazy(() => import("@/pages/admin/TestAnalytics"));
const AdminPayments = lazy(() => import("@/pages/admin/Payments"));
const PlannerCourseDetail = lazy(() => import("@/pages/planner/CourseDetail"));
const PlannerCourses = lazy(() => import("@/pages/planner/Courses"));
const PlannerDashboard = lazy(() => import("@/pages/planner/Dashboard"));
const PlannerExamTemplates = lazy(() => import("@/pages/planner/ExamTemplates"));
const PlannerQuestionBank = lazy(() => import("@/pages/planner/QuestionBank"));
const StudentDashboard = lazy(() => import("@/pages/student/Dashboard"));
const StudentClasses = lazy(() => import("@/pages/student/Classes"));
const StudentClassDetail = lazy(() => import("@/pages/student/ClassDetail"));
const StudentWhiteboard = lazy(() => import("@/pages/student/Whiteboard"));
const StudentLiveClass = lazy(() => import("@/pages/student/LiveClass"));
const StudentFeedback = lazy(() => import("@/pages/student/Feedback"));
const StudentSupport = lazy(() => import("@/pages/student/Support"));
const StudentAssignments = lazy(() => import("@/pages/student/Assignments"));
const StudentProgress = lazy(() => import("@/pages/student/Progress"));
const StudentTestAnalysis = lazy(() => import("@/pages/student/TestAnalysis"));
const StudentTestSolutions = lazy(() => import("@/pages/student/TestSolutions"));
const StudentQuestionBank = lazy(() => import("@/pages/student/QuestionBank"));
const StudentReviewBucket = lazy(() => import("@/pages/student/ReviewBucket"));
const StudentProfile = lazy(() => import("@/pages/student/Profile"));
const StudentTests = lazy(() => import("@/pages/student/Tests"));
const StudentPayments = lazy(() => import("@/pages/student/Payments"));
const Community = lazy(() => import("@/pages/Community"));
const Schedule = lazy(() => import("@/pages/Schedule"));
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

function ProtectedRoute({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

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

  return <>{children}</>;
}

function AppRouter() {
  const { user, isLoading } = useAuth();
  const { data: platformSettings } = usePlatformSettings(!!user);
  useActivityTracker(!!user);
  const learningAccessEnabled = platformSettings?.learningAccessEnabled ?? true;

  const renderFeaturePaused = () => (
    <Layout>
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <h1 className="text-2xl font-bold">This module is paused</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Super admin has currently turned off class and assignment access so everyone can focus on community, question bank, and tests.
        </p>
      </div>
    </Layout>
  );

  return (
    <Switch>
      <Route path="/">
        {isLoading ? (
          <div className="min-h-screen flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : user ? (
          <Layout>
            {user.role === "super_admin" && <SuperAdminDashboard />}
            {user.role === "admin" && <AdminDashboard />}
            {user.role === "planner" && <PlannerDashboard />}
            {user.role === "student" && <StudentDashboard />}
          </Layout>
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
      <Route path="/super-admin/classes">
        <ProtectedRoute roles={["super_admin"]}>
          <Layout><SuperAdminClasses /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/super-admin/hr">
        <ProtectedRoute roles={["super_admin"]}>
          <Layout><HRDashboard /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/super-admin/finance">
        <ProtectedRoute roles={["super_admin"]}>
          <Layout><Finance /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/super-admin/support">
        <ProtectedRoute roles={["super_admin"]}>
          <Layout><SuperAdminSupport /></Layout>
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
      <Route path="/super-admin/payments">
        <ProtectedRoute roles={["super_admin"]}>
          <Layout><SuperAdminPayments /></Layout>
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
          <Layout><AdminDashboard /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/classes">
        <ProtectedRoute roles={["admin"]}>
          {learningAccessEnabled ? <Layout><AdminClasses /></Layout> : renderFeaturePaused()}
        </ProtectedRoute>
      </Route>
      <Route path="/admin/class/:id">
        <ProtectedRoute roles={["admin"]}>
          {learningAccessEnabled ? <Layout><AdminClassDetail /></Layout> : renderFeaturePaused()}
        </ProtectedRoute>
      </Route>
      <Route path="/admin/students">
        <ProtectedRoute roles={["admin"]}>
          <Layout><AdminStudents /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/whiteboard/:classId">
        <ProtectedRoute roles={["admin"]}>
          {learningAccessEnabled ? <AdminWhiteboard /> : renderFeaturePaused()}
        </ProtectedRoute>
      </Route>
      <Route path="/admin/live-class/:id">
        <ProtectedRoute roles={["admin"]}>
          {learningAccessEnabled ? <Layout><AdminLiveClass /></Layout> : renderFeaturePaused()}
        </ProtectedRoute>
      </Route>
      <Route path="/admin/support">
        <ProtectedRoute roles={["admin"]}>
          <Layout><AdminSupport /></Layout>
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
      <Route path="/admin/assignments">
        <ProtectedRoute roles={["admin"]}>
          {learningAccessEnabled ? <Layout><AdminAssignments /></Layout> : renderFeaturePaused()}
        </ProtectedRoute>
      </Route>
      <Route path="/admin/attendance">
        <ProtectedRoute roles={["admin"]}>
          {learningAccessEnabled ? <Layout><AdminAttendance /></Layout> : renderFeaturePaused()}
        </ProtectedRoute>
      </Route>
      <Route path="/admin/analytics">
        <ProtectedRoute roles={["admin", "super_admin"]}>
          <Layout><AdminAnalytics /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/payments">
        <ProtectedRoute roles={["admin"]}>
          <Layout><AdminPayments /></Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/planner/dashboard">
        <ProtectedRoute roles={["planner"]}>
          <Layout><PlannerDashboard /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/planner/exam-templates">
        <ProtectedRoute roles={["planner"]}>
          <Layout><PlannerExamTemplates /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/planner/question-bank">
        <ProtectedRoute roles={["planner"]}>
          <Layout><PlannerQuestionBank /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/planner/question-bank/:id">
        <ProtectedRoute roles={["planner"]}>
          <Layout><PlannerCourseDetail /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/planner/courses">
        <ProtectedRoute roles={["planner"]}>
          <Layout><PlannerCourses /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/planner/courses/:id">
        <ProtectedRoute roles={["planner"]}>
          <Layout><PlannerCourseDetail /></Layout>
        </ProtectedRoute>
      </Route>

      {/* Student Routes */}
      <Route path="/student/dashboard">
        <ProtectedRoute roles={["student"]}>
          <Layout><StudentDashboard /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/student/classes">
        <ProtectedRoute roles={["student"]}>
          {learningAccessEnabled ? <Layout><StudentClasses /></Layout> : renderFeaturePaused()}
        </ProtectedRoute>
      </Route>
      <Route path="/student/class/:id">
        <ProtectedRoute roles={["student"]}>
          {learningAccessEnabled ? <Layout><StudentClassDetail /></Layout> : renderFeaturePaused()}
        </ProtectedRoute>
      </Route>
      <Route path="/student/whiteboard/:classId">
        <ProtectedRoute roles={["student"]}>
          {learningAccessEnabled ? <StudentWhiteboard /> : renderFeaturePaused()}
        </ProtectedRoute>
      </Route>
      <Route path="/student/live-class/:id">
        <ProtectedRoute roles={["student"]}>
          {learningAccessEnabled ? <Layout><StudentLiveClass /></Layout> : renderFeaturePaused()}
        </ProtectedRoute>
      </Route>
      <Route path="/student/feedback">
        <ProtectedRoute roles={["student"]}>
          {learningAccessEnabled ? <Layout><StudentFeedback /></Layout> : renderFeaturePaused()}
        </ProtectedRoute>
      </Route>
      <Route path="/student/support">
        <ProtectedRoute roles={["student"]}>
          <Layout><StudentSupport /></Layout>
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
          <Layout><StudentQuestionBank /></Layout>
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
      <Route path="/student/assignments">
        <ProtectedRoute roles={["student"]}>
          {learningAccessEnabled ? <Layout><StudentAssignments /></Layout> : renderFeaturePaused()}
        </ProtectedRoute>
      </Route>
      <Route path="/student/progress">
        <ProtectedRoute roles={["student"]}>
          <Layout><StudentProgress /></Layout>
        </ProtectedRoute>
      </Route>
      <Route path="/student/payments">
        <ProtectedRoute roles={["student"]}>
          {learningAccessEnabled ? <Layout><StudentPayments /></Layout> : renderFeaturePaused()}
        </ProtectedRoute>
      </Route>
      <Route path="/student/profile">
        <ProtectedRoute roles={["student"]}>
          <Layout><StudentProfile /></Layout>
        </ProtectedRoute>
      </Route>

      {/* Shared — accessible to all logged-in roles */}
      <Route path="/leaderboard">
        <ProtectedRoute roles={["super_admin", "admin", "student"]}>
          <Layout><Leaderboard /></Layout>
        </ProtectedRoute>
      </Route>

      {/* Community — accessible to all logged-in roles */}
      <Route path="/community">
        <ProtectedRoute roles={["super_admin", "admin", "student"]}>
          <Layout><Community /></Layout>
        </ProtectedRoute>
      </Route>

      {/* Schedule — accessible to all roles */}
      <Route path="/schedule">
        <ProtectedRoute roles={["super_admin", "admin", "planner", "student"]}>
          <Layout><Schedule /></Layout>
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
