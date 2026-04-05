import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Plus, Pencil, Trash2, Users, CheckCircle2, Clock, Download, Star
} from "lucide-react";

interface Assignment {
  id: number;
  classId: number;
  title: string;
  description: string | null;
  dueAt: string | null;
  maxMarks: number;
  isPublished: boolean;
  className: string | null;
  submissionCount: number;
  createdAt: string;
}

interface Submission {
  id: number;
  studentId: number;
  fileName: string | null;
  comment: string | null;
  grade: number | null;
  feedback: string | null;
  submittedAt: string;
  gradedAt: string | null;
  student: { id: number; fullName: string; username: string } | null;
}

export default function AdminAssignments() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Assignment | null>(null);
  const [viewSubs, setViewSubs] = useState<Assignment | null>(null);
  const [gradeTarget, setGradeTarget] = useState<{ sub: Submission; assignment: Assignment } | null>(null);
  const [gradeValue, setGradeValue] = useState("");
  const [feedbackValue, setFeedbackValue] = useState("");

  const [form, setForm] = useState({
    classId: "",
    title: "",
    description: "",
    dueAt: "",
    maxMarks: "100",
    isPublished: false,
  });

  const { data: assignments = [], isLoading } = useQuery<Assignment[]>({
    queryKey: ["admin-assignments"],
    queryFn: () => api.get("/assignments"),
  });

  const { data: classes = [] } = useQuery<{ id: number; title: string }[]>({
    queryKey: ["admin-classes-simple"],
    queryFn: () => api.get("/classes").then((data) => data.map((c: any) => ({ id: c.id, title: c.title }))),
  });

  const { data: submissions = [], isLoading: loadingSubs } = useQuery<Submission[]>({
    queryKey: ["assignment-subs", viewSubs?.id],
    queryFn: () => api.get(`/assignments/${viewSubs!.id}/submissions`),
    enabled: !!viewSubs,
  });

  function resetForm(a?: Assignment) {
    setForm({
      classId: a ? String(a.classId) : "",
      title: a?.title ?? "",
      description: a?.description ?? "",
      dueAt: a?.dueAt ? a.dueAt.slice(0, 16) : "",
      maxMarks: String(a?.maxMarks ?? 100),
      isPublished: a?.isPublished ?? false,
    });
  }

  async function saveAssignment() {
    if (!form.classId || !form.title) { toast({ title: "Class and title required", variant: "destructive" }); return; }
    const payload = {
      classId: parseInt(form.classId),
      title: form.title,
      description: form.description || null,
      dueAt: form.dueAt || null,
      maxMarks: parseInt(form.maxMarks) || 100,
      isPublished: form.isPublished,
    };
    try {
      if (editTarget) {
        await api.patch(`/assignments/${editTarget.id}`, payload);
        toast({ title: "Assignment updated" });
        setEditTarget(null);
      } else {
        await api.post("/assignments", payload);
        toast({ title: "Assignment created" });
        setShowCreate(false);
      }
      qc.invalidateQueries({ queryKey: ["admin-assignments"] });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    }
  }

  async function deleteAssignment(id: number) {
    if (!confirm("Delete this assignment?")) return;
    await api.delete(`/assignments/${id}`);
    toast({ title: "Deleted" });
    qc.invalidateQueries({ queryKey: ["admin-assignments"] });
  }

  async function gradeSubmission() {
    if (!gradeTarget) return;
    try {
      await api.patch(`/assignments/${gradeTarget.assignment.id}/submissions/${gradeTarget.sub.id}/grade`, {
        grade: gradeValue !== "" ? parseInt(gradeValue) : null,
        feedback: feedbackValue || null,
      });
      toast({ title: "Grade saved" });
      qc.invalidateQueries({ queryKey: ["assignment-subs", gradeTarget.assignment.id] });
      setGradeTarget(null);
    } catch {
      toast({ title: "Failed to grade", variant: "destructive" });
    }
  }

  async function downloadFile(assignmentId: number, subId: number, fileName: string) {
    try {
      const r = await api.get(`/assignments/${assignmentId}/submissions/${subId}/file`);
      const { fileData, fileName: fn } = r;
      const a = document.createElement("a");
      a.href = fileData;
      a.download = fn ?? fileName;
      a.click();
    } catch {
      toast({ title: "Failed to download", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Assignments</h1>
          <p className="text-sm text-muted-foreground">{assignments.length} total</p>
        </div>
        <Button onClick={() => { resetForm(); setShowCreate(true); }}>
          <Plus size={16} className="mr-2" /> Create Assignment
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />)}</div>
      ) : assignments.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">No assignments yet. Create one to get started.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => (
            <Card key={a.id}>
              <CardContent className="p-5 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="font-semibold">{a.title}</h3>
                    {a.className && <Badge variant="outline" className="text-xs">{a.className}</Badge>}
                    <Badge variant={a.isPublished ? "default" : "secondary"} className="text-xs">
                      {a.isPublished ? "Published" : "Draft"}
                    </Badge>
                  </div>
                  {a.description && <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{a.description}</p>}
                  <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                    {a.dueAt && <span className="flex items-center gap-1"><Clock size={11} /> Due: {format(new Date(a.dueAt), "MMM d, h:mm a")}</span>}
                    <span>{a.maxMarks} marks</span>
                    <span className="flex items-center gap-1"><Users size={11} /> {a.submissionCount} submissions</span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => setViewSubs(a)}>
                    <Users size={14} className="mr-1" /> View ({a.submissionCount})
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => { resetForm(a); setEditTarget(a); }}>
                    <Pencil size={14} />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-red-500" onClick={() => deleteAssignment(a.id)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={showCreate || !!editTarget} onOpenChange={(o) => { if (!o) { setShowCreate(false); setEditTarget(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit Assignment" : "Create Assignment"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Class</Label>
              <Select value={form.classId} onValueChange={(v) => setForm((f) => ({ ...f, classId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select class..." /></SelectTrigger>
                <SelectContent>
                  {classes.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Assignment title" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Instructions for students..." rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Due Date & Time</Label>
                <Input type="datetime-local" value={form.dueAt} onChange={(e) => setForm((f) => ({ ...f, dueAt: e.target.value }))} />
              </div>
              <div>
                <Label>Max Marks</Label>
                <Input type="number" value={form.maxMarks} onChange={(e) => setForm((f) => ({ ...f, maxMarks: e.target.value }))} min={1} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.isPublished} onCheckedChange={(v) => setForm((f) => ({ ...f, isPublished: v }))} />
              <Label>Publish immediately (notify students)</Label>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setShowCreate(false); setEditTarget(null); }}>Cancel</Button>
              <Button onClick={saveAssignment}>{editTarget ? "Save Changes" : "Create"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Submissions Dialog */}
      <Dialog open={!!viewSubs} onOpenChange={(o) => !o && setViewSubs(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Submissions: {viewSubs?.title}</DialogTitle>
          </DialogHeader>
          {loadingSubs ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-muted animate-pulse rounded" />)}</div>
          ) : submissions.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No submissions yet.</p>
          ) : (
            <div className="space-y-3">
              {submissions.map((sub) => (
                <Card key={sub.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{sub.student?.fullName ?? "Unknown"}</span>
                          <span className="text-xs text-muted-foreground">@{sub.student?.username}</span>
                          {sub.grade !== null && (
                            <Badge className="bg-green-500 hover:bg-green-500 text-xs">
                              {sub.grade}/{viewSubs?.maxMarks}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">Submitted {format(new Date(sub.submittedAt), "MMM d, h:mm a")}</p>
                        {sub.comment && <p className="text-sm mt-1 text-muted-foreground">{sub.comment}</p>}
                        {sub.feedback && <p className="text-sm mt-1 text-green-700 bg-green-50 p-2 rounded">Feedback: {sub.feedback}</p>}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {sub.fileName && (
                          <Button variant="outline" size="sm" onClick={() => downloadFile(viewSubs!.id, sub.id, sub.fileName!)}>
                            <Download size={13} className="mr-1" /> File
                          </Button>
                        )}
                        <Button size="sm" onClick={() => { setGradeTarget({ sub, assignment: viewSubs! }); setGradeValue(String(sub.grade ?? "")); setFeedbackValue(sub.feedback ?? ""); }}>
                          <Star size={13} className="mr-1" /> Grade
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Grade Dialog */}
      <Dialog open={!!gradeTarget} onOpenChange={(o) => !o && setGradeTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Grade Submission</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Grade (out of {gradeTarget?.assignment.maxMarks})</Label>
              <Input type="number" value={gradeValue} onChange={(e) => setGradeValue(e.target.value)} min={0} max={gradeTarget?.assignment.maxMarks} />
            </div>
            <div>
              <Label>Feedback</Label>
              <Textarea value={feedbackValue} onChange={(e) => setFeedbackValue(e.target.value)} placeholder="Optional feedback for student..." rows={3} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setGradeTarget(null)}>Cancel</Button>
              <Button onClick={gradeSubmission}>Save Grade</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
