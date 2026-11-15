
type InferenceRole = "user" | "assistant" | "system";
type InferenceMessage = {
  role: InferenceRole;
  content: string;
};
type RuntimeTurnInputLike = {
  message?: {
    text?: string | null;
  } | null;
  messages?: Array<{ role?: string | null; content?: string | null }> | null;
};
function normalizeMessages(raw: unknown): InferenceMessage[] {
  const rows = Array.isArray(raw) ? raw : [];
  const out: InferenceMessage[] = [];
  for (const entry of rows) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const roleRaw = String((entry as Record<string, unknown>).role ?? "")
      .trim()
      .toLowerCase();
    const role: InferenceRole | null =
      roleRaw === "user" || roleRaw === "assistant" || roleRaw === "system" ? (roleRaw as InferenceRole) : null;
    if (!role) continue;
    const content = String((entry as Record<string, unknown>).content ?? "").trim();
    if (!content) continue;
    out.push({ role, content });
  }
  return out.slice(-60);
}

export function normalizeMaxTokens(raw: unknown, fallback: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(64, Math.min(4096, Math.floor(value)));
}

export function asRuntimeMessages(input: RuntimeTurnInputLike): InferenceMessage[] {
  const fromList = normalizeMessages(input.messages);
  if (fromList.length > 0) return fromList;
  const text = String(input.message?.text ?? "").trim();
  if (!text) return [];
  return [{ role: "user", content: text }];
}

export function extractTextFromContentJson(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const text = typeof record.text === "string" ? record.text : typeof record.content === "string" ? record.content : "";
    return String(text ?? "").trim();
  }
  return "";
}

export function extractInferenceSourceFromContentJson(
  value: unknown,
  fallback: "free" | "platform" | "user_key" | "chatgpt",
): "free" | "platform" | "user_key" | "chatgpt" {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const meta = record.meta;
    if (meta && typeof meta === "object" && !Array.isArray(meta)) {
      const raw = String((meta as Record<string, unknown>).inference_source ?? "").trim().toLowerCase();
      if (raw === "free" || raw === "platform" || raw === "user_key" || raw === "chatgpt") return raw;
    }
  }
  return fallback;
}
