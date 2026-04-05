import { Router, type IRouter } from "express";
import { db, whiteboardsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  GetWhiteboardDataParams,
  SaveWhiteboardDataParams,
  SaveWhiteboardDataBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/whiteboard/:classId", async (req, res): Promise<void> => {
  const params = GetWhiteboardDataParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [board] = await db
    .select()
    .from(whiteboardsTable)
    .where(eq(whiteboardsTable.classId, params.data.classId));

  if (!board) {
    // Return empty board data
    const [created] = await db.insert(whiteboardsTable).values({
      classId: params.data.classId,
      data: "[]",
    }).returning();
    res.json(created);
    return;
  }

  res.json(board);
});

router.post("/whiteboard/:classId", async (req, res): Promise<void> => {
  const params = SaveWhiteboardDataParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = SaveWhiteboardDataBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(whiteboardsTable)
    .where(eq(whiteboardsTable.classId, params.data.classId));

  let board;
  if (existing) {
    const [updated] = await db
      .update(whiteboardsTable)
      .set({ data: body.data.data })
      .where(eq(whiteboardsTable.classId, params.data.classId))
      .returning();
    board = updated;
  } else {
    const [created] = await db.insert(whiteboardsTable).values({
      classId: params.data.classId,
      data: body.data.data,
    }).returning();
    board = created;
  }

  res.json(board);
});

export default router;
