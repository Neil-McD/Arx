import { appendInferenceProviderLabel } from "./inferenceSourceUi.ts";
import { FREE_MODEL_ALLOWLIST, FREE_MODEL_LABELS, isFreeModelId } from "./modelCatalog.ts";

type ModelToggleLike = {
  id: string;
  label: string;
};

type FormatModelAttributionLabelArgs = {
  modelId: string | null | undefined;
  inferenceSource: string | null | undefined;
  engineId?: string | null | undefined;
  modelToggles: ReadonlyArray<ModelToggleLike>;
  inferenceLaneFallbacks?: ReadonlyArray<InferenceLaneFallbackTraceItem> | null;
  freeModelAllowlist?: ReadonlySet<string>;
  freeModelLabels?: Record<string, string>;
};

export type InferenceLaneFallbackTraceItem = {
  from: string;
  to: string;
  reason: string;
};

function fallbackModelLabel(modelId: string): string {
  const normalized = modelId.replace(/[_\s]+/g, "-");
  const gptMatch = normalized.match(/^gpt-?(\d+(?:\.\d+)?)(.*)$/i);
  if (gptMatch) {
    const version = gptMatch[1] ?? "";
    const rest = (gptMatch[2] ?? "").replace(/^-+/, "").replace(/-+/g, " ").trim();
    return `GPT ${version}${rest ? ` ${rest}` : ""}`.trim();
  }
  return modelId.replace(/[_-]+/g, " ");
}

function resolveModelLabel(
  modelId: string,
  modelToggles: ReadonlyArray<ModelToggleLike>,
  freeModelLabels: Record<string, string> | undefined,
): string {
  const labels = freeModelLabels ?? FREE_MODEL_LABELS;
  const freeLabel = (labels[modelId] ?? "").trim();
  if (freeLabel) return freeLabel;
  const toggleLabel = (modelToggles.find((toggle) => toggle.id === modelId)?.label ?? "").trim();
  if (toggleLabel) return toggleLabel;
  return fallbackModelLabel(modelId);
}

function formatRuntimeEngineProviderLabel(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "polynet_codex_worker") return "Codex";
  if (
    raw === "runtime_turn" ||
    raw === "runtime_convex" ||
    raw === "agent_web" ||
    raw === "public_web" ||
    raw === "public_convex" ||
    raw === "public_openrouter"
  ) {
    return "PolyNet";
  }
  return null;
}

export function formatModelAttributionLabel(args: FormatModelAttributionLabelArgs): string | null {
  const modelId = (args.modelId ?? "").trim();
  const runtimeProvider = formatRuntimeEngineProviderLabel(args.engineId);
  if (!modelId) return runtimeProvider;
  const isFreeModel = isFreeModelId(modelId, args.freeModelAllowlist ?? FREE_MODEL_ALLOWLIST);
  const modelLabel = resolveModelLabel(modelId, args.modelToggles, args.freeModelLabels);
  const source = isFreeModel ? "free" : args.inferenceSource;
  const base = runtimeProvider
    ? `${modelLabel} · ${runtimeProvider}`
    : appendInferenceProviderLabel(modelLabel, source);
  const fallbackSuffix = formatInferenceLaneFallbackSuffix(args.inferenceLaneFallbacks ?? null);
  return `${base}${fallbackSuffix}`;
}

function extractMetaRecord(content: unknown): Record<string, unknown> | null {
  const parsed =
    typeof content === "string"
      ? (() => {
          try {
            return JSON.parse(content) as unknown;
          } catch {
            return null;
          }
        })()
      : content;
  if (!parsed || typeof parsed !== "object") return null;
  const meta = (parsed as Record<string, unknown>).meta;
  return meta && typeof meta === "object" ? (meta as Record<string, unknown>) : null;
}

function normalizeInferenceLane(value: unknown): "chatgpt" | "platform" | "public" | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "chatgpt" || raw === "platform" || raw === "public") return raw;
  return null;
}

function formatInferenceLaneFallbackSuffix(
  value: ReadonlyArray<InferenceLaneFallbackTraceItem> | null,
): string {
  if (!value || value.length === 0) return "";
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const item = value[index];
    const from = normalizeInferenceLane(item?.from);
    const to = normalizeInferenceLane(item?.to);
    if (!from || !to) continue;
    if (from !== "chatgpt") continue;
    if (to === "platform") return " (ChatGPT fallback -> OpenRouter)";
    if (to === "public") return " (ChatGPT fallback -> OpenRouter free)";
  }
  return " (fallback)";
}

export function extractInferenceSourceFromMessageContent(content: unknown): string | null {
  const meta = extractMetaRecord(content);
  if (!meta) return null;
  const value = meta.inference_source;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function extractModelIdFromMessageContent(content: unknown): string | null {
  const meta = extractMetaRecord(content);
  if (!meta) return null;
  const value = meta.model_id;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function extractRuntimeEngineIdFromMessageContent(content: unknown): string | null {
  const meta = extractMetaRecord(content);
  if (!meta) return null;
  const value = meta.runtime_engine_id ?? meta.engine_id;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function extractInferenceLaneFallbacksFromMessageContent(
  content: unknown,
): InferenceLaneFallbackTraceItem[] {
  const meta = extractMetaRecord(content);
  if (!meta) return [];
  const raw = meta.inference_lane_fallbacks;
  if (!Array.isArray(raw)) return [];
  const out: InferenceLaneFallbackTraceItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const item = entry as Record<string, unknown>;
    const from = normalizeInferenceLane(item.from);
    const to = normalizeInferenceLane(item.to);
    const reason = String(item.reason ?? "").trim();
    if (!from || !to || !reason) continue;
    out.push({ from, to, reason });
    if (out.length >= 8) break;
  }
  return out;
}
