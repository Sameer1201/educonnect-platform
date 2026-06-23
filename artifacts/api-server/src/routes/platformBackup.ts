import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

const BACKUP_VERSION = 1;

type BackupTable = {
  name: string;
  hasId: boolean;
};

type PlatformBackupPayload = {
  version?: number;
  app?: string;
  exportedAt?: string;
  tables?: Record<string, unknown[]>;
};

const TABLES: BackupTable[] = [
  { name: "users", hasId: true },
  { name: "platform_settings", hasId: true },
  { name: "email_provider_configs", hasId: true },
  { name: "email_provider_daily_usage", hasId: true },
  { name: "email_send_logs", hasId: true },
  { name: "contact_submissions", hasId: true },
  { name: "classes", hasId: true },
  { name: "exam_templates", hasId: true },
  { name: "subjects", hasId: true },
  { name: "chapters", hasId: true },
  { name: "whiteboards", hasId: true },
  { name: "class_materials", hasId: true },
  { name: "lectures", hasId: true },
  { name: "lecture_enrollments", hasId: true },
  { name: "enrollments", hasId: true },
  { name: "assignments", hasId: true },
  { name: "assignment_submissions", hasId: true },
  { name: "attendance", hasId: true },
  { name: "feedback", hasId: true },
  { name: "community_posts", hasId: true },
  { name: "direct_messages", hasId: true },
  { name: "notifications", hasId: true },
  { name: "notification_preferences", hasId: true },
  { name: "password_reset_requests", hasId: true },
  { name: "lecture_plans", hasId: true },
  { name: "support_tickets", hasId: true },
  { name: "support_ticket_messages", hasId: true },
  { name: "tests", hasId: true },
  { name: "test_sections", hasId: true },
  { name: "test_questions", hasId: true },
  { name: "test_submissions", hasId: true },
  { name: "question_bank_questions", hasId: true },
  { name: "question_bank_reports", hasId: true },
  { name: "question_bank_saved_questions", hasId: true },
  { name: "question_bank_question_progress", hasId: true },
  { name: "test_question_bank_links", hasId: true },
];

function requireSuperAdmin(req: any, res: any) {
  const userId = Number(req.cookies?.userId);
  const role = req.cookies?.userRole;

  if (!userId || Number.isNaN(userId) || !role) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }

  if (role !== "super_admin") {
    res.status(403).json({ error: "Only super admin can manage platform backups" });
    return null;
  }

  return { userId, role };
}

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function normalizeRows(value: unknown, tableName: string): Record<string, unknown>[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`Backup table ${tableName} must be an array`);
  }
  return value.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`Backup table ${tableName} has an invalid row at index ${index}`);
    }
    return row as Record<string, unknown>;
  });
}

router.get("/platform-backup/export", async (req, res): Promise<void> => {
  const auth = requireSuperAdmin(req, res);
  if (!auth) return;

  const tables: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};

  for (const table of TABLES) {
    const orderBy = table.hasId ? " ORDER BY id" : "";
    const result = await pool.query(`SELECT * FROM ${quoteIdentifier(table.name)}${orderBy}`);
    tables[table.name] = result.rows;
    counts[table.name] = result.rowCount ?? result.rows.length;
  }

  const exportedAt = new Date().toISOString();
  const backup = {
    version: BACKUP_VERSION,
    app: "rankpulse",
    exportedAt,
    exportedBy: auth.userId,
    tableOrder: TABLES.map((table) => table.name),
    counts,
    tables,
  };

  const filename = `rankpulse-full-backup-${exportedAt.slice(0, 10)}.json`;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.json(backup);
});

router.post("/platform-backup/import", async (req, res): Promise<void> => {
  const auth = requireSuperAdmin(req, res);
  if (!auth) return;

  const payload = req.body as PlatformBackupPayload;
  if (!payload || typeof payload !== "object" || payload.version !== BACKUP_VERSION || !payload.tables) {
    res.status(400).json({ error: "Invalid or unsupported RankPulse backup file" });
    return;
  }

  for (const table of TABLES) {
    if (!Array.isArray(payload.tables[table.name])) {
      res.status(400).json({ error: `Backup is missing table data for ${table.name}` });
      return;
    }
  }

  const importedCounts: Record<string, number> = {};

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET CONSTRAINTS ALL DEFERRED");

    for (const table of [...TABLES].reverse()) {
      await client.query(`DELETE FROM ${quoteIdentifier(table.name)}`);
    }

    for (const table of TABLES) {
      const rows = normalizeRows(payload.tables[table.name], table.name);
      importedCounts[table.name] = rows.length;
      if (rows.length === 0) continue;

      const columns = Object.keys(rows[0] ?? {});
      const quotedTable = quoteIdentifier(table.name);
      const quotedColumns = columns.map(quoteIdentifier).join(", ");
      const placeholders: string[] = [];
      const values: unknown[] = [];

      rows.forEach((row, rowIndex) => {
        const rowPlaceholders = columns.map((column, columnIndex) => {
          values.push(row[column] ?? null);
          return `$${rowIndex * columns.length + columnIndex + 1}`;
        });
        placeholders.push(`(${rowPlaceholders.join(", ")})`);
      });

      await client.query(
        `INSERT INTO ${quotedTable} (${quotedColumns}) VALUES ${placeholders.join(", ")}`,
        values,
      );
    }

    for (const table of TABLES) {
      if (table.hasId) {
        const sequence = await client.query<{ sequence_name: string | null }>(
          "SELECT pg_get_serial_sequence($1, 'id') AS sequence_name",
          [table.name],
        );
        const sequenceName = sequence.rows[0]?.sequence_name;
        if (sequenceName) {
          await client.query(
            `SELECT setval($1::regclass, COALESCE((SELECT MAX(id) FROM ${quoteIdentifier(table.name)}), 1), (SELECT COUNT(*) > 0 FROM ${quoteIdentifier(table.name)}))`,
            [sequenceName],
          );
        }
      }
    }

    await client.query("COMMIT");
    res.json({
      message: "Platform backup imported successfully",
      importedAt: new Date().toISOString(),
      importedBy: auth.userId,
      sourceExportedAt: payload.exportedAt ?? null,
      counts: importedCounts,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to import platform backup",
    });
  } finally {
    client.release();
  }
});

export default router;
