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
import {
  ClipboardList, Plus, Trash2, CheckCircle2, XCircle, ChevronDown, ChevronRight,
  ToggleLeft, ToggleRight, Clock, BarChart3, ImagePlus, X, Hash, ListChecks, CheckSquare,
  TrendingUp, Users, Award, Target
} from "lucide-react";
import { format } from "date-fns";
import { useListClasses } from "@workspace/api-client-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, RadialBarChart, RadialBar
} from "recharts";
import { DashboardScene, HoloGrid, TiltCard } from "@/components/dashboard-3d";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type QuestionType = "mcq" | "multi" | "integer";
type ExamType = "custom" | "jee" | "gate" | "iit-jam" | "cuet" | "neet" | "cat";

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

interface Test {
  id: number; classId: number | null; title: string; description: string | null;
  examType?: ExamType | string | null;
  examHeader?: string | null; examSubheader?: string | null;
  instructions?: string | null;
  examConfig?: Record<string, unknown> | null;
  defaultPositiveMarks?: number | null;
  defaultNegativeMarks?: number | null;
  chapterId: number | null; durationMinutes: number; passingScore: number; isPublished: boolean;
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
  passingScore: number;
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
  test: { id: number; title: string; passingScore: number };
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

interface ChapterOptionItem {
  id: number;
  title: string;
  description: string | null;
  lectures: { id: number }[];
}

interface SubjectStructureItem {
  id: number;
  title: string;
  description: string | null;
  chapters: ChapterOptionItem[];
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

export default function AdminTests() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { data: classes = [] } = useListClasses();

  const [createOpen, setCreateOpen] = useState(false);
  const [newExamType, setNewExamType] = useState<ExamType>("custom");
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newExamHeader, setNewExamHeader] = useState("");
  const [newExamSubheader, setNewExamSubheader] = useState("");
  const [newInstructions, setNewInstructions] = useState("");
  const [newClassId, setNewClassId] = useState<string>("");
  const [newChapterId, setNewChapterId] = useState<string>("");
  const [newDuration, setNewDuration] = useState("30");
  const [newPassing, setNewPassing] = useState("60");
  const [newDefaultPositiveMarks, setNewDefaultPositiveMarks] = useState("1");
  const [newDefaultNegativeMarks, setNewDefaultNegativeMarks] = useState("0");
  const [newScheduled, setNewScheduled] = useState("");
  const [sectionDrafts, setSectionDrafts] = useState<SectionDraft[]>([makeSectionDraft()]);

  const [expandedTest, setExpandedTest] = useState<number | null>(null);
  const [questionsMap, setQuestionsMap] = useState<Record<number, Question[]>>({});
  const [sectionsMap, setSectionsMap] = useState<Record<number, TestSection[]>>({});
  const [analyticsTest, setAnalyticsTest] = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const [addQOpen, setAddQOpen] = useState<number | null>(null);
  const [qSectionId, setQSectionId] = useState<string>("");
  const [qSubjectLabel, setQSubjectLabel] = useState("");
  const [qCode, setQCode] = useState("");
  const [qSourceType, setQSourceType] = useState("manual");
  const [qDifficulty, setQDifficulty] = useState("medium");
  const [qTopicTag, setQTopicTag] = useState("");
  const [qEstimatedTime, setQEstimatedTime] = useState("90");
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

  const { data: classStructure = [] } = useQuery<SubjectStructureItem[]>({
    queryKey: ["test-chapters", newClassId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/classes/${newClassId}/subjects`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!newClassId,
  });

  const { data: examTemplates = FALLBACK_TEMPLATES } = useQuery<ExamTemplate[]>({
    queryKey: ["exam-templates"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/planner/exam-templates`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  useEffect(() => {
    setNewChapterId("");
  }, [newClassId]);

  const chapterOptions = classStructure.flatMap((subject) =>
    subject.chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      subjectTitle: subject.title,
      lectureCount: chapter.lectures.length,
    })),
  );

  const applyPreset = (preset: ExamType) => {
    setNewExamType(preset);
    if (preset === "custom") return;
    const template = examTemplates.find((item) => item.key === preset) ?? FALLBACK_TEMPLATES.find((item) => item.key === preset);
    if (!template) return;
    setNewExamHeader(template.examHeader ?? template.name);
    setNewExamSubheader(template.examSubheader ?? `${template.name} Mock Assessment`);
    setNewDuration(String(template.durationMinutes));
    setNewPassing(String(template.passingScore));
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
          classId: newClassId || null,
          chapterId: newChapterId || null,
          title: newTitle.trim(),
          description: newDesc.trim() || null,
          examType: newExamType,
          examHeader: newExamHeader.trim() || null,
          examSubheader: newExamSubheader.trim() || null,
          instructions: newInstructions.trim() || null,
          durationMinutes: parseInt(newDuration) || 30,
          passingScore: parseInt(newPassing) || 60,
          defaultPositiveMarks: parseFloat(newDefaultPositiveMarks) || 1,
          defaultNegativeMarks: parseFloat(newDefaultNegativeMarks) || 0,
          examConfig: {
            bulkSupported: true,
            sectionCount: sectionDrafts.filter((section) => section.title.trim()).length,
            sourceModes: ["manual", "bulk", "ai"],
          },
          scheduledAt: newScheduled || null,
              sections: sectionDrafts
            .filter((section) => section.title.trim())
            .map((section) => ({
              title: section.title.trim(),
              description: section.description.trim() || null,
              subjectLabel: section.subjectLabel.trim() || null,
              questionCount: section.questionCount.trim() ? parseInt(section.questionCount) : null,
              marksPerQuestion: section.marksPerQuestion.trim() ? parseFloat(section.marksPerQuestion) : null,
              negativeMarks: section.negativeMarks.trim() ? parseFloat(section.negativeMarks) : null,
              meta: { structureSource: newExamType, preferredQuestionType: section.preferredQuestionType },
            })),
        }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tests"] });
      setCreateOpen(false); setNewExamType("custom"); setNewTitle(""); setNewDesc(""); setNewExamHeader(""); setNewExamSubheader(""); setNewInstructions(""); setNewClassId(""); setNewChapterId(""); setNewDuration("30"); setNewPassing("60"); setNewDefaultPositiveMarks("1"); setNewDefaultNegativeMarks("0"); setNewScheduled(""); setSectionDrafts([makeSectionDraft()]);
      toast({ title: "Test created" });
    },
    onError: () => toast({ title: "Failed to create test", variant: "destructive" }),
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
    mutationFn: async (testId: number) => {
      const body: any = {
        question: qText.trim(),
        questionType: qType,
        sectionId: qSectionId ? parseInt(qSectionId) : null,
        questionCode: qCode.trim() || null,
        sourceType: qSourceType,
        subjectLabel: qSubjectLabel.trim() || null,
        points: parseInt(qPoints) || 1,
        negativeMarks: parseFloat(qNegativeMarks) || 0,
        imageData: qImageData || null,
        meta: {
          examType: tests.find((item) => item.id === testId)?.examType ?? "custom",
          chapterLinked: true,
          difficulty: qDifficulty,
          topicTag: qTopicTag.trim() || null,
          estimatedTimeSeconds: parseInt(qEstimatedTime) || 0,
        },
      };
      if (qType === "mcq") {
        body.options = qOptions;
        body.correctAnswer = qCorrect;
        const hasOptImg = qOptionImages.some((img) => img !== null);
        if (hasOptImg) body.optionImages = qOptionImages;
      } else if (qType === "multi") {
        body.options = qOptions;
        body.correctAnswerMulti = qCorrectMulti;
        const hasOptImg = qOptionImages.some((img) => img !== null);
        if (hasOptImg) body.optionImages = qOptionImages;
      } else if (qType === "integer") {
        body.options = [];
        if (qIntegerMode === "range") {
          body.correctAnswerMin = parseInt(qCorrectIntMin);
          body.correctAnswerMax = parseInt(qCorrectIntMax);
        } else {
          body.correctAnswer = parseInt(qCorrectInt) || 0;
        }
      }
      const r = await fetch(`${BASE}/api/tests/${testId}/questions`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: (data, testId) => {
      setQuestionsMap((prev) => ({ ...prev, [testId]: [...(prev[testId] ?? []), data] }));
      resetQuestionForm();
      toast({ title: "Question added" });
    },
    onError: () => toast({ title: "Failed to add question", variant: "destructive" }),
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: async ({ testId, qid }: { testId: number; qid: number }) => { await fetch(`${BASE}/api/tests/${testId}/questions/${qid}`, { method: "DELETE", credentials: "include" }); },
    onSuccess: (_, { testId, qid }) => { setQuestionsMap((prev) => ({ ...prev, [testId]: (prev[testId] ?? []).filter((q) => q.id !== qid) })); toast({ title: "Question removed" }); },
  });

  const resetQuestionForm = () => {
    setAddQOpen(null); setQType("mcq"); setQText(""); setQOptions(["", "", "", ""]);
    setQSectionId(""); setQSubjectLabel(""); setQCode(""); setQSourceType("manual"); setQCorrect(0); setQCorrectMulti([]); setQCorrectInt("");
    setQDifficulty("medium"); setQTopicTag(""); setQEstimatedTime("90");
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

  const toggleExpand = (testId: number) => {
    if (expandedTest === testId) { setExpandedTest(null); return; }
    setExpandedTest(testId);
    loadQuestions(testId);
  };

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

  return (
    <div className="space-y-6">
      <DashboardScene accent="from-fuchsia-500/20 via-indigo-500/10 to-cyan-500/20">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_360px]">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-400/20 bg-fuchsia-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-fuchsia-100/90">
              <ClipboardList size={12} />
              Assessment Core
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white flex items-center gap-2">
                <ClipboardList size={24} className="text-cyan-300" />
                Tests & Quizzes
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Build chapter-based assessments, mix question types, and inspect student performance through a high-visibility analytics layer.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <TiltCard className="rounded-2xl">
                <div className="rounded-2xl border border-cyan-400/20 bg-slate-950/40 p-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Total Tests</p>
                  <p className="mt-2 text-3xl font-semibold text-white">{totalTests}</p>
                </div>
              </TiltCard>
              <TiltCard className="rounded-2xl">
                <div className="rounded-2xl border border-emerald-400/20 bg-slate-950/40 p-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Published</p>
                  <p className="mt-2 text-3xl font-semibold text-emerald-300">{publishedTests}</p>
                </div>
              </TiltCard>
              <TiltCard className="rounded-2xl">
                <div className="rounded-2xl border border-amber-400/20 bg-slate-950/40 p-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Drafts</p>
                  <p className="mt-2 text-3xl font-semibold text-amber-300">{draftTests}</p>
                </div>
              </TiltCard>
              <TiltCard className="rounded-2xl">
                <div className="rounded-2xl border border-fuchsia-400/20 bg-slate-950/40 p-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Loaded Questions</p>
                  <p className="mt-2 text-3xl font-semibold text-fuchsia-300">{totalQuestions}</p>
                </div>
              </TiltCard>
            </div>
          </div>
          <TiltCard className="rounded-3xl">
            <HoloGrid title="Quick Launch" subtitle="Spin up a new test flow without leaving the dashboard rhythm.">
              <Button onClick={() => setCreateOpen(true)} className="w-full" data-testid="button-create-test">
                <Plus size={15} className="mr-2" />
                Create Test
              </Button>
            </HoloGrid>
          </TiltCard>
        </div>
      </DashboardScene>

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
              <TiltCard key={test.id} className="rounded-3xl">
                <Card className={test.isPublished ? "border-primary/20" : ""} data-testid={`test-card-${test.id}`}>
                  <CardContent className="p-0">
                  <div className="flex items-center gap-3 p-4">
                    <button className="flex-1 text-left flex items-center gap-3 min-w-0" onClick={() => toggleExpand(test.id)}>
                      {isOpen ? <ChevronDown size={16} className="text-muted-foreground shrink-0" /> : <ChevronRight size={16} className="text-muted-foreground shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{test.title}</span>
                          <Badge variant={test.isPublished ? "default" : "secondary"} className="text-xs">{test.isPublished ? "Published" : "Draft"}</Badge>
                          {test.className && <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{test.className}</span>}
                          {test.subjectName && <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{test.subjectName}</span>}
                          {test.chapterName && <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">{test.chapterName}</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1"><Clock size={11} />{test.durationMinutes} min</span>
                          <span>Pass: {test.passingScore}%</span>
                          {test.scheduledAt && <span>{format(new Date(test.scheduledAt), "MMM d, yyyy")}</span>}
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" className="h-8 px-2 text-xs gap-1.5" onClick={() => openAnalytics(test)} data-testid={`button-view-results-${test.id}`}>
                        <BarChart3 size={13} />Analytics
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 px-2 text-xs gap-1.5 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                        onClick={() => setLocation(`/admin/tests/${test.id}/analytics`)} data-testid={`button-advanced-analytics-${test.id}`}>
                        <TrendingUp size={13} />Advanced
                      </Button>
                      <Button size="sm" variant="ghost" className={`h-8 px-2 text-xs gap-1.5 ${test.isPublished ? "text-orange-600" : "text-green-600"}`}
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
                    <div className="border-t border-border bg-muted/20 p-4 space-y-3">
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-xl border border-border bg-background px-3 py-2 text-xs">
                          <p className="text-muted-foreground">Exam Link</p>
                          <p className="mt-1 font-semibold">{test.className ? "Class Attached" : "Missing Class"}</p>
                        </div>
                        <div className="rounded-xl border border-border bg-background px-3 py-2 text-xs">
                          <p className="text-muted-foreground">Chapter Scope</p>
                          <p className="mt-1 font-semibold">{test.chapterName ?? "Missing Chapter"}</p>
                        </div>
                        <div className="rounded-xl border border-border bg-background px-3 py-2 text-xs">
                          <p className="text-muted-foreground">Exam Mode</p>
                          <p className="mt-1 font-semibold">{String(test.examType ?? "custom").toUpperCase()} Builder</p>
                        </div>
                        <div className="rounded-xl border border-border bg-background px-3 py-2 text-xs">
                          <p className="text-muted-foreground">Paper Status</p>
                          <p className="mt-1 font-semibold">{test.isPublished ? "Live" : "Draft"}</p>
                        </div>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
                          Template: <strong>{String(test.examType ?? "custom").toUpperCase()}</strong>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                          Sections: <strong>{sections.length}</strong>
                        </div>
                        <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                          Default +ve: <strong>{Number(test.defaultPositiveMarks ?? 1).toFixed(2)}</strong>
                        </div>
                        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                          Default -ve: <strong>{Number(test.defaultNegativeMarks ?? 0).toFixed(2)}</strong>
                        </div>
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          Instructions: <strong>{test.instructions ? "Set" : "Pending"}</strong>
                        </div>
                      </div>
                      {sections.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Exam Structure</p>
                          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {sections.map((section, index) => (
                              <div key={section.id} className="rounded-xl border border-border bg-background px-3 py-3 text-xs">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="font-semibold text-sm">{index + 1}. {section.title}</p>
                                  <Badge variant="secondary">{section.subjectLabel ?? "General"}</Badge>
                                </div>
                                {section.description && <p className="mt-1 text-muted-foreground">{section.description}</p>}
                                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                                  <span>Qs: {section.questionCount ?? "—"}</span>
                                  <span>+ve: {section.marksPerQuestion ?? test.defaultPositiveMarks ?? 1}</span>
                                  <span>-ve: {section.negativeMarks ?? test.defaultNegativeMarks ?? 0}</span>
                                  <span>Type: {String((section.meta as Record<string, unknown> | null)?.preferredQuestionType ?? "mcq").toUpperCase()}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Questions ({qs.length})</p>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                          setAddQOpen((prev) => {
                            const next = prev === test.id ? null : test.id;
                            if (next === null) {
                              resetQuestionForm();
                              return null;
                            }
                            const selectedSection = getNextSectionForTest(test.id);
                            applySectionDefaults(selectedSection, test);
                            return test.id;
                          });
                        }} data-testid={`button-add-question-${test.id}`}>
                          <Plus size={12} className="mr-1" />{addQOpen === test.id ? "Hide Builder" : "Add Question"}
                        </Button>
                      </div>
                      {addQOpen === test.id && (
                        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.06)]">
                          <div className="mb-5">
                            <h3 className="text-2xl font-semibold text-slate-900">Add Question</h3>
                            <p className="mt-1 text-sm text-slate-500">Same page builder. Scroll down, add one question at a time, and keep reviewing the full paper below.</p>
                          </div>
                          <div className="space-y-6">
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                              <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-600">Auto Assigned Section</p>
                                <p className="mt-2 text-sm font-semibold text-slate-900">
                                  {(sectionsMap[test.id] ?? []).find((section) => String(section.id) === qSectionId)?.title ?? "No section configured"}
                                </p>
                                <p className="mt-1 text-xs text-slate-600">Planner blueprint ke hisaab se next open slot auto-pick hoga.</p>
                              </div>
                              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Auto Subject Label</p>
                                <p className="mt-2 text-sm font-semibold text-slate-900">{qSubjectLabel || "Auto from section"}</p>
                                <p className="mt-1 text-xs text-slate-500">Student analysis aur report breakdown isi label ko use karega.</p>
                              </div>
                              <div>
                                <Label className="text-xs">Source Mode</Label>
                                <Select value={qSourceType} onValueChange={setQSourceType}>
                                  <SelectTrigger className="mt-1 bg-white"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="manual">Manual</SelectItem>
                                    <SelectItem value="bulk">Bulk Import</SelectItem>
                                    <SelectItem value="ai">AI Extracted</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div><Label className="text-xs">Question Code</Label><Input value={qCode} onChange={(e) => setQCode(e.target.value)} className="mt-1 bg-white" placeholder="e.g. GA-01" /></div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                              <div>
                                <Label className="text-xs">Difficulty</Label>
                                <Select value={qDifficulty} onValueChange={setQDifficulty}>
                                  <SelectTrigger className="mt-1 bg-white"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="easy">Easy</SelectItem>
                                    <SelectItem value="medium">Medium</SelectItem>
                                    <SelectItem value="hard">Hard</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div><Label className="text-xs">Topic / Concept Tag</Label><Input value={qTopicTag} onChange={(e) => setQTopicTag(e.target.value)} className="mt-1 bg-white" placeholder="e.g. Rotational Motion" /></div>
                              <div><Label className="text-xs">Expected Solve Time (sec)</Label><Input type="number" min={0} value={qEstimatedTime} onChange={(e) => setQEstimatedTime(e.target.value)} className="mt-1 bg-white" /></div>
                              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600">Question Meta</p>
                                <p className="mt-2 text-xs text-emerald-800">Teacher sirf format aur metadata dega. Section structure planner ke pattern se aayega.</p>
                              </div>
                            </div>

                            <div>
                              <Label className="text-xs">Question Type</Label>
                              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                                {(["mcq", "multi", "integer"] as QuestionType[]).map((t) => (
                                  <button key={t} type="button" onClick={() => { setQType(t); setQCorrect(0); setQCorrectMulti([]); }}
                                    className={`flex flex-col items-center gap-1 rounded-2xl border px-4 py-4 text-xs font-medium transition-all ${qType === t ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                                    <span className="text-base">{t === "mcq" ? "🔵" : t === "multi" ? "☑️" : "🔢"}</span>
                                    {qTypeLabel[t]}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div>
                              <Label className="text-xs">Question</Label>
                              <Textarea value={qText} onChange={(e) => setQText(e.target.value)} rows={3} className="mt-1 resize-none bg-white" placeholder="Type your question here..." />
                            </div>

                            <div>
                              <Label className="text-xs">Question Image (optional)</Label>
                              <div className="mt-2">
                                {qImageData ? (
                                  <div className="relative inline-block">
                                    <img src={qImageData} alt="Preview" className="max-h-40 rounded-lg border border-border object-contain" />
                                    <button onClick={() => setQImageData(null)} className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white hover:bg-destructive/80"><X size={11} /></button>
                                  </div>
                                ) : (
                                  <button type="button" onClick={() => imgInputRef.current?.click()}
                                    className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary hover:bg-primary/5">
                                    <ImagePlus size={15} />Upload image
                                  </button>
                                )}
                              </div>
                              <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                              <input ref={optionImgInputRef} type="file" accept="image/*" className="hidden" onChange={handleOptionImageUpload} />
                            </div>

                            {(qType === "mcq" || qType === "multi") && (
                              <div className="space-y-2">
                                <Label className="text-xs">{qType === "mcq" ? "Options" : "Options (select all correct answers)"}</Label>
                                {qOptions.map((opt, i) => {
                                  const isSelected = qType === "mcq" ? qCorrect === i : qCorrectMulti.includes(i);
                                  return (
                                    <div key={i} className="space-y-1">
                                      <div className="flex items-center gap-2">
                                        <button type="button" onClick={() => qType === "mcq" ? setQCorrect(i) : toggleMultiOption(i)}
                                          className={`flex h-6 w-6 shrink-0 items-center justify-center transition-colors ${qType === "mcq" ? "rounded-full border-2" : "rounded border-2"} ${isSelected ? "border-primary bg-primary" : "border-border"}`}>
                                          {isSelected && (qType === "mcq" ? <div className="h-2 w-2 rounded-full bg-white" /> : <CheckCircle2 size={12} className="text-white" />)}
                                        </button>
                                        <span className="w-5 shrink-0 text-xs font-semibold">{String.fromCharCode(65 + i)}.</span>
                                        <Input value={opt} onChange={(e) => { const n = [...qOptions]; n[i] = e.target.value; setQOptions(n); }} placeholder={`Option ${String.fromCharCode(65 + i)}`} className="h-9 flex-1 bg-white" />
                                        {qOptionImages[i] ? (
                                          <div className="relative shrink-0">
                                            <img src={qOptionImages[i]!} alt="" className="h-8 w-8 rounded border border-border object-cover" />
                                            <button type="button" onClick={() => setQOptionImages((prev) => { const n = [...prev]; n[i] = null; return n; })}
                                              className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-white hover:bg-destructive/80">
                                              <X size={8} />
                                            </button>
                                          </div>
                                        ) : (
                                          <button type="button" onClick={() => { activeOptIdxRef.current = i; optionImgInputRef.current?.click(); }}
                                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                                            <ImagePlus size={13} />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {qType === "integer" && (
                              <div className="space-y-3">
                                <div>
                                  <Label className="mb-1 block text-xs">Answer Type</Label>
                                  <div className="flex gap-2">
                                    <button type="button" onClick={() => setQIntegerMode("exact")}
                                      className={`flex-1 rounded-lg border-2 px-3 py-2 text-xs font-medium transition-all ${qIntegerMode === "exact" ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/30"}`}>
                                      Exact Answer
                                    </button>
                                    <button type="button" onClick={() => setQIntegerMode("range")}
                                      className={`flex-1 rounded-lg border-2 px-3 py-2 text-xs font-medium transition-all ${qIntegerMode === "range" ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/30"}`}>
                                      Answer Range
                                    </button>
                                  </div>
                                </div>
                                {qIntegerMode === "exact" ? (
                                  <div>
                                    <Label className="text-xs">Correct Answer</Label>
                                    <Input type="number" value={qCorrectInt} onChange={(e) => setQCorrectInt(e.target.value)} placeholder="e.g. 42" className="mt-1 w-40 bg-white" />
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-3">
                                    <div>
                                      <Label className="text-xs">Minimum</Label>
                                      <Input type="number" value={qCorrectIntMin} onChange={(e) => setQCorrectIntMin(e.target.value)} className="mt-1 w-28 bg-white" />
                                    </div>
                                    <span className="mt-5 text-muted-foreground">—</span>
                                    <div>
                                      <Label className="text-xs">Maximum</Label>
                                      <Input type="number" value={qCorrectIntMax} onChange={(e) => setQCorrectIntMax(e.target.value)} className="mt-1 w-28 bg-white" />
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="grid w-full max-w-sm grid-cols-2 gap-3">
                              <div><Label className="text-xs">Points</Label><Input type="number" value={qPoints} onChange={(e) => setQPoints(e.target.value)} className="mt-1 bg-white" min={1} /></div>
                              <div><Label className="text-xs">Negative Marks</Label><Input type="number" step="0.01" min={0} value={qNegativeMarks} onChange={(e) => setQNegativeMarks(e.target.value)} className="mt-1 bg-white" /></div>
                            </div>

                            <div className="flex justify-end gap-2 pt-1">
                              <Button variant="ghost" onClick={resetQuestionForm}>Clear</Button>
                              <Button disabled={!canSaveQuestion() || addQuestionMutation.isPending} onClick={() => addQuestionMutation.mutate(test.id)}>
                                {addQuestionMutation.isPending ? "Adding..." : "Add Question"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                      {qs.length > 0 && (
                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                            MCQ: <strong>{qs.filter((q) => q.questionType === "mcq").length}</strong>
                          </div>
                          <div className="rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-xs text-purple-800">
                            Multi: <strong>{qs.filter((q) => q.questionType === "multi").length}</strong>
                          </div>
                          <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800">
                            Integer: <strong>{qs.filter((q) => q.questionType === "integer").length}</strong>
                          </div>
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                            Total Marks: <strong>{qs.reduce((sum, q) => sum + q.points, 0)}</strong>
                          </div>
                          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 sm:col-span-2 xl:col-span-4">
                            Total Negative Marks: <strong>{qs.reduce((sum, q) => sum + Number(q.negativeMarks ?? 0), 0).toFixed(2)}</strong>
                          </div>
                        </div>
                      )}
                      {qs.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No questions yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {qs.map((q, idx) => (
                            <div key={q.id} className="bg-background rounded-lg border border-border p-3" data-testid={`question-${q.id}`}>
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
                                    {q.points} pt{q.points !== 1 ? "s" : ""} · -ve {Number(q.negativeMarks ?? 0).toFixed(2)}
                                  </p>
                                </div>
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
              </TiltCard>
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
                  <div><Label className="text-xs">Instruction / Description</Label><Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={3} className="mt-1 resize-none" placeholder="Student-facing paper note or context..." /></div>
                  <div><Label className="text-xs">Instructions</Label><Textarea value={newInstructions} onChange={(e) => setNewInstructions(e.target.value)} rows={5} className="mt-1 resize-none" placeholder="General instructions, section notes, calculator rules, marking instructions..." /></div>
                </div>
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Exam Structure</p>
                  <div className="mt-3 grid gap-2">
                    <Select value={newExamType} onValueChange={(value) => applyPreset(value as ExamType)}>
                      <SelectTrigger><SelectValue placeholder="Select structure" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="custom">Custom</SelectItem>
                        <SelectItem value="jee">JEE</SelectItem>
                        <SelectItem value="gate">GATE</SelectItem>
                        <SelectItem value="iit-jam">IIT JAM</SelectItem>
                        <SelectItem value="cuet">CUET</SelectItem>
                        <SelectItem value="neet">NEET</SelectItem>
                        <SelectItem value="cat">CAT</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-indigo-700/80">Templates preload sections, counts, and default marking so teacher can bulk-structure different exam patterns quickly.</p>
                    <div className="rounded-xl border border-indigo-200 bg-white/80 px-3 py-2 text-xs text-indigo-900">
                      <p className="font-semibold">Exam Shell</p>
                      <p className="mt-1">{newExamHeader || "Planner-defined exam header will appear here."}</p>
                      <p className="text-indigo-700/80">{newExamSubheader || "Planner-defined exam subheader will appear here."}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 rounded-xl border border-indigo-200 bg-white/80 px-3 py-3 text-xs text-indigo-900">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-indigo-500">Duration</p>
                        <p className="mt-1 font-semibold">{newDuration || "—"} min</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-indigo-500">Passing</p>
                        <p className="mt-1 font-semibold">{newPassing || "—"}%</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-indigo-500">Default +ve</p>
                        <p className="mt-1 font-semibold">{newDefaultPositiveMarks || "—"}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-indigo-500">Default -ve</p>
                        <p className="mt-1 font-semibold">{newDefaultNegativeMarks || "—"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-xs">Class <span className="text-destructive">*</span></Label>
                <Select value={newClassId} onValueChange={setNewClassId}>
                  <SelectTrigger className={`mt-1 ${!newClassId ? "border-destructive/50" : ""}`}><SelectValue placeholder="Select a class (required)" /></SelectTrigger>
                  <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>)}</SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Students will only see tests assigned to their enrolled class.</p>
              </div>
              <div>
                <Label className="text-xs">Chapter <span className="text-destructive">*</span></Label>
                <Select value={newChapterId} onValueChange={setNewChapterId} disabled={!newClassId || chapterOptions.length === 0}>
                  <SelectTrigger className={`mt-1 ${!newChapterId ? "border-destructive/50" : ""}`}>
                    <SelectValue placeholder={newClassId ? "Select a chapter" : "Select class first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {chapterOptions.map((chapter) => (
                      <SelectItem key={chapter.id} value={String(chapter.id)}>
                        {chapter.subjectTitle} - {chapter.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Teacher tests are chapter-based. Students will get the fullscreen exam console for these tests.
                </p>
              </div>
              <div><Label className="text-xs">Scheduled Date (optional)</Label><Input type="datetime-local" value={newScheduled} onChange={(e) => setNewScheduled(e.target.value)} className="mt-1" /></div>
              <div className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Sections & Metadata</p>
                    <p className="text-xs text-muted-foreground">Define exam buckets like Physics/Chemistry/Math or Aptitude/Core with their own counts and scoring hints.</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => setSectionDrafts((prev) => [...prev, makeSectionDraft()])}>
                    <Plus size={13} className="mr-1" />Add Section
                  </Button>
                </div>
                <div className="space-y-3">
                  {sectionDrafts.map((section, index) => (
                    <div key={section.id} className="rounded-xl border border-border bg-background p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Section {index + 1}</p>
                        {sectionDrafts.length > 1 && (
                          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-destructive" onClick={() => setSectionDrafts((prev) => prev.filter((item) => item.id !== section.id))}>
                            <Trash2 size={12} />
                          </Button>
                        )}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div><Label className="text-xs">Title</Label><Input value={section.title} onChange={(e) => updateSectionDraft(section.id, { title: e.target.value })} className="mt-1 h-8" placeholder="e.g. Physics" /></div>
                        <div><Label className="text-xs">Subject Label</Label><Input value={section.subjectLabel} onChange={(e) => updateSectionDraft(section.id, { subjectLabel: e.target.value })} className="mt-1 h-8" placeholder="e.g. General Aptitude" /></div>
                        <div><Label className="text-xs">Target Question Count</Label><Input type="number" value={section.questionCount} onChange={(e) => updateSectionDraft(section.id, { questionCount: e.target.value })} className="mt-1 h-8" min={0} /></div>
                        <div><Label className="text-xs">Marks Per Question</Label><Input type="number" step="0.01" value={section.marksPerQuestion} onChange={(e) => updateSectionDraft(section.id, { marksPerQuestion: e.target.value })} className="mt-1 h-8" min={0} /></div>
                        <div><Label className="text-xs">Section -ve Marks</Label><Input type="number" step="0.01" value={section.negativeMarks} onChange={(e) => updateSectionDraft(section.id, { negativeMarks: e.target.value })} className="mt-1 h-8" min={0} /></div>
                        <div>
                          <Label className="text-xs">Preferred Question Type</Label>
                          <Select value={section.preferredQuestionType} onValueChange={(value) => updateSectionDraft(section.id, { preferredQuestionType: value as QuestionType })}>
                            <SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="mcq">MCQ</SelectItem>
                              <SelectItem value="multi">Multi-select</SelectItem>
                              <SelectItem value="integer">Integer</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="sm:col-span-2"><Label className="text-xs">Description</Label><Textarea value={section.description} onChange={(e) => updateSectionDraft(section.id, { description: e.target.value })} rows={2} className="mt-1 resize-none" placeholder="What this section covers..." /></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button disabled={!newTitle.trim() || !newClassId || !newChapterId || !sectionDrafts.some((section) => section.title.trim()) || createMutation.isPending} onClick={() => createMutation.mutate()} data-testid="button-confirm-create-test">
                {createMutation.isPending ? "Creating..." : "Create Test"}
              </Button>
            </div>
          </div>
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
                        <p className="text-2xl font-bold text-orange-700">{analyticsTest.test.passingScore}%</p>
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
                            <span className={`text-sm font-bold ${s.percentage >= analyticsTest.test.passingScore ? "text-green-600" : "text-red-600"}`}>{s.percentage}%</span>
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
