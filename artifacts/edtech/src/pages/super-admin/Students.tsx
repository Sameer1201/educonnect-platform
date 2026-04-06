import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Users, Clock, CheckCircle, XCircle, ShieldCheck, ShieldOff, RotateCcw, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface User {
  id: number; username: string; fullName: string; email: string; phone?: string;
  status: string; subject?: string | null; approvedById?: number | null; approvedAt?: string | null; createdAt: string;
  approverName?: string;
}

export default function SuperAdminStudents() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [resetDialog, setResetDialog] = useState<{ id: number; studentName: string } | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const { data: students = [], isLoading } = useQuery<User[]>({
    queryKey: ["sa-students-with-approvers"],
    queryFn: async () => {
      const [studentsRes, adminsRes] = await Promise.all([
        fetch(`${BASE}/api/users?role=student`, { credentials: "include" }),
        fetch(`${BASE}/api/users?role=admin`, { credentials: "include" }),
      ]);
      const studentsData: User[] = await studentsRes.json();
      const adminsData: User[] = await adminsRes.json();
      const adminMap: Record<number, string> = {};
      for (const a of adminsData) adminMap[a.id] = a.fullName;
      return studentsData.map((s) => ({
        ...s,
        approverName: s.approvedById ? (adminMap[s.approvedById] ?? `Admin #${s.approvedById}`) : undefined,
      }));
    },
  });
  const { data: resetRequests = [] } = useQuery<any[]>({
    queryKey: ["sa-password-reset-requests"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/password-reset-requests`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load reset requests");
      return r.json();
    },
  });

  const refreshStudents = () => queryClient.invalidateQueries({ queryKey: ["sa-students-with-approvers"] });

  const revokeMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${BASE}/api/users/${id}/approve`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected" }),
      });
      if (!r.ok) throw new Error("Failed to revoke access");
    },
    onSuccess: () => {
      refreshStudents();
      toast({ title: "Access revoked", description: "Student can no longer log in." });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${BASE}/api/users/${id}/approve`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      });
      if (!r.ok) throw new Error("Failed to restore access");
    },
    onSuccess: () => {
      refreshStudents();
      toast({ title: "Access restored", description: "Student can log in again." });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${BASE}/api/users/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) {
        const payload = await r.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to delete student");
      }
    },
    onSuccess: () => {
      refreshStudents();
      toast({ title: "Student deleted", description: "Student account and all related data were permanently removed." });
    },
    onError: (err: Error) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });
  const resolveResetMutation = useMutation({
    mutationFn: async ({ id, temporaryPassword }: { id: number; temporaryPassword: string }) => {
      const r = await fetch(`${BASE}/api/password-reset-requests/${id}/resolve`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ temporaryPassword }),
      });
      if (!r.ok) {
        const payload = await r.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to set temporary password");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sa-password-reset-requests"] });
      toast({ title: "Temporary password set", description: "Student must change password after login." });
      setResetDialog(null);
      setTemporaryPassword("");
    },
  });

  const pending = students.filter((s) => s.status === "pending");
  const approved = students.filter((s) => s.status === "approved");

  const statusIcon = (status: string) => {
    if (status === "approved") return <CheckCircle size={14} className="text-green-500" />;
    if (status === "pending") return <Clock size={14} className="text-yellow-500" />;
    return <XCircle size={14} className="text-red-500" />;
  };

  const statusVariant = (status: string): "default" | "outline" | "destructive" | "secondary" => {
    if (status === "approved") return "default";
    if (status === "pending") return "outline";
    return "destructive";
  };

  const handleDelete = (student: User) => {
    if (!confirm(`Delete ${student.fullName} permanently? This will remove all data related to this student.`)) return;
    deleteMutation.mutate(student.id);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">All Students</h1>
        <p className="text-muted-foreground text-sm mt-1">View students, revoke access, or permanently remove all student data</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Users size={18} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-2xl font-bold" data-testid="stat-total-students">{students.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-50 flex items-center justify-center">
              <Clock size={18} className="text-yellow-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="text-2xl font-bold" data-testid="stat-pending-students">{pending.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
              <CheckCircle size={18} className="text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Approved</p>
              <p className="text-2xl font-bold" data-testid="stat-approved-students">{approved.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Forgot Password Requests ({resetRequests.filter((r) => r.status === "open").length})</CardTitle>
        </CardHeader>
        <CardContent>
          {resetRequests.filter((r) => r.status === "open").length === 0 ? (
            <p className="text-sm text-muted-foreground">No open reset requests.</p>
          ) : (
            <div className="space-y-2">
              {resetRequests.filter((r) => r.status === "open").map((request) => (
                <div key={request.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">{request.requestedUsername}</p>
                    <p className="text-xs text-muted-foreground">{request.requestedEmail}</p>
                  </div>
                  <Button size="sm" onClick={() => setResetDialog({ id: request.id, studentName: request.requestedUsername })}>
                    Set Temporary Password
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Student List</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}
            </div>
          ) : students.length === 0 ? (
            <p className="text-sm text-muted-foreground">No students registered yet.</p>
          ) : (
            <div className="space-y-2">
              {students.map((student) => (
                <div
                  key={student.id}
                  className="flex items-start justify-between p-3 rounded-lg border border-border gap-3"
                  data-testid={`student-row-${student.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{student.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      @{student.username} · {student.email}{student.phone ? ` · ${student.phone}` : ""}
                    </p>
                    {student.subject && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Target exam: {student.subject}
                      </p>
                    )}
                    {student.status === "approved" && student.approverName && (
                      <p className="text-xs text-green-700 flex items-center gap-1 mt-0.5" data-testid={`approver-${student.id}`}>
                        <ShieldCheck size={11} />
                        Approved by <strong>{student.approverName}</strong>
                        {student.approvedAt && (
                          <span className="text-muted-foreground font-normal">
                            · {format(new Date(student.approvedAt), "MMM d, yyyy")}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <Badge variant={statusVariant(student.status)} className="flex items-center gap-1.5 shrink-0">
                      {statusIcon(student.status)}
                      {student.status}
                    </Badge>
                    {student.status === "approved" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => revokeMutation.mutate(student.id)}
                        disabled={revokeMutation.isPending}
                        data-testid={`button-revoke-${student.id}`}
                      >
                        <ShieldOff size={14} className="mr-1" />
                        Revoke Access
                      </Button>
                    )}
                    {student.status === "rejected" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-green-600 hover:text-green-700 hover:bg-green-50"
                        onClick={() => restoreMutation.mutate(student.id)}
                        disabled={restoreMutation.isPending}
                        data-testid={`button-restore-${student.id}`}
                      >
                        <RotateCcw size={14} className="mr-1" />
                        Restore
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(student)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-${student.id}`}
                    >
                      <Trash2 size={14} className="mr-1" />
                      Delete All Data
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!resetDialog} onOpenChange={(open) => !open && setResetDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set Temporary Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Temporary password for <span className="font-medium text-foreground">{resetDialog?.studentName}</span>. Student will be forced to change it after login.
            </p>
            <Input type="password" value={temporaryPassword} onChange={(e) => setTemporaryPassword(e.target.value)} placeholder="Minimum 6 characters" />
            <Button className="w-full" disabled={temporaryPassword.length < 6 || resolveResetMutation.isPending} onClick={() => resetDialog && resolveResetMutation.mutate({ id: resetDialog.id, temporaryPassword })}>
              Set Temporary Password
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
