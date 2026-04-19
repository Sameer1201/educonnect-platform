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
  replyToEmail: string;
  replyToName: string;
  dailyLimit: number;
  dailySoftLimit: number;
  source: "environment" | "database";
  isActive: boolean;
};

type DailyUsageSummary = {
  sentCount: number;
  lastSentAt: Date | null;
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
        const replyToEmail = typeof record.replyToEmail === "string" ? record.replyToEmail.trim() : "";
        const replyToName = typeof record.replyToName === "string" && record.replyToName.trim()
          ? record.replyToName.trim()
          : senderName;
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
          replyToEmail,
          replyToName,
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
  const replyToEmail = readTrimmedEnv("BREVO_REPLY_TO_EMAIL");
  const replyToName = readTrimmedEnv("BREVO_REPLY_TO_NAME") || senderName;

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
    replyToEmail,
    replyToName,
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
    replyToEmail: row.replyToEmail?.trim() || row.senderEmail,
    replyToName: row.replyToName?.trim() || row.senderName,
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
      replyTo: account.replyToEmail
        ? {
            email: account.replyToEmail,
            name: account.replyToName,
          }
        : undefined,
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
      replyToEmail: account.replyToEmail || null,
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
  replyToEmail,
  replyToName,
  dailyLimit,
  dailySoftLimit,
  createdById,
}: {
  providerName: string;
  apiKey: string;
  senderEmail: string;
  senderName?: string;
  replyToEmail?: string;
  replyToName?: string;
  dailyLimit?: number;
  dailySoftLimit?: number;
  createdById?: number | null;
}) {
  const trimmedProviderName = providerName.trim() || "Brevo Account";
  const trimmedApiKey = apiKey.trim();
  const trimmedSenderEmail = senderEmail.trim();
  const trimmedSenderName = senderName?.trim() || "Rank Pulse";
  const trimmedReplyToEmail = replyToEmail?.trim() || trimmedSenderEmail;
  const trimmedReplyToName = replyToName?.trim() || trimmedSenderName;

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
      replyToEmail: trimmedReplyToEmail,
      replyToName: trimmedReplyToName,
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
