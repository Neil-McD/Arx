import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { DEFAULT_ACTIVE_MODEL_ID } from "../shared/modelCatalog.ts";
import {
  listRuntimeModelCapacityProfiles,
  resolveRuntimeProviderBudgetIdentity,
} from "../shared/runtimeInputBudget.ts";

// Every agent turn is founder-funded and runs on OpenAI. OpenRouter, Gemini,
// Grok, xAI search and own-account payment (OpenAI key, ChatGPT account) are
// retired (Neil, Oct 20 and Oct 27 2026).

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

for (const path of [
  "convex/openRouterNativeTransport.ts",
  "convex/xAiSearchTransport.ts",
  "convex/httpChatgpt.ts",
  "convex/chatgptAuth.ts",
  "convex/chatgptResponsesTransport.ts",
  "convex/gates.ts",
  "convex/httpContext.ts",
  "convex/modelRegistry.ts",
  "convex/providerConnectionProbes.ts",
  "shared/cloudProviderConnectionsGateway.ts",
]) {
  assert.equal(existsSync(join(root, path)), false, `${path} must stay deleted`);
}

const resolution = read("convex/runtimeTurnResolution.ts");
assert.match(
  resolution,
  /const modelRef = `openai\/\$\{COMMUNITY_OWNER_FUNDED_MODEL_ID\}`;[\s\S]*const inferenceSource = "platform" as const;/,
  "every runtime turn resolves to the founder-funded OpenAI community model",
);
assert.doesNotMatch(
  resolution,
  /resolveGateDecisionForAuthenticatedActor|providerApiKeyOverride|user_key|user_chatgpt|loadPlatformModelMap/,
  "turn resolution has no other funding path",
);

const loop = read("convex/runtimeAgentLoop.ts");
assert.match(loop, /type RuntimeInferenceSource = "platform";/);
assert.doesNotMatch(loop, /runOpenRouterNativeToolCompletion|runChatgptNativeToolCompletion|apiKeyOverride/);

const handlers = read("convex/runtimeTurnHandlers.ts");
assert.doesNotMatch(handlers, /runOpenRouterCompletion|runChatgptCompletion|providerApiKeyOverride/);

assert.deepEqual(
  [...new Set(listRuntimeModelCapacityProfiles().map((profile) => profile.transport))],
  ["openai_responses"],
  "agent turns budget only the OpenAI transport",
);
assert.equal(
  resolveRuntimeProviderBudgetIdentity({
    inferenceSource: "platform",
    requestedModelId: "gpt-6-luna",
    modelRef: "openai/gpt-6-luna",
  }).transport,
  "openai_responses",
);
assert.equal(DEFAULT_ACTIVE_MODEL_ID, "gpt-5.6-sol");

// No backend code calls a retired provider's API.
const backend = execFileSync("git", ["ls-files", "convex", "shared"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter((path) => /\.(ts|tsx)$/.test(path) && !/\.test\.tsx?$/.test(path) && !path.includes("/_generated/"))
  .filter((path) => existsSync(join(root, path)));
const offenders = backend.filter((path) =>
  /openrouter\.ai|api\.x\.ai|generativelanguage\.googleapis\.com|chatgpt\.com\/backend-api/i.test(read(path)),
);
assert.deepEqual(offenders, [], `retired provider endpoints are still called from: ${offenders.join(", ")}`);

console.log("single_inference_provider_contract_proof: ok");
