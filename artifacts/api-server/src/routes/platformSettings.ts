import { Router } from "express";
import { db, platformSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const platformSettingsRouter = Router();

async function ensureSettingsRow() {
  const [existing] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.id, 1));
  if (existing) return existing;
  const [created] = await db.insert(platformSettingsTable).values({ id: 1 }).returning();
  return created;
}

platformSettingsRouter.get("/platform-settings", async (_req, res) => {
  const settings = await ensureSettingsRow();
  res.json(settings);
});

platformSettingsRouter.patch("/platform-settings", async (req, res) => {
  const role = req.cookies?.userRole;
  if (role !== "super_admin") {
    res.status(403).json({ error: "Only super admins can update platform settings" });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (typeof req.body?.learningAccessEnabled === "boolean") {
    updates.learningAccessEnabled = req.body.learningAccessEnabled;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid platform setting provided" });
    return;
  }

  await ensureSettingsRow();
  const [updated] = await db
    .update(platformSettingsTable)
    .set(updates)
    .where(eq(platformSettingsTable.id, 1))
    .returning();

  res.json(updated);
});
