import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle } from "lucide-react";
import { Link } from "wouter";
import { BrandLogo } from "@/components/ui/brand-logo";
import { useAuth } from "@/contexts/AuthContext";
import { isFirebaseGoogleConfigured, signInWithFirebaseEmailPassword } from "@/lib/firebase";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function RegisterPage() {
  const [form, setForm] = useState({
    fullName: "",
    username: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [, setLocation] = useLocation();
  const { login } = useAuth();

  const completeFirebaseServerLogin = async (idToken: string) => {
    const response = await fetch(`${BASE}/api/auth/firebase-email`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error ?? "Account created, but automatic sign-in failed.");
    }
    login(payload.user);
    setLocation("/");
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const normalizedEmail = form.email.trim().toLowerCase();
    const normalizedUsername = form.username.trim();
    const normalizedFullName = form.fullName.trim();

    if (form.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (!normalizedFullName) {
      setError("Name is required");
      return;
    }
    if (!normalizedUsername) {
      setError("User ID is required");
      return;
    }
    if (!normalizedEmail) {
      setError("Email is required");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          username: normalizedUsername,
          password: form.password,
          fullName: normalizedFullName,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Registration failed. Please try again.");
      }

      if (!isFirebaseGoogleConfigured()) {
        setSuccess(true);
        return;
      }

      const { idToken } = await signInWithFirebaseEmailPassword(
        normalizedEmail,
        form.password,
      );
      await completeFirebaseServerLogin(idToken);
    } catch (err: any) {
      setError(err.message ?? "Registration failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-8">
        <Card className="w-full max-w-md text-center shadow-lg">
          <CardContent className="pt-8 pb-6">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle size={32} className="text-green-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold mb-2">Registration Submitted!</h2>
            <p className="text-muted-foreground mb-6">
              Firebase student account create ho gaya. Ab email/password ya Google se login karke setup complete karo, phir approval ke baad portal active hoga.
            </p>
            <Button onClick={() => setLocation("/login")} data-testid="button-go-login" className="w-full">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-6">
          <BrandLogo imageClassName="h-14" />
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl">Student Registration</CardTitle>
            <CardDescription>Create your student account. Setup complete hone ke baad admin ya super admin approval required hoga.</CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription data-testid="text-error">{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  name="fullName"
                  data-testid="input-fullname"
                  placeholder="Your full name"
                  value={form.fullName}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="username">User ID</Label>
                <Input
                  id="username"
                  name="username"
                  data-testid="input-username"
                  placeholder="Choose your user ID"
                  value={form.username}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  data-testid="input-email"
                  placeholder="Enter your email"
                  value={form.email}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  data-testid="input-password"
                  placeholder="Min 6 characters"
                  value={form.password}
                  onChange={handleChange}
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={saving}
                data-testid="button-register"
              >
                {saving ? "Creating account..." : "Create Account"}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="pt-0">
            <p className="text-sm text-muted-foreground text-center w-full">
              Already have an account?{" "}
              <Link href="/login" className="text-primary font-medium hover:underline" data-testid="link-login">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
