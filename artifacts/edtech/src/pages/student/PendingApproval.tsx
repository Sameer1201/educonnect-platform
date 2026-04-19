import { useEffect } from "react";
import { useLocation } from "wouter";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { Clock3, LogOut, Mail, RefreshCcw, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/ui/brand-logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { STUDENT_VERIFICATION_CONTACT_EMAIL } from "@/lib/student-access";
import type { AuthUser } from "@/types/auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function StudentPendingApproval() {
  const { user, login, logout } = useAuth();
  const [, setLocation] = useLocation();
  const isRejected = user?.status === "rejected";

  const { data, isFetching, refetch } = useGetCurrentUser({
    query: {
      queryKey: ["student", "pending-approval"],
      refetchInterval: 30000,
      retry: 1,
    },
  });

  useEffect(() => {
    if (!data) return;
    const nextUser = data as AuthUser;
    login(nextUser);

    if (!nextUser.onboardingComplete) {
      setLocation("/student/profile");
      return;
    }

    if (nextUser.status === "approved") {
      setLocation("/student/dashboard");
    }
  }, [data, login, setLocation]);

  const handleLogout = async () => {
    await fetch(`${BASE}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    }).catch(() => undefined);
    logout();
    setLocation("/login");
  };

  const handleEmailAdmin = () => {
    if (typeof window === "undefined") return;
    const subject = encodeURIComponent("Student verification pending");
    const body = encodeURIComponent("Hi Admin,\n\nMy student account verification is still pending. Please review it.\n");
    window.location.href = `mailto:${STUDENT_VERIFICATION_CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#eef2ff_0%,#ffffff_48%,#f8fafc_100%)] px-4 py-8 text-[#111827]">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center">
        <div className="w-full rounded-[32px] border border-[#E5E7EB] bg-white/95 p-8 shadow-[0_30px_80px_rgba(15,23,42,0.10)] sm:p-10">
          <div className="flex items-center gap-3">
            <BrandLogo imageClassName="h-12" />
            <div className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${
              isRejected ? "bg-[#FEE2E2] text-[#B91C1C]" : "bg-[#FEF3C7] text-[#B45309]"
            }`}>
              {isRejected ? "Application Rejected" : "Verification Pending"}
            </div>
          </div>

          <div className="mt-8 flex items-start gap-4">
            <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${
              isRejected ? "bg-[#FEF2F2] text-[#DC2626]" : "bg-[#EEF2FF] text-[#5B4DFF]"
            }`}>
              <ShieldCheck size={26} />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-[#111827]">
                {isRejected ? "Application needs changes" : "Account setup submitted"}
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-7 text-[#6B7280]">
                {isRejected
                  ? "Your application was reviewed and changes were requested. The rejection reason is shown below. Update your details and resubmit."
                  : "Your student profile setup is complete. An admin or super admin will verify it next. The student portal will become fully active after approval."}
              </p>
            </div>
          </div>

          {isRejected && (
            <div className="mt-6 rounded-[24px] border border-[#FECACA] bg-[#FEF2F2] p-5">
              <p className="text-sm font-semibold text-[#B91C1C]">Why it was rejected</p>
              <p className="mt-2 text-sm leading-7 text-[#7F1D1D]">
                {user?.rejectionReason || "Admin asked you to review and update your submitted details."}
              </p>
            </div>
          )}

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-[24px] border border-[#E5E7EB] bg-[#FAFBFF] p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#111827]">
                <Clock3 size={16} className="text-[#5B4DFF]" />
                Current status
              </div>
              <p className="mt-3 text-2xl font-black text-[#111827]">
                {user?.status === "approved" ? "Approved" : isRejected ? "Rejected" : "Pending"}
              </p>
              <p className="mt-1 text-xs text-[#6B7280]">
                {isRejected ? "Update details and resubmit for review" : "Waiting for admin or super admin review"}
              </p>
            </div>

            <div className="rounded-[24px] border border-[#E5E7EB] bg-[#FAFBFF] p-5">
              <div className="text-sm font-semibold text-[#111827]">Primary exam</div>
              <p className="mt-3 text-2xl font-black text-[#111827]">{user?.subject || "Not selected"}</p>
              <p className="mt-1 text-xs text-[#6B7280]">This setup is now locked for approval review</p>
            </div>

            <div className="rounded-[24px] border border-[#E5E7EB] bg-[#FAFBFF] p-5">
              <div className="text-sm font-semibold text-[#111827]">Auto check</div>
              <p className="mt-3 text-2xl font-black text-[#111827]">30 sec</p>
              <p className="mt-1 text-xs text-[#6B7280]">Page auto-refreshes approval status</p>
            </div>
          </div>

          <div className="mt-8 rounded-[24px] border border-[#E5E7EB] bg-[#FFF7E8] p-5">
            <p className="text-sm font-semibold text-[#B45309]">{isRejected ? "What to do now" : "What happens next"}</p>
            <div className="mt-3 space-y-2 text-sm text-[#7C2D12]">
              {isRejected ? (
                <>
                  <p>1. Click Edit details to open the onboarding form again.</p>
                  <p>2. Make the required corrections and resubmit the form.</p>
                  <p>3. After resubmitting, the application will return to pending review.</p>
                </>
              ) : (
                <>
                  <p>1. The student details will be added to the admin or super admin review queue.</p>
                  <p>2. The portal will become active automatically after approval.</p>
                  <p>3. Before approval, the preview dashboard will stay available, but the remaining student features will unlock after verification.</p>
                </>
              )}
            </div>
          </div>

          {!isRejected && (
            <div className="mt-6 rounded-[24px] border border-[#E5E7EB] bg-[#FAFBFF] p-5">
              <p className="text-sm font-semibold text-[#111827]">Need help with verification?</p>
              <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#111827]">
                <Mail size={16} className="text-[#5B4DFF]" />
                <span>{STUDENT_VERIFICATION_CONTACT_EMAIL}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-[#6B7280]">
                Agar approval me delay ho raha ho, to admin ko email karke verification follow up kar sakte ho.
              </p>
            </div>
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            {isRejected && (
              <Button
                type="button"
                onClick={() => setLocation("/student/profile")}
                className="rounded-2xl bg-[#DC2626] px-6 text-white hover:bg-[#B91C1C]"
              >
                Edit details
              </Button>
            )}
            {!isRejected && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setLocation("/student/dashboard")}
                className="rounded-2xl border-[#D9D6FE] px-6 text-[#5B4DFF] hover:bg-[#EEF2FF]"
              >
                Open preview dashboard
              </Button>
            )}
            <Button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="rounded-2xl bg-[#5B4DFF] px-6 text-white hover:bg-[#4C3FFD]"
            >
              <RefreshCcw size={16} className={`mr-2 ${isFetching ? "animate-spin" : ""}`} />
              {isFetching ? "Checking..." : isRejected ? "Refresh status" : "Check approval again"}
            </Button>
            {!isRejected && (
              <Button
                type="button"
                variant="outline"
                onClick={handleEmailAdmin}
                className="rounded-2xl border-[#E5E7EB] px-6"
              >
                <Mail size={16} className="mr-2" />
                Contact admin
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={handleLogout}
              className="rounded-2xl border-[#E5E7EB] px-6"
            >
              <LogOut size={16} className="mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
