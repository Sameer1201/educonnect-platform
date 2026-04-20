import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, emailProviderDailyUsageTable } from "@workspace/db";
import { emailProviderConfigsTable, emailSendLogsTable } from "@workspace/db/schema";
import { logger } from "./logger";
import {
  buildStudentReviewActionUrl,
  type StudentReviewRecipient,
  type StudentReviewSummary,
} from "./studentReview";

const PENDING_STUDENT_ESCALATION_EMAIL = "sameermajhi339@gmail.com";

type BrevoEmailPayload = {
  to: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  messageType?: string;
  metadata?: Record<string, unknown> | null;
};

type BrevoAccountConfig = {
  id: number | null;
  key: string;
  providerName: string;
  apiKey: string;
  senderEmail: string;
  senderName: string;
  dailyLimit: number;
  dailySoftLimit: number;
  source: "environment" | "database";
  isActive: boolean;
};

type DailyUsageSummary = {
  sentCount: number;
  lastSentAt: Date | null;
};

type StudentTestResultSubjectBreakdown = {
  label: string;
  totalQuestions: number;
  attemptedQuestions: number;
  correctQuestions: number;
  incorrectQuestions: number;
  unattemptedQuestions: number;
  accuracyPct: number;
};

type StudentTestResultEmailArgs = {
  studentName: string;
  email: string;
  testId: number;
  testTitle: string;
  score: number;
  totalPoints: number;
  percentage: number;
  passed: boolean;
  passingScore?: number | null;
  submittedAt: Date | string | null;
  totalQuestions: number;
  attemptedQuestions: number;
  correctQuestions: number;
  incorrectQuestions: number;
  unattemptedQuestions: number;
  timeSpentSeconds?: number | null;
  subjectBreakdown: StudentTestResultSubjectBreakdown[];
};

function readTrimmedEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function readPositiveInteger(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
}

function slugifyProviderKey(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "brevo-account";
}

function maskApiKey(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) return "••••••••";
  return `${trimmed.slice(0, 6)}••••${trimmed.slice(-4)}`;
}

function buildUsageDateKey(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
}

function parseBrevoAccountsJson(): BrevoAccountConfig[] {
  const raw = readTrimmedEnv("BREVO_ACCOUNTS_JSON");
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry, index): BrevoAccountConfig | null => {
        const record = typeof entry === "object" && entry ? entry as Record<string, unknown> : null;
        if (!record) return null;

        const apiKey = typeof record.apiKey === "string" ? record.apiKey.trim() : "";
        const senderEmail = typeof record.senderEmail === "string" ? record.senderEmail.trim() : "";
        if (!apiKey || !senderEmail) return null;

        const senderName = typeof record.senderName === "string" && record.senderName.trim()
          ? record.senderName.trim()
          : "Rank Pulse";
        const dailyLimit = readPositiveInteger(record.dailyLimit, 300);
        const preferredSoftLimit = readPositiveInteger(record.dailySoftLimit, Math.min(250, dailyLimit));
        const dailySoftLimit = Math.min(preferredSoftLimit, dailyLimit);
        const key = typeof record.key === "string" && record.key.trim()
          ? record.key.trim()
          : `brevo-${index + 1}`;
        const providerName = typeof record.providerName === "string" && record.providerName.trim()
          ? record.providerName.trim()
          : senderName || key;

        return {
          id: null,
          key,
          providerName,
          apiKey,
          senderEmail,
          senderName,
          dailyLimit,
          dailySoftLimit,
          source: "environment" as const,
          isActive: true,
        };
      })
      .filter((account): account is BrevoAccountConfig => Boolean(account));
  } catch (error) {
    logger.warn({ error }, "Failed to parse BREVO_ACCOUNTS_JSON");
    return [];
  }
}

function getEnvBrevoAccounts(): BrevoAccountConfig[] {
  const multiAccounts = parseBrevoAccountsJson();
  if (multiAccounts.length > 0) {
    return multiAccounts;
  }

  const apiKey = readTrimmedEnv("BREVO_API_KEY");
  const senderEmail = readTrimmedEnv("BREVO_SENDER_EMAIL");
  const senderName = readTrimmedEnv("BREVO_SENDER_NAME") || "Rank Pulse";

  if (!apiKey || !senderEmail) {
    return [];
  }

  const dailyLimit = readPositiveInteger(readTrimmedEnv("BREVO_DAILY_LIMIT"), 300);
  const preferredSoftLimit = readPositiveInteger(readTrimmedEnv("BREVO_DAILY_SOFT_LIMIT"), Math.min(250, dailyLimit));

  return [{
    id: null,
    key: readTrimmedEnv("BREVO_ACCOUNT_KEY") || "brevo-primary",
    providerName: readTrimmedEnv("BREVO_PROVIDER_NAME") || senderName || "Brevo Primary",
    apiKey,
    senderEmail,
    senderName,
    dailyLimit,
    dailySoftLimit: Math.min(preferredSoftLimit, dailyLimit),
    source: "environment" as const,
    isActive: true,
  }];
}

async function getDatabaseBrevoAccounts(options?: { includeInactive?: boolean }) {
  const rows = await db
    .select()
    .from(emailProviderConfigsTable)
    .where(
      options?.includeInactive
        ? eq(emailProviderConfigsTable.providerType, "brevo")
        : and(eq(emailProviderConfigsTable.providerType, "brevo"), eq(emailProviderConfigsTable.isActive, true)),
    )
    .orderBy(emailProviderConfigsTable.id);

  return rows.map((row): BrevoAccountConfig => ({
    id: row.id,
    key: row.providerKey,
    providerName: row.providerName,
    apiKey: row.apiKey,
    senderEmail: row.senderEmail,
    senderName: row.senderName,
    dailyLimit: row.dailyLimit,
    dailySoftLimit: Math.min(row.dailySoftLimit, row.dailyLimit),
    source: "database",
    isActive: row.isActive,
  }));
}

async function getConfiguredBrevoAccounts() {
  const envAccounts = getEnvBrevoAccounts();
  const dbAccounts = await getDatabaseBrevoAccounts();
  const seen = new Set(envAccounts.map((account) => account.key));
  return [
    ...envAccounts,
    ...dbAccounts.filter((account) => {
      if (seen.has(account.key)) return false;
      seen.add(account.key);
      return true;
    }),
  ];
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function formatMetricNumber(value: number, maximumFractionDigits = 2) {
  const numeric = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: Number.isInteger(numeric) ? 0 : Math.min(2, maximumFractionDigits),
    maximumFractionDigits,
  }).format(numeric);
}

function formatPercentLabel(value: number) {
  return `${formatMetricNumber(clampPercent(value), 2)}%`;
}

function formatDurationLabel(totalSeconds: number | null | undefined) {
  const normalized = Math.round(Number(totalSeconds) || 0);
  if (normalized <= 0) return "Not captured";
  const hours = Math.floor(normalized / 3600);
  const minutes = Math.floor((normalized % 3600) / 60);
  const seconds = normalized % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(" ");
}

export function isBrevoConfigured() {
  return getEnvBrevoAccounts().length > 0;
}

export async function hasBrevoAccounts() {
  return (await getConfiguredBrevoAccounts()).length > 0;
}

async function sendBrevoEmailViaAccount(account: BrevoAccountConfig, payload: BrevoEmailPayload) {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": account.apiKey,
    },
    body: JSON.stringify({
      sender: {
        email: account.senderEmail,
        name: account.senderName,
      },
      to: [{ email: payload.to }],
      subject: payload.subject,
      htmlContent: payload.htmlContent,
      textContent: payload.textContent,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Brevo request failed (${response.status}): ${errorText || response.statusText}`);
  }
}

async function getDailyUsageMap(accounts: BrevoAccountConfig[], usageDate: string) {
  if (accounts.length === 0) return new Map<string, DailyUsageSummary>();

  const rows = await db
    .select({
      providerKey: emailProviderDailyUsageTable.providerKey,
      sentCount: emailProviderDailyUsageTable.sentCount,
      lastSentAt: emailProviderDailyUsageTable.lastSentAt,
    })
    .from(emailProviderDailyUsageTable)
    .where(
      and(
        eq(emailProviderDailyUsageTable.usageDate, usageDate),
        inArray(emailProviderDailyUsageTable.providerKey, accounts.map((account) => account.key)),
      ),
    );

  return new Map(rows.map((row) => [row.providerKey, { sentCount: row.sentCount, lastSentAt: row.lastSentAt }]));
}

async function incrementDailyUsage(providerKey: string, usageDate: string) {
  const now = new Date();
  await db
    .insert(emailProviderDailyUsageTable)
    .values({
      providerKey,
      usageDate,
      sentCount: 1,
      lastSentAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [emailProviderDailyUsageTable.providerKey, emailProviderDailyUsageTable.usageDate],
      set: {
        sentCount: sql`${emailProviderDailyUsageTable.sentCount} + 1`,
        lastSentAt: now,
        updatedAt: now,
      },
    });
}

function serializeLogMetadata(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) return null;
  try {
    return JSON.stringify(metadata);
  } catch {
    return null;
  }
}

async function insertEmailSendLog({
  account,
  payload,
  status,
  errorMessage,
}: {
  account: BrevoAccountConfig;
  payload: BrevoEmailPayload;
  status: "sent" | "failed";
  errorMessage?: string;
}) {
  await db.insert(emailSendLogsTable).values({
    providerKey: account.key,
    providerName: account.providerName,
    providerSource: account.source,
    senderEmail: account.senderEmail,
    recipientEmail: payload.to,
    subject: payload.subject,
    messageType: payload.messageType?.trim() || "transactional",
    status,
    errorMessage: errorMessage?.trim() || null,
    metadata: serializeLogMetadata(payload.metadata),
    sentAt: new Date(),
  });
}

async function sendBrevoEmail(payload: BrevoEmailPayload) {
  const accounts = await getConfiguredBrevoAccounts();
  if (accounts.length === 0) {
    throw new Error("Brevo email is not configured");
  }

  const usageDate = buildUsageDateKey();
  const usageMap = await getDailyUsageMap(accounts, usageDate);
  const sentCountFor = (account: BrevoAccountConfig) => usageMap.get(account.key)?.sentCount ?? 0;

  const accountsBelowSoftLimit = accounts.filter((account) => sentCountFor(account) < account.dailySoftLimit);
  const accountsBelowHardLimit = accounts.filter((account) => sentCountFor(account) < account.dailyLimit);
  const attemptOrder = [
    ...accountsBelowSoftLimit,
    ...accountsBelowHardLimit.filter((account) => !accountsBelowSoftLimit.some((softAccount) => softAccount.key === account.key)),
  ];

  if (attemptOrder.length === 0) {
    throw new Error("All configured Brevo accounts have reached their daily sending limit");
  }

  const failures: string[] = [];

  for (const account of attemptOrder) {
    try {
      await sendBrevoEmailViaAccount(account, payload);
      await incrementDailyUsage(account.key, usageDate);
      await insertEmailSendLog({ account, payload, status: "sent" });
      logger.info(
        {
          providerKey: account.key,
          providerName: account.providerName,
          usageDate,
          sentCountBefore: sentCountFor(account),
          dailySoftLimit: account.dailySoftLimit,
          dailyLimit: account.dailyLimit,
          recipient: payload.to,
        },
        "Brevo email sent",
      );
      return;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await insertEmailSendLog({ account, payload, status: "failed", errorMessage }).catch((logError) => {
        logger.warn({ error: logError, providerKey: account.key }, "Failed to write Brevo email log");
      });
      failures.push(`${account.key}: ${errorMessage}`);
      logger.warn({ error, providerKey: account.key, recipient: payload.to }, "Brevo account send failed, trying next account");
    }
  }

  throw new Error(`All configured Brevo accounts failed. ${failures.join(" | ")}`);
}

export async function getBrevoProviderUsageSummary() {
  const envAccounts = getEnvBrevoAccounts();
  const dbAccounts = await getDatabaseBrevoAccounts({ includeInactive: true });
  const seen = new Set(envAccounts.map((account) => account.key));
  const accounts = [
    ...envAccounts,
    ...dbAccounts.filter((account) => {
      if (seen.has(account.key)) return false;
      seen.add(account.key);
      return true;
    }),
  ];
  const usageDate = buildUsageDateKey();
  const usageMap = await getDailyUsageMap(accounts, usageDate);

  const providers = accounts.map((account) => {
    const usage = usageMap.get(account.key) ?? { sentCount: 0, lastSentAt: null };
    const remainingDaily = Math.max(0, account.dailyLimit - usage.sentCount);
    const remainingBeforeSoftLimit = Math.max(0, account.dailySoftLimit - usage.sentCount);
    const status = !account.isActive
      ? "inactive"
      : usage.sentCount >= account.dailyLimit
        ? "limit-reached"
        : usage.sentCount >= account.dailySoftLimit
          ? "soft-limit-reached"
          : "active";

    return {
      id: account.id,
      key: account.key,
      providerName: account.providerName,
      providerSource: account.source,
      senderEmail: account.senderEmail,
      senderName: account.senderName,
      dailyLimit: account.dailyLimit,
      dailySoftLimit: account.dailySoftLimit,
      usedToday: usage.sentCount,
      remainingDaily,
      remainingBeforeSoftLimit,
      lastSentAt: usage.lastSentAt?.toISOString() ?? null,
      status,
      maskedApiKey: maskApiKey(account.apiKey),
      isActive: account.isActive,
    };
  });

  return {
    usageDate,
    totals: {
      configuredProviders: providers.length,
      totalUsedToday: providers.reduce((sum, provider) => sum + provider.usedToday, 0),
      totalRemainingDaily: providers.reduce((sum, provider) => sum + provider.remainingDaily, 0),
    },
    providers,
  };
}

export async function listBrevoEmailSendLogs(limit = 50) {
  const envAccounts = getEnvBrevoAccounts();
  const dbAccounts = await getDatabaseBrevoAccounts({ includeInactive: true });
  const accountMap = new Map([...envAccounts, ...dbAccounts].map((account) => [account.key, account]));
  const safeLimit = Math.max(1, Math.min(limit, 200));
  const rows = await db
    .select()
    .from(emailSendLogsTable)
    .orderBy(desc(emailSendLogsTable.sentAt), desc(emailSendLogsTable.id))
    .limit(safeLimit);

  return rows.map((row) => ({
    id: row.id,
      providerKey: row.providerKey,
      providerName: row.providerName,
      providerSource: row.providerSource,
      providerMaskedApiKey: maskApiKey(accountMap.get(row.providerKey)?.apiKey ?? ""),
      senderEmail: row.senderEmail,
    recipientEmail: row.recipientEmail,
    subject: row.subject,
    messageType: row.messageType,
    status: row.status,
    errorMessage: row.errorMessage,
    metadata: row.metadata,
    sentAt: row.sentAt?.toISOString() ?? null,
  }));
}

export async function createBrevoProviderConfig({
  providerName,
  apiKey,
  senderEmail,
  senderName,
  dailyLimit,
  dailySoftLimit,
  createdById,
}: {
  providerName: string;
  apiKey: string;
  senderEmail: string;
  senderName?: string;
  dailyLimit?: number;
  dailySoftLimit?: number;
  createdById?: number | null;
}) {
  const trimmedProviderName = providerName.trim() || "Brevo Account";
  const trimmedApiKey = apiKey.trim();
  const trimmedSenderEmail = senderEmail.trim();
  const trimmedSenderName = senderName?.trim() || "Rank Pulse";

  if (!trimmedApiKey) {
    throw new Error("API key is required.");
  }
  if (!trimmedSenderEmail) {
    throw new Error("Sender email is required.");
  }

  const existingRows = await db
    .select({
      id: emailProviderConfigsTable.id,
      providerKey: emailProviderConfigsTable.providerKey,
      apiKey: emailProviderConfigsTable.apiKey,
    })
    .from(emailProviderConfigsTable);

  if (existingRows.some((row) => row.apiKey.trim() === trimmedApiKey)) {
    throw new Error("This Brevo API key is already added.");
  }

  const baseKey = slugifyProviderKey(trimmedProviderName);
  let providerKey = baseKey;
  let suffix = 2;
  const existingKeys = new Set(existingRows.map((row) => row.providerKey));
  while (existingKeys.has(providerKey)) {
    providerKey = `${baseKey}-${suffix}`;
    suffix += 1;
  }

  const normalizedDailyLimit = readPositiveInteger(dailyLimit, 300);
  const preferredSoftLimit = readPositiveInteger(dailySoftLimit, Math.min(250, normalizedDailyLimit));

  const [created] = await db
    .insert(emailProviderConfigsTable)
    .values({
      providerKey,
      providerName: trimmedProviderName,
      providerType: "brevo",
      apiKey: trimmedApiKey,
      senderEmail: trimmedSenderEmail,
      senderName: trimmedSenderName,
      replyToEmail: null,
      replyToName: null,
      dailyLimit: normalizedDailyLimit,
      dailySoftLimit: Math.min(preferredSoftLimit, normalizedDailyLimit),
      isActive: true,
      createdById: createdById ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return {
    id: created.id,
    key: created.providerKey,
    providerName: created.providerName,
    senderEmail: created.senderEmail,
    senderName: created.senderName,
    dailyLimit: created.dailyLimit,
    dailySoftLimit: created.dailySoftLimit,
    maskedApiKey: maskApiKey(created.apiKey),
    isActive: created.isActive,
  };
}

export async function setBrevoProviderActiveState({
  id,
  isActive,
}: {
  id: number;
  isActive: boolean;
}) {
  const [updated] = await db
    .update(emailProviderConfigsTable)
    .set({
      isActive,
      updatedAt: new Date(),
    })
    .where(eq(emailProviderConfigsTable.id, id))
    .returning();

  if (!updated) {
    throw new Error("Brevo account not found.");
  }

  return {
    id: updated.id,
    key: updated.providerKey,
    providerName: updated.providerName,
    isActive: updated.isActive,
  };
}

function readPortalUrl() {
  return readTrimmedEnv("PUBLIC_APP_URL") || "http://localhost:5173";
}

function buildPortalUrl(path: string) {
  try {
    return new URL(path, readPortalUrl()).toString();
  } catch {
    return readPortalUrl();
  }
}

function buildStudentTestAnalysisUrl(testId: number) {
  return buildPortalUrl(`/student/tests/${testId}/analysis`);
}

export async function sendStudentApprovedEmail({
  studentName,
  email,
}: {
  studentName: string;
  email: string;
}) {
  const safeName = escapeHtml(studentName.trim() || "Student");
  const portalUrl = readPortalUrl();
  const safePortalUrl = escapeHtml(portalUrl);

  const subject = "Your Rank Pulse application has been verified";
  const textContent = [
    `Hi ${studentName || "Student"},`,
    "",
    "Your Rank Pulse application has been verified.",
    "Your student portal is now active and you can log in to continue your preparation.",
    "",
    `Open portal: ${portalUrl}`,
    "",
    "Team Rank Pulse",
  ].join("\n");

  const htmlContent = `
    <div style="background:#fff7e8;padding:32px 16px;font-family:Arial,sans-serif;color:#1f2937;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #fed7aa;border-radius:24px;overflow:hidden;">
        <div style="padding:24px 28px;background:linear-gradient(135deg,#fff7e8 0%,#ffedd5 100%);border-bottom:1px solid #fed7aa;">
          <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:#f59e0b;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">
            Application Verified
          </div>
          <h1 style="margin:16px 0 8px;font-size:28px;line-height:1.1;color:#111827;">Portal access is now active</h1>
          <p style="margin:0;font-size:15px;line-height:1.6;color:#4b5563;">
            Hi ${safeName}, your Rank Pulse student application has been approved.
          </p>
        </div>
        <div style="padding:28px;">
          <div style="border:1px solid #fed7aa;border-radius:18px;background:#fffaf0;padding:18px 20px;">
            <p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#374151;">
              You can now log in and access your student portal, tests, question bank, and preparation workspace.
            </p>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">
              If your setup was already completed, the portal should open immediately after login.
            </p>
          </div>
          <div style="margin-top:24px;">
            <a href="${safePortalUrl}" style="display:inline-block;background:#d97706;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:14px;font-weight:700;">
              Open Rank Pulse
            </a>
          </div>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#6b7280;">
            If you did not request this account, please ignore this email or reply to this message.
          </p>
        </div>
      </div>
    </div>
  `.trim();

  await sendBrevoEmail({
    to: email,
    subject,
    htmlContent,
    textContent,
    messageType: "student-approved",
    metadata: { studentName },
  });
}

export async function sendStudentRejectedEmail({
  studentName,
  email,
  reason,
}: {
  studentName: string;
  email: string;
  reason: string;
}) {
  const safeName = escapeHtml(studentName.trim() || "Student");
  const safeReason = escapeHtml(reason.trim());
  const portalUrl = readPortalUrl();
  const safePortalUrl = escapeHtml(portalUrl);

  const subject = "Your Rank Pulse application needs an update";
  const textContent = [
    `Hi ${studentName || "Student"},`,
    "",
    "Your Rank Pulse application was reviewed and is currently rejected.",
    "Reason:",
    reason,
    "",
    "Please log back in, update your details, and resubmit your profile for review.",
    `Open portal: ${portalUrl}`,
    "",
    "Team Rank Pulse",
  ].join("\n");

  const htmlContent = `
    <div style="background:#fff7e8;padding:32px 16px;font-family:Arial,sans-serif;color:#1f2937;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #fed7aa;border-radius:24px;overflow:hidden;">
        <div style="padding:24px 28px;background:linear-gradient(135deg,#fff7e8 0%,#ffedd5 100%);border-bottom:1px solid #fed7aa;">
          <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:#f59e0b;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">
            Application Update Needed
          </div>
          <h1 style="margin:16px 0 8px;font-size:28px;line-height:1.1;color:#111827;">Please update your student profile</h1>
          <p style="margin:0;font-size:15px;line-height:1.6;color:#4b5563;">
            Hi ${safeName}, your Rank Pulse student application was reviewed but needs a few corrections before approval.
          </p>
        </div>
        <div style="padding:28px;">
          <div style="border:1px solid #fecaca;border-radius:18px;background:#fff5f5;padding:18px 20px;">
            <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#b91c1c;">
              Rejection reason
            </p>
            <p style="margin:0;font-size:14px;line-height:1.7;color:#7f1d1d;">
              ${safeReason}
            </p>
          </div>
          <p style="margin:20px 0 0;font-size:14px;line-height:1.7;color:#374151;">
            Log in again, edit your setup details, and resubmit the form. Once updated, your application will return to the review queue.
          </p>
          <div style="margin-top:24px;">
            <a href="${safePortalUrl}" style="display:inline-block;background:#d97706;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:14px;font-weight:700;">
              Open Rank Pulse
            </a>
          </div>
        </div>
      </div>
    </div>
  `.trim();

  await sendBrevoEmail({
    to: email,
    subject,
    htmlContent,
    textContent,
    messageType: "student-rejected",
    metadata: { studentName, reason },
  });
}

export async function sendPasswordResetEmail({
  accountName,
  email,
  resetUrl,
}: {
  accountName: string;
  email: string;
  resetUrl: string;
}) {
  const safeName = escapeHtml(accountName.trim() || "User");
  const safeResetUrl = escapeHtml(resetUrl);

  const subject = "Reset your Rank Pulse password";
  const textContent = [
    `Hi ${accountName || "User"},`,
    "",
    "We received a request to reset your Rank Pulse password.",
    `Reset password: ${resetUrl}`,
    "",
    "If you did not request this, you can ignore this email.",
    "",
    "Team Rank Pulse",
  ].join("\n");

  const htmlContent = `
    <div style="background:#fff7e8;padding:32px 16px;font-family:Arial,sans-serif;color:#1f2937;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #fed7aa;border-radius:24px;overflow:hidden;">
        <div style="padding:24px 28px;background:linear-gradient(135deg,#fff7e8 0%,#ffedd5 100%);border-bottom:1px solid #fed7aa;">
          <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:#f59e0b;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">
            Password Reset
          </div>
          <h1 style="margin:16px 0 8px;font-size:28px;line-height:1.1;color:#111827;">Reset your Rank Pulse password</h1>
          <p style="margin:0;font-size:15px;line-height:1.6;color:#4b5563;">
            Hi ${safeName}, use the button below to set a new password for your account.
          </p>
        </div>
        <div style="padding:28px;">
          <div style="border:1px solid #fed7aa;border-radius:18px;background:#fffaf0;padding:18px 20px;">
            <p style="margin:0;font-size:14px;line-height:1.7;color:#374151;">
              This reset link opens the secure Rank Pulse reset page. If you did not request a password reset, you can safely ignore this email.
            </p>
          </div>
          <div style="margin-top:24px;">
            <a href="${safeResetUrl}" style="display:inline-block;background:#d97706;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:14px;font-weight:700;">
              Reset Password
            </a>
          </div>
          <p style="margin:22px 0 0;font-size:13px;line-height:1.7;color:#6b7280;">
            If the button does not open, copy and paste this link into your browser:<br />
            <span style="word-break:break-all;">${safeResetUrl}</span>
          </p>
        </div>
      </div>
    </div>
  `.trim();

  await sendBrevoEmail({
    to: email,
    subject,
    htmlContent,
    textContent,
    messageType: "password-reset",
    metadata: { accountName },
  });
}

export async function sendTeacherWelcomeEmail({
  teacherName,
  email,
  username,
  resetUrl,
  subject,
}: {
  teacherName: string;
  email: string;
  username: string;
  resetUrl: string;
  subject?: string | null;
}) {
  const safeTeacherName = escapeHtml(teacherName.trim() || "Teacher");
  const safeUsername = escapeHtml(username.trim());
  const safeEmail = escapeHtml(email.trim());
  const safeResetUrl = escapeHtml(resetUrl);
  const safeSubject = escapeHtml(subject?.trim() || "Not assigned yet");
  const portalUrl = readPortalUrl();
  const safePortalUrl = escapeHtml(portalUrl);

  const mailSubject = "Your Rank Pulse teacher account is ready";
  const textContent = [
    `Hi ${teacherName || "Teacher"},`,
    "",
    "A teacher account has been created for you on Rank Pulse.",
    `Username: ${username}`,
    `Email: ${email}`,
    `Subject: ${subject?.trim() || "Not assigned yet"}`,
    "",
    "Use the secure link below to set your password and sign in.",
    `Set password: ${resetUrl}`,
    "",
    `Portal: ${portalUrl}`,
    "",
    "If you were not expecting this account, please contact your administrator.",
    "",
    "Team Rank Pulse",
  ].join("\n");

  const htmlContent = `
    <div style="background:#fff7e8;padding:32px 16px;font-family:Arial,sans-serif;color:#1f2937;">
      <div style="max-width:580px;margin:0 auto;background:#ffffff;border:1px solid #fed7aa;border-radius:24px;overflow:hidden;">
        <div style="padding:24px 28px;background:linear-gradient(135deg,#fff7e8 0%,#ffedd5 100%);border-bottom:1px solid #fed7aa;">
          <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:#d97706;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">
            Teacher Account
          </div>
          <h1 style="margin:16px 0 8px;font-size:28px;line-height:1.1;color:#111827;">Welcome to Rank Pulse</h1>
          <p style="margin:0;font-size:15px;line-height:1.6;color:#4b5563;">
            Hi ${safeTeacherName}, your teacher account is now ready. Set your password securely to start using the platform.
          </p>
        </div>
        <div style="padding:28px;">
          <div style="border:1px solid #fed7aa;border-radius:18px;background:#fffaf0;padding:18px 20px;">
            <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#92400e;">
              Account details
            </p>
            <p style="margin:0;font-size:14px;line-height:1.8;color:#374151;">
              <strong>Username:</strong> ${safeUsername}<br />
              <strong>Email:</strong> ${safeEmail}<br />
              <strong>Subject:</strong> ${safeSubject}
            </p>
          </div>
          <div style="margin-top:24px;">
            <a href="${safeResetUrl}" style="display:inline-block;background:#d97706;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:14px;font-weight:700;">
              Set Password
            </a>
          </div>
          <p style="margin:18px 0 0;font-size:13px;line-height:1.7;color:#6b7280;">
            After setting your password, sign in using your email address on Rank Pulse.<br />
            Portal: <a href="${safePortalUrl}" style="color:#d97706;text-decoration:none;">${safePortalUrl}</a>
          </p>
          <p style="margin:14px 0 0;font-size:12px;line-height:1.7;color:#6b7280;">
            If the button does not open, copy and paste this link into your browser:<br />
            <span style="word-break:break-all;">${safeResetUrl}</span>
          </p>
        </div>
      </div>
    </div>
  `.trim();

  await sendBrevoEmail({
    to: email,
    subject: mailSubject,
    htmlContent,
    textContent,
    messageType: "teacher-welcome",
    metadata: { teacherName, username, subject: subject?.trim() || null },
  });
}

export async function sendStudentTestResultEmail({
  studentName,
  email,
  testId,
  testTitle,
  score,
  totalPoints,
  percentage,
  passed,
  passingScore,
  submittedAt,
  totalQuestions,
  attemptedQuestions,
  correctQuestions,
  incorrectQuestions,
  unattemptedQuestions,
  timeSpentSeconds,
  subjectBreakdown,
}: StudentTestResultEmailArgs) {
  const safeStudentName = escapeHtml(studentName.trim() || "Student");
  const safeTestTitle = escapeHtml(testTitle.trim() || "Your test");
  const safeScore = escapeHtml(formatMetricNumber(score, 2));
  const safeTotalPoints = escapeHtml(formatMetricNumber(totalPoints, 2));
  const safePercentage = escapeHtml(formatPercentLabel(percentage));
  const safeAttemptedLabel = escapeHtml(`${attemptedQuestions}/${totalQuestions}`);
  const safeCorrectLabel = escapeHtml(String(correctQuestions));
  const safeIncorrectLabel = escapeHtml(String(incorrectQuestions));
  const safeUnattemptedLabel = escapeHtml(String(unattemptedQuestions));
  const safeTimeSpentLabel = escapeHtml(formatDurationLabel(timeSpentSeconds));
  const analysisUrl = buildStudentTestAnalysisUrl(testId);
  const safeAnalysisUrl = escapeHtml(analysisUrl);
  const submittedDate = submittedAt ? new Date(submittedAt) : null;
  const submittedLabel = submittedDate && !Number.isNaN(submittedDate.getTime())
    ? submittedDate.toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      })
    : "Just now";
  const safeSubmittedLabel = escapeHtml(submittedLabel);
  const scoreStatus = passed ? "Passed" : passingScore == null ? "Submitted" : "Keep going";
  const safeScoreStatus = escapeHtml(scoreStatus);
  const passingBenchmarkLabel = passingScore == null ? "Not set" : formatPercentLabel(passingScore);
  const safePassingBenchmarkLabel = escapeHtml(passingBenchmarkLabel);
  const correctPct = totalQuestions > 0 ? clampPercent((correctQuestions / totalQuestions) * 100) : 0;
  const incorrectPct = totalQuestions > 0 ? clampPercent((incorrectQuestions / totalQuestions) * 100) : 0;
  const unattemptedPct = totalQuestions > 0 ? clampPercent((unattemptedQuestions / totalQuestions) * 100) : 0;

  const subjectSummaryLines = subjectBreakdown.map((item) => (
    `${item.label}: ${item.correctQuestions}/${item.totalQuestions} correct (${formatPercentLabel(item.accuracyPct)})`
  ));

  const subjectRowsHtml = subjectBreakdown.length > 0
    ? subjectBreakdown.map((item) => {
        const safeLabel = escapeHtml(item.label);
        const safeCounts = escapeHtml(`${item.correctQuestions}/${item.totalQuestions} correct`);
        const safeAccuracy = escapeHtml(formatPercentLabel(item.accuracyPct));
        const safeAttempted = escapeHtml(`${item.attemptedQuestions}/${item.totalQuestions}`);
        const safeIncorrect = escapeHtml(String(item.incorrectQuestions));
        const safeUnattempted = escapeHtml(String(item.unattemptedQuestions));
        const accuracyWidth = clampPercent(item.accuracyPct);

        return `
          <tr>
            <td style="padding:0 0 18px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                <tr>
                  <td style="font-size:14px;font-weight:700;color:#111827;padding-bottom:4px;">${safeLabel}</td>
                  <td align="right" style="font-size:12px;color:#4b5563;padding-bottom:4px;">${safeCounts} · ${safeAccuracy}</td>
                </tr>
              </table>
              <div style="margin-top:6px;background:#e5e7eb;border-radius:999px;height:10px;overflow:hidden;">
                <div style="width:${accuracyWidth}%;height:10px;background:linear-gradient(90deg,#2563eb 0%,#0ea5e9 100%);border-radius:999px;"></div>
              </div>
              <p style="margin:6px 0 0;font-size:12px;line-height:1.5;color:#6b7280;">
                Attempted ${safeAttempted} · Incorrect ${safeIncorrect} · Not attempted ${safeUnattempted}
              </p>
            </td>
          </tr>
        `.trim();
      }).join("")
    : `
      <tr>
        <td style="font-size:13px;line-height:1.7;color:#6b7280;">
          Subject-wise performance will appear once the test has mapped sections or subject labels.
        </td>
      </tr>
    `.trim();

  const subject = `Your Rank Pulse result is ready: ${testTitle}`;
  const textContent = [
    `Hi ${studentName || "Student"},`,
    "",
    `Your result for ${testTitle} is now ready.`,
    `Score: ${formatMetricNumber(score, 2)} / ${formatMetricNumber(totalPoints, 2)}`,
    `Score percentage: ${formatPercentLabel(percentage)}`,
    `Status: ${scoreStatus}`,
    `Passing benchmark: ${passingBenchmarkLabel}`,
    `Attempted: ${attemptedQuestions}/${totalQuestions}`,
    `Correct: ${correctQuestions}`,
    `Incorrect: ${incorrectQuestions}`,
    `Not attempted: ${unattemptedQuestions}`,
    `Time spent: ${formatDurationLabel(timeSpentSeconds)}`,
    `Submitted at: ${submittedLabel}`,
    "",
    "Subject performance:",
    ...subjectSummaryLines,
    "",
    `Open full analysis: ${analysisUrl}`,
    "",
    "Team Rank Pulse",
  ].join("\n");

  const htmlContent = `
    <div style="background:#fff7e8;padding:32px 16px;font-family:Arial,sans-serif;color:#1f2937;">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #fed7aa;border-radius:24px;overflow:hidden;">
        <div style="padding:24px 28px;background:linear-gradient(135deg,#fff7e8 0%,#ffedd5 100%);border-bottom:1px solid #fed7aa;">
          <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:${passed ? "#16a34a" : "#d97706"};color:#ffffff;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">
            ${safeScoreStatus}
          </div>
          <h1 style="margin:16px 0 8px;font-size:28px;line-height:1.15;color:#111827;">Your test result is ready</h1>
          <p style="margin:0;font-size:15px;line-height:1.7;color:#4b5563;">
            Hi ${safeStudentName}, here is the latest performance snapshot for <strong>${safeTestTitle}</strong>.
          </p>
          <p style="margin:10px 0 0;font-size:13px;line-height:1.6;color:#6b7280;">
            Submitted on ${safeSubmittedLabel}
          </p>
        </div>

        <div style="padding:28px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:12px 12px;">
            <tr>
              <td width="50%" valign="top" style="border:1px solid #fed7aa;border-radius:18px;background:#fffaf0;padding:16px 18px;">
                <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#92400e;">Score</p>
                <p style="margin:0;font-size:28px;font-weight:700;color:#111827;">${safeScore}<span style="font-size:16px;color:#6b7280;"> / ${safeTotalPoints}</span></p>
              </td>
              <td width="50%" valign="top" style="border:1px solid #dbeafe;border-radius:18px;background:#f8fbff;padding:16px 18px;">
                <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#1d4ed8;">Score Percentage</p>
                <p style="margin:0;font-size:28px;font-weight:700;color:#111827;">${safePercentage}</p>
              </td>
            </tr>
            <tr>
              <td width="50%" valign="top" style="border:1px solid #e5e7eb;border-radius:18px;background:#ffffff;padding:16px 18px;">
                <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4b5563;">Attempted</p>
                <p style="margin:0;font-size:28px;font-weight:700;color:#111827;">${safeAttemptedLabel}</p>
              </td>
              <td width="50%" valign="top" style="border:1px solid #dcfce7;border-radius:18px;background:#f0fdf4;padding:16px 18px;">
                <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#166534;">Correct</p>
                <p style="margin:0;font-size:28px;font-weight:700;color:#111827;">${safeCorrectLabel}</p>
              </td>
            </tr>
          </table>

          <div style="margin-top:20px;border:1px solid #fed7aa;border-radius:20px;background:#fffaf0;padding:20px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
              <tr>
                <td style="font-size:16px;font-weight:700;color:#111827;">Answer distribution</td>
                <td align="right" style="font-size:12px;color:#6b7280;">Passing benchmark: ${safePassingBenchmarkLabel}</td>
              </tr>
            </table>

            <div style="margin-top:14px;background:#e5e7eb;border-radius:999px;height:14px;overflow:hidden;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="height:14px;border-collapse:collapse;">
                <tr>
                  <td style="width:${correctPct}%;background:#22c55e;"></td>
                  <td style="width:${incorrectPct}%;background:#ef4444;"></td>
                  <td style="width:${unattemptedPct}%;background:#94a3b8;"></td>
                </tr>
              </table>
            </div>

            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0 10px;margin-top:14px;">
              <tr>
                <td style="font-size:13px;color:#374151;"><span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:#22c55e;margin-right:8px;"></span>Correct: ${safeCorrectLabel}</td>
                <td style="font-size:13px;color:#374151;"><span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:#ef4444;margin-right:8px;"></span>Incorrect: ${safeIncorrectLabel}</td>
              </tr>
              <tr>
                <td style="font-size:13px;color:#374151;"><span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:#94a3b8;margin-right:8px;"></span>Not attempted: ${safeUnattemptedLabel}</td>
                <td style="font-size:13px;color:#374151;"><span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:#f59e0b;margin-right:8px;"></span>Time spent: ${safeTimeSpentLabel}</td>
              </tr>
            </table>
          </div>

          <div style="margin-top:20px;border:1px solid #e5e7eb;border-radius:20px;background:#ffffff;padding:20px;">
            <h2 style="margin:0 0 14px;font-size:18px;line-height:1.3;color:#111827;">Subject performance graph</h2>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
              ${subjectRowsHtml}
            </table>
          </div>

          <div style="margin-top:24px;">
            <a href="${safeAnalysisUrl}" style="display:inline-block;background:#d97706;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:14px;font-weight:700;">
              Open Full Analysis
            </a>
          </div>

          <p style="margin:18px 0 0;font-size:13px;line-height:1.7;color:#6b7280;">
            You can review detailed analysis, question-wise solutions, and next-step improvements from your student dashboard.
          </p>
          <p style="margin:12px 0 0;font-size:12px;line-height:1.7;color:#6b7280;">
            If the button does not open, copy and paste this link into your browser:<br />
            <span style="word-break:break-all;">${safeAnalysisUrl}</span>
          </p>
        </div>
      </div>
    </div>
  `.trim();

  await sendBrevoEmail({
    to: email,
    subject,
    htmlContent,
    textContent,
    messageType: "student-test-result",
    metadata: {
      testId,
      testTitle,
      percentage,
      passed,
      totalQuestions,
      attemptedQuestions,
      correctQuestions,
      incorrectQuestions,
      unattemptedQuestions,
    },
  });
}

type StudentQuestionReportAcknowledgementEmailArgs = {
  studentName: string;
  email: string;
  questionLabel: string;
  contextTitle: string;
  reason: string;
  actionUrl: string;
};

type TeacherQuestionReportAlertEmailArgs = {
  teacherName: string;
  email: string;
  studentName: string;
  questionLabel: string;
  contextTitle: string;
  reason: string;
  actionUrl: string;
};

type StudentQuestionReportRejectedEmailArgs = {
  studentName: string;
  email: string;
  questionLabel: string;
  contextTitle: string;
  actionUrl: string;
};

type StudentQuestionUpdatedEmailArgs = {
  studentName: string;
  email: string;
  questionLabel: string;
  contextTitle: string;
  actionUrl: string;
};

export async function sendStudentQuestionReportAcknowledgementEmail({
  studentName,
  email,
  questionLabel,
  contextTitle,
  reason,
  actionUrl,
}: StudentQuestionReportAcknowledgementEmailArgs) {
  const safeStudentName = escapeHtml(studentName.trim() || "Student");
  const safeQuestionLabel = escapeHtml(questionLabel.trim() || "the reported question");
  const safeContextTitle = escapeHtml(contextTitle.trim() || "your assessment");
  const safeReason = escapeHtml(reason.trim());
  const safeActionUrl = escapeHtml(actionUrl);

  const subject = `We received your report for ${contextTitle}`;
  const textContent = [
    `Hi ${studentName || "Student"},`,
    "",
    `We received your report for ${questionLabel} in ${contextTitle}.`,
    "Your teacher will review the issue and take the appropriate action.",
    "",
    "Reported reason:",
    reason,
    "",
    `Open page: ${actionUrl}`,
    "",
    "Team Rank Pulse",
  ].join("\n");

  const htmlContent = `
    <div style="background:#fff7e8;padding:32px 16px;font-family:Arial,sans-serif;color:#1f2937;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #fed7aa;border-radius:24px;overflow:hidden;">
        <div style="padding:24px 28px;background:linear-gradient(135deg,#fff7e8 0%,#ffedd5 100%);border-bottom:1px solid #fed7aa;">
          <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:#d97706;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">
            Report Received
          </div>
          <h1 style="margin:16px 0 8px;font-size:28px;line-height:1.1;color:#111827;">Your question report is in review</h1>
          <p style="margin:0;font-size:15px;line-height:1.6;color:#4b5563;">
            Hi ${safeStudentName}, we have received your report for <strong>${safeQuestionLabel}</strong> in <strong>${safeContextTitle}</strong>.
          </p>
        </div>
        <div style="padding:28px;">
          <div style="border:1px solid #fed7aa;border-radius:18px;background:#fffaf0;padding:18px 20px;">
            <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#92400e;">
              Reported issue
            </p>
            <p style="margin:0;font-size:14px;line-height:1.7;color:#374151;">
              ${safeReason}
            </p>
          </div>
          <p style="margin:20px 0 0;font-size:14px;line-height:1.7;color:#374151;">
            The teacher who owns this question has been notified. Once the report is rejected or the question is updated, we will email you again.
          </p>
          <div style="margin-top:24px;">
            <a href="${safeActionUrl}" style="display:inline-block;background:#d97706;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:14px;font-weight:700;">
              Open Question
            </a>
          </div>
        </div>
      </div>
    </div>
  `.trim();

  await sendBrevoEmail({
    to: email,
    subject,
    htmlContent,
    textContent,
    messageType: "student-question-report-acknowledged",
    metadata: { questionLabel, contextTitle },
  });
}

export async function sendTeacherQuestionReportAlertEmail({
  teacherName,
  email,
  studentName,
  questionLabel,
  contextTitle,
  reason,
  actionUrl,
}: TeacherQuestionReportAlertEmailArgs) {
  const safeTeacherName = escapeHtml(teacherName.trim() || "Teacher");
  const safeStudentName = escapeHtml(studentName.trim() || "A student");
  const safeQuestionLabel = escapeHtml(questionLabel.trim() || "the reported question");
  const safeContextTitle = escapeHtml(contextTitle.trim() || "your assessment");
  const safeReason = escapeHtml(reason.trim());
  const safeActionUrl = escapeHtml(actionUrl);

  const subject = `Question reported in ${contextTitle}`;
  const textContent = [
    `Hi ${teacherName || "Teacher"},`,
    "",
    `${studentName || "A student"} reported ${questionLabel} in ${contextTitle}.`,
    "",
    "Reported reason:",
    reason,
    "",
    `Open review page: ${actionUrl}`,
    "",
    "Team Rank Pulse",
  ].join("\n");

  const htmlContent = `
    <div style="background:#fff7e8;padding:32px 16px;font-family:Arial,sans-serif;color:#1f2937;">
      <div style="max-width:580px;margin:0 auto;background:#ffffff;border:1px solid #fed7aa;border-radius:24px;overflow:hidden;">
        <div style="padding:24px 28px;background:linear-gradient(135deg,#fff7e8 0%,#ffedd5 100%);border-bottom:1px solid #fed7aa;">
          <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:#b91c1c;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">
            Question Report
          </div>
          <h1 style="margin:16px 0 8px;font-size:28px;line-height:1.1;color:#111827;">A student reported one of your questions</h1>
          <p style="margin:0;font-size:15px;line-height:1.6;color:#4b5563;">
            Hi ${safeTeacherName}, <strong>${safeStudentName}</strong> reported <strong>${safeQuestionLabel}</strong> in <strong>${safeContextTitle}</strong>.
          </p>
        </div>
        <div style="padding:28px;">
          <div style="border:1px solid #fecaca;border-radius:18px;background:#fff5f5;padding:18px 20px;">
            <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#b91c1c;">
              Student note
            </p>
            <p style="margin:0;font-size:14px;line-height:1.7;color:#7f1d1d;">
              ${safeReason}
            </p>
          </div>
          <p style="margin:20px 0 0;font-size:14px;line-height:1.7;color:#374151;">
            Please open the builder, review the question, and either update it or reject the report after review.
          </p>
          <div style="margin-top:24px;">
            <a href="${safeActionUrl}" style="display:inline-block;background:#d97706;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:14px;font-weight:700;">
              Open Builder
            </a>
          </div>
        </div>
      </div>
    </div>
  `.trim();

  await sendBrevoEmail({
    to: email,
    subject,
    htmlContent,
    textContent,
    messageType: "teacher-question-report-alert",
    metadata: { studentName, questionLabel, contextTitle },
  });
}

export async function sendStudentQuestionReportRejectedEmail({
  studentName,
  email,
  questionLabel,
  contextTitle,
  actionUrl,
}: StudentQuestionReportRejectedEmailArgs) {
  const safeStudentName = escapeHtml(studentName.trim() || "Student");
  const safeQuestionLabel = escapeHtml(questionLabel.trim() || "the reported question");
  const safeContextTitle = escapeHtml(contextTitle.trim() || "your assessment");
  const safeActionUrl = escapeHtml(actionUrl);

  const subject = `Your question report was reviewed for ${contextTitle}`;
  const textContent = [
    `Hi ${studentName || "Student"},`,
    "",
    `Your report for ${questionLabel} in ${contextTitle} was reviewed and rejected by the teacher.`,
    "No change was applied to the question at this time.",
    "",
    `Open page: ${actionUrl}`,
    "",
    "Team Rank Pulse",
  ].join("\n");

  const htmlContent = `
    <div style="background:#fff7e8;padding:32px 16px;font-family:Arial,sans-serif;color:#1f2937;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #fed7aa;border-radius:24px;overflow:hidden;">
        <div style="padding:24px 28px;background:linear-gradient(135deg,#fff7e8 0%,#ffedd5 100%);border-bottom:1px solid #fed7aa;">
          <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:#9f1239;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">
            Report Closed
          </div>
          <h1 style="margin:16px 0 8px;font-size:28px;line-height:1.1;color:#111827;">Your report was rejected after review</h1>
          <p style="margin:0;font-size:15px;line-height:1.6;color:#4b5563;">
            Hi ${safeStudentName}, the teacher reviewed your report for <strong>${safeQuestionLabel}</strong> in <strong>${safeContextTitle}</strong> and rejected it.
          </p>
        </div>
        <div style="padding:28px;">
          <div style="border:1px solid #fbcfe8;border-radius:18px;background:#fff1f2;padding:18px 20px;">
            <p style="margin:0;font-size:14px;line-height:1.7;color:#7f1d1d;">
              No update was made to the question based on this report.
            </p>
          </div>
          <div style="margin-top:24px;">
            <a href="${safeActionUrl}" style="display:inline-block;background:#d97706;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:14px;font-weight:700;">
              Open Question
            </a>
          </div>
        </div>
      </div>
    </div>
  `.trim();

  await sendBrevoEmail({
    to: email,
    subject,
    htmlContent,
    textContent,
    messageType: "student-question-report-rejected",
    metadata: { questionLabel, contextTitle },
  });
}

export async function sendStudentQuestionUpdatedEmail({
  studentName,
  email,
  questionLabel,
  contextTitle,
  actionUrl,
}: StudentQuestionUpdatedEmailArgs) {
  const safeStudentName = escapeHtml(studentName.trim() || "Student");
  const safeQuestionLabel = escapeHtml(questionLabel.trim() || "a reported question");
  const safeContextTitle = escapeHtml(contextTitle.trim() || "your exam");
  const safeActionUrl = escapeHtml(actionUrl);

  const subject = `Updated question available for ${contextTitle}`;
  const textContent = [
    `Hi ${studentName || "Student"},`,
    "",
    `${questionLabel} in ${contextTitle} has been updated by the teacher.`,
    "If you are preparing for this exam, please review the latest version in the portal.",
    "",
    `Open portal: ${actionUrl}`,
    "",
    "Team Rank Pulse",
  ].join("\n");

  const htmlContent = `
    <div style="background:#fff7e8;padding:32px 16px;font-family:Arial,sans-serif;color:#1f2937;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #fed7aa;border-radius:24px;overflow:hidden;">
        <div style="padding:24px 28px;background:linear-gradient(135deg,#fff7e8 0%,#ffedd5 100%);border-bottom:1px solid #fed7aa;">
          <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:#16a34a;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">
            Question Updated
          </div>
          <h1 style="margin:16px 0 8px;font-size:28px;line-height:1.1;color:#111827;">A question was updated for your exam</h1>
          <p style="margin:0;font-size:15px;line-height:1.6;color:#4b5563;">
            Hi ${safeStudentName}, <strong>${safeQuestionLabel}</strong> in <strong>${safeContextTitle}</strong> was updated after teacher review.
          </p>
        </div>
        <div style="padding:28px;">
          <div style="border:1px solid #bbf7d0;border-radius:18px;background:#f0fdf4;padding:18px 20px;">
            <p style="margin:0;font-size:14px;line-height:1.7;color:#166534;">
              Please check the latest version before your next attempt or review session.
            </p>
          </div>
          <div style="margin-top:24px;">
            <a href="${safeActionUrl}" style="display:inline-block;background:#d97706;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:14px;font-weight:700;">
              Open Portal
            </a>
          </div>
        </div>
      </div>
    </div>
  `.trim();

  await sendBrevoEmail({
    to: email,
    subject,
    htmlContent,
    textContent,
    messageType: "student-question-updated",
    metadata: { questionLabel, contextTitle },
  });
}

export async function sendPendingStudentReviewEscalationEmail({
  studentName,
  studentEmail,
  username,
  subject,
  reviewStartedAt,
}: {
  studentName: string;
  studentEmail: string;
  username: string;
  subject: string | null;
  reviewStartedAt: Date | string | null;
}) {
  const safeName = escapeHtml(studentName.trim() || "Student");
  const safeStudentEmail = escapeHtml(studentEmail.trim());
  const safeUsername = escapeHtml(username.trim());
  const safeSubject = escapeHtml(subject?.trim() || "Not selected");
  const reviewDate = reviewStartedAt ? new Date(reviewStartedAt) : null;
  const reviewStartedLabel = reviewDate && !Number.isNaN(reviewDate.getTime())
    ? reviewDate.toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      })
    : "Unknown";
  const safeReviewStartedLabel = escapeHtml(reviewStartedLabel);
  const portalUrl = readPortalUrl();
  const safePortalUrl = escapeHtml(portalUrl);

  const emailSubject = "Pending student verification requires review";
  const textContent = [
    "Hi Sameer,",
    "",
    "A student account has been pending verification for more than 24 hours.",
    "",
    `Student name: ${studentName || "Student"}`,
    `Student email: ${studentEmail}`,
    `Username: ${username}`,
    `Target exam: ${subject?.trim() || "Not selected"}`,
    `Review started: ${reviewStartedLabel}`,
    "",
    `Open Rank Pulse: ${portalUrl}`,
  ].join("\n");

  const htmlContent = `
    <div style="background:#fff7e8;padding:32px 16px;font-family:Arial,sans-serif;color:#1f2937;">
      <div style="max-width:580px;margin:0 auto;background:#ffffff;border:1px solid #fed7aa;border-radius:24px;overflow:hidden;">
        <div style="padding:24px 28px;background:linear-gradient(135deg,#fff7e8 0%,#ffedd5 100%);border-bottom:1px solid #fed7aa;">
          <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:#d97706;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">
            Verification Pending
          </div>
          <h1 style="margin:16px 0 8px;font-size:28px;line-height:1.1;color:#111827;">A student review is waiting for action</h1>
          <p style="margin:0;font-size:15px;line-height:1.6;color:#4b5563;">
            This student account has remained pending for more than 24 hours.
          </p>
        </div>
        <div style="padding:28px;">
          <div style="border:1px solid #fed7aa;border-radius:18px;background:#fffaf0;padding:18px 20px;">
            <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#92400e;">
              Student details
            </p>
            <p style="margin:0;font-size:14px;line-height:1.8;color:#374151;">
              <strong>Name:</strong> ${safeName}<br />
              <strong>Email:</strong> ${safeStudentEmail}<br />
              <strong>Username:</strong> ${safeUsername}<br />
              <strong>Target exam:</strong> ${safeSubject}<br />
              <strong>Review started:</strong> ${safeReviewStartedLabel}
            </p>
          </div>
          <div style="margin-top:24px;">
            <a href="${safePortalUrl}" style="display:inline-block;background:#d97706;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:14px;font-weight:700;">
              Open Rank Pulse
            </a>
          </div>
        </div>
      </div>
    </div>
  `.trim();

  await sendBrevoEmail({
    to: PENDING_STUDENT_ESCALATION_EMAIL,
    subject: emailSubject,
    htmlContent,
    textContent,
    messageType: "pending-review-escalation",
    metadata: { studentName, studentEmail, username, subject },
  });
}

function renderStudentReviewInfoRow(label: string, value: string) {
  return `
    <tr>
      <td style="padding:10px 0 10px 0;color:#6b7280;font-size:13px;font-weight:700;vertical-align:top;width:160px;">${escapeHtml(label)}</td>
      <td style="padding:10px 0;color:#111827;font-size:14px;line-height:1.7;">${escapeHtml(value || "Not provided")}</td>
    </tr>
  `.trim();
}

export async function sendNewStudentReviewRequestEmail({
  reviewer,
  studentId,
  cycleAt,
  studentSummary,
  quickActionsEnabled,
}: {
  reviewer: StudentReviewRecipient;
  studentId: number;
  cycleAt: number;
  studentSummary: StudentReviewSummary;
  quickActionsEnabled: boolean;
}) {
  const portalUrl = readPortalUrl();
  const safePortalUrl = escapeHtml(portalUrl);
  const safeReviewerName = escapeHtml(reviewer.reviewerName || "Super Admin");
  const subject = `New student setup submitted: ${studentSummary.studentName}`;
  const approveUrl = buildStudentReviewActionUrl({
    studentId,
    reviewerId: reviewer.reviewerId,
    action: "approve",
    cycleAt,
  });
  const rejectUrl = buildStudentReviewActionUrl({
    studentId,
    reviewerId: reviewer.reviewerId,
    action: "reject",
    cycleAt,
  });

  const textLines = [
    `Hi ${reviewer.reviewerName || "Super Admin"},`,
    "",
    "A new student has completed account setup and is waiting for verification.",
    "",
    `Name: ${studentSummary.studentName}`,
    `Username: ${studentSummary.username}`,
    `Email: ${studentSummary.studentEmail}`,
    `Phone: ${studentSummary.phone}`,
    `Submitted at: ${studentSummary.submittedAtLabel}`,
    `Target exam: ${studentSummary.targetExam}`,
    `Date of birth: ${studentSummary.dateOfBirth}`,
    `WhatsApp: ${studentSummary.whatsappNumber}`,
    `Address: ${studentSummary.addressLine}`,
    `Class level: ${studentSummary.classLevel}`,
    `Board: ${studentSummary.board}`,
    `Target year: ${studentSummary.targetYear}`,
    `Learning mode: ${studentSummary.learningMode}`,
    `Learning provider: ${studentSummary.learningProvider}`,
    `How they heard about Rank Pulse: ${studentSummary.hearAboutUs}`,
    "",
  ];

  if (quickActionsEnabled) {
    textLines.push(`Approve: ${approveUrl}`);
    textLines.push(`Reject with reason: ${rejectUrl}`);
    textLines.push("");
  }

  textLines.push(`Open dashboard: ${portalUrl}/super-admin/students`);

  const detailsTable = [
    renderStudentReviewInfoRow("Student name", studentSummary.studentName),
    renderStudentReviewInfoRow("Username", `@${studentSummary.username}`),
    renderStudentReviewInfoRow("Email", studentSummary.studentEmail),
    renderStudentReviewInfoRow("Phone", studentSummary.phone),
    renderStudentReviewInfoRow("Submitted at", studentSummary.submittedAtLabel),
    renderStudentReviewInfoRow("Target exam", studentSummary.targetExam),
    renderStudentReviewInfoRow("Date of birth", studentSummary.dateOfBirth),
    renderStudentReviewInfoRow("WhatsApp", studentSummary.whatsappNumber),
    renderStudentReviewInfoRow("Address", studentSummary.addressLine),
    renderStudentReviewInfoRow("Class level", studentSummary.classLevel),
    renderStudentReviewInfoRow("Board", studentSummary.board),
    renderStudentReviewInfoRow("Target year", studentSummary.targetYear),
    renderStudentReviewInfoRow("Learning mode", studentSummary.learningMode),
    renderStudentReviewInfoRow("Learning provider", studentSummary.learningProvider),
    renderStudentReviewInfoRow("Discovery source", studentSummary.hearAboutUs),
  ].join("");

  const actionBlock = quickActionsEnabled
    ? `
      <div style="margin-top:24px;display:flex;flex-wrap:wrap;gap:12px;">
        <a href="${escapeHtml(approveUrl)}" style="display:inline-block;background:#15803d;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:14px;font-weight:700;">
          Verify Student
        </a>
        <a href="${escapeHtml(rejectUrl)}" style="display:inline-block;background:#b91c1c;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:14px;font-weight:700;">
          Reject With Reason
        </a>
      </div>
      <p style="margin:14px 0 0;font-size:12px;line-height:1.7;color:#6b7280;">
        These quick actions stay valid for the current review cycle only. If the student resubmits updated details later, old links stop working automatically.
      </p>
    `.trim()
    : `
      <div style="margin-top:24px;">
        <a href="${safePortalUrl}/super-admin/students" style="display:inline-block;background:#d97706;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:14px;font-weight:700;">
          Open Student Reviews
        </a>
      </div>
    `.trim();

  const htmlContent = `
    <div style="background:#fff7e8;padding:32px 16px;font-family:Arial,sans-serif;color:#1f2937;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #fed7aa;border-radius:24px;overflow:hidden;">
        <div style="padding:24px 28px;background:linear-gradient(135deg,#fff7e8 0%,#ffedd5 100%);border-bottom:1px solid #fed7aa;">
          <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:#d97706;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">
            New Student Review
          </div>
          <h1 style="margin:16px 0 8px;font-size:28px;line-height:1.1;color:#111827;">Student setup submitted for verification</h1>
          <p style="margin:0;font-size:15px;line-height:1.6;color:#4b5563;">
            Hi ${safeReviewerName}, a new student has completed onboarding and is waiting for your review.
          </p>
        </div>
        <div style="padding:28px;">
          <div style="border:1px solid #fed7aa;border-radius:18px;background:#fffaf0;padding:18px 20px;">
            <table style="width:100%;border-collapse:collapse;">
              ${detailsTable}
            </table>
          </div>
          ${actionBlock}
        </div>
      </div>
    </div>
  `.trim();

  await sendBrevoEmail({
    to: reviewer.reviewerEmail,
    subject,
    htmlContent,
    textContent: textLines.join("\n"),
    messageType: "student-review-request",
    metadata: {
      studentId,
      reviewerId: reviewer.reviewerId,
      studentEmail: studentSummary.studentEmail,
      targetExam: studentSummary.targetExam,
      quickActionsEnabled,
    },
  });
}

export function queueStudentApprovedEmail(args: { studentName: string; email: string }) {
  void sendStudentApprovedEmail(args).catch((error) => {
    logger.warn({ error, email: args.email }, "Failed to send student approval email via Brevo");
  });
}

export function queueTeacherWelcomeEmail(args: {
  teacherName: string;
  email: string;
  username: string;
  resetUrl: string;
  subject?: string | null;
}) {
  void sendTeacherWelcomeEmail(args).catch((error) => {
    logger.warn({ error, email: args.email }, "Failed to send teacher welcome email via Brevo");
  });
}

export function queueStudentTestResultEmail(args: StudentTestResultEmailArgs) {
  void sendStudentTestResultEmail(args).catch((error) => {
    logger.warn({ error, email: args.email, testId: args.testId }, "Failed to send student test result email via Brevo");
  });
}

export function queueStudentQuestionReportAcknowledgementEmail(args: StudentQuestionReportAcknowledgementEmailArgs) {
  void sendStudentQuestionReportAcknowledgementEmail(args).catch((error) => {
    logger.warn({ error, email: args.email, questionLabel: args.questionLabel }, "Failed to send question report acknowledgement email via Brevo");
  });
}

export function queueTeacherQuestionReportAlertEmail(args: TeacherQuestionReportAlertEmailArgs) {
  void sendTeacherQuestionReportAlertEmail(args).catch((error) => {
    logger.warn({ error, email: args.email, questionLabel: args.questionLabel }, "Failed to send teacher question report alert email via Brevo");
  });
}

export function queueStudentQuestionReportRejectedEmail(args: StudentQuestionReportRejectedEmailArgs) {
  void sendStudentQuestionReportRejectedEmail(args).catch((error) => {
    logger.warn({ error, email: args.email, questionLabel: args.questionLabel }, "Failed to send question report rejected email via Brevo");
  });
}

export function queueStudentQuestionUpdatedEmail(args: StudentQuestionUpdatedEmailArgs) {
  void sendStudentQuestionUpdatedEmail(args).catch((error) => {
    logger.warn({ error, email: args.email, questionLabel: args.questionLabel }, "Failed to send question updated email via Brevo");
  });
}

export function queueStudentRejectedEmail(args: { studentName: string; email: string; reason: string }) {
  void sendStudentRejectedEmail(args).catch((error) => {
    logger.warn({ error, email: args.email }, "Failed to send student rejection email via Brevo");
  });
}

export function queuePendingStudentReviewEscalationEmail(args: {
  studentName: string;
  studentEmail: string;
  username: string;
  subject: string | null;
  reviewStartedAt: Date | string | null;
}) {
  void sendPendingStudentReviewEscalationEmail(args).catch((error) => {
    logger.warn(
      { error, email: PENDING_STUDENT_ESCALATION_EMAIL, studentEmail: args.studentEmail },
      "Failed to send pending student review escalation email via Brevo",
    );
  });
}

export function queueNewStudentReviewRequestEmails(args: {
  studentId: number;
  cycleAt: number;
  studentSummary: StudentReviewSummary;
  recipients: StudentReviewRecipient[];
  quickActionsEnabled: boolean;
}) {
  for (const reviewer of args.recipients) {
    void sendNewStudentReviewRequestEmail({
      reviewer,
      studentId: args.studentId,
      cycleAt: args.cycleAt,
      studentSummary: args.studentSummary,
      quickActionsEnabled: args.quickActionsEnabled,
    }).catch((error) => {
      logger.warn(
        { error, reviewerEmail: reviewer.reviewerEmail, studentEmail: args.studentSummary.studentEmail },
        "Failed to send new student review request email via Brevo",
      );
    });
  }
}
