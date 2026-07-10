import assert from "node:assert/strict";

import {
  extractRuntimeEngineIdFromMessageContent,
  formatModelAttributionLabel,
} from "../shared/modelAttributionUi.ts";
import {
  DEFAULT_ACTIVE_MODEL_ID,
  DEFAULT_ACTIVE_MODEL_LABEL,
} from "../shared/modelCatalog.ts";

const toggles = [
  {
    id: DEFAULT_ACTIVE_MODEL_ID,
    label: DEFAULT_ACTIVE_MODEL_LABEL,
  },
];

assert.equal(
  formatModelAttributionLabel({
    modelId: DEFAULT_ACTIVE_MODEL_ID,
    inferenceSource: "chatgpt",
    engineId: "runtime_turn",
    modelToggles: toggles,
  }),
  `${DEFAULT_ACTIVE_MODEL_LABEL} · Polynet`,
  "Polynet runtime turns should not render ChatGPT as the assistant-output provider",
);

assert.equal(
  formatModelAttributionLabel({
    modelId: DEFAULT_ACTIVE_MODEL_ID,
    inferenceSource: "chatgpt",
    engineId: "runtime_convex",
    modelToggles: toggles,
  }),
  `${DEFAULT_ACTIVE_MODEL_LABEL} · Polynet`,
  "Convex-backed Polynet runtime turns should render Polynet attribution",
);

assert.equal(
  formatModelAttributionLabel({
    modelId: DEFAULT_ACTIVE_MODEL_ID,
    inferenceSource: "chatgpt",
    engineId: "polynet_codex_worker",
    modelToggles: toggles,
  }),
  `${DEFAULT_ACTIVE_MODEL_LABEL} · Codex`,
  "Codex worker turns should render Codex rather than the underlying ChatGPT account provider",
);

assert.equal(
  formatModelAttributionLabel({
    modelId: DEFAULT_ACTIVE_MODEL_ID,
    inferenceSource: "chatgpt",
    engineId: null,
    modelToggles: toggles,
  }),
  `${DEFAULT_ACTIVE_MODEL_LABEL} · ChatGPT`,
  "ChatGPT should remain visible when it is the only known provider signal",
);

assert.equal(
  formatModelAttributionLabel({
    modelId: DEFAULT_ACTIVE_MODEL_ID,
    inferenceSource: "chatgpt",
    engineId: "agent_web",
    modelToggles: toggles,
    inferenceLaneFallbacks: [
      {
        from: "chatgpt",
        to: "platform",
        reason: "quota",
      },
    ],
  }),
  `${DEFAULT_ACTIVE_MODEL_LABEL} · Polynet (ChatGPT fallback -> OpenRouter)`,
  "Fallback details should preserve factual provider history without overriding runtime attribution",
);

assert.equal(
  extractRuntimeEngineIdFromMessageContent({
    meta: {
      runtime_engine_id: "runtime_turn",
    },
  }),
  "runtime_turn",
  "runtime engine id should be readable from persisted message metadata",
);

assert.equal(
  extractRuntimeEngineIdFromMessageContent({
    meta: {
      engine_id: "agent_web",
    },
  }),
  "agent_web",
  "engine id should be readable from streaming-style message metadata",
);

console.log("model_attribution_ui_proof: ok");
