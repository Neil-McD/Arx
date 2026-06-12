import assert from "node:assert/strict";

import { buildPlatformHarnessRuntimeSystemPrompt } from "../shared/runtimePrompt.ts";
import {
  buildRuntimeContextCapsule,
  buildRuntimeContextCapsuleMetadata,
} from "../shared/runtimeContextCapsule.ts";
import { buildRuntimeTurnContextPacket } from "../shared/runtimeTurnContextPacket.ts";
import { buildRuntimeTurnEnvelope } from "../shared/runtimeTurnEnvelope.ts";

function blockBetween(prompt: string, startName: string, endName: string): string {
  const start = prompt.indexOf(startName);
  assert.notEqual(start, -1, `expected ${startName} block`);
  const end = prompt.indexOf(endName, start + startName.length);
  assert.notEqual(end, -1, `expected ${endName} block after ${startName}`);
  return prompt.slice(start, end);
}

const latestUserText = "Help me plan this launch.";
const threadWorkingState = {
  version: 3,
  goal: "Create a coherent launch plan for the founder community.",
  status: "in_progress" as const,
  currentStep: "Orient around the user's current launch request.",
  completedSteps: ["Confirmed the active community lens."],
  verifiedFindings: ["Member resource tools are mounted for this turn."],
  openQuestions: ["Which launch audience matters first?"],
  nextAction: "Build the smallest useful launch plan.",
};
const allowedToolNames = [
  "search_product_docs",
  "get_product_doc",
  "get_active_community_context",
  "community_resources_map",
  "community_resources_read",
  "community_resources_list",
  "community_resource_read",
  "community_resources_search",
  "community_search",
  "web_research",
  "web_crawl",
  "read",
  "grep",
  "bash",
] as const;
const longCommunityAbout = [
  "Founder Circle shares launch playbooks, member examples, and practical operating knowledge.",
  Array.from({ length: 180 }, () => "community-context-filler").join(" "),
  "DO_NOT_RENDER_LONG_COMMUNITY_TAIL",
].join(" ");

const runtimeTurnEnvelope = buildRuntimeTurnEnvelope({
  latestUserText,
  threadWorkingState,
  threadId: "thread_context_coherence",
  communityId: "community_founders",
  projectId: "project_launch",
  communityResourceLane: {
    lane: "member",
    can_read_live_resources: true,
    can_use_resource_builder: false,
  },
  allowedToolNames,
});
const runtimeTurnContext = buildRuntimeTurnContextPacket({
  latestUserText,
  runtimeTurnEnvelope,
  threadWorkingState,
  recentToolAttempts: [
    {
      toolName: "community_search",
      status: "ok",
      commandOrTarget: "launch playbooks",
      outputPreview: "RAW_TOOL_OUTPUT_SHOULD_NOT_RENDER",
    },
  ],
});
const runtimeContextCapsule = buildRuntimeContextCapsule({
  latestUserText,
  threadId: "thread_context_coherence",
  communityId: "community_founders",
  projectId: "project_launch",
  projectLabel: "Launch workspace",
  projectDescription: "Workspace context for the launch plan.",
  communityName: "Founder Circle",
  communitySlug: "founder-circle",
  communityOneLiner: "A community for founders building AI-native companies.",
  communityAbout: longCommunityAbout,
  communityResourceLane: {
    lane: "member",
    can_read_live_resources: true,
    can_use_resource_builder: false,
  },
  allowedToolNames,
  runtimeTurnContext,
  mountedToolCapabilityGroups: [
    {
      app_name: "Docs MCP",
      auth_type: "none",
      scopes: ["user"],
      default_scope: "user",
      tool_count: 2,
      default_runtime_tool_names: ["me__docs_search"],
      executable_runtime_tool_names: ["me__docs_search", "me__docs_read"],
    },
  ],
  runtimeMountedToolCount: 2,
  defaultDiscoveryMountedToolCount: 1,
  shadowedMountedToolCount: 0,
  platformSkillInventory: [
    {
      name: "Launch Planner",
      mention_token: "launch-planner",
      description: "FULL_SKILL_BODY_SHOULD_NOT_RENDER",
    },
  ],
  selectedPlatformSkills: [
    {
      name: "Launch Planner",
      mention_token: "launch-planner",
      description: "FULL_SELECTED_SKILL_BODY_SHOULD_NOT_RENDER",
    },
  ],
});
const runtimeContextCapsuleMetadata =
  buildRuntimeContextCapsuleMetadata(runtimeContextCapsule);

const prompt = buildPlatformHarnessRuntimeSystemPrompt({
  loopBudget: {
    maxToolSteps: 8,
    maxRepeatedIdenticalCalls: 2,
    maxConsecutiveFailures: 3,
    maxNoProgressSteps: 3,
  },
  allowedToolNames,
  communityResourceLane: {
    lane: "member",
    can_read_live_resources: true,
    can_use_resource_builder: false,
  },
  harnessName: "chat_tools",
  projectLabel: "Launch workspace",
  projectDescription: "Workspace context for the launch plan.",
  communityId: "community_founders",
  communityName: "Founder Circle",
  communitySlug: "founder-circle",
  communityOneLiner: "A community for founders building AI-native companies.",
  communityAbout: longCommunityAbout,
  communitySystemPrompt: "Be useful to founders without forcing every answer into community-specific framing.",
  agentName: "James",
  agentSoul: "Prefer first-principles launch planning over generic marketing checklists.",
  runtimeContextCapsule,
  runtimeTurnContext,
  currentDateTimeIso: "2026-06-03T16:00:00.000Z",
  currentDateLabel: "Wednesday, June 3, 2026 at 12:00:00 PM EDT",
  currentTimeZone: "America/New_York",
});

const capsuleIndex = prompt.indexOf("RUNTIME_CONTEXT_CAPSULE");
const envelopeIndex = prompt.indexOf("RUNTIME_TURN_ENVELOPE");
const workingStateIndex = prompt.indexOf("THREAD_WORKING_STATE");
assert.ok(capsuleIndex >= 0, "rendered prompt should include the context capsule");
assert.ok(envelopeIndex >= 0, "rendered prompt should include the runtime turn envelope");
assert.ok(workingStateIndex >= 0, "rendered prompt should include thread working state");
assert.ok(
  capsuleIndex < envelopeIndex,
  "context capsule should render before the detailed runtime packet",
);
assert.ok(
  envelopeIndex < workingStateIndex,
  "runtime turn envelope should render before detailed working state",
);

const contextCapsuleBlock = blockBetween(prompt, "RUNTIME_CONTEXT_CAPSULE", "RUNTIME_TURN_ENVELOPE");
assert.match(contextCapsuleBlock, /Current request: Help me plan this launch\./);
assert.match(
  contextCapsuleBlock,
  /Continuity goal: Create a coherent launch plan for the founder community\./,
);
assert.match(contextCapsuleBlock, /Mounted tools: executable=2; default_discovery=1; shadowed=0/);
assert.match(contextCapsuleBlock, /Skills: platform: inventory=1; selected=1 \(\$launch-planner\)/);
assert.match(contextCapsuleBlock, /Omissions: large_text=yes; raw_tool_output=yes;/);
assert.match(contextCapsuleBlock, /selected_skill_bodies_omitted_from_capsule=1/);
assert.match(contextCapsuleBlock, /unexposed_tools=1/);
assert.doesNotMatch(
  contextCapsuleBlock,
  /thread_context_coherence|community_founders|project_launch|thread=|community=|project=/,
  "context capsule should not expose raw internal ids",
);
assert.doesNotMatch(
  contextCapsuleBlock,
  /DO_NOT_RENDER_LONG_COMMUNITY_TAIL|RAW_TOOL_OUTPUT_SHOULD_NOT_RENDER|FULL_SKILL_BODY_SHOULD_NOT_RENDER|FULL_SELECTED_SKILL_BODY_SHOULD_NOT_RENDER/,
  "context capsule should omit long text, raw output, and skill bodies",
);
assert.equal(runtimeContextCapsuleMetadata.version, 1);
assert.match(runtimeContextCapsuleMetadata.hash, /^fnv1a32:[a-f0-9]{8}$/);
assert.equal(runtimeContextCapsuleMetadata.currentRequestPresent, true);
assert.equal(runtimeContextCapsuleMetadata.continuityGoalPresent, true);
assert.equal(runtimeContextCapsuleMetadata.sectionCounts.mountedToolCapabilities, 1);
assert.equal(runtimeContextCapsuleMetadata.sectionCounts.selectedSkills, 1);

const requestOnlyContext = buildRuntimeTurnContextPacket({
  latestUserText: "Fix the bridge.",
});
const requestOnlyCapsule = buildRuntimeContextCapsule({
  latestUserText: "Fix the bridge.",
  runtimeTurnContext: requestOnlyContext,
});
const requestOnlyCapsuleMetadata =
  buildRuntimeContextCapsuleMetadata(requestOnlyCapsule);
assert.equal(requestOnlyCapsule.currentRequest, "Fix the bridge.");
assert.equal(
  requestOnlyCapsule.continuity.goal,
  null,
  "current request must not masquerade as durable continuity",
);
assert.equal(requestOnlyCapsuleMetadata.currentRequestPresent, true);
assert.equal(requestOnlyCapsuleMetadata.continuityGoalPresent, false);

assert.match(prompt, /Current request: Help me plan this launch\./);
assert.match(
  prompt,
  /Continuity goal: Create a coherent launch plan for the founder community\./,
);
assert.match(
  prompt,
  /Current request: Help me plan this launch\.[\s\S]*Continuity goal: Create a coherent launch plan for the founder community\./,
  "current request should stay separate from durable continuity goal",
);
const turnEnvelopeBlock = blockBetween(prompt, "RUNTIME_TURN_ENVELOPE", "THREAD_WORKING_STATE");
assert.match(
  turnEnvelopeBlock,
  /Scope: server-validated thread, community, and project context; resource_lane=member/,
);
assert.doesNotMatch(
  turnEnvelopeBlock,
  /thread_context_coherence|community_founders|project_launch|thread=|community=|project=/,
  "turn envelope prompt should not expose raw internal ids",
);
assert.doesNotMatch(
  turnEnvelopeBlock,
  /Available tools:|community_resources_map|web_research|allowed_tool/i,
  "turn envelope prompt should not duplicate tool inventory",
);
assert.match(prompt, /COMMUNITY_LENS/);
assert.match(prompt, /Use this lens as background context; do not force generic requests into the community topic\./);
assert.match(prompt, /Allowed tools: search_product_docs,get_product_doc,get_active_community_context,community_resources_map,community_resources_read,community_resources_list,community_resource_read,community_resources_search,community_search,web_research,web_crawl,read,grep,bash/);
assert.match(prompt, /Resources are the member-facing source of truth/);
assert.match(prompt, /Resource navigation, search, and read results are evidence for the model to choose from/);
assert.match(prompt, /Do not edit, stage, refactor, or apply changes from the member lane/);
assert.match(prompt, /Community context capabilities expose bounded profile, live resource, and archive-memory evidence/);

const operatingPolicy = blockBetween(prompt, "AGENT_OPERATING_POLICY", "COMMUNITY_LENS");
assert.doesNotMatch(
  operatingPolicy,
  /\bUse (?:get_active_community_context|community_resources_\w+|community_resource_read|community_search|web_research|web_crawl|read|grep|glob|bash)\b/,
  "operating policy should not route through tool-specific use instructions",
);
assert.doesNotMatch(
  prompt,
  /\b(jobKind|intentKind|routeKind|recommended tool|preferred tool|Use community_resources_map first|Use community_search when|Use web_research for)\b/i,
  "rendered prompt should not contain deterministic routing markers",
);

console.log("runtime_context_coherence_behavior_proof: ok");
