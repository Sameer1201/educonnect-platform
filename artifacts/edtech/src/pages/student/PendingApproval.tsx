import { useEffect } from "react";
import { useLocation } from "wouter";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { Clock3, LogOut, RefreshCcw, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/ui/brand-logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import type { AuthUser } from "@/types/auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function StudentPendingApproval() {
  const { user, login, logout } = useAuth();
  const [, setLocation] = useLocation();

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

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#eef2ff_0%,#ffffff_48%,#f8fafc_100%)] px-4 py-8 text-[#111827]">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center">
        <div className="w-full rounded-[32px] border border-[#E5E7EB] bg-white/95 p-8 shadow-[0_30px_80px_rgba(15,23,42,0.10)] sm:p-10">
          <div className="flex items-center gap-3">
            <BrandLogo imageClassName="h-12" />
            <div className="rounded-full bg-[#FEF3C7] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#B45309]">
              Verification Pending
            </div>
          </div>

          <div className="mt-8 flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#EEF2FF] text-[#5B4DFF]">
              <ShieldCheck size={26} />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-[#111827]">Account setup submitted</h1>
              <p className="mt-2 max-w-xl text-sm leading-7 text-[#6B7280]">
                Tumhara student profile setup complete ho chuka hai. Ab admin ya super admin verification karega. Approval ke baad hi
                student portal fully active hoga.
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-[24px] border border-[#E5E7EB] bg-[#FAFBFF] p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#111827]">
                <Clock3 size={16} className="text-[#5B4DFF]" />
                Current status
              </div>
              <p className="mt-3 text-2xl font-black text-[#111827]">{user?.status === "approved" ? "Approved" : "Pending"}</p>
              <p className="mt-1 text-xs text-[#6B7280]">Waiting for admin or super admin review</p>
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
            <p className="text-sm font-semibold text-[#B45309]">What happens next</p>
            <div className="mt-3 space-y-2 text-sm text-[#7C2D12]">
              <p>1. Student details admin ya super admin review queue me jayengi.</p>
              <p>2. Approval ke baad portal automatically active ho jayega.</p>
              <p>3. Jab tak approval nahi hota, tests, dashboard, question bank aur baaki student features locked rahenge.</p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="rounded-2xl bg-[#5B4DFF] px-6 text-white hover:bg-[#4C3FFD]"
            >
              <RefreshCcw size={16} className={`mr-2 ${isFetching ? "animate-spin" : ""}`} />
              {isFetching ? "Checking..." : "Check approval again"}
            </Button>
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
