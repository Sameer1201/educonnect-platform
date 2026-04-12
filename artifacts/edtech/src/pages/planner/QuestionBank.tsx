import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CalendarClock, Layers3, Pencil, Plus, Search, Target, Trash2, UserCheck } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InfoTip } from "@/components/ui/info-tip";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface AssignedTeacher {
  id: number;
  fullName?: string | null;
  username?: string | null;
}

interface PlannerQuestionBankCard {
  id: number;
  title: string;
  description?: string | null;
  exam: string;
  status: string;
  adminId: number;
  adminName?: string | null;
  assignedTeacherIds?: number[];
  assignedTeachers?: AssignedTeacher[];
  weeklyTargetQuestions?: number | null;
  weeklyTargetDeadline?: string | null;
  subjectCount: number;
  chapterCount: number;
  questionCount: number;
  remainingQuestions: number;
}

interface TeacherUser {
  id: number;
  fullName: string;
  username: string;
}

interface ExamTemplateSummary {
  id: number;
  name: string;
  key: string;
}

type FormState = {
  title: string;
  exam: string;
  teacherIds: number[];
  weeklyTargetQuestions: string;
  weeklyTargetDeadline: string;
  description: string;
};

const emptyForm = (): FormState => ({
  title: "",
  exam: "",
  teacherIds: [],
  weeklyTargetQuestions: "",
  weeklyTargetDeadline: "",
  description: "",
});

function toLocalDatetimeValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function PlannerQuestionBank() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [editingCard, setEditingCard] = useState<PlannerQuestionBankCard | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  const { data: cards = [], isLoading } = useQuery<PlannerQuestionBankCard[]>({
    queryKey: ["planner-question-bank-cards"],
    queryFn: async () => {
      const response = await fetch(`${BASE}/api/question-bank/cards`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load planner question bank cards");
      return response.json();
    },
  });

  const { data: teachers = [] } = useQuery<TeacherUser[]>({
    queryKey: ["planner-question-bank-teachers"],
    queryFn: async () => {
      const response = await fetch(`${BASE}/api/users?role=admin`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load teachers");
      return response.json();
    },
    staleTime: 30000,
  });

  const { data: examTemplates = [] } = useQuery<ExamTemplateSummary[]>({
    queryKey: ["planner-question-bank-exam-names"],
    queryFn: async () => {
      const response = await fetch(`${BASE}/api/planner/exam-templates`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load exam templates");
      const rows = await response.json();
      return rows.map((row: any) => ({ id: row.id, name: row.name, key: row.key }));
    },
    staleTime: 30000,
  });

  const filteredCards = useMemo(() => {
    const term = search.trim().toLowerCase();
    return cards.filter((card) => {
      if (!term) return true;
      const teacherNames = (card.assignedTeachers ?? []).map((teacher) => `${teacher.fullName ?? ""} ${teacher.username ?? ""}`).join(" ");
      const haystack = `${card.title} ${card.exam} ${teacherNames}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [cards, search]);

  const resetDialog = () => {
    setOpen(false);
    setEditingCard(null);
    setError("");
    setForm(emptyForm());
  };

  const openCreate = () => {
    setEditingCard(null);
    setError("");
    setForm(emptyForm());
    setOpen(true);
  };

  const openEdit = (card: PlannerQuestionBankCard) => {
    setEditingCard(card);
    setError("");
    setForm({
      title: card.title,
      exam: card.exam,
      teacherIds: card.assignedTeacherIds?.length ? card.assignedTeacherIds : card.adminId ? [card.adminId] : [],
      weeklyTargetQuestions: String(card.weeklyTargetQuestions ?? ""),
      weeklyTargetDeadline: toLocalDatetimeValue(card.weeklyTargetDeadline),
      description: card.description ?? "",
    });
    setOpen(true);
  };

  const upsertQuestionBankCard = useMutation({
    mutationFn: async () => {
      const url = editingCard ? `${BASE}/api/question-bank/cards/${editingCard.id}` : `${BASE}/api/question-bank/cards`;
      const method = editingCard ? "PATCH" : "POST";
      const response = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          exam: form.exam.trim(),
          description: form.description.trim() || undefined,
          teacherIds: form.teacherIds,
          weeklyTargetQuestions: Number(form.weeklyTargetQuestions),
          weeklyTargetDeadline: form.weeklyTargetDeadline,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? (editingCard ? "Failed to update question bank card" : "Failed to create question bank card"));
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planner-question-bank-cards"] });
      resetDialog();
      toast({
        title: editingCard ? "Question bank card updated" : "Question bank card created",
        description: "Teachers can now work under this planner-defined card.",
      });
    },
    onError: (err: Error) => {
      setError(err.message || "Failed to save question bank card");
    },
  });

  const deleteQuestionBankCard = useMutation({
    mutationFn: async (cardId: number) => {
      const response = await fetch(`${BASE}/api/question-bank/cards/${cardId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to delete question bank card");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planner-question-bank-cards"] });
      toast({ title: "Question bank card deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Could not delete card", description: err.message, variant: "destructive" });
    },
  });

  const toggleTeacher = (teacherId: number) => {
    setForm((prev) => ({
      ...prev,
      teacherIds: prev.teacherIds.includes(teacherId)
        ? prev.teacherIds.filter((id) => id !== teacherId)
        : [...prev.teacherIds, teacherId],
    }));
  };

  const handleSave = () => {
    setError("");
    if (!form.title.trim()) return setError("Card title is required.");
    if (!form.exam.trim()) return setError("Exam name is required.");
    if (form.teacherIds.length === 0) return setError("At least one teacher assignment is required.");
    if (!form.weeklyTargetQuestions.trim()) return setError("Weekly target is required.");
    if (!form.weeklyTargetDeadline.trim()) return setError("Deadline is required.");
    upsertQuestionBankCard.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-border/60 bg-card p-5 sm:p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">
              <BookOpen size={14} />
              Planner Question Bank
            </div>
            <h1 className="mt-3 text-3xl sm:text-4xl font-black tracking-tight">Question Bank Cards</h1>
            <div className="mt-3 flex items-start gap-2 text-sm sm:text-base text-muted-foreground leading-relaxed">
              <span>Set weekly targets, choose the exam, and assign one or more teachers.</span>
              <InfoTip content="Each question bank card defines ownership, deadline, and target volume. Teachers work inside the assigned card." />
            </div>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus size={16} />
            New Question Bank
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="border-b bg-muted/20">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers3 size={16} className="text-indigo-600" />
              Planner Cards
            </CardTitle>
            <div className="relative w-full sm:w-72">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search cards..." className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, index) => (
                <div key={index} className="h-24 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : filteredCards.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-10 text-center">
              <p className="text-sm text-muted-foreground">
                {search ? "No question bank cards matched your search." : "No planner question bank cards created yet."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCards.map((card) => (
                <div key={card.id} className="rounded-2xl border p-4 bg-card">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{card.title}</p>
                        <Badge variant="outline">{card.exam}</Badge>
                        <Badge variant={card.status === "live" ? "destructive" : card.status === "scheduled" ? "secondary" : "default"}>
                          {card.status}
                        </Badge>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <UserCheck size={12} /> Teachers: {(card.assignedTeachers ?? []).map((teacher) => teacher.fullName ?? teacher.username ?? "Teacher").join(", ") || "Assigned teachers"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Target size={12} /> Weekly target: {card.weeklyTargetQuestions ?? 0}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <BookOpen size={12} /> Uploaded: {card.questionCount}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock size={12} /> Deadline: {card.weeklyTargetDeadline ? format(new Date(card.weeklyTargetDeadline), "MMM d, yyyy · h:mm a") : "Not set"}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <Badge variant="secondary">{card.remainingQuestions} left</Badge>
                        <Badge variant="outline">{card.subjectCount} subjects</Badge>
                        <Badge variant="outline">{card.chapterCount} chapters</Badge>
                      </div>
                      {card.description && (
                        <p className="text-sm text-muted-foreground mt-3 line-clamp-2">{card.description}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="outline" size="sm" onClick={() => openEdit(card)}>
                        <Pencil size={14} className="mr-1" />
                        Edit
                      </Button>
                      <Link href={`/planner/question-bank/${card.id}`}>
                        <Button variant="outline" size="sm">Manage Structure</Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => deleteQuestionBankCard.mutate(card.id)}
                        disabled={deleteQuestionBankCard.isPending}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : resetDialog())}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingCard ? "Edit Question Bank Card" : "Create Question Bank Card"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label>Card Title</Label>
              <Input
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="e.g. GATE Week 1 Bank"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Exam Name</Label>
              <select
                value={form.exam}
                onChange={(event) => setForm((prev) => ({ ...prev, exam: event.target.value }))}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select exam template name</option>
                {examTemplates.map((template) => (
                  <option key={template.id} value={template.name}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Assign Teachers</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {teachers.map((teacher) => {
                  const selected = form.teacherIds.includes(teacher.id);
                  return (
                    <button
                      key={teacher.id}
                      type="button"
                      onClick={() => toggleTeacher(teacher.id)}
                      className={`rounded-xl border px-3 py-2 text-left transition ${selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-accent/30"}`}
                    >
                      <div className="font-medium text-sm">{teacher.fullName}</div>
                      <div className="text-xs text-muted-foreground">@{teacher.username}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Weekly Target Questions</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.weeklyTargetQuestions}
                  onChange={(event) => setForm((prev) => ({ ...prev, weeklyTargetQuestions: event.target.value }))}
                  placeholder="50"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Deadline</Label>
                <Input
                  type="datetime-local"
                  value={form.weeklyTargetDeadline}
                  onChange={(event) => setForm((prev) => ({ ...prev, weeklyTargetDeadline: event.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Optional planner note for this question bank card…"
                rows={4}
              />
            </div>

            <Button className="w-full" onClick={handleSave} disabled={upsertQuestionBankCard.isPending}>
              {upsertQuestionBankCard.isPending ? (editingCard ? "Saving..." : "Creating...") : (editingCard ? "Save Changes" : "Create Question Bank")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
