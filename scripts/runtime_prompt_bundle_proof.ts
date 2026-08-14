import assert from "node:assert/strict";
import {
  buildPlatformHarnessRuntimePromptBundle,
  buildPlatformHarnessRuntimeSystemPrompt,
} from "../shared/runtimePrompt.ts";
import { buildRuntimeTurnContextPacket } from "../shared/runtimeTurnContextPacket.ts";

const params = {
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
  ] as const,
  harnessName: "chat_tools" as const,
  invocationSurface: "member_agent_dock" as const,
  communityId: "community_1",
  communityName: "Bundle Community",
  communitySlug: "bundle-community",
  communityAbout: "A prompt receipt fixture.",
  communitySystemPrompt: "Prefer bundle-grounded answers.",
  communityResourceLane: {
    lane: "builder" as const,
    can_read_live_resources: true,
    can_use_resource_builder: true,
  },
  agentName: "James",
  agentSoul: "Keep the receipt exact.",
  runtimeTurnContext: buildRuntimeTurnContextPacket({
    latestUserText: "Inspect the active community.",
    threadWorkingState: {
      goal: "Summarize verified community activity.",
      currentStep: "Read current community sources.",
      filesChanged: [],
      verifiedFindings: [],
    },
  }),
  currentDateTimeIso: "2026-06-17T12:00:00.000Z",
  currentDateLabel: "Wednesday, June 17, 2026 at 8:00:00 AM EDT",
  currentTimeZone: "America/New_York",
};

const bundle = buildPlatformHarnessRuntimePromptBundle(params);
assert.equal(bundle.text, buildPlatformHarnessRuntimeSystemPrompt(params));
assert.deepEqual(
  bundle.sections.map((section) => section.id),
  [
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
    "runtime_turn_context",
    "temporal_context",
  ],
);
assert.ok(bundle.sections.every((section) => section.owner !== "workspace"));
assert.doesNotMatch(
  bundle.text,
  /PLATFORM_HARNESS_CONTEXT|WORKSPACE_PROCESS_CONTEXT|terminal_start|computer_screenshot|\bbash\b/,
);

const headings = [
  "PLATFORM_DOCTRINE",
  "AGENT_SOUL",
  "AGENT_OPERATING_POLICY",
  "INVOCATION_SURFACE",
  "COMMUNITY_LENS",
  "COMMUNITY_SYSTEM_PROMPT",
  "THREAD_WORKING_STATE",
  "TEMPORAL_CONTEXT",
];
let previous = -1;
for (const heading of headings) {
  const next = bundle.text.indexOf(heading);
  assert.ok(next > previous, `${heading} must retain canonical prompt order`);
  previous = next;
}

console.log("runtime_prompt_bundle_proof: ok");
