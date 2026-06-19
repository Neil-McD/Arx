import assert from "node:assert/strict";

import {
  extractRuntimeEngineIdFromMessageContent,
  formatModelAttributionLabel,
} from "../shared/modelAttributionUi.ts";

const toggles = [
  {
    id: "gpt-5.5",
    label: "GPT 5.5",
  },
];

assert.equal(
  formatModelAttributionLabel({
    modelId: "gpt-5.5",
    inferenceSource: "chatgpt",
    engineId: "runtime_turn",
    modelToggles: toggles,
  }),
  "GPT 5.5 · Polynet",
  "Polynet runtime turns should not render ChatGPT as the assistant-output provider",
);

assert.equal(
  formatModelAttributionLabel({
    modelId: "gpt-5.5",
    inferenceSource: "chatgpt",
    engineId: "runtime_convex",
    modelToggles: toggles,
  }),
  "GPT 5.5 · Polynet",
  "Convex-backed Polynet runtime turns should render Polynet attribution",
);

assert.equal(
  formatModelAttributionLabel({
    modelId: "gpt-5.5",
    inferenceSource: "chatgpt",
    engineId: null,
    modelToggles: toggles,
  }),
  "GPT 5.5 · ChatGPT",
  "ChatGPT should remain visible when it is the only known provider signal",
);

assert.equal(
  formatModelAttributionLabel({
    modelId: "gpt-5.5",
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
  "GPT 5.5 · Polynet (ChatGPT fallback -> OpenRouter)",
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
