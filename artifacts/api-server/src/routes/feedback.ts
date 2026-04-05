import { Router } from "express";
import { db, feedbackTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.post("/", async (req, res) => {
  const userId = req.cookies?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const { classId, rating, comment } = req.body;
  if (!classId || !rating) return res.status(400).json({ error: "classId and rating are required" });
  if (rating < 1 || rating > 5) return res.status(400).json({ error: "Rating must be 1-5" });

  const existing = await db
    .select()
    .from(feedbackTable)
    .where(eq(feedbackTable.classId, classId))
    .then((rows) => rows.find((r) => r.studentId === parseInt(userId)));

  if (existing) return res.status(400).json({ error: "You have already submitted feedback for this class" });

  await db.insert(feedbackTable).values({
    classId: parseInt(classId),
    studentId: parseInt(userId),
    rating: parseInt(rating),
    comment: comment || null,
  });

  res.json({ message: "Feedback submitted successfully" });
});

router.get("/class/:classId", async (req, res) => {
  const userId = req.cookies?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const classId = parseInt(req.params.classId);
  if (isNaN(classId)) return res.status(400).json({ error: "Invalid class ID" });

  const rows = await db
    .select({
      id: feedbackTable.id,
      classId: feedbackTable.classId,
      studentId: feedbackTable.studentId,
      studentName: usersTable.fullName,
      rating: feedbackTable.rating,
      comment: feedbackTable.comment,
      createdAt: feedbackTable.createdAt,
    })
    .from(feedbackTable)
    .leftJoin(usersTable, eq(feedbackTable.studentId, usersTable.id))
    .where(eq(feedbackTable.classId, classId));

  res.json(rows);
});

export { router as feedbackRouter };
