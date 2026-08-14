import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  AUTHENTICATED_PLATFORM_CAPABILITIES,
  resolveActiveCapabilityFamiliesFromEntitlements,
  resolveEntitledCapabilityFamiliesForGate,
  resolveHarnessProfileFromActiveCapabilities,
} from "../shared/canonicalGateEngine.ts";
import {
  RUNTIME_ENGINE_CODEX,
  RUNTIME_ENGINE_POLYNET,
  canUseRuntimeEngine,
  getRuntimeEngineAccessLevel,
} from "../shared/runtimeEngine.ts";

const read = (path: string) => readFileSync(path, "utf8");
const capabilities = [...AUTHENTICATED_PLATFORM_CAPABILITIES];
const expectedCapabilities = [
  "product_docs",
  "community_tools",
  "web_research",
  "sandbox_tools",
  "workspace_tools",
];

assert.deepEqual(capabilities, expectedCapabilities);
assert.deepEqual(
  resolveEntitledCapabilityFamiliesForGate({ authState: "authenticated", tier: "free" }),
  expectedCapabilities,
);
assert.deepEqual(
  resolveEntitledCapabilityFamiliesForGate({ authState: "authenticated", tier: "architect" }),
  expectedCapabilities,
  "the archived architect value must not create a different product capability tier",
);
assert.deepEqual(
  resolveEntitledCapabilityFamiliesForGate({ authState: "anonymous", tier: "free" }),
  [],
);
assert.deepEqual(
  resolveActiveCapabilityFamiliesFromEntitlements({
    entitledCapabilityFamilies: capabilities,
    hasProjectContext: false,
  }),
  ["product_docs", "community_tools", "web_research", "sandbox_tools"],
);
assert.deepEqual(
  resolveActiveCapabilityFamiliesFromEntitlements({
    entitledCapabilityFamilies: capabilities,
    hasProjectContext: true,
  }),
  expectedCapabilities,
);
assert.equal(
  resolveHarnessProfileFromActiveCapabilities({
    authState: "authenticated",
    activeCapabilityFamilies: capabilities,
  }),
  "authenticated_cloud_tools",
);
assert.equal(getRuntimeEngineAccessLevel(RUNTIME_ENGINE_POLYNET), "included");
assert.equal(canUseRuntimeEngine({ engine: RUNTIME_ENGINE_POLYNET }), true);
assert.equal(canUseRuntimeEngine({ engine: RUNTIME_ENGINE_CODEX }), false);

const runtimePrompt = read("shared/runtimePrompt.ts");
const runtimeAgentLoop = read("convex/runtimeAgentLoop.ts");
const runtimeHandlers = read("convex/runtimeTurnHandlers.ts");
const voice = read("convex/httpVoice.ts");
const docs = read("docs/auth-money-access-matrix.md");

assert.doesNotMatch(runtimePrompt, /RuntimeAccountPlan|Account plan:|Premium-only|Billing to upgrade/);
assert.doesNotMatch(runtimeAgentLoop, /reserveCreditsInternal|settleCreditsInternal/);
assert.doesNotMatch(runtimeHandlers, /reserveCreditsInternal|settleCreditsInternal|paid_usage_billing_mode|required_credits/);
assert.doesNotMatch(voice, /reserveCreditsInternal|settleCreditsInternal|workspace_credits_exhausted/);
assert.match(
  runtimeAgentLoop,
  /authorizeFounderPaidToolFundingSession[\s\S]*settleFounderPaidToolFundingSession/,
);
assert.match(runtimeHandlers, /recordPlatformToolCostBestEffort/);
assert.match(voice, /recordPlatformToolCostBestEffort/);
assert.match(docs, /One backend resolver composes them/);
assert.match(docs, /Each active Builder cycle includes up to `\$20` raw GPT 5\.6 Luna model cost/);

console.log("platform_harness_prompt_contract_proof: ok");
