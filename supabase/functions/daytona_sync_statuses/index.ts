import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { jsonResponse, noStoreHeaders, withStrictCors } from "../_shared/http.ts";
import { edgeRateLimitAllow } from "../_shared/rate_limit.ts";
import { edgeRateLimitAllowKey } from "../_shared/platform_inference_core.ts";
import { isAuthApiError, requireVerifiedUserId } from "../_shared/auth.ts";
import { syncDaytonaSandboxStatusesForUser } from "../_shared/daytona_cloud_adapter.ts";

type ApiError = Error & {
  code: string;
  status: number;
};

function createApiError(code: string, message: string, status: number): ApiError {
  const err = new Error(message) as ApiError;
  err.code = code;
  err.status = status;
  return err;
}

function isApiError(error: unknown): error is ApiError {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      "status" in error &&
      typeof (error as { code?: unknown }).code === "string" &&
      typeof (error as { status?: unknown }).status === "number",
  );
}

Deno.serve(async (req: Request) => {
  const cors = withStrictCors(noStoreHeaders(), req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: cors.allowed ? 204 : 403, headers: cors.headers });
  }
  if (!cors.allowed) {
    return jsonResponse({ ok: false, error: "cors_origin_not_allowed" }, { status: 403, headers: cors.headers });
  }
  const headers = cors.headers;
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, { status: 405, headers });
  }

  try {
    const userId = await requireVerifiedUserId(req);
    const [ipAllowed, userAllowed] = await Promise.all([
      edgeRateLimitAllow({ req, key: "daytona_sync_statuses", windowSeconds: 60, limit: 60 }),
      edgeRateLimitAllowKey({ key: `daytona_sync_statuses:user:${userId}`, windowSeconds: 60, limit: 30 }),
    ]);
    if (!ipAllowed || !userAllowed) {
      return jsonResponse(
        { ok: false, error: "rate_limited", code: "rate_limited", message: "Too many requests. Try again soon." },
        { status: 429, headers: { ...headers, "Retry-After": "60" } },
      );
    }

    const summary = await syncDaytonaSandboxStatusesForUser({ userId });
    return jsonResponse(
      {
        ok: true,
        synced: summary.total,
        updated: summary.updated,
        failed: summary.failed,
      },
      { status: 200, headers },
    );
  } catch (error) {
    if (isAuthApiError(error)) {
      return jsonResponse(
        { ok: false, error: error.code, code: error.code, message: error.message },
        { status: error.status, headers },
      );
    }
    const apiError = isApiError(error)
      ? error
      : createApiError("daytona_status_sync_failed", error instanceof Error ? error.message : String(error), 500);
    return jsonResponse(
      { ok: false, error: apiError.code, code: apiError.code, message: apiError.message },
      { status: apiError.status, headers },
    );
  }
});
