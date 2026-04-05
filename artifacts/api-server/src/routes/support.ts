import { Router } from "express";
import { db, supportTicketsTable, supportTicketMessagesTable, usersTable, contactSubmissionsTable } from "@workspace/db";
import { eq, and, inArray, asc, desc } from "drizzle-orm";

const router = Router();

const selectFields = {
  id: supportTicketsTable.id,
  studentId: supportTicketsTable.studentId,
  studentName: usersTable.fullName,
  fromRole: usersTable.role,
  subject: supportTicketsTable.subject,
  message: supportTicketsTable.message,
  status: supportTicketsTable.status,
  adminResponse: supportTicketsTable.adminResponse,
  respondedBy: supportTicketsTable.respondedBy,
  deadline: supportTicketsTable.deadline,
  createdAt: supportTicketsTable.createdAt,
  updatedAt: supportTicketsTable.updatedAt,
};

async function enrichWithResolverNames(rows: typeof selectFields[]) {
  const ids = [...new Set(rows.map((r: any) => r.respondedBy).filter(Boolean))] as number[];
  if (ids.length === 0) return rows.map((r) => ({ ...r, resolvedByName: null }));

  const resolvers = await db
    .select({ id: usersTable.id, fullName: usersTable.fullName })
    .from(usersTable)
    .where(inArray(usersTable.id, ids));

  const map: Record<number, string> = {};
  resolvers.forEach((r) => { map[r.id] = r.fullName; });

  return rows.map((r: any) => ({ ...r, resolvedByName: r.respondedBy ? (map[r.respondedBy] ?? null) : null }));
}

async function getUser(userId: string) {
  return db.select().from(usersTable).where(eq(usersTable.id, parseInt(userId))).then(r => r[0]);
}

// ── Public contact form submission ───────────────────────────────────────────
router.post("/contact", async (req, res) => {
  const { name, email, subject, message } = req.body ?? {};

  if (!name?.trim() || !email?.trim() || !subject?.trim() || !message?.trim()) {
    return res.status(400).json({ error: "Name, email, subject, and message are required" });
  }

  const [created] = await db.insert(contactSubmissionsTable).values({
    name: name.trim(),
    email: email.trim(),
    subject: subject.trim(),
    message: message.trim(),
  }).returning();

  res.status(201).json(created);
});

// ── Super admin: view public contact submissions ─────────────────────────────
router.get("/contact", async (req, res) => {
  const userId = req.cookies?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const user = await getUser(userId);
  if (!user || user.role !== "super_admin") {
    return res.status(403).json({ error: "Only super admins can view contact submissions" });
  }

  const items = await db.select().from(contactSubmissionsTable).orderBy(desc(contactSubmissionsTable.createdAt));
  res.json(items);
});

// ── List all tickets ──────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const userId = req.cookies?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const user = await getUser(userId);
  if (!user) return res.status(401).json({ error: "User not found" });

  const statusFilter = req.query.status as string | undefined;

  let rows: any[];
  if (user.role === "student") {
    const conditions: any[] = [eq(supportTicketsTable.studentId, parseInt(userId))];
    if (statusFilter) conditions.push(eq(supportTicketsTable.status, statusFilter as any));
    rows = await db.select(selectFields).from(supportTicketsTable)
      .leftJoin(usersTable, eq(supportTicketsTable.studentId, usersTable.id))
      .where(and(...conditions));
  } else {
    if (statusFilter) {
      rows = await db.select(selectFields).from(supportTicketsTable)
        .leftJoin(usersTable, eq(supportTicketsTable.studentId, usersTable.id))
        .where(eq(supportTicketsTable.status, statusFilter as any));
    } else {
      rows = await db.select(selectFields).from(supportTicketsTable)
        .leftJoin(usersTable, eq(supportTicketsTable.studentId, usersTable.id));
    }
  }

  const enriched = await enrichWithResolverNames(rows);
  res.json(enriched);
});

// ── Create ticket ─────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const userId = req.cookies?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const { subject, message } = req.body;
  if (!subject || !message) return res.status(400).json({ error: "Subject and message are required" });

  const submitter = await getUser(userId);
  if (!submitter) return res.status(401).json({ error: "User not found" });

  const [ticket] = await db
    .insert(supportTicketsTable)
    .values({ studentId: parseInt(userId), subject, message })
    .returning();

  // Automatically seed the initial message into the thread
  await db.insert(supportTicketMessagesTable).values({
    ticketId: ticket.id,
    senderId: parseInt(userId),
    senderName: submitter.fullName,
    senderRole: submitter.role,
    message,
  });

  res.json({
    ...ticket,
    studentName: submitter?.fullName ?? "Unknown",
    fromRole: submitter?.role ?? "student",
    resolvedByName: null,
  });
});

// ── Get messages for a ticket ─────────────────────────────────────────────────
router.get("/:id/messages", async (req, res) => {
  const userId = req.cookies?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const user = await getUser(userId);
  if (!user) return res.status(401).json({ error: "User not found" });

  const ticketId = parseInt(req.params.id);
  const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, ticketId));
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });

  // Students can only see their own ticket's messages
  if (user.role === "student" && ticket.studentId !== parseInt(userId)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const messages = await db
    .select()
    .from(supportTicketMessagesTable)
    .where(eq(supportTicketMessagesTable.ticketId, ticketId))
    .orderBy(asc(supportTicketMessagesTable.createdAt));

  res.json(messages);
});

// ── Post a new message to a ticket ───────────────────────────────────────────
router.post("/:id/messages", async (req, res) => {
  const userId = req.cookies?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const user = await getUser(userId);
  if (!user) return res.status(401).json({ error: "User not found" });

  const ticketId = parseInt(req.params.id);
  const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, ticketId));
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });

  // Students can only message on their own tickets
  if (user.role === "student" && ticket.studentId !== parseInt(userId)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: "Message is required" });

  const [msg] = await db.insert(supportTicketMessagesTable).values({
    ticketId,
    senderId: parseInt(userId),
    senderName: user.fullName,
    senderRole: user.role,
    message: message.trim(),
  }).returning();

  // If admin/super_admin sends a message, auto-update status to in_progress (if still open)
  if ((user.role === "admin" || user.role === "super_admin") && ticket.status === "open") {
    await db.update(supportTicketsTable)
      .set({ status: "in_progress", adminResponse: message.trim(), respondedBy: parseInt(userId) })
      .where(eq(supportTicketsTable.id, ticketId));
  } else if (user.role === "admin" || user.role === "super_admin") {
    // Update adminResponse to latest response
    await db.update(supportTicketsTable)
      .set({ adminResponse: message.trim(), respondedBy: parseInt(userId) })
      .where(eq(supportTicketsTable.id, ticketId));
  }

  res.json(msg);
});

// ── Update ticket status ──────────────────────────────────────────────────────
router.patch("/:id/status", async (req, res) => {
  const userId = req.cookies?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const user = await getUser(userId);
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    return res.status(403).json({ error: "Only admins can update ticket status" });
  }

  const ticketId = parseInt(req.params.id);
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: "status is required" });

  const [updated] = await db.update(supportTicketsTable)
    .set({ status, respondedBy: parseInt(userId) })
    .where(eq(supportTicketsTable.id, ticketId))
    .returning();

  if (!updated) return res.status(404).json({ error: "Ticket not found" });

  res.json(updated);
});

// ── Set / clear deadline ──────────────────────────────────────────────────────
router.patch("/:id/deadline", async (req, res) => {
  const userId = req.cookies?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const user = await getUser(userId);
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    return res.status(403).json({ error: "Only admins can set deadlines" });
  }

  const ticketId = parseInt(req.params.id);
  const { deadline } = req.body; // ISO string or null

  const [updated] = await db.update(supportTicketsTable)
    .set({ deadline: deadline ? new Date(deadline) : null })
    .where(eq(supportTicketsTable.id, ticketId))
    .returning();

  if (!updated) return res.status(404).json({ error: "Ticket not found" });
  res.json(updated);
});

// ── Legacy respond endpoint (kept for backward compat) ────────────────────────
router.patch("/:id/respond", async (req, res) => {
  const userId = req.cookies?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const user = await getUser(userId);
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    return res.status(403).json({ error: "Only admins can respond to tickets" });
  }

  const ticketId = parseInt(req.params.id);
  const { adminResponse, status } = req.body;
  if (!adminResponse || !status) return res.status(400).json({ error: "adminResponse and status are required" });

  const [updated] = await db.update(supportTicketsTable)
    .set({ adminResponse, status, respondedBy: parseInt(userId) })
    .where(eq(supportTicketsTable.id, ticketId))
    .returning();

  if (!updated) return res.status(404).json({ error: "Ticket not found" });

  // Also add as a message in the thread
  const existing = await db.select().from(supportTicketMessagesTable)
    .where(and(eq(supportTicketMessagesTable.ticketId, ticketId), eq(supportTicketMessagesTable.senderId, parseInt(userId))))
    .then(r => r.find(m => m.message === adminResponse));

  if (!existing) {
    await db.insert(supportTicketMessagesTable).values({
      ticketId,
      senderId: parseInt(userId),
      senderName: user.fullName,
      senderRole: user.role,
      message: adminResponse,
    });
  }

  const submitter = await getUser(String(updated.studentId));
  const responder = await getUser(userId);

  res.json({
    ...updated,
    studentName: submitter?.fullName ?? "Unknown",
    fromRole: submitter?.role ?? "student",
    resolvedByName: responder?.fullName ?? null,
  });
});

export { router as supportRouter };
