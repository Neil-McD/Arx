import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { getFreshChatgptAuthForUser, isWebChatgptSpikeEnabled, runChatgptCompletion } from "./httpChatgpt";

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toIsoOrNull(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value * 1000).toISOString();
}

export const probeChatgptConnection = action({
  args: {
    authSubject: v.optional(v.string()),
    modelId: v.optional(v.string()),
    prompt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!isWebChatgptSpikeEnabled()) throw new Error("Web ChatGPT auth is disabled.");

    const actor = (await ctx.runQuery(api.auth.getActor as any, {
      authState: "authenticated",
      authSubject: args.authSubject ?? undefined,
    })) as { authSubject?: unknown } | null;
    const authSubject = normalizeString(actor?.authSubject);
    if (!authSubject) throw new Error("authenticated_user_required");

    const userId = await ctx.runQuery(internal.providerConnections.getUserIdByAuthSubjectInternal as any, {
      authSubject,
    });
    if (!userId) throw new Error("authenticated_user_required");

    const modelId = normalizeString(args.modelId) || "gpt-5.2";
    const prompt = normalizeString(args.prompt) || "Reply with exactly the word OK.";
    const auth = await getFreshChatgptAuthForUser({
      ctx,
      userId: String(userId),
    });

    if (!auth) {
      return {
        ok: false,
        status: 403,
        code: "provider_connection_required",
        message: "Reconnect ChatGPT / Codex and retry.",
        model_id: modelId,
        resolved_model_id: null,
        elapsed_ms: 0,
        content_preview: null,
        email: null,
        account_id: null,
        token_expires_at: null,
        content_type: null,
        body_preview: null,
        upstream_request_id: null,
        cf_ray: null,
      };
    }

    const startedAt = Date.now();
    const result = await runChatgptCompletion({
      ctx,
      userId: String(userId),
      modelId,
      messages: [
        { role: "system", content: "Be concise. Reply in plain text." },
        { role: "user", content: prompt },
      ],
      maxTokens: 128,
    });
    const elapsedMs = Date.now() - startedAt;

    if ((result as any)?.ok === false) {
      return {
        ok: false,
        status: typeof (result as any).status === "number" ? (result as any).status : null,
        code: normalizeString((result as any).code) || "chatgpt_probe_failed",
        message: normalizeString((result as any).message) || "ChatGPT probe failed.",
        model_id: modelId,
        resolved_model_id: null,
        elapsed_ms: elapsedMs,
        content_preview: null,
        email: auth.email ?? null,
        account_id: auth.accountId ?? null,
        token_expires_at: toIsoOrNull(auth.accessTokenExpiresAt),
        content_type: normalizeString((result as any).contentType) || null,
        body_preview: normalizeString((result as any).bodyPreview) || null,
        upstream_request_id: normalizeString((result as any).upstreamRequestId) || null,
        cf_ray: normalizeString((result as any).cfRay) || null,
      };
    }

    return {
      ok: true,
      status: 200,
      code: "ok",
      message: "ChatGPT probe succeeded.",
      model_id: modelId,
      resolved_model_id: normalizeString((result as any).resolvedModelId) || modelId,
      elapsed_ms: elapsedMs,
      content_preview: normalizeString((result as any).content).slice(0, 240) || null,
      email: auth.email ?? null,
      account_id: auth.accountId ?? null,
      token_expires_at: toIsoOrNull(auth.accessTokenExpiresAt),
      content_type: null,
      body_preview: null,
      upstream_request_id: null,
      cf_ray: null,
    };
  },
});
