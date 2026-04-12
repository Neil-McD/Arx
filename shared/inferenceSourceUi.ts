function formatInferenceSourceLabel(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "platform") return "OpenRouter";
  if (raw === "user" || raw === "user_key") return "OpenRouter key";
  if (raw === "chatgpt" || raw === "user_chatgpt") return "ChatGPT auth";
  if (raw === "free" || raw === "demo_public") return "OpenRouter free";
  return null;
}

export function appendInferenceSourceLabel(
  baseLabel: string | null | undefined,
  inferenceSource: string | null | undefined,
): string | null {
  const base = (baseLabel ?? "").trim();
  if (!base) return null;
  const source = formatInferenceSourceLabel(inferenceSource);
  return source ? `${base} · ${source}` : base;
}

function formatInferenceProviderLabel(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "chatgpt" || raw === "user_chatgpt") return "ChatGPT";
  if (raw === "platform") return "OpenRouter";
  if (raw === "user" || raw === "user_key") return "OpenRouter key";
  if (raw === "free" || raw === "demo_public") return "OpenRouter free";
  return null;
}

export function appendInferenceProviderLabel(
  baseLabel: string | null | undefined,
  inferenceSource: string | null | undefined,
): string | null {
  const base = (baseLabel ?? "").trim();
  if (!base) return null;
  const provider = formatInferenceProviderLabel(inferenceSource);
  return provider ? `${base} · ${provider}` : base;
}
