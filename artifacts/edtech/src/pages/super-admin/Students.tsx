import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle,
  Clock,
  Eye,
  RotateCcw,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { StudentProfileInsightsPanel, type StudentProfileInsights } from "@/components/student/StudentProfileInsightsPanel";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface User {
  id: number;
  username: string;
  fullName: string;
  email: string;
  phone?: string;
  status: string;
  onboardingComplete?: boolean;
  subject?: string | null;
  approvedById?: number | null;
  approvedAt?: string | null;
  createdAt: string;
  approverName?: string;
  rejectionReason?: string | null;
  profileDetails?: {
    preparation?: {
      targetExam?: string | null;
    } | null;
  } | null;
}

function getStatusVariant(status: string): "default" | "outline" | "destructive" | "secondary" {
  if (status === "approved" || status === "active") return "default";
  if (status === "pending") return "outline";
  return "destructive";
}

function getStatusIcon(status: string) {
  if (status === "approved" || status === "active") return <CheckCircle size={14} className="text-green-500" />;
  if (status === "pending") return <Clock size={14} className="text-yellow-500" />;
  return <XCircle size={14} className="text-red-500" />;
}

function getStudentTargetExam(student: User) {
  return student.profileDetails?.preparation?.targetExam?.trim() || student.subject?.trim() || "";
}

export default function SuperAdminStudents() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedStudent, setSelectedStudent] = useState<User | null>(null);
  const [rejectionDialog, setRejectionDialog] = useState<User | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const { data: students = [], isLoading: isStudentsLoading } = useQuery<User[]>({
    queryKey: ["sa-students-with-approvers"],
    queryFn: async () => {
      const [studentsRes, adminsRes] = await Promise.all([
        fetch(`${BASE}/api/users?role=student`, { credentials: "include" }),
        fetch(`${BASE}/api/users?role=admin`, { credentials: "include" }),
      ]);
      const studentsData: User[] = await studentsRes.json();
      const adminsData: User[] = await adminsRes.json();
      const adminMap: Record<number, string> = {};
      for (const admin of adminsData) adminMap[admin.id] = admin.fullName;
      return studentsData.map((student) => ({
        ...student,
        approverName: student.approvedById ? (adminMap[student.approvedById] ?? `Admin #${student.approvedById}`) : undefined,
      }));
    },
  });

  const studentInsightsQuery = useQuery<StudentProfileInsights>({
    queryKey: ["sa-student-insights", selectedStudent?.id],
    enabled: !!selectedStudent,
    queryFn: async () => {
      const response = await fetch(`${BASE}/api/users/${selectedStudent?.id}/profile-insights`, { credentials: "include" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to load student profile");
      }
      return response.json();
    },
    staleTime: 30_000,
  });

  const refreshStudents = () => {
    queryClient.invalidateQueries({ queryKey: ["sa-students-with-approvers"] });
    queryClient.invalidateQueries({ queryKey: ["sa-student-insights"] });
  };

  const revokeMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const response = await fetch(`${BASE}/api/users/${id}/approve`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected", reason }),
      });
      if (!response.ok) throw new Error("Failed to revoke access");
    },
    onSuccess: () => {
      refreshStudents();
      setRejectionDialog(null);
      setRejectionReason("");
      toast({ title: "Application rejected", description: "Student can review the reason and resubmit." });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`${BASE}/api/users/${id}/approve`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      });
      if (!response.ok) throw new Error("Failed to restore access");
    },
    onSuccess: () => {
      refreshStudents();
      toast({ title: "Access restored", description: "Student can log in again." });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`${BASE}/api/users/${id}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to delete student");
      }
    },
    onSuccess: (_, deletedId) => {
      if (selectedStudent?.id === deletedId) setSelectedStudent(null);
      refreshStudents();
      toast({ title: "Student deleted", description: "Student account and all related data were permanently removed." });
    },
    onError: (error: Error) => {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    },
  });

  const reviewableStudents = students.filter((student) => student.onboardingComplete === true);
  const pending = reviewableStudents.filter((student) => student.status === "pending");
  const approved = reviewableStudents.filter((student) => student.status === "approved");

  const handleDelete = (student: User) => {
    if (!confirm(`Delete ${student.fullName} permanently? This will remove all data related to this student.`)) return;
    deleteMutation.mutate(student.id);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">All Students</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Super admin view for approvals, recovery, and deep student profile insights.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
              <Users size={18} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-2xl font-bold" data-testid="stat-total-students">{reviewableStudents.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-50">
              <Clock size={18} className="text-yellow-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="text-2xl font-bold" data-testid="stat-pending-students">{pending.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50">
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
          <CardTitle className="text-base">Student List</CardTitle>
        </CardHeader>
        <CardContent>
          {isStudentsLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, index) => (
                <div key={index} className="h-16 rounded bg-muted animate-pulse" />
              ))}
            </div>
          ) : reviewableStudents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No students registered yet.</p>
          ) : (
            <div className="space-y-2">
              {reviewableStudents.map((student) => (
                <div
                  key={student.id}
                  className="flex flex-col gap-3 rounded-lg border border-border p-4 xl:flex-row xl:items-start xl:justify-between"
                  data-testid={`student-row-${student.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{student.fullName}</p>
                      <Badge variant={getStatusVariant(student.status)} className="flex items-center gap-1.5 capitalize">
                        {getStatusIcon(student.status)}
                        {student.status}
                      </Badge>
                      {getStudentTargetExam(student) && (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                          {getStudentTargetExam(student)}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      @{student.username} · {student.email}{student.phone ? ` · ${student.phone}` : ""}
                    </p>
                    {student.rejectionReason && (
                      <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        Reason: {student.rejectionReason}
                      </p>
                    )}
                    {student.status === "approved" && student.approverName && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-green-700" data-testid={`approver-${student.id}`}>
                        <ShieldCheck size={11} />
                        Approved by <strong>{student.approverName}</strong>
                        {student.approvedAt && (
                          <span className="font-normal text-muted-foreground">
                            · {format(new Date(student.approvedAt), "MMM d, yyyy")}
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                      onClick={() => setSelectedStudent(student)}
                    >
                      <Eye size={14} className="mr-1" />
                      View Profile
                    </Button>

                    {student.status === "approved" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => {
                          setRejectionDialog(student);
                          setRejectionReason(student.rejectionReason ?? "");
                        }}
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
                        className="text-green-600 hover:bg-green-50 hover:text-green-700"
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
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
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

      <Dialog
        open={!!rejectionDialog}
        onOpenChange={(open) => {
          if (!open) {
            setRejectionDialog(null);
            setRejectionReason("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject application</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Student ko rejection reason dashboard par dikhega aur same reason email se bhi jayega.
            </p>
            <Textarea
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              rows={4}
              placeholder="Why is this application being rejected?"
            />
            <Button
              className="w-full bg-rose-600 hover:bg-rose-700"
              disabled={rejectionReason.trim().length < 5 || revokeMutation.isPending || !rejectionDialog}
              onClick={() =>
                rejectionDialog && revokeMutation.mutate({
                  id: rejectionDialog.id,
                  reason: rejectionReason.trim(),
                })
              }
            >
              Submit rejection
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedStudent} onOpenChange={(open) => !open && setSelectedStudent(null)}>
        <DialogContent className="max-w-[min(96vw,72rem)] overflow-hidden p-0">
          <DialogHeader className="border-b bg-gradient-to-r from-amber-50 via-white to-orange-50 px-6 py-5">
            <DialogTitle className="flex flex-wrap items-center gap-2 text-xl">
              <span>Student profile insights</span>
              {selectedStudent && (
                <Badge variant="secondary" className="bg-white text-amber-700 hover:bg-white">
                  @{selectedStudent.username}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[calc(100dvh-7rem)] overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
            {studentInsightsQuery.isLoading ? (
              <div className="space-y-4">
                <div className="h-52 animate-pulse rounded-3xl bg-muted" />
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="h-72 animate-pulse rounded-3xl bg-muted" />
                  <div className="h-72 animate-pulse rounded-3xl bg-muted" />
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="h-80 animate-pulse rounded-3xl bg-muted" />
                  <div className="h-80 animate-pulse rounded-3xl bg-muted" />
                </div>
              </div>
            ) : studentInsightsQuery.isError ? (
              <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-muted-foreground">
                {studentInsightsQuery.error instanceof Error ? studentInsightsQuery.error.message : "Could not load student profile."}
              </div>
            ) : studentInsightsQuery.data ? (
              <StudentProfileInsightsPanel
                insights={studentInsightsQuery.data}
                viewerLabel="Super admin review"
                mode={selectedStudent?.status === "pending" ? "submittedOnly" : "full"}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
