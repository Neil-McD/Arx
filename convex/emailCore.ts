import { Resend } from "resend";

export const EMAIL_TEMPLATE_KEYS = [
  "community_access_granted",
  "builder_plan_upgraded",
  "builder_plan_downgraded",
  "billing_issue",
  "weekly_member_digest",
  "weekly_founder_digest",
  "event_reminder",
] as const;

export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

type DigestItem = {
  title: string;
  summary?: string;
  url?: string;
  meta?: string;
};

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore
  }
  return "";
}

function readFirstEnv(keys: readonly string[]): string {
  for (const key of keys) {
    const value = readEnv(key);
    if (value) return value;
  }
  return "";
}

function readPublicAppBaseUrl(): string {
  const value = readFirstEnv([
    "ARX_PUBLIC_APP_URL",
    "PUBLIC_APP_URL",
    "VITE_PUBLIC_APP_URL",
    "VITE_APP_URL",
  ]).replace(/\/+$/, "");
  if (/^https?:\/\//i.test(value)) return value;
  return "https://www.polynet.ai";
}

function readEmailBrandLogoUrl(): string {
  return `${readPublicAppBaseUrl()}/favicon.png`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeTemplateKey(value: unknown): EmailTemplateKey {
  const normalized = String(value ?? "").trim();
  if ((EMAIL_TEMPLATE_KEYS as readonly string[]).includes(normalized)) {
    return normalized as EmailTemplateKey;
  }
  throw new Error("email_template_invalid");
}

function renderButton(label: string, url: string): string {
  if (!label || !url) return "";
  return `
    <div style="margin:24px 0 0;">
      <a
        href="${escapeHtml(url)}"
        style="display:inline-block;padding:12px 18px;border-radius:12px;background:#f26b9a;color:#0c0d11;text-decoration:none;font-weight:700;"
      >${escapeHtml(label)}</a>
    </div>
  `;
}

function renderDigestItems(items: DigestItem[]): { html: string; text: string } {
  if (items.length === 0) {
    return { html: "", text: "" };
  }
  const html = items
    .map((item) => {
      const meta = readString(item.meta);
      const summary = readString(item.summary);
      const url = readString(item.url);
      return `
        <div style="margin:0 0 16px;padding:16px;border:1px solid #2a2d36;border-radius:14px;background:#171920;">
          <div style="font-size:16px;font-weight:700;color:#f3f4f6;">${escapeHtml(item.title)}</div>
          ${meta ? `<div style="margin-top:6px;font-size:12px;color:#98a1b3;">${escapeHtml(meta)}</div>` : ""}
          ${summary ? `<div style="margin-top:10px;font-size:14px;line-height:1.55;color:#d0d6e0;">${escapeHtml(summary)}</div>` : ""}
          ${url ? `<div style="margin-top:12px;"><a href="${escapeHtml(url)}" style="color:#f26b9a;text-decoration:none;font-weight:600;">Open</a></div>` : ""}
        </div>
      `;
    })
    .join("");
  const text = items
    .map((item) =>
      [
        item.title,
        readString(item.meta),
        readString(item.summary),
        readString(item.url),
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
  return { html, text };
}

function buildEmailShell(params: {
  title: string;
  subtitle?: string;
  intro?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  bodyHtml?: string;
  footerNote?: string;
}): { html: string; text: string } {
  const subtitle = readString(params.subtitle);
  const intro = readString(params.intro);
  const ctaLabel = readString(params.ctaLabel);
  const ctaUrl = readString(params.ctaUrl);
  const footerNote = readString(params.footerNote);
  const bodyHtml = readString(params.bodyHtml);
  const logoUrl = readEmailBrandLogoUrl();
  const textParts = [params.title, subtitle, intro].filter(Boolean);
  if (ctaLabel && ctaUrl) textParts.push(`${ctaLabel}: ${ctaUrl}`);
  if (footerNote) textParts.push(footerNote);
  return {
    html: `
      <div style="margin:0;padding:24px;background:#0f1116;color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
        <div style="max-width:640px;margin:0 auto;padding:24px 28px 28px;border:1px solid #1f2430;border-radius:20px;background:#12151c;">
          <div style="display:flex;align-items:center;justify-content:flex-end;margin-bottom:14px;">
            <div style="display:flex;align-items:center;gap:12px;font-size:18px;font-weight:800;color:#f3f4f6;">
              <img
                src="${escapeHtml(logoUrl)}"
                alt=""
                width="34"
                height="34"
                style="display:block;width:34px;height:34px;border-radius:10px;"
              />
              <span>Polynet</span>
            </div>
          </div>
          <div style="font-size:28px;line-height:1.15;font-weight:800;color:#f3f4f6;">${escapeHtml(params.title)}</div>
          ${subtitle ? `<div style="margin-top:10px;font-size:14px;color:#98a1b3;">${escapeHtml(subtitle)}</div>` : ""}
          ${intro ? `<div style="margin-top:18px;font-size:15px;line-height:1.6;color:#d0d6e0;">${escapeHtml(intro)}</div>` : ""}
          ${bodyHtml ? `<div style="margin-top:20px;">${bodyHtml}</div>` : ""}
          ${renderButton(ctaLabel, ctaUrl)}
          ${
            footerNote
              ? `<div style="margin-top:24px;font-size:12px;line-height:1.5;color:#7e8698;">${escapeHtml(footerNote)}</div>`
              : ""
          }
        </div>
      </div>
    `,
    text: textParts.join("\n\n"),
  };
}

function renderTransactionalTemplate(
  subject: string,
  payload: Record<string, unknown>,
  fallbackTitle: string,
  fallbackIntro: string,
  ctaLabel: string,
): RenderedEmail {
  const title = readString(payload.title) || fallbackTitle;
  const subtitle = readString(payload.subtitle);
  const intro = readString(payload.intro) || fallbackIntro;
  const ctaUrl = readString(payload.actionUrl);
  const footerNote = readString(payload.footerNote);
  const shell = buildEmailShell({
    title,
    subtitle,
    intro,
    ctaLabel,
    ctaUrl,
    footerNote,
  });
  return { subject, html: shell.html, text: shell.text };
}

export function renderEmailTemplate(params: {
  templateKey: unknown;
  payload: unknown;
}): RenderedEmail {
  const templateKey = normalizeTemplateKey(params.templateKey);
  const payload = asRecord(params.payload);
  const communityName = readString(payload.communityName) || "your community";
  const planName = readString(payload.planName) || "your plan";
  const dateLabel = readString(payload.dateLabel);
  const eventTitle = readString(payload.eventTitle) || "Your event";
  const items = readArray(payload.items)
    .map((item) => asRecord(item))
    .filter((item) => readString(item.title))
    .map((item) => ({
      title: readString(item.title),
      summary: readString(item.summary) || undefined,
      url: readString(item.url) || undefined,
      meta: readString(item.meta) || undefined,
    }));

  switch (templateKey) {
    case "community_access_granted":
      return renderTransactionalTemplate(
        `Your access to ${communityName} is ready`,
        payload,
        `Your access to ${communityName} is ready`,
        `You can now open ${communityName} and start participating.`,
        "Open community",
      );
    case "builder_plan_upgraded":
      return renderTransactionalTemplate(
        `Your ${planName} plan is active`,
        payload,
        `Your ${planName} plan is active`,
        `Your Polynet plan change is complete.`,
        "Open account",
      );
    case "builder_plan_downgraded":
      return renderTransactionalTemplate(
        `Your plan changed to ${planName}`,
        payload,
        `Your plan changed to ${planName}`,
        `Your Polynet account change has been recorded.`,
        "Open account",
      );
    case "billing_issue":
      return renderTransactionalTemplate(
        "Billing needs attention",
        payload,
        "Billing needs attention",
        "There is a billing issue that needs your attention.",
        "Fix billing",
      );
    case "weekly_member_digest": {
      const renderedItems = renderDigestItems(items);
      const shell = buildEmailShell({
        title: `${communityName} weekly digest`,
        subtitle: dateLabel ? `For ${dateLabel}` : communityName,
        intro:
          readString(payload.intro) ||
          `Here's what mattered in ${communityName} this week.`,
        ctaLabel: readString(payload.ctaLabel) || "Catch up",
        ctaUrl: readString(payload.actionUrl),
        bodyHtml: renderedItems.html,
        footerNote: readString(payload.footerNote),
      });
      return {
        subject: `${communityName} weekly digest${dateLabel ? ` for ${dateLabel}` : ""}`,
        html: shell.html,
        text: [shell.text, renderedItems.text].filter(Boolean).join("\n\n"),
      };
    }
    case "weekly_founder_digest": {
      const renderedItems = renderDigestItems(items);
      const shell = buildEmailShell({
        title: "Weekly founder digest",
        subtitle: dateLabel ? `For ${dateLabel}` : communityName,
        intro:
          readString(payload.intro) ||
          `Here's the operator summary for ${communityName}.`,
        ctaLabel: readString(payload.ctaLabel) || "Open community",
        ctaUrl: readString(payload.actionUrl),
        bodyHtml: renderedItems.html,
        footerNote: readString(payload.footerNote),
      });
      return {
        subject: `Weekly founder digest${dateLabel ? ` for ${dateLabel}` : ""}`,
        html: shell.html,
        text: [shell.text, renderedItems.text].filter(Boolean).join("\n\n"),
      };
    }
    case "event_reminder":
      return renderTransactionalTemplate(
        `${eventTitle} is happening tomorrow`,
        payload,
        `${eventTitle} is happening tomorrow`,
        `This is your reminder that ${eventTitle} starts soon.`,
        "View event",
      );
  }
}

let resendClient: Resend | null = null;

export function getResendClient(): Resend {
  const apiKey = readFirstEnv(["ARX_RESEND_API_KEY", "RESEND_API_KEY"]);
  if (!apiKey) throw new Error("email_provider_misconfigured");
  if (!resendClient) resendClient = new Resend(apiKey);
  return resendClient;
}

export function readEmailFromAddress(): string {
  const direct = readFirstEnv(["ARX_EMAIL_FROM", "ARX_RESEND_FROM_EMAIL"]);
  if (direct) return direct;
  const localPart = "hello";
  const domain = readFirstEnv(["ARX_EMAIL_FROM_DOMAIN", "ARX_RESEND_DOMAIN"]);
  if (!domain) throw new Error("email_sender_not_configured");
  return `${localPart}@${domain}`;
}

export function readEmailReplyToAddress(): string | null {
  const value = readFirstEnv(["ARX_EMAIL_REPLY_TO", "ARX_RESEND_REPLY_TO"]);
  return value || null;
}

export async function sendRenderedEmail(params: {
  to: string;
  templateKey: EmailTemplateKey;
  payload: unknown;
  idempotencyKey?: string | null;
}): Promise<{ providerMessageId: string | null }> {
  const resend = getResendClient();
  const rendered = renderEmailTemplate({
    templateKey: params.templateKey,
    payload: params.payload,
  });
  const response = await resend.emails.send(
    {
      from: readEmailFromAddress(),
      to: params.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      ...(readEmailReplyToAddress() ? { reply_to: readEmailReplyToAddress() as string } : null),
      tags: [
        { name: "template", value: params.templateKey },
      ],
    },
    params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined,
  );
  if (response.error) {
    throw new Error(response.error.message || "email_send_failed");
  }
  return {
    providerMessageId: readString(response.data?.id) || null,
  };
}

export function verifyResendWebhookPayload(params: {
  payload: string;
  svixId: string;
  svixTimestamp: string;
  svixSignature: string;
}): Record<string, unknown> {
  const webhookSecret = readFirstEnv(["ARX_RESEND_WEBHOOK_SECRET", "RESEND_WEBHOOK_SECRET"]);
  if (!webhookSecret) throw new Error("email_webhook_misconfigured");
  const resend = getResendClient();
  return resend.webhooks.verify({
    payload: params.payload,
    headers: {
      id: params.svixId,
      timestamp: params.svixTimestamp,
      signature: params.svixSignature,
    },
    webhookSecret,
  }) as unknown as Record<string, unknown>;
}
