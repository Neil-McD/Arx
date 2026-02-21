export type PlatformProvider = "openai" | "anthropic" | "google" | "x-ai" | "openrouter";

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
  if (raw === "openrouter") return "openrouter";
  throw new Error("Unsupported platform model provider");
}
