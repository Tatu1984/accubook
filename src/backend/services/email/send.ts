import { env } from "@/config/env";
import { logger } from "@/backend/utils/logger";

/**
 * Email sending — provider-agnostic wrapper.
 *
 * When `RESEND_API_KEY` + `EMAIL_FROM` are set, this hits Resend's HTTP
 * API. When either is missing the call is a no-op and we log at info
 * level so the developer can see what *would* have been sent. This lets
 * the rest of the app call `sendEmail({...})` unconditionally without
 * tracking whether email is configured.
 *
 * Provider chosen: Resend. To switch, replace just the body of
 * `sendViaResend`. The public `sendEmail` signature is provider-neutral.
 */

export type EmailMessage = {
  to: string | string[];
  subject: string;
  /** Plain-text body. Either text or html (or both) is required. */
  text?: string;
  /** HTML body. Resend escapes nothing — caller is responsible for sanitization. */
  html?: string;
  /** Optional reply-to. */
  replyTo?: string;
  /** Optional tags for searchable email logs (Resend supports up to 10). */
  tags?: Array<{ name: string; value: string }>;
};

export type EmailSendResult =
  | { ok: true; provider: "resend"; id: string }
  | { ok: true; provider: "noop"; reason: string }
  | { ok: false; error: string };

export async function sendEmail(message: EmailMessage): Promise<EmailSendResult> {
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;

  if (!apiKey || !from) {
    logger.info(
      {
        to: message.to,
        subject: message.subject,
        suppressedReason: !apiKey ? "RESEND_API_KEY unset" : "EMAIL_FROM unset",
      },
      "Email no-op — provider unconfigured"
    );
    return {
      ok: true,
      provider: "noop",
      reason: !apiKey ? "RESEND_API_KEY unset" : "EMAIL_FROM unset",
    };
  }

  if (!message.text && !message.html) {
    return { ok: false, error: "EmailMessage requires `text` or `html`" };
  }

  return sendViaResend(message, apiKey, from);
}

/** Resend should respond well under a second on the happy path. Cap at
 * 5s so a stalled provider can't hold a request thread (and any
 * synchronous post-tx caller). On timeout, return `{ ok: false }` —
 * the caller logs and moves on; the entity is already saved. */
const RESEND_TIMEOUT_MS = 5_000;

async function sendViaResend(
  message: EmailMessage,
  apiKey: string,
  from: string
): Promise<EmailSendResult> {
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(message.to) ? message.to : [message.to],
        subject: message.subject,
        ...(message.text ? { text: message.text } : {}),
        ...(message.html ? { html: message.html } : {}),
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        ...(message.tags ? { tags: message.tags } : {}),
      }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });

    if (!resp.ok) {
      const body = await resp.text();
      logger.error(
        { status: resp.status, body, to: message.to, subject: message.subject },
        "Resend rejected the email"
      );
      return { ok: false, error: `Resend ${resp.status}: ${body.slice(0, 200)}` };
    }

    const data = (await resp.json()) as { id?: string };
    return { ok: true, provider: "resend", id: data.id ?? "unknown" };
  } catch (e) {
    // AbortError when the timeout fires; surface it cleanly so callers
    // know the difference between "Resend rejected" and "Resend stalled".
    const err = e as Error & { name?: string };
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      logger.error(
        { to: message.to, subject: message.subject, timeoutMs: RESEND_TIMEOUT_MS },
        "Resend timed out"
      );
      return { ok: false, error: `Resend timed out after ${RESEND_TIMEOUT_MS}ms` };
    }
    logger.error({ err: e, to: message.to, subject: message.subject }, "sendViaResend failed");
    return { ok: false, error: err.message };
  }
}

/**
 * Helper for one-off "you have an approval waiting" emails. Caller
 * supplies the approver email + entity context; this builds the
 * subject + body and delegates to `sendEmail`.
 */
export async function sendApprovalRequestEmail(opts: {
  approverEmail: string;
  approverName?: string;
  requesterName: string;
  entityType: string;
  entityLabel: string;
  amount?: string;
}): Promise<EmailSendResult> {
  const appUrl = env.APP_URL ?? env.NEXTAUTH_URL ?? "";
  const inboxUrl = appUrl ? `${appUrl.replace(/\/$/, "")}/approvals` : "/approvals";
  const subject = `Approval needed: ${opts.entityType} ${opts.entityLabel}`;
  const greeting = opts.approverName ? `Hi ${opts.approverName},` : "Hi,";
  const text =
    `${greeting}\n\n` +
    `${opts.requesterName} has submitted ${opts.entityType.toLowerCase()} ${opts.entityLabel}` +
    (opts.amount ? ` (${opts.amount})` : "") +
    ` for your approval.\n\n` +
    `Open your approval inbox: ${inboxUrl}\n\n` +
    `— accubook`;
  return sendEmail({
    to: opts.approverEmail,
    subject,
    text,
    tags: [
      { name: "kind", value: "approval-request" },
      { name: "entityType", value: opts.entityType },
    ],
  });
}
