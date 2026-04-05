import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format, isPast } from "date-fns";
import { FileUp, CheckCircle2, Clock, AlertCircle, Download, Eye, Upload, MessageSquare } from "lucide-react";

interface Assignment {
  id: number;
  title: string;
  description: string | null;
  dueAt: string | null;
  maxMarks: number;
  className: string | null;
  submission: {
    id: number;
    grade: number | null;
    feedback: string | null;
    fileName: string | null;
    comment: string | null;
    submittedAt: string;
    gradedAt: string | null;
  } | null;
}

export default function StudentAssignments() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Assignment | null>(null);
  const [comment, setComment] = useState("");
  const [fileInfo, setFileInfo] = useState<{ name: string; data: string; type: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: assignments = [], isLoading } = useQuery<Assignment[]>({
    queryKey: ["assignments"],
    queryFn: () => api.get("/assignments"),
    refetchInterval: 30000,
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast({ title: "File too large", description: "Max 10MB", variant: "destructive" }); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setFileInfo({ name: file.name, data: ev.target?.result as string, type: file.type });
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit() {
    if (!selected || (!fileInfo && !comment.trim())) {
      toast({ title: "Please attach a file or add a comment", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/assignments/${selected.id}/submissions`, {
        fileName: fileInfo?.name ?? null,
        fileData: fileInfo?.data ?? null,
        fileType: fileInfo?.type ?? null,
        comment: comment.trim() || null,
      });
      toast({ title: "Assignment submitted!" });
      qc.invalidateQueries({ queryKey: ["assignments"] });
      setSelected(null);
      setFileInfo(null);
      setComment("");
    } catch {
      toast({ title: "Submission failed", variant: "destructive" });
    } finally {
      setSubmitting(false);
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

  if (isLoading) return (
    <div className="space-y-4">
      <div className="h-8 w-48 bg-muted animate-pulse rounded" />
      {[...Array(3)].map((_, i) => <div key={i} className="h-40 bg-muted animate-pulse rounded-xl" />)}
    </div>
  );

  const pending = assignments.filter((a) => !a.submission);
  const submitted = assignments.filter((a) => a.submission);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Assignments</h1>
        <p className="text-muted-foreground text-sm mt-1">{pending.length} pending · {submitted.length} submitted</p>
      </div>

      {pending.length === 0 && submitted.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <FileUp size={40} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No assignments posted yet.</p>
          </CardContent>
        </Card>
      )}

      {pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Pending ({pending.length})</h2>
          {pending.map((a) => {
            const overdue = a.dueAt && isPast(new Date(a.dueAt));
            return (
              <Card key={a.id} className={`border ${overdue ? "border-red-300 bg-red-50/40" : "border-orange-200 bg-orange-50/30"}`}>
                <CardContent className="p-5 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="font-semibold">{a.title}</h3>
                      {a.className && <Badge variant="outline" className="text-xs">{a.className}</Badge>}
                      {overdue && <Badge variant="destructive" className="text-xs">Overdue</Badge>}
                    </div>
                    {a.description && <p className="text-sm text-muted-foreground mb-2">{a.description}</p>}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {a.dueAt && (
                        <span className={`flex items-center gap-1 ${overdue ? "text-red-500 font-medium" : ""}`}>
                          <Clock size={11} />
                          Due: {format(new Date(a.dueAt), "MMM d, h:mm a")}
                        </span>
                      )}
                      <span>{a.maxMarks} marks</span>
                    </div>
                  </div>
                  <Button size="sm" onClick={() => { setSelected(a); setComment(""); setFileInfo(null); }}>
                    <Upload size={14} className="mr-1" /> Submit
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {submitted.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Submitted ({submitted.length})</h2>
          {submitted.map((a) => {
            const sub = a.submission!;
            const graded = sub.grade !== null;
            return (
              <Card key={a.id} className={graded ? "border-green-300 bg-green-50/30" : "border-blue-200 bg-blue-50/20"}>
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="font-semibold">{a.title}</h3>
                        {a.className && <Badge variant="outline" className="text-xs">{a.className}</Badge>}
                        {graded ? (
                          <Badge className="bg-green-500 hover:bg-green-500 text-xs">
                            <CheckCircle2 size={10} className="mr-1" /> Graded: {sub.grade}/{a.maxMarks}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            <Clock size={10} className="mr-1" /> Awaiting Grade
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">
                        Submitted {format(new Date(sub.submittedAt), "MMM d, h:mm a")}
                      </p>
                      {sub.comment && (
                        <p className="text-sm text-muted-foreground flex items-start gap-1">
                          <MessageSquare size={12} className="mt-0.5 shrink-0" /> {sub.comment}
                        </p>
                      )}
                      {sub.feedback && (
                        <div className="mt-2 p-2 rounded bg-green-100 text-sm text-green-800">
                          <strong>Teacher feedback:</strong> {sub.feedback}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {sub.fileName && (
                        <Button variant="outline" size="sm" onClick={() => downloadFile(a.id, sub.id, sub.fileName!)}>
                          <Download size={14} className="mr-1" /> {sub.fileName}
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => { setSelected(a); setComment(sub.comment ?? ""); setFileInfo(null); }}>
                        Resubmit
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Submit: {selected?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Attach File (max 10MB)</label>
              <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} />
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                {fileInfo ? (
                  <div className="flex items-center justify-center gap-2 text-sm font-medium text-primary">
                    <CheckCircle2 size={18} className="text-green-500" />
                    {fileInfo.name}
                  </div>
                ) : (
                  <div className="text-muted-foreground text-sm">
                    <Upload size={24} className="mx-auto mb-1" />
                    Click to select a file
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Comment (optional)</label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a note for your teacher..."
                rows={3}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Submitting..." : "Submit Assignment"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
