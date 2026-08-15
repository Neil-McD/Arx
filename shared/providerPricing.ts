export const WEB_RESEARCH_VENDOR_COST_ESTIMATE_USD_BY_ACTION = {
  search: 0.005,
  open_page: 0.001,
  find_in_page: 0.001,
  crawl: 0.03,
} as const;

export type WebResearchCreditAction = keyof typeof WEB_RESEARCH_VENDOR_COST_ESTIMATE_USD_BY_ACTION;

export function estimateWebResearchVendorCostUsd(action: WebResearchCreditAction): number {
  return WEB_RESEARCH_VENDOR_COST_ESTIMATE_USD_BY_ACTION[action] ??
    WEB_RESEARCH_VENDOR_COST_ESTIMATE_USD_BY_ACTION.search;
}

export const VOICE_TRANSCRIPTION_FALLBACK_DURATION_SECONDS = 1;
const OPENAI_VOICE_TRANSCRIPTION_USD_PER_MINUTE_BY_MODEL = {
  "gpt-4o-mini-transcribe": 0.003,
  "gpt-4o-transcribe": 0.006,
} as const;
const GROQ_VOICE_TRANSCRIPTION_USD_PER_HOUR_BY_MODEL = {
  "whisper-large-v3-turbo": 0.04,
  "whisper-large-v3": 0.111,
} as const;
const GROQ_VOICE_TRANSCRIPTION_MIN_BILLED_SECONDS = 10;

export type VoiceTranscriptionProvider = "openai" | "groq";

export function estimateVoiceTranscriptionVendorCostUsd(params?: {
  durationSeconds?: number;
  provider?: VoiceTranscriptionProvider;
  model?: string | null;
}): number {
  const provider = params?.provider === "groq" ? "groq" : "openai";
  const parsedDurationSeconds = Number(params?.durationSeconds);
  const durationSeconds = Number.isFinite(parsedDurationSeconds)
    ? Math.max(0, parsedDurationSeconds)
    : VOICE_TRANSCRIPTION_FALLBACK_DURATION_SECONDS;
  const model = String(params?.model ?? "").trim();
  if (provider === "groq") {
    const hourlyRate =
      GROQ_VOICE_TRANSCRIPTION_USD_PER_HOUR_BY_MODEL[
        model as keyof typeof GROQ_VOICE_TRANSCRIPTION_USD_PER_HOUR_BY_MODEL
      ] ?? GROQ_VOICE_TRANSCRIPTION_USD_PER_HOUR_BY_MODEL["whisper-large-v3-turbo"];
    return (Math.max(durationSeconds, GROQ_VOICE_TRANSCRIPTION_MIN_BILLED_SECONDS) / 3600) * hourlyRate;
  }
  const minuteRate =
    OPENAI_VOICE_TRANSCRIPTION_USD_PER_MINUTE_BY_MODEL[
      model as keyof typeof OPENAI_VOICE_TRANSCRIPTION_USD_PER_MINUTE_BY_MODEL
    ] ?? OPENAI_VOICE_TRANSCRIPTION_USD_PER_MINUTE_BY_MODEL["gpt-4o-mini-transcribe"];
  return (durationSeconds / 60) * minuteRate;
}
