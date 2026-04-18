import { logger } from "./logger";

type BrevoEmailPayload = {
  to: string;
  subject: string;
  htmlContent: string;
  textContent: string;
};

function readTrimmedEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
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
  return Boolean(readTrimmedEnv("BREVO_API_KEY") && readTrimmedEnv("BREVO_SENDER_EMAIL"));
}

async function sendBrevoEmail(payload: BrevoEmailPayload) {
  const apiKey = readTrimmedEnv("BREVO_API_KEY");
  const senderEmail = readTrimmedEnv("BREVO_SENDER_EMAIL");
  const senderName = readTrimmedEnv("BREVO_SENDER_NAME") || "Rank Pulse";
  const replyToEmail = readTrimmedEnv("BREVO_REPLY_TO_EMAIL");
  const replyToName = readTrimmedEnv("BREVO_REPLY_TO_NAME") || senderName;

  if (!apiKey || !senderEmail) {
    throw new Error("Brevo email is not configured");
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: {
        email: senderEmail,
        name: senderName,
      },
      to: [{ email: payload.to }],
      replyTo: replyToEmail
        ? {
            email: replyToEmail,
            name: replyToName,
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
  });
}

export async function sendPortalPasswordResetEmail({
  accountName,
  email,
  resetLink,
  roleLabel,
}: {
  accountName: string;
  email: string;
  resetLink: string;
  roleLabel?: string;
}) {
  const safeName = escapeHtml(accountName.trim() || "Rank Pulse user");
  const safeResetLink = escapeHtml(resetLink);
  const accountLabel = roleLabel?.trim() ? `${roleLabel.trim()} account` : "Rank Pulse account";
  const safeAccountLabel = escapeHtml(accountLabel);

  const subject = "Reset your Rank Pulse password";
  const textContent = [
    `Hi ${accountName || "Rank Pulse user"},`,
    "",
    "We received a request to reset your Rank Pulse password.",
    "Use the secure link below to create a new password:",
    resetLink,
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
          <h1 style="margin:16px 0 8px;font-size:28px;line-height:1.1;color:#111827;">Reset your password</h1>
          <p style="margin:0;font-size:15px;line-height:1.6;color:#4b5563;">
            Hi ${safeName}, use the secure link below to set a new Rank Pulse password.
          </p>
        </div>
        <div style="padding:28px;">
          <div style="border:1px solid #fed7aa;border-radius:18px;background:#fffaf0;padding:18px 20px;">
            <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">
              This link is generated by Firebase authentication and is meant only for your ${safeAccountLabel}.
            </p>
          </div>
          <div style="margin-top:24px;">
            <a href="${safeResetLink}" style="display:inline-block;background:#d97706;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:14px;font-weight:700;">
              Reset password
            </a>
          </div>
          <p style="margin:16px 0 0;font-size:13px;line-height:1.7;color:#6b7280;word-break:break-word;">
            If the button does not open, use this link: ${safeResetLink}
          </p>
          <p style="margin:16px 0 0;font-size:13px;line-height:1.7;color:#6b7280;">
            If you did not request this password reset, you can safely ignore this email.
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
  });
}

export function queueStudentApprovedEmail(args: { studentName: string; email: string }) {
  if (!isBrevoConfigured()) {
    logger.info({ email: args.email }, "Brevo not configured, skipping student approval email");
    return;
  }

  void sendStudentApprovedEmail(args).catch((error) => {
    logger.warn({ error, email: args.email }, "Failed to send student approval email via Brevo");
  });
}
