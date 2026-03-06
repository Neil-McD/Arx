import { query } from "./_generated/server";
import { v } from "convex/values";

type ModelRegistryRow = {
  id: string;
  provider: "openai" | "anthropic" | "google" | "x-ai" | "openrouter";
  display_name: string;
  supported_sources: readonly ("demo_public" | "user_key" | "user_chatgpt" | "platform")[];
  sort_order: number;
  enabled: boolean;
};

const MODEL_REGISTRY_ROWS: readonly ModelRegistryRow[] = [
  { id: "gpt-5.2", provider: "openai", display_name: "GPT 5.2", supported_sources: ["platform", "user_key", "user_chatgpt"], sort_order: 10, enabled: true },
  { id: "sonnet-4.6", provider: "anthropic", display_name: "Sonnet 4.6", supported_sources: ["platform", "user_key"], sort_order: 20, enabled: true },
  { id: "opus-4.6", provider: "anthropic", display_name: "Opus 4.6", supported_sources: ["platform", "user_key"], sort_order: 30, enabled: true },
  { id: "gemini-3-flash", provider: "google", display_name: "Gemini 3 Flash", supported_sources: ["platform", "user_key"], sort_order: 40, enabled: true },
  { id: "gemini-3.1-pro", provider: "google", display_name: "Gemini 3.1 Pro", supported_sources: ["platform", "user_key"], sort_order: 50, enabled: true },
  { id: "grok-4.1", provider: "x-ai", display_name: "Grok 4.1", supported_sources: ["platform", "user_key"], sort_order: 60, enabled: true },
];

export const listEnabledModelRegistry = query({
  args: {
    enabled: v.optional(v.boolean()),
  },
  handler: async (_ctx, args) => {
    const wantEnabled = args.enabled ?? true;
    return MODEL_REGISTRY_ROWS
      .filter((row) => (wantEnabled ? row.enabled : true))
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  },
});
