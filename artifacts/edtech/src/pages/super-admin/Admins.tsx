import { useState } from "react";
import { useListUsers, useCreateAdmin, useDeleteUser, getListUsersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Plus, Trash2, UserCheck, Pencil, Mail, User, BookOpen,
  Phone, KeyRound, Eye, EyeOff, CheckCircle, AlertTriangle,
  GraduationCap, Users, CalendarDays,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface StaffUser {
  id: number;
  fullName: string;
  username: string;
  email: string;
  role: "admin" | "planner";
  subject?: string | null;
  phone?: string | null;
  status: string;
  createdAt?: string;
}

interface EditForm {
  fullName: string;
  email: string;
  subject: string;
  phone: string;
  newPassword: string;
}

interface CreateForm {
  username: string;
  password: string;
  fullName: string;
  email: string;
  subject: string;
  role: "admin" | "planner";
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function roleLabel(role: StaffUser["role"]) {
  return role === "planner" ? "Planner" : "Teacher";
}

function roleBadgeClass(role: StaffUser["role"]) {
  return role === "planner" ? "bg-emerald-100 text-emerald-700" : "";
}

function EditStaffDialog({ staff, onUpdated }: { staff: StaffUser; onUpdated: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<EditForm>({
    fullName: staff.fullName ?? "",
    email: staff.email ?? "",
    subject: staff.subject ?? "",
    phone: staff.phone ?? "",
    newPassword: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async () => {
    if (!form.fullName.trim()) { setError("Full name is required."); return; }
    if (!form.email.trim()) { setError("Email is required."); return; }
    if (form.newPassword && form.newPassword.length < 6) { setError("Password must be at least 6 characters."); return; }
    setError("");
    setSaving(true);

    try {
      const body: Record<string, string> = {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        subject: form.subject.trim(),
        phone: form.phone.trim(),
      };
      if (form.newPassword.trim()) body.newPassword = form.newPassword.trim();

      const res = await fetch(`${BASE}/api/users/${staff.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to update account");
      }

      toast({
        title: `${roleLabel(staff.role)} updated`,
        description: `${form.fullName}'s details have been saved.`,
      });
      setOpen(false);
      setForm((prev) => ({ ...prev, newPassword: "" }));
      onUpdated();
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setError("");
          setForm({
            fullName: staff.fullName ?? "",
            email: staff.email ?? "",
            subject: staff.subject ?? "",
            phone: staff.phone ?? "",
            newPassword: "",
          });
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary gap-1.5">
          <Pencil size={14} /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${staff.role === "planner" ? "bg-gradient-to-br from-emerald-500 to-teal-600" : "bg-gradient-to-br from-blue-500 to-cyan-600"}`}>
              {getInitials(staff.fullName)}
            </div>
            <div>
              <p className="text-base font-semibold leading-tight">Edit {roleLabel(staff.role)} Account</p>
              <p className="text-xs text-muted-foreground font-normal">@{staff.username}</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {error && (
            <Alert variant="destructive" className="py-2.5">
              <AlertTriangle size={14} className="mr-2" />
              <AlertDescription className="text-sm">{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label className="text-sm flex items-center gap-1.5"><User size={13} /> Full Name</Label>
            <Input name="fullName" value={form.fullName} onChange={handleChange} placeholder="Full name" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm flex items-center gap-1.5"><Mail size={13} /> Email Address</Label>
            <Input name="email" type="email" value={form.email} onChange={handleChange} placeholder="Email address" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm flex items-center gap-1.5"><BookOpen size={13} /> Subject / Department <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input name="subject" value={form.subject} onChange={handleChange} placeholder={staff.role === "planner" ? "Planning, Coordination" : "e.g. Mathematics"} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm flex items-center gap-1.5"><Phone size={13} /> Phone <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input name="phone" value={form.phone} onChange={handleChange} placeholder="+91 98765 43210" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm flex items-center gap-1.5"><KeyRound size={13} /> Reset Password <span className="text-muted-foreground text-xs">(leave blank to keep current)</span></Label>
            <div className="relative">
              <Input
                name="newPassword"
                type={showPassword ? "text" : "password"}
                value={form.newPassword}
                onChange={handleChange}
                placeholder="New password (min 6 chars)"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button className="flex-1 gap-1.5" onClick={handleSave} disabled={saving}>
              {saving ? (
                <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</>
              ) : (
                <><CheckCircle size={14} /> Save Changes</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function SuperAdminAdmins() {
  const { data: users = [], isLoading } = useListUsers();
  const createStaff = useCreateAdmin();
  const deleteUser = useDeleteUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>({
    username: "",
    password: "",
    fullName: "",
    email: "",
    subject: "",
    role: "admin",
  });
  const [error, setError] = useState("");
  const [showCreatePwd, setShowCreatePwd] = useState(false);
  const [search, setSearch] = useState("");

  const staffUsers = (users as StaffUser[]).filter((user) => user.role === "admin" || user.role === "planner");
  const teacherCount = staffUsers.filter((user) => user.role === "admin").length;
  const plannerCount = staffUsers.filter((user) => user.role === "planner").length;

  const filtered = staffUsers.filter((user) =>
    !search.trim() ||
    user.fullName.toLowerCase().includes(search.toLowerCase()) ||
    user.username.toLowerCase().includes(search.toLowerCase()) ||
    user.email?.toLowerCase().includes(search.toLowerCase()) ||
    user.subject?.toLowerCase().includes(search.toLowerCase()) ||
    roleLabel(user.role).toLowerCase().includes(search.toLowerCase())
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleCreate = () => {
    setError("");

    if (!form.fullName.trim() || !form.username.trim() || !form.password.trim() || !form.email.trim()) {
      setError("Full name, username, email, and password are required.");
      return;
    }

    createStaff.mutate(
      {
        data: {
          username: form.username.trim(),
          password: form.password,
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          subject: form.role === "admin" ? form.subject || undefined : undefined,
          role: form.role,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          toast({
            title: `${roleLabel(form.role)} created`,
            description: `${form.fullName} has been added.`,
          });
          setOpen(false);
          setForm({
            username: "",
            password: "",
            fullName: "",
            email: "",
            subject: "",
            role: "admin",
          });
        },
        onError: (err: any) => {
          setError(err?.data?.error ?? "Failed to create account");
        },
      }
    );
  };

  const handleDelete = (staff: StaffUser) => {
    if (!confirm(`Delete ${roleLabel(staff.role).toLowerCase()} "${staff.fullName}"? This cannot be undone.`)) return;

    deleteUser.mutate(
      { id: staff.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          toast({
            title: `${roleLabel(staff.role)} deleted`,
            description: `${staff.fullName} has been removed.`,
          });
        },
      }
    );
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-cyan-600 to-emerald-600 p-6 text-white shadow-lg">
        <div className="relative z-10 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-white/70 text-sm mb-1">
              <GraduationCap size={14} /> Staff Accounts
            </div>
            <h1 className="text-2xl font-bold">Teachers & Planners</h1>
            <p className="text-white/70 text-sm mt-1">Super admins can create and manage both teacher accounts and planner logins from one place.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 shrink-0">
            <div className="bg-white/10 rounded-xl px-4 py-2.5 min-w-[110px]">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-white/80" />
                <div>
                  <p className="text-lg font-bold leading-tight">{teacherCount}</p>
                  <p className="text-xs text-white/70">Teachers</p>
                </div>
              </div>
            </div>
            <div className="bg-white/10 rounded-xl px-4 py-2.5 min-w-[110px]">
              <div className="flex items-center gap-2">
                <CalendarDays size={16} className="text-white/80" />
                <div>
                  <p className="text-lg font-bold leading-tight">{plannerCount}</p>
                  <p className="text-xs text-white/70">Planners</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-10 translate-x-10" />
        <div className="absolute bottom-0 right-20 w-24 h-24 bg-white/4 rounded-full translate-y-8" />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, username, email, subject, or role…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1.5 shrink-0">
              <Plus size={16} /> Add Staff Account
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Teacher or Planner</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 mt-2">
              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

              <div className="space-y-1.5">
                <Label className="text-sm">Role</Label>
                <select
                  name="role"
                  value={form.role}
                  onChange={handleChange}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="admin">Teacher</option>
                  <option value="planner">Planner</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm flex items-center gap-1.5"><User size={13} /> Full Name</Label>
                <Input name="fullName" placeholder="Full name" value={form.fullName} onChange={handleChange} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm flex items-center gap-1.5"><User size={13} /> Username</Label>
                <Input name="username" placeholder="Login username" value={form.username} onChange={handleChange} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm flex items-center gap-1.5"><Mail size={13} /> Email</Label>
                <Input name="email" type="email" placeholder="Email address" value={form.email} onChange={handleChange} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm flex items-center gap-1.5"><KeyRound size={13} /> Password</Label>
                <div className="relative">
                  <Input
                    name="password"
                    type={showCreatePwd ? "text" : "password"}
                    placeholder="Set a password"
                    value={form.password}
                    onChange={handleChange}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreatePwd((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showCreatePwd ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm flex items-center gap-1.5"><BookOpen size={13} /> Subject / Department <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  name="subject"
                  placeholder={form.role === "planner" ? "Planning, Coordination" : "e.g. Mathematics"}
                  value={form.subject}
                  onChange={handleChange}
                />
              </div>

              <Button className="w-full gap-1.5" onClick={handleCreate} disabled={createStaff.isPending}>
                {createStaff.isPending ? (
                  <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating…</>
                ) : (
                  <><Plus size={14} /> Create Account</>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3 border-b bg-muted/30">
          <CardTitle className="text-sm flex items-center gap-2">
            <UserCheck size={15} className="text-blue-500" />
            Staff Accounts
            <span className="text-muted-foreground font-normal">({filtered.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-muted-foreground">
              <UserCheck size={32} className="opacity-20 mb-2" />
              <p className="text-sm">{search ? "No staff accounts match your search." : "No teacher or planner accounts created yet."}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((staff) => (
                <div
                  key={staff.id}
                  className="flex items-center gap-4 p-3.5 rounded-xl border border-border/60 bg-card hover:border-border hover:shadow-sm transition-all duration-150"
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${staff.role === "planner" ? "bg-gradient-to-br from-emerald-500 to-teal-600" : "bg-gradient-to-br from-blue-500 to-cyan-600"}`}>
                    {getInitials(staff.fullName)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold">{staff.fullName}</p>
                      <Badge variant="secondary" className={`text-[10px] shrink-0 ${roleBadgeClass(staff.role)}`}>
                        {roleLabel(staff.role)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">@{staff.username}</span>
                      {staff.email && <span className="text-xs text-muted-foreground flex items-center gap-1"><Mail size={10} />{staff.email}</span>}
                      {staff.subject && <span className="text-xs text-muted-foreground flex items-center gap-1"><BookOpen size={10} />{staff.subject}</span>}
                      {staff.phone && <span className="text-xs text-muted-foreground flex items-center gap-1"><Phone size={10} />{staff.phone}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <EditStaffDialog staff={staff} onUpdated={refresh} />
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive gap-1.5" onClick={() => handleDelete(staff)}>
                      <Trash2 size={14} /> Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
