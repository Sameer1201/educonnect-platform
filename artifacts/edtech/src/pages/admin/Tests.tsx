import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import {
  ClipboardList, Plus, Trash2, CheckCircle2, XCircle, ChevronDown, ChevronRight,
  ToggleLeft, ToggleRight, Clock, BarChart3, ImagePlus, X, Hash, ListChecks, CheckSquare,
  TrendingUp, Users, Award, Target, PencilLine
} from "lucide-react";
import { format } from "date-fns";
import { useListClasses } from "@workspace/api-client-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, RadialBarChart, RadialBar
} from "recharts";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type QuestionType = "mcq" | "multi" | "integer";
type ExamType = string;

interface SectionDraft {
  id: string;
  title: string;
  description: string;
  subjectLabel: string;
  questionCount: string;
  marksPerQuestion: string;
  negativeMarks: string;
  preferredQuestionType: QuestionType;
}

interface QuestionDraftState {
  questionType: QuestionType;
  question: string;
  imageData: string | null;
  options: string[];
  optionImages: (string | null)[];
  correctAnswer: number;
  correctAnswerMulti: number[];
  integerMode: "exact" | "range";
  correctInteger: string;
  correctIntegerMin: string;
  correctIntegerMax: string;
  difficulty: "easy" | "moderate" | "tough";
  chapterName: string;
  topicTag: string;
  idealTimeMinutes: string;
  questionCode: string;
  subjectLabel: string;
  points: string;
  negativeMarks: string;
  sourceType: string;
}

interface BulkRowRecord {
  [key: string]: string | number | null | undefined;
}

interface Test {
  id: number; classId: number | null; title: string; description: string | null;
  examType?: ExamType | string | null;
  examHeader?: string | null; examSubheader?: string | null;
  instructions?: string | null;
  examConfig?: Record<string, unknown> | null;
  defaultPositiveMarks?: number | null;
  defaultNegativeMarks?: number | null;
  chapterId: number | null; durationMinutes: number; passingScore: number | null; isPublished: boolean;
  scheduledAt: string | null; className: string | null; chapterName?: string | null; subjectName?: string | null;
}
interface Question {
  id: number; question: string; questionType: QuestionType; options: string[];
  sectionId?: number | null;
  questionCode?: string | null;
  sourceType?: string | null;
  subjectLabel?: string | null;
  optionImages?: (string | null)[] | null;
  correctAnswer: number; correctAnswerMulti: number[] | null;
  correctAnswerMin?: number | null; correctAnswerMax?: number | null;
  points: number; negativeMarks?: number | null; order: number; imageData?: string | null; meta?: Record<string, unknown> | null;
}
interface TestSection {
  id: number;
  testId: number;
  title: string;
  description: string | null;
  subjectLabel: string | null;
  questionCount?: number | null;
  marksPerQuestion?: number | null;
  negativeMarks?: number | null;
  meta?: Record<string, unknown> | null;
  order: number;
}
interface ExamTemplate {
  id: number;
  key: string;
  name: string;
  description?: string | null;
  examHeader?: string | null;
  examSubheader?: string | null;
  durationMinutes: number;
  passingScore: number | null;
  defaultPositiveMarks: number;
  defaultNegativeMarks: number;
  sections: Array<{
    title: string;
    description?: string | null;
    subjectLabel?: string | null;
    questionCount?: number | null;
    marksPerQuestion?: number | null;
    negativeMarks?: number | null;
    preferredQuestionType?: QuestionType;
  }>;
}
interface Analytics {
  test: { id: number; title: string; passingScore: number | null };
  total: number; passCount: number; failCount: number;
  avgPercentage: number; avgScore: number; maxScore: number; minScore: number;
  scoreDistribution: { range: string; count: number }[];
  perQuestion: {
    id: number; question: string; questionType: QuestionType;
    options: string[]; optionImages: (string | null)[] | null;
    correctAnswer: number; correctAnswerMulti: number[] | null;
    correctAnswerMin: number | null; correctAnswerMax: number | null;
    points: number; negativeMarks?: number | null; correctCount: number; wrongCount: number; successRate: number;
    optionCounts: number[]; imageData: string | null;
  }[];
  submissions: {
    id: number; studentName: string; studentUsername: string;
    score: number; totalPoints: number; percentage: number; passed: boolean; submittedAt: string;
  }[];
}

const PIE_COLORS = ["#22c55e", "#ef4444"];
const BAR_COLORS = ["#6366f1", "#f59e0b", "#22c55e", "#ef4444"];

const qTypeLabel: Record<QuestionType, string> = {
  mcq: "MCQ (Single select)",
  multi: "Multi-select",
  integer: "Integer answer",
};
const qTypeIcon: Record<QuestionType, React.ReactNode> = {
  mcq: <CheckCircle2 size={13} />,
  multi: <CheckSquare size={13} />,
  integer: <Hash size={13} />,
};

const EXAM_PRESETS: Record<Exclude<ExamType, "custom">, { label: string; duration: string; passing: string; positive: string; negative: string; sections: Omit<SectionDraft, "id">[] }> = {
  jee: {
    label: "JEE Pattern",
    duration: "180",
    passing: "60",
    positive: "4",
    negative: "1",
    sections: [
      { title: "Physics", description: "Physics section", subjectLabel: "Physics", questionCount: "25", marksPerQuestion: "4", negativeMarks: "1", preferredQuestionType: "mcq" },
      { title: "Chemistry", description: "Chemistry section", subjectLabel: "Chemistry", questionCount: "25", marksPerQuestion: "4", negativeMarks: "1", preferredQuestionType: "mcq" },
      { title: "Mathematics", description: "Mathematics section", subjectLabel: "Mathematics", questionCount: "25", marksPerQuestion: "4", negativeMarks: "1", preferredQuestionType: "mcq" },
    ],
  },
  gate: {
    label: "GATE Pattern",
    duration: "180",
    passing: "60",
    positive: "2",
    negative: "0.66",
    sections: [
      { title: "General Aptitude", description: "10 questions. Mixed +1 and +2. MCQ can carry -1/3 or -2/3. NAT/MSQ no negative.", subjectLabel: "General Aptitude", questionCount: "10", marksPerQuestion: "1", negativeMarks: "0.33", preferredQuestionType: "mcq" },
      { title: "Engineering Mathematics", description: "Around 10-12 questions. Mixed MCQ, MSQ, NAT allowed.", subjectLabel: "Engineering Maths", questionCount: "10", marksPerQuestion: "1", negativeMarks: "0.33", preferredQuestionType: "mcq" },
      { title: "Core Subject", description: "Around 40-45 questions. Core paper with MCQ, MSQ, NAT.", subjectLabel: "Core Subject", questionCount: "45", marksPerQuestion: "2", negativeMarks: "0.66", preferredQuestionType: "mcq" },
    ],
  },
  "iit-jam": {
    label: "IIT JAM Pattern",
    duration: "180",
    passing: "60",
    positive: "2",
    negative: "0.33",
    sections: [
      { title: "Section A", description: "30 MCQs with negative marking.", subjectLabel: "Section A", questionCount: "30", marksPerQuestion: "1", negativeMarks: "0.33", preferredQuestionType: "mcq" },
      { title: "Section B", description: "10 MSQs with no negative marking.", subjectLabel: "Section B", questionCount: "10", marksPerQuestion: "2", negativeMarks: "0", preferredQuestionType: "multi" },
      { title: "Section C", description: "20 NAT questions with no negative marking.", subjectLabel: "Section C", questionCount: "20", marksPerQuestion: "2", negativeMarks: "0", preferredQuestionType: "integer" },
    ],
  },
  cuet: {
    label: "CUET Pattern",
    duration: "60",
    passing: "60",
    positive: "5",
    negative: "1",
    sections: [
      { title: "Language", description: "50 questions, attempt around 40. MCQ only.", subjectLabel: "Language", questionCount: "50", marksPerQuestion: "5", negativeMarks: "1", preferredQuestionType: "mcq" },
      { title: "Domain Subjects", description: "Subject-specific MCQ section. Multiple subjects can be cloned later by planner.", subjectLabel: "Domain Subjects", questionCount: "50", marksPerQuestion: "5", negativeMarks: "1", preferredQuestionType: "mcq" },
      { title: "General Test", description: "General aptitude and reasoning. MCQ only.", subjectLabel: "General Test", questionCount: "50", marksPerQuestion: "5", negativeMarks: "1", preferredQuestionType: "mcq" },
    ],
  },
  neet: {
    label: "NEET Pattern",
    duration: "200",
    passing: "60",
    positive: "4",
    negative: "1",
    sections: [
      { title: "Physics", description: "45 MCQs. NEET-style section with optional choice rules configurable later.", subjectLabel: "Physics", questionCount: "45", marksPerQuestion: "4", negativeMarks: "1", preferredQuestionType: "mcq" },
      { title: "Chemistry", description: "45 MCQs. NEET-style section with optional choice rules configurable later.", subjectLabel: "Chemistry", questionCount: "45", marksPerQuestion: "4", negativeMarks: "1", preferredQuestionType: "mcq" },
      { title: "Biology", description: "90 MCQs. Includes Botany/Zoology coverage as needed.", subjectLabel: "Biology", questionCount: "90", marksPerQuestion: "4", negativeMarks: "1", preferredQuestionType: "mcq" },
    ],
  },
  cat: {
    label: "CAT Pattern",
    duration: "120",
    passing: "60",
    positive: "3",
    negative: "1",
    sections: [
      { title: "VARC", description: "Verbal Ability and Reading Comprehension", subjectLabel: "VARC", questionCount: "24", marksPerQuestion: "3", negativeMarks: "1", preferredQuestionType: "mcq" },
      { title: "DILR", description: "Data Interpretation and Logical Reasoning", subjectLabel: "DILR", questionCount: "20", marksPerQuestion: "3", negativeMarks: "1", preferredQuestionType: "mcq" },
      { title: "QA", description: "Quantitative Aptitude", subjectLabel: "QA", questionCount: "22", marksPerQuestion: "3", negativeMarks: "1", preferredQuestionType: "mcq" },
    ],
  },
};

const FALLBACK_TEMPLATES: ExamTemplate[] = Object.entries(EXAM_PRESETS).map(([key, preset], index) => ({
  id: index + 1,
  key,
  name: preset.label,
  description: null,
  examHeader: preset.label.toUpperCase(),
  examSubheader: `${preset.label} Mock Assessment`,
  durationMinutes: Number(preset.duration),
  passingScore: Number(preset.passing),
  defaultPositiveMarks: Number(preset.positive),
  defaultNegativeMarks: Number(preset.negative),
  sections: preset.sections,
}));

function makeSectionDraft(input?: Partial<SectionDraft>): SectionDraft {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: input?.title ?? "",
    description: input?.description ?? "",
    subjectLabel: input?.subjectLabel ?? "",
    questionCount: input?.questionCount ?? "",
    marksPerQuestion: input?.marksPerQuestion ?? "",
    negativeMarks: input?.negativeMarks ?? "",
    preferredQuestionType: input?.preferredQuestionType ?? "mcq",
  };
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

function parseBulkDifficulty(value: string): "easy" | "moderate" | "tough" {
  const cleaned = value.trim().toLowerCase();
  if (cleaned.startsWith("e")) return "easy";
  if (cleaned.startsWith("t") || cleaned.startsWith("h")) return "tough";
  return "moderate";
}

export default function AdminTests() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [createOpen, setCreateOpen] = useState(false);
  const [newExamType, setNewExamType] = useState<ExamType>("");
  const [newTitle, setNewTitle] = useState("");
  const [newExamHeader, setNewExamHeader] = useState("");
  const [newExamSubheader, setNewExamSubheader] = useState("");
  const [newDuration, setNewDuration] = useState("30");
  const [newPassing, setNewPassing] = useState("60");
  const [newDefaultPositiveMarks, setNewDefaultPositiveMarks] = useState("1");
  const [newDefaultNegativeMarks, setNewDefaultNegativeMarks] = useState("0");
  const [newScheduled, setNewScheduled] = useState("");
  const [sectionDrafts, setSectionDrafts] = useState<SectionDraft[]>([makeSectionDraft()]);

  const [expandedTest, setExpandedTest] = useState<number | null>(null);
  const [questionsMap, setQuestionsMap] = useState<Record<number, Question[]>>({});
  const [sectionsMap, setSectionsMap] = useState<Record<number, TestSection[]>>({});
  const [activeSectionByTest, setActiveSectionByTest] = useState<Record<number, number>>({});
  const [draftsBySection, setDraftsBySection] = useState<Record<string, QuestionDraftState[]>>({});
  const [bulkImportingKey, setBulkImportingKey] = useState<string | null>(null);
  const [analyticsTest, setAnalyticsTest] = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<{ testId: number; question: Question } | null>(null);
  const [editDraft, setEditDraft] = useState<QuestionDraftState | null>(null);

  const [addQOpen, setAddQOpen] = useState<number | null>(null);
  const [qSectionId, setQSectionId] = useState<string>("");
  const [qSubjectLabel, setQSubjectLabel] = useState("");
  const [qCode, setQCode] = useState("");
  const [qSourceType, setQSourceType] = useState("manual");
  const [qDifficulty, setQDifficulty] = useState("moderate");
  const [qTopicTag, setQTopicTag] = useState("");
  const [qEstimatedTime, setQEstimatedTime] = useState("1.5");
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

  const { data: tests = [], isLoading } = useQuery<Test[]>({
    queryKey: ["admin-tests"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/tests`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const { data: examTemplates = FALLBACK_TEMPLATES } = useQuery<ExamTemplate[]>({
    queryKey: ["exam-templates"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/planner/exam-templates`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const applyPreset = (preset: string) => {
    setNewExamType(preset);
    const template = examTemplates.find((item) => item.key === preset) ?? FALLBACK_TEMPLATES.find((item) => item.key === preset);
    if (!template) return;
    setNewExamHeader(template.examHeader ?? template.name);
    setNewExamSubheader(template.examSubheader ?? `${template.name} Mock Assessment`);
    setNewDuration(String(template.durationMinutes));
    setNewPassing(template.passingScore == null ? "" : String(template.passingScore));
    setNewDefaultPositiveMarks(String(template.defaultPositiveMarks));
    setNewDefaultNegativeMarks(String(template.defaultNegativeMarks));
    setSectionDrafts(template.sections.map((section) => makeSectionDraft({
      title: section.title,
      description: section.description ?? "",
      subjectLabel: section.subjectLabel ?? "",
      questionCount: section.questionCount != null ? String(section.questionCount) : "",
      marksPerQuestion: section.marksPerQuestion != null ? String(section.marksPerQuestion) : "",
      negativeMarks: section.negativeMarks != null ? String(section.negativeMarks) : "",
      preferredQuestionType: section.preferredQuestionType ?? "mcq",
    })));
  };

  useEffect(() => {
    if (!createOpen) return;
    const templateExists = examTemplates.some((template) => template.key === newExamType);
    if (!newExamType || !templateExists) {
      const firstTemplate = examTemplates[0] ?? FALLBACK_TEMPLATES[0];
      if (firstTemplate) applyPreset(firstTemplate.key);
    }
  }, [createOpen, examTemplates, newExamType]);

  const updateSectionDraft = (id: string, patch: Partial<SectionDraft>) => {
    setSectionDrafts((prev) => prev.map((section) => (section.id === id ? { ...section, ...patch } : section)));
  };

  const getNextSectionForTest = (testId: number) => {
    const sections = sectionsMap[testId] ?? [];
    const questions = questionsMap[testId] ?? [];
    if (sections.length === 0) return null;
    const sectionCounts = new Map<number, number>();
    questions.forEach((question) => {
      if (question.sectionId) {
        sectionCounts.set(question.sectionId, (sectionCounts.get(question.sectionId) ?? 0) + 1);
      }
    });
    return sections.find((section) => {
      if (!section.questionCount || section.questionCount <= 0) return false;
      return (sectionCounts.get(section.id) ?? 0) < section.questionCount;
    }) ?? sections[0];
  };

  const generateQuestionCode = (selected: TestSection | null | undefined, testId: number) => {
    if (!selected) return "";
    const sectionQuestions = (questionsMap[testId] ?? []).filter((question) => question.sectionId === selected.id);
    const base =
      (selected.subjectLabel ?? selected.title)
        .replace(/[^a-zA-Z0-9]+/g, " ")
        .trim()
        .split(/\s+/)
        .slice(0, 3)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("") || "Q";
    return `${base}-${String(sectionQuestions.length + 1).padStart(2, "0")}`;
  };

  const applySectionDefaults = (selected: TestSection | null | undefined, test: Test) => {
    setQSectionId(selected ? String(selected.id) : "");
    setQSubjectLabel(selected?.subjectLabel ?? "");
    setQCode(generateQuestionCode(selected, test.id));
    setQPoints(String(selected?.marksPerQuestion ?? test.defaultPositiveMarks ?? 1));
    setQNegativeMarks(String(selected?.negativeMarks ?? test.defaultNegativeMarks ?? 0));
    const preferredType = (selected?.meta as Record<string, unknown> | null)?.preferredQuestionType;
    if (preferredType === "mcq" || preferredType === "multi" || preferredType === "integer") {
      setQType(preferredType);
      setQCorrect(0);
      setQCorrectMulti([]);
    }
  };

  const getIdealTimeForDifficulty = (difficulty: string) => {
    if (difficulty === "easy") return "1";
    if (difficulty === "tough") return "3";
    return "1.5";
  };

  const makeQuestionDraft = (section: TestSection, test: Test, testId: number, slotIndex: number): QuestionDraftState => {
    const preferredType = (section.meta as Record<string, unknown> | null)?.preferredQuestionType;
    const questionType: QuestionType =
      preferredType === "mcq" || preferredType === "multi" || preferredType === "integer" ? preferredType : "mcq";

    return {
      questionType,
      question: "",
      imageData: null,
      options: ["", "", "", ""],
      optionImages: [null, null, null, null],
      correctAnswer: 0,
      correctAnswerMulti: [],
      integerMode: "exact",
      correctInteger: "",
      correctIntegerMin: "",
      correctIntegerMax: "",
      difficulty: "moderate",
      chapterName: "",
      topicTag: "",
      idealTimeMinutes: "1.5",
      questionCode: `${generateQuestionCode(section, testId).replace(/\d+$/, "")}${String(slotIndex + 1).padStart(2, "0")}`,
      subjectLabel: section.subjectLabel ?? section.title,
      points: String(section.marksPerQuestion ?? test.defaultPositiveMarks ?? 1),
      negativeMarks: String(section.negativeMarks ?? test.defaultNegativeMarks ?? 0),
      sourceType: "manual",
    };
  };

  const makeDraftFromQuestion = (question: Question): QuestionDraftState => {
    const meta = (question.meta as Record<string, unknown> | null) ?? null;
    const difficultyValue = String(meta?.difficulty ?? "moderate").toLowerCase();
    const difficulty: QuestionDraftState["difficulty"] =
      difficultyValue === "easy" || difficultyValue === "tough" ? difficultyValue : "moderate";
    const estimatedTimeSeconds = Number(meta?.estimatedTimeSeconds ?? 0) || 0;
    const normalizedOptionCount =
      question.questionType === "integer"
        ? 0
        : Math.max(4, question.options.length, question.optionImages?.length ?? 0);
    const options = Array.from({ length: normalizedOptionCount }, (_, index) => question.options[index] ?? "");
    const optionImages = Array.from({ length: normalizedOptionCount }, (_, index) => question.optionImages?.[index] ?? null);
    const integerMode =
      question.questionType === "integer" && question.correctAnswerMin != null && question.correctAnswerMax != null
        ? "range"
        : "exact";

    return {
      questionType: question.questionType,
      question: question.question ?? "",
      imageData: question.imageData ?? null,
      options,
      optionImages,
      correctAnswer: question.correctAnswer ?? 0,
      correctAnswerMulti: question.correctAnswerMulti ?? [],
      integerMode,
      correctInteger: question.questionType === "integer" && integerMode === "exact" ? String(question.correctAnswer ?? "") : "",
      correctIntegerMin: integerMode === "range" ? String(question.correctAnswerMin ?? "") : "",
      correctIntegerMax: integerMode === "range" ? String(question.correctAnswerMax ?? "") : "",
      difficulty,
      chapterName: String(meta?.chapterName ?? ""),
      topicTag: String(meta?.topicTag ?? ""),
      idealTimeMinutes: estimatedTimeSeconds > 0 ? String(Number((estimatedTimeSeconds / 60).toFixed(2))) : getIdealTimeForDifficulty(difficulty),
      questionCode: question.questionCode ?? "",
      subjectLabel: question.subjectLabel ?? "",
      points: String(question.points ?? 1),
      negativeMarks: String(question.negativeMarks ?? 0),
      sourceType: question.sourceType ?? "manual",
    };
  };

  const handleDifficultyChange = (difficulty: string) => {
    setQDifficulty(difficulty);
    setQEstimatedTime(getIdealTimeForDifficulty(difficulty));
  };

  const getBuilderKey = (testId: number, sectionId: number) => `${testId}:${sectionId}`;

  const getRemainingSlots = (testId: number, section: TestSection) => {
    const used = (questionsMap[testId] ?? []).filter((question) => question.sectionId === section.id).length;
    const target = section.questionCount ?? 0;
    return Math.max(0, target - used);
  };

  const ensureSectionDrafts = (testId: number, test: Test, section: TestSection) => {
    const key = getBuilderKey(testId, section.id);
    const remaining = getRemainingSlots(testId, section);
    setDraftsBySection((prev) => {
      const existing = prev[key];
      if (existing && existing.length === remaining) return prev;
      return {
        ...prev,
        [key]: Array.from({ length: remaining }, (_, index) => makeQuestionDraft(section, test, testId, index)),
      };
    });
  };

  const updateDraft = (testId: number, sectionId: number, index: number, patch: Partial<QuestionDraftState>) => {
    const key = getBuilderKey(testId, sectionId);
    setDraftsBySection((prev) => ({
      ...prev,
      [key]: (prev[key] ?? []).map((draft, draftIndex) => (draftIndex === index ? { ...draft, ...patch } : draft)),
    }));
  };

  const handleDraftDifficultyChange = (testId: number, sectionId: number, index: number, difficulty: "easy" | "moderate" | "tough") => {
    updateDraft(testId, sectionId, index, {
      difficulty,
      idealTimeMinutes: getIdealTimeForDifficulty(difficulty),
    });
  };

  const toggleDraftMultiOption = (testId: number, sectionId: number, index: number, optionIndex: number) => {
    const key = getBuilderKey(testId, sectionId);
    setDraftsBySection((prev) => ({
      ...prev,
      [key]: (prev[key] ?? []).map((draft, draftIndex) => {
        if (draftIndex !== index) return draft;
        return {
          ...draft,
          correctAnswerMulti: draft.correctAnswerMulti.includes(optionIndex)
            ? draft.correctAnswerMulti.filter((value) => value !== optionIndex)
            : [...draft.correctAnswerMulti, optionIndex],
        };
      }),
    }));
  };

  const readImageAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read image"));
      reader.readAsDataURL(file);
    });

  const handleDraftQuestionImage = async (testId: number, sectionId: number, index: number, file?: File | null) => {
    if (!file) return;
    const dataUrl = await readImageAsDataUrl(file);
    updateDraft(testId, sectionId, index, { imageData: dataUrl });
  };

  const handleDraftOptionImage = async (testId: number, sectionId: number, index: number, optionIndex: number, file?: File | null) => {
    if (!file) return;
    const dataUrl = await readImageAsDataUrl(file);
    const key = getBuilderKey(testId, sectionId);
    setDraftsBySection((prev) => ({
      ...prev,
      [key]: (prev[key] ?? []).map((draft, draftIndex) => {
        if (draftIndex !== index) return draft;
        const nextOptionImages = [...draft.optionImages];
        nextOptionImages[optionIndex] = dataUrl;
        return { ...draft, optionImages: nextOptionImages };
      }),
    }));
  };

  const updateEditDraft = (patch: Partial<QuestionDraftState>) => {
    setEditDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const handleEditDifficultyChange = (difficulty: "easy" | "moderate" | "tough") => {
    updateEditDraft({
      difficulty,
      idealTimeMinutes: getIdealTimeForDifficulty(difficulty),
    });
  };

  const toggleEditMultiOption = (optionIndex: number) => {
    setEditDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        correctAnswerMulti: prev.correctAnswerMulti.includes(optionIndex)
          ? prev.correctAnswerMulti.filter((value) => value !== optionIndex)
          : [...prev.correctAnswerMulti, optionIndex],
      };
    });
  };

  const handleEditQuestionImage = async (file?: File | null) => {
    if (!file) return;
    const dataUrl = await readImageAsDataUrl(file);
    updateEditDraft({ imageData: dataUrl });
  };

  const handleEditOptionImage = async (optionIndex: number, file?: File | null) => {
    if (!file) return;
    const dataUrl = await readImageAsDataUrl(file);
    setEditDraft((prev) => {
      if (!prev) return prev;
      const nextOptionImages = [...prev.optionImages];
      nextOptionImages[optionIndex] = dataUrl;
      return { ...prev, optionImages: nextOptionImages };
    });
  };

  const canSaveDraft = (draft: QuestionDraftState) => {
    if (!draft.question.trim() && !draft.imageData) return false;
    if (draft.questionType === "mcq") {
      return draft.options.every((option, index) => option.trim() || draft.optionImages[index]) &&
        Boolean(draft.options[draft.correctAnswer]?.trim() || draft.optionImages[draft.correctAnswer]);
    }
    if (draft.questionType === "multi") {
      return draft.options.every((option, index) => option.trim() || draft.optionImages[index]) && draft.correctAnswerMulti.length > 0;
    }
    if (draft.integerMode === "range") {
      return draft.correctIntegerMin.trim() !== "" && draft.correctIntegerMax.trim() !== "";
    }
    return draft.correctInteger.trim() !== "";
  };

  const buildQuestionPayload = (draft: QuestionDraftState, test: Test, sectionId: number) => {
    const body: any = {
      question: draft.question.trim(),
      questionType: draft.questionType,
      sectionId,
      questionCode: draft.questionCode.trim() || null,
      sourceType: draft.sourceType,
      subjectLabel: draft.subjectLabel.trim() || null,
      points: parseFloat(draft.points) || 1,
      negativeMarks: parseFloat(draft.negativeMarks) || 0,
      imageData: draft.imageData || null,
      meta: {
        examType: test.examType ?? "custom",
        chapterLinked: false,
        difficulty: draft.difficulty,
        chapterName: draft.chapterName.trim() || null,
        topicTag: draft.topicTag.trim() || null,
        estimatedTimeSeconds: Math.round((parseFloat(draft.idealTimeMinutes) || 0) * 60),
      },
    };

    if (draft.questionType === "mcq") {
      body.options = draft.options;
      if (draft.optionImages.some(Boolean)) body.optionImages = draft.optionImages;
      body.correctAnswer = draft.correctAnswer;
    } else if (draft.questionType === "multi") {
      body.options = draft.options;
      if (draft.optionImages.some(Boolean)) body.optionImages = draft.optionImages;
      body.correctAnswerMulti = draft.correctAnswerMulti;
    } else {
      body.options = [];
      if (draft.integerMode === "range") {
        body.correctAnswerMin = parseInt(draft.correctIntegerMin);
        body.correctAnswerMax = parseInt(draft.correctIntegerMax);
      } else {
        body.correctAnswer = parseInt(draft.correctInteger) || 0;
      }
    }

    return body;
  };

  const buildBulkQuestionPayload = (row: BulkRowRecord, section: TestSection, test: Test, testId: number, rowIndex: number) => {
    const preferredType = (section.meta as Record<string, unknown> | null)?.preferredQuestionType;
    const questionType: QuestionType =
      preferredType === "mcq" || preferredType === "multi" || preferredType === "integer" ? preferredType : "mcq";

    const difficulty = parseBulkDifficulty(
      getBulkValue(row, ["difficulty", "level"]),
    );
    const idealTimeMinutes = getBulkValue(row, ["ideal_time", "ideal_time_minutes", "ideal_time_min", "time"]);
    const questionCodeBase = `${generateQuestionCode(section, testId).replace(/\d+$/, "")}${String(rowIndex + 1).padStart(2, "0")}`;
    const question = getBulkValue(row, ["question", "question_text", "prompt"]);
    const questionImage = getBulkValue(row, ["question_image", "question_image_url", "image", "image_url"]);
    const chapterName = getBulkValue(row, ["chapter", "chapter_name", "chapter_label"]);
    const topicTag = getBulkValue(row, ["topic", "topic_tag", "concept", "concept_tag"]);
    const sourceType = getBulkValue(row, ["source_type", "source"]) || "excel";
    const points = getBulkValue(row, ["marks", "points", "marks_per_question"]) || String(section.marksPerQuestion ?? test.defaultPositiveMarks ?? 1);
    const negativeMarks = getBulkValue(row, ["negative_marks", "negative", "minus_marks"]) || String(section.negativeMarks ?? test.defaultNegativeMarks ?? 0);

    const optionSlots = ["a", "b", "c", "d", "e", "f"].map((letter) => ({
      text: getBulkValue(row, [`option_${letter}`, `opt_${letter}`, letter]),
      image:
        getBulkValue(row, [
          `option_${letter}_image`,
          `option_${letter.toUpperCase()}_image`,
          `opt_${letter}_image`,
        ]) || null,
    }));
    const lastFilledOptionIndex = optionSlots.reduce((lastIndex, slot, index) => (
      slot.text || slot.image ? index : lastIndex
    ), -1);
    const normalizedOptionSlots = optionSlots.slice(0, Math.max(4, lastFilledOptionIndex + 1));
    const options = normalizedOptionSlots.map((slot) => slot.text);
    const optionImages = normalizedOptionSlots.map((slot) => slot.image);

    const payload: any = {
      question,
      questionType,
      sectionId: section.id,
      questionCode: getBulkValue(row, ["question_code", "code"]) || questionCodeBase,
      sourceType,
      subjectLabel: section.subjectLabel ?? section.title,
      points: parseFloat(points) || 1,
      negativeMarks: parseFloat(negativeMarks) || 0,
      imageData: questionImage || null,
      meta: {
        examType: test.examType ?? "custom",
        chapterLinked: false,
        difficulty,
        chapterName: chapterName || null,
        topicTag: topicTag || null,
        estimatedTimeSeconds: Math.round((parseFloat(idealTimeMinutes || getIdealTimeForDifficulty(difficulty)) || 0) * 60),
      },
    };

    if (questionType === "mcq") {
      const validOptions = options.length > 0 ? options : ["", "", "", ""];
      if (!validOptions.some((option, index) => option.trim() || optionImages[index])) {
        throw new Error(`Row ${rowIndex + 2}: MCQ row me options missing hain`);
      }
      payload.options = validOptions;
      if (optionImages.some(Boolean)) payload.optionImages = optionImages;
      payload.correctAnswer = parseAnswerIndex(getBulkValue(row, ["correct_answer", "answer", "correct"]), validOptions.length);
    } else if (questionType === "multi") {
      const validOptions = options.length > 0 ? options : ["", "", "", ""];
      if (!validOptions.some((option, index) => option.trim() || optionImages[index])) {
        throw new Error(`Row ${rowIndex + 2}: Multi row me options missing hain`);
      }
      payload.options = validOptions;
      if (optionImages.some(Boolean)) payload.optionImages = optionImages;
      payload.correctAnswerMulti = parseMultiAnswerIndices(
        getBulkValue(row, ["correct_answers", "correct_answer", "answer", "correct"]),
        validOptions.length,
      );
    } else {
      payload.options = [];
      const rangeMin = getBulkValue(row, ["correct_min", "min_answer", "answer_min"]);
      const rangeMax = getBulkValue(row, ["correct_max", "max_answer", "answer_max"]);
      if (rangeMin && rangeMax) {
        payload.correctAnswerMin = Number(rangeMin);
        payload.correctAnswerMax = Number(rangeMax);
      } else {
        payload.correctAnswer = Number(getBulkValue(row, ["correct_answer", "answer", "correct"]) || 0);
      }
    }

    return payload;
  };

  const handleBulkQuestionImport = async (test: Test, section: TestSection, file?: File | null) => {
    if (!file) return;
    const sectionKey = getBuilderKey(test.id, section.id);
    const remaining = getRemainingSlots(test.id, section);
    if (remaining <= 0) {
      toast({ title: "Section already filled", description: "Is section ke saare slots already complete hain." });
      return;
    }

    setBulkImportingKey(sectionKey);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error("Sheet empty hai");

      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheetName], { defval: "" });
      const rows = rawRows.map(normalizeBulkRow).filter((row) => {
        const question = getBulkValue(row, ["question", "question_text", "prompt"]);
        const image = getBulkValue(row, ["question_image", "question_image_url", "image", "image_url"]);
        return Boolean(question || image);
      });
      if (rows.length === 0) throw new Error("Excel me koi valid question row nahi mili");

      const limitedRows = rows.slice(0, remaining);
      const createdQuestions: Question[] = [];

      for (let rowIndex = 0; rowIndex < limitedRows.length; rowIndex += 1) {
        const payload = buildBulkQuestionPayload(limitedRows[rowIndex], section, test, test.id, rowIndex);
        const response = await fetch(`${BASE}/api/tests/${test.id}/questions`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const message = await response.text();
          throw new Error(`Row ${rowIndex + 2}: ${message || "Failed to import question"}`);
        }
        createdQuestions.push(await response.json());
      }

      setQuestionsMap((prev) => ({
        ...prev,
        [test.id]: [...(prev[test.id] ?? []), ...createdQuestions],
      }));

      toast({
        title: "Excel import complete",
        description: `${createdQuestions.length} question${createdQuestions.length === 1 ? "" : "s"} ${section.subjectLabel ?? section.title} me add ho gaye.`,
      });

      if (rows.length > remaining) {
        toast({
          title: "Some rows skipped",
          description: `${rows.length - remaining} extra row slots se zyada thi, isliye import nahi hui.`,
        });
      }
    } catch (error) {
      toast({
        title: "Excel import failed",
        description: error instanceof Error ? error.message : "Sheet parse nahi ho payi",
        variant: "destructive",
      });
    } finally {
      setBulkImportingKey(null);
    }
  };

  const difficultyTone: Record<"easy" | "moderate" | "tough", string> = {
    easy: "border-emerald-500 bg-emerald-500 text-white",
    moderate: "border-orange-500 bg-orange-500 text-white",
    tough: "border-rose-500 bg-rose-500 text-white",
  };

  const difficultyHoverTone: Record<"easy" | "moderate" | "tough", string> = {
    easy: "hover:border-emerald-400 hover:bg-emerald-50",
    moderate: "hover:border-orange-400 hover:bg-orange-50",
    tough: "hover:border-rose-400 hover:bg-rose-50",
  };

  const totalTests = tests.length;
  const publishedTests = tests.filter((test) => test.isPublished).length;
  const draftTests = totalTests - publishedTests;
  const chapterLinkedTests = tests.filter((test) => test.chapterId !== null).length;
  const totalQuestions = Object.values(questionsMap).reduce((sum, items) => sum + items.length, 0);

  const createMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/tests`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          description: null,
          examType: newExamType,
          examHeader: newExamHeader.trim() || null,
          examSubheader: newExamSubheader.trim() || null,
          instructions: null,
          durationMinutes: parseInt(newDuration) || 30,
          passingScore: newPassing.trim() ? parseInt(newPassing) : null,
          defaultPositiveMarks: parseFloat(newDefaultPositiveMarks) || 1,
          defaultNegativeMarks: parseFloat(newDefaultNegativeMarks) || 0,
          examConfig: {
            bulkSupported: true,
            sectionCount: sectionDrafts.filter((section) => (section.subjectLabel.trim() || section.title.trim())).length,
            sourceModes: ["manual", "bulk", "ai"],
          },
          scheduledAt: newScheduled || null,
              sections: sectionDrafts
            .filter((section) => (section.subjectLabel.trim() || section.title.trim()))
            .map((section) => ({
              title: (section.subjectLabel.trim() || section.title.trim()),
              description: section.description.trim() || null,
              subjectLabel: section.subjectLabel.trim() || null,
              questionCount: section.questionCount.trim() ? parseInt(section.questionCount) : null,
              marksPerQuestion: section.marksPerQuestion.trim() ? parseFloat(section.marksPerQuestion) : null,
              negativeMarks: section.negativeMarks.trim() ? parseFloat(section.negativeMarks) : null,
              meta: { structureSource: newExamType, preferredQuestionType: section.preferredQuestionType },
            })),
        }),
      });
      if (!r.ok) {
        const message = await r.text();
        throw new Error(message || "Failed");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tests"] });
      setCreateOpen(false); setNewExamType(""); setNewTitle(""); setNewExamHeader(""); setNewExamSubheader(""); setNewDuration("30"); setNewPassing(""); setNewDefaultPositiveMarks("1"); setNewDefaultNegativeMarks("0"); setNewScheduled(""); setSectionDrafts([makeSectionDraft()]);
      toast({ title: "Test created" });
    },
    onError: (error: Error) => toast({ title: "Failed to create test", description: error.message, variant: "destructive" }),
  });

  const togglePublish = useMutation({
    mutationFn: async ({ id, isPublished }: { id: number; isPublished: boolean }) => {
      const r = await fetch(`${BASE}/api/tests/${id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isPublished }) });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-tests"] }); toast({ title: "Test updated" }); },
  });

  const deleteTestMutation = useMutation({
    mutationFn: async (id: number) => { await fetch(`${BASE}/api/tests/${id}`, { method: "DELETE", credentials: "include" }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-tests"] }); toast({ title: "Test deleted" }); },
  });

  const addQuestionMutation = useMutation({
    mutationFn: async ({ testId, body }: { testId: number; body: any }) => {
      const r = await fetch(`${BASE}/api/tests/${testId}/questions`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: (data, variables) => {
      setQuestionsMap((prev) => ({ ...prev, [variables.testId]: [...(prev[variables.testId] ?? []), data] }));
      toast({ title: "Question added" });
    },
    onError: () => toast({ title: "Failed to add question", variant: "destructive" }),
  });

  const updateQuestionMutation = useMutation({
    mutationFn: async ({ testId, qid, body }: { testId: number; qid: number; body: any }) => {
      const r = await fetch(`${BASE}/api/tests/${testId}/questions/${qid}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const message = await r.text();
        throw new Error(message || "Failed");
      }
      return r.json();
    },
    onSuccess: (data, variables) => {
      setQuestionsMap((prev) => ({
        ...prev,
        [variables.testId]: (prev[variables.testId] ?? []).map((question) => (
          question.id === variables.qid ? data : question
        )),
      }));
      setEditingQuestion(null);
      setEditDraft(null);
      toast({ title: "Question updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update question", description: error.message, variant: "destructive" });
    },
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: async ({ testId, qid }: { testId: number; qid: number }) => { await fetch(`${BASE}/api/tests/${testId}/questions/${qid}`, { method: "DELETE", credentials: "include" }); },
    onSuccess: (_, { testId, qid }) => { setQuestionsMap((prev) => ({ ...prev, [testId]: (prev[testId] ?? []).filter((q) => q.id !== qid) })); toast({ title: "Question removed" }); },
  });

  const resetQuestionForm = () => {
    setAddQOpen(null); setQType("mcq"); setQText(""); setQOptions(["", "", "", ""]);
    setQSectionId(""); setQSubjectLabel(""); setQCode(""); setQSourceType("manual"); setQCorrect(0); setQCorrectMulti([]); setQCorrectInt("");
    setQDifficulty("moderate"); setQTopicTag(""); setQEstimatedTime("1.5");
    setQIntegerMode("exact"); setQCorrectIntMin(""); setQCorrectIntMax("");
    setQPoints("1"); setQNegativeMarks("0"); setQImageData(null); setQOptionImages([null, null, null, null]);
  };

  const loadQuestions = async (testId: number) => {
    if (questionsMap[testId] && sectionsMap[testId]) return;
    const r = await fetch(`${BASE}/api/tests/${testId}`, { credentials: "include" });
    if (!r.ok) return;
    const data = await r.json();
    setQuestionsMap((prev) => ({ ...prev, [testId]: data.questions ?? [] }));
    setSectionsMap((prev) => ({ ...prev, [testId]: data.sections ?? [] }));
  };

  const openAnalytics = async (test: Test) => {
    setAnalyticsLoading(true);
    setAnalyticsTest(null);
    const r = await fetch(`${BASE}/api/tests/${test.id}/analytics`, { credentials: "include" });
    setAnalyticsLoading(false);
    if (!r.ok) { toast({ title: "Failed to load analytics", variant: "destructive" }); return; }
    setAnalyticsTest(await r.json());
  };

  const openQuestionEditor = (testId: number, question: Question) => {
    setEditingQuestion({ testId, question });
    setEditDraft(makeDraftFromQuestion(question));
  };

  const toggleExpand = (testId: number) => {
    if (expandedTest === testId) { setExpandedTest(null); return; }
    setExpandedTest(testId);
    loadQuestions(testId);
  };

  useEffect(() => {
    if (expandedTest == null) return;
    const test = tests.find((item) => item.id === expandedTest);
    const sections = sectionsMap[expandedTest] ?? [];
    if (!test || sections.length === 0) return;

    const activeSectionId = activeSectionByTest[expandedTest] ?? sections[0].id;
    if (!activeSectionByTest[expandedTest]) {
      setActiveSectionByTest((prev) => ({ ...prev, [expandedTest]: sections[0].id }));
    }
    const activeSection = sections.find((section) => section.id === activeSectionId) ?? sections[0];
    ensureSectionDrafts(expandedTest, test, activeSection);
  }, [expandedTest, tests, sectionsMap, questionsMap, activeSectionByTest]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast({ title: "Image too large", description: "Max 5MB", variant: "destructive" }); return; }
    const reader = new FileReader();
    reader.onload = () => setQImageData(reader.result as string);
    reader.readAsDataURL(file); e.target.value = "";
  };

  const toggleMultiOption = (i: number) => {
    setQCorrectMulti((prev) => prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]);
  };

  const canSaveQuestion = () => {
    if (!qText.trim()) return false;
    if (qType === "mcq") return qOptions.every((o) => o.trim());
    if (qType === "multi") return qOptions.every((o) => o.trim()) && qCorrectMulti.length >= 1;
    if (qType === "integer") {
      if (qIntegerMode === "range") {
        return qCorrectIntMin.trim() !== "" && !isNaN(parseInt(qCorrectIntMin)) &&
               qCorrectIntMax.trim() !== "" && !isNaN(parseInt(qCorrectIntMax)) &&
               parseInt(qCorrectIntMin) <= parseInt(qCorrectIntMax);
      }
      return qCorrectInt.trim() !== "" && !isNaN(parseInt(qCorrectInt));
    }
    return false;
  };

  const handleOptionImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast({ title: "Image too large", description: "Max 5MB", variant: "destructive" }); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const idx = activeOptIdxRef.current;
      if (idx < 0) return;
      setQOptionImages((prev) => { const n = [...prev]; n[idx] = reader.result as string; return n; });
    };
    reader.readAsDataURL(file); e.target.value = "";
  };

  const activeEditTest = editingQuestion ? tests.find((test) => test.id === editingQuestion.testId) ?? null : null;

  return (
    <div className="space-y-6 bg-[#F5F7FB]">
      <div className="rounded-[24px] border border-[#E5E7EB] bg-[#FFFFFF] p-6 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_320px]">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#E5E7EB] bg-[#FFFFFF] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#6B7280]">
              <ClipboardList size={12} className="text-[#5B4DFF]" />
              Assessment Core
            </div>
            <div>
              <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight text-[#111827]">
                <ClipboardList size={24} className="text-[#5B4DFF]" />
                Tests & Quizzes
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-[#6B7280]">
                Build test papers in a simple white workspace and let teachers fill planner-defined sections cleanly.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-[#6B7280]">Total Tests</p>
                <p className="mt-2 text-3xl font-semibold text-[#111827]">{totalTests}</p>
              </div>
              <div className="rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-[#6B7280]">Published</p>
                <p className="mt-2 text-3xl font-semibold text-[#22C55E]">{publishedTests}</p>
              </div>
              <div className="rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-[#6B7280]">Drafts</p>
                <p className="mt-2 text-3xl font-semibold text-[#F97316]">{draftTests}</p>
              </div>
              <div className="rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-[#6B7280]">Loaded Questions</p>
                <p className="mt-2 text-3xl font-semibold text-[#3B82F6]">{totalQuestions}</p>
              </div>
            </div>
          </div>
          <div className="rounded-3xl border border-[#E5E7EB] bg-[#FFFFFF] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6B7280]">Quick Launch</p>
            <p className="mt-2 text-sm text-[#6B7280]">Create a new planner-structured test.</p>
            <Button onClick={() => setCreateOpen(true)} className="mt-4 w-full bg-[#5B4DFF] text-white hover:bg-[#4C3FF0]" data-testid="button-create-test">
              <Plus size={15} className="mr-2" />
              Create Test
            </Button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : tests.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><ClipboardList size={40} className="mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground">No tests yet. Create your first test.</p></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {tests.map((test) => {
            const isOpen = expandedTest === test.id;
            const qs = questionsMap[test.id] ?? [];
            const sections = sectionsMap[test.id] ?? [];
            return (
                <Card key={test.id} className="rounded-3xl border border-[#E5E7EB] bg-[#FFFFFF] shadow-sm" data-testid={`test-card-${test.id}`}>
                  <CardContent className="p-0">
                  <div className="flex items-center gap-3 p-4">
                    <button className="flex-1 text-left flex items-center gap-3 min-w-0" onClick={() => toggleExpand(test.id)}>
                      {isOpen ? <ChevronDown size={16} className="text-muted-foreground shrink-0" /> : <ChevronRight size={16} className="text-muted-foreground shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{test.title}</span>
                          <Badge variant={test.isPublished ? "default" : "secondary"} className="text-xs">{test.isPublished ? "Published" : "Draft"}</Badge>
                          {test.subjectName && <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{test.subjectName}</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1"><Clock size={11} />{test.durationMinutes} min</span>
                          <span>{test.passingScore == null ? "No pass cutoff" : `Pass: ${test.passingScore}%`}</span>
                          {test.scheduledAt && <span>{format(new Date(test.scheduledAt), "MMM d, yyyy")}</span>}
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" className="h-8 px-2 text-xs gap-1.5 text-[#6B7280]" onClick={() => openAnalytics(test)} data-testid={`button-view-results-${test.id}`}>
                        <BarChart3 size={13} />Analytics
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 px-2 text-xs gap-1.5 text-[#5B4DFF] hover:text-[#4C3FF0] hover:bg-[#EEF2FF]"
                        onClick={() => setLocation(`/admin/tests/${test.id}/analytics`)} data-testid={`button-advanced-analytics-${test.id}`}>
                        <TrendingUp size={13} />Advanced
                      </Button>
                      <Button size="sm" variant="ghost" className={`h-8 px-2 text-xs gap-1.5 ${test.isPublished ? "text-[#F97316]" : "text-[#22C55E]"}`}
                        onClick={() => togglePublish.mutate({ id: test.id, isPublished: !test.isPublished })} data-testid={`button-toggle-publish-${test.id}`}>
                        {test.isPublished ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                        {test.isPublished ? "Unpublish" : "Publish"}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => { if (confirm("Delete this test?")) deleteTestMutation.mutate(test.id); }} data-testid={`button-delete-test-${test.id}`}>
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="max-h-[76vh] overflow-y-auto border-t border-slate-200 bg-white p-5 space-y-5">
                      {sections.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Exam Structure</p>
                          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {sections.map((section, index) => {
                              const isActive = (activeSectionByTest[test.id] ?? sections[0]?.id) === section.id;
                              const total = section.questionCount ?? 0;
                              const left = getRemainingSlots(test.id, section);
                              return (
                              <button
                                key={section.id}
                                type="button"
                                onClick={() => {
                                  setActiveSectionByTest((prev) => ({ ...prev, [test.id]: section.id }));
                                  ensureSectionDrafts(test.id, test, section);
                                }}
                                className={`rounded-2xl border px-4 py-4 text-left text-xs shadow-sm transition ${isActive ? "border-indigo-400 bg-indigo-50/60 ring-2 ring-indigo-100" : "border-slate-200 bg-white hover:border-slate-300"}`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <p className="font-semibold text-sm">{index + 1}. {section.subjectLabel ?? section.title}</p>
                                  <Badge variant="secondary">{section.subjectLabel ?? "General"}</Badge>
                                </div>
                                {section.description && <p className="mt-1 text-muted-foreground">{section.description}</p>}
                                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                                  <span>Questions left: {left} / Total: {total || "—"}</span>
                                  <span>+ve: {section.marksPerQuestion ?? "—"}</span>
                                  <span>-ve: {section.negativeMarks ?? 0}</span>
                                  <span>Type: {String((section.meta as Record<string, unknown> | null)?.preferredQuestionType ?? "mcq").toUpperCase()}</span>
                                </div>
                              </button>
                            )})}
                          </div>
                        </div>
                      )}
                      {(() => {
                        const activeSectionId = activeSectionByTest[test.id] ?? sections[0]?.id;
                        const activeSection = sections.find((section) => section.id === activeSectionId) ?? sections[0];
                        const sectionKey = activeSection ? getBuilderKey(test.id, activeSection.id) : "";
                        const sectionDrafts = sectionKey ? (draftsBySection[sectionKey] ?? []) : [];
                        return activeSection ? (
                        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.06)]">
                          <div className="space-y-5">
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">Bulk question import</p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    Active section ke liye Excel sheet upload karo. Planner-defined type, marks aur -ve marks auto-apply honge.
                                  </p>
                                  <p className="mt-1 text-[11px] text-slate-400">
                                    Columns: question, option_a, option_b, option_c, option_d, correct_answer, topic_tag, difficulty, ideal_time, question_image.
                                  </p>
                                </div>
                                <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-medium text-[#111827] shadow-sm transition hover:border-[#5B4DFF] hover:text-[#5B4DFF]">
                                  {bulkImportingKey === sectionKey ? "Importing..." : "Upload Excel"}
                                  <input
                                    type="file"
                                    accept=".xlsx,.xls,.csv"
                                    className="hidden"
                                    disabled={bulkImportingKey === sectionKey}
                                    onChange={(event) => {
                                      handleBulkQuestionImport(test, activeSection, event.target.files?.[0]);
                                      event.currentTarget.value = "";
                                    }}
                                  />
                                </label>
                              </div>
                            </div>
                            {sectionDrafts.length === 0 ? (
                              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                                Is section ke saare question slots fill ho chuke hain.
                              </div>
                            ) : (
                              <div className="space-y-5">
                                {sectionDrafts.map((draft, draftIndex) => (
                                  <div key={draftIndex} className="rounded-3xl border border-slate-200 bg-slate-50/50 p-5">
                                    <div className="mb-4 flex items-center justify-between">
                                      <div>
                                        <h4 className="text-lg font-semibold text-slate-900">Question {draftIndex + 1}</h4>
                                        <p className="text-sm text-slate-500">{draft.questionCode} · {draft.subjectLabel}</p>
                                      </div>
                                      <Badge variant="outline" className="bg-white">{qTypeLabel[draft.questionType]}</Badge>
                                    </div>

                                    <div className="mt-4">
                                      <Label className="text-xs">Question</Label>
                                      <Textarea value={draft.question} onChange={(e) => updateDraft(test.id, activeSection.id, draftIndex, { question: e.target.value })} rows={3} className="mt-1 resize-none bg-white" placeholder="Type your question here..." />
                                      <div className="mt-2 flex items-center gap-3">
                                        {draft.imageData ? (
                                          <div className="relative">
                                            <img src={draft.imageData} alt="" className="h-auto w-auto max-w-full rounded-lg border border-slate-200 object-contain" />
                                            <button
                                              type="button"
                                              onClick={() => updateDraft(test.id, activeSection.id, draftIndex, { imageData: null })}
                                              className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-white"
                                            >
                                              <X size={10} />
                                            </button>
                                          </div>
                                        ) : (
                                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500 hover:border-indigo-400 hover:text-indigo-600">
                                            <ImagePlus size={13} />
                                            Add image
                                            <input
                                              type="file"
                                              accept="image/*"
                                              className="hidden"
                                              onChange={(e) => handleDraftQuestionImage(test.id, activeSection.id, draftIndex, e.target.files?.[0])}
                                            />
                                          </label>
                                        )}
                                      </div>
                                      <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
                                        <Clock size={12} />
                                        <span>Ideal time auto-fills from difficulty, but teacher can still change it above.</span>
                                      </div>
                                    </div>

                                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_180px] md:items-end">
                                      <div>
                                        <Label className="text-xs">Chapter Name</Label>
                                        <Input
                                          value={draft.chapterName}
                                          onChange={(e) => updateDraft(test.id, activeSection.id, draftIndex, { chapterName: e.target.value })}
                                          className="mt-1 bg-white"
                                          placeholder="e.g. Semiconductor Basics"
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-xs">Topic Name</Label>
                                        <Input value={draft.topicTag} onChange={(e) => updateDraft(test.id, activeSection.id, draftIndex, { topicTag: e.target.value })} className="mt-1 bg-white" placeholder="e.g. Biasing" />
                                      </div>
                                      <div>
                                        <Label className="text-xs">Difficulty</Label>
                                        <div className="mt-1 flex items-center gap-2">
                                          {(["easy", "moderate", "tough"] as const).map((level) => {
                                            const active = draft.difficulty === level;
                                            return (
                                              <button
                                                key={level}
                                                type="button"
                                                onClick={() => handleDraftDifficultyChange(test.id, activeSection.id, draftIndex, level)}
                                                className={`flex h-7 w-7 items-center justify-center rounded-md border transition ${active ? difficultyTone[level] : `border-slate-300 bg-white text-transparent ${difficultyHoverTone[level]}`}`}
                                                title={level}
                                              >
                                                <CheckCircle2 size={13} className={active ? "text-white" : "text-transparent"} />
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                      <div>
                                        <Label className="text-xs">Ideal Time (minutes)</Label>
                                        <Input
                                          type="number"
                                          min={0}
                                          step="0.1"
                                          value={draft.idealTimeMinutes}
                                          onChange={(e) => updateDraft(test.id, activeSection.id, draftIndex, { idealTimeMinutes: e.target.value })}
                                          className="mt-1 bg-white"
                                        />
                                      </div>
                                    </div>

                                    {(draft.questionType === "mcq" || draft.questionType === "multi") && (
                                      <div className="mt-4 space-y-2">
                                        <Label className="text-xs">Options</Label>
                                        {draft.options.map((option, optionIndex) => {
                                          const isSelected = draft.questionType === "mcq" ? draft.correctAnswer === optionIndex : draft.correctAnswerMulti.includes(optionIndex);
                                          return (
                                            <div key={optionIndex} className="flex items-center gap-2">
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  if (draft.questionType === "mcq") {
                                                    updateDraft(test.id, activeSection.id, draftIndex, { correctAnswer: optionIndex });
                                                  } else {
                                                    toggleDraftMultiOption(test.id, activeSection.id, draftIndex, optionIndex);
                                                  }
                                                }}
                                                className={`flex h-6 w-6 shrink-0 items-center justify-center ${draft.questionType === "mcq" ? "rounded-full border-2" : "rounded border-2"} ${isSelected ? "border-indigo-500 bg-indigo-500" : "border-slate-300 bg-white"}`}
                                              >
                                                {isSelected && (draft.questionType === "mcq" ? <div className="h-2 w-2 rounded-full bg-white" /> : <CheckCircle2 size={12} className="text-white" />)}
                                              </button>
                                              <span className="w-5 text-xs font-semibold">{String.fromCharCode(65 + optionIndex)}.</span>
                                              <Input
                                                value={option}
                                                onChange={(e) => updateDraft(test.id, activeSection.id, draftIndex, {
                                                  options: draft.options.map((existingOption, existingIndex) => existingIndex === optionIndex ? e.target.value : existingOption),
                                                })}
                                                className="bg-white"
                                                placeholder={`Option ${String.fromCharCode(65 + optionIndex)}`}
                                              />
                                              {draft.optionImages[optionIndex] ? (
                                                <div className="relative">
                                                  <img src={draft.optionImages[optionIndex] ?? ""} alt="" className="h-auto w-auto max-w-full rounded border border-slate-200 object-contain" />
                                                  <button
                                                    type="button"
                                                    onClick={() => updateDraft(test.id, activeSection.id, draftIndex, {
                                                      optionImages: draft.optionImages.map((image, imageIndex) => imageIndex === optionIndex ? null : image),
                                                    })}
                                                    className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-white"
                                                  >
                                                    <X size={10} />
                                                  </button>
                                                </div>
                                              ) : (
                                                <label className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded border border-dashed border-slate-300 text-slate-400 hover:border-indigo-400 hover:text-indigo-600">
                                                  <ImagePlus size={13} />
                                                  <input
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={(e) => handleDraftOptionImage(test.id, activeSection.id, draftIndex, optionIndex, e.target.files?.[0])}
                                                  />
                                                </label>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {draft.questionType === "integer" && (
                                      <div className="mt-4 space-y-3">
                                        <div className="flex gap-2">
                                          <button
                                            type="button"
                                            onClick={() => updateDraft(test.id, activeSection.id, draftIndex, { integerMode: "exact" })}
                                            className={`flex-1 rounded-lg border-2 px-3 py-2 text-xs font-medium ${draft.integerMode === "exact" ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white"}`}
                                          >
                                            Exact Answer
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => updateDraft(test.id, activeSection.id, draftIndex, { integerMode: "range" })}
                                            className={`flex-1 rounded-lg border-2 px-3 py-2 text-xs font-medium ${draft.integerMode === "range" ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white"}`}
                                          >
                                            Answer Range
                                          </button>
                                        </div>
                                        {draft.integerMode === "exact" ? (
                                          <div>
                                            <Label className="text-xs">Correct Answer</Label>
                                            <Input type="number" value={draft.correctInteger} onChange={(e) => updateDraft(test.id, activeSection.id, draftIndex, { correctInteger: e.target.value })} className="mt-1 w-44 bg-white" />
                                          </div>
                                        ) : (
                                          <div className="grid gap-3 sm:grid-cols-2">
                                            <div>
                                              <Label className="text-xs">Minimum</Label>
                                              <Input type="number" value={draft.correctIntegerMin} onChange={(e) => updateDraft(test.id, activeSection.id, draftIndex, { correctIntegerMin: e.target.value })} className="mt-1 bg-white" />
                                            </div>
                                            <div>
                                              <Label className="text-xs">Maximum</Label>
                                              <Input type="number" value={draft.correctIntegerMax} onChange={(e) => updateDraft(test.id, activeSection.id, draftIndex, { correctIntegerMax: e.target.value })} className="mt-1 bg-white" />
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    <div className="mt-5 flex justify-end">
                                      <Button
                                        disabled={!canSaveDraft(draft) || addQuestionMutation.isPending}
                                        onClick={() => addQuestionMutation.mutate({
                                          testId: test.id,
                                          body: buildQuestionPayload(draft, test, activeSection.id),
                                        }, {
                                          onSuccess: () => {
                                            setDraftsBySection((prev) => ({
                                              ...prev,
                                              [sectionKey]: (prev[sectionKey] ?? []).filter((_, currentIndex) => currentIndex !== draftIndex),
                                            }));
                                          },
                                        })}
                                      >
                                        {addQuestionMutation.isPending ? "Saving..." : `Save Question ${draftIndex + 1}`}
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        ) : null;
                      })()}
                      {qs.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No questions yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {qs.map((q, idx) => (
                            <div key={q.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid={`question-${q.id}`}>
                              <div className="flex items-start gap-2">
                                <span className="text-xs font-semibold text-muted-foreground shrink-0 mt-0.5">Q{idx + 1}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <p className="text-sm font-medium flex-1">{q.question}</p>
                                    {q.subjectLabel && <Badge variant="outline" className="text-[10px]">{q.subjectLabel}</Badge>}
                                    {q.questionCode && <Badge variant="secondary" className="text-[10px]">{q.questionCode}</Badge>}
                                    <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${q.questionType === "multi" ? "bg-purple-100 text-purple-700" : q.questionType === "integer" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>
                                      {qTypeIcon[q.questionType ?? "mcq"]}{qTypeLabel[q.questionType ?? "mcq"]}
                                    </span>
                                  </div>
                                  {q.imageData && <div className="mt-1 mb-2"><img src={q.imageData} alt="Q visual" className="max-h-32 rounded-lg border border-border object-contain" /></div>}
                                  {q.questionType === "integer" ? (
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                      <span className="text-xs text-muted-foreground">Correct answer:</span>
                                      {(q.correctAnswerMin !== null && q.correctAnswerMin !== undefined && q.correctAnswerMax !== null && q.correctAnswerMax !== undefined) ? (
                                        <span className="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{q.correctAnswerMin} — {q.correctAnswerMax}</span>
                                      ) : (
                                        <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded">{q.correctAnswer}</span>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-2 gap-1 mt-1">
                                      {q.options.map((opt, i) => {
                                        const isCorrect = q.questionType === "multi"
                                          ? (q.correctAnswerMulti ?? []).includes(i)
                                          : i === q.correctAnswer;
                                        const optImg = q.optionImages?.[i];
                                        return (
                                          <div key={i} className={`text-xs px-2 py-1 rounded flex flex-col gap-1 ${isCorrect ? "bg-green-50 text-green-700 font-medium border border-green-200" : "bg-muted/50 text-muted-foreground"}`}>
                                            <div className="flex items-center gap-1">
                                              {isCorrect && <CheckCircle2 size={11} />}
                                              {String.fromCharCode(65 + i)}. {opt}
                                            </div>
                                            {optImg && <img src={optImg} alt="" className="max-h-16 rounded object-contain border border-border/50" />}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {(() => {
                                      const meta = (q.meta as Record<string, unknown> | null) ?? null;
                                      const chapterName = String(meta?.chapterName ?? "").trim();
                                      const topicName = String(meta?.topicTag ?? "").trim();
                                      const detailBits = [
                                        q.points ? `${q.points} pt${q.points !== 1 ? "s" : ""}` : null,
                                        `-ve ${Number(q.negativeMarks ?? 0).toFixed(2)}`,
                                        chapterName || null,
                                        topicName || null,
                                        String(meta?.difficulty ?? "moderate"),
                                        `ideal ${((Number(meta?.estimatedTimeSeconds ?? 0) || 0) / 60).toFixed(1)} min`,
                                      ].filter(Boolean);
                                      return detailBits.join(" · ");
                                    })()}
                                  </p>
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 text-[#5B4DFF] shrink-0 hover:bg-[#EEF2FF] hover:text-[#4C3FF0]"
                                  onClick={() => openQuestionEditor(test.id, q)}
                                >
                                  <PencilLine size={11} />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive shrink-0"
                                  onClick={() => deleteQuestionMutation.mutate({ testId: test.id, qid: q.id })}>
                                  <Trash2 size={11} />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  </CardContent>
                </Card>
            );
          })}
        </div>
      )}

      {/* ─── Create Test Dialog ─── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create New Test</DialogTitle></DialogHeader>
          <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_320px]">
                <div className="space-y-4">
                  <div><Label className="text-xs">Test Title *</Label><Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. GATE Physics Full Test 1" className="mt-1" data-testid="input-test-title" /></div>
                </div>
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Exam Structure</p>
                  <div className="mt-3 grid gap-2">
                    <Select value={newExamType} onValueChange={(value) => applyPreset(value)}>
                      <SelectTrigger><SelectValue placeholder="Select structure" /></SelectTrigger>
                      <SelectContent>
                        {examTemplates.map((template) => (
                          <SelectItem key={template.id} value={template.key}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <p className="font-semibold">Student Visibility</p>
                <p className="mt-1 text-sm">
                  Ye test un students ko dikhai dega jinhone registration ya profile me <strong>{String(newExamType || "exam").toUpperCase()}</strong> select kiya hai.
                </p>
              </div>
              <div><Label className="text-xs">Scheduled Date (optional)</Label><Input type="datetime-local" value={newScheduled} onChange={(e) => setNewScheduled(e.target.value)} className="mt-1" /></div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button disabled={!newTitle.trim() || !sectionDrafts.some((section) => section.subjectLabel.trim() || section.title.trim()) || createMutation.isPending} onClick={() => createMutation.mutate()} data-testid="button-confirm-create-test">
                {createMutation.isPending ? "Creating..." : "Create Test"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingQuestion && editDraft)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingQuestion(null);
            setEditDraft(null);
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Question</DialogTitle>
          </DialogHeader>
          {editingQuestion && editDraft && activeEditTest ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#6B7280]">
                <Badge variant="outline">{editDraft.subjectLabel || "Section"}</Badge>
                {editDraft.questionCode && <Badge variant="secondary">{editDraft.questionCode}</Badge>}
                <Badge variant="outline">{qTypeLabel[editDraft.questionType]}</Badge>
              </div>

              <div>
                <Label className="text-xs">Question</Label>
                <Textarea
                  value={editDraft.question}
                  onChange={(e) => updateEditDraft({ question: e.target.value })}
                  rows={4}
                  className="mt-1 bg-white"
                  placeholder="Question text ya diagram-based prompt"
                />
              </div>

              <div className="flex flex-wrap gap-3">
                {editDraft.imageData ? (
                  <div className="relative rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <img src={editDraft.imageData} alt="" className="h-auto w-auto max-w-full rounded object-contain" />
                    <button
                      type="button"
                      onClick={() => updateEditDraft({ imageData: null })}
                      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ) : (
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:border-[#5B4DFF] hover:text-[#5B4DFF]">
                    <ImagePlus size={14} />
                    Add image
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleEditQuestionImage(e.target.files?.[0])} />
                  </label>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_150px]">
                <div>
                  <Label className="text-xs">Chapter Name</Label>
                  <Input
                    value={editDraft.chapterName}
                    onChange={(e) => updateEditDraft({ chapterName: e.target.value })}
                    className="mt-1 bg-white"
                    placeholder="e.g. Semiconductor Basics"
                  />
                </div>
                <div>
                  <Label className="text-xs">Topic Name</Label>
                  <Input
                    value={editDraft.topicTag}
                    onChange={(e) => updateEditDraft({ topicTag: e.target.value })}
                    className="mt-1 bg-white"
                    placeholder="e.g. Kirchhoff laws"
                  />
                </div>
                <div>
                  <Label className="text-xs">Difficulty</Label>
                  <div className="mt-1 flex items-center gap-2">
                    {(["easy", "moderate", "tough"] as const).map((level) => {
                      const active = editDraft.difficulty === level;
                      return (
                        <button
                          key={level}
                          type="button"
                          onClick={() => handleEditDifficultyChange(level)}
                          className={`flex h-7 w-7 items-center justify-center rounded-md border transition ${active ? difficultyTone[level] : `border-slate-300 bg-white text-transparent ${difficultyHoverTone[level]}`}`}
                          title={level}
                        >
                          <CheckCircle2 size={13} className={active ? "text-white" : "text-transparent"} />
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Ideal Time (minutes)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.1"
                    value={editDraft.idealTimeMinutes}
                    onChange={(e) => updateEditDraft({ idealTimeMinutes: e.target.value })}
                    className="mt-1 bg-white"
                  />
                </div>
              </div>

              {(editDraft.questionType === "mcq" || editDraft.questionType === "multi") && (
                <div className="space-y-2">
                  <Label className="text-xs">Options</Label>
                  {editDraft.options.map((option, optionIndex) => {
                    const isSelected =
                      editDraft.questionType === "mcq"
                        ? editDraft.correctAnswer === optionIndex
                        : editDraft.correctAnswerMulti.includes(optionIndex);
                    return (
                      <div key={optionIndex} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (editDraft.questionType === "mcq") {
                              updateEditDraft({ correctAnswer: optionIndex });
                            } else {
                              toggleEditMultiOption(optionIndex);
                            }
                          }}
                          className={`flex h-6 w-6 shrink-0 items-center justify-center ${editDraft.questionType === "mcq" ? "rounded-full border-2" : "rounded border-2"} ${isSelected ? "border-indigo-500 bg-indigo-500" : "border-slate-300 bg-white"}`}
                        >
                          {isSelected && (editDraft.questionType === "mcq" ? <div className="h-2 w-2 rounded-full bg-white" /> : <CheckCircle2 size={12} className="text-white" />)}
                        </button>
                        <span className="w-5 text-xs font-semibold">{String.fromCharCode(65 + optionIndex)}.</span>
                        <Input
                          value={option}
                          onChange={(e) => updateEditDraft({
                            options: editDraft.options.map((existingOption, existingIndex) => existingIndex === optionIndex ? e.target.value : existingOption),
                          })}
                          className="bg-white"
                          placeholder={`Option ${String.fromCharCode(65 + optionIndex)}`}
                        />
                        {editDraft.optionImages[optionIndex] ? (
                          <div className="relative">
                            <img src={editDraft.optionImages[optionIndex] ?? ""} alt="" className="h-auto w-auto max-w-full rounded border border-slate-200 object-contain" />
                            <button
                              type="button"
                              onClick={() => updateEditDraft({
                                optionImages: editDraft.optionImages.map((image, imageIndex) => imageIndex === optionIndex ? null : image),
                              })}
                              className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-white"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ) : (
                          <label className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded border border-dashed border-slate-300 text-slate-400 hover:border-indigo-400 hover:text-indigo-600">
                            <ImagePlus size={13} />
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => handleEditOptionImage(optionIndex, e.target.files?.[0])}
                            />
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {editDraft.questionType === "integer" && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => updateEditDraft({ integerMode: "exact" })}
                      className={`flex-1 rounded-lg border-2 px-3 py-2 text-xs font-medium ${editDraft.integerMode === "exact" ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white"}`}
                    >
                      Exact Answer
                    </button>
                    <button
                      type="button"
                      onClick={() => updateEditDraft({ integerMode: "range" })}
                      className={`flex-1 rounded-lg border-2 px-3 py-2 text-xs font-medium ${editDraft.integerMode === "range" ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white"}`}
                    >
                      Answer Range
                    </button>
                  </div>
                  {editDraft.integerMode === "exact" ? (
                    <div>
                      <Label className="text-xs">Correct Answer</Label>
                      <Input type="number" value={editDraft.correctInteger} onChange={(e) => updateEditDraft({ correctInteger: e.target.value })} className="mt-1 w-44 bg-white" />
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs">Minimum</Label>
                        <Input type="number" value={editDraft.correctIntegerMin} onChange={(e) => updateEditDraft({ correctIntegerMin: e.target.value })} className="mt-1 bg-white" />
                      </div>
                      <div>
                        <Label className="text-xs">Maximum</Label>
                        <Input type="number" value={editDraft.correctIntegerMax} onChange={(e) => updateEditDraft({ correctIntegerMax: e.target.value })} className="mt-1 bg-white" />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditingQuestion(null);
                    setEditDraft(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  disabled={!canSaveDraft(editDraft) || updateQuestionMutation.isPending}
                  onClick={() => updateQuestionMutation.mutate({
                    testId: editingQuestion.testId,
                    qid: editingQuestion.question.id,
                    body: buildQuestionPayload(editDraft, activeEditTest, editingQuestion.question.sectionId ?? 0),
                  })}
                >
                  {updateQuestionMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ─── Analytics Dialog ─── */}
      <Dialog open={analyticsTest !== null || analyticsLoading} onOpenChange={(o) => { if (!o) setAnalyticsTest(null); }}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0">
          {analyticsLoading && (
            <div className="p-8 text-center">
              <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Loading analytics...</p>
            </div>
          )}
          {analyticsTest && !analyticsLoading && (
            <>
              <div className="sticky top-0 z-10 bg-background border-b border-border px-6 py-4">
                <DialogHeader><DialogTitle className="flex items-center gap-2"><BarChart3 size={18} className="text-primary" />Analytics: {analyticsTest.test.title}</DialogTitle></DialogHeader>
              </div>

              <div className="p-6 space-y-6">
                {analyticsTest.total === 0 ? (
                  <div className="text-center py-12">
                    <Users size={40} className="mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">No submissions yet.</p>
                  </div>
                ) : (
                  <>
                    {/* ── Summary Cards ── */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                        <Users size={16} className="mx-auto text-blue-600 mb-1" />
                        <p className="text-2xl font-bold text-blue-700">{analyticsTest.total}</p>
                        <p className="text-xs text-blue-600">Submissions</p>
                      </div>
                      <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                        <Award size={16} className="mx-auto text-green-600 mb-1" />
                        <p className="text-2xl font-bold text-green-700">{analyticsTest.passCount}</p>
                        <p className="text-xs text-green-600">Passed ({Math.round(analyticsTest.passCount / analyticsTest.total * 100)}%)</p>
                      </div>
                      <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-center">
                        <TrendingUp size={16} className="mx-auto text-purple-600 mb-1" />
                        <p className="text-2xl font-bold text-purple-700">{analyticsTest.avgPercentage}%</p>
                        <p className="text-xs text-purple-600">Avg Score</p>
                      </div>
                      <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-center">
                        <Target size={16} className="mx-auto text-orange-600 mb-1" />
                        <p className="text-2xl font-bold text-orange-700">{analyticsTest.test.passingScore == null ? "No cutoff" : `${analyticsTest.test.passingScore}%`}</p>
                        <p className="text-xs text-orange-600">Passing Mark</p>
                      </div>
                    </div>

                    {/* ── Charts Row ── */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Score Distribution */}
                      <div className="bg-muted/30 rounded-xl p-4">
                        <p className="text-sm font-semibold mb-3 flex items-center gap-1.5"><BarChart3 size={14} className="text-primary" />Score Distribution</p>
                        <ResponsiveContainer width="100%" height={160}>
                          <BarChart data={analyticsTest.scoreDistribution} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="range" tick={{ fontSize: 10 }} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                            <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [v, "Students"]} />
                            <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Pass/Fail Pie */}
                      <div className="bg-muted/30 rounded-xl p-4">
                        <p className="text-sm font-semibold mb-3 flex items-center gap-1.5"><Award size={14} className="text-primary" />Pass vs Fail</p>
                        <ResponsiveContainer width="100%" height={160}>
                          <PieChart>
                            <Pie data={[{ name: "Passed", value: analyticsTest.passCount }, { name: "Failed", value: analyticsTest.failCount }]}
                              cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                              {[0, 1].map((i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                            </Pie>
                            <Tooltip contentStyle={{ fontSize: 12 }} />
                            <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* ── Per-Question Success Rate ── */}
                    <div className="bg-muted/30 rounded-xl p-4">
                      <p className="text-sm font-semibold mb-3 flex items-center gap-1.5"><ListChecks size={14} className="text-primary" />Per-Question Success Rate</p>
                      <ResponsiveContainer width="100%" height={Math.max(140, analyticsTest.perQuestion.length * 36)}>
                        <BarChart data={analyticsTest.perQuestion.map((q, i) => ({ name: `Q${i + 1}`, rate: q.successRate, correct: q.correctCount, total: analyticsTest.total }))}
                          layout="vertical" margin={{ top: 0, right: 40, left: 24, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={28} />
                          <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v, _, p) => [`${v}% (${p.payload.correct}/${p.payload.total})`, "Success Rate"]} />
                          <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                            {analyticsTest.perQuestion.map((q, i) => (
                              <Cell key={i} fill={q.successRate >= 70 ? "#22c55e" : q.successRate >= 40 ? "#f59e0b" : "#ef4444"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      <p className="text-xs text-muted-foreground mt-2">Green ≥70% · Orange 40–69% · Red &lt;40%</p>
                    </div>

                    {/* ── Per-Question Breakdown ── */}
                    <div>
                      <p className="text-sm font-semibold mb-3">Question-by-Question Breakdown</p>
                      <div className="space-y-3">
                        {analyticsTest.perQuestion.map((q, idx) => (
                          <div key={q.id} className="border border-border rounded-xl overflow-hidden">
                            <div className={`px-3 py-2 flex items-start gap-2 ${q.successRate >= 70 ? "bg-green-50" : q.successRate < 40 ? "bg-red-50" : "bg-amber-50"}`}>
                              <span className="text-xs font-bold text-muted-foreground shrink-0 mt-0.5">Q{idx + 1}</span>
                              <p className="text-xs font-medium flex-1 leading-relaxed">{q.question}</p>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium ${q.questionType === "multi" ? "bg-purple-100 text-purple-700" : q.questionType === "integer" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>
                                  {qTypeIcon[q.questionType]}{q.questionType.toUpperCase()}
                                </span>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${q.successRate >= 70 ? "bg-green-100 text-green-700" : q.successRate < 40 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                                  {q.successRate}% correct
                                </span>
                              </div>
                            </div>
                            {q.imageData && (
                              <div className="px-3 pt-2">
                                <img src={q.imageData} alt="Q" className="max-h-32 rounded border border-border object-contain" />
                              </div>
                            )}
                            <div className="p-3 bg-background">
                              {q.questionType === "integer" ? (
                                <div className="flex items-center gap-3 text-xs flex-wrap">
                                  <span className="text-muted-foreground">Correct answer:</span>
                                  {(q.correctAnswerMin !== null && q.correctAnswerMax !== null) ? (
                                    <span className="font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{q.correctAnswerMin} — {q.correctAnswerMax}</span>
                                  ) : (
                                    <span className="font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded">{q.correctAnswer}</span>
                                  )}
                                  <span className="text-muted-foreground">{q.correctCount}/{analyticsTest.total} got it right</span>
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  {q.options.map((opt, i) => {
                                    const isCorrect = q.questionType === "multi" ? (q.correctAnswerMulti ?? []).includes(i) : i === q.correctAnswer;
                                    const pickCount = q.optionCounts[i] ?? 0;
                                    const pct = analyticsTest.total > 0 ? Math.round((pickCount / analyticsTest.total) * 100) : 0;
                                    const optImg = q.optionImages?.[i];
                                    return (
                                      <div key={i} className="flex items-center gap-2">
                                        <span className={`text-xs font-semibold w-5 shrink-0 ${isCorrect ? "text-green-700" : "text-muted-foreground"}`}>{String.fromCharCode(65 + i)}.</span>
                                        <div className={`flex-1 flex items-center gap-1.5 ${isCorrect ? "text-green-700 font-medium" : "text-muted-foreground"}`}>
                                          <span className="text-xs">{opt}</span>
                                          {optImg && <img src={optImg} alt="" className="h-6 w-6 rounded object-cover border border-border/50 shrink-0" />}
                                        </div>
                                        {isCorrect && <CheckCircle2 size={12} className="text-green-600 shrink-0" />}
                                        <div className="w-20 h-4 bg-muted rounded-full overflow-hidden shrink-0">
                                          <div className={`h-full rounded-full ${isCorrect ? "bg-green-500" : "bg-gray-400"}`} style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="text-xs text-muted-foreground w-16 text-right shrink-0">{pct}% ({pickCount})</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* ── Student Leaderboard ── */}
                    <div>
                      <p className="text-sm font-semibold mb-3 flex items-center gap-1.5"><Users size={14} className="text-primary" />Student Results</p>
                      <div className="border border-border rounded-xl overflow-hidden">
                        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-2 bg-muted/50 text-xs text-muted-foreground font-medium">
                          <span>Student</span><span>Score</span><span>%</span><span>Result</span>
                        </div>
                        {[...analyticsTest.submissions].sort((a, b) => b.percentage - a.percentage).map((s) => (
                          <div key={s.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-2.5 border-t border-border items-center hover:bg-muted/20">
                            <div>
                              <p className="text-sm font-medium">{s.studentName}</p>
                              <p className="text-xs text-muted-foreground">@{s.studentUsername}</p>
                            </div>
                            <span className="text-sm font-semibold">{s.score}/{s.totalPoints}</span>
                            <span className={`text-sm font-bold ${analyticsTest.test.passingScore == null || s.percentage >= analyticsTest.test.passingScore ? "text-green-600" : "text-red-600"}`}>{s.percentage}%</span>
                            <div>
                              {s.passed
                                ? <span className="flex items-center gap-1 text-xs text-green-600 font-medium"><CheckCircle2 size={12} />Pass</span>
                                : <span className="flex items-center gap-1 text-xs text-red-600 font-medium"><XCircle size={12} />Fail</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5 text-right">Sorted by score (highest first)</p>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
