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
import { BrandLogo } from "@/components/ui/brand-logo";
import {
  clearFirebaseGoogleSession,
  isFirebaseGoogleConfigured,
  signInWithFirebaseEmailPassword,
  signInWithFirebaseGoogle,
} from "@/lib/firebase";

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
  const [emailLoading, setEmailLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [forgotMessage, setForgotMessage] = useState("");
  const [forgotOpen, setForgotOpen] = useState(false);
  const { login } = useAuth();
  const [, setLocation] = useLocation();

  const loginMutation = useLogin();
  const firebaseAuthEnabled = isFirebaseGoogleConfigured();

  const redirectAfterLogin = (nextUser: any) => {
    const role = nextUser.role;
    if (role === "student" && !nextUser.onboardingComplete) setLocation("/student/profile");
    else if (role === "student" && nextUser.status === "pending") setLocation("/student/pending-approval");
    else if (nextUser.mustChangePassword && role === "student") setLocation("/student/profile");
    else if (role === "super_admin") setLocation("/super-admin/dashboard");
    else if (role === "admin") setLocation("/admin/question-bank");
    else setLocation("/student/dashboard");
  };

  const completeBackendLogin = async (identifier: string, nextPassword: string) => {
    const data = await loginMutation.mutateAsync({ data: { username: identifier, password: nextPassword } });
    login(data.user);
    redirectAfterLogin(data.user);
  };

  const completeFirebaseServerLogin = async (path: string, idToken: string, fallbackMessage: string) => {
    const response = await fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      await clearFirebaseGoogleSession();
      throw new Error(payload.error ?? fallbackMessage);
    }
    login(payload.user);
    redirectAfterLogin(payload.user);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const identifier = username.trim();
    const shouldTryFirebaseEmail = firebaseAuthEnabled && identifier.includes("@");

    if (shouldTryFirebaseEmail) {
      setEmailLoading(true);
      try {
        const { idToken } = await signInWithFirebaseEmailPassword(identifier, password);
        await completeFirebaseServerLogin("/api/auth/firebase-email", idToken, "Firebase email login failed");
        return;
      } catch (firebaseError) {
        try {
          await completeBackendLogin(identifier, password);
          return;
        } catch (backendError: any) {
          const firebaseMessage = firebaseError instanceof Error ? firebaseError.message : "Firebase email login failed";
          setError(backendError?.data?.error ?? firebaseMessage);
          return;
        }
      } finally {
        setEmailLoading(false);
      }
    }

    try {
      await completeBackendLogin(identifier, password);
    } catch (err: any) {
      setError(err?.data?.error ?? "Login failed. Please check your credentials.");
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setGoogleLoading(true);
    try {
      const { idToken } = await signInWithFirebaseGoogle();
      await completeFirebaseServerLogin("/api/auth/google", idToken, "Google login failed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google login failed");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotMessage("");
    try {
      const response = await fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/auth/forgot-password-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: forgotIdentifier }),
      });
      const payload = await response.json().catch(() => ({}));
      setForgotMessage(payload.message ?? payload.error ?? "Request submitted.");
      setForgotIdentifier("");
    } catch (error) {
      setForgotMessage(error instanceof Error ? error.message : "Failed to start password reset.");
    }
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
            Student signup
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
                  <Label htmlFor="username" className="text-[#111827]">Email or Username</Label>
                  <Input
                    id="username"
                    data-testid="input-username"
                    placeholder="Enter student or teacher email, or username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username email"
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
                        <DialogTitle>Forgot Password</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleForgotPassword} className="space-y-4">
                        <div className="space-y-1.5">
                        <Label>Email or Username</Label>
                        <Input
                          value={forgotIdentifier}
                          onChange={(e) => setForgotIdentifier(e.target.value)}
                          placeholder="Enter student or teacher email, or username"
                          required
                        />
                        </div>
                        {forgotMessage && (
                          <Alert>
                            <AlertDescription>{forgotMessage}</AlertDescription>
                          </Alert>
                        )}
                        <Button type="submit" className="w-full">Continue Reset</Button>
                        <p className="text-xs text-[#6B7280]">
                          Students can register publicly. Teacher accounts are admin-created, but both students and teachers can reset password from here.
                        </p>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>

                <Button
                  type="submit"
                  className="h-12 w-full rounded-2xl bg-[#5B4DFF] text-white hover:bg-[#4C3FFD]"
                  disabled={loginMutation.isPending || emailLoading || googleLoading}
                  data-testid="button-login"
                >
                  {loginMutation.isPending || emailLoading ? "Signing in..." : "Login"}
                </Button>

                {firebaseAuthEnabled && (
                  <>
                    <div className="flex items-center gap-3 py-1">
                      <div className="h-px flex-1 bg-[#E5E7EB]" />
                      <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[#9CA3AF]">or</span>
                      <div className="h-px flex-1 bg-[#E5E7EB]" />
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 w-full rounded-2xl border-[#E5E7EB] bg-white text-[#111827] hover:bg-[#F9FAFB]"
                      onClick={handleGoogleLogin}
                      disabled={googleLoading}
                    >
                      <span className="mr-3 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                          <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.9 1.5l2.7-2.6C16.9 3.2 14.7 2.2 12 2.2 6.9 2.2 2.8 6.3 2.8 11.4S6.9 20.6 12 20.6c6.9 0 9.1-4.8 9.1-7.3 0-.5-.1-.8-.1-1.1H12Z" />
                          <path fill="#34A853" d="M2.8 11.4c0 1.6.6 3.1 1.7 4.3l3-2.3c-.4-.6-.6-1.3-.6-2s.2-1.4.6-2l-3-2.3c-1.1 1.2-1.7 2.7-1.7 4.3Z" />
                          <path fill="#FBBC05" d="M12 20.6c2.7 0 4.9-.9 6.6-2.5l-3.2-2.5c-.9.6-2 .9-3.4.9-2.5 0-4.6-1.7-5.4-4l-3.1 2.4c1.6 3.2 4.9 5.7 8.5 5.7Z" />
                          <path fill="#4285F4" d="M18.6 18.1c1.9-1.8 2.5-4.4 2.5-6.7 0-.5-.1-.8-.1-1.1H12v3.9h5.5c-.2 1.1-.9 2.7-2.3 3.8l3.4 2.1Z" />
                        </svg>
                      </span>
                      {googleLoading ? "Opening Google..." : "Continue with Google"}
                    </Button>
                  </>
                )}
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
