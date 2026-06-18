import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const schema = read("convex/schema.ts");
const profiles = read("convex/profiles.ts");
const lifecycle = read("convex/agentLifecycleActivations.ts");
const skillLifecycle = read("shared/runtimeSkillLifecycle.ts");
const skillContract = read("docs/skill-harness-contract.md");
const runtimeAgentLoop = read("convex/runtimeAgentLoop.ts");

assert.match(
  schema,
  /agentLifecycleActivations: defineTable/,
  "schema must include a backend lifecycle activation ledger",
);
assert.match(
  schema,
  /trigger: v\.literal\("onboarding_completed"\)/,
  "activation ledger must keep only the wired onboarding lifecycle trigger",
);
assert.doesNotMatch(
  schema,
  /first_thread_created/,
  "activation ledger must not include deferred lifecycle triggers before they are wired",
);
assert.doesNotMatch(
  schema,
  /agentLifecycleActivations: defineTable\(\{[\s\S]*?status: v\.union\([\s\S]*?v\.literal\("skipped"\)[\s\S]*?\),[\s\S]*?activationRoute/,
  "activation ledger must not include skipped status before dispatcher semantics exist",
);
assert.match(
  schema,
  /activationRoute: v\.literal\("lifecycle_trigger"\)/,
  "activation ledger must store lifecycle activation route evidence",
);
assert.match(
  schema,
  /\.index\("by_user_trigger_scope", \[[\s\S]*"userId"[\s\S]*"trigger"[\s\S]*"scopeType"[\s\S]*"scopeKey"/,
  "activation ledger must have a user trigger scope idempotency index",
);
assert.match(
  schema,
  /\.index\("by_status_createdAt", \["status", "createdAt"\]\)/,
  "activation ledger must expose pending activation dispatch index",
);

assert.match(
  skillLifecycle,
  /export type RuntimeSkillLifecycleTrigger = "onboarding_completed"/,
  "shared lifecycle trigger vocabulary must keep only wired triggers",
);
assert.doesNotMatch(
  skillLifecycle,
  /first_thread_created/,
  "shared lifecycle trigger vocabulary must not include deferred triggers",
);
assert.match(
  skillLifecycle,
  /describeRuntimeSkillLifecycleTrigger/,
  "shared lifecycle trigger descriptions must be reusable as activation reasons",
);

assert.match(
  lifecycle,
  /ensureOnboardingCompletedAgentLifecycleActivation/,
  "onboarding lifecycle activation helper must exist",
);
assert.match(
  lifecycle,
  /trigger: RuntimeSkillLifecycleTrigger = "onboarding_completed"/,
  "onboarding helper must write the onboarding_completed trigger",
);
assert.match(
  lifecycle,
  /scopeType = "user" as const/,
  "onboarding activation must be user scoped",
);
assert.match(
  lifecycle,
  /status: "pending"/,
  "onboarding activation must start pending until a dispatcher claims it",
);
assert.match(
  lifecycle,
  /activationRoute: "lifecycle_trigger"/,
  "onboarding activation must store lifecycle route evidence",
);
assert.match(
  lifecycle,
  /activationReason: describeRuntimeSkillLifecycleTrigger\(trigger\)/,
  "onboarding activation must store compact backend activation reason",
);
assert.match(
  lifecycle,
  /findLifecycleActivation[\s\S]*withIndex\("by_user_trigger_scope"/,
  "onboarding activation must fail closed on duplicate trigger scope",
);

assert.match(
  profiles,
  /ensureOnboardingCompletedAgentLifecycleActivation/,
  "profile completion must write the lifecycle activation",
);
assert.match(
  profiles,
  /args\.completeOnboarding === true && !existingDetail\?\.onboardingCompletedAt/,
  "activation must fire only on explicit first onboarding completion",
);
assert.doesNotMatch(
  profiles,
  /markOnboardingDismissed === true && !existingDetail\?\.onboardingCompletedAt/,
  "dismiss-only compatibility flag must not trigger proactive onboarding",
);

assert.match(
  runtimeAgentLoop,
  /skillLifecycleTrigger\?: RuntimeSkillLifecycleTrigger \| null/,
  "runtime loop must already have a lifecycle trigger dispatch seam",
);
assert.match(
  skillContract,
  /explicit onboarding completion writes one pending `onboarding_completed`/,
  "contract must state the current event-source boundary",
);
assert.match(
  skillContract,
  /no cron, email, notification, or runtime dispatcher is wired in this slice/,
  "contract must not overclaim proactive dispatch",
);
assert.match(
  skillContract,
  /first workspace thread creation remains deferred/,
  "contract must explicitly defer first-thread lifecycle activation",
);

console.log("agent_lifecycle_activation_contract_proof: ok");
