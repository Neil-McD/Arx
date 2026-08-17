import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  AUTHENTICATED_PLATFORM_CAPABILITIES,
  resolveActiveCapabilityFamiliesFromEntitlements,
  resolveEntitledCapabilityFamiliesForGate,
  resolveHarnessProfileFromActiveCapabilities,
} from "../shared/canonicalGateEngine.ts";
import {
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
  expectedCapabilities,
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

const runtimePrompt = read("shared/runtimePrompt.ts");
const runtimeAgentLoop = read("convex/runtimeAgentLoop.ts");
const docs = read("docs/auth-money-access-matrix.md");

assert.doesNotMatch(runtimePrompt, /RuntimeAccountPlan|Account plan:|Premium-only|Billing to upgrade/);
assert.match(
  runtimePrompt,
  /When stating an event time, use starts_at_zoned and ends_at_zoned\. The unsuffixed event timestamps are UTC transport instants\./,
  "the harness must use server-projected zoned event times instead of calculating them from UTC",
);
assert.match(
  runtimePrompt,
  /Use total_count for community size, never describe a page as the complete roster while next_cursor is non-null/,
  "the harness must distinguish a bounded member page from the complete authorized roster",
);
assert.doesNotMatch(runtimeAgentLoop, /reserveCreditsInternal|settleCreditsInternal/);
assert.match(
  runtimeAgentLoop,
  /authorizeFounderPaidToolFundingSession[\s\S]*settleFounderPaidToolFundingSession/,
);
assert.match(docs, /One backend resolver composes them/);
assert.match(docs, /Each active Builder cycle includes up to `\$20` raw GPT 5\.6 Luna model cost/);

console.log("platform_harness_prompt_contract_proof: ok");
