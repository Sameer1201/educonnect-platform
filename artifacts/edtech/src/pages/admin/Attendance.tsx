import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { UserCheck, CheckCircle2, XCircle, Clock, Save } from "lucide-react";

type Status = "present" | "absent" | "late";

interface Student { id: number; fullName: string; username: string }
interface ClassSimple { id: number; title: string }

export default function AdminAttendance() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [classId, setClassId] = useState<string>("");
  const [date, setDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [marks, setMarks] = useState<Record<number, Status>>({});
  const [saving, setSaving] = useState(false);

  const { data: classes = [] } = useQuery<ClassSimple[]>({
    queryKey: ["admin-classes-simple"],
    queryFn: () => api.get("/classes").then((data) => data.map((c: any) => ({ id: c.id, title: c.title }))),
  });

  const { data: attendanceData, isLoading } = useQuery<{ students: Student[]; dates: string[]; records: any[] }>({
    queryKey: ["attendance-class", classId, date],
    queryFn: () => api.get(`/attendance/class/${classId}?date=${date}`),
    enabled: !!classId,
  });

  useEffect(() => {
    if (!attendanceData) return;
    const existingMarks: Record<number, Status> = {};
    for (const r of attendanceData.records) {
      if (r.date === date) existingMarks[r.studentId] = r.status as Status;
    }
    setMarks(existingMarks);
  }, [attendanceData, date]);

  function toggle(studentId: number, status: Status) {
    setMarks((m) => ({ ...m, [studentId]: m[studentId] === status ? "absent" : status }));
  }

  function markAll(status: Status) {
    const newMarks: Record<number, Status> = {};
    for (const s of (attendanceData?.students ?? [])) newMarks[s.id] = status;
    setMarks(newMarks);
  }

  async function saveAttendance() {
    if (!classId || !date) return;
    const students = attendanceData?.students ?? [];
    const records = students.map((s) => ({ studentId: s.id, status: marks[s.id] ?? "absent" }));
    if (records.length === 0) return;
    setSaving(true);
    try {
      await api.post(`/attendance/class/${classId}/mark`, { date, records });
      toast({ title: `Attendance saved for ${format(new Date(date), "MMM d, yyyy")}` });
      qc.invalidateQueries({ queryKey: ["attendance-class", classId, date] });
    } catch {
      toast({ title: "Failed to save attendance", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const students = attendanceData?.students ?? [];
  const present = students.filter((s) => marks[s.id] === "present").length;
  const late = students.filter((s) => marks[s.id] === "late").length;
  const absent = students.filter((s) => (marks[s.id] ?? "absent") === "absent").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Attendance</h1>
        <p className="text-sm text-muted-foreground">Mark student attendance per class session</p>
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="mb-1.5 block">Select Class</Label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger><SelectValue placeholder="Choose a class..." /></SelectTrigger>
                <SelectContent>
                  {classes.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={format(new Date(), "yyyy-MM-dd")} />
            </div>
          </div>
        </CardContent>
      </Card>

      {classId && (
        <>
          {isLoading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-muted animate-pulse rounded" />)}</div>
          ) : students.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No students enrolled in this class.</CardContent></Card>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 justify-between">
                <div className="flex gap-2">
                  <Badge className="bg-green-500 hover:bg-green-500">{present} Present</Badge>
                  <Badge className="bg-yellow-500 hover:bg-yellow-500">{late} Late</Badge>
                  <Badge variant="destructive">{absent} Absent</Badge>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => markAll("present")}>All Present</Button>
                  <Button variant="outline" size="sm" onClick={() => markAll("absent")}>All Absent</Button>
                  <Button size="sm" onClick={saveAttendance} disabled={saving}>
                    <Save size={14} className="mr-1" /> {saving ? "Saving..." : "Save Attendance"}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                {students.map((student) => {
                  const status = marks[student.id] ?? "absent";
                  return (
                    <Card key={student.id}>
                      <CardContent className="p-4 flex items-center justify-between gap-4">
                        <div>
                          <p className="font-medium">{student.fullName}</p>
                          <p className="text-xs text-muted-foreground">@{student.username}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setMarks((m) => ({ ...m, [student.id]: "present" }))}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                              status === "present"
                                ? "bg-green-500 text-white border-green-500"
                                : "border-border text-muted-foreground hover:border-green-300"
                            }`}
                          >
                            <CheckCircle2 size={14} /> Present
                          </button>
                          <button
                            onClick={() => setMarks((m) => ({ ...m, [student.id]: "late" }))}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                              status === "late"
                                ? "bg-yellow-500 text-white border-yellow-500"
                                : "border-border text-muted-foreground hover:border-yellow-300"
                            }`}
                          >
                            <Clock size={14} /> Late
                          </button>
                          <button
                            onClick={() => setMarks((m) => ({ ...m, [student.id]: "absent" }))}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                              status === "absent"
                                ? "bg-red-500 text-white border-red-500"
                                : "border-border text-muted-foreground hover:border-red-300"
                            }`}
                          >
                            <XCircle size={14} /> Absent
                          </button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
