import { Router, type IRouter } from "express";
import { db, testSubmissionsTable, usersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const router: IRouter = Router();

function getUser(req: any) {
  const userId = req.cookies?.userId ? parseInt(req.cookies.userId, 10) : null;
  const userRole = req.cookies?.userRole ?? null;
  return { userId, userRole };
}

router.get("/leaderboard", async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const students = await db
    .select({ id: usersTable.id, fullName: usersTable.fullName, username: usersTable.username })
    .from(usersTable)
    .where(eq(usersTable.role, "student"));

  const studentIds = students.map((student) => student.id);

  if (studentIds.length === 0) { res.json([]); return; }

  const allSubs = await db
    .select()
    .from(testSubmissionsTable)
    .where(inArray(testSubmissionsTable.studentId, studentIds));

  const leaderboard = students.map((student) => {
    const subs = allSubs.filter((s) => s.studentId === student.id);
    const testScore = subs.reduce((sum, s) => sum + (s.score ?? 0), 0);
    const maxPossible = subs.reduce((sum, s) => sum + (s.totalPoints ?? 0), 0);
    const avgTestPct = maxPossible > 0 ? Math.round((testScore / maxPossible) * 100) : 0;

    const testsCount = subs.length;

    return {
      id: student.id,
      fullName: student.fullName,
      username: student.username,
      points: avgTestPct,
      avgTestScore: avgTestPct,
      avgAssignmentGrade: 0,
      attendancePercentage: 0,
      testsCompleted: testsCount,
      assignmentsSubmitted: 0,
    };
  });

  leaderboard.sort((a, b) => b.points - a.points);
  const ranked = leaderboard.map((s, i) => ({ ...s, rank: i + 1 }));

  res.json(ranked);
});

export default router;
