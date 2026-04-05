import { Router } from "express";
import { db, financeRecordsTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

const requireSuperAdmin = async (userId: string, res: any): Promise<boolean> => {
  const user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, parseInt(userId)))
    .then((r) => r[0]);

  if (!user || user.role !== "super_admin") {
    res.status(403).json({ error: "Only super admins can access finance records" });
    return false;
  }
  return true;
};

router.get("/finance", async (req, res) => {
  const userId = req.cookies?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  if (!(await requireSuperAdmin(userId, res))) return;

  const records = await db
    .select({
      id: financeRecordsTable.id,
      type: financeRecordsTable.type,
      category: financeRecordsTable.category,
      amount: financeRecordsTable.amount,
      description: financeRecordsTable.description,
      recordDate: financeRecordsTable.recordDate,
      createdBy: financeRecordsTable.createdBy,
      createdByName: usersTable.fullName,
      createdAt: financeRecordsTable.createdAt,
    })
    .from(financeRecordsTable)
    .leftJoin(usersTable, eq(financeRecordsTable.createdBy, usersTable.id))
    .orderBy(desc(financeRecordsTable.recordDate));

  res.json(records);
});

router.post("/finance", async (req, res) => {
  const userId = req.cookies?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  if (!(await requireSuperAdmin(userId, res))) return;

  const { type, category, amount, description, recordDate } = req.body;
  if (!type || !category || !amount) {
    return res.status(400).json({ error: "type, category and amount are required" });
  }
  if (!["income", "expense"].includes(type)) {
    return res.status(400).json({ error: "type must be income or expense" });
  }
  if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return res.status(400).json({ error: "amount must be a positive number" });
  }

  const [record] = await db
    .insert(financeRecordsTable)
    .values({
      type,
      category,
      amount: amount.toString(),
      description: description ?? null,
      recordDate: recordDate ? new Date(recordDate) : new Date(),
      createdBy: parseInt(userId),
    })
    .returning();

  const author = await db
    .select({ fullName: usersTable.fullName })
    .from(usersTable)
    .where(eq(usersTable.id, parseInt(userId)))
    .then((r) => r[0]);

  res.json({ ...record, createdByName: author?.fullName ?? "Unknown" });
});

router.delete("/finance/:id", async (req, res) => {
  const userId = req.cookies?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  if (!(await requireSuperAdmin(userId, res))) return;

  const recordId = parseInt(req.params.id);
  const [deleted] = await db
    .delete(financeRecordsTable)
    .where(eq(financeRecordsTable.id, recordId))
    .returning();

  if (!deleted) return res.status(404).json({ error: "Record not found" });
  res.sendStatus(204);
});

export { router as financeRouter };
