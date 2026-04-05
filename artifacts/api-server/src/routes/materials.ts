import { Router } from "express";
import { db, classMaterialsTable, classesTable, enrollmentsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  if (!req.cookies?.userId) return res.status(401).json({ error: "Unauthorized" });
  next();
}

async function getUser(userId: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  return user;
}

// GET /api/classes/:id/materials — list materials (no file data for performance)
router.get("/classes/:id/materials", requireAuth, async (req, res) => {
  try {
    const classId = parseInt(req.params.id, 10);
    const userId = parseInt(req.cookies.userId, 10);
    const user = await getUser(userId);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    // Students must be enrolled to see materials
    if (user.role === "student") {
      const [enrollment] = await db
        .select()
        .from(enrollmentsTable)
        .where(and(eq(enrollmentsTable.studentId, userId), eq(enrollmentsTable.classId, classId)));
      if (!enrollment) return res.status(403).json({ error: "Not enrolled" });
    }

    const materials = await db
      .select({
        id: classMaterialsTable.id,
        classId: classMaterialsTable.classId,
        name: classMaterialsTable.name,
        mimeType: classMaterialsTable.mimeType,
        uploadedAt: classMaterialsTable.uploadedAt,
      })
      .from(classMaterialsTable)
      .where(eq(classMaterialsTable.classId, classId))
      .orderBy(classMaterialsTable.uploadedAt);

    return res.json(materials);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/classes/:id/materials/:materialId/download — get file data
router.get("/classes/:id/materials/:materialId/download", requireAuth, async (req, res) => {
  try {
    const classId = parseInt(req.params.id, 10);
    const materialId = parseInt(req.params.materialId, 10);
    const userId = parseInt(req.cookies.userId, 10);
    const user = await getUser(userId);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    // Students must be enrolled
    if (user.role === "student") {
      const [enrollment] = await db
        .select()
        .from(enrollmentsTable)
        .where(and(eq(enrollmentsTable.studentId, userId), eq(enrollmentsTable.classId, classId)));
      if (!enrollment) return res.status(403).json({ error: "Not enrolled" });
    }

    const [material] = await db
      .select()
      .from(classMaterialsTable)
      .where(and(eq(classMaterialsTable.id, materialId), eq(classMaterialsTable.classId, classId)));

    if (!material) return res.status(404).json({ error: "Material not found" });

    return res.json({ fileData: material.fileData, name: material.name, mimeType: material.mimeType });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/classes/:id/materials — upload material (admin/super_admin only)
router.post("/classes/:id/materials", requireAuth, async (req, res) => {
  try {
    const classId = parseInt(req.params.id, 10);
    const userId = parseInt(req.cookies.userId, 10);
    const user = await getUser(userId);
    if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { name, fileData, mimeType } = req.body;
    if (!name || !fileData) return res.status(400).json({ error: "name and fileData are required" });

    const [material] = await db
      .insert(classMaterialsTable)
      .values({ classId, name: String(name), fileData: String(fileData), mimeType: mimeType ?? "application/pdf" })
      .returning();

    return res.status(201).json({
      id: material.id,
      classId: material.classId,
      name: material.name,
      mimeType: material.mimeType,
      uploadedAt: material.uploadedAt,
    });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/classes/:id/materials/:materialId — delete material (admin only)
router.delete("/classes/:id/materials/:materialId", requireAuth, async (req, res) => {
  try {
    const classId = parseInt(req.params.id, 10);
    const materialId = parseInt(req.params.materialId, 10);
    const userId = parseInt(req.cookies.userId, 10);
    const user = await getUser(userId);
    if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await db
      .delete(classMaterialsTable)
      .where(and(eq(classMaterialsTable.id, materialId), eq(classMaterialsTable.classId, classId)));

    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

export { router as materialsRouter };
