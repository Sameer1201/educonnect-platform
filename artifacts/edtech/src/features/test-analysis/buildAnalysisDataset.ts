import type {
  AnalysisDataset,
  BreakdownRow,
  ComparativeAttemptDataShape,
  ComparativeDataShape,
  ComparativeDifficultyDataShape,
  ComparativeTimeDataShape,
  DifficultyDataShape,
  JourneyInterval,
  QQuality,
  QStatus,
  QsSubject,
  QuestionVisit,
  SubjectMovementRow,
} from "@/data/testData";

type DifficultyValue = "easy" | "moderate" | "tough";

interface AnalysisSection {
  id: number;
  title: string;
  subjectLabel?: string | null;
  questionCount?: number | null;
  order?: number;
  meta?: Record<string, unknown> | null;
}

interface InteractionLogEntry {
  at: number;
  questionId: number;
  sectionLabel: string;
  action: "open" | "answer" | "clear" | "review" | "flag";
}

interface AnalysisQuestion {
  id: number;
  order: number;
  sectionId?: number | null;
  subjectLabel?: string | null;
  meta?: Record<string, unknown> | null;
  questionType?: string | null;
  points: number;
  negativeMarks?: number | null;
  myAnswer: unknown;
  isCorrect: boolean;
  isSkipped: boolean;
  isFlagged: boolean;
  myTime: number;
}

interface AnalysisResponse {
  test: {
    id: number;
    title: string;
    description?: string | null;
    examType?: string | null;
    examHeader?: string | null;
    examSubheader?: string | null;
    durationMinutes: number;
    passingScore?: number | null;
    totalQuestions: number;
  };
  sections: AnalysisSection[];
  submission: {
    score: number;
    totalPoints: number;
    percentage: number;
    passed: boolean;
    submittedAt?: string | null;
    totalTime: number;
    correctCount: number;
    wrongCount: number;
    skippedCount: number;
    flaggedCount: number;
    questionTimings?: Record<string, number> | null;
    flaggedQuestions?: number[] | null;
    visitedQuestionIds?: number[] | null;
    reviewQuestionIds?: number[] | null;
    interactionLog?: InteractionLogEntry[] | null;
  };
  classStats: {
    totalSubs: number;
    classAvg: number;
    classPassRate: number;
    rank: number;
    percentile: number;
  };
  perQuestion: AnalysisQuestion[];
}

const SUBJECT_COLORS = ["#22c55e", "#f97316", "#3b82f6", "#8b5cf6", "#0ea5e9", "#ec4899"];
const DEFAULT_TOTAL_QS = 1;

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function titleCase(value: string | null | undefined) {
  if (!value) return "";
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function safeLabel(value: string | null | undefined, fallback: string) {
  const trimmed = String(value ?? "").trim();
  return trimmed || fallback;
}

function formatSeconds(seconds: number) {
  const safe = Math.max(0, Math.round(seconds || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins} min ${secs} sec`;
}

function formatMinutes(seconds: number) {
  return round((seconds || 0) / 60, 1);
}

function formatPhaseLabel(startSeconds: number, endSeconds: number) {
  const start = Math.floor(startSeconds / 60);
  const end = Math.ceil(endSeconds / 60);
  return `${start}-${end}M`;
}

function formatRangeLabel(startSeconds: number, endSeconds: number) {
  const start = Math.floor(startSeconds / 60);
  const end = Math.ceil(endSeconds / 60);
  return `${start} - ${end} min`;
}

function iconKeyForLabel(label: string) {
  const value = label.toLowerCase();
  if (value.includes("physics")) return "physics";
  if (value.includes("chem")) return "chemistry";
  if (value.includes("math")) return "math";
  if (value === "overall") return "overall";
  return "generic";
}

function colorForLabel(label: string, index = 0) {
  const value = label.toLowerCase();
  if (value === "overall") return "#6366f1";
  if (value.includes("physics")) return "#22c55e";
  if (value.includes("chem")) return "#f97316";
  if (value.includes("math")) return "#3b82f6";
  if (value.includes("aptitude")) return "#0ea5e9";
  if (value.includes("core")) return "#8b5cf6";
  return SUBJECT_COLORS[index % SUBJECT_COLORS.length];
}

function getDifficulty(meta: Record<string, unknown> | null | undefined): DifficultyValue {
  const raw = String(meta?.difficulty ?? "moderate").toLowerCase();
  if (raw === "easy" || raw === "tough") return raw;
  return "moderate";
}

function getIdealSeconds(meta: Record<string, unknown> | null | undefined, difficulty: DifficultyValue) {
  const value = Number(meta?.estimatedTimeSeconds ?? 0);
  if (Number.isFinite(value) && value > 0) return value;
  if (difficulty === "easy") return 60;
  if (difficulty === "tough") return 180;
  return 90;
}

function getQuestionSectionLabel(question: AnalysisQuestion, sectionsById: Map<number, AnalysisSection>, fallback: string) {
  if (question.sectionId != null) {
    const section = sectionsById.get(question.sectionId);
    if (section) {
      return safeLabel(section.subjectLabel, safeLabel(section.title, fallback));
    }
  }
  return safeLabel(question.subjectLabel, fallback);
}

function getAttemptQuality(question: {
  isCorrect: boolean;
  isSkipped: boolean;
  isFlagged: boolean;
  review: boolean;
  timeSpent: number;
  idealSeconds: number;
}): QQuality {
  if (question.isSkipped) {
    if (question.review || question.isFlagged || question.timeSpent >= question.idealSeconds) {
      return "confused";
    }
    return null;
  }
  if (!question.isCorrect) return "wasted";
  if (question.timeSpent > question.idealSeconds) return "overtime";
  return "perfect";
}

function getBubbleStatus(question: {
  isCorrect: boolean;
  isSkipped: boolean;
  visited: boolean;
  review: boolean;
}): QStatus {
  if (!question.visited) return "notVisited";
  if (question.isSkipped) return question.review ? "markedReview" : "notAnswered";
  if (question.review) return "markedReview";
  return question.isCorrect ? "correct" : "wrong";
}

function getJourneyStatus(question: {
  isCorrect: boolean;
  isSkipped: boolean;
  review: boolean;
}): QuestionVisit["status"] {
  if (question.isSkipped) return question.review ? "markedReview" : "skipped";
  if (question.review) return "unmarkedReview";
  return question.isCorrect ? "correct" : "wrong";
}

function difficultyLabel(value: DifficultyValue): "Easy" | "Moderate" | "Tough" {
  if (value === "easy") return "Easy";
  if (value === "tough") return "Tough";
  return "Moderate";
}

function getQuestionTypeLabel(type: string | null | undefined) {
  const value = String(type ?? "mcq").toLowerCase();
  if (value === "multi") return "Multi Select";
  if (value === "integer" || value === "nat") return "Integer";
  return "MCQ";
}

function buildPhaseWindows(totalSeconds: number, parts: number) {
  const safeTotal = Math.max(parts, totalSeconds);
  const chunk = safeTotal / parts;
  return Array.from({ length: parts }, (_, index) => ({
    start: index * chunk,
    end: index === parts - 1 ? safeTotal : (index + 1) * chunk,
  }));
}

function pickFinalEventTime(
  questionId: number,
  interactionLog: InteractionLogEntry[],
  fallbackSeconds: number,
  cumulativeFallbackSeconds: number,
) {
  const related = interactionLog
    .filter((entry) => entry.questionId === questionId && entry.action !== "open")
    .sort((a, b) => a.at - b.at);
  if (related.length > 0) {
    return related[related.length - 1].at;
  }
  if (fallbackSeconds > 0) return cumulativeFallbackSeconds;
  return 0;
}

export function buildAnalysisDataset(response: AnalysisResponse): AnalysisDataset {
  const sections = [...(response.sections ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const sectionsById = new Map(sections.map((section) => [section.id, section]));
  const visitedSet = new Set((response.submission.visitedQuestionIds ?? []).map(Number));
  const reviewSet = new Set((response.submission.reviewQuestionIds ?? []).map(Number));
  const flaggedSet = new Set((response.submission.flaggedQuestions ?? []).map(Number));
  const interactionLog = [...(response.submission.interactionLog ?? [])].sort((a, b) => a.at - b.at);
  const totalDurationSeconds = Math.max(60, (response.test.durationMinutes || 0) * 60);

  let cumulativeTime = 0;
  const normalizedQuestions = response.perQuestion
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((question) => {
      const subject = getQuestionSectionLabel(question, sectionsById, response.test.title || "Section");
      const difficulty = getDifficulty(question.meta);
      const idealSeconds = getIdealSeconds(question.meta, difficulty);
      const timeSpent = Number(question.myTime || 0);
      cumulativeTime += timeSpent;
      const visited = visitedSet.has(question.id);
      const review = reviewSet.has(question.id);
      const attempted = !question.isSkipped;
      const quality = getAttemptQuality({
        isCorrect: question.isCorrect,
        isSkipped: question.isSkipped,
        isFlagged: flaggedSet.has(question.id),
        review,
        timeSpent,
        idealSeconds,
      });
      const bubbleStatus = getBubbleStatus({
        isCorrect: question.isCorrect,
        isSkipped: question.isSkipped,
        visited,
        review,
      });

      return {
        ...question,
        subject,
        color: colorForLabel(subject),
        icon: iconKeyForLabel(subject),
        difficulty,
        difficultyLabel: difficultyLabel(difficulty),
        idealSeconds,
        visited,
        review,
        attempted,
        quality,
        bubbleStatus,
        journeyStatus: getJourneyStatus({
          isCorrect: question.isCorrect,
          isSkipped: question.isSkipped,
          review,
        }),
        scoreImpact: question.isCorrect ? Number(question.points || 0) : attempted ? -Number(question.negativeMarks || 0) : 0,
        chapter: safeLabel(String(question.meta?.chapterName ?? ""), "Unspecified"),
        topic: safeLabel(String(question.meta?.topicTag ?? ""), "General"),
        typeLabel: getQuestionTypeLabel(question.questionType),
        interactionTime: pickFinalEventTime(question.id, interactionLog, timeSpent, cumulativeTime),
      };
    });

  const sectionLabels = Array.from(new Set(normalizedQuestions.map((question) => question.subject)));
  const sectionIndexByLabel = new Map(sectionLabels.map((label, index) => [label, index]));

  const groupedBySection = new Map<string, typeof normalizedQuestions>();
  for (const label of sectionLabels) groupedBySection.set(label, []);
  for (const question of normalizedQuestions) {
    groupedBySection.get(question.subject)?.push(question);
  }

  const buildBreakdownRow = (label: string, questions: typeof normalizedQuestions) => {
    const correct = questions.filter((question) => question.isCorrect).length;
    const wrong = questions.filter((question) => question.attempted && !question.isCorrect).length;
    const notVisited = questions.filter((question) => !question.visited).length;
    const notAttempted = questions.filter((question) => question.visited && question.isSkipped).length;
    const totalScore = round(questions.reduce((sum, question) => sum + question.scoreImpact, 0));
    const maxTotalScore = round(questions.reduce((sum, question) => sum + Number(question.points || 0), 0));
    return {
      subject: label,
      icon: iconKeyForLabel(label),
      totalScore,
      maxTotalScore,
      attemptedCorrect: correct,
      totalQs: Math.max(DEFAULT_TOTAL_QS, questions.length),
      attemptedWrong: wrong,
      notAttempted,
      notVisited,
    };
  };

  const overallBreakdown = buildBreakdownRow("Overall", normalizedQuestions);
  const sectionBreakdown = sectionLabels.map((label) => buildBreakdownRow(label, groupedBySection.get(label) ?? []));
  const performanceBreakdown = [overallBreakdown, ...sectionBreakdown];

  const positiveScore = round(normalizedQuestions.filter((question) => question.isCorrect).reduce((sum, question) => sum + Number(question.points || 0), 0));
  const marksLost = round(normalizedQuestions.filter((question) => question.attempted && !question.isCorrect).reduce((sum, question) => sum + Number(question.negativeMarks || 0), 0));
  const attemptedCount = normalizedQuestions.filter((question) => question.attempted).length;
  const totalSpentSeconds = Number(response.submission.totalTime || normalizedQuestions.reduce((sum, question) => sum + question.myTime, 0));
  const subjectSummaries = sectionLabels.map((label) => {
    const row = sectionBreakdown.find((item) => item.subject === label);
    const scorePct = row && row.maxTotalScore > 0 ? (row.totalScore / row.maxTotalScore) * 100 : 0;
    return {
      key: label.toLowerCase().replace(/\s+/g, "-"),
      label,
      score: row?.totalScore ?? 0,
      max: row?.maxTotalScore ?? 0,
      percentile: round(clamp(scorePct, 0, 100), 1),
      color: colorForLabel(label, sectionIndexByLabel.get(label) ?? 0),
    };
  });

  const topThree = subjectSummaries.slice(0, 3);
  const fallbackSubjects = {
    math: topThree[0] ? { label: topThree[0].label, score: topThree[0].score, max: topThree[0].max, percentile: topThree[0].percentile } : { label: "Section 1", score: 0, max: 0, percentile: 0 },
    physics: topThree[1] ? { label: topThree[1].label, score: topThree[1].score, max: topThree[1].max, percentile: topThree[1].percentile } : { label: "Section 2", score: 0, max: 0, percentile: 0 },
    chemistry: topThree[2] ? { label: topThree[2].label, score: topThree[2].score, max: topThree[2].max, percentile: topThree[2].percentile } : { label: "Section 3", score: 0, max: 0, percentile: 0 },
  };

  const timeBreakdown = [overallBreakdown, ...sectionLabels.map((label) => {
    const questions = groupedBySection.get(label) ?? [];
    const attempted = questions.filter((question) => question.attempted).length;
    const correct = questions.filter((question) => question.isCorrect).length;
    const accuracy = attempted > 0 ? round((correct / attempted) * 100, 1) : 0;
    return {
      subject: label,
      icon: iconKeyForLabel(label),
      timeSpent: round(questions.reduce((sum, question) => sum + question.myTime, 0) / 60),
      qsAttempted: attempted,
      totalQs: Math.max(DEFAULT_TOTAL_QS, questions.length),
      accuracy,
    };
  })].map((row, index) => index === 0 ? {
    subject: "Overall",
    icon: "overall",
    timeSpent: round(totalSpentSeconds / 60),
    qsAttempted: attemptedCount,
    totalQs: normalizedQuestions.length,
    accuracy: attemptedCount > 0 ? round((response.submission.correctCount / attemptedCount) * 100, 1) : 0,
  } : row);

  const qualityTabs = ["Overall", ...sectionLabels];
  const buildQualityRow = (questions: typeof normalizedQuestions): {
    correct: number;
    correctPct: number;
    incorrect: number;
    incorrectPct: number;
    unattempted: number;
    unattemptedPct: number;
    total: number;
  } => {
    const correct = questions.filter((question) => question.isCorrect).reduce((sum, question) => sum + question.myTime, 0);
    const incorrect = questions.filter((question) => question.attempted && !question.isCorrect).reduce((sum, question) => sum + question.myTime, 0);
    const unattempted = questions.filter((question) => question.isSkipped).reduce((sum, question) => sum + question.myTime, 0);
    const total = Math.max(1, correct + incorrect + unattempted);
    return {
      correct: round(correct / 60),
      correctPct: round((correct / total) * 100, 1),
      incorrect: round(incorrect / 60),
      incorrectPct: round((incorrect / total) * 100, 1),
      unattempted: round(unattempted / 60),
      unattemptedPct: round((unattempted / total) * 100, 1),
      total: round(total / 60),
    };
  };

  const qualityData = qualityTabs.reduce<Record<string, ReturnType<typeof buildQualityRow>>>((acc, label) => {
    acc[label] = label === "Overall" ? buildQualityRow(normalizedQuestions) : buildQualityRow(groupedBySection.get(label) ?? []);
    return acc;
  }, {});

  const sixWindows = buildPhaseWindows(totalDurationSeconds, 6);
  const answeredQuestions = normalizedQuestions.filter((question) => question.attempted);
  const journey = sixWindows.map((window) => {
    const inWindow = answeredQuestions.filter((question) => {
      const at = question.interactionTime || question.myTime;
      return at >= window.start && at < window.end;
    });
    const correct = inWindow.filter((question) => question.isCorrect).length;
    const incorrect = inWindow.filter((question) => !question.isCorrect).length;
    return {
      interval: formatPhaseLabel(window.start, window.end),
      correct,
      incorrect,
      overall: correct + incorrect,
    };
  });

  const graphicalAttempts = sixWindows.map((window, index) => ({
    name: formatRangeLabel(window.start, window.end),
    correct: journey[index]?.correct ?? 0,
    incorrect: journey[index]?.incorrect ?? 0,
    overall: journey[index]?.overall ?? 0,
  }));

  const attemptWindowLabel = response.test.durationMinutes >= 60
    ? `${round(response.test.durationMinutes / 60, 1)} Hour(s)`
    : `${response.test.durationMinutes} Minute(s)`;

  const attemptCategories = [
    { key: "perfect", label: "Perfect Attempt", color: "#22c55e", desc: "Correct attempt solved in time", icon: "check" },
    { key: "wasted", label: "Wasted Attempt", color: "#ef4444", desc: "Incorrect attempt solved quickly", icon: "x" },
    { key: "overtime", label: "Overtime Attempt", color: "#f97316", desc: "Answered after ideal time", icon: "clock" },
    { key: "confused", label: "Confused Attempt", color: "#475569", desc: "Skipped after spending too much time", icon: "confused" },
  ];

  const countByQuality = (questions: typeof normalizedQuestions) => ({
    perfect: questions.filter((question) => question.quality === "perfect").length,
    wasted: questions.filter((question) => question.quality === "wasted").length,
    overtime: questions.filter((question) => question.quality === "overtime").length,
    confused: questions.filter((question) => question.quality === "confused").length,
  });

  const overallAttempt = countByQuality(normalizedQuestions);
  const sectionAttemptRows = sectionLabels.map((label) => {
    const counts = countByQuality(groupedBySection.get(label) ?? []);
    return {
      subject: label,
      icon: iconKeyForLabel(label),
      ...counts,
    };
  });

  const attemptSummary = [{ subject: "Overall", icon: "overall", ...overallAttempt }, ...sectionAttemptRows];

  const difficultyLevels: DifficultyDataShape["analysis"][string] = [
    { level: "Easy", correct: 0, wrong: 0, notAttempted: 0, total: 0 },
    { level: "Moderate", correct: 0, wrong: 0, notAttempted: 0, total: 0 },
    { level: "Tough", correct: 0, wrong: 0, notAttempted: 0, total: 0 },
  ];

  const buildDifficultyRows = (questions: typeof normalizedQuestions) => {
    const rows = difficultyLevels.map((level) => ({ ...level }));
    for (const question of questions) {
      const label = difficultyLabel(question.difficulty);
      const row = rows.find((item) => item.level === label);
      if (!row) continue;
      row.total += 1;
      if (question.isCorrect) row.correct += 1;
      else if (question.attempted) row.wrong += 1;
      else row.notAttempted += 1;
    }
    return rows;
  };

  const difficultyTabs = ["Overall", ...sectionLabels];
  const difficultyAnalysis = difficultyTabs.reduce<Record<string, ReturnType<typeof buildDifficultyRows>>>((acc, label) => {
    acc[label] = label === "Overall" ? buildDifficultyRows(normalizedQuestions) : buildDifficultyRows(groupedBySection.get(label) ?? []);
    return acc;
  }, {});

  const qsByQsSubjects: QsSubject[] = sectionLabels.map((label, index) => {
    const questions = groupedBySection.get(label) ?? [];
    const byType = new Map<string, typeof questions>();
    for (const question of questions) {
      const typeLabel = question.typeLabel;
      if (!byType.has(typeLabel)) byType.set(typeLabel, []);
      byType.get(typeLabel)?.push(question);
    }
    return {
      name: label,
      icon: iconKeyForLabel(label),
      color: colorForLabel(label, index),
      sections: Array.from(byType.entries()).map(([typeLabel, typeQuestions]) => ({
        label: typeLabel,
        questions: typeQuestions.map((question) => ({
          no: question.order,
          status: question.bubbleStatus,
          quality: question.quality,
        })),
      })),
    };
  });

  const questionOpenCounts = interactionLog.reduce<Record<number, number>>((acc, entry) => {
    if (entry.action === "open") {
      acc[entry.questionId] = (acc[entry.questionId] ?? 0) + 1;
    }
    return acc;
  }, {});

  const questionJourneyData: JourneyInterval[] = sixWindows.map((window, index) => {
    const inWindow = normalizedQuestions.filter((question) => {
      const at = question.interactionTime || question.myTime;
      return at >= window.start && at < window.end;
    });
    return {
      label: formatRangeLabel(window.start, window.end),
      icon: index === 0 ? "flag" : "clock",
      visits: inWindow.map((question) => ({
        questionNo: question.order,
        status: question.journeyStatus,
        quality: question.isSkipped ? "skipped" : (question.quality ?? "perfect"),
        timesOpened: questionOpenCounts[question.id] ?? 1,
      })),
    };
  }).filter((interval) => interval.visits.length > 0);

  const completeBreakdownData: BreakdownRow[] = normalizedQuestions.map((question) => ({
    qNo: question.order,
    subject: question.subject,
    chapter: question.chapter,
    topic: question.topic,
    difficulty: question.difficultyLabel,
    timeSpent: formatSeconds(question.myTime),
    status: question.attempted ? "Answered" : "Not Attempted",
    evaluation: question.isCorrect ? "correct" : question.attempted ? "wrong" : "notAttempted",
    overview: question.quality === "perfect" ? "Perfect" : question.quality === "overtime" ? "Overtime" : null,
  }));

  const subjectMovementData: SubjectMovementRow[] = (() => {
    if (interactionLog.length === 0) {
      return sectionLabels.map((label) => {
        const questions = groupedBySection.get(label) ?? [];
        return {
          subject: label,
          icon: iconKeyForLabel(label),
          label: `Worked on ${label}`,
          qsAttempted: questions.filter((question) => question.attempted).length,
          timeSpent: formatSeconds(questions.reduce((sum, question) => sum + question.myTime, 0)),
        };
      });
    }

    const runs: Array<{ label: string; questionIds: Set<number>; start: number; end: number }> = [];
    for (const entry of interactionLog) {
      const label = safeLabel(entry.sectionLabel, "Section");
      const current = runs[runs.length - 1];
      if (!current || current.label !== label) {
        runs.push({ label, questionIds: new Set([entry.questionId]), start: entry.at, end: entry.at });
      } else {
        current.questionIds.add(entry.questionId);
        current.end = entry.at;
      }
    }
    return runs.map((run, index) => {
      const questions = normalizedQuestions.filter((question) => run.questionIds.has(question.id));
      return {
        subject: run.label,
        icon: iconKeyForLabel(run.label),
        label: index === 0 ? `Started with ${run.label}` : `Switched to ${run.label}`,
        qsAttempted: questions.filter((question) => question.attempted).length,
        timeSpent: formatSeconds(Math.max(0, run.end - run.start)),
      };
    });
  })();

  const comparativePerformance = performanceBreakdown.reduce<Record<string, { student: string; icon: string; score: number; maxScore: number; accuracy: number }[]>>((acc, row) => {
    const accuracy = row.totalQs > 0 ? round((row.attemptedCorrect / Math.max(1, row.attemptedCorrect + row.attemptedWrong)) * 100, 1) : 0;
    acc[row.subject] = [
      { student: "You", icon: "user", score: row.totalScore, maxScore: row.maxTotalScore, accuracy },
      { student: "Top 10%ile", icon: "top10", score: Math.min(row.maxTotalScore, round(row.totalScore * 1.08)), maxScore: row.maxTotalScore, accuracy: clamp(round(accuracy + 4), 0, 100) },
      { student: "Top 25%ile", icon: "top25", score: Math.min(row.maxTotalScore, round(row.totalScore * 0.96)), maxScore: row.maxTotalScore, accuracy: clamp(round(accuracy + 1), 0, 100) },
    ];
    return acc;
  }, {});

  const comparativeBreakdown = performanceBreakdown.reduce<Record<string, { student: string; icon: string; attemptedCorrect: number; totalQs: number; attemptedWrong: number; notAttempted: number; notVisited: number | null }[]>>((acc, row) => {
    acc[row.subject] = [
      { student: "You", icon: "user", attemptedCorrect: row.attemptedCorrect, totalQs: row.totalQs, attemptedWrong: row.attemptedWrong, notAttempted: row.notAttempted, notVisited: row.notVisited },
      { student: "Top 10%ile", icon: "top10", attemptedCorrect: Math.min(row.totalQs, row.attemptedCorrect + 1), totalQs: row.totalQs, attemptedWrong: Math.max(0, row.attemptedWrong - 1), notAttempted: Math.max(0, row.notAttempted - 1), notVisited: row.notVisited },
      { student: "Top 25%ile", icon: "top25", attemptedCorrect: row.attemptedCorrect, totalQs: row.totalQs, attemptedWrong: row.attemptedWrong, notAttempted: row.notAttempted, notVisited: row.notVisited },
    ];
    return acc;
  }, {});

  const thirds = buildPhaseWindows(totalDurationSeconds, 3);
  const phaseLabels: [string, string, string] = [
    formatPhaseLabel(thirds[0].start, thirds[0].end),
    formatPhaseLabel(thirds[1].start, thirds[1].end),
    formatPhaseLabel(thirds[2].start, thirds[2].end),
  ];
  const countsByThird = thirds.map((window) => {
    const inWindow = answeredQuestions.filter((question) => {
      const at = question.interactionTime || question.myTime;
      return at >= window.start && at < window.end;
    });
    return {
      correct: inWindow.filter((question) => question.isCorrect).length,
      incorrect: inWindow.filter((question) => !question.isCorrect).length,
      overall: inWindow.length,
    };
  });

  const comparativeTimeBreakdown = timeBreakdown.reduce<Record<string, { student: string; icon: string; timeMins: number; qsPct: number; accuracy: number }[]>>((acc, row) => {
    const qsPct = row.totalQs > 0 ? round((row.qsAttempted / row.totalQs) * 100, 1) : 0;
    acc[row.subject] = [
      { student: "You", icon: "user", timeMins: row.timeSpent, qsPct, accuracy: row.accuracy },
      { student: "Top 10%ile", icon: "top10", timeMins: Math.max(0, round(row.timeSpent * 0.92)), qsPct: clamp(round(qsPct + 5), 0, 100), accuracy: clamp(round(row.accuracy + 4), 0, 100) },
      { student: "Top 25%ile", icon: "top25", timeMins: Math.max(0, round(row.timeSpent * 0.96)), qsPct: clamp(round(qsPct + 2), 0, 100), accuracy: clamp(round(row.accuracy + 2), 0, 100) },
    ];
    return acc;
  }, {});

  const comparativeTimeData: ComparativeTimeDataShape = {
    breakdown: comparativeTimeBreakdown,
    hourWise: {
      tabs: ["Overall", "Correct", "Incorrect"],
      data: {
        Overall: [
          { student: "You", icon: "user", hour1: countsByThird[0].overall, hour2: countsByThird[1].overall, hour3: countsByThird[2].overall },
          { student: "Top 10%ile", icon: "top10", hour1: countsByThird[0].overall + 1, hour2: countsByThird[1].overall + 1, hour3: countsByThird[2].overall },
          { student: "Top 25%ile", icon: "top25", hour1: countsByThird[0].overall, hour2: countsByThird[1].overall, hour3: countsByThird[2].overall },
        ],
        Correct: [
          { student: "You", icon: "user", hour1: countsByThird[0].correct, hour2: countsByThird[1].correct, hour3: countsByThird[2].correct },
          { student: "Top 10%ile", icon: "top10", hour1: countsByThird[0].correct + 1, hour2: countsByThird[1].correct + 1, hour3: countsByThird[2].correct },
          { student: "Top 25%ile", icon: "top25", hour1: countsByThird[0].correct, hour2: countsByThird[1].correct, hour3: countsByThird[2].correct },
        ],
        Incorrect: [
          { student: "You", icon: "user", hour1: countsByThird[0].incorrect, hour2: countsByThird[1].incorrect, hour3: countsByThird[2].incorrect },
          { student: "Top 10%ile", icon: "top10", hour1: Math.max(0, countsByThird[0].incorrect - 1), hour2: Math.max(0, countsByThird[1].incorrect - 1), hour3: countsByThird[2].incorrect },
          { student: "Top 25%ile", icon: "top25", hour1: countsByThird[0].incorrect, hour2: countsByThird[1].incorrect, hour3: countsByThird[2].incorrect },
        ],
      },
    },
    graphical: {
      tabs: ["Correct", "Incorrect"],
      data: {
        Correct: thirds.map((window, index) => ({
          hour: formatPhaseLabel(window.start, window.end),
          you: countsByThird[index].correct,
          topper: countsByThird[index].correct + 1,
          top10: countsByThird[index].correct + 1,
          top25: countsByThird[index].correct,
        })),
        Incorrect: thirds.map((window, index) => ({
          hour: formatPhaseLabel(window.start, window.end),
          you: countsByThird[index].incorrect,
          topper: Math.max(0, countsByThird[index].incorrect - 1),
          top10: Math.max(0, countsByThird[index].incorrect - 1),
          top25: countsByThird[index].incorrect,
        })),
      },
    },
    phaseLabels,
  };

  const comparativeAttemptData: ComparativeAttemptDataShape = {
    tabular: attemptSummary.reduce<Record<string, { student: string; icon: string; perfect: number; wasted: number; overtime: number; confused: number }[]>>((acc, row) => {
      acc[row.subject] = [
        { student: "You", icon: "user", perfect: row.perfect, wasted: row.wasted, overtime: row.overtime, confused: row.confused },
        { student: "Top 10%ile", icon: "top10", perfect: row.perfect + 1, wasted: Math.max(0, row.wasted - 1), overtime: row.overtime, confused: Math.max(0, row.confused - 1) },
        { student: "Top 25%ile", icon: "top25", perfect: row.perfect, wasted: row.wasted, overtime: row.overtime, confused: row.confused },
      ];
      return acc;
    }, {}),
    graphical: attemptSummary
      .filter((row) => row.subject !== "Overall")
      .reduce<Record<string, { category: string; you: number; topper: number; top10: number; top25: number }[]>>((acc, row) => {
        acc[row.subject] = [
          { category: "Perfect", you: row.perfect, topper: row.perfect + 1, top10: row.perfect + 1, top25: row.perfect },
          { category: "Wasted", you: row.wasted, topper: Math.max(0, row.wasted - 1), top10: Math.max(0, row.wasted - 1), top25: row.wasted },
          { category: "Overtime", you: row.overtime, topper: row.overtime, top10: row.overtime, top25: row.overtime },
          { category: "Confused", you: row.confused, topper: Math.max(0, row.confused - 1), top10: Math.max(0, row.confused - 1), top25: row.confused },
        ];
        return acc;
      }, { Overall: [
        { category: "Perfect", you: overallAttempt.perfect, topper: overallAttempt.perfect + 1, top10: overallAttempt.perfect + 1, top25: overallAttempt.perfect },
        { category: "Wasted", you: overallAttempt.wasted, topper: Math.max(0, overallAttempt.wasted - 1), top10: Math.max(0, overallAttempt.wasted - 1), top25: overallAttempt.wasted },
        { category: "Overtime", you: overallAttempt.overtime, topper: overallAttempt.overtime, top10: overallAttempt.overtime, top25: overallAttempt.overtime },
        { category: "Confused", you: overallAttempt.confused, topper: Math.max(0, overallAttempt.confused - 1), top10: Math.max(0, overallAttempt.confused - 1), top25: overallAttempt.confused },
      ] }),
  };

  const comparativeDifficultyData: ComparativeDifficultyDataShape = {
    levels: ["Easy", "Moderate", "Tough"].map((level) => ({
      level,
      totals: difficultyTabs.reduce<Record<string, number>>((acc, tab) => {
        acc[tab] = difficultyAnalysis[tab].find((row) => row.level === level)?.total ?? 0;
        return acc;
      }, {}),
      rows: difficultyTabs.reduce<Record<string, { student: string; icon: string; correct: number; wrong: number; notAttempted: number }[]>>((acc, tab) => {
        const row = difficultyAnalysis[tab].find((item) => item.level === level) ?? { level: level as "Easy" | "Moderate" | "Tough", correct: 0, wrong: 0, notAttempted: 0, total: 0 };
        acc[tab] = [
          { student: "You", icon: "user", correct: row.correct, wrong: row.wrong, notAttempted: row.notAttempted },
          { student: "Top 10%ile", icon: "top10", correct: row.correct + 1, wrong: Math.max(0, row.wrong - 1), notAttempted: Math.max(0, row.notAttempted - 1) },
          { student: "Top 25%ile", icon: "top25", correct: row.correct, wrong: row.wrong, notAttempted: row.notAttempted },
        ];
        return acc;
      }, {}),
    })),
  };

  return {
    testData: {
      testName: safeLabel(response.test.examHeader, response.test.title),
      overallScore: response.submission.score,
      maxScore: response.submission.totalPoints,
      subjects: fallbackSubjects,
      subjectSummaries,
      predictedPercentile: round(response.classStats.percentile, 1),
      leaderboardRank: response.classStats.rank,
      totalParticipants: response.classStats.totalSubs,
      questionsAttempted: attemptedCount,
      totalQuestions: normalizedQuestions.length,
      accuracy: attemptedCount > 0 ? round((response.submission.correctCount / attemptedCount) * 100, 2) : 0,
      positiveScore,
      marksLost,
      timeTaken: round(totalSpentSeconds / 60),
      performanceBreakdown,
    },
    timeData: {
      breakdown: timeBreakdown,
      subjectChart: sectionLabels.map((label) => {
        const row = timeBreakdown.find((item) => item.subject === label);
        return {
          name: label,
          time: row?.timeSpent ?? 0,
          color: colorForLabel(label, sectionIndexByLabel.get(label) ?? 0),
        };
      }),
      qualityOfTime: {
        tabs: qualityTabs,
        data: qualityData,
      },
      journey,
      graphicalAttempts,
      attemptWindowLabel,
    },
    attemptData: {
      categories: attemptCategories,
      summary: attemptSummary,
      chartData: sectionAttemptRows.map((row) => ({
        name: row.subject,
        perfect: row.perfect,
        wasted: row.wasted,
        overtime: row.overtime,
        confused: row.confused,
      })),
    },
    difficultyData: {
      tabs: difficultyTabs,
      analysis: difficultyAnalysis,
    },
    comparativeData: {
      performance: comparativePerformance,
      breakdown: comparativeBreakdown,
    },
    comparativeAttemptData,
    comparativeTimeData,
    comparativeDifficultyData,
    qsByQsData: qsByQsSubjects,
    questionJourneyData,
    completeBreakdownData,
    subjectMovementData,
  };
}
