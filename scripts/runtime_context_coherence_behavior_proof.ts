import assert from "node:assert/strict";

import { buildPlatformHarnessRuntimeSystemPrompt } from "../shared/runtimePrompt.ts";
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
  communityAbout: "Founder Circle shares launch playbooks, member examples, and practical operating knowledge.",
  communitySystemPrompt: "Be useful to founders without forcing every answer into community-specific framing.",
  agentName: "James",
  agentSoul: "Prefer first-principles launch planning over generic marketing checklists.",
  runtimeTurnContext: buildRuntimeTurnContextPacket({
    latestUserText,
    runtimeTurnEnvelope,
    threadWorkingState,
  }),
  currentDateTimeIso: "2026-06-03T16:00:00.000Z",
  currentDateLabel: "Wednesday, June 3, 2026 at 12:00:00 PM EDT",
  currentTimeZone: "America/New_York",
});

const envelopeIndex = prompt.indexOf("RUNTIME_TURN_ENVELOPE");
const workingStateIndex = prompt.indexOf("THREAD_WORKING_STATE");
assert.ok(envelopeIndex >= 0, "rendered prompt should include the runtime turn envelope");
assert.ok(workingStateIndex >= 0, "rendered prompt should include thread working state");
assert.ok(
  envelopeIndex < workingStateIndex,
  "runtime turn envelope should render before detailed working state",
);

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
