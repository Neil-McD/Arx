import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { jsonResponse, noStoreHeaders, withCors } from "../_shared/http.ts";
import { getEnv, isTruthyEnv } from "../_shared/env.ts";
import { edgeRateLimitAllow } from "../_shared/rate_limit.ts";

type VoiceTranscribeInput = {
  audio_base64?: unknown;
  mime_type?: unknown;
  language?: unknown;
  prompt?: unknown;
  surface?: unknown;
  prefer_primary?: unknown;
};

type ProviderTranscribeResult = {
  ok: boolean;
  text: string;
  provider: "openai" | "groq";
  model: string;
  message?: string;
};

const DEFAULT_PRIMARY_MODEL = "gpt-4o-mini-transcribe";
const DEFAULT_FALLBACK_MODEL = "whisper-large-v3-turbo";
const DEFAULT_FALLBACK_ENDPOINT = "https://api.groq.com/openai/v1/audio/transcriptions";
const DEFAULT_TRANSCRIBE_PROMPT =
  "Transcribe spoken words verbatim. If speech is unclear or absent, return an empty transcript.";

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

function resolvePrimaryConfig(): { apiKey: string; model: string } {
  const configuredModel = getEnv("ARX_VOICE_PRIMARY_MODEL");
  const explicitApiKey = getEnv("ARX_VOICE_PRIMARY_API_KEY");

  let model = configuredModel || DEFAULT_PRIMARY_MODEL;
  let apiKey = explicitApiKey || getEnv("OPENAI_API_KEY");

  // Backward/ops compatibility: if the key is accidentally stored in ARX_VOICE_PRIMARY_MODEL,
  // recover by using it as the key and falling back to the default model id.
  if (looksLikeApiKey(configuredModel)) {
    if (!apiKey) apiKey = configuredModel;
    model = DEFAULT_PRIMARY_MODEL;
  }

  return { apiKey, model };
}

function resolveFallbackConfig(): { apiKey: string; model: string; endpoint: string } {
  const configuredModel = getEnv("ARX_VOICE_FALLBACK_MODEL");
  const explicitApiKey = getEnv("ARX_VOICE_FALLBACK_API_KEY") || getEnv("ARX_VOICE_FALLBACK_KEY");

  let model = configuredModel || DEFAULT_FALLBACK_MODEL;
  let apiKey = explicitApiKey || getEnv("GROQ_API_KEY");
  const endpoint = getEnv("ARX_VOICE_FALLBACK_ENDPOINT") || DEFAULT_FALLBACK_ENDPOINT;

  // Backward/ops compatibility: if the key is accidentally stored in ARX_VOICE_FALLBACK_MODEL,
  // recover by using it as the key and falling back to the default model id.
  if (looksLikeApiKey(configuredModel)) {
    if (!apiKey) apiKey = configuredModel;
    model = DEFAULT_FALLBACK_MODEL;
  }

  return { apiKey, model, endpoint };
}

function sanitizeMimeType(input: unknown): string {
  const value = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (!value) return "audio/webm";
  if (value.startsWith("audio/webm")) return "audio/webm";
  if (value.startsWith("audio/ogg")) return "audio/ogg";
  if (value.startsWith("audio/mp4")) return "audio/mp4";
  if (value.startsWith("audio/mpeg")) return "audio/mpeg";
  if (value.startsWith("audio/wav")) return "audio/wav";
  if (value.startsWith("audio/x-wav")) return "audio/wav";
  return "audio/webm";
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes("ogg")) return ".ogg";
  if (mimeType.includes("mp4")) return ".m4a";
  if (mimeType.includes("mpeg")) return ".mp3";
  if (mimeType.includes("wav")) return ".wav";
  return ".webm";
}

function decodeBase64Audio(input: string): Uint8Array {
  const cleaned = input.includes(",") ? input.slice(input.indexOf(",") + 1) : input;
  const normalized = cleaned.replace(/\s+/g, "");
  const binary = atob(normalized);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function parseErrorMessage(rawBody: string): string {
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

async function readJsonBounded<T>(req: Request, maxChars = 14_000_000): Promise<T> {
  const text = await req.text();
  if (!text) throw new Error("Missing JSON body");
  if (text.length > maxChars) throw new Error("request_too_large");
  return JSON.parse(text) as T;
}

async function transcribeWithOpenAi(params: {
  bytes: Uint8Array;
  mimeType: string;
  language: string;
  prompt: string;
}): Promise<ProviderTranscribeResult> {
  const { apiKey, model } = resolvePrimaryConfig();
  if (!apiKey) {
    return {
      ok: false,
      text: "",
      provider: "openai",
      model,
      message: "Missing OPENAI_API_KEY (or ARX_VOICE_PRIMARY_API_KEY)",
    };
  }

  const form = new FormData();
  form.append("model", model);
  form.append("file", new Blob([params.bytes], { type: params.mimeType }), `voice${extensionForMime(params.mimeType)}`);
  if (params.language) form.append("language", params.language);
  if (params.prompt) form.append("prompt", params.prompt);
  form.append("temperature", "0");
  form.append("response_format", "json");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    const message = parseErrorMessage(await response.text());
    return {
      ok: false,
      text: "",
      provider: "openai",
      model,
      message: message || `OpenAI transcription failed (${response.status})`,
    };
  }

  const payload = (await response.json()) as { text?: unknown };
  const text = typeof payload?.text === "string" ? payload.text.trim() : "";
  return {
    ok: Boolean(text),
    text,
    provider: "openai",
    model,
    message: text ? undefined : "OpenAI returned empty transcript.",
  };
}

async function transcribeWithGroqFallback(params: {
  bytes: Uint8Array;
  mimeType: string;
  language: string;
  prompt: string;
}): Promise<ProviderTranscribeResult> {
  const { apiKey, model, endpoint } = resolveFallbackConfig();
  if (!apiKey) {
    return {
      ok: false,
      text: "",
      provider: "groq",
      model,
      message: "Missing GROQ_API_KEY (or ARX_VOICE_FALLBACK_API_KEY)",
    };
  }

  if (endpoint.includes("api.groq.com") && looksLikeXaiApiKey(apiKey)) {
    return {
      ok: false,
      text: "",
      provider: "groq",
      model,
      message:
        "Fallback key appears to be an xAI key, but fallback endpoint is Groq. Use GROQ_API_KEY or ARX_VOICE_FALLBACK_API_KEY with a Groq key.",
    };
  }

  const form = new FormData();
  form.append("model", model);
  form.append("file", new Blob([params.bytes], { type: params.mimeType }), `voice${extensionForMime(params.mimeType)}`);
  if (params.language) form.append("language", params.language);
  if (params.prompt) form.append("prompt", params.prompt);
  form.append("temperature", "0");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    const message = parseErrorMessage(await response.text());
    return {
      ok: false,
      text: "",
      provider: "groq",
      model,
      message: message || `Fallback transcription failed (${response.status})`,
    };
  }

  const payload = (await response.json()) as { text?: unknown };
  const text = typeof payload?.text === "string" ? payload.text.trim() : "";
  return {
    ok: Boolean(text),
    text,
    provider: "groq",
    model,
    message: text ? undefined : "Fallback returned empty transcript.",
  };
}

Deno.serve(async (req: Request) => {
  const headers = withCors(noStoreHeaders(), req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, { status: 405, headers });

  try {
    const enabledRaw = getEnv("ARX_VOICE_TRANSCRIBE_ENABLED");
    if (enabledRaw && !isTruthyEnv(enabledRaw)) {
      return jsonResponse(
        {
          ok: false,
          error: "voice_transcription_disabled",
          code: "voice_transcription_disabled",
        },
        { status: 403, headers },
      );
    }

    const rlAllowed = await edgeRateLimitAllow({
      req,
      key: "voice_transcribe",
      windowSeconds: 60,
      limit: 20,
    });
    if (!rlAllowed) {
      return jsonResponse({ ok: false, error: "rate_limited", code: "rate_limited" }, { status: 429, headers });
    }

    const input = await readJsonBounded<VoiceTranscribeInput>(req);
    const audioBase64Raw = typeof input.audio_base64 === "string" ? input.audio_base64.trim() : "";
    if (!audioBase64Raw) {
      return jsonResponse({ ok: false, error: "audio_required", code: "audio_required" }, { status: 400, headers });
    }
    if (audioBase64Raw.length > 12_000_000) {
      return jsonResponse({ ok: false, error: "audio_too_large", code: "audio_too_large" }, { status: 413, headers });
    }

    const mimeType = sanitizeMimeType(input.mime_type);
    const language = typeof input.language === "string" ? input.language.trim().slice(0, 12) : "";
    const promptRaw = typeof input.prompt === "string" ? input.prompt.trim().slice(0, 320) : "";
    const prompt = promptRaw || DEFAULT_TRANSCRIBE_PROMPT;
    const surface = typeof input.surface === "string" ? input.surface.trim().toLowerCase() : "";
    const preferPrimary = input.prefer_primary === true || input.prefer_primary === "true";
    if (surface && surface !== "workspace" && surface !== "community") {
      return jsonResponse({ ok: false, error: "invalid_surface", code: "invalid_surface" }, { status: 400, headers });
    }

    const bytes = decodeBase64Audio(audioBase64Raw);
    if (bytes.byteLength < 256) {
      return jsonResponse({ ok: false, error: "audio_too_short", code: "audio_too_short" }, { status: 400, headers });
    }

    const primary = await transcribeWithOpenAi({ bytes, mimeType, language, prompt });
    if (primary.ok) {
      return jsonResponse(
        {
          ok: true,
          text: primary.text,
          provider: primary.provider,
          model: primary.model,
          fallback_used: false,
        },
        { status: 200, headers },
      );
    }

    if (preferPrimary) {
      return jsonResponse(
        {
          ok: false,
          error: "voice_transcription_failed",
          code: "voice_transcription_failed",
          message: primary.message || "Primary transcription failed.",
          primary_error: primary.message ?? null,
          fallback_error: "skipped_by_prefer_primary",
        },
        { status: 502, headers },
      );
    }

    const fallbackKeyPresent = Boolean(resolveFallbackConfig().apiKey);
    if (!fallbackKeyPresent) {
      return jsonResponse(
        {
          ok: false,
          error: "voice_transcription_failed",
          code: "voice_transcription_failed",
          message: primary.message || "Transcription failed.",
          primary_error: primary.message ?? null,
          fallback_error: "Missing GROQ_API_KEY (or ARX_VOICE_FALLBACK_API_KEY)",
        },
        { status: 502, headers },
      );
    }

    const fallback = await transcribeWithGroqFallback({ bytes, mimeType, language, prompt });
    if (fallback.ok) {
      return jsonResponse(
        {
          ok: true,
          text: fallback.text,
          provider: fallback.provider,
          model: fallback.model,
          fallback_used: true,
          primary_error: primary.message ?? null,
        },
        { status: 200, headers },
      );
    }

    const errors = [primary.message, fallback.message].filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    );
    return jsonResponse(
      {
        ok: false,
        error: "voice_transcription_failed",
        code: "voice_transcription_failed",
        message: errors.join(" | ") || "Transcription failed.",
        primary_error: primary.message ?? null,
        fallback_error: fallback.message ?? null,
      },
      { status: 502, headers },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = message === "request_too_large" ? "request_too_large" : "internal_error";
    const status = message === "request_too_large" ? 413 : 500;
    return jsonResponse(
      {
        ok: false,
        error: code,
        code,
        message,
      },
      { status, headers },
    );
  }
});
