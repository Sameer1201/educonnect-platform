import { useState } from "react";
import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { APP_NAME } from "@/lib/brand";
import { BrandLogo } from "@/components/ui/brand-logo";

function IllustrationScene() {
  return (
    <div className="relative min-h-[540px] overflow-hidden rounded-[38px] border border-[#E5E7EB] bg-white p-6 shadow-[0_24px_60px_rgba(17,24,39,0.08)]">
      <div className="relative mx-auto max-w-[620px]">
        <img
          src="/login-hero-design.svg"
          alt="Students collaborating in a digital learning environment"
          className="mx-auto w-full max-w-[620px] select-none object-contain"
          draggable={false}
        />
      </div>
    </div>
  );
}

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [forgotMessage, setForgotMessage] = useState("");
  const [forgotOpen, setForgotOpen] = useState(false);
  const { login } = useAuth();
  const [, setLocation] = useLocation();

  const loginMutation = useLogin();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    loginMutation.mutate(
      { data: { username, password } },
      {
        onSuccess: (data) => {
          login(data.user);
          const role = data.user.role;
          if ((data.user as any).mustChangePassword && role === "student") setLocation("/student/profile");
          else if (role === "super_admin") setLocation("/super-admin/dashboard");
          else if (role === "admin") setLocation("/admin/dashboard");
          else if (role === "planner") setLocation("/planner/dashboard");
          else setLocation("/student/dashboard");
        },
        onError: (err: any) => {
          setError(err?.data?.error ?? "Login failed. Please check your credentials.");
        },
      },
    );
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotMessage("");
    const response = await fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/auth/forgot-password-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: forgotIdentifier }),
    });
    const payload = await response.json().catch(() => ({}));
    setForgotMessage(payload.message ?? payload.error ?? "Request submitted.");
    if (response.ok) setForgotIdentifier("");
  };

  return (
    <div className="min-h-screen bg-white text-[#111827]">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-6 lg:px-10">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div>
              <BrandLogo imageClassName="h-14" />
              <p className="text-xs uppercase tracking-[0.2em] text-[#6B7280]">Portal Login</p>
            </div>
          </Link>

          <Link href="/register" className="text-sm font-medium text-[#5B4DFF] hover:underline">
            Create account
          </Link>
        </div>

        <div className="flex flex-1 items-center py-10">
          <div className="grid w-full gap-8 lg:grid-cols-[1.12fr_0.88fr] lg:items-center">
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: "easeOut" }}
              className="hidden lg:block"
            >
              <IllustrationScene />
            </motion.section>

            <motion.section
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.55, delay: 0.08, ease: "easeOut" }}
              className="mx-auto w-full max-w-md rounded-[34px] border border-[#E5E7EB] bg-white p-8 shadow-[0_24px_60px_rgba(17,24,39,0.08)]"
            >
              <div className="space-y-2">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#5B4DFF]">Portal Login</p>
                <h1 className="text-4xl font-black tracking-tight text-[#111827]">Welcome back</h1>
                <p className="text-sm leading-6 text-[#6B7280]">
                  Sign in to continue.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="mt-8 space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription data-testid="text-error">{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="username" className="text-[#111827]">Username</Label>
                  <Input
                    id="username"
                    data-testid="input-username"
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    required
                    className="h-12 rounded-2xl border-[#E5E7EB] bg-white text-[#111827] placeholder:text-[#9CA3AF]"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-[#111827]">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    data-testid="input-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    className="h-12 rounded-2xl border-[#E5E7EB] bg-white text-[#111827] placeholder:text-[#9CA3AF]"
                  />
                </div>

                <div className="pt-1">
                  <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
                    <DialogTrigger asChild>
                      <button type="button" className="text-sm font-medium text-[#5B4DFF] hover:underline">
                        Forgot password?
                      </button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md border-[#E5E7EB] bg-white">
                      <DialogHeader>
                        <DialogTitle>Student Forgot Password</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleForgotPassword} className="space-y-4">
                        <div className="space-y-1.5">
                          <Label>Username or Email</Label>
                          <Input
                            value={forgotIdentifier}
                            onChange={(e) => setForgotIdentifier(e.target.value)}
                            placeholder="Enter student username or email"
                            required
                          />
                        </div>
                        {forgotMessage && (
                          <Alert>
                            <AlertDescription>{forgotMessage}</AlertDescription>
                          </Alert>
                        )}
                        <Button type="submit" className="w-full">Send Reset Request</Button>
                        <p className="text-xs text-[#6B7280]">
                          Admin or super admin will verify the student and set a temporary password manually.
                        </p>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>

                <Button
                  type="submit"
                  className="h-12 w-full rounded-2xl bg-[#5B4DFF] text-white hover:bg-[#4C3FFD]"
                  disabled={loginMutation.isPending}
                  data-testid="button-login"
                >
                  {loginMutation.isPending ? "Signing in..." : "Login"}
                </Button>
              </form>

              <div className="mt-6 border-t border-[#F3F4F6] pt-4 text-center">
                <p className="text-sm text-[#6B7280]">
                  New student?{" "}
                  <Link href="/register" className="font-medium text-[#5B4DFF] hover:underline" data-testid="link-register">
                    Register here
                  </Link>
                </p>
              </div>
            </motion.section>
          </div>
        </div>
      </div>
    </div>
  );
}
