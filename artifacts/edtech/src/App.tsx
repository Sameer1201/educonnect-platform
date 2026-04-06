import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import Layout from "@/components/Layout";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/LandingPage";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";

// Super Admin pages
import SuperAdminDashboard from "@/pages/super-admin/Dashboard";
import SuperAdminAdmins from "@/pages/super-admin/Admins";
import SuperAdminStudents from "@/pages/super-admin/Students";
import SuperAdminClasses from "@/pages/super-admin/Classes";

// Admin pages
import AdminDashboard from "@/pages/admin/Dashboard";
import AdminClasses from "@/pages/admin/Classes";
import AdminClassDetail from "@/pages/admin/ClassDetail";
import AdminStudents from "@/pages/admin/Students";
import AdminWhiteboard from "@/pages/admin/Whiteboard";
import AdminLiveClass from "@/pages/admin/LiveClass";

// Super Admin extra pages
import HRDashboard from "@/pages/super-admin/HRDashboard";
import Finance from "@/pages/super-admin/Finance";
import SuperAdminSupport from "@/pages/super-admin/Support";
import SendNotification from "@/pages/super-admin/SendNotification";
import TeacherPerformance from "@/pages/super-admin/TeacherPerformance";

// Admin extra pages
import AdminProfile from "@/pages/admin/Profile";
import AdminSupport from "@/pages/admin/Support";
import AdminAssignments from "@/pages/admin/Assignments";
import AdminAttendance from "@/pages/admin/Attendance";
import AdminAnalytics from "@/pages/admin/Analytics";
import AdminQuestionBank from "@/pages/admin/QuestionBank";

// Student pages
import PlannerCourseDetail from "@/pages/planner/CourseDetail";
import PlannerCourses from "@/pages/planner/Courses";
import PlannerDashboard from "@/pages/planner/Dashboard";
import StudentDashboard from "@/pages/student/Dashboard";
import StudentClasses from "@/pages/student/Classes";
import StudentClassDetail from "@/pages/student/ClassDetail";
import StudentWhiteboard from "@/pages/student/Whiteboard";
import StudentLiveClass from "@/pages/student/LiveClass";
import StudentFeedback from "@/pages/student/Feedback";
import StudentSupport from "@/pages/student/Support";
import StudentAssignments from "@/pages/student/Assignments";
import StudentProgress from "@/pages/student/Progress";
import StudentTestAnalysis from "@/pages/student/TestAnalysis";
import StudentQuestionBank from "@/pages/student/QuestionBank";
import StudentProfile from "@/pages/student/Profile";

// Tests pages
import SuperAdminTests from "@/pages/super-admin/Tests";
import AdminTests from "@/pages/admin/Tests";
import AdminTestBuilder from "@/pages/admin/TestBuilder";
import TestAnalytics from "@/pages/admin/TestAnalytics";
import StudentTests from "@/pages/student/Tests";

// Shared pages
import Community from "@/pages/Community";
import Schedule from "@/pages/Schedule";
import SuperAdminActivity from "@/pages/super-admin/Activity";
import SuperAdminPayments from "@/pages/super-admin/Payments";
import AdminPayments from "@/pages/admin/Payments";
import StudentPayments from "@/pages/student/Payments";
import Leaderboard from "@/pages/Leaderboard";
import ActivityFeed from "@/pages/ActivityFeed";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30 * 1000,
    },
  },
});

function ProtectedRoute({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
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
