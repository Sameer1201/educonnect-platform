import { useState } from "react";
import {
  getListUsersQueryKey,
  useApproveStudent,
  useListUsers,
  type User,
} from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isSameDay, startOfDay, subDays } from "date-fns";
import {
  Activity,
  Ban,
  Calendar,
  CheckCircle2,
  Clock,
  GraduationCap,
  KeyRound,
  Mail,
  RotateCcw,
  Search,
  ShieldOff,
  Trash2,
  TrendingUp,
  UserCheck,
  UserX,
  XCircle,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type StudentUiStatus = "pending" | "approved" | "revoked";

interface StudentViewModel {
  id: number;
  name: string;
  username: string;
  email: string;
  targetExam: string;
  status: StudentUiStatus;
  avatarInitials: string;
  joinedAt: string;
  createdAt: string;
}

interface PasswordResetRequest {
  id: number;
  requestedUsername: string;
  requestedEmail: string;
  status: string;
  createdAt: string;
}

const COLORS = {
  approved: "#6366f1",
  pending: "#f59e0b",
  revoked: "#f43f5e",
} as const;

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function toStudentUiStatus(status: User["status"]): StudentUiStatus {
  if (status === "pending") return "pending";
  if (status === "rejected") return "revoked";
  return "approved";
}

function buildStudentViewModel(student: User): StudentViewModel {
  return {
    id: student.id,
    name: student.fullName,
    username: `@${student.username}`,
    email: student.email,
    targetExam: student.subject?.trim() || "Not set",
    status: toStudentUiStatus(student.status),
    avatarInitials: getInitials(student.fullName || student.username),
    joinedAt: format(new Date(student.createdAt), "MMM d, yyyy"),
    createdAt: student.createdAt,
  };
}

function buildWeeklyRegistrationData(students: User[]) {
  const today = startOfDay(new Date());

  return Array.from({ length: 7 }, (_, index) => {
    const day = subDays(today, 6 - index);
    return {
      day: format(day, "EEE"),
      students: students.filter((student) => isSameDay(new Date(student.createdAt), day)).length,
    };
  });
}

function renderLoadingCard() {
  return <div className="h-36 rounded-2xl border border-slate-100 bg-white shadow-sm animate-pulse" />;
}

export default function AdminStudents() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: studentRecords = [], isLoading } = useListUsers({ role: "student" });
  const { data: resetRequests = [], isLoading: isResetLoading } = useQuery<PasswordResetRequest[]>({
    queryKey: ["admin-password-reset-requests"],
    queryFn: async () => {
      const response = await fetch(`${BASE}/api/password-reset-requests`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load reset requests");
      return response.json();
    },
  });
  const approveStudent = useApproveStudent();
  const deleteStudentMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`${BASE}/api/users/${id}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to delete student");
      }
    },
    onError: (error: Error) => {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    },
  });
  const resolveResetMutation = useMutation({
    mutationFn: async ({ id, temporaryPassword }: { id: number; temporaryPassword: string }) => {
      const response = await fetch(`${BASE}/api/password-reset-requests/${id}/resolve`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ temporaryPassword }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to set temporary password");
      }
      return response.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-password-reset-requests"] });
      toast({
        title: "Temporary password set",
        description: "Student must change it after the next login.",
      });
      setResetDialog(null);
      setTemporaryPassword("");
    },
    onError: (error: Error) => {
      toast({ title: "Reset failed", description: error.message, variant: "destructive" });
    },
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<StudentViewModel | null>(null);
  const [resetDialog, setResetDialog] = useState<PasswordResetRequest | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState("");

  const students = studentRecords.map(buildStudentViewModel);
  const pendingApprovals = students.filter((student) => student.status === "pending");
  const managedStudents = students.filter((student) => student.status !== "pending");
  const approvedCount = managedStudents.filter((student) => student.status === "approved").length;
  const revokedCount = managedStudents.filter((student) => student.status === "revoked").length;
  const pendingCount = pendingApprovals.length;
  const totalPopulation = managedStudents.length + pendingCount || 1;
  const openResetRequests = resetRequests.filter((request) => request.status === "open");
  const weeklyRegistrationData = buildWeeklyRegistrationData(studentRecords);

  const filteredStudents = managedStudents.filter((student) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      student.name.toLowerCase().includes(query) ||
      student.email.toLowerCase().includes(query) ||
      student.username.toLowerCase().includes(query) ||
      student.targetExam.toLowerCase().includes(query)
    );
  });

  const donutData = [
    { name: "Approved", value: approvedCount || 0.001, color: COLORS.approved },
    { name: "Pending", value: pendingCount || 0.001, color: COLORS.pending },
    { name: "Revoked", value: revokedCount || 0.001, color: COLORS.revoked },
  ];

  const refreshStudentData = () => {
    void queryClient.invalidateQueries({ queryKey: getListUsersQueryKey({ role: "student" }) });
  };

  const handleStudentStatusChange = (
    student: StudentViewModel,
    status: "approved" | "rejected",
    title: string,
    description?: string,
  ) => {
    approveStudent.mutate(
      { id: student.id, data: { status } },
      {
        onSuccess: () => {
          refreshStudentData();
          toast({ title, description });
        },
        onError: (error: Error) => {
          toast({ title: "Update failed", description: error.message, variant: "destructive" });
        },
      },
    );
  };

  const handleDeleteStudent = (student: StudentViewModel) => {
    deleteStudentMutation.mutate(student.id, {
      onSuccess: () => {
        refreshStudentData();
        void queryClient.invalidateQueries({ queryKey: ["admin-password-reset-requests"] });
        if (selectedStudent?.id === student.id) {
          setSelectedStudent(null);
        }
        toast({
          title: "Student removed",
          description: "All student data has been permanently deleted.",
        });
      },
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index}>{renderLoadingCard()}</div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            <div className="h-80 rounded-2xl border border-slate-100 bg-white shadow-sm animate-pulse" />
            <div className="h-48 rounded-2xl border border-slate-100 bg-white shadow-sm animate-pulse" />
          </div>
          <div className="space-y-5">
            <div className="h-72 rounded-2xl border border-slate-100 bg-white shadow-sm animate-pulse" />
            <div className="h-56 rounded-2xl border border-slate-100 bg-white shadow-sm animate-pulse" />
          </div>
        </div>
        <div className="h-[32rem] rounded-2xl border border-slate-100 bg-white shadow-sm animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Students</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center">
              <GraduationCap className="w-4 h-4 text-indigo-500" />
            </div>
          </div>
          <div>
            <p className="text-3xl font-black text-slate-900">{managedStudents.length}</p>
            <p className="text-xs text-slate-400 mt-0.5">enrolled</p>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full" style={{ width: "100%" }} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Approved</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
          </div>
          <div>
            <p className="text-3xl font-black text-slate-900">{approvedCount}</p>
            <p className="text-xs text-slate-400 mt-0.5">active access</p>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${(approvedCount / totalPopulation) * 100}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
          </div>
          <div>
            <p className="text-3xl font-black text-slate-900">{pendingCount}</p>
            <p className="text-xs text-slate-400 mt-0.5">awaiting review</p>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400 rounded-full transition-all"
              style={{ width: `${(pendingCount / totalPopulation) * 100}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Reset Requests</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center">
              <KeyRound className="w-4 h-4 text-rose-500" />
            </div>
          </div>
          <div>
            <p className="text-3xl font-black text-slate-900">{openResetRequests.length}</p>
            <p className="text-xs text-slate-400 mt-0.5">password requests</p>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-rose-400 rounded-full"
              style={{ width: openResetRequests.length > 0 ? "60%" : "0%" }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        <div className="lg:col-span-2 flex flex-col gap-5">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 pt-5 pb-4 border-b border-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm shadow-indigo-200">
                  <UserCheck className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-800">Student Approvals</h2>
                  <p className="text-xs text-slate-400">Approve or reject registration requests</p>
                </div>
                <div className="ml-auto">
                  <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-600 text-xs font-bold px-2.5 py-1 rounded-full border border-indigo-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                    {pendingCount} pending
                  </span>
                </div>
              </div>
            </div>

            {pendingApprovals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-50 to-indigo-50 border border-indigo-100 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-indigo-300" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-600">All caught up!</p>
                  <p className="text-xs text-slate-400 mt-0.5">No pending approvals right now.</p>
                </div>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {pendingApprovals.map((student) => (
                  <div
                    key={student.id}
                    className="flex items-center gap-3 p-4 rounded-xl bg-indigo-50/40 border border-indigo-100"
                    data-testid={`pending-student-${student.id}`}
                  >
                    <Avatar className="h-10 w-10 ring-2 ring-indigo-200">
                      <AvatarFallback className="bg-indigo-600 text-white font-bold text-sm">
                        {student.avatarInitials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 text-sm">{student.name}</p>
                      <p className="text-xs text-slate-400 truncate">{student.email}</p>
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium mt-1 inline-block">
                        {student.targetExam}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs text-red-500 border-red-200 hover:bg-red-50"
                        onClick={() => handleStudentStatusChange(student, "rejected", "Request rejected")}
                        disabled={approveStudent.isPending}
                        data-testid={`button-reject-${student.id}`}
                      >
                        <XCircle className="w-3.5 h-3.5 mr-1" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                        onClick={() =>
                          handleStudentStatusChange(
                            student,
                            "approved",
                            "Student approved",
                            `${student.name} can now log in.`,
                          )
                        }
                        disabled={approveStudent.isPending}
                        data-testid={`button-approve-${student.id}`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        Approve
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 pt-5 pb-4 border-b border-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm shadow-amber-200">
                  <KeyRound className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-800">Forgot Password Requests</h2>
                  <p className="text-xs text-slate-400">Handle student password reset requests</p>
                </div>
                <div className="ml-auto">
                  <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-600 text-xs font-bold px-2.5 py-1 rounded-full border border-amber-100">
                    {openResetRequests.length} open
                  </span>
                </div>
              </div>
            </div>

            {isResetLoading ? (
              <div className="p-5 space-y-3">
                {Array.from({ length: 2 }, (_, index) => (
                  <div key={index} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : openResetRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center">
                  <KeyRound className="w-6 h-6 text-amber-300" />
                </div>
                <p className="text-xs text-slate-400">No open reset requests.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {openResetRequests.map((request) => (
                  <div key={request.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{request.requestedUsername}</p>
                      <p className="text-xs text-slate-400">{request.requestedEmail}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-8 border-amber-200 text-amber-700 hover:bg-amber-50"
                      onClick={() => setResetDialog(request)}
                    >
                      Set Temporary Password
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-indigo-500" />
              <h3 className="text-sm font-bold text-slate-800">Student Breakdown</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">Status distribution overview</p>
            <div className="h-44 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={76}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {donutData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [value < 0.01 ? 0 : value, name]}
                    contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-black text-slate-800">{managedStudents.length + pendingCount}</span>
                <span className="text-xs text-slate-400">total</span>
              </div>
            </div>
            <div className="flex flex-col gap-2 mt-4">
              {[
                { label: "Approved", count: approvedCount, color: "bg-indigo-500" },
                { label: "Pending", count: pendingCount, color: "bg-amber-400" },
                { label: "Revoked", count: revokedCount, color: "bg-rose-400" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                    <span className="text-xs text-slate-600">{item.label}</span>
                  </div>
                  <span className="text-xs font-bold text-slate-800">{item.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-violet-500" />
              <h3 className="text-sm font-bold text-slate-800">Weekly New Students</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">New registrations this week</p>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyRegistrationData} barSize={10}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip
                    cursor={{ fill: "#f8fafc" }}
                    contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 11 }}
                  />
                  <Bar dataKey="students" fill="url(#barGradient)" radius={[4, 4, 0, 0]} />
                  <defs>
                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0.6} />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-50">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-sm shadow-emerald-200 shrink-0">
              <GraduationCap className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">All Students</h2>
              <p className="text-xs text-slate-400">{managedStudents.length} enrolled students</p>
            </div>
          </div>
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              type="search"
              placeholder="Search by name, email or username..."
              className="pl-9 h-9 text-xs w-full border-slate-200 rounded-xl bg-slate-50 focus:bg-white"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              data-testid="input-search-students"
            />
          </div>
        </div>

        <div className="hidden md:grid md:grid-cols-12 px-6 py-2.5 bg-slate-50 text-xs font-semibold text-slate-400 uppercase tracking-wider">
          <div className="col-span-4">Student</div>
          <div className="col-span-3">Email</div>
          <div className="col-span-2">Target Exam</div>
          <div className="col-span-1 text-center">Status</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        {filteredStudents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center">
              <UserX className="w-6 h-6 text-slate-300" />
            </div>
            <p className="text-sm text-slate-400">
              {searchQuery ? "No students match your search." : "No students enrolled yet."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filteredStudents.map((student, index) => (
              <div key={student.id} data-testid={`row-student-${student.id}`}>
                <div
                  className={`md:hidden px-4 py-4 transition-colors hover:bg-slate-50/60 ${
                    student.status === "revoked" ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2.5">
                    <button onClick={() => setSelectedStudent(student)} className="shrink-0 focus:outline-none">
                      <Avatar className="h-10 w-10 ring-2 ring-offset-1 ring-indigo-100">
                        <AvatarFallback
                          className={`text-sm font-bold ${
                            student.status === "revoked"
                              ? "bg-slate-200 text-slate-500"
                              : index % 2 === 0
                                ? "bg-gradient-to-br from-indigo-500 to-violet-600 text-white"
                                : "bg-gradient-to-br from-emerald-400 to-teal-500 text-white"
                          }`}
                        >
                          {student.avatarInitials}
                        </AvatarFallback>
                      </Avatar>
                    </button>
                    <button
                      onClick={() => setSelectedStudent(student)}
                      className="flex-1 min-w-0 text-left focus:outline-none"
                    >
                      <p className="text-sm font-semibold text-slate-800 leading-tight">{student.name}</p>
                      <p className="text-xs text-slate-400 font-mono">{student.username}</p>
                    </button>
                    {student.status === "approved" ? (
                      <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs bg-rose-50 text-rose-600 border border-rose-200 px-2 py-0.5 rounded-full font-semibold shrink-0">
                        <ShieldOff className="w-3 h-3" />
                        Revoked
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mb-3 pl-1">
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Mail className="w-3 h-3 shrink-0" />
                      <span className="truncate max-w-[180px]">{student.email}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs bg-violet-50 text-violet-700 border border-violet-100 px-2 py-0.5 rounded-lg font-medium">
                      <GraduationCap className="w-3 h-3" />
                      {student.targetExam}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    {student.status === "approved" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-8 text-xs border-orange-200 text-orange-600 hover:bg-orange-50 rounded-lg"
                        onClick={() =>
                          handleStudentStatusChange(
                            student,
                            "rejected",
                            "Access revoked",
                            `${student.name} can no longer log in.`,
                          )
                        }
                        disabled={approveStudent.isPending}
                        data-testid={`button-revoke-${student.id}`}
                      >
                        <Ban className="mr-1 h-3 w-3" />
                        Revoke
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-8 text-xs border-emerald-200 text-emerald-600 hover:bg-emerald-50 rounded-lg"
                        onClick={() =>
                          handleStudentStatusChange(
                            student,
                            "approved",
                            "Access restored",
                            `${student.name} can log in again.`,
                          )
                        }
                        disabled={approveStudent.isPending}
                        data-testid={`button-restore-${student.id}`}
                      >
                        <RotateCcw className="mr-1 h-3 w-3" />
                        Restore
                      </Button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-8 text-xs border-red-200 text-red-500 hover:bg-red-50 rounded-lg"
                          data-testid={`button-delete-${student.id}`}
                        >
                          <Trash2 className="mr-1 h-3 w-3" />
                          Delete All Data
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-2xl border-slate-100 shadow-2xl mx-4">
                        <AlertDialogHeader>
                          <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mb-2 mx-auto">
                            <Trash2 className="w-7 h-7 text-red-400" />
                          </div>
                          <AlertDialogTitle className="text-center text-slate-800">Delete student?</AlertDialogTitle>
                          <AlertDialogDescription className="text-center text-slate-500 text-sm">
                            This permanently removes <span className="font-semibold text-slate-700">{student.name}</span>
                            {" "}and all related data. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="gap-2 mt-2 flex-row">
                          <AlertDialogCancel className="flex-1 rounded-xl">Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeleteStudent(student)}
                            className="flex-1 rounded-xl bg-red-600 hover:bg-red-700 text-white"
                          >
                            Delete All Data
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                <div
                  className={`hidden md:grid md:grid-cols-12 items-center px-6 py-4 hover:bg-slate-50/60 transition-colors ${
                    student.status === "revoked" ? "opacity-60" : ""
                  }`}
                >
                  <div className="col-span-4 flex items-center gap-3">
                    <button
                      onClick={() => setSelectedStudent(student)}
                      className="flex items-center gap-3 focus:outline-none group"
                    >
                      <Avatar className="h-9 w-9 ring-2 ring-offset-1 ring-indigo-100 shrink-0 group-hover:ring-indigo-300 transition-all">
                        <AvatarFallback
                          className={`text-xs font-bold ${
                            student.status === "revoked"
                              ? "bg-slate-200 text-slate-500"
                              : index % 2 === 0
                                ? "bg-gradient-to-br from-indigo-500 to-violet-600 text-white"
                                : "bg-gradient-to-br from-emerald-400 to-teal-500 text-white"
                          }`}
                        >
                          {student.avatarInitials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-slate-800 leading-tight group-hover:text-indigo-600 transition-colors">
                          {student.name}
                        </p>
                        <p className="text-xs text-slate-400 font-mono">{student.username}</p>
                      </div>
                    </button>
                  </div>
                  <div className="col-span-3">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Mail className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                      <span className="truncate">{student.email}</span>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <span className="inline-flex items-center gap-1 text-xs bg-violet-50 text-violet-700 border border-violet-100 px-2.5 py-1 rounded-lg font-medium">
                      <GraduationCap className="w-3 h-3" />
                      {student.targetExam}
                    </span>
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {student.status === "approved" ? (
                      <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs bg-rose-50 text-rose-600 border border-rose-200 px-2 py-0.5 rounded-full font-semibold">
                        <ShieldOff className="w-3 h-3" />
                        Revoked
                      </span>
                    )}
                  </div>
                  <div className="col-span-2 flex items-center justify-end gap-2">
                    {student.status === "approved" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs border-orange-200 text-orange-600 hover:bg-orange-50 hover:border-orange-300 rounded-lg px-3"
                        onClick={() =>
                          handleStudentStatusChange(
                            student,
                            "rejected",
                            "Access revoked",
                            `${student.name} can no longer log in.`,
                          )
                        }
                        disabled={approveStudent.isPending}
                        data-testid={`button-revoke-${student.id}`}
                      >
                        <Ban className="mr-1 h-3 w-3" />
                        Revoke
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-300 rounded-lg px-3"
                        onClick={() =>
                          handleStudentStatusChange(
                            student,
                            "approved",
                            "Access restored",
                            `${student.name} can log in again.`,
                          )
                        }
                        disabled={approveStudent.isPending}
                        data-testid={`button-restore-${student.id}`}
                      >
                        <RotateCcw className="mr-1 h-3 w-3" />
                        Restore
                      </Button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 rounded-lg px-3"
                          data-testid={`button-delete-${student.id}`}
                        >
                          <Trash2 className="mr-1 h-3 w-3" />
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-2xl border-slate-100 shadow-2xl">
                        <AlertDialogHeader>
                          <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mb-2 mx-auto">
                            <Trash2 className="w-7 h-7 text-red-400" />
                          </div>
                          <AlertDialogTitle className="text-center text-slate-800">Delete student?</AlertDialogTitle>
                          <AlertDialogDescription className="text-center text-slate-500 text-sm">
                            This permanently removes <span className="font-semibold text-slate-700">{student.name}</span>
                            {" "}and all related data. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="gap-2 mt-2">
                          <AlertDialogCancel className="flex-1 rounded-xl">Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeleteStudent(student)}
                            className="flex-1 rounded-xl bg-red-600 hover:bg-red-700 text-white"
                          >
                            Delete All Data
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="px-5 py-3 border-t border-slate-50 bg-slate-50/50 flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs text-slate-400">
            Showing {filteredStudents.length} of {managedStudents.length} students
          </p>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-xs text-slate-400">Last updated: just now</span>
          </div>
        </div>
      </div>

      <Dialog open={!!selectedStudent} onOpenChange={(open) => !open && setSelectedStudent(null)}>
        <DialogContent className="rounded-2xl border-slate-100 shadow-2xl max-w-sm mx-4 p-0 overflow-hidden">
          {selectedStudent ? (
            <>
              <div
                className={`px-6 pt-8 pb-6 text-center ${
                  selectedStudent.status === "revoked" ? "bg-slate-100" : "bg-gradient-to-br from-indigo-500 to-violet-600"
                }`}
              >
                <Avatar className="h-16 w-16 mx-auto ring-4 ring-white/30 ring-offset-0 mb-3">
                  <AvatarFallback
                    className={`text-xl font-black ${
                      selectedStudent.status === "revoked" ? "bg-slate-200 text-slate-500" : "bg-white/20 text-white"
                    }`}
                  >
                    {selectedStudent.avatarInitials}
                  </AvatarFallback>
                </Avatar>
                <DialogHeader>
                  <DialogTitle
                    className={`text-base font-bold ${
                      selectedStudent.status === "revoked" ? "text-slate-700" : "text-white"
                    }`}
                  >
                    {selectedStudent.name}
                  </DialogTitle>
                </DialogHeader>
                <p
                  className={`text-xs mt-0.5 font-mono ${
                    selectedStudent.status === "revoked" ? "text-slate-400" : "text-indigo-200"
                  }`}
                >
                  {selectedStudent.username}
                </p>
                <div className="mt-3">
                  {selectedStudent.status === "approved" ? (
                    <span className="inline-flex items-center gap-1.5 text-xs bg-emerald-500 text-white px-3 py-1 rounded-full font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-white" />
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs bg-rose-500 text-white px-3 py-1 rounded-full font-semibold">
                      <ShieldOff className="w-3 h-3" />
                      Revoked
                    </span>
                  )}
                </div>
              </div>

              <div className="px-6 py-5 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                    <Mail className="w-3.5 h-3.5 text-indigo-500" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-medium">Email</p>
                    <p className="text-sm text-slate-800 font-semibold break-all">{selectedStudent.email}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                    <GraduationCap className="w-3.5 h-3.5 text-violet-500" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-medium">Target Exam</p>
                    <p className="text-sm text-slate-800 font-semibold">{selectedStudent.targetExam}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                    <Calendar className="w-3.5 h-3.5 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-medium">Joined</p>
                    <p className="text-sm text-slate-800 font-semibold">{selectedStudent.joinedAt}</p>
                  </div>
                </div>
              </div>

              <div className="px-6 pb-6 flex gap-2">
                {selectedStudent.status === "approved" ? (
                  <Button
                    variant="outline"
                    className="flex-1 h-9 text-xs border-orange-200 text-orange-600 hover:bg-orange-50 rounded-xl"
                    onClick={() => {
                      handleStudentStatusChange(
                        selectedStudent,
                        "rejected",
                        "Access revoked",
                        `${selectedStudent.name} can no longer log in.`,
                      );
                      setSelectedStudent(null);
                    }}
                  >
                    <Ban className="mr-1 h-3.5 w-3.5" />
                    Revoke Access
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="flex-1 h-9 text-xs border-emerald-200 text-emerald-600 hover:bg-emerald-50 rounded-xl"
                    onClick={() => {
                      handleStudentStatusChange(
                        selectedStudent,
                        "approved",
                        "Access restored",
                        `${selectedStudent.name} can log in again.`,
                      );
                      setSelectedStudent(null);
                    }}
                  >
                    <RotateCcw className="mr-1 h-3.5 w-3.5" />
                    Restore Access
                  </Button>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="flex-1 h-9 text-xs border-red-200 text-red-500 hover:bg-red-50 rounded-xl"
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="rounded-2xl mx-4">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-center">Delete student?</AlertDialogTitle>
                      <AlertDialogDescription className="text-center text-sm">
                        Permanently removes <span className="font-semibold text-slate-700">{selectedStudent.name}</span>
                        {" "}and all data.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex-row gap-2">
                      <AlertDialogCancel className="flex-1 rounded-xl">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          handleDeleteStudent(selectedStudent);
                          setSelectedStudent(null);
                        }}
                        className="flex-1 rounded-xl bg-red-600 hover:bg-red-700"
                      >
                        Delete All Data
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetDialog} onOpenChange={(open) => !open && setResetDialog(null)}>
        <DialogContent className="max-w-md rounded-2xl border-slate-100 shadow-2xl">
          <DialogHeader>
            <DialogTitle>Set Temporary Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Temporary password for{" "}
              <span className="font-medium text-slate-900">{resetDialog?.requestedUsername}</span>. The student will be
              forced to change it after the next login.
            </p>
            <Input
              type="password"
              value={temporaryPassword}
              onChange={(event) => setTemporaryPassword(event.target.value)}
              placeholder="Minimum 6 characters"
            />
            <Button
              className="w-full"
              disabled={temporaryPassword.length < 6 || resolveResetMutation.isPending || !resetDialog}
              onClick={() => {
                if (!resetDialog) return;
                resolveResetMutation.mutate({ id: resetDialog.id, temporaryPassword });
              }}
            >
              Set Temporary Password
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
