import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_ACTIVE_MODEL_ID,
  DEFAULT_ACTIVE_MODEL_LABEL,
  getDefaultModelToggles,
  getModelRegistryRows,
  getSupportedFundingSourcesForModel,
} from "../shared/modelCatalog.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const modelCatalog = read("shared/modelCatalog.ts");
const inferenceConfig = read("convex/httpInferenceConfig.ts");
const runtimeResolution = read("convex/runtimeTurnResolution.ts");
const providerProbes = read("convex/providerConnectionProbes.ts");
const providerGateway = read("shared/cloudProviderConnectionsGateway.ts");
const daytonaPolicy = read("shared/daytonaCodexRuntimePolicy.ts");
const app = read("apps/web/src/App.tsx");

assert.equal(DEFAULT_ACTIVE_MODEL_ID, "gpt-5.6-sol");
assert.equal(DEFAULT_ACTIVE_MODEL_LABEL, "GPT 5.6 Sol");
const defaultToggles = getDefaultModelToggles("web");
assert.equal(defaultToggles.some((row) => row.id === DEFAULT_ACTIVE_MODEL_ID && row.enabled), true);
assert.equal(defaultToggles.some((row) => row.id === "gpt-5.5"), false);
const registryRows = getModelRegistryRows("web");
assert.equal(registryRows.find((row) => row.id === DEFAULT_ACTIVE_MODEL_ID)?.enabled, true);
assert.equal(registryRows.find((row) => row.id === "gpt-5.5")?.enabled, false);
assert.deepEqual(getSupportedFundingSourcesForModel("gpt-5.5"), ["user_key", "user_chatgpt"]);

assert.match(
  modelCatalog,
  /DEFAULT_ACTIVE_MODEL_ID = "gpt-5\.6-sol"[\s\S]*DEFAULT_ACTIVE_MODEL_LABEL = "GPT 5\.6 Sol"/,
  "GPT-5.6 Sol must be the canonical active model and display label",
);
assert.match(
  modelCatalog,
  /id: DEFAULT_ACTIVE_MODEL_ID[\s\S]*defaultEnabled: true/,
  "Sol must be the enabled web default",
);
assert.match(
  modelCatalog,
  /id: "gpt-5\.5"[\s\S]*defaultEnabled: false/,
  "GPT-5.5 must remain disabled compatibility rather than an active choice",
);
assert.match(
  inferenceConfig,
  /\[DEFAULT_ACTIVE_MODEL_ID\]: "openai\/gpt-5\.6-sol"[\s\S]*"gpt-5\.5": "openai\/gpt-5\.5"/,
  "provider mapping must expose Sol while retaining GPT-5.5 compatibility",
);
assert.match(
  runtimeResolution,
  /requestedModelId = String\(input\.model_id \?\? ""\)\.trim\(\) \|\| DEFAULT_ACTIVE_MODEL_ID/,
  "ordinary Polynet turns must default through the canonical model",
);
assert.match(
  runtimeResolution,
  /platformMap\[DEFAULT_ACTIVE_MODEL_ID\][\s\S]*platformMap\["gpt-5\.5"\]/,
  "runtime provider fallback must prefer Sol before legacy GPT-5.5",
);
assert.match(
  providerProbes,
  /normalizeString\(args\.modelId\) \|\| DEFAULT_ACTIVE_MODEL_ID/,
  "ChatGPT connection probes must default to Sol",
);
assert.match(
  providerGateway,
  /normalizeGatewayNullableString\(payload\?\.model_id\) \|\| DEFAULT_ACTIVE_MODEL_ID/,
  "provider status must report the canonical model when a response omits it",
);
assert.match(
  daytonaPolicy,
  /defaultModelId: DEFAULT_ACTIVE_MODEL_ID/,
  "Daytona Codex must inherit the same canonical Sol default",
);
assert.match(
  app,
  /DEFAULT_ACTIVE_MODEL_LABEL[\s\S]*defaultOpenAiModel\?\.label \?\? DEFAULT_ACTIVE_MODEL_LABEL/,
  "the primary web shell must render the canonical Sol label without a GPT-5.5 fallback",
);
console.log("gpt_5_6_sol_default_contract_proof: ok");
