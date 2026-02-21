export function formatInferenceSourceLabel(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "platform") return "Polynet.ai";
  if (raw === "user") return "User key";
  if (raw === "chatgpt") return "ChatGPT";
  if (raw === "free") return "Free";
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
