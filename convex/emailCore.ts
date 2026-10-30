import { Resend } from "resend";

export const EMAIL_TEMPLATE_KEYS = [
  "community_access_granted",
  "billing_issue",
  "founder_checkout_recovery",
  "weekly_member_digest",
  "event_reminder",
  "mention_notification",
  "dm_message_notification",
  "community_workflow_email",
  "founder_daily_brief",
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
        style="display:inline-block;padding:12px 18px;border-radius:12px;background:#f1ede5;color:#0a0a0a;text-decoration:none;font-weight:700;"
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
        <div style="margin:0 0 16px;padding:16px;border:1px solid #3a3a3a;border-radius:14px;background:#222222;">
          <div style="font-size:16px;font-weight:700;color:#fcf8f0;">${escapeHtml(item.title)}</div>
          ${meta ? `<div style="margin-top:6px;font-size:12px;color:#b3ad9f;">${escapeHtml(meta)}</div>` : ""}
          ${summary ? `<div style="margin-top:10px;font-size:14px;line-height:1.55;color:#d6d0c6;">${escapeHtml(summary)}</div>` : ""}
          ${url ? `<div style="margin-top:12px;"><a href="${escapeHtml(url)}" style="color:#f1ede5;text-decoration:none;font-weight:600;">Open</a></div>` : ""}
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

function renderBriefSections(sections: Array<{ title: string; items: string[] }>): { html: string; text: string } {
  if (sections.length === 0) return { html: "", text: "" };
  const html = sections
    .map((section) => `
        <div style="margin:0 0 18px;">
          <div style="font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#b3ad9f;">${escapeHtml(section.title)}</div>
          <ul style="margin:8px 0 0;padding-left:18px;font-size:15px;line-height:1.55;color:#d6d0c6;">
            ${section.items.map((item) => `<li style="margin:0 0 6px;">${escapeHtml(item)}</li>`).join("")}
          </ul>
        </div>
      `)
    .join("");
  const text = sections
    .map((section) => [section.title.toUpperCase(), ...section.items.map((item) => `- ${item}`)].join("\n"))
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
      <div style="margin:0;padding:24px;background:#111113;color:#fcf8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
        <div style="max-width:640px;margin:0 auto;padding:24px 28px 28px;border:1px solid #3a3a3a;border-radius:20px;background:#1a1a1a;">
          <div style="display:flex;align-items:center;justify-content:flex-end;margin-bottom:14px;">
            <div style="display:flex;align-items:center;gap:12px;font-size:18px;font-weight:800;color:#fcf8f0;">
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
          <div style="font-size:28px;line-height:1.15;font-weight:800;color:#fcf8f0;">${escapeHtml(params.title)}</div>
          ${subtitle ? `<div style="margin-top:10px;font-size:14px;color:#b3ad9f;">${escapeHtml(subtitle)}</div>` : ""}
          ${intro ? `<div style="margin-top:18px;font-size:15px;line-height:1.6;color:#d6d0c6;">${escapeHtml(intro)}</div>` : ""}
          ${bodyHtml ? `<div style="margin-top:20px;">${bodyHtml}</div>` : ""}
          ${renderButton(ctaLabel, ctaUrl)}
          ${
            footerNote
              ? `<div style="margin-top:24px;font-size:12px;line-height:1.5;color:#9c968a;">${escapeHtml(footerNote)}</div>`
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
    case "billing_issue":
      return renderTransactionalTemplate(
        "Billing needs attention",
        payload,
        "Billing needs attention",
        "There is a billing issue that needs your attention.",
        "Fix billing",
      );
    case "founder_checkout_recovery":
      return renderTransactionalTemplate(
        "Finish setting up your Polynet community",
        payload,
        "Your Builder payment is confirmed",
        "Sign in with this email to finish your account and launch your community.",
        "Continue setup",
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
    case "mention_notification": {
      const communityName = readString((payload as any)?.communityName) || "your community";
      const mentionerName = readString((payload as any)?.mentionerName) || "A community member";
      const snippet = readString((payload as any)?.snippet);
      return renderTransactionalTemplate(
        `${mentionerName} mentioned you in ${communityName}`,
        payload,
        `${mentionerName} mentioned you`,
        snippet ? `"${snippet}"` : `You were mentioned in ${communityName}.`,
        "Open chat",
      );
    }
    case "dm_message_notification": {
      const senderName = readString((payload as any)?.senderName) || "Someone";
      const snippet = readString((payload as any)?.snippet);
      const sharedCommunityName = readString((payload as any)?.communityName);
      return renderTransactionalTemplate(
        `${senderName} sent you a message on Polynet`,
        payload,
        `${senderName} sent you a message`,
        snippet
          ? `"${snippet}"`
          : sharedCommunityName
            ? `New direct message from ${sharedCommunityName}.`
            : "Open Polynet to read it.",
        "Open message",
      );
    }
    case "community_workflow_email": {
      // An owner's own words, so it reads as a letter: their paragraphs, a
      // way back to the community, and the unsubscribe line every one carries.
      const subject = readString(payload.subject) || `A message from ${communityName}`;
      const body = readString(payload.body);
      const unsubscribe = readString(payload.unsubscribeUrl);
      const testNote = readString(payload.testNote);
      const paragraphs = body.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
      const bodyHtml = paragraphs.map((part) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#d6d0c6;">${escapeHtml(part).replace(/\n/g, "<br />")}</p>`).join("");
      const footer = `You get this because you're a member of ${communityName}.`;
      const shell = buildEmailShell({
        title: subject,
        subtitle: testNote || communityName,
        bodyHtml,
        ctaLabel: `Open ${communityName}`,
        ctaUrl: readString(payload.actionUrl),
        footerNote: footer,
      });
      const unsubscribeHtml = unsubscribe
        ? `<div style="max-width:640px;margin:12px auto 0;font-size:12px;color:#9c968a;text-align:center;"><a href="${escapeHtml(unsubscribe)}" style="color:#9c968a;">Unsubscribe from ${escapeHtml(communityName)} emails</a></div>`
        : "";
      return {
        subject,
        html: shell.html.replace(/<\/div>\s*$/, `${unsubscribeHtml}</div>`),
        text: [subject, paragraphs.join("\n\n"), shell.text.split("\n\n").filter((part) => part.startsWith(`Open ${communityName}`)).join(""), footer,
          unsubscribe ? `Unsubscribe: ${unsubscribe}` : ""].filter(Boolean).join("\n\n"),
      };
    }
    case "founder_daily_brief": {
      const sections = readArray(payload.sections)
        .map((section) => asRecord(section))
        .map((section) => ({
          title: readString(section.title),
          items: readArray(section.items).map(readString).filter(Boolean),
        }))
        .filter((section) => section.title && section.items.length);
      const rendered = renderBriefSections(sections);
      const nextStep = readString(payload.nextStep);
      const shell = buildEmailShell({
        title: readString(payload.headline) || `Your ${communityName} brief`,
        subtitle: dateLabel ? `${communityName} · ${dateLabel}` : communityName,
        bodyHtml: rendered.html + (nextStep
          ? `<div style="margin-top:4px;font-size:15px;line-height:1.55;color:#fcf8f0;"><strong>Suggested next step:</strong> ${escapeHtml(nextStep)}</div>`
          : ""),
        ctaLabel: "Open your agent",
        ctaUrl: readString(payload.actionUrl),
        footerNote: "Your community agent writes this brief each morning from your community's activity. It never includes what members say to the agent privately.",
      });
      return {
        subject: `Your ${communityName} brief${dateLabel ? ` · ${dateLabel}` : ""}`,
        html: shell.html,
        text: [shell.text, rendered.text, nextStep ? `Suggested next step: ${nextStep}` : ""].filter(Boolean).join("\n\n"),
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
  const unsubscribe = readString(asRecord(params.payload).unsubscribeUrl);
  const response = await resend.emails.send(
    {
      // One-click unsubscribe (RFC 8058) for emails that carry a link.
      ...(unsubscribe ? { headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : null),
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
