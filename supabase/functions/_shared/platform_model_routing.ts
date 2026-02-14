export type PlatformProvider = "openai" | "anthropic" | "google" | "x-ai";

export type PlatformModelRef = {
  provider: PlatformProvider;
  model: string;
  ref: string;
};

export function normalizePlatformProvider(input: string): PlatformProvider {
  const raw = (input ?? "").trim().toLowerCase();
  if (raw === "openai") return "openai";
  if (raw === "anthropic") return "anthropic";
  if (raw === "google") return "google";
  if (raw === "xai" || raw === "x-ai") return "x-ai";
  throw new Error("Unsupported platform model provider");
}

export function parsePlatformModelRef(ref: string): PlatformModelRef {
  const raw = (ref ?? "").trim();
  const idx = raw.indexOf("/");
  if (idx <= 0) throw new Error("Invalid platform model mapping");
  const provider = normalizePlatformProvider(raw.slice(0, idx));
  const model = raw.slice(idx + 1).trim();
  if (!model) throw new Error("Invalid platform model mapping");
  return { provider, model, ref: `${provider}/${model}` };
}
