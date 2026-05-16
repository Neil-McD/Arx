import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const attribution = read("shared/modelAttributionUi.ts");
const persistence = read("convex/runtimeTurnPersistence.ts");
const projection = read("apps/web/src/controllers/buildWebWorkspaceSurfaceProjection.tsx");
const app = read("apps/web/src/App.tsx");
const webTurnCore = read("shared/webTurnRunnerCore.ts");
const packageJson = read("package.json");

assert.match(
  attribution,
  /if \(surface === "codex"\) return "Codex";[\s\S]*if \(surface === "polynet"\) return "PolyNet";/,
  "runtime surface should drive the user-facing execution label",
);

assert.match(
  attribution,
  /if \(raw === "chatgpt" \|\| raw === "user_chatgpt"\) return "PolyNet";/,
  "ChatGPT auth should display as PolyNet for normal PolyNet runtime turns",
);

assert.match(
  attribution,
  /normalizeModelAttributionRuntimeSurface\(meta\.runtime_surface\)[\s\S]*normalizeModelAttributionRuntimeSurface\(meta\.runtime_harness_id\)/,
  "persisted message metadata should identify the runtime surface",
);

assert.match(
  attribution,
  /eventType === "runtime_agent_harness_selected"[\s\S]*selected_harness_id[\s\S]*if \(selected === "codex"\) return "codex";/,
  "existing runtime event evidence should let Codex turns display as Codex",
);

assert.match(
  attribution,
  /eventType\.startsWith\("codex_harness_primary"\)[\s\S]*return "codex";/,
  "Codex primary events should force a Codex label even when older message metadata lacks runtime_surface",
);

assert.match(
  persistence,
  /runtime_harness_id: runtimeHarnessId[\s\S]*runtime_surface: runtimeSurface/,
  "assistant message persistence should store the runtime harness and display surface",
);

assert.match(
  projection,
  /extractRuntimeSurfaceFromRuntimeEvents\(runtimeEvents\) \?\?[\s\S]*extractRuntimeSurfaceFromMessageContent\(message\.content_json\)/,
  "workspace message projection should prefer event evidence and fall back to persisted message metadata",
);

assert.match(
  app,
  /formatModelAttributionLabel\(\{[\s\S]*runtimeSurface,[\s\S]*modelToggles/,
  "workspace model signatures should pass runtime surface into model attribution formatting",
);

assert.match(
  webTurnCore,
  /runtime_harness_id\?: string \| null;[\s\S]*runtime_surface\?: string \| null;/,
  "client-side optimistic message metadata should preserve runtime attribution fields",
);

assert.match(
  packageJson,
  /"check:model-attribution-runtime-label-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/model_attribution_runtime_label_proof\.ts"/,
  "package scripts should include the model attribution runtime label proof",
);

console.log("model_attribution_runtime_label_proof: ok");
