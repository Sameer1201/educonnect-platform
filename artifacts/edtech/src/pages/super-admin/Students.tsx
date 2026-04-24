import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle,
  Clock,
  Lock,
  LockOpen,
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
import type { StudentProfileInsights } from "@/components/student/StudentProfileInsightsPanel";
import { StudentVerificationReviewDialog } from "@/components/student/StudentVerificationReviewDialog";
import { formatExamDisplayName } from "@/lib/exam-display";

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
  avatarUrl?: string | null;
  approverName?: string;
  rejectionReason?: string | null;
  profileDetails?: {
    preparation?: {
      targetExam?: string | null;
    } | null;
  } | null;
  studentFeatureAccess?: {
    testsLocked?: boolean;
    questionBankLocked?: boolean;
  } | null;
}

function getStudentTargetExam(student: User) {
  return formatExamDisplayName(student.profileDetails?.preparation?.targetExam?.trim() || student.subject?.trim()) || "";
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getStatusMarker(status: string) {
  if (status === "approved" || status === "active") {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <CheckCircle size={15} />
      </span>
    );
  }

  if (status === "pending") {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-50 text-amber-600">
        <Clock size={15} />
      </span>
    );
  }

  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-rose-50 text-rose-600">
      <XCircle size={15} />
    </span>
  );
}

async function fetchStudentInsights(studentId: number) {
  const response = await fetch(`${BASE}/api/users/${studentId}/profile-insights`, { credentials: "include" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? "Failed to load student profile");
  }
  return response.json() as Promise<StudentProfileInsights>;
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
    queryFn: () => fetchStudentInsights(selectedStudent!.id),
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

  const featureAccessMutation = useMutation({
    mutationFn: async ({
      id,
      testsLocked,
      questionBankLocked,
    }: {
      id: number;
      testsLocked?: boolean;
      questionBankLocked?: boolean;
    }) => {
      const response = await fetch(`${BASE}/api/users/${id}/student-feature-access`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(testsLocked !== undefined ? { testsLocked } : {}),
          ...(questionBankLocked !== undefined ? { questionBankLocked } : {}),
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to update student access");
      }
      return response.json() as Promise<User>;
    },
    onSuccess: (updatedStudent, variables) => {
      refreshStudents();
      if (selectedStudent?.id === updatedStudent.id) setSelectedStudent(updatedStudent);
      toast({
        title: "Student access updated",
        description:
          variables.testsLocked !== undefined
            ? variables.testsLocked
              ? "Tests are now locked for this student."
              : "Tests are unlocked again for this student."
            : variables.questionBankLocked
              ? "Question bank is now locked for this student."
              : "Question bank is unlocked again for this student.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Could not update access", description: error.message, variant: "destructive" });
    },
  });

  const reviewableStudents = students.filter((student) => student.onboardingComplete === true);
  const pending = reviewableStudents.filter((student) => student.status === "pending");
  const approved = reviewableStudents.filter((student) => student.status === "approved");

  const prefetchStudentInsights = (studentId: number) => {
    void queryClient.prefetchQuery({
      queryKey: ["sa-student-insights", studentId],
      queryFn: () => fetchStudentInsights(studentId),
      staleTime: 30_000,
    });
  };

  const openStudentReview = (student: User) => {
    prefetchStudentInsights(student.id);
    setSelectedStudent(student);
  };

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
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <button
                      type="button"
                      className="shrink-0 rounded-full transition hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-amber-300"
                      onMouseEnter={() => prefetchStudentInsights(student.id)}
                      onFocus={() => prefetchStudentInsights(student.id)}
                      onClick={() => openStudentReview(student)}
                      aria-label={`Open ${student.fullName} profile`}
                    >
                      <Avatar className="h-12 w-12 border border-amber-200 ring-2 ring-amber-50">
                        <AvatarImage src={student.avatarUrl ?? undefined} alt={student.fullName} />
                        <AvatarFallback className="bg-gradient-to-br from-amber-500 to-orange-600 text-sm font-bold text-white">
                          {getInitials(student.fullName)}
                        </AvatarFallback>
                      </Avatar>
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{student.fullName}</p>
                        {getStatusMarker(student.status)}
                      </div>
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
                  </div>

                  <div className="flex flex-wrap items-center gap-2 xl:justify-end">
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
        <DialogContent className="max-w-[min(calc(100vw-0.75rem),28rem)]">
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

      <StudentVerificationReviewDialog
        open={!!selectedStudent}
        onOpenChange={(open) => {
          if (!open) setSelectedStudent(null);
        }}
        student={
          selectedStudent
            ? {
                fullName: selectedStudent.fullName,
                username: selectedStudent.username,
                status: selectedStudent.status,
                onboardingComplete: selectedStudent.onboardingComplete,
                rejectionReason: selectedStudent.rejectionReason,
                targetExam: getStudentTargetExam(selectedStudent),
                email: selectedStudent.email,
              }
            : null
        }
        insights={studentInsightsQuery.data}
        isLoading={studentInsightsQuery.isLoading}
        errorMessage={studentInsightsQuery.isError ? (studentInsightsQuery.error instanceof Error ? studentInsightsQuery.error.message : "Could not load student profile.") : null}
        onPrimaryAction={
          selectedStudent?.status === "pending"
            ? () => restoreMutation.mutate(selectedStudent.id)
            : undefined
        }
        onSecondaryAction={
          selectedStudent?.status === "pending"
            ? () => {
                setRejectionDialog(selectedStudent);
                setRejectionReason(selectedStudent.rejectionReason ?? "");
              }
            : undefined
        }
        primaryActionLabel="Approve"
        secondaryActionLabel="Reject"
        primaryActionDisabled={restoreMutation.isPending}
        secondaryActionDisabled={revokeMutation.isPending}
        settingsContent={
          selectedStudent ? (
            <div className="space-y-5">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Student Settings</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Manage student access and account-level actions from here.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {selectedStudent.status === "approved" ? (
                  <Button
                    variant="outline"
                    className={selectedStudent.studentFeatureAccess?.testsLocked
                      ? "justify-between border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                      : "justify-between border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"}
                    onClick={() => featureAccessMutation.mutate({
                      id: selectedStudent.id,
                      testsLocked: !Boolean(selectedStudent.studentFeatureAccess?.testsLocked),
                    })}
                    disabled={featureAccessMutation.isPending}
                    data-testid={`button-lock-tests-${selectedStudent.id}`}
                  >
                    <span className="inline-flex items-center gap-2">
                      {selectedStudent.studentFeatureAccess?.testsLocked ? <LockOpen size={15} /> : <Lock size={15} />}
                      {selectedStudent.studentFeatureAccess?.testsLocked ? "Unlock Tests" : "Lock Tests"}
                    </span>
                  </Button>
                ) : null}

                {selectedStudent.status === "approved" ? (
                  <Button
                    variant="outline"
                    className={selectedStudent.studentFeatureAccess?.questionBankLocked
                      ? "justify-between border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                      : "justify-between border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"}
                    onClick={() => featureAccessMutation.mutate({
                      id: selectedStudent.id,
                      questionBankLocked: !Boolean(selectedStudent.studentFeatureAccess?.questionBankLocked),
                    })}
                    disabled={featureAccessMutation.isPending}
                    data-testid={`button-lock-question-bank-${selectedStudent.id}`}
                  >
                    <span className="inline-flex items-center gap-2">
                      {selectedStudent.studentFeatureAccess?.questionBankLocked ? <LockOpen size={15} /> : <Lock size={15} />}
                      {selectedStudent.studentFeatureAccess?.questionBankLocked ? "Unlock QBank" : "Lock QBank"}
                    </span>
                  </Button>
                ) : null}

                {selectedStudent.status === "rejected" ? (
                  <Button
                    variant="outline"
                    className="justify-between border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                    onClick={() => restoreMutation.mutate(selectedStudent.id)}
                    disabled={restoreMutation.isPending}
                    data-testid={`button-restore-${selectedStudent.id}`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <RotateCcw size={15} />
                      Restore Access
                    </span>
                  </Button>
                ) : null}

                <Button
                  variant="outline"
                  className="justify-between border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"
                  onClick={() => handleDelete(selectedStudent)}
                  disabled={deleteMutation.isPending}
                  data-testid={`button-delete-${selectedStudent.id}`}
                >
                  <span className="inline-flex items-center gap-2">
                    <Trash2 size={15} />
                    Delete All Data
                  </span>
                </Button>
              </div>
            </div>
          ) : null
        }
      />
    </div>
  );
}
