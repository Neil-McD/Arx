import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildPlatformHarnessRuntimePromptBundle,
  buildPlatformHarnessRuntimeSystemPrompt,
  compileRuntimePromptSections,
  type RuntimePromptBundle,
} from "../shared/runtimePrompt.ts";
import { buildRuntimeTurnContextPacket } from "../shared/runtimeTurnContextPacket.ts";

function sectionById(bundle: RuntimePromptBundle, id: string) {
  return bundle.sections.find((section) => section.id === id) ?? null;
}

function sectionIds(bundle: RuntimePromptBundle): string[] {
  return bundle.sections.map((section) => section.id);
}

function assertRendered(bundle: RuntimePromptBundle, id: string): void {
  const section = sectionById(bundle, id);
  assert.ok(section, `missing section ${id}`);
  assert.equal(section.rendered, true, `${id} should render`);
  assert.ok(section.chars > 0, `${id} should record rendered chars`);
}

function assertOmitted(bundle: RuntimePromptBundle, id: string): void {
  const section = sectionById(bundle, id);
  assert.ok(section, `missing section ${id}`);
  assert.equal(section.rendered, false, `${id} should be omitted`);
  assert.equal(section.chars, 0, `${id} omitted chars should be zero`);
}

const fullParams = {
  loopBudget: {
    maxToolSteps: 8,
    maxRepeatedIdenticalCalls: 2,
    maxConsecutiveFailures: 3,
    maxNoProgressSteps: 3,
  },
  allowedToolNames: [
    "search_product_docs",
    "get_product_doc",
    "polynet_list",
    "polynet_read",
    "polynet_search",
    "polynet_write",
    "polynet_call",
    "web_research",
    "read",
    "write",
    "bash",
    "terminal_start",
  ] as const,
  harnessName: "chat_tools" as const,
  invocationSurface: "member_agent_dock" as const,
  communityId: "community_1",
  communityName: "Bundle Community",
  communitySlug: "bundle-community",
  communityOneLiner: "A prompt receipt fixture.",
  communityAbout: "Used to prove prompt bundle receipts.",
  communitySystemPrompt: "Prefer bundle-grounded answers.",
  communityResourceLane: {
    lane: "builder" as const,
    can_read_live_resources: true,
    can_use_resource_builder: true,
  },
  communityLensAuthority: {
    relation: "owner" as const,
    effectiveRole: "owner" as const,
    canManage: true,
    canModerate: true,
    canManageResources: true,
    canReviewJoinRequests: true,
    communityResourceLane: {
      lane: "builder" as const,
      can_read_live_resources: true,
      can_use_resource_builder: true,
    },
  },
  agentName: "James",
  agentSoul: "Keep the receipt exact.",
  projectLabel: "Bundle project",
  projectDescription: "A project used to prove prompt receipts.",
  runtimeTurnContext: buildRuntimeTurnContextPacket({
    runtimeTurnEnvelope: {
      version: 1,
      currentRequest: "Prove the prompt bundle.",
      continuityGoal: "Improve context routing.",
      authority: {
        threadId: "thread_1",
        communityId: "community_1",
        projectId: "project_1",
        communityResourceLane: "builder",
        allowedToolNames: ["read", "write"],
      },
      state: {
        currentStep: "Verify prompt receipts.",
        verified: ["Bundle API preserves prompt text."],
        openQuestions: [],
        nextAction: "Run the proof.",
      },
    },
  }),
  currentDateTimeIso: "2026-06-17T12:00:00.000Z",
  currentDateLabel: "Wednesday, June 17, 2026 at 8:00:00 AM EDT",
  currentTimeZone: "America/New_York",
};

const fullBundle = buildPlatformHarnessRuntimePromptBundle(fullParams);
const legacyPrompt = buildPlatformHarnessRuntimeSystemPrompt(fullParams);

assert.equal(
  fullBundle.text,
  legacyPrompt,
  "bundle text must exactly match legacy system prompt output",
);

assert.deepEqual(sectionIds(fullBundle), [
  "platform_doctrine",
  "agent_soul",
  "user_agent_soul",
  "explanation_contract",
  "harness_operating_policy",
  "invocation_surface",
  "current_surface",
  "member_identity_context",
  "community_lens",
  "community_lens_authority",
  "community_system_prompt",
  "community_resource_lane",
  "workspace_harness_context",
  "runtime_turn_context",
  "temporal_context",
]);

for (const id of sectionIds(fullBundle)) {
  if (id === "current_surface" || id === "member_identity_context") {
    assertOmitted(fullBundle, id);
  } else {
    assertRendered(fullBundle, id);
  }
}

const orderedHeadings = [
  "PLATFORM_DOCTRINE",
  "AGENT_SOUL",
  "USER_AGENT_SOUL",
  "EXPLANATION_CONTRACT",
  "AGENT_OPERATING_POLICY",
  "INVOCATION_SURFACE",
  "COMMUNITY_LENS",
  "COMMUNITY_LENS_AUTHORITY",
  "COMMUNITY_SYSTEM_PROMPT",
  "COMMUNITY_RESOURCE_BUILDER_LANE",
  "PLATFORM_HARNESS_CONTEXT",
  "RUNTIME_TURN_ENVELOPE",
  "TEMPORAL_CONTEXT",
];
let previousIndex = -1;
for (const heading of orderedHeadings) {
  const index = fullBundle.text.indexOf(heading);
  assert.notEqual(index, -1, `expected ${heading} in prompt text`);
  assert.ok(index > previousIndex, `${heading} should preserve prompt order`);
  previousIndex = index;
}

assert.equal(sectionById(fullBundle, "platform_doctrine")?.layer, "stable");
assert.equal(sectionById(fullBundle, "platform_doctrine")?.slot, "instruction");
assert.equal(
  sectionById(fullBundle, "platform_doctrine")?.authority,
  "platform_policy",
);
assert.equal(sectionById(fullBundle, "community_lens")?.layer, "scoped");
assert.equal(
  sectionById(fullBundle, "community_lens_authority")?.owner,
  "community",
);
assert.equal(
  sectionById(fullBundle, "runtime_turn_context")?.layer,
  "volatile",
);
assert.equal(sectionById(fullBundle, "user_agent_soul")?.owner, "user");
assert.equal(
  sectionById(fullBundle, "workspace_harness_context")?.owner,
  "workspace",
);
assert.equal(sectionById(fullBundle, "runtime_turn_context")?.slot, "context");

const legacySuffix =
  "\n\nPLATFORM_SKILL_OVERLAY\nUse the exact fixture.\n\nCOMMUNITY_SKILL_OVERLAY\nKeep community scope.";
const extensionBundle = buildPlatformHarnessRuntimePromptBundle({
  ...fullParams,
  promptExtensions: [
    {
      id: "platform_skill_overlay",
      layer: "scoped",
      slot: "instruction",
      owner: "platform",
      authority: "platform_policy",
      source: "fixture#platform",
      reason: "selected platform skill instructions",
      text: "\n\nPLATFORM_SKILL_OVERLAY\nUse the exact fixture.",
    },
    {
      id: "personal_skill_overlay",
      layer: "scoped",
      slot: "instruction",
      owner: "user",
      authority: "user_preference",
      source: "fixture#personal",
      reason: "selected personal skill instructions",
      text: "",
    },
    {
      id: "community_skill_overlay",
      layer: "scoped",
      slot: "instruction",
      owner: "community",
      authority: "community_policy",
      source: "fixture#community",
      reason: "selected community skill instructions",
      text: "\n\nCOMMUNITY_SKILL_OVERLAY\nKeep community scope.",
    },
  ],
});
assert.equal(extensionBundle.text, fullBundle.text + legacySuffix);
assert.deepEqual(sectionIds(extensionBundle).slice(-3), [
  "platform_skill_overlay",
  "personal_skill_overlay",
  "community_skill_overlay",
]);
assert.equal(sectionById(extensionBundle, "platform_skill_overlay")?.chars, 47);
assertOmitted(extensionBundle, "personal_skill_overlay");

const funnelBaseBundle = buildPlatformHarnessRuntimePromptBundle({
  ...fullParams,
  invocationSurface: "community_funnel_builder",
});
const funnelExtensionBundle = buildPlatformHarnessRuntimePromptBundle({
  ...fullParams,
  invocationSurface: "community_funnel_builder",
  promptExtensions: [
    {
      id: "community_skill_overlay",
      layer: "scoped",
      slot: "instruction",
      owner: "community",
      authority: "community_policy",
      source: "fixture#funnel",
      reason: "selected funnel workflow instructions",
      text: "\n\nFUNNEL_WORKFLOW_FIXTURE",
    },
  ],
});
assert.equal(
  funnelExtensionBundle.text,
  `${funnelBaseBundle.text}\n\nFUNNEL_WORKFLOW_FIXTURE`,
);

assert.throws(
  () =>
    buildPlatformHarnessRuntimePromptBundle({
      ...fullParams,
      promptExtensions: [
        {
          id: "community_lens",
          layer: "scoped",
          slot: "instruction",
          owner: "community",
          authority: "community_policy",
          source: "fixture#duplicate-base",
          reason: "prove duplicate base ids fail closed",
          text: "\n\nDUPLICATE",
        },
      ],
    }),
  /runtime_prompt_section_id_duplicate:community_lens/,
  "an extension must not shadow a canonical base section receipt",
);
assert.throws(
  () =>
    compileRuntimePromptSections([
      {
        id: "duplicate",
        layer: "scoped",
        slot: "instruction",
        owner: "platform",
        authority: "platform_policy",
        source: "fixture#one",
        reason: "first exact section",
        text: "one",
      },
      {
        id: "duplicate",
        layer: "scoped",
        slot: "instruction",
        owner: "community",
        authority: "community_policy",
        source: "fixture#two",
        reason: "second exact section",
        text: "two",
      },
    ]),
  /runtime_prompt_section_id_duplicate:duplicate/,
  "exact-section compilation must reject duplicate receipt ids",
);
assert.throws(
  () =>
    compileRuntimePromptSections([
      {
        id: "   ",
        layer: "scoped",
        slot: "instruction",
        owner: "platform",
        authority: "platform_policy",
        source: "fixture#blank",
        reason: "prove blank ids fail closed",
        text: "x",
      },
    ]),
  /runtime_prompt_section_id_invalid:/,
  "exact-section compilation must reject blank receipt ids",
);
assert.throws(
  () =>
    compileRuntimePromptSections([
      {
        id: "Not-Canonical",
        layer: "scoped",
        slot: "instruction",
        owner: "platform",
        authority: "platform_policy",
        source: "fixture#invalid",
        reason: "prove noncanonical ids fail closed",
        text: "x",
      },
    ]),
  /runtime_prompt_section_id_invalid:Not-Canonical/,
  "exact-section compilation must reject noncanonical receipt ids",
);

const omittedBundle = buildPlatformHarnessRuntimePromptBundle({
  loopBudget: {
    maxToolSteps: 8,
    maxRepeatedIdenticalCalls: 2,
    maxConsecutiveFailures: 3,
    maxNoProgressSteps: 3,
  },
  allowedToolNames: ["search_product_docs", "get_product_doc"],
  harnessName: "chat_tools",
  invocationSurface: "member_agent_dock",
  runtimeTurnContext: buildRuntimeTurnContextPacket({}),
});

assert.equal(
  omittedBundle.text,
  buildPlatformHarnessRuntimeSystemPrompt({
    loopBudget: {
      maxToolSteps: 8,
      maxRepeatedIdenticalCalls: 2,
      maxConsecutiveFailures: 3,
      maxNoProgressSteps: 3,
    },
    allowedToolNames: ["search_product_docs", "get_product_doc"],
    harnessName: "chat_tools",
    invocationSurface: "member_agent_dock",
    runtimeTurnContext: buildRuntimeTurnContextPacket({}),
  }),
  "omitted-section fixture should also preserve legacy prompt output",
);

assertRendered(omittedBundle, "platform_doctrine");
assertRendered(omittedBundle, "agent_soul");
assertRendered(omittedBundle, "invocation_surface");
assertRendered(omittedBundle, "community_lens");
assertRendered(omittedBundle, "workspace_harness_context");
assertOmitted(omittedBundle, "user_agent_soul");
assertOmitted(omittedBundle, "community_lens_authority");
assertOmitted(omittedBundle, "community_system_prompt");
assertOmitted(omittedBundle, "community_resource_lane");
assertOmitted(omittedBundle, "runtime_turn_context");
assertOmitted(omittedBundle, "temporal_context");

const runtimePromptSource = readFileSync("shared/runtimePrompt.ts", "utf8");
const runtimeAgentLoopSource = readFileSync(
  "convex/runtimeAgentLoop.ts",
  "utf8",
);

assert.match(
  runtimePromptSource,
  /export function buildPlatformHarnessRuntimePromptBundle/,
  "runtime prompt source should expose the bundle entrypoint",
);
assert.match(
  runtimePromptSource,
  /return buildPlatformHarnessRuntimePromptBundle\(params\)\.text;/,
  "legacy string prompt function should delegate to the bundle",
);
assert.match(
  runtimeAgentLoopSource,
  /buildPlatformHarnessRuntimePromptBundle\(\{/,
  "agentic runtime should build the prompt bundle directly",
);
assert.match(
  runtimeAgentLoopSource,
  /eventType:\s*"runtime_prompt_bundle_resolved"/,
  "agentic runtime should emit a prompt bundle receipt event",
);
assert.match(
  runtimeAgentLoopSource,
  /systemPrompt\s*=\s*runtimePromptBundle\.text/,
  "final system prompt should be exactly the compiled bundle text",
);
assert.match(
  runtimeAgentLoopSource,
  /promptExtensions:\s*resolvedHarness\.promptExtensions/,
  "harness overlays should enter the canonical compiler as explicit sections",
);
assert.doesNotMatch(
  runtimeAgentLoopSource,
  /buildPromptSuffix\(\)|\$\{runtimePromptBundle\.text\}\$\{promptSuffix\}|id:\s*"harness_prompt_suffix"/,
  "runtime loop must not append or manually receipt an opaque suffix",
);
assert.doesNotMatch(
  runtimeAgentLoopSource,
  /privateLifecycleContextMd|private_lifecycle_context|privateLifecyclePrompt/,
  "retired onboarding lifecycle context must not enter the prompt or receipt",
);

console.log("runtime_prompt_bundle_proof: ok");
