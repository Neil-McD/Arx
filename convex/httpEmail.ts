import { internal } from "./_generated/api";
import { verifyResendWebhookPayload } from "./emailCore";
import { WORKFLOW_EMAIL_UNSUBSCRIBE_PATH } from "./communityWorkflowEmailCore";

type HttpRouteMethod = "GET" | "POST" | "DELETE" | "OPTIONS" | "PUT" | "PATCH";

type HttpRouterLike = {
  route: (config: {
    path: string;
    method: HttpRouteMethod;
    handler: any;
  }) => void;
};

type HttpActionLike = (handler: (ctx: any, req: Request) => Promise<Response>) => any;

type RegisterEmailRoutesArgs = {
  http: HttpRouterLike;
  httpAction: HttpActionLike;
  jsonResponse: (req: Request, status: number, payload: unknown) => Response;
  optionsResponse: (req: Request) => Response;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readProviderMessageId(event: Record<string, unknown>): string | null {
  const data = asRecord(event.data);
  const emailId = readString(data.email_id);
  return emailId || null;
}

function readWebhookEventType(event: Record<string, unknown>): string {
  return readString(event.type) || "unknown";
}

export function registerEmailRoutes(args: RegisterEmailRoutesArgs): void {
  const { http, httpAction, jsonResponse, optionsResponse } = args;
  const path = "/runtime/email_webhooks/resend";

  http.route({
    path,
    method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)),
  });

  http.route({
    path,
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      const payload = await req.text();
      const svixId = readString(req.headers.get("svix-id"));
      const svixTimestamp = readString(req.headers.get("svix-timestamp"));
      const svixSignature = readString(req.headers.get("svix-signature"));
      if (!payload || !svixId || !svixTimestamp || !svixSignature) {
        return jsonResponse(req, 400, {
          ok: false,
          code: "email_webhook_invalid_request",
          error: "email_webhook_invalid_request",
          message: "Webhook signature headers are required.",
        });
      }

      let event: Record<string, unknown>;
      try {
        event = verifyResendWebhookPayload({
          payload,
          svixId,
          svixTimestamp,
          svixSignature,
        });
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim()
            ? error.message.trim()
            : "Webhook signature verification failed.";
        return jsonResponse(req, 401, {
          ok: false,
          code: "email_webhook_unauthorized",
          error: "email_webhook_unauthorized",
          message,
        });
      }

      const providerMessageId = readProviderMessageId(event);
      const eventType = readWebhookEventType(event);
      await ctx.runMutation((internal as any).email.recordEmailDeliveryWebhookInternal, {
        provider: "resend",
        providerMessageId,
        eventType,
        payload: event,
        nowMs: Date.now(),
      });

      return jsonResponse(req, 200, {
        ok: true,
        event_type: eventType,
        provider_message_id: providerMessageId,
      });
    }),
  });

  // Unsubscribe from a community's automation emails. Opening the link shows a
  // button, so mail scanners that open links don't unsubscribe anyone; the
  // button and mail apps' one-click unsubscribe both POST.
  http.route({
    path: WORKFLOW_EMAIL_UNSUBSCRIBE_PATH,
    method: "GET",
    handler: httpAction(async (_ctx, req) => {
      const token = readString(new URL(req.url).searchParams.get("t"));
      return unsubscribePage(token
        ? `<h1>Unsubscribe?</h1><p>You'll stop getting this community's automated emails. Account emails still arrive.</p>
           <form method="post"><input type="hidden" name="t" value="${escapeHtml(token)}" /><button type="submit">Unsubscribe</button></form>`
        : `<h1>This link is incomplete</h1><p>Open the unsubscribe link from the email again.</p>`, token ? 200 : 400);
    }),
  });
  http.route({
    path: WORKFLOW_EMAIL_UNSUBSCRIBE_PATH,
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      let token = readString(new URL(req.url).searchParams.get("t"));
      if (!token) {
        const form = new URLSearchParams(await req.text());
        token = readString(form.get("t"));
      }
      const result = await ctx.runMutation((internal as any).email.optOutOfWorkflowEmailsInternal, { token });
      return result.status === "unsubscribed"
        ? unsubscribePage(`<h1>You're unsubscribed</h1><p>${escapeHtml(result.community_name)} won't send you automated emails any more.</p>`, 200)
        : unsubscribePage(`<h1>This link doesn't work</h1><p>Open the unsubscribe link from the email again.</p>`, 400);
    }),
  });
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function unsubscribePage(content: string, status: number): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Email preferences</title><style>body{margin:0;padding:48px 16px;background:#fafaf9;color:#151a16;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
main{max-width:440px;margin:0 auto}h1{font-size:22px;margin:0 0 8px}p{font-size:15px;line-height:1.55;color:#4b524d}
button{margin-top:12px;padding:10px 16px;border:0;border-radius:8px;background:#151a16;color:#fff;font-size:15px;cursor:pointer}</style></head>
<body><main>${content}</main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
