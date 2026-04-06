import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useListClasses } from "@workspace/api-client-react";
import * as pdfjs from "pdfjs-dist";
import {
  AlertTriangle,
  BookOpen,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  FileQuestion,
  Hash,
  ImagePlus,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { DashboardScene, HoloGrid, TiltCard } from "@/components/dashboard-3d";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type QuestionType = "mcq" | "multi" | "integer";

interface QuestionReport {
  id: number;
  reporterName: string;
  reason: string | null;
  status: string;
  createdAt: string;
}

interface QuestionItem {
  id: number;
  question: string;
  questionType: QuestionType;
  options: string[];
  optionImages?: (string | null)[];
  correctAnswer: number | null;
  correctAnswerMulti: number[];
  correctAnswerMin?: number | null;
  correctAnswerMax?: number | null;
  explanation?: string | null;
  difficulty: string;
  points: number;
  imageData?: string | null;
  reportCount: number;
  openReportCount: number;
  reports: QuestionReport[];
}

interface ChapterItem {
  id: number;
  title: string;
  description?: string | null;
  questions: QuestionItem[];
}

interface SubjectItem {
  id: number;
  title: string;
  teacherId?: number | null;
  teacherName?: string | null;
  chapters: ChapterItem[];
}

interface ChapterDraftState {
  text: string;
  imageDataUrls: string[];
  uploadedFiles: string[];
}

interface QuestionBankResponse {
  class: { id: number; title: string; subject: string };
  subjects: SubjectItem[];
  savedBucket: QuestionItem[];
}

interface ReportQueueItem {
  id: number;
  questionId: number;
  questionText: string;
  reporterName: string;
  reason: string | null;
  status: string;
  createdAt: string;
}

interface EditorState {
  question: string;
  questionType: QuestionType;
  options: string[];
  optionImages: (string | null)[];
  imageData: string | null;
  correctAnswer: number;
  correctAnswerMulti: number[];
  correctAnswerInt: string;
  correctAnswerMin: string;
  correctAnswerMax: string;
  integerMode: "exact" | "range";
  explanation: string;
  difficulty: string;
  points: string;
}

interface ExtractedDraft extends EditorState {
  hasImage: boolean;
}

const emptyEditor = (): EditorState => ({
  question: "",
  questionType: "mcq",
  options: ["", "", "", ""],
  optionImages: [null, null, null, null],
  imageData: null,
  correctAnswer: 0,
  correctAnswerMulti: [],
  correctAnswerInt: "",
  correctAnswerMin: "",
  correctAnswerMax: "",
  integerMode: "exact",
  explanation: "",
  difficulty: "medium",
  points: "1",
});

function questionTypeIcon(type: QuestionType) {
  if (type === "multi") return <CheckSquare size={13} />;
  if (type === "integer") return <Hash size={13} />;
  return <FileQuestion size={13} />;
}

function questionTypeLabel(type: QuestionType) {
  if (type === "multi") return "Multi";
  if (type === "integer") return "Integer";
  return "MCQ";
}

function editorFromQuestion(question: QuestionItem): EditorState {
  return {
    question: question.question,
    questionType: question.questionType,
    options: question.options.length > 0 ? [...question.options] : ["", "", "", ""],
    optionImages: question.options.length > 0
      ? Array.from({ length: question.options.length }, (_, index) => question.optionImages?.[index] ?? null)
      : [null, null, null, null],
    imageData: question.imageData ?? null,
    correctAnswer: question.correctAnswer ?? 0,
    correctAnswerMulti: [...(question.correctAnswerMulti ?? [])],
    correctAnswerInt: question.correctAnswer !== null && question.correctAnswer !== undefined ? String(question.correctAnswer) : "",
    correctAnswerMin: question.correctAnswerMin !== null && question.correctAnswerMin !== undefined ? String(question.correctAnswerMin) : "",
    correctAnswerMax: question.correctAnswerMax !== null && question.correctAnswerMax !== undefined ? String(question.correctAnswerMax) : "",
    integerMode: question.correctAnswerMin !== null && question.correctAnswerMin !== undefined ? "range" : "exact",
    explanation: question.explanation ?? "",
    difficulty: question.difficulty ?? "medium",
    points: String(question.points ?? 1),
  };
}

function buildPayload(editor: EditorState) {
  const payload: Record<string, unknown> = {
    question: editor.question,
    questionType: editor.questionType,
    explanation: editor.explanation || undefined,
    difficulty: editor.difficulty,
    points: parseInt(editor.points, 10) || 1,
    imageData: editor.imageData ?? undefined,
  };

  if (editor.questionType === "integer") {
    payload.options = [];
    if (editor.integerMode === "range") {
      payload.correctAnswerMin = parseInt(editor.correctAnswerMin, 10);
      payload.correctAnswerMax = parseInt(editor.correctAnswerMax, 10);
    } else {
      payload.correctAnswer = parseInt(editor.correctAnswerInt, 10);
    }
    return payload;
  }

  const cleanOptions = editor.options.map((option) => option.trim()).filter(Boolean);
  payload.options = cleanOptions;
  payload.optionImages = cleanOptions.map((_option, index) => editor.optionImages[index] ?? null);

  if (editor.questionType === "multi") {
    payload.correctAnswerMulti = editor.correctAnswerMulti;
  } else {
    payload.correctAnswer = editor.correctAnswer;
  }

  return payload;
}

export default function AdminQuestionBank() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: classes = [] } = useListClasses();
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [expandedSubjects, setExpandedSubjects] = useState<Set<number>>(new Set());
  const [expandedChapters, setExpandedChapters] = useState<Set<number>>(new Set());
  const [editorByChapter, setEditorByChapter] = useState<Record<number, EditorState>>({});
  const [importAssetsByChapter, setImportAssetsByChapter] = useState<Record<number, ChapterDraftState>>({});
  const [aiDraftsByChapter, setAiDraftsByChapter] = useState<Record<number, ExtractedDraft[]>>({});
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null);
  const [editingState, setEditingState] = useState<EditorState>(emptyEditor());
  const [newSubjectTitle, setNewSubjectTitle] = useState("");
  const [newSubjectDescription, setNewSubjectDescription] = useState("");
  const [newChapterBySubject, setNewChapterBySubject] = useState<Record<number, { title: string; description: string }>>({});
  const imageInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const pdfInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const classOptions = useMemo(() => classes, [classes]);

  const { data, isLoading } = useQuery<QuestionBankResponse>({
    queryKey: ["admin-question-bank", selectedClassId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/question-bank/classes/${selectedClassId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load question bank");
      return r.json();
    },
    enabled: !!selectedClassId,
  });

  const { data: reports = [] } = useQuery<ReportQueueItem[]>({
    queryKey: ["question-bank-reports"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/question-bank/reports`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load reports");
      return r.json();
    },
  });

  const dashboardStats = useMemo(() => {
    let subjects = 0;
    let chapters = 0;
    let questions = 0;
    let easy = 0;
    let medium = 0;
    let hard = 0;

    if (data) {
      subjects = data.subjects.length;
      data.subjects.forEach((subject) => {
        chapters += subject.chapters.length;
        subject.chapters.forEach((chapter) => {
          questions += chapter.questions.length;
          chapter.questions.forEach((question) => {
            if (question.difficulty === "easy") easy += 1;
            else if (question.difficulty === "hard") hard += 1;
            else medium += 1;
          });
        });
      });
    }

    return {
      subjects,
      chapters,
      questions,
      easy,
      medium,
      hard,
      openReports: reports.filter((item) => item.status === "open").length,
    };
  }, [data, reports]);

  const addQuestionMutation = useMutation({
    mutationFn: async ({ chapterId, payload }: { chapterId: number; payload: Record<string, unknown> }) => {
      const r = await fetch(`${BASE}/api/chapters/${chapterId}/question-bank-questions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const payload = await r.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to add question");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-question-bank", selectedClassId] });
      toast({ title: "Question added" });
    },
    onError: (err: Error) => toast({ title: "Could not add question", description: err.message, variant: "destructive" }),
  });

  const aiExtractMutation = useMutation({
    mutationFn: async ({ chapterId, rawText, imageDataUrls }: { chapterId: number; rawText: string; imageDataUrls: string[] }) => {
      const r = await fetch(`${BASE}/api/chapters/${chapterId}/question-bank-questions/ai-extract`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText, imageDataUrls }),
      });
      const payload = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(payload.error ?? "Failed to extract questions");
      }
      return payload as { questions: ExtractedDraft[] };
    },
    onSuccess: (payload, variables) => {
      setAiDraftsByChapter((prev) => ({
        ...prev,
        [variables.chapterId]: payload.questions.map((draft) => ({
          ...draft,
          optionImages: draft.optionImages ?? Array.from({ length: draft.options.length }, () => null),
          imageData: draft.imageData ?? null,
        })),
      }));
      toast({
        title: payload.questions.length > 0 ? "AI extraction complete" : "No questions found",
        description: payload.questions.length > 0
          ? `${payload.questions.length} question drafts ready for review.`
          : "This input could not be converted into drafts. Try cleaner text or add questions manually.",
        variant: payload.questions.length > 0 ? "default" : "destructive",
      });
    },
    onError: (err: Error) => toast({ title: "AI extraction failed", description: err.message, variant: "destructive" }),
  });

  const bulkSaveMutation = useMutation({
    mutationFn: async ({ chapterId, drafts }: { chapterId: number; drafts: ExtractedDraft[] }) => {
      const r = await fetch(`${BASE}/api/chapters/${chapterId}/question-bank-questions/bulk`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: drafts.map((draft) => buildPayload(draft)) }),
      });
      const payload = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(payload.error ?? "Failed to save extracted questions");
      }
      return payload;
    },
    onSuccess: (_payload, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-question-bank", selectedClassId] });
      setAiDraftsByChapter((prev) => ({ ...prev, [variables.chapterId]: [] }));
      setImportAssetsByChapter((prev) => ({ ...prev, [variables.chapterId]: { text: "", imageDataUrls: [], uploadedFiles: [] } }));
      toast({ title: "AI questions saved", description: "Extracted questions were added to this chapter." });
    },
    onError: (err: Error) => toast({ title: "Bulk save failed", description: err.message, variant: "destructive" }),
  });

  const updateQuestionMutation = useMutation({
    mutationFn: async ({ questionId, payload }: { questionId: number; payload: Record<string, unknown> }) => {
      const r = await fetch(`${BASE}/api/question-bank-questions/${questionId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const payload = await r.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to update question");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-question-bank", selectedClassId] });
      queryClient.invalidateQueries({ queryKey: ["question-bank-reports"] });
      setEditingQuestionId(null);
      setEditingState(emptyEditor());
      toast({ title: "Question updated", description: "Open reports on this question are resolved automatically." });
    },
    onError: (err: Error) => toast({ title: "Could not update question", description: err.message, variant: "destructive" }),
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${BASE}/api/question-bank-questions/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-question-bank", selectedClassId] });
      queryClient.invalidateQueries({ queryKey: ["question-bank-reports"] });
      toast({ title: "Question removed" });
    },
  });

  const addSubjectMutation = useMutation({
    mutationFn: async ({ classId, title, description }: { classId: string; title: string; description: string }) => {
      const r = await fetch(`${BASE}/api/question-bank/classes/${classId}/subjects`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });
      const payload = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(payload.error ?? "Failed to add subject");
      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-question-bank", selectedClassId] });
      setNewSubjectTitle("");
      setNewSubjectDescription("");
      toast({ title: "Subject added" });
    },
    onError: (err: Error) => toast({ title: "Could not add subject", description: err.message, variant: "destructive" }),
  });

  const addChapterMutation = useMutation({
    mutationFn: async ({ subjectId, title, description }: { subjectId: number; title: string; description: string }) => {
      const r = await fetch(`${BASE}/api/question-bank/subjects/${subjectId}/chapters`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });
      const payload = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(payload.error ?? "Failed to add chapter");
      return payload;
    },
    onSuccess: (_payload, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-question-bank", selectedClassId] });
      setExpandedSubjects((prev) => new Set(prev).add(variables.subjectId));
      setNewChapterBySubject((prev) => ({ ...prev, [variables.subjectId]: { title: "", description: "" } }));
      toast({ title: "Chapter added" });
    },
    onError: (err: Error) => toast({ title: "Could not add chapter", description: err.message, variant: "destructive" }),
  });

  const setChapterEditor = (chapterId: number, updater: (prev: EditorState) => EditorState) => {
    setEditorByChapter((prev) => ({ ...prev, [chapterId]: updater(prev[chapterId] ?? emptyEditor()) }));
  };

  const setAiDraft = (chapterId: number, index: number, updater: (prev: ExtractedDraft) => ExtractedDraft) => {
    setAiDraftsByChapter((prev) => {
      const current = prev[chapterId] ?? [];
      return {
        ...prev,
        [chapterId]: current.map((item, itemIndex) => (itemIndex === index ? updater(item) : item)),
      };
    });
  };

  const getImportState = (chapterId: number): ChapterDraftState => importAssetsByChapter[chapterId] ?? { text: "", imageDataUrls: [], uploadedFiles: [] };

  const setImportState = (chapterId: number, updater: (prev: ChapterDraftState) => ChapterDraftState) => {
    setImportAssetsByChapter((prev) => ({ ...prev, [chapterId]: updater(getImportState(chapterId)) }));
  };

  const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });

  const extractPdfText = async (file: File) => {
    const bytes = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: bytes }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) {
        pages.push(`Page ${pageNumber}: ${text}`);
      }
    }
    return pages.join("\n\n");
  };

  const handleImageUpload = async (chapterId: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      const entries = await Promise.all(Array.from(files).map(async (file) => ({
        fileName: file.name,
        dataUrl: await readFileAsDataUrl(file),
      })));
      setImportState(chapterId, (prev) => ({
        ...prev,
        imageDataUrls: [...prev.imageDataUrls, ...entries.map((entry) => entry.dataUrl)],
        uploadedFiles: [...prev.uploadedFiles, ...entries.map((entry) => `Image: ${entry.fileName}`)],
      }));
      toast({ title: "Images attached", description: `${entries.length} image file added for AI extraction.` });
    } catch (error) {
      toast({ title: "Image upload failed", description: error instanceof Error ? error.message : "Could not read image", variant: "destructive" });
    }
  };

  const handlePdfUpload = async (chapterId: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      let appendedText = "";
      const uploadedLabels: string[] = [];
      for (const file of Array.from(files)) {
        const text = await extractPdfText(file);
        appendedText += `${appendedText ? "\n\n" : ""}${text}`;
        uploadedLabels.push(`PDF: ${file.name}`);
      }
      setImportState(chapterId, (prev) => ({
        ...prev,
        text: [prev.text, appendedText].filter(Boolean).join("\n\n").trim(),
        uploadedFiles: [...prev.uploadedFiles, ...uploadedLabels],
      }));
      toast({ title: "PDF parsed", description: `${files.length} PDF file added as extraction text.` });
    } catch (error) {
      toast({ title: "PDF upload failed", description: error instanceof Error ? error.message : "Could not parse PDF", variant: "destructive" });
    }
  };

  const renderEditor = (editor: EditorState, onChange: (updater: (prev: EditorState) => EditorState) => void, footer?: React.ReactNode) => (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label className="text-xs">Question</Label>
          <Textarea value={editor.question} onChange={(e) => onChange((prev) => ({ ...prev, question: e.target.value }))} rows={3} placeholder="Enter question text" />
        </div>
        <div className="md:col-span-2 space-y-2">
          <Label className="text-xs">Question Image</Label>
          <div className="flex gap-2 flex-wrap">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              id={`question-image-upload-${Math.random().toString(36).slice(2)}`}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                void readFileAsDataUrl(file).then((dataUrl) => {
                  onChange((prev) => ({ ...prev, imageData: dataUrl }));
                });
                e.currentTarget.value = "";
              }}
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={(e) => {
                const input = (e.currentTarget.parentElement?.previousElementSibling?.querySelector("input[type='file']") as HTMLInputElement | null);
                input?.click();
              }}
            >
              <ImagePlus size={13} className="mr-1" /> Add Question Image
            </Button>
            {editor.imageData && (
              <Button type="button" size="sm" variant="ghost" onClick={() => onChange((prev) => ({ ...prev, imageData: null }))}>
                Remove Image
              </Button>
            )}
          </div>
          {editor.imageData && <img src={editor.imageData} alt="Question" className="max-h-40 rounded-lg border border-border object-contain bg-black/10 p-2" />}
        </div>
        <div>
          <Label className="text-xs">Type</Label>
          <select
            value={editor.questionType}
            onChange={(e) => onChange((prev) => ({ ...prev, questionType: e.target.value as QuestionType, correctAnswerMulti: [], correctAnswer: 0 }))}
            className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="mcq">MCQ</option>
            <option value="multi">Multi-select</option>
            <option value="integer">Integer</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">Difficulty</Label>
          <select
            value={editor.difficulty}
            onChange={(e) => onChange((prev) => ({ ...prev, difficulty: e.target.value }))}
            className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
      </div>

      {editor.questionType !== "integer" ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs">Options</Label>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onChange((prev) => ({ ...prev, options: [...prev.options, ""], optionImages: [...prev.optionImages, null] }))}
            >
              Add Option
            </Button>
          </div>
          {editor.options.map((option, index) => (
            <div key={index} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  value={option}
                  onChange={(e) => onChange((prev) => {
                    const options = [...prev.options];
                    options[index] = e.target.value;
                    return { ...prev, options };
                  })}
                  placeholder={`Option ${String.fromCharCode(65 + index)}`}
                />
                {editor.questionType === "mcq" ? (
                  <Button type="button" size="sm" variant={editor.correctAnswer === index ? "default" : "outline"} onClick={() => onChange((prev) => ({ ...prev, correctAnswer: index }))}>
                    Correct
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant={editor.correctAnswerMulti.includes(index) ? "default" : "outline"}
                    onClick={() => onChange((prev) => ({
                      ...prev,
                      correctAnswerMulti: prev.correctAnswerMulti.includes(index)
                        ? prev.correctAnswerMulti.filter((item) => item !== index)
                        : [...prev.correctAnswerMulti, index],
                    }))}
                  >
                    Select
                  </Button>
                )}
                {editor.options.length > 2 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => onChange((prev) => {
                      const options = prev.options.filter((_, itemIndex) => itemIndex !== index);
                      const optionImages = prev.optionImages.filter((_, itemIndex) => itemIndex !== index);
                      const nextCorrectAnswer = prev.correctAnswer > index ? prev.correctAnswer - 1 : prev.correctAnswer;
                      const nextCorrectAnswerMulti = prev.correctAnswerMulti
                        .filter((itemIndex) => itemIndex !== index)
                        .map((itemIndex) => (itemIndex > index ? itemIndex - 1 : itemIndex));
                      return {
                        ...prev,
                        options,
                        optionImages,
                        correctAnswer: Math.min(nextCorrectAnswer, Math.max(options.length - 1, 0)),
                        correctAnswerMulti: nextCorrectAnswerMulti,
                      };
                    })}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  id={`option-image-upload-${index}-${Math.random().toString(36).slice(2)}`}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void readFileAsDataUrl(file).then((dataUrl) => {
                      onChange((prev) => {
                        const optionImages = [...prev.optionImages];
                        optionImages[index] = dataUrl;
                        return { ...prev, optionImages };
                      });
                    });
                    e.currentTarget.value = "";
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    const input = (e.currentTarget.parentElement?.querySelector("input[type='file']") as HTMLInputElement | null);
                    input?.click();
                  }}
                >
                  <ImagePlus size={13} className="mr-1" /> Option Image
                </Button>
                {editor.optionImages[index] && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onChange((prev) => {
                      const optionImages = [...prev.optionImages];
                      optionImages[index] = null;
                      return { ...prev, optionImages };
                    })}
                  >
                    Remove Image
                  </Button>
                )}
              </div>
              {editor.optionImages[index] && <img src={editor.optionImages[index] ?? ""} alt={`Option ${index + 1}`} className="max-h-32 rounded-lg border border-border object-contain bg-black/10 p-2" />}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label className="text-xs">Mode</Label>
            <select
              value={editor.integerMode}
              onChange={(e) => onChange((prev) => ({ ...prev, integerMode: e.target.value as "exact" | "range" }))}
              className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="exact">Exact</option>
              <option value="range">Range</option>
            </select>
          </div>
          {editor.integerMode === "exact" ? (
            <div>
              <Label className="text-xs">Correct Answer</Label>
              <Input value={editor.correctAnswerInt} onChange={(e) => onChange((prev) => ({ ...prev, correctAnswerInt: e.target.value }))} placeholder="42" />
            </div>
          ) : (
            <>
              <div>
                <Label className="text-xs">Min</Label>
                <Input value={editor.correctAnswerMin} onChange={(e) => onChange((prev) => ({ ...prev, correctAnswerMin: e.target.value }))} placeholder="10" />
              </div>
              <div>
                <Label className="text-xs">Max</Label>
                <Input value={editor.correctAnswerMax} onChange={(e) => onChange((prev) => ({ ...prev, correctAnswerMax: e.target.value }))} placeholder="20" />
              </div>
            </>
          )}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label className="text-xs">Points</Label>
          <Input value={editor.points} onChange={(e) => onChange((prev) => ({ ...prev, points: e.target.value }))} placeholder="1" />
        </div>
        <div>
          <Label className="text-xs">Explanation</Label>
          <Textarea value={editor.explanation} onChange={(e) => onChange((prev) => ({ ...prev, explanation: e.target.value }))} rows={2} placeholder="Optional explanation" />
        </div>
      </div>

      {footer ? <div className="flex gap-2 flex-wrap">{footer}</div> : null}
    </div>
  );

  return (
    <div className="space-y-6">
      <DashboardScene accent="from-cyan-500/20 via-blue-500/10 to-pink-500/20">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_380px]">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-700 dark:text-cyan-100/90">
              <BookOpen size={12} />
              Question Bank Control
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground dark:text-white">Question Bank</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground dark:text-slate-300">
                Test-format questions, student reports, and instant subject-teacher updates from one teacher command surface.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <TiltCard className="rounded-3xl" glare={false}>
                <div className="surface-3d rounded-3xl p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-white/50">Subjects</p>
                  <p className="mt-2 text-3xl font-bold text-foreground dark:text-white">{dashboardStats.subjects}</p>
                  <p className="mt-1 text-xs text-muted-foreground dark:text-white/55">Teacher-owned question tracks</p>
                </div>
              </TiltCard>
              <TiltCard className="rounded-3xl" glare={false}>
                <div className="surface-3d rounded-3xl p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-white/50">Chapters</p>
                  <p className="mt-2 text-3xl font-bold text-foreground dark:text-white">{dashboardStats.chapters}</p>
                  <p className="mt-1 text-xs text-muted-foreground dark:text-white/55">Structured content blocks</p>
                </div>
              </TiltCard>
              <TiltCard className="rounded-3xl" glare={false}>
                <div className="surface-3d rounded-3xl p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-white/50">Questions</p>
                  <p className="mt-2 text-3xl font-bold text-foreground dark:text-white">{dashboardStats.questions}</p>
                  <p className="mt-1 text-xs text-muted-foreground dark:text-white/55">Live items across this bank</p>
                </div>
              </TiltCard>
              <TiltCard className="rounded-3xl" glare={false}>
                <div className="surface-3d rounded-3xl p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-white/50">Open Reports</p>
                  <p className="mt-2 text-3xl font-bold text-foreground dark:text-white">{dashboardStats.openReports}</p>
                  <p className="mt-1 text-xs text-muted-foreground dark:text-white/55">Student issues waiting for action</p>
                </div>
              </TiltCard>
            </div>
          </div>

          <TiltCard className="rounded-3xl">
            <HoloGrid title="Difficulty Mix" subtitle="Keep coverage balanced while expanding chapters and AI imports.">
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-100/70">Easy</p>
                    <p className="mt-2 text-2xl font-bold text-foreground dark:text-white">{dashboardStats.easy}</p>
                  </div>
                  <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-amber-700 dark:text-amber-100/70">Medium</p>
                    <p className="mt-2 text-2xl font-bold text-foreground dark:text-white">{dashboardStats.medium}</p>
                  </div>
                  <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-rose-700 dark:text-rose-100/70">Hard</p>
                    <p className="mt-2 text-2xl font-bold text-foreground dark:text-white">{dashboardStats.hard}</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                  <p className="text-sm font-medium text-foreground dark:text-white">Analysis focus</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground dark:text-white/60">
                    Watch report pressure and difficulty mix together. This helps keep question quality stable before students enter practice mode or timed chapter tests.
                  </p>
                </div>
              </div>
            </HoloGrid>
          </TiltCard>
        </div>
      </DashboardScene>

      {reports.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle size={16} className="text-amber-500" />Report Queue</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {reports.map((report) => (
              <div key={report.id} className="rounded-xl border border-border p-3 flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={report.status === "open" ? "destructive" : "secondary"}>{report.status}</Badge>
                    <span className="text-sm font-medium">{report.questionText}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Reported by {report.reporterName}</p>
                  {report.reason && <p className="text-sm text-muted-foreground">{report.reason}</p>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <TiltCard className="rounded-3xl">
      <Card>
        <CardContent className="p-4">
          <Label className="text-xs">Select Batch / Class</Label>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Select class</option>
            {classOptions.map((cls) => (
              <option key={cls.id} value={cls.id}>{cls.title}</option>
            ))}
          </select>
        </CardContent>
      </Card>
      </TiltCard>

      {selectedClassId && (
        <TiltCard className="rounded-3xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Plus size={16} className="text-primary" />Build Subject Structure</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-[1.2fr_1.4fr_auto] items-end">
            <div>
              <Label className="text-xs">New Subject</Label>
              <Input value={newSubjectTitle} onChange={(e) => setNewSubjectTitle(e.target.value)} placeholder="Physics" />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Input value={newSubjectDescription} onChange={(e) => setNewSubjectDescription(e.target.value)} placeholder="Optional subject note" />
            </div>
            <Button
              onClick={() => addSubjectMutation.mutate({ classId: selectedClassId, title: newSubjectTitle, description: newSubjectDescription })}
              disabled={!newSubjectTitle.trim() || addSubjectMutation.isPending}
            >
              {addSubjectMutation.isPending ? "Adding..." : "Add Subject"}
            </Button>
          </CardContent>
        </Card>
        </TiltCard>
      )}

      {!selectedClassId ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Select a batch to open its question bank.</CardContent></Card>
      ) : isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : !data || data.subjects.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No subjects found for this batch.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {data.subjects.map((subject) => {
            const subjectOpen = expandedSubjects.has(subject.id);
            return (
              <Card key={subject.id}>
                <CardHeader className="py-4">
                  <button className="flex items-center gap-3 text-left" onClick={() => setExpandedSubjects((prev) => {
                    const next = new Set(prev); next.has(subject.id) ? next.delete(subject.id) : next.add(subject.id); return next;
                  })}>
                    {subjectOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <CardTitle className="text-base">{subject.title}</CardTitle>
                    {subject.teacherName && <Badge variant="outline">{subject.teacherName}</Badge>}
                  </button>
                </CardHeader>
                {subjectOpen && (
                  <CardContent className="space-y-3">
                    <div className="rounded-lg border border-border p-3 space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Plus size={14} className="text-primary" /> Add chapter
                      </div>
                      <div className="grid gap-3 md:grid-cols-[1.1fr_1.3fr_auto] items-end">
                        <div>
                          <Label className="text-xs">Chapter Title</Label>
                          <Input
                            value={newChapterBySubject[subject.id]?.title ?? ""}
                            onChange={(e) => setNewChapterBySubject((prev) => ({ ...prev, [subject.id]: { title: e.target.value, description: prev[subject.id]?.description ?? "" } }))}
                            placeholder="Kinematics"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Description</Label>
                          <Input
                            value={newChapterBySubject[subject.id]?.description ?? ""}
                            onChange={(e) => setNewChapterBySubject((prev) => ({ ...prev, [subject.id]: { title: prev[subject.id]?.title ?? "", description: e.target.value } }))}
                            placeholder="Optional chapter note"
                          />
                        </div>
                        <Button
                          onClick={() => addChapterMutation.mutate({
                            subjectId: subject.id,
                            title: newChapterBySubject[subject.id]?.title ?? "",
                            description: newChapterBySubject[subject.id]?.description ?? "",
                          })}
                          disabled={!(newChapterBySubject[subject.id]?.title ?? "").trim() || addChapterMutation.isPending}
                        >
                          {addChapterMutation.isPending ? "Adding..." : "Add Chapter"}
                        </Button>
                      </div>
                    </div>

                    {subject.chapters.map((chapter) => {
                      const chapterOpen = expandedChapters.has(chapter.id);
                      const chapterEditor = editorByChapter[chapter.id] ?? emptyEditor();
                      const importState = getImportState(chapter.id);
                      const aiDrafts = aiDraftsByChapter[chapter.id] ?? [];
                      return (
                        <div key={chapter.id} className="rounded-xl border border-border overflow-hidden">
                          <button className="w-full flex items-center gap-3 p-3 text-left bg-muted/30" onClick={() => setExpandedChapters((prev) => {
                            const next = new Set(prev); next.has(chapter.id) ? next.delete(chapter.id) : next.add(chapter.id); return next;
                          })}>
                            {chapterOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                            <span className="font-medium text-sm">{chapter.title}</span>
                            <Badge variant="secondary">{chapter.questions.length} questions</Badge>
                          </button>
                          {chapterOpen && (
                            <div className="p-3 space-y-3">
                              <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4 space-y-3">
                                <div className="flex items-center gap-2 text-sm font-medium">
                                  <Sparkles size={14} className="text-primary" /> AI Question Extraction
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Paste raw questions, upload PDF, or attach images. AI will turn them into editable drafts before saving.
                                </p>
                                <Textarea
                                  value={importState.text}
                                  onChange={(e) => setImportState(chapter.id, (prev) => ({ ...prev, text: e.target.value }))}
                                  rows={6}
                                  placeholder="Paste raw question text here..."
                                />
                                <div className="flex gap-2 flex-wrap">
                                  <input
                                    ref={(node) => {
                                      imageInputRefs.current[chapter.id] = node;
                                    }}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="hidden"
                                    onChange={(e) => {
                                      void handleImageUpload(chapter.id, e.target.files);
                                      e.currentTarget.value = "";
                                    }}
                                  />
                                  <input
                                    ref={(node) => {
                                      pdfInputRefs.current[chapter.id] = node;
                                    }}
                                    type="file"
                                    accept="application/pdf"
                                    multiple
                                    className="hidden"
                                    onChange={(e) => {
                                      void handlePdfUpload(chapter.id, e.target.files);
                                      e.currentTarget.value = "";
                                    }}
                                  />
                                  <Button type="button" size="sm" variant="outline" onClick={() => imageInputRefs.current[chapter.id]?.click()}>
                                    <ImagePlus size={13} className="mr-1" /> Upload Image
                                  </Button>
                                  <Button type="button" size="sm" variant="outline" onClick={() => pdfInputRefs.current[chapter.id]?.click()}>
                                    <Upload size={13} className="mr-1" /> Upload PDF
                                  </Button>
                                </div>
                                {importState.uploadedFiles.length > 0 && (
                                  <div className="flex gap-2 flex-wrap">
                                    {importState.uploadedFiles.map((fileName) => (
                                      <Badge key={fileName} variant="secondary">{fileName}</Badge>
                                    ))}
                                  </div>
                                )}
                                <div className="flex gap-2 flex-wrap">
                                  <Button
                                    size="sm"
                                    onClick={() => aiExtractMutation.mutate({ chapterId: chapter.id, rawText: importState.text, imageDataUrls: importState.imageDataUrls })}
                                    disabled={(!importState.text.trim() && importState.imageDataUrls.length === 0) || aiExtractMutation.isPending}
                                  >
                                    {aiExtractMutation.isPending ? "Extracting..." : "Extract With AI"}
                                  </Button>
                                  {aiDrafts.length > 0 && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => bulkSaveMutation.mutate({ chapterId: chapter.id, drafts: aiDrafts })}
                                      disabled={bulkSaveMutation.isPending}
                                    >
                                      {bulkSaveMutation.isPending ? "Saving..." : `Save ${aiDrafts.length} Drafts`}
                                    </Button>
                                  )}
                                </div>
                              </div>

                              {aiDrafts.length > 0 && (
                                <div className="space-y-3 rounded-lg border border-border p-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <div>
                                      <p className="text-sm font-medium">AI Preview</p>
                                      <p className="text-xs text-muted-foreground">Review and edit each draft before saving to the question bank.</p>
                                    </div>
                                    <Badge variant="secondary">{aiDrafts.length} drafts</Badge>
                                  </div>
                                  {aiDrafts.map((draft, index) => (
                                    <div key={`${chapter.id}-draft-${index}`} className="space-y-2 rounded-lg border border-border p-3">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <Badge variant="outline">Draft {index + 1}</Badge>
                                        {draft.hasImage && <Badge variant="destructive">Needs image review</Badge>}
                                      </div>
                                      {draft.hasImage && (
                                        <p className="text-xs text-amber-600">
                                          AI marked this question as image-dependent. Review it carefully before saving.
                                        </p>
                                      )}
                                      {renderEditor(
                                        draft,
                                        (updater) => setAiDraft(chapter.id, index, updater as (prev: ExtractedDraft) => ExtractedDraft),
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="text-destructive hover:text-destructive"
                                          onClick={() => setAiDraftsByChapter((prev) => ({
                                            ...prev,
                                            [chapter.id]: (prev[chapter.id] ?? []).filter((_, itemIndex) => itemIndex !== index),
                                          }))}
                                        >
                                          Remove Draft
                                        </Button>,
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {chapter.questions.map((item) => (
                                <div key={item.id} className="rounded-lg border border-border p-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-2 flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <Badge variant="outline" className="gap-1">{questionTypeIcon(item.questionType)}{questionTypeLabel(item.questionType)}</Badge>
                                        <Badge variant="outline">{item.difficulty}</Badge>
                                        <Badge variant="secondary">{item.points} pts</Badge>
                                        {item.openReportCount > 0 && <Badge variant="destructive">{item.openReportCount} open report</Badge>}
                                      </div>
                                      <p className="text-sm font-medium">{item.question}</p>
                                      {item.imageData && <img src={item.imageData} alt="Question" className="max-h-52 rounded-lg border border-border object-contain bg-black/10 p-2" />}
                                      {item.questionType !== "integer" && item.options.length > 0 && (
                                        <div className="grid gap-2 md:grid-cols-2">
                                          {item.options.map((option, index) => {
                                            const isCorrect = item.questionType === "multi"
                                              ? item.correctAnswerMulti.includes(index)
                                              : item.correctAnswer === index;
                                            return (
                                              <div key={index} className={`rounded-md border px-3 py-2 text-sm ${isCorrect ? "border-green-500 bg-green-50 dark:bg-green-950/20" : "border-border"}`}>
                                                {String.fromCharCode(65 + index)}. {option}
                                                {item.optionImages?.[index] && <img src={item.optionImages[index] ?? ""} alt={`Option ${index + 1}`} className="mt-2 max-h-28 rounded border border-border object-contain bg-black/10 p-1.5" />}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                      {item.questionType === "integer" && (
                                        <p className="text-xs text-muted-foreground">
                                          Answer: {item.correctAnswerMin !== null && item.correctAnswerMin !== undefined
                                            ? `${item.correctAnswerMin} to ${item.correctAnswerMax}`
                                            : item.correctAnswer}
                                        </p>
                                      )}
                                      {item.explanation && <p className="text-xs text-muted-foreground">{item.explanation}</p>}
                                      {item.reports.length > 0 && (
                                        <div className="space-y-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 p-3">
                                          {item.reports.map((report) => (
                                            <div key={report.id} className="text-xs">
                                              <span className="font-medium">{report.reporterName}</span>: {report.reason || "Reported issue"}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Button size="sm" variant="outline" onClick={() => {
                                        setEditingQuestionId(item.id);
                                        setEditingState(editorFromQuestion(item));
                                      }}>
                                        <Pencil size={13} className="mr-1" /> Edit
                                      </Button>
                                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => {
                                        if (confirm("Delete this question?")) deleteQuestionMutation.mutate(item.id);
                                      }}>
                                        <Trash2 size={13} />
                                      </Button>
                                    </div>
                                  </div>

                                  {editingQuestionId === item.id && (
                                    <div className="mt-3">
                                      {renderEditor(
                                        editingState,
                                        (updater) => setEditingState((prev) => updater(prev)),
                                        <>
                                          <Button size="sm" onClick={() => updateQuestionMutation.mutate({ questionId: item.id, payload: buildPayload(editingState) })} disabled={updateQuestionMutation.isPending}>
                                            <Save size={13} className="mr-1" />
                                            {updateQuestionMutation.isPending ? "Saving..." : "Save Question"}
                                          </Button>
                                          <Button size="sm" variant="ghost" onClick={() => setEditingQuestionId(null)}>Cancel</Button>
                                        </>,
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}

                              <div className="pt-2 border-t border-dashed border-border">
                                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                                  <Plus size={14} className="text-primary" /> Add question in test format
                                </div>
                                {renderEditor(
                                  chapterEditor,
                                  (updater) => setChapterEditor(chapter.id, updater),
                                  <Button size="sm" onClick={() => addQuestionMutation.mutate({ chapterId: chapter.id, payload: buildPayload(chapterEditor) })} disabled={addQuestionMutation.isPending}>
                                    <Save size={13} className="mr-1" />
                                    {addQuestionMutation.isPending ? "Saving..." : "Save Question"}
                                  </Button>,
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
