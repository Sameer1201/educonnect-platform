import { Router, type IRouter } from "express";
import { db, usersTable, studentPaymentsTable, enrollmentsTable, classesTable, notificationsTable } from "@workspace/db";
import { eq, and, desc, inArray, or } from "drizzle-orm";

const router: IRouter = Router();

router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

function requireAuth(req: any, res: any): { userId: number; role: string } | null {
  const userId = Number(req.cookies?.userId);
  const role = req.cookies?.userRole;
  if (!userId || !role) { res.status(401).json({ error: "Not authenticated" }); return null; }
  return { userId, role };
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ─── GET /api/payments ─── returns payments based on role
router.get("/payments", async (req, res): Promise<void> => {
  const auth = requireAuth(req, res);
  if (!auth) return;
  const { userId, role } = auth;

  try {
    if (role === "student") {
      const records = await db
        .select({
          id: studentPaymentsTable.id,
          month: studentPaymentsTable.month,
          year: studentPaymentsTable.year,
          amount: studentPaymentsTable.amount,
          status: studentPaymentsTable.status,
          dueDate: studentPaymentsTable.dueDate,
          paidAt: studentPaymentsTable.paidAt,
          notes: studentPaymentsTable.notes,
        })
        .from(studentPaymentsTable)
        .where(eq(studentPaymentsTable.studentId, userId))
        .orderBy(desc(studentPaymentsTable.year), desc(studentPaymentsTable.month));
      res.json(records.map(r => ({ ...r, dueDate: r.dueDate?.toISOString(), paidAt: r.paidAt?.toISOString() ?? null })));
      return;
    }

    if (role === "admin" || role === "super_admin") {
      let studentIds: number[] = [];
      if (role === "admin") {
        const classes = await db.select({ id: classesTable.id })
          .from(classesTable)
          .where(eq(classesTable.adminId, userId));
        if (classes.length === 0) { res.json([]); return; }
        const classIds = classes.map(c => c.id);
        const enrollments = await db.select({ studentId: enrollmentsTable.studentId })
          .from(enrollmentsTable)
          .where(inArray(enrollmentsTable.classId, classIds));
        studentIds = [...new Set(enrollments.map(e => e.studentId))];
      } else {
        const students = await db.select({ id: usersTable.id })
          .from(usersTable)
          .where(eq(usersTable.role, "student"));
        studentIds = students.map(s => s.id);
      }

      if (studentIds.length === 0) { res.json([]); return; }

      const records = await db
        .select({
          id: studentPaymentsTable.id,
          studentId: studentPaymentsTable.studentId,
          month: studentPaymentsTable.month,
          year: studentPaymentsTable.year,
          amount: studentPaymentsTable.amount,
          status: studentPaymentsTable.status,
          dueDate: studentPaymentsTable.dueDate,
          paidAt: studentPaymentsTable.paidAt,
          notes: studentPaymentsTable.notes,
          createdAt: studentPaymentsTable.createdAt,
          fullName: usersTable.fullName,
          username: usersTable.username,
          avatarUrl: usersTable.avatarUrl,
        })
        .from(studentPaymentsTable)
        .leftJoin(usersTable, eq(studentPaymentsTable.studentId, usersTable.id))
        .where(inArray(studentPaymentsTable.studentId, studentIds))
        .orderBy(desc(studentPaymentsTable.year), desc(studentPaymentsTable.month));

      res.json(records.map(r => ({
        ...r,
        dueDate: r.dueDate?.toISOString(),
        paidAt: r.paidAt?.toISOString() ?? null,
        createdAt: r.createdAt?.toISOString(),
      })));
      return;
    }

    res.status(403).json({ error: "Access denied" });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/payments/stats ─── summary statistics
router.get("/payments/stats", async (req, res): Promise<void> => {
  const auth = requireAuth(req, res);
  if (!auth) return;
  const { userId, role } = auth;

  try {
    let studentIds: number[] = [];
    if (role === "student") {
      studentIds = [userId];
    } else if (role === "admin") {
      const classes = await db.select({ id: classesTable.id })
        .from(classesTable)
        .where(eq(classesTable.adminId, userId));
      if (classes.length > 0) {
        const classIds = classes.map(c => c.id);
        const enrollments = await db.select({ studentId: enrollmentsTable.studentId })
          .from(enrollmentsTable)
          .where(inArray(enrollmentsTable.classId, classIds));
        studentIds = [...new Set(enrollments.map(e => e.studentId))];
      }
    } else if (role === "super_admin") {
      const students = await db.select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.role, "student"));
      studentIds = students.map(s => s.id);
    }

    if (studentIds.length === 0) {
      res.json({ total: 0, paid: 0, pending: 0, overdue: 0, totalAmount: 0, collectedAmount: 0 });
      return;
    }

    const records = await db
      .select({ status: studentPaymentsTable.status, amount: studentPaymentsTable.amount })
      .from(studentPaymentsTable)
      .where(inArray(studentPaymentsTable.studentId, studentIds));

    const paid = records.filter(r => r.status === "paid").length;
    const pending = records.filter(r => r.status === "pending").length;
    const overdue = records.filter(r => r.status === "overdue").length;
    const totalAmount = records.reduce((sum, r) => sum + parseFloat(r.amount as string), 0);
    const collectedAmount = records
      .filter(r => r.status === "paid")
      .reduce((sum, r) => sum + parseFloat(r.amount as string), 0);

    res.json({ total: records.length, paid, pending, overdue, totalAmount, collectedAmount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/payments/generate ─── admin/super_admin generates monthly payment records
router.post("/payments/generate", async (req, res): Promise<void> => {
  const auth = requireAuth(req, res);
  if (!auth) return;
  const { userId, role } = auth;
  if (role !== "admin" && role !== "super_admin") {
    res.status(403).json({ error: "Only admins can generate payment records" });
    return;
  }

  const { month, year, amount, dueDay = 10 } = req.body;
  if (!month || !year || !amount) {
    res.status(400).json({ error: "month, year, amount are required" });
    return;
  }

  try {
    let studentIds: number[] = [];
    if (role === "admin") {
      const classes = await db.select({ id: classesTable.id })
        .from(classesTable)
        .where(eq(classesTable.adminId, userId));
      if (classes.length > 0) {
        const classIds = classes.map(c => c.id);
        const enrollments = await db.select({ studentId: enrollmentsTable.studentId })
          .from(enrollmentsTable)
          .where(inArray(enrollmentsTable.classId, classIds));
        studentIds = [...new Set(enrollments.map(e => e.studentId))];
      }
    } else {
      const students = await db.select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.role, "student"));
      studentIds = students.map(s => s.id);
    }

    if (studentIds.length === 0) {
      res.status(400).json({ error: "No students found" });
      return;
    }

    const dueDate = new Date(year, month - 1, dueDay);
    let created = 0;
    let skipped = 0;

    for (const sid of studentIds) {
      const existing = await db
        .select({ id: studentPaymentsTable.id })
        .from(studentPaymentsTable)
        .where(and(
          eq(studentPaymentsTable.studentId, sid),
          eq(studentPaymentsTable.month, Number(month)),
          eq(studentPaymentsTable.year, Number(year)),
        ));
      if (existing.length > 0) { skipped++; continue; }

      await db.insert(studentPaymentsTable).values({
        studentId: sid,
        month: Number(month),
        year: Number(year),
        amount: String(amount),
        status: "pending",
        dueDate,
      });
      created++;

      // Push notification to student
      await db.insert(notificationsTable).values({
        userId: sid,
        type: "payment",
        title: "Tuition Fee Due",
        message: `Your tuition fee for ${MONTH_NAMES[Number(month) - 1]} ${year} is ₹${amount}, due by ${dueDay} ${MONTH_NAMES[Number(month) - 1]}.`,
        link: "/student/payments",
      });
    }

    res.json({ message: `Generated ${created} payment records (${skipped} already existed)`, created, skipped });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/payments/:id/mark-paid ─── mark a payment as paid
router.patch("/payments/:id/mark-paid", async (req, res): Promise<void> => {
  const auth = requireAuth(req, res);
  if (!auth) return;
  const { userId, role } = auth;
  if (role !== "admin" && role !== "super_admin") {
    res.status(403).json({ error: "Only admins can mark payments" });
    return;
  }

  const paymentId = Number(req.params.id);
  const { notes } = req.body;

  try {
    const [payment] = await db.select()
      .from(studentPaymentsTable)
      .where(eq(studentPaymentsTable.id, paymentId));
    if (!payment) { res.status(404).json({ error: "Payment not found" }); return; }

    await db.update(studentPaymentsTable)
      .set({ status: "paid", paidAt: new Date(), paidBy: userId, notes: notes ?? payment.notes })
      .where(eq(studentPaymentsTable.id, paymentId));

    // Notify the student
    await db.insert(notificationsTable).values({
      userId: payment.studentId,
      type: "payment",
      title: "Payment Received",
      message: `Your tuition fee for ${MONTH_NAMES[payment.month - 1]} ${payment.year} (₹${payment.amount}) has been marked as paid. Thank you!`,
      link: "/student/payments",
    });

    res.json({ message: "Payment marked as paid" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/payments/:id/mark-overdue ─── mark as overdue
router.patch("/payments/:id/mark-overdue", async (req, res): Promise<void> => {
  const auth = requireAuth(req, res);
  if (!auth) return;
  const { role } = auth;
  if (role !== "admin" && role !== "super_admin") {
    res.status(403).json({ error: "Only admins can update payments" });
    return;
  }

  const paymentId = Number(req.params.id);
  try {
    const [payment] = await db.select()
      .from(studentPaymentsTable)
      .where(eq(studentPaymentsTable.id, paymentId));
    if (!payment) { res.status(404).json({ error: "Payment not found" }); return; }

    await db.update(studentPaymentsTable)
      .set({ status: "overdue" })
      .where(eq(studentPaymentsTable.id, paymentId));

    // Notify the student
    await db.insert(notificationsTable).values({
      userId: payment.studentId,
      type: "payment",
      title: "Payment Overdue",
      message: `Your tuition fee for ${MONTH_NAMES[payment.month - 1]} ${payment.year} (₹${payment.amount}) is now overdue. Please pay immediately.`,
      link: "/student/payments",
    });

    res.json({ message: "Payment marked as overdue" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/payments/send-reminders ─── blast notifications to all unpaid students
router.post("/payments/send-reminders", async (req, res): Promise<void> => {
  const auth = requireAuth(req, res);
  if (!auth) return;
  const { userId, role } = auth;
  if (role !== "admin" && role !== "super_admin") {
    res.status(403).json({ error: "Only admins can send reminders" });
    return;
  }

  const { month, year } = req.body;
  if (!month || !year) { res.status(400).json({ error: "month and year required" }); return; }

  try {
    let pending = await db
      .select({ id: studentPaymentsTable.id, studentId: studentPaymentsTable.studentId, amount: studentPaymentsTable.amount, dueDate: studentPaymentsTable.dueDate })
      .from(studentPaymentsTable)
      .where(and(
        eq(studentPaymentsTable.month, Number(month)),
        eq(studentPaymentsTable.year, Number(year)),
        or(eq(studentPaymentsTable.status, "pending"), eq(studentPaymentsTable.status, "overdue")),
      ));

    if (role === "admin") {
      const classes = await db.select({ id: classesTable.id })
        .from(classesTable)
        .where(eq(classesTable.adminId, userId));
      if (classes.length > 0) {
        const classIds = classes.map(c => c.id);
        const enrollments = await db.select({ studentId: enrollmentsTable.studentId })
          .from(enrollmentsTable)
          .where(inArray(enrollmentsTable.classId, classIds));
        const adminStudentIds = new Set(enrollments.map(e => e.studentId));
        pending = pending.filter(p => adminStudentIds.has(p.studentId));
      } else {
        pending = [];
      }
    }

    for (const p of pending) {
      await db.insert(notificationsTable).values({
        userId: p.studentId,
        type: "payment_reminder",
        title: "⚠️ Tuition Fee Reminder",
        message: `Reminder: Your tuition fee for ${MONTH_NAMES[Number(month) - 1]} ${year} (₹${p.amount}) is still unpaid. Please pay to avoid any disruption.`,
        link: "/student/payments",
      });
    }

    res.json({ message: `Sent reminders to ${pending.length} students`, count: pending.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export { router as paymentsRouter };
