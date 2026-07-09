import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const schema = read("convex/schema.ts");
const profiles = read("convex/profiles.ts");
const lifecycle = read("convex/agentLifecycleActivations.ts");
const onboardingLifecycle = read("convex/onboardingLifecycle.ts");
const runtimeTurnHandlers = read("convex/runtimeTurnHandlers.ts");
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
  /trigger: RuntimeSkillLifecycleTrigger = "onboarding_completed"/,
  "onboarding helper must write the onboarding_completed trigger",
);
assert.doesNotMatch(
  lifecycle,
  /scopeType = "user" as const/,
  "profile completion must not create legacy user-scoped onboarding evidence",
);
assert.doesNotMatch(
  lifecycle,
  /account_onboarding_completed/,
  "activation sources must not keep the deleted user-scoped account completion path",
);
assert.match(
  lifecycle,
  /ensureCommunityOnboardingCompletedAgentLifecycleActivation/,
  "community-scoped onboarding activation helper must exist",
);
assert.match(
  lifecycle,
  /scopeType = "community" as const/,
  "onboarding guide kickoff must be scoped to the active community lens",
);
assert.match(
  lifecycle,
  /scopeType: v\.literal\("community"\)/,
  "lifecycle activation claim API must not accept deleted user-scoped activations",
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
  lifecycle,
  /ONBOARDING_ACTIVATION_PROCESSING_STALE_MS/,
  "processing lifecycle claims must have a bounded stale-reclaim window",
);
assert.match(
  lifecycle,
  /if \(isOnboardingActivationClaimable\(activation, nowMs\)\)[\s\S]*reclaimed: true as const[\s\S]*ok: false as const,[\s\S]*status: "processing" as const/,
  "fresh processing lifecycle claims must remain idempotent",
);
assert.match(
  lifecycle,
  /reclaimed: true as const/,
  "stale processing lifecycle claims must be reclaimable",
);
assert.match(
  lifecycle,
  /activation\.runId && activation\.runId !== args\.runId[\s\S]*reason: "run_mismatch"/,
  "late stale lifecycle runs must not overwrite the current activation claim",
);
assert.match(
  lifecycle,
  /activation\.status === "completed"[\s\S]*reason: "already_completed"/,
  "failure finalization must not regress a completed lifecycle activation",
);

assert.doesNotMatch(
  profiles,
  /ensureOnboardingCompletedAgentLifecycleActivation/,
  "profile completion must not write legacy user-scoped lifecycle evidence",
);
assert.match(
  profiles,
  /insertMissingBridgeSocialLinkFacts/,
  "profile completion must keep deterministic bridge social-link ontology seeding",
);
assert.match(
  profiles,
  /args\.completeOnboarding === true && !existingDetail\?\.onboardingCompletedAt/,
  "bridge fact seeding must run only on explicit first onboarding completion",
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
  runtimeAgentLoop,
  /privateLifecycleContextMd\?: string \| null/,
  "runtime loop must support private lifecycle context outside the user message envelope",
);
assert.match(
  runtimeAgentLoop,
  /messages: params\.messages\.map[\s\S]*lifecycleTrigger: params\.skillLifecycleTrigger/,
  "skill lifecycle selection must resolve from safe messages plus lifecycle trigger evidence",
);
assert.match(
  skillContract,
  /community-scoped `onboarding_completed` activation/,
  "contract must state the community-scoped bridge handoff boundary",
);
assert.match(
  skillContract,
  /private lifecycle context/,
  "contract must state that lifecycle-private context is not a normal user message",
);
assert.match(
  skillContract,
  /run-id guarded/,
  "contract must state lifecycle finalization is guarded against stale run overwrite",
);
assert.match(
  skillContract,
  /no cron, email, notification, or background dispatcher is wired in this slice/,
  "contract must not overclaim background dispatch",
);
assert.match(
  skillContract,
  /first\s+workspace thread creation remains deferred/,
  "contract must explicitly defer first-thread lifecycle activation",
);
assert.match(
  onboardingLifecycle,
  /requestOnboardingGuideKickoff/,
  "bridge handoff action must exist",
);
assert.match(
  onboardingLifecycle,
  /ensureCloudThread/,
  "bridge handoff must create or reuse a normal cloud thread",
);
assert.match(
  onboardingLifecycle,
  /community-onboarding/,
  "bridge handoff must use a deterministic onboarding thread key",
);
assert.match(
  runtimeTurnHandlers,
  /claimOnboardingCompletedAgentLifecycleActivationInternal/,
  "normal runtime handling must claim the activation before running",
);
assert.match(
  runtimeTurnHandlers,
  /executeChatToolsAgentLoop/,
  "onboarding must use the normal runtime agent loop",
);
assert.match(
  runtimeTurnHandlers,
  /skillLifecycleTrigger: onboardingLifecycleRun[\s\S]*?"onboarding_completed"/,
  "normal runtime handling must select the onboarding skill through lifecycle trigger",
);
assert.doesNotMatch(
  onboardingLifecycle,
  /communityAgentServeRequests|persistRuntimeUserMessage|executeChatToolsAgentLoop/,
  "preparation must not route through agent queues or execute a model turn",
);
assert.match(
  runtimeTurnHandlers,
  /persistVisibleUserMessage = onboardingLifecycleRun === null/,
  "normal runtime handling must suppress the synthetic onboarding user message",
);

console.log("agent_lifecycle_activation_contract_proof: ok");
