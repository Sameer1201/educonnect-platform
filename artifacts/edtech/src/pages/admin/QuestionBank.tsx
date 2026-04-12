import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRightLeft,
  BarChart3,
  BookOpen,
  CheckSquare,
  Download,
  FileQuestion,
  Hash,
  ImagePlus,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { DashboardScene, HoloGrid, TiltCard } from "@/components/dashboard-3d";
import { optimizeImageToDataUrl } from "@/lib/imageUpload";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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
  topicTag?: string | null;
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
  targetQuestions?: number | null;
  questions: QuestionItem[];
}

interface SubjectItem {
  id: number;
  title: string;
  teacherId?: number | null;
  teacherName?: string | null;
  chapters: ChapterItem[];
}

interface QuestionBankResponse {
  class: { id: number; title: string; subject: string };
  subjects: SubjectItem[];
  savedBucket: QuestionItem[];
}

interface QuestionBankExamSummary {
  key: string;
  label: string;
  subjectCount: number;
  chapterCount: number;
  questionCount: number;
}

interface QuestionBankExamResponse {
  exam: { key: string; label: string };
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
  topicTag: string;
  difficulty: string;
  points: string;
}

type BulkRowRecord = Record<string, string | number | boolean | null | undefined>;

interface QuestionBankTransferBundle {
  version?: number;
  exportedAt?: string;
  chapter?: {
    id?: number;
    title?: string;
    description?: string | null;
  };
  questions?: Array<Record<string, unknown>>;
}

interface QuestionBankExamTransferBundle {
  version?: number;
  exportedAt?: string;
  exam?: {
    key?: string;
    label?: string;
  };
  subjects?: Array<{
    title?: string;
    chapters?: Array<{
      title?: string;
      description?: string | null;
      questions?: Array<Record<string, unknown>>;
    }>;
  }>;
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
  topicTag: "",
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
    topicTag: question.topicTag ?? "",
    difficulty: question.difficulty ?? "medium",
    points: String(question.points ?? 1),
  };
}

function buildPayload(editor: EditorState) {
  const payload: Record<string, unknown> = {
    question: editor.question,
    questionType: editor.questionType,
    explanation: editor.explanation || undefined,
    topicTag: editor.topicTag.trim() || undefined,
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

function normalizeBulkKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizeBulkRow(row: Record<string, unknown>): BulkRowRecord {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      if (typeof value === "string") return [normalizeBulkKey(key), value.trim()];
      if (value == null) return [normalizeBulkKey(key), ""];
      return [normalizeBulkKey(key), value];
    }),
  );
}

function getBulkValue(row: BulkRowRecord, keys: string[]) {
  for (const key of keys) {
    const value = row[normalizeBulkKey(key)];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function parseAnswerIndex(value: string, optionsLength: number) {
  const cleaned = value.trim().toUpperCase();
  if (!cleaned) return 0;
  const numeric = Number(cleaned);
  if (Number.isFinite(numeric) && numeric > 0) return Math.max(0, Math.min(optionsLength - 1, numeric - 1));
  const alpha = cleaned.replace(/OPTION\s*/g, "");
  const code = alpha.charCodeAt(0);
  if (code >= 65 && code <= 90) return Math.max(0, Math.min(optionsLength - 1, code - 65));
  return 0;
}

function parseMultiAnswerIndices(value: string, optionsLength: number) {
  return value
    .split(/[,\s/|;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => parseAnswerIndex(item, optionsLength))
    .filter((item, index, list) => list.indexOf(item) === index);
}

function parseBulkDifficulty(value: string): "easy" | "medium" | "hard" {
  const cleaned = value.trim().toLowerCase();
  if (cleaned.startsWith("e")) return "easy";
  if (cleaned.startsWith("h") || cleaned.startsWith("t")) return "hard";
  return "medium";
}

function parseQuestionType(value: string): QuestionType {
  const cleaned = value.trim().toLowerCase();
  if (cleaned.startsWith("mul")) return "multi";
  if (cleaned.startsWith("int") || cleaned.startsWith("nat")) return "integer";
  return "mcq";
}

function buildBulkQuestionPayload(row: BulkRowRecord, rowIndex: number) {
  const questionType = parseQuestionType(getBulkValue(row, ["question_type", "type", "format"]));
  const question = getBulkValue(row, ["question", "question_text", "prompt"]);
  const imageData = getBulkValue(row, ["question_image", "question_image_url", "image", "image_url"]) || null;
  const difficulty = parseBulkDifficulty(getBulkValue(row, ["difficulty", "level"]));
  const explanation = getBulkValue(row, ["explanation", "solution", "note"]) || undefined;
  const topicTag = getBulkValue(row, ["topic_tag", "topic", "topic_name", "concept", "concept_tag"]) || undefined;
  const points = getBulkValue(row, ["marks", "points", "score"]) || "1";

  if (!question && !imageData) {
    throw new Error(`Row ${rowIndex + 2}: question text or a question image is required`);
  }

  const optionSlots = ["a", "b", "c", "d", "e", "f"].map((letter) => ({
    text: getBulkValue(row, [`option_${letter}`, `opt_${letter}`, letter]),
    image: getBulkValue(row, [`option_${letter}_image`, `opt_${letter}_image`, `${letter}_image`]) || null,
  }));
  const lastFilledOptionIndex = optionSlots.reduce((lastIndex, slot, index) => (
    slot.text || slot.image ? index : lastIndex
  ), -1);
  const normalizedOptionSlots = optionSlots.slice(0, Math.max(4, lastFilledOptionIndex + 1));
  const options = normalizedOptionSlots.map((slot) => slot.text);
  const optionImages = normalizedOptionSlots.map((slot) => slot.image);

  const payload: Record<string, unknown> = {
    question,
    questionType,
    topicTag,
    difficulty,
    explanation,
    points: parseFloat(points) || 1,
    imageData,
  };

  if (questionType === "mcq") {
    if (!options.some((option, index) => option.trim() || optionImages[index])) {
      throw new Error(`Row ${rowIndex + 2}: MCQ options missing hain`);
    }
    payload.options = options;
    if (optionImages.some(Boolean)) payload.optionImages = optionImages;
    payload.correctAnswer = parseAnswerIndex(getBulkValue(row, ["correct_answer", "answer", "correct"]), options.length);
    return payload;
  }

  if (questionType === "multi") {
    if (!options.some((option, index) => option.trim() || optionImages[index])) {
      throw new Error(`Row ${rowIndex + 2}: Multi-select options missing hain`);
    }
    payload.options = options;
    if (optionImages.some(Boolean)) payload.optionImages = optionImages;
    payload.correctAnswerMulti = parseMultiAnswerIndices(
      getBulkValue(row, ["correct_answers", "correct_answer", "answer", "correct"]),
      options.length,
    );
    return payload;
  }

  payload.options = [];
  const rangeMin = getBulkValue(row, ["correct_min", "min_answer", "answer_min"]);
  const rangeMax = getBulkValue(row, ["correct_max", "max_answer", "answer_max"]);
  if (rangeMin && rangeMax) {
    payload.correctAnswerMin = Number(rangeMin);
    payload.correctAnswerMax = Number(rangeMax);
  } else {
    payload.correctAnswer = Number(getBulkValue(row, ["correct_answer", "answer", "correct"]) || 0);
  }
  return payload;
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function AdminQuestionBank() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedExamKey, setSelectedExamKey] = useState<string>("");
  const [activeSubjectId, setActiveSubjectId] = useState<number | null>(null);
  const [activeChapterId, setActiveChapterId] = useState<number | null>(null);
  const [editorByChapter, setEditorByChapter] = useState<Record<number, EditorState>>({});
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null);
  const [editingState, setEditingState] = useState<EditorState>(emptyEditor());
  const [bulkImportingChapterId, setBulkImportingChapterId] = useState<number | null>(null);
  const [exportingChapterId, setExportingChapterId] = useState<number | null>(null);
  const [importingChapterId, setImportingChapterId] = useState<number | null>(null);
  const [exportingExamKey, setExportingExamKey] = useState<string | null>(null);
  const [importingExamKey, setImportingExamKey] = useState<string | null>(null);
  const [questionSearch, setQuestionSearch] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<"all" | "easy" | "medium" | "hard">("all");
  const [topicFilter, setTopicFilter] = useState("all");
  const [moveTargetByQuestion, setMoveTargetByQuestion] = useState<Record<number, string>>({});
  const excelInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const chapterImportInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const examImportInputRef = useRef<HTMLInputElement | null>(null);

  const { data: examCards = [], isLoading: examCardsLoading, isError: examCardsError } = useQuery<QuestionBankExamSummary[]>({
    queryKey: ["admin-question-bank-exams"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/question-bank/exams`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load exam cards");
      return r.json();
    },
  });

  const visibleExamCards = examCardsError ? [] : examCards;

  useEffect(() => {
    if (visibleExamCards.length === 0) {
      if (selectedExamKey) {
        setSelectedExamKey("");
      }
      return;
    }

    const hasSelectedExam = visibleExamCards.some((exam) => exam.key === selectedExamKey);
    if (!selectedExamKey || !hasSelectedExam) {
      setSelectedExamKey(visibleExamCards[0].key);
    }
  }, [visibleExamCards, selectedExamKey]);

  const { data, isLoading } = useQuery<QuestionBankExamResponse>({
    queryKey: ["admin-question-bank", selectedExamKey],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/question-bank/exams/${selectedExamKey}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load question bank");
      return r.json();
    },
    enabled: !!selectedExamKey,
  });

  const activeQuestionBank = selectedExamKey ? data : undefined;

  useEffect(() => {
    if (!activeQuestionBank || activeQuestionBank.subjects.length === 0) {
      setActiveSubjectId(null);
      setActiveChapterId(null);
      return;
    }
    setActiveSubjectId((prev) => (
      prev && activeQuestionBank.subjects.some((subject) => subject.id === prev)
        ? prev
        : activeQuestionBank.subjects[0].id
    ));
  }, [activeQuestionBank]);

  useEffect(() => {
    if (!activeQuestionBank || activeSubjectId == null) {
      setActiveChapterId(null);
      return;
    }
    const subject = activeQuestionBank.subjects.find((entry) => entry.id === activeSubjectId);
    if (!subject || subject.chapters.length === 0) {
      setActiveChapterId(null);
      return;
    }
    setActiveChapterId((prev) => (
      prev && subject.chapters.some((chapter) => chapter.id === prev)
        ? prev
        : subject.chapters[0].id
    ));
  }, [activeQuestionBank, activeSubjectId]);

  const activeSubject = useMemo(() => {
    if (!activeQuestionBank || activeQuestionBank.subjects.length === 0) return null;
    return activeQuestionBank.subjects.find((subject) => subject.id === activeSubjectId) ?? activeQuestionBank.subjects[0];
  }, [activeQuestionBank, activeSubjectId]);

  const activeChapter = useMemo(() => {
    if (!activeSubject || activeSubject.chapters.length === 0) return null;
    return activeSubject.chapters.find((chapter) => chapter.id === activeChapterId) ?? activeSubject.chapters[0];
  }, [activeSubject, activeChapterId]);

  useEffect(() => {
    setQuestionSearch("");
    setDifficultyFilter("all");
    setTopicFilter("all");
    setMoveTargetByQuestion({});
  }, [activeChapterId]);

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

    if (activeQuestionBank) {
      subjects = activeQuestionBank.subjects.length;
      activeQuestionBank.subjects.forEach((subject) => {
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
  }, [activeQuestionBank, reports]);

  const activeSubjectStats = useMemo(() => {
    if (!activeSubject) {
      return { uploaded: 0, target: 0, pending: 0, easy: 0, medium: 0, hard: 0 };
    }

    return activeSubject.chapters.reduce((acc, chapter) => {
      const uploaded = chapter.questions.length;
      const target = Math.max(chapter.targetQuestions ?? 0, uploaded);
      acc.uploaded += uploaded;
      acc.target += target;
      acc.pending += Math.max(target - uploaded, 0);
      chapter.questions.forEach((question) => {
        if (question.difficulty === "easy") acc.easy += 1;
        else if (question.difficulty === "hard") acc.hard += 1;
        else acc.medium += 1;
      });
      return acc;
    }, { uploaded: 0, target: 0, pending: 0, easy: 0, medium: 0, hard: 0 });
  }, [activeSubject]);

  const activeChapterStats = useMemo(() => {
    if (!activeChapter) {
      return { uploaded: 0, target: 0, pending: 0, easy: 0, medium: 0, hard: 0, topics: [] as string[] };
    }

    let easy = 0;
    let medium = 0;
    let hard = 0;
    const topics = new Set<string>();
    activeChapter.questions.forEach((question) => {
      if (question.difficulty === "easy") easy += 1;
      else if (question.difficulty === "hard") hard += 1;
      else medium += 1;
      if (question.topicTag?.trim()) topics.add(question.topicTag.trim());
    });

    const uploaded = activeChapter.questions.length;
    const target = Math.max(activeChapter.targetQuestions ?? 0, uploaded);
    return {
      uploaded,
      target,
      pending: Math.max(target - uploaded, 0),
      easy,
      medium,
      hard,
      topics: [...topics].sort((a, b) => a.localeCompare(b)),
    };
  }, [activeChapter]);

  const filteredChapterQuestions = useMemo(() => {
    if (!activeChapter) return [];
    const search = questionSearch.trim().toLowerCase();
    return activeChapter.questions.filter((question) => {
      if (difficultyFilter !== "all" && question.difficulty !== difficultyFilter) return false;
      if (topicFilter !== "all" && (question.topicTag?.trim() ?? "") !== topicFilter) return false;
      if (!search) return true;
      const haystack = [
        question.question,
        question.explanation ?? "",
        question.topicTag ?? "",
        activeChapter.title,
      ].join(" ").toLowerCase();
      return haystack.includes(search);
    });
  }, [activeChapter, difficultyFilter, questionSearch, topicFilter]);

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
      queryClient.invalidateQueries({ queryKey: ["admin-question-bank", selectedExamKey] });
      queryClient.invalidateQueries({ queryKey: ["admin-question-bank-exams"] });
      toast({ title: "Question added" });
    },
    onError: (err: Error) => toast({ title: "Could not add question", description: err.message, variant: "destructive" }),
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
      queryClient.invalidateQueries({ queryKey: ["admin-question-bank", selectedExamKey] });
      queryClient.invalidateQueries({ queryKey: ["admin-question-bank-exams"] });
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
      queryClient.invalidateQueries({ queryKey: ["admin-question-bank", selectedExamKey] });
      queryClient.invalidateQueries({ queryKey: ["admin-question-bank-exams"] });
      queryClient.invalidateQueries({ queryKey: ["question-bank-reports"] });
      toast({ title: "Question removed" });
    },
  });

  const moveQuestionMutation = useMutation({
    mutationFn: async ({ questionId, chapterId }: { questionId: number; chapterId: number }) => {
      const r = await fetch(`${BASE}/api/question-bank-questions/${questionId}/move`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterId }),
      });
      const payload = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(payload.error ?? "Failed to move question");
      }
      return payload;
    },
    onSuccess: (_payload, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-question-bank", selectedExamKey] });
      queryClient.invalidateQueries({ queryKey: ["admin-question-bank-exams"] });
      setMoveTargetByQuestion((prev) => {
        const next = { ...prev };
        delete next[variables.questionId];
        return next;
      });
      toast({ title: "Question moved", description: "The question was moved to the selected chapter." });
    },
    onError: (err: Error) => toast({ title: "Could not move question", description: err.message, variant: "destructive" }),
  });

  const setChapterEditor = (chapterId: number, updater: (prev: EditorState) => EditorState) => {
    setEditorByChapter((prev) => ({ ...prev, [chapterId]: updater(prev[chapterId] ?? emptyEditor()) }));
  };

  const handleExcelImport = async (chapter: ChapterItem, file?: File | null) => {
    if (!file) return;
    setBulkImportingChapterId(chapter.id);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error("The sheet is empty.");

      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheetName], { defval: "" });
      const rows = rawRows
        .map(normalizeBulkRow)
        .filter((row) => Boolean(getBulkValue(row, ["question", "question_text", "prompt", "question_image", "question_image_url", "image", "image_url"])));

      if (rows.length === 0) throw new Error("No valid question rows were found in the spreadsheet.");

      const payload = rows.map((row, rowIndex) => buildBulkQuestionPayload(row, rowIndex));
      const response = await fetch(`${BASE}/api/chapters/${chapter.id}/question-bank-questions/bulk`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: payload }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error ?? "Failed to import questions");
      }

      queryClient.invalidateQueries({ queryKey: ["admin-question-bank", selectedExamKey] });
      queryClient.invalidateQueries({ queryKey: ["admin-question-bank-exams"] });
      toast({
        title: "Excel import complete",
        description: `${result.createdCount ?? 0} questions added${result.duplicateCount ? `, ${result.duplicateCount} duplicates skipped` : ""} in ${chapter.title}.`,
      });
    } catch (error) {
      toast({
        title: "Bulk import failed",
        description: error instanceof Error ? error.message : "Could not import the Excel file",
        variant: "destructive",
      });
    } finally {
      setBulkImportingChapterId(null);
    }
  };

  const handleChapterExport = async (chapter: ChapterItem) => {
    setExportingChapterId(chapter.id);
    try {
      const response = await fetch(`${BASE}/api/question-bank/chapters/${chapter.id}/export`, {
        credentials: "include",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((payload as { error?: string }).error ?? "Failed to export chapter");
      }
      const filename = `${chapter.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || `chapter-${chapter.id}`}-question-bank.json`;
      downloadJson(filename, payload);
      toast({ title: "Chapter exported", description: `${chapter.title} is ready to download.` });
    } catch (error) {
      toast({
        title: "Export failed",
        description: error instanceof Error ? error.message : "Could not export chapter",
        variant: "destructive",
      });
    } finally {
      setExportingChapterId(null);
    }
  };

  const handleChapterImport = async (chapter: ChapterItem, file?: File | null) => {
    if (!file) return;
    setImportingChapterId(chapter.id);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as QuestionBankTransferBundle | Array<Record<string, unknown>>;
      const questions = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.questions)
          ? parsed.questions
          : [];

      if (questions.length === 0) {
        throw new Error("No questions were found in the JSON bundle.");
      }

      const response = await fetch(`${BASE}/api/question-bank/chapters/${chapter.id}/import`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((payload as { error?: string }).error ?? "Failed to import chapter bundle");
      }

      queryClient.invalidateQueries({ queryKey: ["admin-question-bank", selectedExamKey] });
      queryClient.invalidateQueries({ queryKey: ["admin-question-bank-exams"] });
      const result = payload as { createdCount?: number; duplicateCount?: number };
      toast({
        title: "Questions imported",
        description: `${result.createdCount ?? 0} questions imported${result.duplicateCount ? `, ${result.duplicateCount} duplicates skipped` : ""} in ${chapter.title}.`,
      });
    } catch (error) {
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Could not import the JSON bundle",
        variant: "destructive",
      });
    } finally {
      setImportingChapterId(null);
    }
  };

  const handleExamExport = async () => {
    if (!selectedExamKey || !activeQuestionBank) return;
    setExportingExamKey(selectedExamKey);
    try {
      const response = await fetch(`${BASE}/api/question-bank/exams/${selectedExamKey}/export`, {
        credentials: "include",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((payload as { error?: string }).error ?? "Failed to export question bank");
      }
      const examLabel = activeQuestionBank.exam.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || selectedExamKey;
      downloadJson(`${examLabel}-question-bank.json`, payload);
      toast({
        title: "Question bank exported",
        description: `${activeQuestionBank.exam.label} is ready to download.`,
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: error instanceof Error ? error.message : "Could not export question bank",
        variant: "destructive",
      });
    } finally {
      setExportingExamKey(null);
    }
  };

  const handleExamImport = async (file?: File | null) => {
    if (!file || !selectedExamKey) return;
    setImportingExamKey(selectedExamKey);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as QuestionBankExamTransferBundle;
      const rawSubjects = Array.isArray(parsed.subjects) ? parsed.subjects : [];
      if (rawSubjects.length === 0) {
        throw new Error("No subjects were found in the JSON bundle.");
      }

      const response = await fetch(`${BASE}/api/question-bank/exams/${selectedExamKey}/import`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjects: rawSubjects }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((payload as { error?: string }).error ?? "Failed to import question bank bundle");
      }

      queryClient.invalidateQueries({ queryKey: ["admin-question-bank", selectedExamKey] });
      queryClient.invalidateQueries({ queryKey: ["admin-question-bank-exams"] });

      const result = payload as {
        importedCount?: number;
        skippedSubjectCount?: number;
        skippedChapterCount?: number;
        skippedDuplicateCount?: number;
        invalidQuestionCount?: number;
      };
      toast({
        title: "Question bank imported",
        description: `Imported ${result.importedCount ?? 0} questions${result.skippedDuplicateCount ? `, ${result.skippedDuplicateCount} duplicates skipped` : ""}${result.invalidQuestionCount ? `, ${result.invalidQuestionCount} invalid rows skipped` : ""}${(result.skippedSubjectCount ?? 0) || (result.skippedChapterCount ?? 0) ? `, skipped ${result.skippedSubjectCount ?? 0} subject and ${result.skippedChapterCount ?? 0} chapter mappings` : ""}.`,
      });
    } catch (error) {
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Could not import question bank bundle",
        variant: "destructive",
      });
    } finally {
      setImportingExamKey(null);
    }
  };

  const renderEditor = (editor: EditorState, onChange: (updater: (prev: EditorState) => EditorState) => void, footer?: React.ReactNode) => (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
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
                void optimizeImageToDataUrl(file, { maxWidth: 1800, maxHeight: 1800, quality: 0.82 }).then((dataUrl) => {
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
        <div>
          <Label className="text-xs">Topic Tag</Label>
          <Input
            value={editor.topicTag}
            onChange={(e) => onChange((prev) => ({ ...prev, topicTag: e.target.value }))}
            placeholder="e.g. Atomic Structure"
          />
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
                    void optimizeImageToDataUrl(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.82 }).then((dataUrl) => {
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

  const renderChapterWorkspace = (chapter: ChapterItem) => {
    const chapterEditor = editorByChapter[chapter.id] ?? emptyEditor();
    const importState = getImportState(chapter.id);
    const aiDrafts = aiDraftsByChapter[chapter.id] ?? [];
    const chapterUploaded = chapter.questions.length;
    const chapterTarget = Math.max(chapter.targetQuestions ?? 0, chapterUploaded);
    const chapterPending = Math.max(chapterTarget - chapterUploaded, 0);
    const chapterProgress = chapterTarget > 0 ? Math.min((chapterUploaded / chapterTarget) * 100, 100) : 100;
    const chapterQuestions = activeChapter?.id === chapter.id ? filteredChapterQuestions : chapter.questions;
    const availableMoveChapters = activeSubject?.chapters.filter((entry) => entry.id !== chapter.id) ?? [];

    return (
      <div className="space-y-3">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <BarChart3 size={15} className="text-primary" />
                  {chapter.title} Progress
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Target / uploaded / pending progress planner-defined chapter goals ke against.
                </p>
              </div>
              <Badge variant={chapterPending > 0 ? "secondary" : "default"}>
                {chapterPending > 0 ? `${chapterPending} pending` : "Target complete"}
              </Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-blue-700">Target</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{chapterTarget}</p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-700">Uploaded</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{chapterUploaded}</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-amber-700">Pending</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{chapterPending}</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Completion</span>
                <span>{Math.round(chapterProgress)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${chapterProgress}%` }} />
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Subject Difficulty Mix</p>
                <p className="mt-1 text-xs text-muted-foreground">Combined chapter mix for this subject.</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-700">Easy</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{activeSubjectStats.easy}</p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-amber-700">Medium</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{activeSubjectStats.medium}</p>
                </div>
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-rose-700">Hard</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{activeSubjectStats.hard}</p>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Uploaded {activeSubjectStats.uploaded} / Target {activeSubjectStats.target} / Pending {activeSubjectStats.pending}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Chapter Analytics</p>
                <p className="mt-1 text-xs text-muted-foreground">Selected chapter ka topic and difficulty breakdown.</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-700">Easy</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{activeChapterStats.easy}</p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-amber-700">Medium</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{activeChapterStats.medium}</p>
                </div>
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-rose-700">Hard</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{activeChapterStats.hard}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {activeChapterStats.topics.length > 0 ? activeChapterStats.topics.map((topic) => (
                  <Badge key={topic} variant="secondary">{topic}</Badge>
                )) : (
                  <span className="text-xs text-muted-foreground">No topic tags yet.</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Search size={15} className="text-primary" />
                Search & Filters
                <InfoTip content="Search the current chapter by question text, explanation, topic tag, or chapter name." />
              </p>
            </div>
            <Badge variant="outline">{chapterQuestions.length} result</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1.6fr)_220px_240px_auto]">
            <Input
              value={questionSearch}
              onChange={(event) => setQuestionSearch(event.target.value)}
              placeholder="Search by question, explanation, topic, or chapter"
            />
            <select
              value={difficultyFilter}
              onChange={(event) => setDifficultyFilter(event.target.value as typeof difficultyFilter)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All difficulty</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
            <select
              value={topicFilter}
              onChange={(event) => setTopicFilter(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All topics</option>
              {activeChapterStats.topics.map((topic) => (
                <option key={topic} value={topic}>{topic}</option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setQuestionSearch("");
                setDifficultyFilter("all");
                setTopicFilter("all");
              }}
              disabled={!questionSearch && difficultyFilter === "all" && topicFilter === "all"}
            >
              Clear
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">Bulk Tools</p>
                <InfoTip content="Use spreadsheets for bulk uploads, or move a full chapter in and out as JSON." />
              </div>
            </div>
            <Badge variant="secondary">{chapter.questions.length} saved</Badge>
          </div>
          <input
            ref={(node) => {
              excelInputRefs.current[chapter.id] = node;
            }}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              void handleExcelImport(chapter, file);
              e.currentTarget.value = "";
            }}
          />
          <input
            ref={(node) => {
              chapterImportInputRefs.current[chapter.id] = node;
            }}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              void handleChapterImport(chapter, file);
              e.currentTarget.value = "";
            }}
          />
          <div className="flex gap-2 flex-wrap">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => excelInputRefs.current[chapter.id]?.click()}
              disabled={bulkImportingChapterId === chapter.id}
            >
              <Upload size={13} className="mr-1" />
              {bulkImportingChapterId === chapter.id ? "Importing Excel..." : "Upload Excel"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void handleChapterExport(chapter)}
              disabled={exportingChapterId === chapter.id}
            >
              <Download size={13} className="mr-1" />
              {exportingChapterId === chapter.id ? "Exporting..." : "Export Chapter"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => chapterImportInputRefs.current[chapter.id]?.click()}
              disabled={importingChapterId === chapter.id}
            >
              <Upload size={13} className="mr-1" />
              {importingChapterId === chapter.id ? "Importing JSON..." : "Import JSON"}
            </Button>
          </div>
          <p className="text-[11px] leading-5 text-muted-foreground">
            Excel columns: <span className="font-medium">question</span>, <span className="font-medium">question_type</span>, <span className="font-medium">option_a</span>...
            <span className="font-medium">correct_answer</span>, <span className="font-medium">difficulty</span>, <span className="font-medium">topic_tag</span>, <span className="font-medium">marks</span>, <span className="font-medium">question_image</span>.
          </p>
        </div>

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

        {chapterQuestions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground text-center">
            No questions matched the current filters for this chapter.
          </div>
        ) : chapterQuestions.map((item) => (
          <div key={item.id} className="rounded-lg border border-border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="gap-1">{questionTypeIcon(item.questionType)}{questionTypeLabel(item.questionType)}</Badge>
                  <Badge variant="outline">{item.difficulty}</Badge>
                  <Badge variant="secondary">{item.points} pts</Badge>
                  <Badge variant="outline">{chapter.title}</Badge>
                  {item.topicTag?.trim() ? <Badge variant="secondary">{item.topicTag.trim()}</Badge> : null}
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
              <div className="flex flex-col items-end gap-2">
                {availableMoveChapters.length > 0 && (
                  <div className="flex items-center gap-2">
                    <select
                      value={moveTargetByQuestion[item.id] ?? ""}
                      onChange={(event) => setMoveTargetByQuestion((prev) => ({ ...prev, [item.id]: event.target.value }))}
                      className="h-9 min-w-[170px] rounded-md border border-input bg-background px-3 text-xs"
                    >
                      <option value="">Move to chapter</option>
                      {availableMoveChapters.map((chapterOption) => (
                        <option key={chapterOption.id} value={String(chapterOption.id)}>
                          {chapterOption.title}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!moveTargetByQuestion[item.id] || moveQuestionMutation.isPending}
                      onClick={() => moveQuestionMutation.mutate({ questionId: item.id, chapterId: Number(moveTargetByQuestion[item.id]) })}
                    >
                      <ArrowRightLeft size={13} className="mr-1" />
                      Move
                    </Button>
                  </div>
                )}
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
    );
  };

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen size={16} className="text-primary" />
            Exam Question Bank
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {examCardsLoading ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />)}
            </div>
          ) : visibleExamCards.length === 0 ? (
            <div className="rounded-2xl border border-border py-10 text-center text-sm text-muted-foreground">
              No assigned question bank cards are available for this teacher yet.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {visibleExamCards.map((exam) => {
                const active = selectedExamKey === exam.key;
                return (
                  <button
                    key={exam.key}
                    type="button"
                    onClick={() => setSelectedExamKey(exam.key)}
                    className={`rounded-2xl border p-4 text-left transition ${
                      active
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border bg-card hover:border-primary/40 hover:bg-accent/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{exam.label}</p>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>Planner-assigned workspace</span>
                          <InfoTip content="Questions added here stay inside the planner-owned subject and chapter structure for this exam." />
                        </div>
                      </div>
                      <Badge variant={active ? "default" : "secondary"}>{active ? "Open" : "Exam"}</Badge>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-xl border border-border bg-background px-3 py-2">
                        <p className="text-muted-foreground">Subjects</p>
                        <p className="mt-1 font-semibold text-foreground">{exam.subjectCount}</p>
                      </div>
                      <div className="rounded-xl border border-border bg-background px-3 py-2">
                        <p className="text-muted-foreground">Chapters</p>
                        <p className="mt-1 font-semibold text-foreground">{exam.chapterCount}</p>
                      </div>
                      <div className="rounded-xl border border-border bg-background px-3 py-2">
                        <p className="text-muted-foreground">Questions</p>
                        <p className="mt-1 font-semibold text-foreground">{exam.questionCount}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {!selectedExamKey ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Choose an exam card to open its subject-wise question bank.</CardContent></Card>
      ) : isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : !activeQuestionBank || activeQuestionBank.subjects.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No planner-defined subject cards are available for this exam yet.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                Question Bank Transfer
                <InfoTip content="Export the selected exam as JSON, or import a JSON bundle to merge questions into matching subject and chapter cards." />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <input
                ref={examImportInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  void handleExamImport(file);
                  e.currentTarget.value = "";
                }}
              />
              <div className="flex gap-2 flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleExamExport()}
                  disabled={exportingExamKey === selectedExamKey}
                >
                  <Download size={14} className="mr-2" />
                  {exportingExamKey === selectedExamKey ? "Exporting..." : "Export Question Bank"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => examImportInputRef.current?.click()}
                  disabled={importingExamKey === selectedExamKey}
                >
                  <Upload size={14} className="mr-2" />
                  {importingExamKey === selectedExamKey ? "Importing..." : "Import Question Bank"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Subject Cards</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {activeQuestionBank.subjects.map((subject) => {
                  const questionCount = subject.chapters.reduce((sum, chapter) => sum + chapter.questions.length, 0);
                  const targetCount = subject.chapters.reduce((sum, chapter) => sum + Math.max(chapter.targetQuestions ?? 0, chapter.questions.length), 0);
                  const pendingCount = Math.max(targetCount - questionCount, 0);
                  const subjectProgress = targetCount > 0 ? Math.min((questionCount / targetCount) * 100, 100) : 100;
                  const active = activeSubject?.id === subject.id;
                  return (
                    <button
                      key={subject.id}
                      type="button"
                      onClick={() => setActiveSubjectId(subject.id)}
                      className={`rounded-2xl border p-4 text-left transition ${
                        active
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border bg-card hover:border-primary/40 hover:bg-accent/20"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-base font-semibold text-foreground">{subject.title}</p>
                          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Planner-owned subject card</span>
                            <InfoTip content="Teachers can manage questions only inside the planner-created chapter cards for this subject." />
                          </div>
                        </div>
                        {active && <Badge variant="default">Active</Badge>}
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-xl border border-border bg-background px-3 py-2">
                          <p className="text-muted-foreground">Chapters</p>
                          <p className="mt-1 font-semibold text-foreground">{subject.chapters.length}</p>
                        </div>
                        <div className="rounded-xl border border-border bg-background px-3 py-2">
                          <p className="text-muted-foreground">Questions</p>
                          <p className="mt-1 font-semibold text-foreground">{questionCount}</p>
                        </div>
                      </div>
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>Target {targetCount}</span>
                          <span>Pending {pendingCount}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${subjectProgress}%` }} />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {activeSubject && (
                <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
                  <span>Planner controls the chapter structure.</span>
                  <InfoTip content="Teachers can manage questions only inside the chapter cards created by the planner." />
                </div>
              )}
            </CardContent>
          </Card>

          {activeSubject && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{activeSubject.title} Chapters</CardTitle>
              </CardHeader>
              <CardContent>
                {activeSubject.chapters.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                    No chapter cards are available for this subject yet.
                  </div>
                ) : (
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {activeSubject.chapters.map((chapter) => {
                      const uploaded = chapter.questions.length;
                      const target = Math.max(chapter.targetQuestions ?? 0, uploaded);
                      const pending = Math.max(target - uploaded, 0);
                      const progress = target > 0 ? Math.min((uploaded / target) * 100, 100) : 100;
                      const active = activeChapter?.id === chapter.id;
                      return (
                        <button
                          key={chapter.id}
                          type="button"
                          onClick={() => setActiveChapterId(chapter.id)}
                          className={`min-w-[260px] rounded-2xl border px-4 py-3 text-left transition ${
                            active
                              ? "border-primary bg-primary/5 shadow-sm"
                              : "border-border bg-card hover:border-primary/40 hover:bg-accent/20"
                          }`}
                        >
                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                              <p className="text-sm font-semibold text-foreground">{chapter.title}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Uploaded {uploaded} / Target {target} / Pending {pending}
                              </p>
                              </div>
                              {active && <Badge variant="default">Open</Badge>}
                            </div>
                            <div className="space-y-2">
                              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                <span>{uploaded} uploaded</span>
                                <span>•</span>
                                <span>{pending} pending</span>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeChapter && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <CardTitle className="text-base">{activeChapter.title}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Planner-created chapter card for {activeSubject?.title}.
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {activeChapter.questions.length} uploaded / {Math.max(activeChapter.targetQuestions ?? 0, activeChapter.questions.length)} target
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {renderChapterWorkspace(activeChapter)}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
