import { useState } from "react";
import { Link } from "wouter";
import { useListClasses, useCreateClass, useDeleteClass, useStartClass, useEndClass, getListClassesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Trash2, Play, Square, Users, BookOpen, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { DashboardScene, HoloGrid, TiltCard } from "@/components/dashboard-3d";

function statusColor(status: string) {
  if (status === "live") return "destructive";
  if (status === "scheduled") return "secondary";
  if (status === "completed") return "default";
  return "outline";
}

export default function AdminClasses() {
  const { data: classes = [], isLoading } = useListClasses();
  const createClass = useCreateClass();
  const deleteClass = useDeleteClass();
  const startClass = useStartClass();
  const endClass = useEndClass();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", subject: "", description: "", scheduledAt: "", maxStudents: "", meetingLink: "" });
  const [error, setError] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleCreate = () => {
    setError("");
    if (!form.title || !form.subject) {
      setError("Title and subject are required");
      return;
    }
    createClass.mutate(
      {
        data: {
          title: form.title,
          subject: form.subject,
          description: form.description || undefined,
          scheduledAt: form.scheduledAt || undefined,
          maxStudents: form.maxStudents ? parseInt(form.maxStudents) : undefined,
          meetingLink: form.meetingLink || undefined,
        }
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClassesQueryKey() });
          toast({ title: "Class created successfully" });
          setOpen(false);
          setForm({ title: "", subject: "", description: "", scheduledAt: "", maxStudents: "", meetingLink: "" });
        },
        onError: (err: any) => setError(err?.data?.error ?? "Failed to create class"),
      }
    );
  };

  const handleDelete = (id: number, title: string) => {
    if (!confirm(`Delete "${title}"?`)) return;
    deleteClass.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListClassesQueryKey() });
        toast({ title: "Class deleted" });
      },
    });
  };

  const handleStart = (id: number) => {
    startClass.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListClassesQueryKey() });
        toast({ title: "Class is now live!" });
      },
    });
  };

  const handleEnd = (id: number) => {
    endClass.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListClassesQueryKey() });
        toast({ title: "Class ended" });
      },
    });
  };

  return (
    <div className="space-y-6">
      <DashboardScene accent="from-cyan-500/20 via-blue-500/10 to-violet-500/20">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-100/90">
              <BookOpen size={12} />
              Teaching Grid
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white">My Classes</h1>
              <p className="mt-2 text-sm text-slate-300">
                Run your teaching space from one cinematic control layer. Schedule sessions, go live, and manage student load without leaving the flow.
              </p>
            </div>
          </div>
          <TiltCard className="w-full max-w-sm rounded-3xl">
            <HoloGrid title="Class Control" subtitle="Launch a new class room with schedule and meeting details.">
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full" data-testid="button-create-class">
                    <Plus size={16} className="mr-2" />
                    New Class
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Create New Class</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-2">
                    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
                    <div className="space-y-1.5">
                      <Label>Class Title</Label>
                      <Input name="title" data-testid="input-class-title" placeholder="e.g. Introduction to Algebra" value={form.title} onChange={handleChange} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Subject</Label>
                      <Input name="subject" data-testid="input-class-subject" placeholder="e.g. Mathematics" value={form.subject} onChange={handleChange} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Description (optional)</Label>
                      <Textarea name="description" data-testid="input-class-description" placeholder="Brief class description" value={form.description} onChange={handleChange} rows={3} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Scheduled At (optional)</Label>
                      <Input name="scheduledAt" type="datetime-local" data-testid="input-class-schedule" value={form.scheduledAt} onChange={handleChange} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Max Students (optional)</Label>
                      <Input name="maxStudents" type="number" data-testid="input-class-max" placeholder="e.g. 30" value={form.maxStudents} onChange={handleChange} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Meeting Link (optional)</Label>
                      <Input name="meetingLink" data-testid="input-class-meeting" placeholder="https://..." value={form.meetingLink} onChange={handleChange} />
                    </div>
                    <Button className="w-full" onClick={handleCreate} disabled={createClass.isPending} data-testid="button-submit-class">
                      {createClass.isPending ? "Creating..." : "Create Class"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </HoloGrid>
          </TiltCard>
        </div>
      </DashboardScene>

      <TiltCard className="rounded-3xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen size={16} className="text-primary" />
              All Classes ({classes.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-muted rounded animate-pulse" />)}
              </div>
            ) : classes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No classes yet. Create your first class above.</p>
            ) : (
              <div className="space-y-3">
                {classes.map((cls) => (
                  <TiltCard key={cls.id} className="rounded-2xl" glare={false}>
                    <div className="p-4 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02]" data-testid={`class-row-${cls.id}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium text-sm truncate">{cls.title}</p>
                            <Badge variant={statusColor(cls.status) as any} className="shrink-0">{cls.status}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {cls.subject} ·{" "}
                            <span className="inline-flex items-center gap-1">
                              <Users size={11} />{cls.enrolledCount} enrolled
                            </span>
                            {cls.scheduledAt ? ` · ${format(new Date(cls.scheduledAt), "MMM d, h:mm a")}` : ""}
                          </p>
                          {cls.description && <p className="text-xs text-muted-foreground mt-1 truncate">{cls.description}</p>}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Link href={`/admin/class/${cls.id}`}>
                            <Button variant="outline" size="sm" data-testid={`button-view-class-${cls.id}`}>
                              <Pencil size={14} />
                            </Button>
                          </Link>
                          {cls.status === "scheduled" && (
                            <Button size="sm" variant="default" onClick={() => handleStart(cls.id)} data-testid={`button-start-class-${cls.id}`}>
                              <Play size={14} />
                            </Button>
                          )}
                          {cls.status === "live" && (
                            <Button size="sm" variant="destructive" onClick={() => handleEnd(cls.id)} data-testid={`button-end-class-${cls.id}`}>
                              <Square size={14} />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(cls.id, cls.title)}
                            data-testid={`button-delete-class-${cls.id}`}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </TiltCard>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TiltCard>
    </div>
  );
}
