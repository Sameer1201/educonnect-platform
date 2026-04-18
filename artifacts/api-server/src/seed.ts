import crypto from "crypto";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ensureFirebaseEmailUser, isFirebaseAdminConfigured } from "./lib/firebaseAdmin";

function hashPassword(password: string) {
  return crypto.createHash("sha256").update(password + "edtech_salt_2024").digest("hex");
}

const DEFAULT_USERS = [
  {
    username: "Sameer",
    password: process.env["SEED_SUPER_ADMIN_PASSWORD"] ?? "change-me-super-admin",
    fullName: "Sameer",
    email: "sameer@educonnect.com",
    role: "super_admin" as const,
    status: "active" as const,
  },
  {
    username: "Sameer_Teacher",
    password: process.env["SEED_TEACHER_PASSWORD"] ?? "change-me-teacher",
    fullName: "Priya Sharma",
    email: "priya@educonnect.com",
    role: "admin" as const,
    status: "active" as const,
  },
  {
    username: "Sameer_Student",
    password: process.env["SEED_STUDENT_PASSWORD"] ?? "change-me-student",
    fullName: "Rahul Singh",
    email: "rahul@educonnect.com",
    role: "student" as const,
    status: "approved" as const,
  },
];

export async function seedDefaultUsers() {
  for (const u of DEFAULT_USERS) {
    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.username, u.username))
      .then((r) => r[0]);

    if (!existing) {
      await db.insert(usersTable).values({
        username: u.username,
        passwordHash: hashPassword(u.password),
        fullName: u.fullName,
        email: u.email,
        role: u.role,
        status: u.status,
      });
      console.log(`[seed] Created user: ${u.username} (${u.role})`);
    }

    if (isFirebaseAdminConfigured()) {
      await ensureFirebaseEmailUser({
        email: u.email,
        password: u.password,
        fullName: u.fullName,
      }).catch((error) => {
        console.warn(`[seed] Failed to sync Firebase student ${u.email}:`, error);
      });
    }
  }
}
