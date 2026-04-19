import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { looksLikeRichHtmlContent, sanitizeRichHtml, stripRichHtmlToText } from "@/lib/richContent";
import {
  ClipboardList, Plus, Trash2, CheckCircle2, ChevronDown,
  ToggleLeft, ToggleRight, Clock, Hash,
  Calculator, Flag,
  TrendingUp, PencilLine, Download, Upload, FileText, X
} from "lucide-react";
import { format } from "date-fns";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type QuestionType = "mcq" | "multi" | "integer";
type ExamType = string;
type QuestionBulkImportMode = "metadata" | "answers";
type TestCategory = "mock" | "subject-wise" | "multi-subject";

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
  chapterId: number | null; durationMinutes: number; passingScore: number | null; isPublished: boolean;
  scheduledAt: string | null; className: string | null; chapterName?: string | null; subjectName?: string | null;
}

interface PublishSyncQuestion {
  questionId: number;
  questionNo: string;
}

interface PublishSyncSummary {
  linkedCount: number;
  createdQuestionBankClassCount: number;
  createdSubjectCount: number;
  createdChapterCount: number;
  skippedNoSubjectCount: number;
  skippedNoQuestionBankClassCount: number;
  skippedInvalidQuestionCount: number;
  skippedDuplicateCount: number;
  duplicateQuestions?: PublishSyncQuestion[];
  warnings?: string[];
}

interface PublishResultDialogState {
  testId: number;
  testTitle: string;
  summary: PublishSyncSummary;
}

interface UnpublishCleanupSummary {
  detachedCount: number;
  removedQuestionCount: number;
  reviewBucketCleared: boolean;
  warnings?: string[];
}

interface Question {
  id: number; question: string; questionType: QuestionType; options: string[];
  sectionId?: number | null;
  questionCode?: string | null;
  sourceType?: string | null;
  subjectLabel?: string | null;
  difficulty?: string | null;
  idealTimeSeconds?: number | null;
  optionImages?: (string | null)[] | null;
  correctAnswer: number; correctAnswerMulti: number[] | null;
  correctAnswerMin?: number | null; correctAnswerMax?: number | null;
  points: number; negativeMarks?: number | null; order: number; imageData?: string | null; meta?: Record<string, unknown> | null;
  solutionText?: string | null;
  solutionImageData?: string | null;
  reports?: Array<{ status?: "open" | "resolved" | "rejected" | null }> | null;
  openReportCount?: number | null;
  totalReportCount?: number | null;
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
  instructions?: string | null;
  customInstructions?: string | null;
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

function normalizeExamConfigObject(value: unknown) {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function getCalculatorEnabledFromExamConfig(value: unknown) {
  return Boolean(normalizeExamConfigObject(value).calculatorEnabled);
}

function normalizeTestCategory(value: unknown): TestCategory | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "mock" || normalized === "mock-test") return "mock";
  if (normalized === "subject-wise" || normalized === "subject wise" || normalized === "subject") return "subject-wise";
  if (normalized === "multi-subject" || normalized === "multi subject" || normalized === "multi-subject-wise") return "multi-subject";
  return null;
}

function getTestCategoryLabel(value: TestCategory) {
  if (value === "subject-wise") return "Subject-wise Test";
  if (value === "multi-subject") return "Multi-subject Test";
  return "Mock Test";
}

function getTestCategoryTone(value: TestCategory) {
  if (value === "subject-wise") return "border-sky-200 bg-sky-50 text-sky-700";
  if (value === "multi-subject") return "border-violet-200 bg-violet-50 text-violet-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function getResolvedTestCategory(
  test: Pick<Test, "title" | "description" | "examHeader" | "examSubheader" | "subjectName" | "chapterName" | "examConfig">,
  sections: Array<Pick<TestSection, "title" | "subjectLabel">> = [],
): TestCategory {
  const stored = normalizeTestCategory(normalizeExamConfigObject(test.examConfig).testCategory);
  if (stored) return stored;

  const text = [
    test.title,
    test.description,
    test.examHeader,
    test.examSubheader,
  ].filter(Boolean).join(" ").toLowerCase();

  if (/multi[\s-]?subject|combined subject/.test(text)) return "multi-subject";
  if (/subject[\s-]?wise|chapter[\s-]?wise|chapter test/.test(text)) return "subject-wise";
  if (/mock|grand test|full test|full syllabus/.test(text)) return "mock";

  const sectionLabels = new Set(
    sections
      .map((section) => section.subjectLabel?.trim() || section.title?.trim() || "")
      .map((value) => value.toLowerCase().replace(/\s+/g, " ").trim())
      .filter((value) => value && !/^section\b/.test(value)),
  );

  if (test.chapterName?.trim() || test.subjectName?.trim()) return "subject-wise";
  if (sectionLabels.size > 1) return "multi-subject";
  return "mock";
}
interface ExportedTestBundle {
  version: number;
  exportedAt: string;
  source?: {
    testId: number;
    title: string;
    examType?: string | null;
  };
  test: {
    title: string;
    description?: string | null;
    examType?: string | null;
    examHeader?: string | null;
    examSubheader?: string | null;
    instructions?: string | null;
    examConfig?: Record<string, unknown> | null;
    durationMinutes?: number;
    passingScore?: number | null;
    defaultPositiveMarks?: number | null;
    defaultNegativeMarks?: number | null;
    scheduledAt?: string | null;
    sections: Array<Record<string, unknown>>;
    questions: Array<Record<string, unknown>>;
  };
}

interface PdfExportSectionPayload {
  id?: number | string | null;
  exportRef?: string | null;
  order?: number | null;
}

interface PdfExportQuestionPayload {
  question: string;
  imageData?: string | null;
  order?: number | null;
  sectionId?: number | string | null;
  sectionRef?: string | null;
}

interface PdfExportQuestionItem {
  question: string;
  imageData?: string | null;
}

function getPdfSectionKey(section: TestSection | PdfExportSectionPayload, fallbackIndex: number) {
  if (section.id !== undefined && section.id !== null) return String(section.id);
  if ("exportRef" in section && section.exportRef) return String(section.exportRef);
  return `section-${fallbackIndex}`;
}

function getPdfQuestionSectionKey(question: Question | PdfExportQuestionPayload) {
  if (question.sectionId !== undefined && question.sectionId !== null) return String(question.sectionId);
  if ("sectionRef" in question && question.sectionRef) return String(question.sectionRef);
  return "__unsectioned__";
}
async function fetchBuilderTestDetail(testId: number) {
  const response = await fetch(`${BASE}/api/tests/${testId}`, { credentials: "include" });
  if (!response.ok) throw new Error("Failed to load test");
  return response.json();
}

async function fetchExamTemplatesList() {
  const response = await fetch(`${BASE}/api/planner/exam-templates`, { credentials: "include" });
  if (!response.ok) throw new Error("Failed to load exam templates");
  return response.json();
}

function formatDateTimeLocalValue(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function formatApiErrorMessage(rawMessage: string, fallbackMessage: string) {
  const trimmed = rawMessage.trim();
  if (!trimmed) return fallbackMessage;

  try {
    const parsed = JSON.parse(trimmed) as { error?: unknown; message?: unknown };
    if (typeof parsed.error === "string" && parsed.error.trim()) return parsed.error.trim();
    if (typeof parsed.message === "string" && parsed.message.trim()) return parsed.message.trim();
  } catch {
    // Non-JSON error bodies are handled below.
  }

  let normalized = trimmed;
  if (/<[a-z][\s\S]*>/i.test(trimmed)) {
    if (typeof DOMParser !== "undefined") {
      const parsed = new DOMParser().parseFromString(trimmed, "text/html");
      normalized = parsed.body?.textContent?.replace(/\s+/g, " ").trim() || trimmed;
    } else {
      normalized = trimmed.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
  }

  if (/Cannot POST\s+\/api\/tests\/\d+\/import-question-metadata/i.test(normalized)) {
    return "The metadata import route is currently unavailable. Restart the backend server and try again.";
  }

  return normalized || fallbackMessage;
}

function normalizeExamTypeSelection(value: unknown, templates: ExamTemplate[]) {
  if (typeof value !== "string" || !value.trim()) return "";
  const normalized = value.trim().toLowerCase();
  const matched = templates.find((template) => {
    const candidates = [
      template.key,
      template.name,
      template.examHeader ?? "",
      template.examSubheader ?? "",
    ];
    return candidates.some((candidate) => candidate.trim().toLowerCase() === normalized);
  });
  return matched?.key ?? "";
}

function getOpenReportCount(question: Pick<Question, "openReportCount" | "reports">) {
  if (typeof question.openReportCount === "number" && Number.isFinite(question.openReportCount)) {
    return Math.max(0, question.openReportCount);
  }
  return (question.reports ?? []).filter((report) => report?.status === "open").length;
}

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image blob."));
    reader.readAsDataURL(blob);
  });
}

async function resolveImageDataUrl(source: string) {
  if (!source) return "";
  if (source.startsWith("data:image/")) return source;
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Failed to load image (${response.status}).`);
  }
  return readBlobAsDataUrl(await response.blob());
}

function getImageFormat(imageDataUrl: string) {
  if (/^data:image\/png/i.test(imageDataUrl)) return "PNG";
  if (/^data:image\/webp/i.test(imageDataUrl)) return "WEBP";
  return "JPEG";
}

function extractQuestionImageSources(question: string, imageData?: string | null) {
  const sources = new Set<string>();
  if (imageData) sources.add(imageData);
  if (typeof DOMParser !== "undefined" && /<img[\s>]/i.test(question)) {
    const parsed = new DOMParser().parseFromString(question, "text/html");
    parsed.querySelectorAll("img").forEach((image) => {
      const src = image.getAttribute("src")?.trim();
      if (src) {
        sources.add(src);
      }
    });
  }
  return Array.from(sources);
}

async function exportQuestionsPdf({
  title,
  filename,
  questions,
}: {
  title: string;
  filename: string;
  questions: PdfExportQuestionItem[];
}) {
  if (questions.length === 0) {
    throw new Error("No questions are available for PDF export.");
  }

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 48;
  const topMargin = 56;
  const bottomMargin = 42;
  const contentWidth = pageWidth - marginX * 2;
  const imageIndent = 22;
  const bodyWidth = contentWidth - imageIndent;
  const maxRenderableImageHeight = pageHeight - topMargin - bottomMargin - 24;
  const maxDisplayImageWidth = Math.min(bodyWidth, 340);
  const maxDisplayImageHeight = Math.min(maxRenderableImageHeight, 220);
  let y = topMargin;
  let skippedImageCount = 0;

  const addPage = () => {
    doc.addPage();
    y = topMargin;
  };

  const ensureSpace = (heightNeeded: number) => {
    if (y + heightNeeded > pageHeight - bottomMargin) {
      addPage();
    }
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text(title, marginX, y);
  y += 28;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text("Questions only export", marginX, y);
  y += 20;

  for (const [index, item] of questions.entries()) {
    const questionLabel = `${index + 1}.`;
    const questionText = stripRichHtmlToText(item.question) || "Untitled question";
    const questionLines = doc.splitTextToSize(questionText, bodyWidth);
    ensureSpace(Math.max(30, questionLines.length * 16 + 14));

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(questionLabel, marginX, y);

    doc.setFont("helvetica", "normal");
    doc.text(questionLines, marginX + imageIndent, y);
    y += questionLines.length * 16 + 10;

    for (const imageSource of extractQuestionImageSources(item.question, item.imageData)) {
      try {
        const imageDataUrl = await resolveImageDataUrl(imageSource);
        if (!imageDataUrl) continue;
        const imageProperties = doc.getImageProperties(imageDataUrl);
        const naturalImageWidth = Math.max(imageProperties.width || 0, 1);
        const naturalImageHeight = Math.max(imageProperties.height || 0, 1);
        const imageScale = Math.min(
          maxDisplayImageWidth / naturalImageWidth,
          maxDisplayImageHeight / naturalImageHeight,
          1,
        );
        const imageWidth = naturalImageWidth * imageScale;
        const imageHeight = naturalImageHeight * imageScale;

        ensureSpace(imageHeight + 12);
        doc.addImage(
          imageDataUrl,
          getImageFormat(imageDataUrl),
          marginX + imageIndent,
          y,
          imageWidth,
          imageHeight,
        );
        y += imageHeight + 12;
      } catch {
        skippedImageCount += 1;
      }
    }

    y += 10;
  }

  const totalPages = doc.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    doc.setPage(pageNumber);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text(`Page ${pageNumber} of ${totalPages}`, pageWidth / 2, pageHeight - 18, { align: "center" });
  }

  doc.save(filename);
  return { skippedImageCount };
}

function normalizeImportedText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractReadableText(element: Element | null, options?: { stripOptionPrefix?: boolean }) {
  if (!element || typeof document === "undefined") return "";
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("input, summary, script, style").forEach((node) => node.remove());
  clone.querySelectorAll("img").forEach((img) => {
    img.replaceWith(document.createTextNode(" "));
  });
  const rawText = normalizeImportedText(clone.textContent || "");
  return options?.stripOptionPrefix ? rawText.replace(/^[A-D]\.\s*/i, "").trim() : rawText;
}

function extractRichImportHtml(element: Element | null) {
  if (!element || typeof document === "undefined") return "";
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("input, summary, script, style").forEach((node) => node.remove());
  if (!clone.querySelector("img, sup, sub")) return "";
  const sanitized = sanitizeRichHtml(clone.innerHTML);
  return looksLikeRichHtmlContent(sanitized) ? sanitized : "";
}

function extractFirstImageSource(element: Element | null) {
  if (!element) return null;
  const images = Array.from(element.querySelectorAll("img"));
  for (const image of images) {
    const src = image.getAttribute("src")?.trim() || "";
    if (src) return src;
  }
  return null;
}

function normalizeImportedSectionTitle(value: string, options?: { gateImport?: boolean }) {
  const cleaned = normalizeImportedText(value) || "Imported Section";
  const normalized = cleaned.toLowerCase();
  if (normalized.includes("general aptitude")) return "General Aptitude";
  if (options?.gateImport) return "Technical";
  return cleaned;
}

function inferImportedDifficulty(tags: string[]): "easy" | "moderate" | "tough" {
  const combined = tags.join(" ").toLowerCase();
  if (combined.includes("expert") || combined.includes("advanced") || combined.includes("hard")) return "tough";
  if (combined.includes("easy")) return "easy";
  return "moderate";
}

function defaultIdealTimeSeconds(difficulty: "easy" | "moderate" | "tough") {
  if (difficulty === "easy") return 60;
  if (difficulty === "tough") return 180;
  return 90;
}

function toImportedQuestionType(value: string | null): QuestionType {
  const normalized = value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!normalized) return "mcq";
  if (normalized === "msq" || normalized.includes("multi") || normalized.includes("multiple")) return "multi";
  if (normalized === "nat" || normalized.includes("integer") || normalized.includes("numeric") || normalized.includes("numerical")) return "integer";
  return "mcq";
}

function answerLettersToIndices(value: string | null) {
  if (!value) return [];
  const trimmed = value.trim();
  const entries = /^[A-Za-z]+$/.test(trimmed)
    ? trimmed.split("")
    : trimmed.split(/[\s,;|/]+/);
  return entries
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean)
    .map((entry) => entry.charCodeAt(0) - 65)
    .filter((entry) => entry >= 0);
}

function parseImportedNumericValue(value: string | null | undefined) {
  if (!value || !value.trim()) return null;
  const parsed = Number(value.trim().replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function extractImportedIntegerRange(low: string | null, high: string | null, answerText: string | null) {
  const parsedLow = parseImportedNumericValue(low);
  const parsedHigh = parseImportedNumericValue(high);
  if (parsedLow !== null && parsedHigh !== null) {
    return {
      min: Math.min(parsedLow, parsedHigh),
      max: Math.max(parsedLow, parsedHigh),
    };
  }
  if (answerText) {
    const trimmed = answerText.trim();
    const directMatch = trimmed.match(/(-?\d+(?:\.\d+)?)\s*(?:-|—|–|to)\s*(-?\d+(?:\.\d+)?)/i);
    if (directMatch) {
      return {
        min: Math.min(Number(directMatch[1]), Number(directMatch[2])),
        max: Math.max(Number(directMatch[1]), Number(directMatch[2])),
      };
    }
    const betweenMatch = trimmed.match(/between\s+(-?\d+(?:\.\d+)?)\s+and\s+(-?\d+(?:\.\d+)?)/i);
    if (betweenMatch) {
      return {
        min: Math.min(Number(betweenMatch[1]), Number(betweenMatch[2])),
        max: Math.max(Number(betweenMatch[1]), Number(betweenMatch[2])),
      };
    }
  }
  return null;
}

async function parseSavedHtmlTestImport(file: File): Promise<ExportedTestBundle> {
  const html = await file.text();
  const documentParser = new DOMParser().parseFromString(html, "text/html");
  const cards = Array.from(documentParser.querySelectorAll("section.card.qcard"));
  if (!cards.length) throw new Error("No importable questions found in the HTML file.");

  const rawTitle =
    normalizeImportedText(documentParser.querySelector("title")?.textContent || "") ||
    file.name.replace(/\.(html?|json)$/i, "").trim() ||
    "Imported Test";
  const gateImport = /gate/i.test(rawTitle) || /gate/i.test(file.name);
  const durationSeconds = Number(documentParser.querySelector("#timerWrap")?.getAttribute("data-duration") || 0);
  const durationMinutes = durationSeconds > 0 ? Math.max(1, Math.round(durationSeconds / 60)) : 180;

  const sections = new Map<
    string,
    {
      exportRef: string;
      title: string;
      questionCount: number;
      marks: Set<number>;
      negatives: Set<number>;
      typeCounts: Record<QuestionType, number>;
      order: number;
    }
  >();

  const questions: ExportedTestBundle["test"]["questions"] = [];

  for (const [index, card] of cards.entries()) {
    const questionNumber = Number(card.getAttribute("data-qnum") || index + 1);
    const requestedQuestionType = toImportedQuestionType(card.getAttribute("data-qtype"));
    const tags = normalizeImportedText(card.querySelector(".tags")?.textContent || "")
      .split("•")
      .map((entry) => entry.trim())
      .filter(Boolean);
    const sectionTitle = normalizeImportedSectionTitle(tags[0] || "Imported Section", { gateImport });
    const sectionKey = sectionTitle.toLowerCase();
    if (!sections.has(sectionKey)) {
      sections.set(sectionKey, {
        exportRef: `section-${sections.size + 1}`,
        title: sectionTitle,
        questionCount: 0,
        marks: new Set<number>(),
        negatives: new Set<number>(),
        typeCounts: { mcq: 0, multi: 0, integer: 0 },
        order: sections.size,
      });
    }
    const section = sections.get(sectionKey)!;

    const qtext = card.querySelector(".qtext");
    const questionRichHtml = extractRichImportHtml(qtext);
    const questionText = questionRichHtml || extractReadableText(qtext) || `Imported question ${questionNumber}`;
    const questionImageData = !questionRichHtml ? extractFirstImageSource(qtext) : null;

    const optionNodes = Array.from(card.querySelectorAll(".opts label.opt"));
    const options = optionNodes.map((node) => extractReadableText(node.querySelector("div") ?? node, { stripOptionPrefix: true }));
    const optionImages = optionNodes.map((node) => extractFirstImageSource(node.querySelector("div") ?? node));

    const difficulty = inferImportedDifficulty(tags);
    const negativeMarks = Number(card.getAttribute("data-wrong") || 0) || 0;
    const points = Number(card.getAttribute("data-right") || 1) || 1;

    const solutionRoot = card.querySelector("details.solution");
    const solutionClone = solutionRoot?.cloneNode(true) as HTMLElement | null;
    solutionClone?.querySelector("summary")?.remove();
    const solutionRichHtml = extractRichImportHtml(solutionClone);
    const solutionText = solutionRichHtml || extractReadableText(solutionClone);
    const solutionImageData = !solutionRichHtml ? extractFirstImageSource(solutionClone) : null;

    const correctLetters = answerLettersToIndices(card.getAttribute("data-correct"));
    const answerLineText = normalizeImportedText(card.querySelector(".answerline b")?.textContent || "");
    const canInferIntegerRangeFromText = requestedQuestionType === "integer" || options.length === 0;
    const importedIntegerRange =
      extractImportedIntegerRange(
        card.getAttribute("data-nat-low"),
        card.getAttribute("data-nat-high"),
        answerLineText,
      ) ??
      (canInferIntegerRangeFromText
        ? extractImportedIntegerRange(
            null,
            null,
            solutionText,
          )
        : null);
    const questionType =
      requestedQuestionType === "multi" || correctLetters.length > 1
        ? "multi"
        : requestedQuestionType === "integer" || (options.length === 0 && Boolean(importedIntegerRange))
          ? "integer"
          : "mcq";
    const questionRecord: Record<string, unknown> = {
      question: questionText,
      questionType,
      sectionRef: section.exportRef,
      questionCode: `Q${String(questionNumber).padStart(2, "0")}`,
      sourceType: "html-import",
      subjectLabel: section.title,
      options: questionType === "integer" ? [] : options,
      optionImages: questionType === "integer" || optionImages.every((entry) => !entry) ? [] : optionImages,
      points,
      negativeMarks,
      meta: {
        difficulty,
        estimatedTimeSeconds: defaultIdealTimeSeconds(difficulty),
        importedTags: tags,
        importedQuestionNumber: questionNumber,
        importedSourceFile: file.name,
      },
      solutionText: solutionText || null,
      solutionImageData,
      order: index,
      imageData: questionImageData,
    };

    if (questionType === "mcq") {
      questionRecord.correctAnswer = correctLetters[0] ?? 0;
    } else if (questionType === "multi") {
      questionRecord.correctAnswerMulti = correctLetters;
    } else {
      if (importedIntegerRange) {
        questionRecord.correctAnswerMin = importedIntegerRange.min;
        questionRecord.correctAnswerMax = importedIntegerRange.max;
      } else {
        questionRecord.correctAnswer =
          parseImportedNumericValue(card.getAttribute("data-nat-low")) ??
          parseImportedNumericValue(answerLineText) ??
          0;
      }
    }

    questions.push(questionRecord);
    section.questionCount += 1;
    section.marks.add(points);
    section.negatives.add(negativeMarks);
    section.typeCounts[questionType] += 1;
  }

  const exportedSections = Array.from(sections.values())
    .sort((left, right) => left.order - right.order)
    .map((section) => {
      const preferredQuestionType = (Object.entries(section.typeCounts)
        .sort((left, right) => right[1] - left[1])[0]?.[0] ?? "mcq") as QuestionType;
      return {
        exportRef: section.exportRef,
        title: section.title,
        description: null,
        subjectLabel: section.title,
        questionCount: section.questionCount,
        marksPerQuestion: section.marks.size === 1 ? Array.from(section.marks)[0] : null,
        negativeMarks: section.negatives.size === 1 ? Array.from(section.negatives)[0] : null,
        meta: {
          preferredQuestionType,
          importedFromHtml: true,
        },
        order: section.order,
      };
    });

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: {
      testId: 0,
      title: rawTitle,
      examType: "custom",
    },
    test: {
      title: rawTitle,
      description: `Imported from saved HTML: ${file.name}`,
      examType: "custom",
      examHeader: rawTitle,
      examSubheader: "Imported",
      instructions: null,
      examConfig: {
        importedFromHtml: true,
        sourceFile: file.name,
      },
      durationMinutes,
      passingScore: null,
      defaultPositiveMarks: null,
      defaultNegativeMarks: null,
      scheduledAt: null,
      sections: exportedSections,
      questions,
    },
  };
}

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
      { title: "Domain Subjects", description: "Subject-specific MCQ section. Multiple subjects can be cloned later by super admin.", subjectLabel: "Domain Subjects", questionCount: "50", marksPerQuestion: "5", negativeMarks: "1", preferredQuestionType: "mcq" },
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
  instructions: getDefaultTemplateInstructions(preset.label, Number(preset.duration)),
  durationMinutes: Number(preset.duration),
  passingScore: Number(preset.passing),
  defaultPositiveMarks: Number(preset.positive),
  defaultNegativeMarks: Number(preset.negative),
  sections: preset.sections.map((section) => ({
    ...section,
    questionCount: Number(section.questionCount),
    marksPerQuestion: Number(section.marksPerQuestion),
    negativeMarks: Number(section.negativeMarks),
  })),
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
  const [createOpen, setCreateOpen] = useState(false);
  const [newExamType, setNewExamType] = useState<ExamType>("");
  const [newTitle, setNewTitle] = useState("");
  const [newExamHeader, setNewExamHeader] = useState("");
  const [newExamSubheader, setNewExamSubheader] = useState("");
  const [newCustomInstructions, setNewCustomInstructions] = useState("");
  const [newDuration, setNewDuration] = useState("30");
  const [newPassing, setNewPassing] = useState("60");
  const [newDefaultPositiveMarks, setNewDefaultPositiveMarks] = useState("1");
  const [newDefaultNegativeMarks, setNewDefaultNegativeMarks] = useState("0");
  const [newScheduled, setNewScheduled] = useState("");
  const [newTestCategory, setNewTestCategory] = useState<TestCategory>("mock");
  const [newCalculatorEnabled, setNewCalculatorEnabled] = useState(false);
  const [sectionDrafts, setSectionDrafts] = useState<SectionDraft[]>([makeSectionDraft()]);
  const [importOpen, setImportOpen] = useState(false);
  const [importBundle, setImportBundle] = useState<ExportedTestBundle | null>(null);
  const [importFilename, setImportFilename] = useState("");
  const [importExamType, setImportExamType] = useState("");
  const [importScheduled, setImportScheduled] = useState("");
  const [metadataImportOpen, setMetadataImportOpen] = useState(false);
  const [metadataImportMode, setMetadataImportMode] = useState<QuestionBulkImportMode>("metadata");
  const [metadataImportTestId, setMetadataImportTestId] = useState<number | null>(null);
  const [metadataImportFilename, setMetadataImportFilename] = useState("");
  const [metadataImportText, setMetadataImportText] = useState("");
  const [publishResultDialog, setPublishResultDialog] = useState<PublishResultDialogState | null>(null);

  const [questionsMap, setQuestionsMap] = useState<Record<number, Question[]>>({});
  const [sectionsMap, setSectionsMap] = useState<Record<number, TestSection[]>>({});
  const [exportingTestId, setExportingTestId] = useState<number | null>(null);
  const [exportingTestPdfId, setExportingTestPdfId] = useState<number | null>(null);
  const importTestInputRef = useRef<HTMLInputElement>(null);
  const metadataImportInputRef = useRef<HTMLInputElement>(null);

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
    queryFn: fetchExamTemplatesList,
    staleTime: 60_000,
  });

  const prefetchBuilderResources = (testId: number) => {
    void Promise.all([
      queryClient.prefetchQuery({
        queryKey: ["admin-test-builder", testId],
        queryFn: () => fetchBuilderTestDetail(testId),
        staleTime: 60_000,
      }),
      queryClient.prefetchQuery({
        queryKey: ["exam-templates"],
        queryFn: fetchExamTemplatesList,
        staleTime: 60_000,
      }),
    ]);
  };

  const openBuilder = (testId: number, questionId?: number | null) => {
    prefetchBuilderResources(testId);
    setLocation(questionId ? `/admin/tests/${testId}/builder?questionId=${questionId}` : `/admin/tests/${testId}/builder`);
  };

  const applyPreset = (preset: string) => {
    setNewExamType(preset);
    const template = examTemplates.find((item) => item.key === preset) ?? FALLBACK_TEMPLATES.find((item) => item.key === preset);
    if (!template) return;
    setNewExamHeader(template.examHeader ?? template.name);
    setNewExamSubheader(template.examSubheader ?? `${template.name} Mock Assessment`);
    setNewCustomInstructions(template.customInstructions?.trim() || "");
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

  const totalTests = tests.length;
  const publishedTests = tests.filter((test) => test.isPublished).length;
  const draftTests = totalTests - publishedTests;
  const totalQuestions = Object.values(questionsMap).reduce((sum, items) => sum + items.length, 0);
  const metadataImportTest = metadataImportTestId != null
    ? tests.find((test) => test.id === metadataImportTestId) ?? null
    : null;
  const metadataImportConfig = metadataImportMode === "answers"
    ? {
        title: "Import Correct Answers",
        intro: "This import only updates the correct answers for this test.",
        helper: "Questions are matched using `questionCode`/`Q01` or `questionNumber`.",
        loadedFileText: "Paste correct-answer JSON below for this test.",
        quickCards: [
          { label: "Match", value: "`questionCode`, `code`, `questionNumber`, `questionNo`" },
          { label: "MCQ", value: "`correctAnswer`" },
          { label: "Multi-select", value: "`correctAnswerMulti` ya `answers`" },
          { label: "Integer", value: "`correctAnswer`, `correctAnswerMin`, `correctAnswerMax`" },
        ],
        example: `[
  {
    "questionCode": "Q20",
    "correctAnswer": "B"
  },
  {
    "questionCode": "Q21",
    "correctAnswerMulti": ["A", "C"]
  },
  {
    "questionCode": "Q22",
    "correctAnswerMin": 35.05,
    "correctAnswerMax": 42.05
  }
]`,
        pasteTitle: "Paste Correct Answer JSON",
        pasteHelper: "Paste answers directly here. Matching questions in the existing test will be updated.",
        submitLabel: "Import Correct Answer",
        invalidFileTitle: "Invalid correct-answer file",
        invalidJsonTitle: "Invalid correct-answer JSON",
      }
    : {
        title: "Import Question Metadata",
        intro: "This import only updates existing questions in this test.",
        helper: "No new test will be created. Matching is based on `questionCode`/`Q01` or `questionNumber`.",
        loadedFileText: "Paste metadata JSON below for this test.",
        quickCards: [
          { label: "Match", value: "`questionCode`, `code`, `questionNumber`, `questionNo`" },
          { label: "Metadata", value: "`subject`, `chapter`, `topic`, `difficulty`, `idealTimeSeconds`" },
          { label: "Answers", value: "`correctAnswer`, `correctAnswerMulti`, `correctAnswerMin`, `correctAnswerMax`" },
          { label: "Shapes", value: "root array, `questions`, `items`, `test.questions`" },
        ],
        example: `[
  {
    "questionCode": "Q20",
    "subject": "Communication Systems",
    "chapter": "Digital Modulation",
    "topic": "PSK & QAM",
    "difficulty": "moderate",
    "idealTimeSeconds": 120
  }
]`,
        pasteTitle: "Paste Metadata JSON",
        pasteHelper: "Paste directly here. Each line or question will be applied to the selected test.",
        submitLabel: "Import Metadata",
        invalidFileTitle: "Invalid metadata file",
        invalidJsonTitle: "Invalid metadata JSON",
      };

  const resetImportDialog = () => {
    setImportOpen(false);
    setImportBundle(null);
    setImportFilename("");
    setImportExamType("");
    setImportScheduled("");
  };

  const resetMetadataImportDialog = () => {
    setMetadataImportOpen(false);
    setMetadataImportMode("metadata");
    setMetadataImportTestId(null);
    setMetadataImportFilename("");
    setMetadataImportText("");
  };

  const openMetadataImportDialog = (testId: number, mode: QuestionBulkImportMode) => {
    setMetadataImportMode(mode);
    setMetadataImportTestId(testId);
    setMetadataImportFilename("");
    setMetadataImportText("");
    setMetadataImportOpen(true);
  };

  const handleMetadataImportFile = async (testId: number, file?: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      if ((!Array.isArray(parsed) && (typeof parsed !== "object" || parsed === null))) {
        throw new Error("Please upload a JSON object or question metadata array.");
      }
      setMetadataImportTestId(testId);
      setMetadataImportFilename(file.name);
      setMetadataImportText(text);
      setMetadataImportOpen(true);
    } catch (error) {
      toast({
        title: metadataImportConfig.invalidFileTitle,
        description: error instanceof Error ? error.message : "Please upload a valid JSON file.",
        variant: "destructive",
      });
    }
  };

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
          instructions: newCustomInstructions.trim() || null,
          durationMinutes: parseInt(newDuration) || 30,
          passingScore: newPassing.trim() ? parseInt(newPassing) : null,
          defaultPositiveMarks: parseFloat(newDefaultPositiveMarks) || 1,
          defaultNegativeMarks: parseFloat(newDefaultNegativeMarks) || 0,
          examConfig: {
            bulkSupported: true,
            sectionCount: sectionDrafts.filter((section) => (section.subjectLabel.trim() || section.title.trim())).length,
            sourceModes: ["manual", "bulk", "ai"],
            testCategory: newTestCategory,
            calculatorEnabled: newCalculatorEnabled,
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
      setCreateOpen(false); setNewExamType(""); setNewTitle(""); setNewExamHeader(""); setNewExamSubheader(""); setNewCustomInstructions(""); setNewDuration("30"); setNewPassing(""); setNewDefaultPositiveMarks("1"); setNewDefaultNegativeMarks("0"); setNewScheduled(""); setNewTestCategory("mock"); setNewCalculatorEnabled(false); setSectionDrafts([makeSectionDraft()]);
      toast({ title: "Test created" });
    },
    onError: (error: Error) => toast({ title: "Failed to create test", description: error.message, variant: "destructive" }),
  });

  const importTestMutation = useMutation({
    mutationFn: async ({
      bundle,
      examType,
      scheduledAt,
    }: {
      bundle: ExportedTestBundle;
      examType: string;
      scheduledAt: string;
    }) => {
      const normalizedBundle: ExportedTestBundle = {
        ...bundle,
        test: {
          ...bundle.test,
          examType,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        },
      };
      const r = await fetch(`${BASE}/api/tests/import`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalizedBundle),
      });
      if (!r.ok) {
        const message = await r.text();
        throw new Error(message || "Failed to import test");
      }
      return r.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-tests"] });
      resetImportDialog();
      toast({
        title: "Test imported",
        description: data.pendingReviewCount > 0
          ? `${data.title} imported. ${data.pendingReviewCount} question${data.pendingReviewCount === 1 ? "" : "s"} still need manual setup in the builder.`
          : `${data.title} is ready as a draft with ${data.sectionCount} sections and ${data.questionCount} questions.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  const importMetadataMutation = useMutation({
    mutationFn: async ({ testId, payload, mode }: { testId: number; payload: unknown; mode: QuestionBulkImportMode }) => {
      const r = await fetch(`${BASE}/api/tests/${testId}/import-question-metadata`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const message = formatApiErrorMessage(
          await r.text(),
          `Failed to import ${mode === "answers" ? "correct answers" : "question metadata"}`,
        );
        throw new Error(message);
      }
      return r.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-tests"] });
      resetMetadataImportDialog();
      const skippedPreview = Array.isArray(data.skippedRows)
        ? data.skippedRows.filter((value: unknown) => typeof value === "string" && value.trim()).slice(0, 5)
        : [];
      const skippedSuffix = data.skippedCount > 0
        ? skippedPreview.length > 0
          ? ` (${skippedPreview.join(", ")}${data.skippedCount > skippedPreview.length ? ` + ${data.skippedCount - skippedPreview.length} more` : ""})`
          : ""
        : "";
      toast({
        title: variables.mode === "answers" ? "Correct answers imported" : "Metadata imported",
        description: `${data.updatedCount} questions updated${data.skippedCount > 0 ? `, ${data.skippedCount} rows skipped${skippedSuffix}` : ""}${data.unresolvedCount > 0 ? `, ${data.unresolvedCount} still need review` : ""}.`,
      });
    },
    onError: (error: Error, variables) => {
      toast({
        title: variables.mode === "answers" ? "Correct-answer import failed" : "Metadata import failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const togglePublish = useMutation({
    mutationFn: async ({ id, isPublished }: { id: number; isPublished: boolean }) => {
      const r = await fetch(`${BASE}/api/tests/${id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isPublished }) });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["admin-tests"] });
      const previousTests = queryClient.getQueryData<Test[]>(["admin-tests"]);
      queryClient.setQueryData<Test[]>(["admin-tests"], (current = []) =>
        current.map((test) => (
          test.id === variables.id
            ? { ...test, isPublished: variables.isPublished }
            : test
        )),
      );
      return { previousTests };
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-tests"] });
      queryClient.invalidateQueries({ queryKey: ["admin-question-bank-exams"] });
      queryClient.invalidateQueries({ queryKey: ["admin-question-bank"] });
      if (variables.isPublished) {
        const sync = data?.questionBankSync as PublishSyncSummary | null | undefined;
        if (sync) {
          setPublishResultDialog({
            testId: data?.id ?? variables.id,
            testTitle: data?.title ?? "Test",
            summary: sync,
          });
          return;
        }
      }
      if (!variables.isPublished) {
        const cleanup = data?.questionBankCleanup as UnpublishCleanupSummary | null | undefined;
        if (cleanup) {
          toast({
            title: "Test unpublished",
            description: cleanup.removedQuestionCount > 0
              ? `${cleanup.removedQuestionCount} question${cleanup.removedQuestionCount === 1 ? "" : "s"} removed from Question Bank. Review Bucket hidden for this test.`
              : "Question Bank sync removed and Review Bucket hidden for this test.",
          });
          return;
        }
      }
      toast({ title: variables.isPublished ? "Test published" : "Test unpublished" });
    },
    onError: (_error, _variables, context) => {
      if (context?.previousTests) {
        queryClient.setQueryData(["admin-tests"], context.previousTests);
      }
      toast({
        title: "Publish update failed",
        description: "Please try again.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tests"] });
      queryClient.invalidateQueries({ queryKey: ["admin-question-bank-exams"] });
      queryClient.invalidateQueries({ queryKey: ["admin-question-bank"] });
    },
  });

  const deleteTestMutation = useMutation({
    mutationFn: async (id: number) => { await fetch(`${BASE}/api/tests/${id}`, { method: "DELETE", credentials: "include" }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-tests"] }); toast({ title: "Test deleted" }); },
  });

  const slugifyFilename = (value: string) =>
    value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "test";

  const getResponseErrorMessage = async (response: Response, fallback: string) => {
    const raw = await response.text();
    if (!raw) return fallback;

    try {
      const parsed = JSON.parse(raw) as { error?: unknown; message?: unknown };
      if (typeof parsed?.error === "string" && parsed.error.trim()) return parsed.error.trim();
      if (typeof parsed?.message === "string" && parsed.message.trim()) return parsed.message.trim();
    } catch {
      // Ignore JSON parse failure and fall back to the raw text.
    }

    return raw.trim() || fallback;
  };

  const loadTestDetailForExport = async (testId: number) => {
    const exportResponse = await fetch(`${BASE}/api/tests/${testId}/export`, { credentials: "include" });
    if (exportResponse.ok) {
      const bundle = await exportResponse.json() as ExportedTestBundle;
      return {
        questions: Array.isArray(bundle.test?.questions) ? (bundle.test.questions as unknown as PdfExportQuestionPayload[]) : [],
        sections: Array.isArray(bundle.test?.sections) ? (bundle.test.sections as unknown as PdfExportSectionPayload[]) : [],
      };
    }

    const detailResponse = await fetch(`${BASE}/api/tests/${testId}`, { credentials: "include" });
    if (!detailResponse.ok) {
      throw new Error(await getResponseErrorMessage(detailResponse, "Failed to load test questions"));
    }

    const detail = await detailResponse.json() as { questions?: Question[]; sections?: TestSection[] };
    return {
      questions: Array.isArray(detail.questions) ? detail.questions : [],
      sections: Array.isArray(detail.sections) ? detail.sections : [],
    };
  };

  const handleExportTest = async (test: Test) => {
    setExportingTestId(test.id);
    try {
      const response = await fetch(`${BASE}/api/tests/${test.id}/export`, { credentials: "include" });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to export test");
      }
      const bundle = await response.json();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${slugifyFilename(test.title)}-test-export.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      toast({ title: "Test exported", description: `${test.title} JSON bundle downloaded.` });
    } catch (error) {
      toast({
        title: "Export failed",
        description: error instanceof Error ? error.message : "The test bundle could not be downloaded.",
        variant: "destructive",
      });
    } finally {
      setExportingTestId(null);
    }
  };

  const handleExportTestPdf = async (test: Test) => {
    setExportingTestPdfId(test.id);
    try {
      const detail = await loadTestDetailForExport(test.id);
      const questions = Array.isArray(detail.questions) ? detail.questions : [];
      const sections = Array.isArray(detail.sections) ? detail.sections : [];

      if (questions.length === 0) {
        throw new Error("No questions are available for PDF export.");
      }

      const sectionOrder = new Map(
        sections.map((section, index) => {
          return [getPdfSectionKey(section, index), section.order ?? index] as const;
        }),
      );
      const orderedQuestions = [...questions].sort((left, right) => {
        const leftSectionKey = getPdfQuestionSectionKey(left);
        const rightSectionKey = getPdfQuestionSectionKey(right);
        const leftSectionOrder = sectionOrder.get(leftSectionKey) ?? Number.MAX_SAFE_INTEGER;
        const rightSectionOrder = sectionOrder.get(rightSectionKey) ?? Number.MAX_SAFE_INTEGER;
        if (leftSectionOrder !== rightSectionOrder) return leftSectionOrder - rightSectionOrder;
        const leftOrder = typeof left.order === "number" ? left.order : Number.MAX_SAFE_INTEGER;
        const rightOrder = typeof right.order === "number" ? right.order : Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder;
      });

      const { skippedImageCount } = await exportQuestionsPdf({
        title: test.title,
        filename: `${slugifyFilename(test.title)}-questions.pdf`,
        questions: orderedQuestions.map((question) => ({
          question: question.question,
          imageData: question.imageData ?? null,
        })),
      });

      toast({
        title: "PDF exported",
        description: skippedImageCount > 0
          ? `${test.title} PDF downloaded. ${skippedImageCount} image${skippedImageCount === 1 ? "" : "s"} could not be included.`
          : `${test.title} questions PDF downloaded.`,
      });
    } catch (error) {
      toast({
        title: "PDF export failed",
        description: error instanceof Error ? error.message : "The questions PDF could not be generated.",
        variant: "destructive",
      });
    } finally {
      setExportingTestPdfId(null);
    }
  };

  const handleImportTestFile = async (file?: File | null) => {
    if (!file) return;
    try {
      const extension = file.name.split(".").pop()?.toLowerCase();
      const parsed =
        extension === "html" || extension === "htm" || file.type.includes("html")
          ? await parseSavedHtmlTestImport(file)
          : (JSON.parse(await file.text()) as ExportedTestBundle);
      if (!parsed?.test || !parsed?.test?.title || !Array.isArray(parsed?.test?.sections) || !Array.isArray(parsed?.test?.questions)) {
        throw new Error("Invalid test export file");
      }
      setImportBundle(parsed);
      setImportFilename(file.name);
      setImportExamType(
        normalizeExamTypeSelection(
          parsed.test.examType ?? parsed.source?.examType ?? "",
          examTemplates,
        ),
      );
      setImportScheduled(formatDateTimeLocalValue(parsed.test.scheduledAt ?? null));
      setImportOpen(true);
    } catch (error) {
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "The selected file could not be parsed.",
        variant: "destructive",
      });
    }
  };

  const loadTestSummary = async (testId: number) => {
    if (questionsMap[testId] && sectionsMap[testId]) return;
    const r = await fetch(`${BASE}/api/tests/${testId}`, { credentials: "include" });
    if (!r.ok) return;
    const data = await r.json();
    setQuestionsMap((prev) => ({ ...prev, [testId]: data.questions ?? [] }));
    setSectionsMap((prev) => ({ ...prev, [testId]: data.sections ?? [] }));
  };

  useEffect(() => {
    tests.forEach((test) => {
      if (!questionsMap[test.id] || !sectionsMap[test.id]) {
        void loadTestSummary(test.id);
      }
    });
  }, [tests, questionsMap, sectionsMap]);

  useEffect(() => {
    if (!publishResultDialog) return;
    const timeout = window.setTimeout(() => {
      setPublishResultDialog(null);
    }, 5200);
    return () => window.clearTimeout(timeout);
  }, [publishResultDialog]);

  return (
    <div className="space-y-6 bg-[#fffaf2]" style={{ fontFamily: "\"Plus Jakarta Sans\", sans-serif" }}>
      <div className="rounded-[28px] border border-[#eadfcd] bg-white p-6 shadow-[0_20px_40px_rgba(15,23,42,0.04)]">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Tests Dashboard</h1>
              <p className="mt-1 text-sm text-slate-500">Build, manage, and publish your exam papers.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <Button
                type="button"
                variant="outline"
                className="h-9 gap-2 border-[#eadfcd] bg-white text-sm text-slate-700 hover:border-[#f4c98b] hover:bg-[#fff7ea]"
                disabled={importTestMutation.isPending}
                onClick={() => importTestInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                {importTestMutation.isPending ? "Importing..." : "Import Test"}
              </Button>
              <Button
                onClick={() => setCreateOpen(true)}
                className="h-9 gap-2 bg-[#f97316] text-sm font-semibold text-white hover:bg-[#ea580c]"
                data-testid="button-create-test"
              >
                <Plus className="h-4 w-4" />
                Create New Test
              </Button>
              <input
                ref={importTestInputRef}
                type="file"
                accept="application/json,.json,text/html,.html,.htm"
                className="hidden"
                onChange={(event) => {
                  handleImportTestFile(event.currentTarget.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
              <input
                ref={metadataImportInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                  const targetTestId = metadataImportTestId;
                  if (targetTestId != null) {
                    handleMetadataImportFile(targetTestId, event.currentTarget.files?.[0]);
                  }
                  event.currentTarget.value = "";
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="flex items-center gap-3 rounded-xl border border-[#eadfcd] bg-white p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <ClipboardList size={18} />
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-500">Total Tests</p>
                <p className="text-2xl font-extrabold leading-tight text-slate-800">{totalTests}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-[#eadfcd] bg-white p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-500">Published</p>
                <p className="text-2xl font-extrabold leading-tight text-emerald-600">{publishedTests}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-[#eadfcd] bg-white p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <FileText size={18} />
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-500">Drafts</p>
                <p className="text-2xl font-extrabold leading-tight text-amber-600">{draftTests}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-[#eadfcd] bg-white p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                <Hash size={18} />
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-500">Loaded Questions</p>
                <p className="text-2xl font-extrabold leading-tight text-orange-600">{totalQuestions}</p>
              </div>
            </div>
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
            const qs = questionsMap[test.id] ?? [];
            const sections = sectionsMap[test.id] ?? [];
            const isJsonExporting = exportingTestId === test.id;
            const isPdfExporting = exportingTestPdfId === test.id;
            const calculatorEnabled = getCalculatorEnabledFromExamConfig(test.examConfig);
            const testCategory = getResolvedTestCategory(test, sections);
            const reportedQuestions = qs.filter((question) => getOpenReportCount(question) > 0);
            const openReportedQuestionCount = reportedQuestions.length;
            const totalOpenReports = reportedQuestions.reduce((sum, question) => sum + getOpenReportCount(question), 0);
            const firstReportedQuestionId = reportedQuestions[0]?.id ?? null;
            const totalPlannedQuestions = sections.reduce((sum, section) => sum + Number(section.questionCount ?? 0), 0);
            const progress = totalPlannedQuestions > 0 ? Math.min(100, (qs.length / totalPlannedQuestions) * 100) : 0;
            return (
              <Card key={test.id} className="overflow-hidden rounded-xl border border-[#eadfcd] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]" data-testid={`test-card-${test.id}`}>
                <CardContent className="p-0">
                  <div className="h-0.5 bg-[#f4ecdf]">
                    <div
                      className="h-full transition-all duration-500"
                      style={{
                        width: `${progress}%`,
                        background: test.isPublished ? "hsl(142 72% 45%)" : "hsl(24 95% 53%)",
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-4 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="truncate text-base font-bold text-slate-900">{test.title}</span>
                        <span
                          aria-label={test.isPublished ? "Published" : "Draft"}
                          title={test.isPublished ? "Published" : "Draft"}
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${
                            test.isPublished
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-amber-200 bg-amber-50 text-amber-700"
                          }`}
                        >
                          {test.isPublished ? <CheckCircle2 size={12} /> : <FileText size={12} />}
                        </span>
                        {test.subjectName ? (
                          <span className="rounded-full border border-[#eadfcd] bg-[#fff9ef] px-2 py-0.5 text-[10px] font-medium text-slate-600">
                            {test.subjectName}
                          </span>
                        ) : null}
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getTestCategoryTone(testCategory)}`}>
                          {getTestCategoryLabel(testCategory)}
                        </span>
                        {calculatorEnabled ? (
                          <span
                            aria-label="Calculator enabled"
                            title="Calculator enabled"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"
                          >
                            <Calculator size={11} />
                          </span>
                        ) : null}
                        {openReportedQuestionCount > 0 ? (
                          <button
                            type="button"
                            onMouseEnter={() => prefetchBuilderResources(test.id)}
                            onFocus={() => prefetchBuilderResources(test.id)}
                            onClick={() => openBuilder(test.id, firstReportedQuestionId)}
                            className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
                            title={`${totalOpenReports} open student report${totalOpenReports === 1 ? "" : "s"}`}
                          >
                            <Flag size={11} />
                            {openReportedQuestionCount} reported
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><Clock size={11} />{test.durationMinutes} min</span>
                        {test.scheduledAt ? <span>{format(new Date(test.scheduledAt), "MMM d, yyyy")}</span> : null}
                      </div>
                      {sections.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {sections.map((section) => {
                            const sectionCount = qs.filter((question) => question.sectionId === section.id).length;
                            return (
                              <span
                                key={section.id}
                                className="rounded-full border border-[#eadfcd] bg-[#fff9ef] px-2 py-0.5 text-[10px] font-medium text-slate-600"
                              >
                                {section.title}: {sectionCount}/{section.questionCount ?? "—"}
                              </span>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <div className="flex items-center gap-2">
                        {openReportedQuestionCount > 0 ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5 border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800"
                            onMouseEnter={() => prefetchBuilderResources(test.id)}
                            onFocus={() => prefetchBuilderResources(test.id)}
                            onClick={() => openBuilder(test.id, firstReportedQuestionId)}
                          >
                            <Flag size={13} />
                            Review reports
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          className="chip-orange-solid h-8 gap-1.5 px-4 text-xs font-semibold"
                          onMouseEnter={() => prefetchBuilderResources(test.id)}
                          onFocus={() => prefetchBuilderResources(test.id)}
                          onClick={() => openBuilder(test.id)}
                        >
                          <PencilLine size={13} />
                          Edit test
                        </Button>
                      </div>
                      <div className="flex items-center gap-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2 text-xs gap-1.5 text-[#3B82F6] hover:bg-[#EFF6FF] hover:text-[#2563EB]"
                              disabled={isJsonExporting || isPdfExporting}
                            >
                              <Download size={13} />
                              {isJsonExporting ? "Exporting..." : isPdfExporting ? "PDF..." : "Export"}
                              <ChevronDown size={12} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44 border-[#E5E7EB]">
                            <DropdownMenuItem onClick={() => handleExportTest(test)}>
                              <Download size={13} />
                              Export JSON
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleExportTestPdf(test)}>
                              <FileText size={13} />
                              Export PDF
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-xs gap-1.5 text-[#5B4DFF] hover:bg-[#EEF2FF] hover:text-[#4C3FF0]"
                          onClick={() => setLocation(`/admin/tests/${test.id}/analytics`)}
                          data-testid={`button-advanced-analytics-${test.id}`}
                        >
                          <TrendingUp size={13} />
                          Advanced
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2 text-xs gap-1.5 text-[#7C3AED] hover:bg-[#F3E8FF] hover:text-[#6D28D9]"
                              disabled={importMetadataMutation.isPending && metadataImportTestId === test.id}
                            >
                              <Upload size={13} />
                              {importMetadataMutation.isPending && metadataImportTestId === test.id ? "Importing..." : "Import"}
                              <ChevronDown size={12} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52 border-[#E5E7EB]">
                            <DropdownMenuItem onClick={() => openMetadataImportDialog(test.id, "metadata")}>
                              <Upload size={13} />
                              Import Metadata
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openMetadataImportDialog(test.id, "answers")}>
                              <Upload size={13} />
                              Import Correct Answer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {publishResultDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-4 backdrop-blur-[2px]">
          <div className="relative w-full max-w-lg overflow-hidden rounded-[24px] border border-[#eadfcd] bg-[#fffaf2] shadow-[0_28px_80px_rgba(15,23,42,0.28)]">
            <button
              type="button"
              onClick={() => setPublishResultDialog(null)}
              className="absolute right-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white transition hover:bg-white/20"
              aria-label="Close publish summary"
            >
              <X size={16} />
            </button>

            <div className="bg-[linear-gradient(135deg,#17253d_0%,#243b63_55%,#2f4c7f_100%)] px-5 py-4 text-white">
              <div className="flex items-center gap-3 pr-10">
                <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/12 text-white backdrop-blur">
                  <CheckCircle2 size={18} />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-extrabold tracking-tight">Test published</h2>
                  <p className="mt-1 text-sm leading-5 text-white/80">
                    Question bank sync for <span className="font-semibold text-white">{publishResultDialog.testTitle}</span> is complete.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-700">Synced</p>
                  <p className="mt-2 text-2xl font-extrabold text-emerald-800">{publishResultDialog.summary.linkedCount}</p>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-700">Duplicates</p>
                  <p className="mt-2 text-2xl font-extrabold text-amber-800">{publishResultDialog.summary.skippedDuplicateCount}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Needs Tagging</p>
                  <p className="mt-2 text-2xl font-extrabold text-slate-900">{publishResultDialog.summary.skippedNoSubjectCount}</p>
                </div>
              </div>

              {publishResultDialog.summary.duplicateQuestions && publishResultDialog.summary.duplicateQuestions.length > 0 ? (
                <div className="rounded-2xl border border-[#eadfcd] bg-white px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Duplicate Questions</p>
                  <p className="mt-2 text-sm text-slate-700">
                    {publishResultDialog.summary.duplicateQuestions.slice(0, 10).map((item) => item.questionNo).join(", ")}
                    {publishResultDialog.summary.duplicateQuestions.length > 10
                      ? ` + ${publishResultDialog.summary.duplicateQuestions.length - 10} more`
                      : ""}
                  </p>
                </div>
              ) : null}

              {publishResultDialog.summary.createdQuestionBankClassCount > 0 ? (
                <div className="rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-900">
                  The question bank card for the same exam was missing, so the system created it automatically.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

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
                <div className="flex items-center gap-2">
                  <p className="font-semibold">Student Visibility</p>
                  <InfoTip content={`Visible to students who selected ${String(newExamType || "exam").toUpperCase()} during registration or in profile settings.`} />
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <Label className="text-sm font-medium text-slate-900">Test category</Label>
                <p className="mt-1 text-xs text-slate-500">Students will see a badge with this label.</p>
                <div className="mt-3">
                  <Select value={newTestCategory} onValueChange={(value) => setNewTestCategory(value as TestCategory)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mock">Mock Test</SelectItem>
                      <SelectItem value="subject-wise">Subject-wise Test</SelectItem>
                      <SelectItem value="multi-subject">Multi-subject Test</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">Student calculator</p>
                  <p className="text-xs text-slate-500">Turn on the exam calculator only for tests that need it.</p>
                </div>
                <Switch checked={newCalculatorEnabled} onCheckedChange={setNewCalculatorEnabled} />
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
        open={importOpen}
        onOpenChange={(open) => {
          if (!importTestMutation.isPending) {
            if (!open) {
              resetImportDialog();
            } else {
              setImportOpen(true);
            }
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Import Test</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="rounded-2xl border border-[#eadfcd] bg-[#fff9ef] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Selected File</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{importBundle?.test.title ?? "Untitled test"}</p>
              <p className="mt-1 text-xs text-slate-500">{importFilename}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Part Of Exam</Label>
                <Select value={importExamType} onValueChange={setImportExamType}>
                  <SelectTrigger className="h-11 rounded-xl border-[#eadfcd] bg-white">
                    <SelectValue placeholder="Select exam" />
                  </SelectTrigger>
                  <SelectContent>
                    {examTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.key}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">This determines which exam stream the imported test belongs to.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Schedule Date</Label>
                <Input
                  type="datetime-local"
                  value={importScheduled}
                  onChange={(event) => setImportScheduled(event.target.value)}
                  className="h-11 rounded-xl border-[#eadfcd] bg-white"
                />
                <p className="text-xs text-slate-500">Leave this blank to import the test as a draft without a schedule.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" disabled={importTestMutation.isPending} onClick={() => resetImportDialog()}>
                Cancel
              </Button>
              <Button
                disabled={!importBundle || !importExamType || importTestMutation.isPending}
                onClick={() => {
                  if (!importBundle) return;
                  importTestMutation.mutate({
                    bundle: importBundle,
                    examType: importExamType,
                    scheduledAt: importScheduled,
                  });
                }}
              >
                {importTestMutation.isPending ? "Importing..." : "Import Test"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={metadataImportOpen}
        onOpenChange={(open) => {
          if (!importMetadataMutation.isPending) {
            if (!open) {
              resetMetadataImportDialog();
            } else {
              setMetadataImportOpen(true);
            }
          }
        }}
      >
        <DialogContent className="max-w-5xl overflow-hidden p-0">
          <div className="grid max-h-[88vh] lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="overflow-y-auto border-b border-[#eadfcd] bg-[#fffaf1] p-5 lg:border-b-0 lg:border-r">
              <div className="rounded-2xl border border-[#eadfcd] bg-white px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Selected Test</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{metadataImportTest?.title ?? "Untitled test"}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {metadataImportFilename ? `Loaded file: ${metadataImportFilename}` : metadataImportConfig.loadedFileText}
                </p>
              </div>
              <div className="mt-4 rounded-2xl bg-slate-950 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">Example</p>
                <pre className="mt-3 overflow-x-auto text-[11px] leading-5 text-slate-100">
{metadataImportConfig.example}
                </pre>
              </div>
            </div>
            <div className="flex min-h-0 flex-col overflow-hidden bg-white">
              <DialogHeader className="border-b border-[#eadfcd] px-6 py-5 pr-14 text-left">
                <DialogTitle>{metadataImportConfig.title}</DialogTitle>
                <p className="mt-1 text-sm text-slate-500">Paste or load data to update questions in the selected test in bulk.</p>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto px-6 py-5">
                <div className="rounded-2xl border border-[#cfd4ff] bg-white px-4 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{metadataImportConfig.pasteTitle}</p>
                      <p className="mt-1 text-xs text-slate-500">{metadataImportConfig.pasteHelper}</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 border-[#d8dafe] text-xs text-slate-700 hover:bg-[#f8f8ff]"
                      onClick={() => metadataImportInputRef.current?.click()}
                      disabled={!metadataImportTestId || importMetadataMutation.isPending}
                    >
                      <Upload size={13} />
                      Load File
                    </Button>
                  </div>
                  <Textarea
                    value={metadataImportText}
                    onChange={(event) => setMetadataImportText(event.target.value)}
                    placeholder={metadataImportConfig.example}
                    className="mt-4 min-h-[340px] rounded-2xl border-[#7c7cff] bg-white font-mono text-[13px] leading-6 lg:min-h-[420px]"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-[#eadfcd] px-6 py-4">
                <Button
                  variant="ghost"
                  disabled={importMetadataMutation.isPending}
                  onClick={() => resetMetadataImportDialog()}
                >
                  Cancel
                </Button>
                <Button
                  disabled={!metadataImportTestId || !metadataImportText.trim() || importMetadataMutation.isPending}
                  onClick={() => {
                    if (!metadataImportTestId || !metadataImportText.trim()) return;
                    try {
                      const parsed = JSON.parse(metadataImportText) as unknown;
                      if ((!Array.isArray(parsed) && (typeof parsed !== "object" || parsed === null))) {
                        throw new Error("Please paste a JSON object or question metadata array.");
                      }
                      importMetadataMutation.mutate({
                        testId: metadataImportTestId,
                        payload: parsed,
                        mode: metadataImportMode,
                      });
                    } catch (error) {
                      toast({
                        title: metadataImportConfig.invalidJsonTitle,
                        description: error instanceof Error ? error.message : "Please paste valid JSON.",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  {importMetadataMutation.isPending ? "Importing..." : metadataImportConfig.submitLabel}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
