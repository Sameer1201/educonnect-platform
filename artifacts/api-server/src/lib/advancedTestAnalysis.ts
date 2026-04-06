type GradeQuestionFn = (question: any, answer: any) => boolean;
type HasAnsweredQuestionFn = (question: any, answer: any) => boolean;

const SUBJECT_COLORS = ["#5B4DFF", "#22C55E", "#F97316", "#3B82F6", "#8B5CF6", "#0EA5E9"];

function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.trim() === "") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percent(value: number, total: number, digits = 0): number {
  if (!total) return 0;
  return round((value / total) * 100, digits);
}

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins} min ${secs} sec`;
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizeDifficulty(value: unknown): "Easy" | "Moderate" | "Tough" {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "easy") return "Easy";
  if (raw === "tough" || raw === "hard") return "Tough";
  return "Moderate";
}

function defaultIdealSeconds(difficulty: "Easy" | "Moderate" | "Tough"): number {
  if (difficulty === "Easy") return 60;
  if (difficulty === "Tough") return 180;
  return 90;
}

function subjectColor(label: string, index = 0): string {
  const lower = label.toLowerCase();
  if (lower.includes("physics")) return "#22C55E";
  if (lower.includes("chem")) return "#F97316";
  if (lower.includes("math") || lower.includes("aptitude") || lower.includes("quant")) return "#3B82F6";
  if (lower.includes("overall")) return "#5B4DFF";
  const hash = [...label].reduce((acc, char) => acc + char.charCodeAt(0), index);
  return SUBJECT_COLORS[hash % SUBJECT_COLORS.length];
}

function subjectIconKey(label: string, index = 0): string {
  const lower = label.toLowerCase();
  if (lower.includes("overall")) return "overall";
  if (lower.includes("physics")) return "physics";
  if (lower.includes("chem")) return "chemistry";
  if (lower.includes("math") || lower.includes("aptitude") || lower.includes("quant")) return "math";
  return `generic-${index}`;
}

function range(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

function makeTimeSlots(durationMinutes: number, stepMinutes: number, maxSlots: number) {
  const totalSlots = Math.max(1, Math.min(maxSlots, Math.ceil(Math.max(durationMinutes, stepMinutes) / stepMinutes)));
  return range(totalSlots).map((index) => {
    const start = index * stepMinutes;
    const end = Math.min(durationMinutes, start + stepMinutes);
    return {
      index,
      start,
      end,
      label: `${start}-${end}M`,
      graphLabel: `${start} - ${end} min`,
    };
  });
}

function aggregateNumbers(values: number[]) {
  if (values.length === 0) return 0;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length, 2);
}

function buildSubmissionProfile({
  test,
  sections,
  questions,
  submission,
  gradeQuestion,
  hasAnsweredQuestion,
}: {
  test: any;
  sections: any[];
  questions: any[];
  submission: any;
  gradeQuestion: GradeQuestionFn;
  hasAnsweredQuestion: HasAnsweredQuestionFn;
}) {
  const sectionById = new Map<number, any>();
  sections.forEach((section, index) => {
    sectionById.set(section.id, {
      ...section,
      icon: subjectIconKey(section.subjectLabel || section.title || `section-${index + 1}`, index + 1),
      color: subjectColor(section.subjectLabel || section.title || `section-${index + 1}`, index + 1),
    });
  });

  const answers = safeJsonParse<Record<string, any>>(submission.answers, {});
  const timings = safeJsonParse<Record<string, number>>(submission.questionTimings, {});
  const flaggedQuestions = safeJsonParse<number[]>(submission.flaggedQuestions, []);
  const visitedQuestionIds = safeJsonParse<number[]>(submission.visitedQuestionIds, []);
  const reviewQuestionIds = safeJsonParse<number[]>(submission.reviewQuestionIds, []);
  const interactionLog = safeJsonParse<any[]>(submission.interactionLog, []).sort((a, b) => Number(a.at ?? 0) - Number(b.at ?? 0));

  const visitedSet = new Set(visitedQuestionIds.map(Number));
  const reviewSet = new Set(reviewQuestionIds.map(Number));
  const flaggedSet = new Set(flaggedQuestions.map(Number));

  const firstLogAt = interactionLog.length > 0 ? Number(interactionLog[0].at ?? 0) : 0;
  const openCounts = new Map<number, number>();
  const firstOpenAt = new Map<number, number>();
  const firstAnswerAt = new Map<number, number>();

  for (const entry of interactionLog) {
    const questionId = Number(entry.questionId);
    if (!questionId) continue;
    const relativeSeconds = firstLogAt > 0 ? Math.max(0, Math.round((Number(entry.at ?? 0) - firstLogAt) / 1000)) : 0;
    if (entry.action === "open") {
      openCounts.set(questionId, (openCounts.get(questionId) ?? 0) + 1);
      if (!firstOpenAt.has(questionId)) firstOpenAt.set(questionId, relativeSeconds);
    }
    if (entry.action === "answer" && !firstAnswerAt.has(questionId)) {
      firstAnswerAt.set(questionId, relativeSeconds);
    }
  }

  let fallbackCursor = 0;
  const subjectOrder: string[] = [];
  const questionDetails = questions.map((question, index) => {
    const answer = answers[question.id] ?? answers[String(question.id)];
    const meta = safeJsonParse<Record<string, any>>(question.meta, {});
    const section = question.sectionId ? sectionById.get(Number(question.sectionId)) : null;
    const subject = question.subjectLabel || section?.subjectLabel || section?.title || "General";
    if (!subjectOrder.includes(subject)) subjectOrder.push(subject);
    const difficulty = normalizeDifficulty(meta.difficulty);
    const idealSeconds = Number(meta.estimatedTimeSeconds ?? 0) || defaultIdealSeconds(difficulty);
    const timeSpentSeconds = Number(timings[question.id] ?? timings[String(question.id)] ?? 0) || 0;
    const answered = hasAnsweredQuestion(question, answer);
    const correct = answered ? gradeQuestion(question, answer) : false;
    const openTimes = openCounts.get(question.id) ?? 0;
    const visited = visitedSet.has(question.id) || openTimes > 0 || timeSpentSeconds > 0 || answered || reviewSet.has(question.id);
    const reviewed = reviewSet.has(question.id);
    const flagged = flaggedSet.has(question.id);
    const notVisited = !visited;
    const notAnswered = visited && !answered;

    let quality: "perfect" | "wasted" | "overtime" | "confused" | null = null;
    if (!answered) {
      quality = timeSpentSeconds > idealSeconds * 1.15 || reviewed ? "confused" : null;
    } else if (timeSpentSeconds > idealSeconds * 1.2) {
      quality = "overtime";
    } else if (correct) {
      quality = "perfect";
    } else {
      quality = "wasted";
    }

    const qStatus = correct
      ? "correct"
      : answered
        ? "wrong"
        : reviewed
          ? "markedReview"
          : notVisited
            ? "notVisited"
            : "notAnswered";

    const journeyStatus = reviewed
      ? answered
        ? "markedReview"
        : "unmarkedReview"
      : answered
        ? correct
          ? "correct"
          : "wrong"
        : "skipped";

    if (answered && !firstAnswerAt.has(question.id)) {
      fallbackCursor += timeSpentSeconds;
      firstAnswerAt.set(question.id, fallbackCursor);
    } else {
      fallbackCursor += timeSpentSeconds;
    }

    const entryAtSeconds = firstOpenAt.get(question.id) ?? firstAnswerAt.get(question.id) ?? fallbackCursor;

    return {
      id: question.id,
      order: index + 1,
      sectionId: question.sectionId ?? null,
      sectionTitle: section?.title || subject,
      subject,
      icon: section?.icon || subjectIconKey(subject, subjectOrder.length),
      color: section?.color || subjectColor(subject, subjectOrder.length),
      chapter: meta.chapter || section?.title || subject,
      topic: meta.topicTag || meta.topic || subject,
      difficulty,
      idealSeconds,
      timeSpentSeconds,
      answered,
      correct,
      reviewed,
      flagged,
      visited,
      notVisited,
      notAnswered,
      quality,
      qStatus,
      journeyStatus,
      openTimes,
      answer,
      points: Number(question.points ?? 0),
      negativeMarks: Number(question.negativeMarks ?? 0),
      scoreDelta: correct ? Number(question.points ?? 0) : answered ? -Number(question.negativeMarks ?? 0) : 0,
      answerAtSeconds: firstAnswerAt.get(question.id) ?? null,
      entryAtSeconds,
      question,
    };
  });

  const subjectRows = ["Overall", ...subjectOrder].map((subject, index) => {
    const rows = subject === "Overall" ? questionDetails : questionDetails.filter((item) => item.subject === subject);
    const attemptedCorrect = rows.filter((item) => item.correct).length;
    const attemptedWrong = rows.filter((item) => item.answered && !item.correct).length;
    const notAttempted = rows.filter((item) => !item.answered).length;
    const notVisitedCount = rows.filter((item) => item.notVisited).length;
    const maxTotalScore = rows.reduce((sum, item) => sum + item.points, 0);
    const totalScore = round(rows.reduce((sum, item) => sum + item.scoreDelta, 0), 2);
    const answeredCount = rows.filter((item) => item.answered).length;
    return {
      subject,
      icon: subject === "Overall" ? "overall" : subjectIconKey(subject, index + 1),
      color: subjectColor(subject, index + 1),
      totalScore,
      maxTotalScore,
      attemptedCorrect,
      totalQs: rows.length,
      attemptedWrong,
      notAttempted,
      notVisited: notVisitedCount,
      accuracy: answeredCount > 0 ? round((attemptedCorrect / answeredCount) * 100, 2) : 0,
      timeSpentSeconds: rows.reduce((sum, item) => sum + item.timeSpentSeconds, 0),
      perfect: rows.filter((item) => item.quality === "perfect").length,
      wasted: rows.filter((item) => item.quality === "wasted").length,
      overtime: rows.filter((item) => item.quality === "overtime").length,
      confused: rows.filter((item) => item.quality === "confused").length,
    };
  });

  const totalTimeSeconds = questionDetails.reduce((sum, item) => sum + item.timeSpentSeconds, 0);
  const correctCount = questionDetails.filter((item) => item.correct).length;
  const wrongCount = questionDetails.filter((item) => item.answered && !item.correct).length;
  const skippedCount = questionDetails.filter((item) => !item.answered).length;
  const notVisitedCount = questionDetails.filter((item) => item.notVisited).length;
  const answeredCount = questionDetails.filter((item) => item.answered).length;
  const positiveScore = round(questionDetails.filter((item) => item.correct).reduce((sum, item) => sum + item.points, 0), 2);
  const score = Number(submission.score ?? 0);
  const maxScore = questionDetails.reduce((sum, item) => sum + item.points, 0);

  const thirtyMinuteSlots = makeTimeSlots(Number(test.durationMinutes ?? 180), 30, 6);
  const hourSlots = makeTimeSlots(Number(test.durationMinutes ?? 180), 60, 3);

  const journey = thirtyMinuteSlots.map((slot) => {
    const visits = questionDetails
      .filter((item) => item.entryAtSeconds !== null)
      .filter((item) => {
        const minute = Number(item.entryAtSeconds ?? 0) / 60;
        return minute >= slot.start && minute < slot.end;
      })
      .sort((a, b) => Number(a.entryAtSeconds ?? 0) - Number(b.entryAtSeconds ?? 0))
      .map((item) => ({
        questionNo: item.order,
        status: item.journeyStatus,
        quality: item.quality ?? "skipped",
        timesOpened: item.openTimes > 1 ? item.openTimes : undefined,
      }));
    return {
      label: slot.label,
      icon: slot.index === 0 ? "flag" : "clock",
      visits,
    };
  });

  const journeySummary = thirtyMinuteSlots.map((slot) => {
    const rows = questionDetails.filter((item) => {
      if (item.answerAtSeconds === null) return false;
      const minute = Number(item.answerAtSeconds) / 60;
      return minute >= slot.start && minute < slot.end;
    });
    const correct = rows.filter((item) => item.correct).length;
    const incorrect = rows.filter((item) => item.answered && !item.correct).length;
    return {
      interval: slot.label,
      correct,
      incorrect,
      overall: correct + incorrect,
      name: slot.graphLabel,
    };
  });

  const hourWise = {
    Overall: hourSlots.map((slot) => questionDetails.filter((item) => {
      const minute = Number(item.answerAtSeconds ?? 0) / 60;
      return item.answered && minute >= slot.start && minute < slot.end;
    }).length),
    Correct: hourSlots.map((slot) => questionDetails.filter((item) => {
      const minute = Number(item.answerAtSeconds ?? 0) / 60;
      return item.correct && minute >= slot.start && minute < slot.end;
    }).length),
    Incorrect: hourSlots.map((slot) => questionDetails.filter((item) => {
      const minute = Number(item.answerAtSeconds ?? 0) / 60;
      return item.answered && !item.correct && minute >= slot.start && minute < slot.end;
    }).length),
  };

  const difficultyRows = ["Overall", ...subjectOrder].reduce<Record<string, { level: string; correct: number; wrong: number; notAttempted: number; total: number }[]>>((acc, subject) => {
    const rows = subject === "Overall" ? questionDetails : questionDetails.filter((item) => item.subject === subject);
    acc[subject] = ["Easy", "Moderate", "Tough"].map((level) => {
      const levelRows = rows.filter((item) => item.difficulty === level);
      return {
        level,
        correct: levelRows.filter((item) => item.correct).length,
        wrong: levelRows.filter((item) => item.answered && !item.correct).length,
        notAttempted: levelRows.filter((item) => !item.answered).length,
        total: levelRows.length,
      };
    });
    return acc;
  }, {});

  const qualityOfTimeTabs = ["Overall", ...subjectOrder];
  const qualityOfTimeData = qualityOfTimeTabs.reduce<Record<string, { correct: number; correctPct: number; incorrect: number; incorrectPct: number; unattempted: number; unattemptedPct: number; total: number }>>((acc, subject) => {
    const rows = subject === "Overall" ? questionDetails : questionDetails.filter((item) => item.subject === subject);
    const correct = round(rows.filter((item) => item.correct).reduce((sum, item) => sum + item.timeSpentSeconds, 0) / 60, 2);
    const incorrect = round(rows.filter((item) => item.answered && !item.correct).reduce((sum, item) => sum + item.timeSpentSeconds, 0) / 60, 2);
    const unattempted = round(rows.filter((item) => !item.answered).reduce((sum, item) => sum + item.timeSpentSeconds, 0) / 60, 2);
    const total = round(correct + incorrect + unattempted, 2);
    acc[subject] = {
      correct,
      correctPct: total > 0 ? round((correct / total) * 100, 1) : 0,
      incorrect,
      incorrectPct: total > 0 ? round((incorrect / total) * 100, 1) : 0,
      unattempted,
      unattemptedPct: total > 0 ? round((unattempted / total) * 100, 1) : 0,
      total,
    };
    return acc;
  }, {});

  const subjectChart = subjectRows
    .filter((row) => row.subject !== "Overall")
    .map((row, index) => ({
      name: row.subject,
      time: round(row.timeSpentSeconds / 60, 2),
      color: subjectColor(row.subject, index + 1),
    }));

  const sectionsBySubject = new Map<string, Map<string, any[]>>();
  for (const item of questionDetails) {
    if (!sectionsBySubject.has(item.subject)) sectionsBySubject.set(item.subject, new Map<string, any[]>());
    const groupMap = sectionsBySubject.get(item.subject)!;
    const groupLabel = item.sectionTitle || item.subject;
    if (!groupMap.has(groupLabel)) groupMap.set(groupLabel, []);
    groupMap.get(groupLabel)!.push(item);
  }

  const qsByQsSubjects = Array.from(sectionsBySubject.entries()).map(([subject, groupMap], index) => ({
    name: subject,
    icon: subjectIconKey(subject, index + 1),
    color: subjectColor(subject, index + 1),
    sections: Array.from(groupMap.entries()).map(([label, rows]) => ({
      label,
      questions: rows.map((item) => ({
        no: item.order,
        status: item.qStatus,
        quality: item.quality,
      })),
    })),
  }));

  const completeBreakdown = questionDetails.map((item) => ({
    qNo: item.order,
    subject: item.subject,
    chapter: item.chapter,
    topic: item.topic,
    difficulty: item.difficulty,
    timeSpent: formatDuration(item.timeSpentSeconds),
    status: item.answered ? "Answered" : "Not Attempted",
    evaluation: item.correct ? "correct" : item.answered ? "wrong" : "notAttempted",
    overview: item.quality ? titleCase(item.quality) : null,
  }));

  let subjectMovementData: { subject: string; icon: string; label: string; qsAttempted: number; timeSpent: string }[] = [];
  const openEvents = interactionLog.filter((entry) => entry.action === "open");
  if (openEvents.length > 0 && firstLogAt > 0) {
    const normalized = openEvents.map((entry) => ({
      questionId: Number(entry.questionId),
      sectionLabel: String(entry.sectionLabel || ""),
      atSeconds: Math.max(0, Math.round((Number(entry.at ?? 0) - firstLogAt) / 1000)),
    }));
    const segments: { label: string; icon: string; startSeconds: number; endSeconds: number; questionIds: Set<number> }[] = [];
    normalized.forEach((entry, index) => {
      const next = normalized[index + 1];
      const label = entry.sectionLabel || questionDetails.find((item) => item.id === entry.questionId)?.subject || "General";
      const icon = subjectIconKey(label, index + 1);
      const last = segments[segments.length - 1];
      if (last && last.label === label) {
        last.endSeconds = next ? next.atSeconds : Math.max(totalTimeSeconds, entry.atSeconds);
        last.questionIds.add(entry.questionId);
      } else {
        segments.push({
          label,
          icon,
          startSeconds: entry.atSeconds,
          endSeconds: next ? next.atSeconds : Math.max(totalTimeSeconds, entry.atSeconds),
          questionIds: new Set([entry.questionId]),
        });
      }
    });
    subjectMovementData = segments.map((segment) => ({
      subject: segment.label,
      icon: segment.icon,
      label: segment.label,
      qsAttempted: Array.from(segment.questionIds).filter((questionId) => {
        const detail = questionDetails.find((item) => item.id === questionId);
        return detail?.answered;
      }).length,
      timeSpent: formatDuration(Math.max(0, segment.endSeconds - segment.startSeconds)),
    }));
  } else {
    subjectMovementData = subjectRows
      .filter((row) => row.subject !== "Overall")
      .map((row, index) => ({
        subject: row.subject,
        icon: subjectIconKey(row.subject, index + 1),
        label: row.subject,
        qsAttempted: row.attemptedCorrect + row.attemptedWrong,
        timeSpent: formatDuration(row.timeSpentSeconds),
      }));
  }

  const summary = {
    score,
    totalPoints: maxScore,
    percentage: round(Number(submission.percentage ?? percent(score, maxScore, 2)), 2),
    passed: Boolean(submission.passed),
    submittedAt: submission.submittedAt,
    totalTimeSeconds,
    totalTimeMinutes: round(totalTimeSeconds / 60, 2),
    correctCount,
    wrongCount,
    skippedCount,
    notVisitedCount,
    answeredCount,
    flaggedCount: flaggedSet.size,
    accuracy: answeredCount > 0 ? round((correctCount / answeredCount) * 100, 2) : 0,
    positiveScore,
    marksLost: round(Math.max(0, positiveScore - score), 2),
  };

  return {
    summary,
    questionDetails,
    subjectRows,
    subjectOrder,
    difficultyRows,
    qualityOfTimeData,
    qualityOfTimeTabs,
    subjectChart,
    journey,
    journeySummary,
    hourWise,
    qsByQsSubjects,
    completeBreakdown,
    subjectMovementData,
  };
}

function aggregateProfiles(profiles: any[], selector: (profile: any) => number) {
  return aggregateNumbers(profiles.map(selector));
}

function pickGroup(sortedProfiles: any[], fraction: number) {
  if (sortedProfiles.length === 0) return [];
  return sortedProfiles.slice(0, Math.max(1, Math.ceil(sortedProfiles.length * fraction)));
}

function averageSubjectRows(profiles: any[], subjects: string[]) {
  return ["Overall", ...subjects].map((subject, index) => {
    const rows = profiles.map((profile) => profile.subjectRows.find((row: any) => row.subject === subject)).filter(Boolean);
    return {
      subject,
      icon: subject === "Overall" ? "overall" : subjectIconKey(subject, index + 1),
      score: round(aggregateNumbers(rows.map((row: any) => Number(row.totalScore ?? 0))), 2),
      maxScore: round(aggregateNumbers(rows.map((row: any) => Number(row.maxTotalScore ?? 0))), 2),
      accuracy: round(aggregateNumbers(rows.map((row: any) => Number(row.accuracy ?? 0))), 2),
      attemptedCorrect: round(aggregateNumbers(rows.map((row: any) => Number(row.attemptedCorrect ?? 0))), 2),
      totalQs: round(aggregateNumbers(rows.map((row: any) => Number(row.totalQs ?? 0))), 2),
      attemptedWrong: round(aggregateNumbers(rows.map((row: any) => Number(row.attemptedWrong ?? 0))), 2),
      notAttempted: round(aggregateNumbers(rows.map((row: any) => Number(row.notAttempted ?? 0))), 2),
      notVisited: round(aggregateNumbers(rows.map((row: any) => Number(row.notVisited ?? 0))), 2),
      perfect: round(aggregateNumbers(rows.map((row: any) => Number(row.perfect ?? 0))), 2),
      wasted: round(aggregateNumbers(rows.map((row: any) => Number(row.wasted ?? 0))), 2),
      overtime: round(aggregateNumbers(rows.map((row: any) => Number(row.overtime ?? 0))), 2),
      confused: round(aggregateNumbers(rows.map((row: any) => Number(row.confused ?? 0))), 2),
      timeMins: round(aggregateNumbers(rows.map((row: any) => Number(row.timeSpentSeconds ?? 0) / 60)), 2),
      qsPct: round(aggregateNumbers(rows.map((row: any) => percent(Number(row.attemptedCorrect ?? 0) + Number(row.attemptedWrong ?? 0), Number(row.totalQs ?? 0), 0))), 0),
    };
  });
}

export function buildAdvancedAnalysis({
  test,
  sections,
  questions,
  submission,
  latestSubmissions,
  studentId,
  gradeQuestion,
  hasAnsweredQuestion,
}: {
  test: any;
  sections: any[];
  questions: any[];
  submission: any;
  latestSubmissions: any[];
  studentId: number;
  gradeQuestion: GradeQuestionFn;
  hasAnsweredQuestion: HasAnsweredQuestionFn;
}) {
  const currentProfile = buildSubmissionProfile({
    test,
    sections,
    questions,
    submission,
    gradeQuestion,
    hasAnsweredQuestion,
  });

  const profiles = latestSubmissions.map((row) => ({
    studentId: row.studentId,
    submission: row,
    profile: buildSubmissionProfile({
      test,
      sections,
      questions,
      submission: row,
      gradeQuestion,
      hasAnsweredQuestion,
    }),
  }));

  const sortedProfiles = [...profiles].sort((a, b) => Number(b.submission.percentage ?? 0) - Number(a.submission.percentage ?? 0));
  const rank = Math.max(1, sortedProfiles.findIndex((entry) => entry.studentId === studentId) + 1);
  const totalParticipants = sortedProfiles.length;
  const percentile = totalParticipants <= 1 ? 100 : round(((totalParticipants - rank) / (totalParticipants - 1)) * 100, 1);

  const topperProfile = sortedProfiles[0]?.profile ?? currentProfile;
  const top10Profiles = pickGroup(sortedProfiles, 0.1).map((entry) => entry.profile);
  const top25Profiles = pickGroup(sortedProfiles, 0.25).map((entry) => entry.profile);
  const subjects = currentProfile.subjectOrder;

  const comparativeRows = {
    you: currentProfile,
    topper: topperProfile,
    top10: {
      subjectRows: averageSubjectRows(top10Profiles, subjects),
      summary: {
        ...currentProfile.summary,
        totalTimeMinutes: aggregateProfiles(top10Profiles, (profile) => profile.summary.totalTimeMinutes),
      },
      difficultyRows: ["Overall", ...subjects].reduce<Record<string, any[]>>((acc, subject) => {
        acc[subject] = ["Easy", "Moderate", "Tough"].map((level) => ({
          student: "Top 10%ile",
          icon: "top10",
          correct: round(aggregateNumbers(top10Profiles.map((profile) => profile.difficultyRows[subject]?.find((row: any) => row.level === level)?.correct ?? 0)), 2),
          wrong: round(aggregateNumbers(top10Profiles.map((profile) => profile.difficultyRows[subject]?.find((row: any) => row.level === level)?.wrong ?? 0)), 2),
          notAttempted: round(aggregateNumbers(top10Profiles.map((profile) => profile.difficultyRows[subject]?.find((row: any) => row.level === level)?.notAttempted ?? 0)), 2),
        }));
        return acc;
      }, {}),
      hourWise: {
        Overall: hourWiseAverage(top10Profiles, "Overall"),
        Correct: hourWiseAverage(top10Profiles, "Correct"),
        Incorrect: hourWiseAverage(top10Profiles, "Incorrect"),
      },
    },
    top25: {
      subjectRows: averageSubjectRows(top25Profiles, subjects),
      summary: {
        ...currentProfile.summary,
        totalTimeMinutes: aggregateProfiles(top25Profiles, (profile) => profile.summary.totalTimeMinutes),
      },
      difficultyRows: ["Overall", ...subjects].reduce<Record<string, any[]>>((acc, subject) => {
        acc[subject] = ["Easy", "Moderate", "Tough"].map((level) => ({
          student: "Top 25%ile",
          icon: "top25",
          correct: round(aggregateNumbers(top25Profiles.map((profile) => profile.difficultyRows[subject]?.find((row: any) => row.level === level)?.correct ?? 0)), 2),
          wrong: round(aggregateNumbers(top25Profiles.map((profile) => profile.difficultyRows[subject]?.find((row: any) => row.level === level)?.wrong ?? 0)), 2),
          notAttempted: round(aggregateNumbers(top25Profiles.map((profile) => profile.difficultyRows[subject]?.find((row: any) => row.level === level)?.notAttempted ?? 0)), 2),
        }));
        return acc;
      }, {}),
      hourWise: {
        Overall: hourWiseAverage(top25Profiles, "Overall"),
        Correct: hourWiseAverage(top25Profiles, "Correct"),
        Incorrect: hourWiseAverage(top25Profiles, "Incorrect"),
      },
    },
  };

  const performanceBreakdown = currentProfile.subjectRows.map((row: any) => ({
    subject: row.subject,
    icon: row.icon,
    totalScore: row.totalScore,
    maxTotalScore: row.maxTotalScore,
    attemptedCorrect: row.attemptedCorrect,
    totalQs: row.totalQs,
    attemptedWrong: row.attemptedWrong,
    notAttempted: row.notAttempted,
    notVisited: row.notVisited,
  }));

  const subjectSummaryList = currentProfile.subjectRows
    .filter((row: any) => row.subject !== "Overall")
    .map((row: any, index: number) => ({
      key: `${index + 1}`,
      name: row.subject,
      score: row.totalScore,
      max: row.maxTotalScore,
      percentile: totalParticipants > 0 ? percentile : 0,
      color: subjectColor(row.subject, index + 1),
    }));

  const testData = {
    testName: test.title,
    overallScore: currentProfile.summary.score,
    maxScore: currentProfile.summary.totalPoints,
    subjectsList: subjectSummaryList,
    predictedPercentile: percentile,
    leaderboardRank: rank,
    totalParticipants,
    questionsAttempted: currentProfile.summary.answeredCount,
    totalQuestions: questions.length,
    accuracy: currentProfile.summary.accuracy,
    positiveScore: currentProfile.summary.positiveScore,
    marksLost: currentProfile.summary.marksLost,
    timeTaken: round(currentProfile.summary.totalTimeSeconds / 60, 0),
    performanceBreakdown,
  };

  const timeData = {
    breakdown: currentProfile.subjectRows.map((row: any) => ({
      subject: row.subject,
      icon: row.icon,
      timeSpent: round(row.timeSpentSeconds / 60, 2),
      qsAttempted: row.attemptedCorrect + row.attemptedWrong,
      totalQs: row.totalQs,
      accuracy: row.accuracy,
    })),
    subjectChart: currentProfile.subjectChart,
    qualityOfTime: {
      tabs: currentProfile.qualityOfTimeTabs,
      data: currentProfile.qualityOfTimeData,
    },
    journey: currentProfile.journeySummary.map((row: any) => ({
      interval: row.interval,
      correct: row.correct,
      incorrect: row.incorrect,
      overall: row.overall,
    })),
    graphicalAttempts: currentProfile.journeySummary.map((row: any) => ({
      name: row.name,
      correct: row.correct,
      incorrect: row.incorrect,
      overall: row.overall,
    })),
  };

  const attemptCategories = [
    { key: "perfect", label: "Perfect Attempt", color: "#22c55e", desc: "Correct attempt solved in time", icon: "check" },
    { key: "wasted", label: "Wasted Attempt", color: "#ef4444", desc: "Incorrect attempt solved quickly", icon: "x" },
    { key: "overtime", label: "Overtime Attempt", color: "#f97316", desc: "Spent more than the allotted time", icon: "clock" },
    { key: "confused", label: "Confused Attempt", color: "#6366f1", desc: "Unattempted or unresolved after extra time", icon: "confused" },
  ];

  const attemptData = {
    categories: attemptCategories,
    summary: currentProfile.subjectRows.map((row: any) => ({
      subject: row.subject,
      icon: row.icon,
      perfect: row.perfect,
      wasted: row.wasted,
      overtime: row.overtime,
      confused: row.confused,
    })),
    chartData: currentProfile.subjectRows
      .filter((row: any) => row.subject !== "Overall")
      .map((row: any) => ({
        name: row.subject,
        perfect: row.perfect,
        wasted: row.wasted,
        overtime: row.overtime,
        confused: row.confused,
      })),
  };

  const difficultyTabs = ["Overall", ...subjects];
  const difficultyData = {
    tabs: difficultyTabs,
    analysis: currentProfile.difficultyRows,
  };

  const performanceComparison = (subject: string, groupKey: "top10" | "top25", label: string, icon: "top10" | "top25") => {
    const row = comparativeRows[groupKey].subjectRows.find((item: any) => item.subject === subject);
    return {
      student: label,
      icon,
      score: round(Number(row?.score ?? 0), 2),
      maxScore: round(Number(row?.maxScore ?? 0), 2),
      accuracy: round(Number(row?.accuracy ?? 0), 2),
    };
  };

  const breakdownComparison = (subject: string, groupKey: "top10" | "top25", label: string, icon: "top10" | "top25") => {
    const row = comparativeRows[groupKey].subjectRows.find((item: any) => item.subject === subject);
    return {
      student: label,
      icon,
      attemptedCorrect: round(Number(row?.attemptedCorrect ?? 0), 2),
      totalQs: round(Number(row?.totalQs ?? 0), 2),
      attemptedWrong: round(Number(row?.attemptedWrong ?? 0), 2),
      notAttempted: round(Number(row?.notAttempted ?? 0), 2),
      notVisited: round(Number(row?.notVisited ?? 0), 2),
    };
  };

  const comparativeData = {
    tabs: difficultyTabs,
    performance: Object.fromEntries(difficultyTabs.map((subject) => [
      subject,
      [
        {
          student: "You",
          icon: "user",
          score: performanceBreakdown.find((row: any) => row.subject === subject)?.totalScore ?? 0,
          maxScore: performanceBreakdown.find((row: any) => row.subject === subject)?.maxTotalScore ?? 0,
          accuracy: currentProfile.subjectRows.find((row: any) => row.subject === subject)?.accuracy ?? 0,
        },
        {
          student: "Topper",
          icon: "top10",
          score: topperProfile.subjectRows.find((row: any) => row.subject === subject)?.totalScore ?? 0,
          maxScore: topperProfile.subjectRows.find((row: any) => row.subject === subject)?.maxTotalScore ?? 0,
          accuracy: topperProfile.subjectRows.find((row: any) => row.subject === subject)?.accuracy ?? 0,
        },
        performanceComparison(subject, "top10", "Top 10%ile", "top10"),
        performanceComparison(subject, "top25", "Top 25%ile", "top25"),
      ],
    ])),
    breakdown: Object.fromEntries(difficultyTabs.map((subject) => [
      subject,
      [
        {
          student: "You",
          icon: "user",
          attemptedCorrect: performanceBreakdown.find((row: any) => row.subject === subject)?.attemptedCorrect ?? 0,
          totalQs: performanceBreakdown.find((row: any) => row.subject === subject)?.totalQs ?? 0,
          attemptedWrong: performanceBreakdown.find((row: any) => row.subject === subject)?.attemptedWrong ?? 0,
          notAttempted: performanceBreakdown.find((row: any) => row.subject === subject)?.notAttempted ?? 0,
          notVisited: performanceBreakdown.find((row: any) => row.subject === subject)?.notVisited ?? 0,
        },
        {
          student: "Topper",
          icon: "top10",
          attemptedCorrect: topperProfile.subjectRows.find((row: any) => row.subject === subject)?.attemptedCorrect ?? 0,
          totalQs: topperProfile.subjectRows.find((row: any) => row.subject === subject)?.totalQs ?? 0,
          attemptedWrong: topperProfile.subjectRows.find((row: any) => row.subject === subject)?.attemptedWrong ?? 0,
          notAttempted: topperProfile.subjectRows.find((row: any) => row.subject === subject)?.notAttempted ?? 0,
          notVisited: topperProfile.subjectRows.find((row: any) => row.subject === subject)?.notVisited ?? 0,
        },
        breakdownComparison(subject, "top10", "Top 10%ile", "top10"),
        breakdownComparison(subject, "top25", "Top 25%ile", "top25"),
      ],
    ])),
  };

  const comparativeAttemptData = {
    tabs: difficultyTabs,
    tabular: Object.fromEntries(difficultyTabs.map((subject) => [
      subject,
      [
        attemptSummaryRow("You", "user", currentProfile.subjectRows.find((row: any) => row.subject === subject)),
        attemptSummaryRow("Topper", "top10", topperProfile.subjectRows.find((row: any) => row.subject === subject)),
        attemptSummaryRow("Top 10%ile", "top10", comparativeRows.top10.subjectRows.find((row: any) => row.subject === subject)),
        attemptSummaryRow("Top 25%ile", "top25", comparativeRows.top25.subjectRows.find((row: any) => row.subject === subject)),
      ],
    ])),
    graphical: Object.fromEntries(difficultyTabs.map((subject) => [
      subject,
      ["Perfect", "Wasted", "Overtime", "Confused"].map((category) => ({
        category,
        you: attemptValue(currentProfile.subjectRows.find((row: any) => row.subject === subject), category),
        topper: attemptValue(topperProfile.subjectRows.find((row: any) => row.subject === subject), category),
        top10: attemptValue(comparativeRows.top10.subjectRows.find((row: any) => row.subject === subject), category),
        top25: attemptValue(comparativeRows.top25.subjectRows.find((row: any) => row.subject === subject), category),
      })),
    ])),
  };

  const comparativeTimeData = {
    tabs: difficultyTabs,
    breakdown: Object.fromEntries(difficultyTabs.map((subject) => [
      subject,
      [
        timeBreakdownRow("You", "user", currentProfile.subjectRows.find((row: any) => row.subject === subject)),
        timeBreakdownRow("Topper", "top10", topperProfile.subjectRows.find((row: any) => row.subject === subject)),
        timeBreakdownRow("Top 10%ile", "top10", comparativeRows.top10.subjectRows.find((row: any) => row.subject === subject)),
        timeBreakdownRow("Top 25%ile", "top25", comparativeRows.top25.subjectRows.find((row: any) => row.subject === subject)),
      ],
    ])),
    hourWise: {
      tabs: ["Overall", "Correct", "Incorrect"],
      data: {
        Overall: hourWiseRows("Overall", currentProfile, topperProfile, comparativeRows.top10.hourWise.Overall, comparativeRows.top25.hourWise.Overall),
        Correct: hourWiseRows("Correct", currentProfile, topperProfile, comparativeRows.top10.hourWise.Correct, comparativeRows.top25.hourWise.Correct),
        Incorrect: hourWiseRows("Incorrect", currentProfile, topperProfile, comparativeRows.top10.hourWise.Incorrect, comparativeRows.top25.hourWise.Incorrect),
      },
    },
    graphical: {
      tabs: ["Correct", "Incorrect"],
      data: {
        Correct: graphicalHourRows("Correct", hourSlots, currentProfile, topperProfile, comparativeRows.top10.hourWise.Correct, comparativeRows.top25.hourWise.Correct),
        Incorrect: graphicalHourRows("Incorrect", hourSlots, currentProfile, topperProfile, comparativeRows.top10.hourWise.Incorrect, comparativeRows.top25.hourWise.Incorrect),
      },
    },
  };

  const comparativeDifficultyData = {
    tabs: difficultyTabs,
    levels: ["Easy", "Moderate", "Tough"].map((level) => ({
      level,
      totals: Object.fromEntries(difficultyTabs.map((subject) => [subject, currentProfile.difficultyRows[subject]?.find((row: any) => row.level === level)?.total ?? 0])),
      rows: Object.fromEntries(difficultyTabs.map((subject) => [
        subject,
        [
          difficultyRow("You", "user", currentProfile.difficultyRows[subject]?.find((row: any) => row.level === level)),
          difficultyRow("Topper", "top10", topperProfile.difficultyRows[subject]?.find((row: any) => row.level === level)),
          difficultyRow("Top 10%ile", "top10", comparativeRows.top10.difficultyRows[subject]?.find((row: any) => row.level === level)),
          difficultyRow("Top 25%ile", "top25", comparativeRows.top25.difficultyRows[subject]?.find((row: any) => row.level === level)),
        ],
      ])),
    })),
  };

  const weakQuestions = currentProfile.questionDetails.filter((item: any) => !item.correct && item.answered).slice(0, 5);
  const hardQuestions = currentProfile.questionDetails.filter((item: any) => item.difficulty === "Tough" && !item.correct).slice(0, 5);
  const timeHogs = [...currentProfile.questionDetails].sort((a: any, b: any) => b.timeSpentSeconds - a.timeSpentSeconds).slice(0, 5);
  const fasterThanClass = profiles.filter((entry) => entry.studentId !== studentId).length
    ? currentProfile.questionDetails.filter((item: any) => {
        const peers = profiles
          .filter((entry) => entry.studentId !== studentId)
          .map((entry) => entry.profile.questionDetails.find((row: any) => row.id === item.id)?.timeSpentSeconds ?? 0)
          .filter((value) => value > 0);
        return peers.length > 0 && item.timeSpentSeconds > 0 && item.timeSpentSeconds < aggregateNumbers(peers) * 0.8;
      }).length
    : 0;
  const slowerThanClass = profiles.filter((entry) => entry.studentId !== studentId).length
    ? currentProfile.questionDetails.filter((item: any) => {
        const peers = profiles
          .filter((entry) => entry.studentId !== studentId)
          .map((entry) => entry.profile.questionDetails.find((row: any) => row.id === item.id)?.timeSpentSeconds ?? 0)
          .filter((value) => value > 0);
        return peers.length > 0 && item.timeSpentSeconds > 0 && item.timeSpentSeconds > aggregateNumbers(peers) * 1.25;
      }).length
    : 0;

  const perQuestion = currentProfile.questionDetails.map((item: any) => ({
    id: item.id,
    order: item.order,
    question: item.question.question,
    questionType: item.question.questionType ?? "mcq",
    options: safeJsonParse<string[]>(item.question.options, []),
    optionImages: safeJsonParse<(string | null)[]>(item.question.optionImages, []),
    imageData: item.question.imageData ?? null,
    points: item.points,
    negativeMarks: item.negativeMarks,
    correctAnswer: item.question.correctAnswer,
    correctAnswerMulti: safeJsonParse<number[]>(item.question.correctAnswerMulti, []),
    correctAnswerMin: item.question.correctAnswerMin ?? null,
    correctAnswerMax: item.question.correctAnswerMax ?? null,
    myAnswer: item.answer ?? null,
    isCorrect: item.correct,
    isSkipped: !item.answered,
    isFlagged: item.flagged,
    myTime: item.timeSpentSeconds,
    classSuccessRate: round(aggregateNumbers(profiles.map((entry) => {
      const peer = entry.profile.questionDetails.find((row: any) => row.id === item.id);
      return peer?.correct ? 100 : 0;
    })), 0),
    classAvgTime: round(aggregateNumbers(profiles.map((entry) => entry.profile.questionDetails.find((row: any) => row.id === item.id)?.timeSpentSeconds ?? 0)), 0),
    timeVsClass: 0,
    difficulty: item.difficulty,
    subject: item.subject,
    topic: item.topic,
  }));

  return {
    test: {
      ...test,
      totalQuestions: questions.length,
      totalSections: sections.length,
    },
    submission: {
      id: submission.id,
      score: currentProfile.summary.score,
      totalPoints: currentProfile.summary.totalPoints,
      percentage: currentProfile.summary.percentage,
      passed: currentProfile.summary.passed,
      submittedAt: submission.submittedAt,
      totalTime: currentProfile.summary.totalTimeSeconds,
      correctCount: currentProfile.summary.correctCount,
      wrongCount: currentProfile.summary.wrongCount,
      skippedCount: currentProfile.summary.skippedCount,
      flaggedCount: currentProfile.summary.flaggedCount,
    },
    classStats: {
      totalSubs: totalParticipants,
      classAvg: round(aggregateNumbers(sortedProfiles.map((entry) => Number(entry.submission.percentage ?? 0))), 0),
      classPassRate: round(percent(sortedProfiles.filter((entry) => entry.submission.passed).length, totalParticipants, 0), 0),
      rank,
      percentile,
    },
    perQuestion,
    insights: { weakQuestions, hardQuestions, timeHogs, fasterThanClass, slowerThanClass },
    datasets: {
      testData,
      timeData,
      attemptData,
      difficultyData,
      comparativeData,
      comparativeAttemptData,
      comparativeTimeData,
      comparativeDifficultyData,
      qsByQsData: qsByQsSubjects,
      questionJourneyData: currentProfile.journey,
      completeBreakdownData: currentProfile.completeBreakdown,
      subjectMovementData: currentProfile.subjectMovementData,
    },
  };
}

function attemptSummaryRow(label: string, icon: string, row: any) {
  return {
    student: label,
    icon,
    perfect: round(Number(row?.perfect ?? 0), 2),
    wasted: round(Number(row?.wasted ?? 0), 2),
    overtime: round(Number(row?.overtime ?? 0), 2),
    confused: round(Number(row?.confused ?? 0), 2),
  };
}

function attemptValue(row: any, category: string) {
  if (!row) return 0;
  if (category === "Perfect") return round(Number(row.perfect ?? 0), 2);
  if (category === "Wasted") return round(Number(row.wasted ?? 0), 2);
  if (category === "Overtime") return round(Number(row.overtime ?? 0), 2);
  return round(Number(row.confused ?? 0), 2);
}

function timeBreakdownRow(label: string, icon: string, row: any) {
  return {
    student: label,
    icon,
    timeMins: round(Number(row?.timeMins ?? 0), 2),
    qsPct: round(Number(row?.qsPct ?? 0), 0),
    accuracy: round(Number(row?.accuracy ?? 0), 2),
  };
}

function hourWiseAverage(profiles: any[], key: "Overall" | "Correct" | "Incorrect") {
  return range(3).map((index) => round(aggregateNumbers(profiles.map((profile) => Number(profile.hourWise[key][index] ?? 0))), 2));
}

function hourWiseRows(
  key: "Overall" | "Correct" | "Incorrect",
  currentProfile: any,
  topperProfile: any,
  top10Averages: number[],
  top25Averages: number[],
) {
  return [
    {
      student: "You",
      icon: "user",
      hour1: currentProfile.hourWise[key][0] ?? 0,
      hour2: currentProfile.hourWise[key][1] ?? 0,
      hour3: currentProfile.hourWise[key][2] ?? 0,
    },
    {
      student: "Topper",
      icon: "top10",
      hour1: topperProfile.hourWise[key][0] ?? 0,
      hour2: topperProfile.hourWise[key][1] ?? 0,
      hour3: topperProfile.hourWise[key][2] ?? 0,
    },
    {
      student: "Top 10%ile",
      icon: "top10",
      hour1: top10Averages[0] ?? 0,
      hour2: top10Averages[1] ?? 0,
      hour3: top10Averages[2] ?? 0,
    },
    {
      student: "Top 25%ile",
      icon: "top25",
      hour1: top25Averages[0] ?? 0,
      hour2: top25Averages[1] ?? 0,
      hour3: top25Averages[2] ?? 0,
    },
  ];
}

function graphicalHourRows(
  key: "Correct" | "Incorrect",
  hourSlots: { graphLabel: string }[],
  currentProfile: any,
  topperProfile: any,
  top10Averages: number[],
  top25Averages: number[],
) {
  return hourSlots.map((slot, index) => ({
    hour: index === 0 ? "1st Hour" : index === 1 ? "2nd Hour" : "3rd Hour",
    you: currentProfile.hourWise[key][index] ?? 0,
    topper: topperProfile.hourWise[key][index] ?? 0,
    top10: top10Averages[index] ?? 0,
    top25: top25Averages[index] ?? 0,
    label: slot.graphLabel,
  }));
}

function difficultyRow(label: string, icon: string, row: any) {
  return {
    student: label,
    icon,
    correct: round(Number(row?.correct ?? 0), 2),
    wrong: round(Number(row?.wrong ?? 0), 2),
    notAttempted: round(Number(row?.notAttempted ?? 0), 2),
  };
}
