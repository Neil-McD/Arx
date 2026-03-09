import { internal } from "./_generated/api";

type HttpRouterLike = {
  route: (config: {
    path: string;
    method: string;
    handler: unknown;
  }) => void;
};

type HttpActionLike = (handler: (ctx: unknown, req: Request) => Promise<Response>) => unknown;

type RegisterRuntimeBillingRoutesArgs = {
  http: HttpRouterLike;
  httpAction: HttpActionLike;
  jsonResponse: (req: Request, status: number, payload: unknown) => Response;
  optionsResponse: (req: Request) => Response;
};

type BillingSubscriptionSyncInput = {
  community_id?: unknown;
  communityId?: unknown;
  user_id?: unknown;
  userId?: unknown;
  status?: unknown;
  price_point_id?: unknown;
  pricePointId?: unknown;
  provider_price_id?: unknown;
  providerPriceId?: unknown;
  provider_subscription_id?: unknown;
  providerSubscriptionId?: unknown;
  provider_customer_id?: unknown;
  providerCustomerId?: unknown;
  current_period_start_at?: unknown;
  currentPeriodStartAt?: unknown;
  current_period_end_at?: unknown;
  currentPeriodEndAt?: unknown;
  cancel_at_period_end?: unknown;
  cancelAtPeriodEnd?: unknown;
  now_ms?: unknown;
  nowMs?: unknown;
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

function parseOptionalString(value: unknown, maxLen = 300): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

function parseOptionalBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") return false;
  return null;
}

function parseOptionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.floor(value);
  if (typeof value !== "string") return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? Math.floor(parsed) : null;
}

function safeEquals(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let index = 0; index < aBytes.length; index += 1) {
    diff |= aBytes[index]! ^ bBytes[index]!;
  }
  return diff === 0;
}

function readSyncSecret(req: Request): string | null {
  const bearer = String(req.headers.get("authorization") ?? "").trim();
  if (bearer.toLowerCase().startsWith("bearer ")) {
    const token = bearer.slice(7).trim();
    if (token) return token;
  }
  const headerSecret = String(req.headers.get("x-arx-billing-sync-secret") ?? "").trim();
  return headerSecret || null;
}

export function registerRuntimeBillingRoutes(args: RegisterRuntimeBillingRoutesArgs): void {
  const { http, httpAction, jsonResponse, optionsResponse } = args;

  http.route({
    path: "/billing/community_subscription_sync",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)),
  });

  http.route({
    path: "/billing/community_subscription_sync",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      const configuredSecret = readEnv("ARX_BILLING_SYNC_SECRET");
      if (!configuredSecret) {
        return jsonResponse(req, 503, {
          ok: false,
          code: "billing_sync_not_configured",
          error: "billing_sync_not_configured",
          message: "Billing sync secret is not configured.",
        });
      }

      const providedSecret = readSyncSecret(req);
      if (!providedSecret || !safeEquals(configuredSecret, providedSecret)) {
        return jsonResponse(req, 401, {
          ok: false,
          code: "billing_sync_forbidden",
          error: "billing_sync_forbidden",
          message: "Billing sync request is not authorized.",
        });
      }

      let input: BillingSubscriptionSyncInput = {};
      try {
        input = (await req.json()) as BillingSubscriptionSyncInput;
      } catch {
        input = {};
      }

      const communityId = parseOptionalString(input.community_id ?? input.communityId, 200);
      const userId = parseOptionalString(input.user_id ?? input.userId, 200);
      const status = parseOptionalString(input.status, 120);
      if (!communityId || !userId || !status) {
        return jsonResponse(req, 400, {
          ok: false,
          code: "billing_sync_invalid_payload",
          error: "billing_sync_invalid_payload",
          message: "community_id, user_id, and status are required.",
        });
      }

      try {
        const result = await (ctx as any).runMutation(internal.billing.syncCommunitySubscriptionLifecycleInternal as any, {
          communityId,
          userId,
          status,
          pricePointId: parseOptionalString(input.price_point_id ?? input.pricePointId, 200) ?? undefined,
          providerPriceId: parseOptionalString(input.provider_price_id ?? input.providerPriceId, 200) ?? undefined,
          providerSubscriptionId:
            parseOptionalString(input.provider_subscription_id ?? input.providerSubscriptionId, 300) ?? undefined,
          providerCustomerId:
            parseOptionalString(input.provider_customer_id ?? input.providerCustomerId, 300) ?? undefined,
          currentPeriodStartIso:
            parseOptionalString(input.current_period_start_at ?? input.currentPeriodStartAt, 120) ?? undefined,
          currentPeriodEndIso:
            parseOptionalString(input.current_period_end_at ?? input.currentPeriodEndAt, 120) ?? undefined,
          cancelAtPeriodEnd:
            parseOptionalBoolean(input.cancel_at_period_end ?? input.cancelAtPeriodEnd) ?? undefined,
          nowMs: parseOptionalNumber(input.now_ms ?? input.nowMs) ?? undefined,
        });
        return jsonResponse(req, 200, {
          ok: true,
          result,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResponse(req, 400, {
          ok: false,
          code: message || "billing_sync_failed",
          error: message || "billing_sync_failed",
          message: message || "Billing sync failed.",
        });
      }
    }),
  });
}
