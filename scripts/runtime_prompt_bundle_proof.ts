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
  communityAgentSurfaceContext: {
    version: 1,
    kind: "community",
    community_slug: "bundle-community",
    section: "resources",
  } as const,
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
const readOnlyBuilder = buildPlatformHarnessRuntimePromptBundle({ ...params,
  allowedToolNames: ["polynet_list", "polynet_read"],
  runtimeTurnContext: buildRuntimeTurnContextPacket({ latestUserText: "Tell me about Rashid." }),
});
assert.match(readOnlyBuilder.text, /For a question about a specific member of this community/);
assert.match(readOnlyBuilder.text, /builder\/workflow-members\//);
const memberLane = buildPlatformHarnessRuntimePromptBundle({ ...params,
  allowedToolNames: ["polynet_list", "polynet_read"],
  communityResourceLane: { lane: "member", can_read_live_resources: true, can_use_resource_builder: false },
});
assert.doesNotMatch(memberLane.text, /authorized owner\/admin dossier/);
assert.match(bundle.text, /first list \/communities\/bundle-community\/members\/, follow the returned me\/ directory, and read its returned context\.md document/);
assert.match(bundle.text, /global profile, not their community workflow progress/);
assert.match(bundle.text, /on-demand retrieval, not a required read for unrelated turns/);
assert.match(bundle.text, /Unavailable means the action's outcome cannot be verified/);
const switchedCommunity = buildPlatformHarnessRuntimePromptBundle({
  ...params, communityId: "community_2", communityName: "Second", communitySlug: "second-community",
  communityAgentSurfaceContext: { ...params.communityAgentSurfaceContext, community_slug: "second-community" },
});
assert.match(switchedCommunity.text, /first list \/communities\/second-community\/members\//);
assert.doesNotMatch(switchedCommunity.text, /first list \/communities\/bundle-community\/members\//);
assert.equal(bundle.text, buildPlatformHarnessRuntimeSystemPrompt(params));
assert.deepEqual(
  bundle.sections.map((section) => section.id),
  [
    "platform_doctrine",
    "explanation_contract",
    "harness_operating_policy",
    "invocation_surface",
    "current_surface",
    "member_identity_context",
    "community_memory_recall",
    "community_lens",
    "community_lens_authority",
    "community_system_prompt",
    "community_resource_lane",
    "runtime_turn_context",
    "temporal_context",
  ],
);
assert.ok(bundle.sections.every((section) => section.owner !== "workspace"));
assert.match(
  bundle.text,
  /You are this community's agent in a private conversation with the authenticated member\.[\s\S]*requesting member's current permissions/,
  "the Agent page speaks as the one community agent, inside the member's permissions",
);
assert.doesNotMatch(
  bundle.text,
  /AGENT_SOUL|USER_AGENT_SOUL|Configured agent name|James|Keep the receipt exact/,
  "hidden member naming and soul instructions must not enter the canonical prompt",
);
assert.doesNotMatch(
  bundle.text,
  /PLATFORM_HARNESS_CONTEXT|WORKSPACE_PROCESS_CONTEXT|terminal_start|computer_screenshot|\bbash\b/,
);
assert.match(
  bundle.text,
  /Follow every returned entry by its kind:[\s\S]*polynet_list when kind is directory[\s\S]*path ends in \/[\s\S]*polynet_read only when kind is document/,
  "the canonical prompt must route directory and document entries to different tools",
);
assert.doesNotMatch(
  bundle.text,
  /inspect returned paths with polynet_read/,
  "the canonical prompt must not direct every returned path to polynet_read",
);

const headings = [
  "PLATFORM_DOCTRINE",
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

const globalBundle = buildPlatformHarnessRuntimePromptBundle({
  ...params,
  communityId: null,
  communityName: null,
  communitySlug: null,
  communityAbout: null,
  communitySystemPrompt: null,
  communityLensAuthority: null,
  communityAgentSurfaceContext: {
    version: 1,
    kind: "discover",
    section: "communities",
  } as const,
});
assert.doesNotMatch(globalBundle.text, /follow the returned me\/ directory/);
assert.doesNotMatch(
  globalBundle.text,
  /Polynet Intelligence|personal agent|No community lens is active/,
  "the retired personal-agent identity stays deleted",
);

assert.throws(
  () => buildPlatformHarnessRuntimePromptBundle({
    ...params,
    invocationSurface: "community_funnel_builder" as never,
    communityAgentSurfaceContext: null,
  }),
  /invalid_runtime_invocation_surface/,
  "the retired funnel composer surface cannot build a prompt",
);

console.log("runtime_prompt_bundle_proof: ok");
