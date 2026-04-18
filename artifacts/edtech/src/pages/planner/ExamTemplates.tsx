import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Layers3, Plus, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type QuestionType = "mcq" | "multi" | "integer";

function getDefaultTemplateInstructions(templateName: string, durationMinutes: number) {
  const safeName = templateName.trim() || "the examination";
  const safeDuration = Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 180;
  return [
    `The duration of ${safeName} is ${safeDuration} minutes. The countdown timer at the top right-hand corner of your screen displays the remaining time.`,
    "When the timer reaches zero, the test will be submitted automatically.",
    "Read every question carefully before selecting or entering your response.",
    "Use Save & Next to save the current response and move ahead.",
    "Use Mark for Review & Next when you want to revisit a question before final submission.",
    "You can jump to any question from the question palette without losing the current screen context.",
    "Use Clear Response to remove the selected answer from the current question.",
    "MCQ uses single selection, MSQ uses multiple selections, and integer questions require a numeric answer.",
  ].join("\n");
}

interface ExamTemplateSectionDraft {
  id: string;
  title: string;
  subjectLabel: string;
  description: string;
  questionCount: string;
  marksPerQuestion: string;
  negativeMarks: string;
  preferredQuestionType: QuestionType;
}

interface ExamTemplate {
  id: number;
  key: string;
  name: string;
  description?: string | null;
  examHeader?: string | null;
  examSubheader?: string | null;
  instructions?: string | null;
  customInstructions?: string | null;
  durationMinutes: number;
  passingScore: number | null;
  showInRegistration?: boolean;
  sections: Array<{
    title: string;
    subjectLabel?: string | null;
    description?: string | null;
    questionCount?: number | null;
    marksPerQuestion?: number | null;
    negativeMarks?: number | null;
    preferredQuestionType?: QuestionType;
  }>;
  isSystem: boolean;
}

function makeTemplateSection(input?: Partial<ExamTemplateSectionDraft>): ExamTemplateSectionDraft {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: input?.title ?? "",
    subjectLabel: input?.subjectLabel ?? "",
    description: input?.description ?? "",
    questionCount: input?.questionCount ?? "",
    marksPerQuestion: input?.marksPerQuestion ?? "",
    negativeMarks: input?.negativeMarks ?? "",
    preferredQuestionType: input?.preferredQuestionType ?? "mcq",
  };
}

export default function PlannerExamTemplates() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [templateOpen, setTemplateOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateHeader, setTemplateHeader] = useState("");
  const [templateSubheader, setTemplateSubheader] = useState("");
  const [templateCustomInstructions, setTemplateCustomInstructions] = useState("");
  const [templateDuration, setTemplateDuration] = useState("180");
  const [templatePassing, setTemplatePassing] = useState("60");
  const [templateShowInRegistration, setTemplateShowInRegistration] = useState(true);
  const [templateSections, setTemplateSections] = useState<ExamTemplateSectionDraft[]>([makeTemplateSection()]);

  const { data: examTemplates = [], isLoading } = useQuery<ExamTemplate[]>({
    queryKey: ["planner-dashboard", "exam-templates"],
    queryFn: async () => {
      const response = await fetch(`${BASE}/api/planner/exam-templates`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load exam templates");
      return response.json();
    },
    staleTime: 30000,
  });

  const resetTemplateForm = () => {
    setEditingTemplateId(null);
    setTemplateName("");
    setTemplateDescription("");
    setTemplateHeader("");
    setTemplateSubheader("");
    setTemplateCustomInstructions("");
    setTemplateDuration("180");
    setTemplatePassing("");
    setTemplateShowInRegistration(true);
    setTemplateSections([makeTemplateSection()]);
  };

  const openTemplateEditor = (template?: ExamTemplate) => {
    if (!template) {
      resetTemplateForm();
      setTemplateOpen(true);
      return;
    }
    setEditingTemplateId(template.id);
    setTemplateName(template.name);
    setTemplateDescription(template.description ?? "");
    setTemplateHeader(template.examHeader ?? "");
    setTemplateSubheader(template.examSubheader ?? "");
    setTemplateCustomInstructions(template.customInstructions?.trim() || "");
    setTemplateDuration(String(template.durationMinutes));
    setTemplatePassing(template.passingScore == null ? "" : String(template.passingScore));
    setTemplateShowInRegistration(template.showInRegistration !== false);
    setTemplateSections(
      template.sections.map((section) =>
        makeTemplateSection({
          title: section.title,
          subjectLabel: section.subjectLabel ?? "",
          description: section.description ?? "",
          questionCount: section.questionCount != null ? String(section.questionCount) : "",
          marksPerQuestion: section.marksPerQuestion != null ? String(section.marksPerQuestion) : "",
          negativeMarks: section.negativeMarks != null ? String(section.negativeMarks) : "",
          preferredQuestionType: section.preferredQuestionType ?? "mcq",
        }),
      ),
    );
    setTemplateOpen(true);
  };

  const saveTemplateMutation = useMutation({
    mutationFn: async () => {
      const resolvedDuration = Number(templateDuration) || 180;
      const payload = {
        key: templateName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        name: templateName.trim(),
        description: templateDescription.trim() || null,
        examHeader: templateHeader.trim() || null,
        examSubheader: templateSubheader.trim() || null,
        customInstructions: templateCustomInstructions.trim() || null,
        durationMinutes: resolvedDuration,
        passingScore: templatePassing.trim() ? Number(templatePassing) : null,
        showInRegistration: templateShowInRegistration,
        sections: templateSections
          .filter((section) => (section.subjectLabel.trim() || section.title.trim()))
          .map((section) => ({
            title: (section.subjectLabel.trim() || section.title.trim()),
            subjectLabel: section.subjectLabel.trim() || null,
            description: null,
            questionCount: section.questionCount ? Number(section.questionCount) : null,
            marksPerQuestion: section.marksPerQuestion ? Number(section.marksPerQuestion) : null,
            negativeMarks: section.negativeMarks ? Number(section.negativeMarks) : null,
            preferredQuestionType: section.preferredQuestionType,
          })),
      };
      const url = editingTemplateId
        ? `${BASE}/api/planner/exam-templates/${editingTemplateId}`
        : `${BASE}/api/planner/exam-templates`;
      const method = editingTemplateId ? "PATCH" : "POST";
      const response = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to save exam template");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planner-dashboard", "exam-templates"] });
      setTemplateOpen(false);
      resetTemplateForm();
      toast({
        title: editingTemplateId ? "Template updated" : "Template created",
        description: editingTemplateId
          ? "Exam template successfully updated."
          : "New exam template added successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Template save failed",
        description: error.message || "Please check the template fields and try again.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-32 rounded-3xl bg-muted animate-pulse" />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="h-96 rounded-2xl bg-muted animate-pulse" />
          <div className="h-96 rounded-2xl bg-muted animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-border/60 bg-card p-5 sm:p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">
              <Sparkles size={14} />
              Exam Template Library
            </div>
            <h1 className="mt-3 text-3xl sm:text-4xl font-black tracking-tight">Exam Templates</h1>
            <p className="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed">
              Define the exam structure once. Teachers then select the template and start adding questions.
            </p>
          </div>
          <Button onClick={() => openTemplateEditor()} className="gap-2">
            <Plus size={16} />
            Add Exam Template
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Card className="xl:col-span-2 overflow-hidden">
          <CardHeader className="border-b bg-muted/20">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers3 size={16} className="text-indigo-600" />
              Template Library
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-5 space-y-3">
            {examTemplates.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
                No exam templates created yet.
              </div>
            ) : (
              examTemplates.map((template) => (
                <div key={template.id} className="rounded-2xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{template.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {template.description || "Super admin managed exam structure"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {template.isSystem && <Badge variant="outline">System</Badge>}
                      <Button size="sm" variant="outline" onClick={() => openTemplateEditor(template)}>
                        Edit
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    <span>{template.durationMinutes} min</span>
                    <span>{template.passingScore == null ? "No pass cutoff" : `Pass ${template.passingScore}%`}</span>
                    <span>{template.sections.length} sections</span>
                    <span>{template.showInRegistration === false ? "Hidden from registration" : "Visible in registration"}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {template.sections.map((section) => (
                      <Badge key={`${template.id}-${section.title}`} variant="secondary">
                        {section.subjectLabel || section.title}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/20">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList size={16} className="text-cyan-600" />
              Template Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-5 space-y-4">
            <div className="rounded-2xl border p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Total Templates</p>
              <p className="text-3xl font-black mt-2">{examTemplates.length}</p>
            </div>
            <div className="rounded-2xl border p-4">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">Super admin owned flow</p>
                <InfoTip content="Super admin controls the exam shell, duration, sections, default marking, and preferred question types. Teachers only author questions." />
              </div>
            </div>
            <div className="rounded-2xl border p-4">
              <p className="text-sm font-semibold">Active defaults</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {examTemplates.slice(0, 8).map((template) => (
                  <Badge key={template.id} variant="outline">{template.name}</Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplateId ? "Edit Exam Template" : "Add Exam Template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Name</Label><Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} className="mt-1" placeholder="e.g. GATE DA" /></div>
            <div><Label>Description</Label><Textarea value={templateDescription} onChange={(e) => setTemplateDescription(e.target.value)} className="mt-1 resize-none" rows={2} placeholder="What structure this exam follows" /></div>
            <div className="grid gap-4 md:grid-cols-2">
              <div><Label>Exam Header</Label><Input value={templateHeader} onChange={(e) => setTemplateHeader(e.target.value)} className="mt-1" placeholder="e.g. GRADUATE APTITUDE TEST IN ENGINEERING" /></div>
              <div><Label>Exam Subheader</Label><Input value={templateSubheader} onChange={(e) => setTemplateSubheader(e.target.value)} className="mt-1" placeholder="e.g. GATE Mock Assessment" /></div>
            </div>
            <div className="space-y-3">
              <div>
                <Label>Default Test Instructions</Label>
                <Textarea
                  value={getDefaultTemplateInstructions(templateName, Number(templateDuration) || 180)}
                  readOnly
                  className="mt-1 min-h-[220px] resize-none bg-slate-50 text-slate-700"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  These always stay on the first test page.
                </p>
              </div>
              <div>
                <Label>Additional Instructions</Label>
                <Textarea
                  value={templateCustomInstructions}
                  onChange={(e) => setTemplateCustomInstructions(e.target.value)}
                  className="mt-1 min-h-[140px] resize-y"
                  placeholder="Add calculator rules, reporting notes, or any extra instructions."
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  These appear below the default list. The default content stays unchanged.
                </p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <div><Label>Duration</Label><Input type="number" value={templateDuration} onChange={(e) => setTemplateDuration(e.target.value)} className="mt-1" /></div>
              <div><Label>Passing %</Label><Input type="number" value={templatePassing} onChange={(e) => setTemplatePassing(e.target.value)} className="mt-1" placeholder="Optional" /></div>
            </div>
            <label className="flex items-center gap-3 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-4 py-3 text-sm font-medium text-[#111827]">
              <input
                type="checkbox"
                checked={templateShowInRegistration}
                onChange={(e) => setTemplateShowInRegistration(e.target.checked)}
                className="h-4 w-4 rounded border-[#CBD5E1] text-[#5B4DFF] focus:ring-[#5B4DFF]"
              />
              Show this exam in student registration
            </label>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Sections</p>
                <Button size="sm" variant="outline" onClick={() => setTemplateSections((prev) => [...prev, makeTemplateSection()])}>Add Section</Button>
              </div>
              {templateSections.map((section) => (
                <div key={section.id} className="rounded-2xl border p-4 space-y-3">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div><Label className="text-xs">Subject Label</Label><Input value={section.subjectLabel} onChange={(e) => setTemplateSections((prev) => prev.map((item) => item.id === section.id ? { ...item, subjectLabel: e.target.value, title: e.target.value } : item))} className="mt-1" placeholder="e.g. Physics / Core Subject / General Aptitude" /></div>
                    <div><Label className="text-xs">Question Count</Label><Input type="number" value={section.questionCount} onChange={(e) => setTemplateSections((prev) => prev.map((item) => item.id === section.id ? { ...item, questionCount: e.target.value } : item))} className="mt-1" /></div>
                    <div><Label className="text-xs">Preferred Type</Label>
                      <Select value={section.preferredQuestionType} onValueChange={(value) => setTemplateSections((prev) => prev.map((item) => item.id === section.id ? { ...item, preferredQuestionType: value as QuestionType } : item))}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mcq">MCQ</SelectItem>
                          <SelectItem value="multi">Multi-select</SelectItem>
                          <SelectItem value="integer">Integer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div><Label className="text-xs">Marks / Q</Label><Input type="number" step="0.01" value={section.marksPerQuestion} onChange={(e) => setTemplateSections((prev) => prev.map((item) => item.id === section.id ? { ...item, marksPerQuestion: e.target.value } : item))} className="mt-1" /></div>
                    <div><Label className="text-xs">-ve Marks</Label><Input type="number" step="0.01" value={section.negativeMarks} onChange={(e) => setTemplateSections((prev) => prev.map((item) => item.id === section.id ? { ...item, negativeMarks: e.target.value } : item))} className="mt-1" /></div>
                    <div className="flex items-end justify-end"><Button variant="ghost" className="text-destructive" onClick={() => setTemplateSections((prev) => prev.length > 1 ? prev.filter((item) => item.id !== section.id) : prev)}>Remove</Button></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setTemplateOpen(false); resetTemplateForm(); }}>Cancel</Button>
              <Button disabled={!templateName.trim() || templateSections.every((section) => !section.subjectLabel.trim()) || saveTemplateMutation.isPending} onClick={() => saveTemplateMutation.mutate()}>
                {saveTemplateMutation.isPending ? "Saving..." : editingTemplateId ? "Update Template" : "Create Template"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
