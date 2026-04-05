import { useListUsers, useApproveStudent, getListUsersQueryKey } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Clock, Users, ShieldOff, RotateCcw, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function AdminStudents() {
  const { data: students = [], isLoading } = useListUsers({ role: "student" });
  const approveStudent = useApproveStudent();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const deleteStudentMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${BASE}/api/users/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) {
        const payload = await r.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to delete student");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey({ role: "student" }) });
      toast({ title: "Student deleted", description: "Student account and all related data were permanently removed." });
    },
    onError: (err: Error) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const pendingStudents = students.filter((s) => s.status === "pending");
  const otherStudents = students.filter((s) => s.status !== "pending");

  const handleApprove = (id: number, name: string) => {
    approveStudent.mutate({ id, data: { status: "approved" } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey({ role: "student" }) });
        toast({ title: "Student approved", description: `${name} can now log in.` });
      },
    });
  };

  const handleReject = (id: number, name: string) => {
    if (!confirm(`Reject ${name}'s registration?`)) return;
    approveStudent.mutate({ id, data: { status: "rejected" } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey({ role: "student" }) });
        toast({ title: "Student rejected" });
      },
    });
  };

  const handleRevoke = (id: number, name: string) => {
    if (!confirm(`Revoke access for ${name}? They will no longer be able to log in.`)) return;
    approveStudent.mutate({ id, data: { status: "rejected" } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey({ role: "student" }) });
        toast({ title: "Access revoked", description: `${name} can no longer log in.` });
      },
    });
  };

  const handleRestore = (id: number, name: string) => {
    approveStudent.mutate({ id, data: { status: "approved" } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey({ role: "student" }) });
        toast({ title: "Access restored", description: `${name} can log in again.` });
      },
    });
  };

  const handleDeleteAllData = (id: number, name: string) => {
    if (!confirm(`Delete ${name} permanently? This will remove the student account and all related data.`)) return;
    deleteStudentMutation.mutate(id);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Student Approvals</h1>
        <p className="text-muted-foreground text-sm mt-1">Approve or reject student registration requests</p>
      </div>

      {/* Pending Approvals */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock size={16} className="text-yellow-500" />
            Pending Approvals ({pendingStudents.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}
            </div>
          ) : pendingStudents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending approvals. All students are processed.</p>
          ) : (
            <div className="space-y-3">
              {pendingStudents.map((student) => (
                <div key={student.id} className="flex items-center justify-between p-3 rounded-lg bg-yellow-50 border border-yellow-100" data-testid={`pending-student-${student.id}`}>
                  <div>
                    <p className="font-medium text-sm">{student.fullName}</p>
                    <p className="text-xs text-muted-foreground">@{student.username} · {student.email}</p>
                    {student.subject && (
                      <p className="text-xs text-muted-foreground mt-1">Target exam: {student.subject}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleApprove(student.id, student.fullName)}
                      disabled={approveStudent.isPending}
                      data-testid={`button-approve-${student.id}`}
                    >
                      <CheckCircle size={14} className="mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleReject(student.id, student.fullName)}
                      disabled={approveStudent.isPending}
                      data-testid={`button-reject-${student.id}`}
                    >
                      <XCircle size={14} className="mr-1" />
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* All Students */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users size={16} className="text-primary" />
            All Students ({students.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-muted rounded animate-pulse" />)}
            </div>
          ) : students.length === 0 ? (
            <p className="text-sm text-muted-foreground">No students registered yet.</p>
          ) : (
            <div className="space-y-2">
              {students.map((student) => (
                <div key={student.id} className="flex items-center justify-between p-3 rounded-lg border border-border" data-testid={`student-row-${student.id}`}>
                  <div>
                    <p className="text-sm font-medium">{student.fullName}</p>
                    <p className="text-xs text-muted-foreground">@{student.username} · {student.email}</p>
                    {student.subject && (
                      <p className="text-xs text-muted-foreground mt-1">Target exam: {student.subject}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={student.status === "approved" ? "default" : student.status === "pending" ? "outline" : "destructive"}>
                      {student.status}
                    </Badge>
                    {student.status === "approved" && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleRevoke(student.id, student.fullName)}
                          disabled={approveStudent.isPending}
                          data-testid={`button-revoke-${student.id}`}
                        >
                          <ShieldOff size={14} className="mr-1" />
                          Revoke
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteAllData(student.id, student.fullName)}
                          disabled={deleteStudentMutation.isPending}
                          data-testid={`button-delete-${student.id}`}
                        >
                          <Trash2 size={14} className="mr-1" />
                          Delete All Data
                        </Button>
                      </>
                    )}
                    {student.status === "rejected" && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-green-600 hover:text-green-700 hover:bg-green-50"
                          onClick={() => handleRestore(student.id, student.fullName)}
                          disabled={approveStudent.isPending}
                          data-testid={`button-restore-${student.id}`}
                        >
                          <RotateCcw size={14} className="mr-1" />
                          Restore
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteAllData(student.id, student.fullName)}
                          disabled={deleteStudentMutation.isPending}
                          data-testid={`button-delete-${student.id}`}
                        >
                          <Trash2 size={14} className="mr-1" />
                          Delete All Data
                        </Button>
                      </>
                    )}
                    {student.status === "pending" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteAllData(student.id, student.fullName)}
                        disabled={deleteStudentMutation.isPending}
                        data-testid={`button-delete-${student.id}`}
                      >
                        <Trash2 size={14} className="mr-1" />
                        Delete All Data
                      </Button>
                    )}
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
