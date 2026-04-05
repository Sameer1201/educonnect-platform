import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BookOpen, GraduationCap, Orbit, Sparkles, Users, Zap } from "lucide-react";
import { Link } from "wouter";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login } = useAuth();
  const [, setLocation] = useLocation();

  const loginMutation = useLogin();

  const stars = useMemo(
    () =>
      Array.from({ length: 24 }, (_, index) => ({
        left: `${(index * 19) % 100}%`,
        top: `${(index * 31) % 100}%`,
        delay: `${(index % 7) * 0.35}s`,
        duration: `${5 + (index % 4)}s`,
      })),
    [],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    loginMutation.mutate(
      { data: { username, password } },
      {
        onSuccess: (data) => {
          login(data.user);
          const role = data.user.role;
          if (role === "super_admin") setLocation("/super-admin/dashboard");
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

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#040816] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#223f8f_0%,#0b1431_36%,#040816_72%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(61,129,255,0.16),transparent_22%,transparent_70%,rgba(179,84,255,0.12))]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(65,231,255,0.12),transparent_28%)]" />

      {stars.map((star, index) => (
        <span
          key={`${star.left}-${star.top}-${index}`}
          className="landing-star absolute h-1 w-1 rounded-full bg-white/70"
          style={{ left: star.left, top: star.top, animationDelay: star.delay, animationDuration: star.duration }}
        />
      ))}

      <div className="pointer-events-none absolute -left-24 top-24 h-72 w-72 rounded-full bg-cyan-400/18 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-32 h-96 w-96 rounded-full bg-fuchsia-500/14 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-blue-500/12 blur-3xl" />
      <div className="floating-bubble floating-bubble-sm left-[7%] top-[18%]" />
      <div className="floating-bubble floating-bubble-md right-[12%] top-[24%]" />
      <div className="floating-bubble floating-bubble-lg left-[18%] bottom-[14%]" />
      <div className="floating-bubble floating-bubble-sm right-[26%] bottom-[18%]" />

      <div className="relative mx-auto grid min-h-screen max-w-7xl items-center gap-10 px-6 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:px-10">
        <motion.div className="hidden lg:block">
          <div className="max-w-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/8 shadow-[0_0_40px_rgba(85,191,255,0.22)] backdrop-blur-xl">
                <GraduationCap size={24} className="text-cyan-200" />
              </div>
              <div>
                <p className="text-lg font-black tracking-[0.18em] text-white">EDUCONNECT</p>
                <p className="text-xs uppercase tracking-[0.28em] text-white/45">Teacher Student Access</p>
              </div>
            </div>

            <div className="mt-10">
              <div className="inline-flex items-center rounded-full border border-cyan-200/20 bg-cyan-300/10 px-4 py-1 text-cyan-100 shadow-[0_0_30px_rgba(97,214,255,0.18)]">
                <Orbit size={14} className="mr-2" />
                Secure Portal Login
              </div>
              <h2 className="mt-7 text-5xl font-black leading-[0.95] tracking-tight">
                Step into your
                <span className="block bg-[linear-gradient(90deg,#9ce6ff_0%,#ffffff_38%,#b38dff_100%)] bg-clip-text text-transparent">
                  live learning space
                </span>
              </h2>
              <p className="mt-5 max-w-lg text-base leading-7 text-white/68">
                Access classes, question bank practice, and student teacher workflows from one futuristic portal.
              </p>
            </div>

            <motion.div className="relative mt-10 h-[420px] w-full max-w-[520px]">
              <div className="portal-grid absolute inset-x-4 bottom-8 top-28 opacity-35" />
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 22, repeat: Number.POSITIVE_INFINITY, ease: "linear" }} className="portal-spin absolute left-1/2 top-1/2 h-[270px] w-[270px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/18" />
              <motion.div animate={{ rotate: -360 }} transition={{ duration: 28, repeat: Number.POSITIVE_INFINITY, ease: "linear" }} className="portal-spin-reverse absolute left-1/2 top-1/2 h-[210px] w-[210px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-fuchsia-200/14" />
              <div className="portal-pulse absolute left-1/2 top-1/2 h-[150px] w-[150px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,#dff8ff_0%,#7dd9ff_22%,#2249d5_46%,rgba(5,10,28,0.08)_70%)] shadow-[0_0_80px_rgba(83,205,255,0.36)]" />

              <motion.div className="portal-float absolute left-2 top-10 rounded-[1.7rem] border border-white/10 bg-white/8 p-5 backdrop-blur-xl shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-300/12 text-cyan-100">
                  <BookOpen size={22} />
                </div>
                <p className="mt-3 text-sm font-semibold text-white">Question Bank</p>
                <p className="mt-1 max-w-[180px] text-xs leading-5 text-white/60">Practice and test mode from the same batch view.</p>
              </motion.div>

              <motion.div className="portal-float-delayed absolute right-0 top-6 rounded-[1.7rem] border border-white/10 bg-white/8 p-5 backdrop-blur-xl shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-fuchsia-300/10 text-fuchsia-100">
                  <Users size={22} />
                </div>
                <p className="mt-3 text-sm font-semibold text-white">Teacher Student Model</p>
                <p className="mt-1 max-w-[190px] text-xs leading-5 text-white/60">Simple classroom flow designed for direct learning.</p>
              </motion.div>

              <motion.div className="portal-float absolute bottom-10 right-10 rounded-[1.7rem] border border-white/10 bg-white/8 p-5 backdrop-blur-xl shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-300/10 text-emerald-100">
                  <Zap size={22} />
                </div>
                <p className="mt-3 text-sm font-semibold text-white">Live Class Access</p>
                <p className="mt-1 max-w-[190px] text-xs leading-5 text-white/60">Fast login into classes and practice workflows.</p>
              </motion.div>
            </motion.div>
          </div>
        </motion.div>

        <motion.div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <GraduationCap size={24} className="text-cyan-200" />
            <span className="text-xl font-bold">EduConnect</span>
          </div>

          <Card className="overflow-hidden border border-white/10 bg-white/8 shadow-[0_30px_100px_rgba(0,0,0,0.38)] backdrop-blur-2xl">
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(79,196,255,0.08),transparent_35%,rgba(181,101,255,0.08))]" />
            <CardHeader className="relative">
              <div className="mb-3 inline-flex items-center rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs uppercase tracking-[0.18em] text-white/60">
                <Sparkles size={12} className="mr-2 text-cyan-200" />
                Login Portal
              </div>
              <CardTitle className="text-2xl text-white">Sign in</CardTitle>
              <CardDescription className="text-white/60">Enter your credentials to access your account</CardDescription>
            </CardHeader>

            <CardContent className="relative">
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription data-testid="text-error">{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="username" className="text-white/80">Username</Label>
                  <Input
                    id="username"
                    data-testid="input-username"
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    required
                    className="border-white/10 bg-slate-950/40 text-white placeholder:text-white/35"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-white/80">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    data-testid="input-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    className="border-white/10 bg-slate-950/40 text-white placeholder:text-white/35"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full rounded-full bg-cyan-300 text-slate-950 shadow-[0_0_40px_rgba(90,206,255,0.25)] hover:bg-cyan-200"
                  disabled={loginMutation.isPending}
                  data-testid="button-login"
                >
                  {loginMutation.isPending ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            </CardContent>

            <CardFooter className="relative flex flex-col gap-2 pt-0">
              <p className="text-sm text-white/60 text-center">
                New student?{" "}
                <Link href="/register" className="text-cyan-200 font-medium hover:underline" data-testid="link-register">
                  Register here
                </Link>
              </p>
              <p className="text-sm text-white/60 text-center">
                Want the portal intro first?{" "}
                <Link href="/" className="text-cyan-200 font-medium hover:underline">
                  Open landing page
                </Link>
              </p>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
