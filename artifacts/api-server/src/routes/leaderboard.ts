import { Router, type IRouter } from "express";
import { db, testSubmissionsTable, usersTable, testsTable, enrollmentsTable, classesTable, assignmentSubmissionsTable, assignmentsTable, attendanceTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

const router: IRouter = Router();

function getUser(req: any) {
  const userId = req.cookies?.userId ? parseInt(req.cookies.userId, 10) : null;
  const userRole = req.cookies?.userRole ?? null;
  return { userId, userRole };
}

function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function countAnsweredQuestions(answers: unknown) {
  const parsed = parseJsonValue<Record<string, unknown>>(answers, {});
  return Object.values(parsed).filter((value) => {
    if (Array.isArray(value)) return value.length > 0;
    return value !== null && value !== undefined && value !== "";
  }).length;
}

router.get("/leaderboard", async (req, res): Promise<void> => {
  const { userId, userRole } = getUser(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { classId } = req.query as { classId?: string };

  let studentIds: number[] = [];
  if (classId) {
    const enrollments = await db.select().from(enrollmentsTable).where(eq(enrollmentsTable.classId, parseInt(classId)));
    studentIds = enrollments.map((e) => e.studentId);
  } else {
    const students = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "student"));
    studentIds = students.map((s) => s.id);
  }

  if (studentIds.length === 0) { res.json([]); return; }

  const [students, allSubs, allAssignSubs, allAttendance] = await Promise.all([
    db.select({ id: usersTable.id, fullName: usersTable.fullName, username: usersTable.username })
      .from(usersTable)
      .where(inArray(usersTable.id, studentIds)),
    db.select().from(testSubmissionsTable).where(inArray(testSubmissionsTable.studentId, studentIds)),
    db.select().from(assignmentSubmissionsTable).where(inArray(assignmentSubmissionsTable.studentId, studentIds)),
    db.select().from(attendanceTable).where(inArray(attendanceTable.studentId, studentIds)),
  ]);

  const leaderboard = students.map((student) => {
    const subs = allSubs.filter((s) => s.studentId === student.id);
    const testScore = subs.reduce((sum, s) => sum + (s.score ?? 0), 0);
    const maxPossible = subs.reduce((sum, s) => sum + (s.totalMarks ?? 0), 0);
    const avgTestPct = maxPossible > 0 ? Math.round((testScore / maxPossible) * 100) : 0;

    const assignSubs = allAssignSubs.filter((s) => s.studentId === student.id);
    const gradedAssigns = assignSubs.filter((s) => s.grade !== null);
    const avgGrade = gradedAssigns.length > 0
      ? Math.round(gradedAssigns.reduce((sum, s) => sum + (s.grade ?? 0), 0) / gradedAssigns.length)
      : 0;

    const attendance = allAttendance.filter((a) => a.studentId === student.id);
    const attPct = attendance.length > 0
      ? Math.round((attendance.filter((a) => a.status === "present").length / attendance.length) * 100)
      : 0;

    const testsCount = subs.length;
    const assignmentsCount = assignSubs.length;

    const points = (avgTestPct * 0.5) + (avgGrade * 0.3) + (attPct * 0.2);

    return {
      id: student.id,
      fullName: student.fullName,
      username: student.username,
      points: Math.round(points),
      avgTestScore: avgTestPct,
      avgAssignmentGrade: avgGrade,
      attendancePercentage: attPct,
      testsCompleted: testsCount,
      assignmentsSubmitted: assignmentsCount,
    };
  });

  leaderboard.sort((a, b) => b.points - a.points);
  const ranked = leaderboard.map((s, i) => ({ ...s, rank: i + 1 }));

  res.json(ranked);
});

router.get("/progress/:studentId", async (req, res): Promise<void> => {
  const { userId, userRole } = getUser(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const studentId = parseInt(req.params.studentId);
  if (userRole === "student" && studentId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const [testSubs, assignSubs, attendanceRows, enrollments] = await Promise.all([
    db.select({
      id: testSubmissionsTable.id,
      testId: testSubmissionsTable.testId,
      score: testSubmissionsTable.score,
      totalMarks: testSubmissionsTable.totalPoints,
      percentage: testSubmissionsTable.percentage,
      answers: testSubmissionsTable.answers,
      submittedAt: testSubmissionsTable.submittedAt,
      testTitle: testsTable.title,
      classId: testsTable.classId,
    }).from(testSubmissionsTable)
      .leftJoin(testsTable, eq(testSubmissionsTable.testId, testsTable.id))
      .where(eq(testSubmissionsTable.studentId, studentId))
      .orderBy(testSubmissionsTable.submittedAt),
    db.select({
      id: assignmentSubmissionsTable.id,
      assignmentId: assignmentSubmissionsTable.assignmentId,
      grade: assignmentSubmissionsTable.grade,
      submittedAt: assignmentSubmissionsTable.submittedAt,
      gradedAt: assignmentSubmissionsTable.gradedAt,
      title: assignmentsTable.title,
      maxMarks: assignmentsTable.maxMarks,
      classId: assignmentsTable.classId,
    }).from(assignmentSubmissionsTable)
      .leftJoin(assignmentsTable, eq(assignmentSubmissionsTable.assignmentId, assignmentsTable.id))
      .where(eq(assignmentSubmissionsTable.studentId, studentId)),
    db.select({
      id: attendanceTable.id,
      classId: attendanceTable.classId,
      date: attendanceTable.date,
      status: attendanceTable.status,
      className: classesTable.title,
    }).from(attendanceTable)
      .leftJoin(classesTable, eq(attendanceTable.classId, classesTable.id))
      .where(eq(attendanceTable.studentId, studentId)),
    db.select({ classId: enrollmentsTable.classId, className: classesTable.title })
      .from(enrollmentsTable)
      .leftJoin(classesTable, eq(enrollmentsTable.classId, classesTable.id))
      .where(eq(enrollmentsTable.studentId, studentId)),
  ]);

  /* ── Basic summary ── */
  const totalTests = testSubs.length;
  const pctOf = (s: { score: number | null; totalMarks: number | null }) =>
    (s.totalMarks ?? 0) > 0 ? Math.round(((s.score ?? 0) / (s.totalMarks ?? 1)) * 100) : (s as any).percentage ?? 0;

  const avgTestScore = totalTests > 0
    ? Math.round(testSubs.reduce((sum, s) => sum + pctOf(s), 0) / totalTests) : 0;

  const gradedAssigns = assignSubs.filter((s) => s.grade !== null);
  const avgAssignment = gradedAssigns.length > 0
    ? Math.round(gradedAssigns.reduce((sum, s) => sum + (s.grade ?? 0), 0) / gradedAssigns.length) : 0;

  const totalAtt = attendanceRows.length;
  const attPct = totalAtt > 0
    ? Math.round((attendanceRows.filter((a) => a.status === "present").length / totalAtt) * 100) : 0;

  /* ── Composite score + grade letter ── */
  const compositeScore = Math.round(avgTestScore * 0.5 + avgAssignment * 0.3 + attPct * 0.2);
  const gradeLetter = compositeScore >= 90 ? "A" : compositeScore >= 80 ? "B" : compositeScore >= 70 ? "C" : compositeScore >= 60 ? "D" : "F";

  /* ── Grade distribution ── */
  const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const s of testSubs) {
    const pct = pctOf(s);
    if (pct >= 90) gradeDistribution.A++;
    else if (pct >= 80) gradeDistribution.B++;
    else if (pct >= 70) gradeDistribution.C++;
    else if (pct >= 60) gradeDistribution.D++;
    else gradeDistribution.F++;
  }

  /* ── Performance trend (improving / stable / declining) ── */
  const trend = (() => {
    if (testSubs.length < 4) return "stable";
    const scores = testSubs.map(pctOf);
    const half = Math.ceil(scores.length / 2);
    const firstHalf = scores.slice(0, half);
    const lastHalf = scores.slice(scores.length - half);
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const lastAvg = lastHalf.reduce((a, b) => a + b, 0) / lastHalf.length;
    if (lastAvg - firstAvg > 5) return "improving";
    if (firstAvg - lastAvg > 5) return "declining";
    return "stable";
  })();

  /* ── Study streak ── */
  const activeDateSet = new Set<string>();
  for (const t of testSubs) if (t.submittedAt) activeDateSet.add(t.submittedAt.toISOString().slice(0, 10));
  for (const a of assignSubs) if (a.submittedAt) activeDateSet.add(a.submittedAt.toISOString().slice(0, 10));
  for (const a of attendanceRows) if (a.status === "present" && a.date) activeDateSet.add(a.date.slice(0, 10));
  const sortedDates = [...activeDateSet].sort();
  let longestStreak = 0, runStreak = 0;
  for (let i = 0; i < sortedDates.length; i++) {
    if (i === 0) { runStreak = 1; }
    else {
      const prev = new Date(sortedDates[i - 1]).getTime();
      const curr = new Date(sortedDates[i]).getTime();
      runStreak = Math.round((curr - prev) / 86400000) === 1 ? runStreak + 1 : 1;
    }
    longestStreak = Math.max(longestStreak, runStreak);
  }
  const todayStr = new Date().toISOString().slice(0, 10);
  const yestStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const lastActive = sortedDates[sortedDates.length - 1];
  const currentStreak = (lastActive === todayStr || lastActive === yestStr) ? runStreak : 0;

  /* ── Weekly trend ── */
  function isoWeek(d: Date): string {
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const wk = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${String(wk).padStart(2, "0")}`;
  }
  function weekLabel(d: Date): string {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  const weekMap = new Map<string, { label: string; testScores: number[]; assignGrades: number[]; assignCount: number }>();
  for (const t of testSubs) {
    if (!t.submittedAt) continue;
    const d = new Date(t.submittedAt);
    const key = isoWeek(d);
    if (!weekMap.has(key)) weekMap.set(key, { label: weekLabel(d), testScores: [], assignGrades: [], assignCount: 0 });
    weekMap.get(key)!.testScores.push(pctOf(t));
  }
  for (const a of assignSubs) {
    if (!a.submittedAt) continue;
    const d = new Date(a.submittedAt);
    const key = isoWeek(d);
    if (!weekMap.has(key)) weekMap.set(key, { label: weekLabel(d), testScores: [], assignGrades: [], assignCount: 0 });
    const e = weekMap.get(key)!;
    e.assignCount++;
    if (a.grade !== null && a.maxMarks && a.maxMarks > 0) e.assignGrades.push(Math.round((a.grade / a.maxMarks) * 100));
  }
  const weeklyTrend = [...weekMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, v]) => ({
    week, label: v.label,
    avgTestScore: v.testScores.length > 0 ? Math.round(v.testScores.reduce((a, b) => a + b, 0) / v.testScores.length) : null,
    testsCount: v.testScores.length,
    assignmentsCount: v.assignCount,
    avgAssignGrade: v.assignGrades.length > 0 ? Math.round(v.assignGrades.reduce((a, b) => a + b, 0) / v.assignGrades.length) : null,
  }));

  /* ── Monthly attendance trend ── */
  const monthAttMap = new Map<string, { present: number; total: number }>();
  for (const a of attendanceRows) {
    if (!a.date) continue;
    const key = a.date.slice(0, 7); // YYYY-MM
    if (!monthAttMap.has(key)) monthAttMap.set(key, { present: 0, total: 0 });
    const e = monthAttMap.get(key)!;
    e.total++;
    if (a.status === "present") e.present++;
  }
  const monthlyAttendance = [...monthAttMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({
    month,
    label: new Date(month + "-01").toLocaleDateString("en-US", { month: "short", year: "numeric" }),
    attPct: Math.round((v.present / v.total) * 100),
    present: v.present, total: v.total,
  }));

  /* ── Subject breakdown ── */
  const subjectMap = new Map<number, { className: string; testScores: number[]; attPresent: number; attTotal: number; assignGrades: number[]; assignCount: number }>();
  for (const e of enrollments) subjectMap.set(e.classId, { className: e.className ?? "Unknown", testScores: [], attPresent: 0, attTotal: 0, assignGrades: [], assignCount: 0 });
  for (const t of testSubs) {
    if (t.classId == null) continue;
    if (!subjectMap.has(t.classId)) subjectMap.set(t.classId, { className: "Unknown", testScores: [], attPresent: 0, attTotal: 0, assignGrades: [], assignCount: 0 });
    subjectMap.get(t.classId)!.testScores.push(pctOf(t));
  }
  for (const a of attendanceRows) {
    if (!subjectMap.has(a.classId)) subjectMap.set(a.classId, { className: a.className ?? "Unknown", testScores: [], attPresent: 0, attTotal: 0, assignGrades: [], assignCount: 0 });
    const e = subjectMap.get(a.classId)!;
    e.attTotal++;
    if (a.status === "present") e.attPresent++;
  }
  for (const a of assignSubs) {
    if (a.classId == null || !subjectMap.has(a.classId)) continue;
    const e = subjectMap.get(a.classId)!;
    e.assignCount++;
    if (a.grade !== null && a.maxMarks && a.maxMarks > 0) e.assignGrades.push(Math.round((a.grade / a.maxMarks) * 100));
  }
  const subjectBreakdown = [...subjectMap.entries()].map(([classId, v]) => {
    const avgTestScore = v.testScores.length > 0 ? Math.round(v.testScores.reduce((a, b) => a + b, 0) / v.testScores.length) : null;
    const subAttPct = v.attTotal > 0 ? Math.round((v.attPresent / v.attTotal) * 100) : null;
    const avgAssignGrade = v.assignGrades.length > 0 ? Math.round(v.assignGrades.reduce((a, b) => a + b, 0) / v.assignGrades.length) : null;
    const composite = Math.round((avgTestScore ?? 0) * 0.5 + (avgAssignGrade ?? 0) * 0.3 + (subAttPct ?? 0) * 0.2);
    const gl = composite >= 90 ? "A" : composite >= 80 ? "B" : composite >= 70 ? "C" : composite >= 60 ? "D" : "F";
    return { classId, className: v.className, avgTestScore, testCount: v.testScores.length, attPresent: v.attPresent, attTotal: v.attTotal, attPct: subAttPct, assignCount: v.assignCount, avgAssignGrade, gradeLetter: gl, composite };
  });

  /* ── Recommendations ── */
  const recs: { type: string; text: string }[] = [];
  for (const s of subjectBreakdown) {
    if (s.attPct !== null && s.attPct < 75 && s.attTotal > 0) recs.push({ type: "warning", text: `Your attendance in ${s.className} is ${s.attPct}% — aim for 75% or higher.` });
    if (s.avgTestScore !== null && s.avgTestScore < 50 && s.testCount > 0) recs.push({ type: "warning", text: `You're averaging ${s.avgTestScore}% in ${s.className} tests. Review the key concepts.` });
    if (s.avgTestScore !== null && s.avgTestScore >= 80) recs.push({ type: "success", text: `Excellent work in ${s.className}! You're averaging ${s.avgTestScore}%.` });
  }
  if (trend === "improving") recs.push({ type: "success", text: "Your test scores are improving over time. Keep up the momentum!" });
  else if (trend === "declining") recs.push({ type: "warning", text: "Your test scores have been declining recently. Try revisiting past material." });
  if (currentStreak >= 7) recs.push({ type: "success", text: `You have a ${currentStreak}-day study streak! Consistency is the key to mastery.` });
  else if (currentStreak < 3 && sortedDates.length > 0) recs.push({ type: "info", text: "Study a little every day to build a streak and retain information better." });
  if (gradedAssigns.length === 0 && assignSubs.length > 0) recs.push({ type: "info", text: "Some assignments are awaiting grading. Check back soon for your grades." });
  if (testSubs.length === 0 && assignSubs.length === 0) recs.push({ type: "info", text: "No activity recorded yet. Take your first test or submit an assignment to start tracking progress!" });

  res.json({
    summary: {
      enrolledClasses: enrollments.length,
      testsCompleted: totalTests,
      avgTestScore,
      assignmentsSubmitted: assignSubs.length,
      avgAssignmentGrade: avgAssignment,
      attendancePercentage: attPct,
      compositeScore,
      gradeLetter,
      trend,
      streak: { current: currentStreak, longest: longestStreak },
    },
    gradeDistribution,
    weeklyTrend,
    monthlyAttendance,
    subjectBreakdown,
    recommendations: recs,
    tests: testSubs.map((s) => ({
      ...s,
      answeredCount: countAnsweredQuestions(s.answers),
      submittedAt: s.submittedAt?.toISOString() ?? null,
      percentage: pctOf(s),
    })),
    assignments: assignSubs.map((s) => ({
      ...s,
      submittedAt: s.submittedAt?.toISOString() ?? null,
      gradedAt: s.gradedAt?.toISOString() ?? null,
    })),
    attendance: attendanceRows,
    enrollments,
  });
});

export default router;
