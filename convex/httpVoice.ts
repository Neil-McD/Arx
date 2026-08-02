import {
  estimateVoiceTranscriptionVendorCostUsd,
  VOICE_TRANSCRIPTION_FALLBACK_DURATION_SECONDS,
  type VoiceTranscriptionProvider,
} from "../shared/workspaceCredits";
import { recordPlatformToolCostBestEffort } from "./platformToolCostAccounting";

type VoiceTranscribeInput = {
  audio_base64?: unknown;
  mime_type?: unknown;
  language?: unknown;
  prompt?: unknown;
  surface?: unknown;
  prefer_primary?: unknown;
  duration_ms?: unknown;
};

type VoiceTranscriptionResponseFormat = "verbose_json" | "json";

type VoiceTranscribeResult = {
  ok: boolean;
  text: string;
  provider: "openai" | "groq";
  model: string;
  responseFormat?: VoiceTranscriptionResponseFormat;
  durationSeconds?: number;
  durationSource?: "provider_usage" | "provider_duration";
  message?: string;
};

type VoiceTranscribeAttemptResult = VoiceTranscribeResult & {
  retryWithJson?: boolean;
};

type HttpRouteMethod = "GET" | "POST" | "DELETE" | "OPTIONS" | "PUT" | "PATCH";

type HttpRouterLike = {
  route: (config: {
    path: string;
    method: HttpRouteMethod;
    handler: PublicHttpAction;
  }) => void;
};

type HttpActionLike = (handler: (ctx: unknown, req: Request) => Promise<Response>) => PublicHttpAction;

type RequireAuthenticatedActor = (
  ctx: unknown,
  req: Request,
) => Promise<
  | {
      ok: true;
      actor: {
        userId: string;
        authSubject: string;
        email: string | null;
        displayName: string | null;
        avatarUrl: string | null;
      };
    }
  | { ok: false; response: Response }
>;

type RegisterRuntimeVoiceRoutesArgs = {
  http: HttpRouterLike;
  httpAction: HttpActionLike;
  jsonResponse: (req: Request, status: number, payload: unknown) => Response;
  optionsResponse: (req: Request) => Response;
  requireAuthenticatedActor: RequireAuthenticatedActor;
};

const DEFAULT_VOICE_PRIMARY_MODEL = "gpt-4o-mini-transcribe";
const DEFAULT_VOICE_FALLBACK_MODEL = "whisper-large-v3-turbo";
const DEFAULT_VOICE_FALLBACK_ENDPOINT = "https://api.groq.com/openai/v1/audio/transcriptions";
const DEFAULT_VOICE_PROMPT =
  "Transcribe spoken words verbatim. If speech is unclear or absent, return an empty transcript.";

type VoiceDurationEvidence = {
  durationSeconds: number;
  durationMs: number | null;
  source: "client_reported" | "server_byte_floor" | "fallback";
};

type VoicePriceQuote = {
  provider: VoiceTranscriptionProvider;
  model: string;
  durationSeconds: number;
  rawVendorCostUsd: number;
};

function newProviderCostKey(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function estimateVoiceDurationByteFloorSeconds(params: {
  audioBytes: number;
  mimeType: string;
}): number {
  const audioBytes = Math.max(0, Number(params.audioBytes) || 0);
  if (audioBytes <= 0) return 0;
  const mimeType = params.mimeType.toLowerCase();
  const conservativeBytesPerSecond =
    mimeType.includes("wav")
      ? 192_000
      : mimeType.includes("mpeg") || mimeType.includes("mp3") || mimeType.includes("mp4")
        ? 64_000
        : 64_000;
  return audioBytes / conservativeBytesPerSecond;
}

function resolveVoiceDurationEvidence(params: {
  durationMs: unknown;
  audioBytes: number;
  mimeType: string;
}): VoiceDurationEvidence {
  const byteFloorSeconds = estimateVoiceDurationByteFloorSeconds({
    audioBytes: params.audioBytes,
    mimeType: params.mimeType,
  });
  const fallbackSeconds = Math.max(
    VOICE_TRANSCRIPTION_FALLBACK_DURATION_SECONDS,
    byteFloorSeconds,
  );
  const parsed = Number(params.durationMs);
  if (Number.isFinite(parsed) && parsed > 0) {
    const roundedMs = Math.max(1, Math.round(parsed));
    const clientSeconds = roundedMs / 1000;
    if (byteFloorSeconds > clientSeconds) {
      return {
        durationMs: roundedMs,
        durationSeconds: byteFloorSeconds,
        source: "server_byte_floor",
      };
    }
    return {
      durationMs: roundedMs,
      durationSeconds: clientSeconds,
      source: "client_reported",
    };
  }
  return {
    durationMs: null,
    durationSeconds: fallbackSeconds,
    source:
      byteFloorSeconds > VOICE_TRANSCRIPTION_FALLBACK_DURATION_SECONDS
        ? "server_byte_floor"
        : "fallback",
  };
}

function quoteVoiceTranscription(params: {
  provider: VoiceTranscriptionProvider;
  model: string;
  durationSeconds: number;
}): VoicePriceQuote {
  const rawVendorCostUsd = estimateVoiceTranscriptionVendorCostUsd(params);
  return {
    provider: params.provider,
    model: params.model,
    durationSeconds: params.durationSeconds,
    rawVendorCostUsd,
  };
}

function voiceSettlementMetadata(params: {
  quote: VoicePriceQuote;
  durationEvidence: VoiceDurationEvidence;
  finalDurationSource: VoiceTranscribeResult["durationSource"] | VoiceDurationEvidence["source"];
  responseFormat?: VoiceTranscriptionResponseFormat | null;
  fallbackUsed: boolean;
  primaryError?: string | null;
}): Record<string, unknown> {
  return {
    pricing_mode: "duration_seconds",
    final_provider: params.quote.provider,
    final_model: params.quote.model,
    final_duration_seconds: params.quote.durationSeconds,
    final_duration_source: params.finalDurationSource,
    response_format: params.responseFormat ?? null,
    reserve_duration_seconds: params.durationEvidence.durationSeconds,
    reserve_duration_ms: params.durationEvidence.durationMs,
    reserve_duration_source: params.durationEvidence.source,
    final_vendor_cost_usd: params.quote.rawVendorCostUsd,
    fallback_used: params.fallbackUsed,
    primary_error: params.primaryError ?? null,
  };
}

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore
  }
  return "";
}

function isTruthyEnv(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function looksLikeApiKey(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/^(?:sk|gsk|xai|rk|or)-/i.test(v)) return true;
  if (/^(?:sk|gsk|xai|rk|or)_/i.test(v)) return true;
  if (v.length >= 40 && !v.includes("/") && !v.includes(" ") && /^[A-Za-z0-9._-]+$/.test(v)) return true;
  return false;
}

function looksLikeXaiApiKey(value: string): boolean {
  const v = value.trim();
  return /^(?:xai[-_])/i.test(v);
}

function sanitizeMimeType(input: unknown): string | null {
  const value = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (!value) return "audio/webm";
  if (value.startsWith("audio/webm")) return "audio/webm";
  if (value.startsWith("audio/mp4") || value.startsWith("audio/m4a")) return "audio/mp4";
  if (value.startsWith("audio/mpeg") || value.startsWith("audio/mp3") || value.startsWith("audio/mpga")) {
    return "audio/mpeg";
  }
  if (value.startsWith("audio/wav")) return "audio/wav";
  if (value.startsWith("audio/x-wav")) return "audio/wav";
  return null;
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes("ogg")) return ".ogg";
  if (mimeType.includes("mp4")) return ".m4a";
  if (mimeType.includes("mpeg")) return ".mp3";
  if (mimeType.includes("wav")) return ".wav";
  return ".webm";
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function decodeBase64Audio(input: string): Uint8Array {
  const cleaned = input.includes(",") ? input.slice(input.indexOf(",") + 1) : input;
  const normalized = cleaned.replace(/\s+/g, "");
  const atobFn = (globalThis as any).atob;
  if (typeof atobFn === "function") {
    const binary = atobFn(normalized);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }
  const BufferCtor = (globalThis as any).Buffer;
  if (!BufferCtor) {
    throw new Error("base64_decode_unavailable");
  }
  return new Uint8Array(BufferCtor.from(normalized, "base64"));
}

function parseProviderErrorMessage(rawBody: string): string {
  const raw = (rawBody ?? "").trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: unknown } | string;
      message?: unknown;
    };
    const nested =
      parsed?.error && typeof parsed.error === "object" && typeof parsed.error.message === "string"
        ? parsed.error.message.trim()
        : "";
    const inline = typeof parsed?.error === "string" ? parsed.error.trim() : "";
    const top = typeof parsed?.message === "string" ? parsed.message.trim() : "";
    return nested || inline || top || raw;
  } catch {
    return raw;
  }
}

function isResponseFormatUnsupported(status: number, message: string): boolean {
  if (status !== 400 && status !== 422) return false;
  const normalized = message.toLowerCase();
  const mentionsResponseFormat =
    normalized.includes("response_format") ||
    normalized.includes("response format") ||
    normalized.includes("verbose_json");
  if (!mentionsResponseFormat) return false;
  return (
    normalized.includes("invalid enum") ||
    normalized.includes("invalid value") ||
    normalized.includes("invalid") ||
    normalized.includes("not a valid") ||
    normalized.includes("must be") ||
    normalized.includes("allowed") ||
    normalized.includes("not supported") ||
    normalized.includes("unsupported")
  );
}

function prefersJsonTranscriptionResponseFormat(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return normalized.includes("gpt-4o") && normalized.includes("transcribe");
}

async function runVoiceTranscriptionAttempts(
  model: string,
  attempt: (responseFormat: VoiceTranscriptionResponseFormat) => Promise<VoiceTranscribeAttemptResult>,
): Promise<VoiceTranscribeResult> {
  const firstFormat: VoiceTranscriptionResponseFormat = prefersJsonTranscriptionResponseFormat(model)
    ? "json"
    : "verbose_json";
  const firstResult = await attempt(firstFormat);
  if (!firstResult.ok && firstResult.retryWithJson && firstFormat !== "json") {
    return await attempt("json");
  }
  return firstResult;
}

function logVoiceTranscribeEvent(
  level: "info" | "warn",
  event: string,
  payload: Record<string, unknown>,
): void {
  try {
    const logger = level === "warn" ? console.warn : console.log;
    logger(`voice_transcribe_${event}`, payload);
  } catch {
    // ignore diagnostic logging failures
  }
}

function readProviderDuration(payload: unknown): {
  durationSeconds: number | undefined;
  durationSource: VoiceTranscribeResult["durationSource"] | undefined;
} {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const usage = record.usage && typeof record.usage === "object"
    ? record.usage as Record<string, unknown>
    : {};
  const usageSeconds = Number(usage.seconds);
  if (Number.isFinite(usageSeconds) && usageSeconds > 0) {
    return {
      durationSeconds: usageSeconds,
      durationSource: "provider_usage",
    };
  }
  const duration = Number(record.duration);
  if (Number.isFinite(duration) && duration > 0) {
    return {
      durationSeconds: duration,
      durationSource: "provider_duration",
    };
  }
  return {
    durationSeconds: undefined,
    durationSource: undefined,
  };
}

async function readJsonBounded<T>(req: Request, maxChars = 14_000_000): Promise<T> {
  const text = await req.text();
  if (!text) throw new Error("invalid_request");
  if (text.length > maxChars) throw new Error("request_too_large");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("invalid_request");
  }
}

function resolveVoicePrimaryConfig(): { apiKey: string; model: string } {
  const configuredModel = readEnv("ARX_VOICE_PRIMARY_MODEL");
  const explicitApiKey = readEnv("ARX_VOICE_PRIMARY_API_KEY");
  let model = configuredModel || DEFAULT_VOICE_PRIMARY_MODEL;
  let apiKey = explicitApiKey || readEnv("OPENAI_API_KEY");
  if (looksLikeApiKey(configuredModel)) {
    if (!apiKey) apiKey = configuredModel;
    model = DEFAULT_VOICE_PRIMARY_MODEL;
  }
  return { apiKey, model };
}

function resolveVoiceFallbackConfig(): { apiKey: string; model: string; endpoint: string } {
  const configuredModel = readEnv("ARX_VOICE_FALLBACK_MODEL");
  const explicitApiKey = readEnv("ARX_VOICE_FALLBACK_API_KEY") || readEnv("ARX_VOICE_FALLBACK_KEY");
  let model = configuredModel || DEFAULT_VOICE_FALLBACK_MODEL;
  let apiKey = explicitApiKey || readEnv("GROQ_API_KEY");
  const endpoint = readEnv("ARX_VOICE_FALLBACK_ENDPOINT") || DEFAULT_VOICE_FALLBACK_ENDPOINT;
  if (looksLikeApiKey(configuredModel)) {
    if (!apiKey) apiKey = configuredModel;
    model = DEFAULT_VOICE_FALLBACK_MODEL;
  }
  return { apiKey, model, endpoint };
}

async function transcribeWithOpenAi(params: {
  bytes: Uint8Array;
  mimeType: string;
  language: string;
  prompt: string;
}): Promise<VoiceTranscribeResult> {
  const { apiKey, model } = resolveVoicePrimaryConfig();
  if (!apiKey) {
    return {
      ok: false,
      text: "",
      provider: "openai",
      model,
      message: "Missing OPENAI_API_KEY (or ARX_VOICE_PRIMARY_API_KEY).",
    };
  }

  async function attempt(
    responseFormat: VoiceTranscriptionResponseFormat,
  ): Promise<VoiceTranscribeAttemptResult> {
    const form = new FormData();
    form.append("model", model);
    form.append(
      "file",
      new Blob([toArrayBuffer(params.bytes)], { type: params.mimeType }),
      `voice${extensionForMime(params.mimeType)}`,
    );
    if (params.language) form.append("language", params.language);
    if (params.prompt) form.append("prompt", params.prompt);
    form.append("temperature", "0");
    form.append("response_format", responseFormat);

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    });
    if (!response.ok) {
      const message = parseProviderErrorMessage(await response.text());
      const retryWithJson =
        responseFormat === "verbose_json" && isResponseFormatUnsupported(response.status, message);
      return {
        ok: false,
        text: "",
        provider: "openai",
        model,
        responseFormat,
        retryWithJson,
        message: message || `OpenAI transcription failed (${response.status})`,
      };
    }
    const payload = (await response.json()) as { text?: unknown };
    const text = typeof payload?.text === "string" ? payload.text.trim() : "";
    const duration = readProviderDuration(payload);
    return {
      ok: Boolean(text),
      text,
      provider: "openai",
      model,
      responseFormat,
      durationSeconds: duration.durationSeconds,
      durationSource: duration.durationSource,
      message: text ? undefined : "OpenAI returned empty transcript.",
    };
  }

  return await runVoiceTranscriptionAttempts(model, attempt);
}

async function transcribeWithGroqFallback(params: {
  bytes: Uint8Array;
  mimeType: string;
  language: string;
  prompt: string;
}): Promise<VoiceTranscribeResult> {
  const { apiKey, model, endpoint } = resolveVoiceFallbackConfig();
  if (!apiKey) {
    return {
      ok: false,
      text: "",
      provider: "groq",
      model,
      message: "Missing GROQ_API_KEY (or ARX_VOICE_FALLBACK_API_KEY).",
    };
  }
  if (endpoint.includes("api.groq.com") && looksLikeXaiApiKey(apiKey)) {
    return {
      ok: false,
      text: "",
      provider: "groq",
      model,
      message:
        "Fallback key appears to be an xAI key, but fallback endpoint is Groq. Provide a Groq key for fallback.",
    };
  }

  async function attempt(
    responseFormat: VoiceTranscriptionResponseFormat,
  ): Promise<VoiceTranscribeAttemptResult> {
    const form = new FormData();
    form.append("model", model);
    form.append(
      "file",
      new Blob([toArrayBuffer(params.bytes)], { type: params.mimeType }),
      `voice${extensionForMime(params.mimeType)}`,
    );
    if (params.language) form.append("language", params.language);
    if (params.prompt) form.append("prompt", params.prompt);
    form.append("temperature", "0");
    form.append("response_format", responseFormat);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    });
    if (!response.ok) {
      const message = parseProviderErrorMessage(await response.text());
      const retryWithJson =
        responseFormat === "verbose_json" && isResponseFormatUnsupported(response.status, message);
      return {
        ok: false,
        text: "",
        provider: "groq",
        model,
        responseFormat,
        retryWithJson,
        message: message || `Fallback transcription failed (${response.status})`,
      };
    }
    const payload = (await response.json()) as { text?: unknown };
    const text = typeof payload?.text === "string" ? payload.text.trim() : "";
    const duration = readProviderDuration(payload);
    return {
      ok: Boolean(text),
      text,
      provider: "groq",
      model,
      responseFormat,
      durationSeconds: duration.durationSeconds,
      durationSource: duration.durationSource,
      message: text ? undefined : "Fallback returned empty transcript.",
    };
  }

  return await runVoiceTranscriptionAttempts(model, attempt);
}

export function registerRuntimeVoiceRoutes(args: RegisterRuntimeVoiceRoutesArgs): void {
  const { http, httpAction, jsonResponse, optionsResponse, requireAuthenticatedActor } = args;

  http.route({
    path: "/runtime/voice_transcribe",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)),
  });

  http.route({
    path: "/runtime/voice_transcribe",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      const enabledRaw = readEnv("ARX_VOICE_TRANSCRIBE_ENABLED");
      if (enabledRaw && !isTruthyEnv(enabledRaw)) {
        return jsonResponse(req, 403, {
          ok: false,
          error: "voice_transcription_disabled",
          code: "voice_transcription_disabled",
        });
      }

      const auth = await requireAuthenticatedActor(ctx, req);
      if (!auth.ok) return auth.response;
      void auth.actor.authSubject;

      try {
        const input = await readJsonBounded<VoiceTranscribeInput>(req);
        const audioBase64Raw = typeof input.audio_base64 === "string" ? input.audio_base64.trim() : "";
        if (!audioBase64Raw) {
          return jsonResponse(req, 400, {
            ok: false,
            error: "audio_required",
            code: "audio_required",
          });
        }
        if (audioBase64Raw.length > 12_000_000) {
          return jsonResponse(req, 413, {
            ok: false,
            error: "audio_too_large",
            code: "audio_too_large",
          });
        }

        const mimeType = sanitizeMimeType(input.mime_type);
        if (!mimeType) {
          return jsonResponse(req, 400, {
            ok: false,
            error: "unsupported_audio_format",
            code: "unsupported_audio_format",
            message: "Unsupported audio format. Record with webm, mp4, mpeg, or wav audio.",
          });
        }
        const language = typeof input.language === "string" ? input.language.trim().slice(0, 12) : "";
        const promptRaw = typeof input.prompt === "string" ? input.prompt.trim().slice(0, 320) : "";
        const prompt = promptRaw || DEFAULT_VOICE_PROMPT;
        const surface = typeof input.surface === "string" ? input.surface.trim().toLowerCase() : "";
        const preferPrimary =
          input.prefer_primary === true || String(input.prefer_primary ?? "").trim().toLowerCase() === "true";

        if (surface && surface !== "workspace" && surface !== "community" && surface !== "direct_message") {
          return jsonResponse(req, 400, {
            ok: false,
            error: "invalid_surface",
            code: "invalid_surface",
          });
        }

        let bytes: Uint8Array;
        try {
          bytes = decodeBase64Audio(audioBase64Raw);
        } catch {
          return jsonResponse(req, 400, {
            ok: false,
            error: "invalid_audio_base64",
            code: "invalid_audio_base64",
          });
        }
        if (bytes.byteLength < 256) {
          return jsonResponse(req, 400, {
            ok: false,
            error: "audio_too_short",
            code: "audio_too_short",
          });
        }
        const durationEvidence = resolveVoiceDurationEvidence({
          durationMs: input.duration_ms,
          audioBytes: bytes.byteLength,
          mimeType,
        });
        logVoiceTranscribeEvent("info", "request", {
          surface: surface || null,
          mime_type: mimeType,
          audio_bytes: bytes.byteLength,
          duration_ms: durationEvidence.durationMs,
          duration_source: durationEvidence.source,
        });

        const providerCostKey = newProviderCostKey("voice");
        const fallbackConfig = resolveVoiceFallbackConfig();
        const fallbackKeyPresent = Boolean(fallbackConfig.apiKey);

        const primary = await transcribeWithOpenAi({ bytes, mimeType, language, prompt });
        if (primary.ok) {
          const settledDurationSeconds = primary.durationSeconds ?? durationEvidence.durationSeconds;
          const settledDurationSource = primary.durationSource ?? durationEvidence.source;
          const settledQuote = quoteVoiceTranscription({
            provider: "openai",
            model: primary.model,
            durationSeconds: settledDurationSeconds,
          });
          await recordPlatformToolCostBestEffort({
            ctx,
            costKey: providerCostKey,
            userId: auth.actor.userId,
            rawVendorCostUsd: settledQuote.rawVendorCostUsd,
            metadata: voiceSettlementMetadata({
              quote: settledQuote,
              durationEvidence,
              finalDurationSource: settledDurationSource,
              responseFormat: primary.responseFormat ?? null,
              fallbackUsed: false,
            }),
          });
          return jsonResponse(req, 200, {
            ok: true,
            text: primary.text,
            provider: primary.provider,
            model: primary.model,
            fallback_used: false,
          });
        }

        if (preferPrimary) {
          return jsonResponse(req, 502, {
            ok: false,
            error: "voice_transcription_failed",
            code: "voice_transcription_failed",
            message: primary.message || "Primary transcription failed.",
            primary_error: primary.message ?? null,
            fallback_error: "skipped_by_prefer_primary",
          });
        }

        if (!fallbackKeyPresent) {
          return jsonResponse(req, 502, {
            ok: false,
            error: "voice_transcription_failed",
            code: "voice_transcription_failed",
            message: primary.message || "Transcription failed.",
            primary_error: primary.message ?? null,
            fallback_error: "Missing GROQ_API_KEY (or ARX_VOICE_FALLBACK_API_KEY).",
          });
        }

        const fallback = await transcribeWithGroqFallback({ bytes, mimeType, language, prompt });
        if (fallback.ok) {
          const settledDurationSeconds = fallback.durationSeconds ?? durationEvidence.durationSeconds;
          const settledDurationSource = fallback.durationSource ?? durationEvidence.source;
          const settledQuote = quoteVoiceTranscription({
            provider: "groq",
            model: fallback.model,
            durationSeconds: settledDurationSeconds,
          });
          await recordPlatformToolCostBestEffort({
            ctx,
            costKey: providerCostKey,
            userId: auth.actor.userId,
            rawVendorCostUsd: settledQuote.rawVendorCostUsd,
            metadata: voiceSettlementMetadata({
              quote: settledQuote,
              durationEvidence,
              finalDurationSource: settledDurationSource,
              responseFormat: fallback.responseFormat ?? null,
              fallbackUsed: true,
              primaryError: primary.message ?? null,
            }),
          });
          return jsonResponse(req, 200, {
            ok: true,
            text: fallback.text,
            provider: fallback.provider,
            model: fallback.model,
            fallback_used: true,
            primary_error: primary.message ?? null,
          });
        }

        const errors = [primary.message, fallback.message].filter(
          (value): value is string => typeof value === "string" && value.trim().length > 0,
        );
        return jsonResponse(req, 502, {
          ok: false,
          error: "voice_transcription_failed",
          code: "voice_transcription_failed",
          message: errors.join(" | ") || "Transcription failed.",
          primary_error: primary.message ?? null,
          fallback_error: fallback.message ?? null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const code =
          message === "request_too_large"
            ? "request_too_large"
            : message === "invalid_request"
              ? "invalid_request"
              : "internal_error";
        const status = code === "request_too_large" ? 413 : code === "invalid_request" ? 400 : 500;
        return jsonResponse(req, status, {
          ok: false,
          error: code,
          code,
          message,
        });
      }
    }),
  });
}
import type { PublicHttpAction } from "convex/server";
