import { useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, CheckSquare, Hash, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type QuestionType = "mcq" | "multi" | "integer";

interface TestSection {
  id: number;
  title: string;
  description: string | null;
  subjectLabel: string | null;
  questionCount?: number | null;
  marksPerQuestion?: number | null;
  negativeMarks?: number | null;
  order: number;
}

interface Question {
  id: number;
  sectionId: number | null;
  questionCode?: string | null;
  sourceType?: string | null;
  subjectLabel?: string | null;
  question: string;
  questionType: QuestionType;
  options: string[];
  optionImages?: (string | null)[] | null;
  correctAnswer?: number;
  correctAnswerMulti?: number[] | null;
  correctAnswerMin?: number | null;
  correctAnswerMax?: number | null;
  points: number;
  negativeMarks?: number | null;
  order: number;
  imageData?: string | null;
}

interface TestDetail {
  id: number;
  title: string;
  description: string | null;
  examType?: string | null;
  examHeader?: string | null;
  examSubheader?: string | null;
  instructions?: string | null;
  durationMinutes: number;
  defaultPositiveMarks?: number | null;
  defaultNegativeMarks?: number | null;
  className?: string | null;
  chapterName?: string | null;
  subjectName?: string | null;
  sections: TestSection[];
  questions: Question[];
}

const qTypeLabel: Record<QuestionType, string> = {
  mcq: "MCQ",
  multi: "Multi-select",
  integer: "Integer",
};

export default function AdminTestBuilder() {
  const { id } = useParams<{ id: string }>();
  const testId = parseInt(id, 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [qSectionId, setQSectionId] = useState("");
  const [qSubjectLabel, setQSubjectLabel] = useState("");
  const [qCode, setQCode] = useState("");
  const [qSourceType, setQSourceType] = useState("manual");
  const [qType, setQType] = useState<QuestionType>("mcq");
  const [qText, setQText] = useState("");
  const [qOptions, setQOptions] = useState(["", "", "", ""]);
  const [qCorrect, setQCorrect] = useState(0);
  const [qCorrectMulti, setQCorrectMulti] = useState<number[]>([]);
  const [qCorrectInt, setQCorrectInt] = useState("");
  const [qIntegerMode, setQIntegerMode] = useState<"exact" | "range">("exact");
  const [qCorrectIntMin, setQCorrectIntMin] = useState("");
  const [qCorrectIntMax, setQCorrectIntMax] = useState("");
  const [qPoints, setQPoints] = useState("1");
  const [qNegativeMarks, setQNegativeMarks] = useState("0");
  const [qImageData, setQImageData] = useState<string | null>(null);
  const [qOptionImages, setQOptionImages] = useState<(string | null)[]>([null, null, null, null]);
  const activeOptIdxRef = useRef<number>(-1);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const optionImgInputRef = useRef<HTMLInputElement>(null);

  const { data: test, isLoading } = useQuery<TestDetail>({
    queryKey: ["admin-test-builder", testId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/tests/${testId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load test");
      return r.json();
    },
    enabled: Number.isFinite(testId),
  });

  const sections = useMemo(() => test?.sections ?? [], [test?.sections]);
  const questions = useMemo(() => test?.questions ?? [], [test?.questions]);

  const resetForm = () => {
    setQSectionId("");
    setQSubjectLabel("");
    setQCode("");
    setQSourceType("manual");
    setQType("mcq");
    setQText("");
    setQOptions(["", "", "", ""]);
    setQCorrect(0);
    setQCorrectMulti([]);
    setQCorrectInt("");
    setQIntegerMode("exact");
    setQCorrectIntMin("");
    setQCorrectIntMax("");
    setQPoints(String(test?.defaultPositiveMarks ?? 1));
    setQNegativeMarks(String(test?.defaultNegativeMarks ?? 0));
    setQImageData(null);
    setQOptionImages([null, null, null, null]);
  };

  const addQuestionMutation = useMutation({
    mutationFn: async () => {
      const body: any = {
        sectionId: qSectionId ? parseInt(qSectionId) : null,
        questionCode: qCode.trim() || null,
        sourceType: qSourceType,
        subjectLabel: qSubjectLabel.trim() || null,
        question: qText.trim(),
        questionType: qType,
        points: parseInt(qPoints) || 1,
        negativeMarks: parseFloat(qNegativeMarks) || 0,
        imageData: qImageData || null,
        meta: { builderMode: "advanced", examType: test?.examType ?? "custom" },
      };
      if (qType === "mcq") {
        body.options = qOptions;
        body.correctAnswer = qCorrect;
        if (qOptionImages.some(Boolean)) body.optionImages = qOptionImages;
      } else if (qType === "multi") {
        body.options = qOptions;
        body.correctAnswerMulti = qCorrectMulti;
        if (qOptionImages.some(Boolean)) body.optionImages = qOptionImages;
      } else {
        body.options = [];
        if (qIntegerMode === "range") {
          body.correctAnswerMin = parseInt(qCorrectIntMin);
          body.correctAnswerMax = parseInt(qCorrectIntMax);
        } else {
          body.correctAnswer = parseInt(qCorrectInt) || 0;
        }
      }
      const r = await fetch(`${BASE}/api/tests/${testId}/questions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Failed to add question");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-test-builder", testId] });
      toast({ title: "Question added" });
      resetForm();
    },
    onError: () => toast({ title: "Failed to add question", variant: "destructive" }),
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: async (qid: number) => {
      const r = await fetch(`${BASE}/api/tests/${testId}/questions/${qid}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-test-builder", testId] });
      toast({ title: "Question removed" });
    },
  });

  const canSaveQuestion = () => {
    if (!qText.trim()) return false;
    if (qType === "mcq") return qOptions.every((option) => option.trim());
    if (qType === "multi") return qOptions.every((option) => option.trim()) && qCorrectMulti.length > 0;
    if (qIntegerMode === "range") {
      return qCorrectIntMin.trim() !== "" && qCorrectIntMax.trim() !== "" && parseInt(qCorrectIntMin) <= parseInt(qCorrectIntMax);
    }
    return qCorrectInt.trim() !== "";
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setQImageData(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleOptionImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const idx = activeOptIdxRef.current;
      if (idx < 0) return;
      setQOptionImages((prev) => {
        const next = [...prev];
        next[idx] = reader.result as string;
        return next;
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  if (isLoading || !test) {
    return <div className="min-h-screen bg-[#f7f8fc] flex items-center justify-center text-slate-500">Loading builder...</div>;
  }

  return (
    <div className="min-h-screen bg-[#f7f8fc] text-slate-900">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="outline" className="bg-white" onClick={() => setLocation("/admin/tests")}>
              <ArrowLeft size={14} className="mr-2" />
              Back to Tests
            </Button>
            <div>
              <p className="text-sm text-slate-500">{test.examType?.toUpperCase() ?? "CUSTOM"} Builder</p>
              <h1 className="text-3xl font-semibold tracking-tight">{test.title}</h1>
              <p className="mt-1 text-sm text-slate-500">{test.className ?? "No class"} · {test.subjectName ?? "No subject"} · {test.chapterName ?? "No chapter"}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
            <div>Questions: <strong>{questions.length}</strong></div>
            <div>Sections: <strong>{sections.length}</strong></div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <h2 className="text-xl font-semibold">Paper Blueprint</h2>
              <div className="mt-4 space-y-3">
                {sections.map((section, index) => (
                  <div key={section.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{index + 1}. {section.title}</p>
                      <span className="text-xs text-slate-500">{section.subjectLabel ?? "General"}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                      <span>Qs {section.questionCount ?? "—"}</span>
                      <span>+{section.marksPerQuestion ?? test.defaultPositiveMarks ?? 1}</span>
                      <span>-{section.negativeMarks ?? test.defaultNegativeMarks ?? 0}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
              <h2 className="text-xl font-semibold">Builder Rules</h2>
              <div className="mt-3 space-y-2 text-sm text-slate-600">
                <p>Use section metadata so later analysis can split by exam structure.</p>
                <p>Question code, source type, section, and subject label should be filled where possible.</p>
                <p>Questions are added one by one and stay visible below for quick review.</p>
              </div>
            </section>
          </aside>

          <main className="space-y-6">
            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
              <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold">Add Question</h2>
                  <p className="mt-1 text-sm text-slate-500">Scroll-friendly builder. Add one question at a time and keep shaping the paper below.</p>
                </div>
                <Button onClick={resetForm} variant="outline" className="bg-white">Clear Form</Button>
              </div>

              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <Label className="text-xs">Section</Label>
                    <Select value={qSectionId} onValueChange={(value) => {
                      setQSectionId(value);
                      const section = sections.find((item) => String(item.id) === value);
                      if (section?.subjectLabel && !qSubjectLabel) setQSubjectLabel(section.subjectLabel);
                      if (section?.marksPerQuestion) setQPoints(String(section.marksPerQuestion));
                      if (section?.negativeMarks !== undefined && section.negativeMarks !== null) setQNegativeMarks(String(section.negativeMarks));
                    }}>
                      <SelectTrigger className="mt-1 bg-white"><SelectValue placeholder="Choose section" /></SelectTrigger>
                      <SelectContent>
                        {sections.map((section) => <SelectItem key={section.id} value={String(section.id)}>{section.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Source Type</Label>
                    <Select value={qSourceType} onValueChange={setQSourceType}>
                      <SelectTrigger className="mt-1 bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="bulk">Bulk</SelectItem>
                        <SelectItem value="ai">AI</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Question Code</Label>
                    <Input className="mt-1 bg-white" value={qCode} onChange={(e) => setQCode(e.target.value)} placeholder="PHY-01" />
                  </div>
                  <div>
                    <Label className="text-xs">Subject Label</Label>
                    <Input className="mt-1 bg-white" value={qSubjectLabel} onChange={(e) => setQSubjectLabel(e.target.value)} placeholder="Physics / Core / Aptitude" />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Question Type</Label>
                  <div className="mt-2 grid gap-3 sm:grid-cols-3">
                    {(["mcq", "multi", "integer"] as QuestionType[]).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => { setQType(type); setQCorrect(0); setQCorrectMulti([]); }}
                        className={`rounded-2xl border px-4 py-4 text-left transition ${qType === type ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white hover:border-slate-300"}`}
                      >
                        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                          {type === "mcq" ? <CheckCircle2 size={16} /> : type === "multi" ? <CheckSquare size={16} /> : <Hash size={16} />}
                          {qTypeLabel[type]}
                        </div>
                        <p className="text-xs text-slate-500">
                          {type === "mcq" ? "Single correct option" : type === "multi" ? "More than one correct option" : "Numeric answer or range"}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Question</Label>
                  <Textarea className="mt-1 min-h-[110px] bg-white resize-none" value={qText} onChange={(e) => setQText(e.target.value)} placeholder="Type the question exactly as students should see it..." />
                </div>

                <div>
                  <Label className="text-xs">Question Image</Label>
                  <div className="mt-2">
                    {qImageData ? (
                      <div className="relative inline-block">
                        <img src={qImageData} alt="Question visual" className="max-h-44 rounded-xl border border-slate-200 object-contain" />
                        <button type="button" onClick={() => setQImageData(null)} className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-white">
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => imgInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 hover:border-indigo-400 hover:text-indigo-600">
                        <ImagePlus size={15} />
                        Upload question image
                      </button>
                    )}
                    <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    <input ref={optionImgInputRef} type="file" accept="image/*" className="hidden" onChange={handleOptionImageUpload} />
                  </div>
                </div>

                {(qType === "mcq" || qType === "multi") && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Options</Label>
                      <Button
                        type="button"
                        variant="outline"
                        className="bg-white"
                        onClick={() => {
                          setQOptions((prev) => [...prev, ""]);
                          setQOptionImages((prev) => [...prev, null]);
                        }}
                      >
                        <Plus size={13} className="mr-1" />
                        Add Option
                      </Button>
                    </div>
                    {qOptions.map((option, index) => {
                      const selected = qType === "mcq" ? qCorrect === index : qCorrectMulti.includes(index);
                      return (
                        <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                if (qType === "mcq") setQCorrect(index);
                                else setQCorrectMulti((prev) => prev.includes(index) ? prev.filter((item) => item !== index) : [...prev, index]);
                              }}
                              className={`flex h-7 w-7 shrink-0 items-center justify-center border-2 ${qType === "mcq" ? "rounded-full" : "rounded-md"} ${selected ? "border-indigo-500 bg-indigo-500 text-white" : "border-slate-300 bg-white"}`}
                            >
                              {selected ? (qType === "mcq" ? <div className="h-2.5 w-2.5 rounded-full bg-white" /> : <CheckCircle2 size={13} />) : null}
                            </button>
                            <span className="w-5 text-sm font-semibold">{String.fromCharCode(65 + index)}.</span>
                            <Input className="bg-white" value={option} onChange={(e) => setQOptions((prev) => prev.map((item, i) => i === index ? e.target.value : item))} placeholder={`Option ${String.fromCharCode(65 + index)}`} />
                            {qOptionImages[index] ? (
                              <div className="relative">
                                <img src={qOptionImages[index]!} alt="" className="h-10 w-10 rounded-lg border border-slate-200 object-cover" />
                                <button type="button" onClick={() => setQOptionImages((prev) => prev.map((item, i) => i === index ? null : item))} className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-white">
                                  <X size={9} />
                                </button>
                              </div>
                            ) : (
                              <button type="button" onClick={() => { activeOptIdxRef.current = index; optionImgInputRef.current?.click(); }} className="flex h-10 w-10 items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-400 hover:border-indigo-400 hover:text-indigo-600">
                                <ImagePlus size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {qType === "integer" && (
                  <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex gap-3">
                      <Button type="button" variant={qIntegerMode === "exact" ? "default" : "outline"} className={qIntegerMode === "exact" ? "" : "bg-white"} onClick={() => setQIntegerMode("exact")}>Exact</Button>
                      <Button type="button" variant={qIntegerMode === "range" ? "default" : "outline"} className={qIntegerMode === "range" ? "" : "bg-white"} onClick={() => setQIntegerMode("range")}>Range</Button>
                    </div>
                    {qIntegerMode === "exact" ? (
                      <div>
                        <Label className="text-xs">Correct Integer</Label>
                        <Input className="mt-1 max-w-xs bg-white" type="number" value={qCorrectInt} onChange={(e) => setQCorrectInt(e.target.value)} placeholder="42" />
                      </div>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <Label className="text-xs">Minimum</Label>
                          <Input className="mt-1 bg-white" type="number" value={qCorrectIntMin} onChange={(e) => setQCorrectIntMin(e.target.value)} />
                        </div>
                        <div>
                          <Label className="text-xs">Maximum</Label>
                          <Input className="mt-1 bg-white" type="number" value={qCorrectIntMax} onChange={(e) => setQCorrectIntMax(e.target.value)} />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Marks</Label>
                    <Input className="mt-1 bg-white" type="number" step="0.01" value={qPoints} onChange={(e) => setQPoints(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Negative Marks</Label>
                    <Input className="mt-1 bg-white" type="number" step="0.01" value={qNegativeMarks} onChange={(e) => setQNegativeMarks(e.target.value)} />
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <Button variant="outline" className="bg-white" onClick={resetForm}>Reset</Button>
                  <Button disabled={!canSaveQuestion() || addQuestionMutation.isPending} onClick={() => addQuestionMutation.mutate()}>
                    {addQuestionMutation.isPending ? "Adding..." : "Add Question"}
                  </Button>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-2xl font-semibold">Added Questions</h2>
                <p className="text-sm text-slate-500">{test.questions.length} total</p>
              </div>
              <div className="space-y-4">
                {test.questions.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">No questions yet. Start adding from the builder above.</div>
                ) : (
                  test.questions.map((question, index) => (
                    <div key={question.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">{index + 1}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="flex-1 text-base font-medium">{question.question}</p>
                            {question.subjectLabel && <span className="rounded-full bg-white px-2 py-1 text-[11px] text-slate-600">{question.subjectLabel}</span>}
                            {question.questionCode && <span className="rounded-full bg-white px-2 py-1 text-[11px] text-slate-600">{question.questionCode}</span>}
                            <span className="rounded-full bg-indigo-100 px-2 py-1 text-[11px] text-indigo-700">{qTypeLabel[question.questionType]}</span>
                          </div>
                          {question.imageData && <img src={question.imageData} alt="" className="mt-3 max-h-40 rounded-xl border border-slate-200 object-contain" />}
                          {question.questionType === "integer" ? (
                            <p className="mt-3 text-sm text-slate-600">
                              Correct: {question.correctAnswerMin !== null && question.correctAnswerMin !== undefined ? `${question.correctAnswerMin} - ${question.correctAnswerMax}` : question.correctAnswer}
                            </p>
                          ) : (
                            <div className="mt-3 grid gap-2 md:grid-cols-2">
                              {question.options.map((option, optIndex) => {
                                const correct = question.questionType === "multi"
                                  ? (question.correctAnswerMulti ?? []).includes(optIndex)
                                  : question.correctAnswer === optIndex;
                                return (
                                  <div key={optIndex} className={`rounded-xl border px-3 py-2 text-sm ${correct ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white"}`}>
                                    <div>{String.fromCharCode(65 + optIndex)}. {option}</div>
                                    {question.optionImages?.[optIndex] && <img src={question.optionImages[optIndex]!} alt="" className="mt-2 max-h-20 rounded border border-slate-200 object-contain" />}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                            <span>{question.points} marks</span>
                            <span>-{Number(question.negativeMarks ?? 0).toFixed(2)}</span>
                            <span>{question.sourceType ?? "manual"}</span>
                          </div>
                        </div>
                        <Button variant="ghost" className="text-rose-600" onClick={() => deleteQuestionMutation.mutate(question.id)}>
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
