import { internal } from "./_generated/api";
import { verifyResendWebhookPayload } from "./emailCore";

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
        providerEventId: svixId,
        providerMessageId,
        eventType,
        nowMs: Date.now(),
      });

      return jsonResponse(req, 200, {
        ok: true,
        event_type: eventType,
        provider_message_id: providerMessageId,
      });
    }),
  });
}
