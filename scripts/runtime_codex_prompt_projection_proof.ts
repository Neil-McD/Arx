import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildRuntimeCodexPromptProjection } from "../shared/runtimeCodexPromptProjection.ts";
import { buildRuntimeTurnContextPacket } from "../shared/runtimeTurnContextPacket.ts";
import { buildRuntimeTurnEnvelope } from "../shared/runtimeTurnEnvelope.ts";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const packageJson = read("package.json");
const codexVisiblePolynetToolNames = [
  "search_product_docs",
  "get_product_doc",
  "get_active_community_context",
  "community_search",
  "community_resources_map",
  "community_resources_read",
  "community_resources_list",
  "community_resource_read",
  "community_resources_search",
  "community_resource_builder_list",
  "community_resource_builder_read",
  "community_resource_builder_stage_changeset",
] as const;

assert.match(
  packageJson,
  /"check:runtime-codex-prompt-projection-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/runtime_codex_prompt_projection_proof\.ts"/,
  "package.json must expose the Codex prompt projection proof",
);

const runtimeTurnEnvelope = buildRuntimeTurnEnvelope({
  latestUserText: "What is your name?",
  threadWorkingState: {
    goal: "Prove Codex receives the same PolyNet identity context.",
    currentStep: "Render the Codex projection.",
    completedSteps: ["Loaded canonical prompt bundle."],
    nextAction: "Assert rendered section ids.",
  },
  threadId: "thread_codex_projection",
  communityId: "community_codex_projection",
  projectId: "project_codex_projection",
  allowedToolNames: codexVisiblePolynetToolNames,
});

const projection = buildRuntimeCodexPromptProjection({
  loopBudget: {
    maxToolSteps: 8,
    maxRepeatedIdenticalCalls: 2,
    maxConsecutiveFailures: 3,
    maxNoProgressSteps: 3,
  },
  allowedToolNames: codexVisiblePolynetToolNames,
  harnessName: "chat_tools",
  communityId: "community_codex_projection",
  communityName: "Codex Projection Community",
  communitySlug: "codex-projection",
  communityOneLiner: "A proof community.",
  communityAbout: "Used to prove Codex receives canonical PolyNet context.",
  communitySystemPrompt: "Use the community voice when relevant.",
  communityLensAuthority: {
    relation: "admin",
    effectiveRole: "admin",
    canManage: true,
    canModerate: true,
    canManageResources: true,
    canReviewJoinRequests: true,
    communityResourceLane: {
      lane: "builder",
      can_read_live_resources: true,
      can_use_resource_builder: true,
    },
  },
  communityResourceLane: {
    lane: "builder",
    can_read_live_resources: true,
    can_use_resource_builder: true,
  },
  agentName: "timmy",
  agentSoul:
    "Use a funny personality. Be light, witty, and playful when it helps, but never derail the work.",
  projectLabel: "Projection Project",
  projectDescription: "A project proving context packet projection.",
  accountPlan: "free",
  runtimeTurnContext: buildRuntimeTurnContextPacket({
    latestUserText: "What is your name?",
    runtimeTurnEnvelope,
    projectContext: {
      label: "Projection Project",
      description: "A project proving context packet projection.",
      instructions: "Prefer concise but warm answers.",
      links: [{ title: "Spec", url: "https://example.com/spec" }],
    },
    threadWorkingState: {
      goal: "Prove Codex receives the same PolyNet identity context.",
      currentStep: "Render the Codex projection.",
      completedSteps: ["Loaded canonical prompt bundle."],
      nextAction: "Assert rendered section ids.",
    },
  }),
  currentDateTimeIso: "2026-06-19T15:00:00.000Z",
  currentDateLabel: "Friday, June 19, 2026 at 3:00:00 PM UTC",
  currentTimeZone: "UTC",
  conversationMessages: [
    { role: "user", content: "hi" },
    { role: "assistant", content: "Hey hey - timmy here." },
    { role: "user", content: "What is your name?" },
  ],
  latestUserText: "What is your name?",
});

assert.match(
  projection.developerInstructions,
  /POLYNET_CODEX_RUNTIME_AUTHORITY[\s\S]*PolyNet prompt bundle below is authoritative/,
  "projection must mark the PolyNet prompt bundle as the Codex authority layer",
);
assert.match(
  projection.developerInstructions,
  /AGENT_SOUL[\s\S]*Configured agent name: timmy[\s\S]*USER_AGENT_SOUL[\s\S]*Use a funny personality/,
  "projection must render canonical agent name and user soul in developer instructions",
);
assert.match(
  projection.developerInstructions,
  /COMMUNITY_LENS[\s\S]*Codex Projection Community[\s\S]*COMMUNITY_SYSTEM_PROMPT[\s\S]*Use the community voice/,
  "projection must render canonical community lens and community instructions",
);
assert.match(
  projection.developerInstructions,
  /COMMUNITY_LENS_AUTHORITY[\s\S]*Community relation: admin[\s\S]*Authority path: builder/,
  "projection must render canonical community authority in developer instructions",
);
assert.match(
  projection.developerInstructions,
  /PLATFORM_HARNESS_CONTEXT[\s\S]*Projection Project[\s\S]*RUNTIME_TURN_ENVELOPE/,
  "projection must render project and runtime turn context",
);
assert.match(
  projection.developerInstructions,
  /Account plan: Free[\s\S]*Runtime available: PolyNet[\s\S]*Codex and other agent runtimes require Polynet Premium/,
  "Codex projection must render the free-plan runtime entitlement boundary",
);
assert.match(
  projection.developerInstructions,
  /Allowed tools: search_product_docs,get_product_doc,get_active_community_context,community_search,community_resources_map,community_resources_read,community_resources_list,community_resource_read,community_resources_search,community_resource_builder_list,community_resource_builder_read,community_resource_builder_stage_changeset/,
  "Codex projection must render only the exact PolyNet platform tools projected to Codex",
);
assert.match(
  projection.developerInstructions,
  /Available tools: search_product_docs, get_product_doc, get_active_community_context, community_search, community_resources_map, community_resources_read, community_resources_list, community_resource_read, community_resources_search, community_resource_builder_list, community_resource_builder_read, community_resource_builder_stage_changeset/,
  "Codex runtime envelope must use the exact Codex-visible PolyNet tool surface",
);
assert.doesNotMatch(
  projection.developerInstructions,
  /community_resource_builder_apply_changeset|community_write|web_research|web_crawl|terminal_start|terminal_read|computer_open_url|list_dir|read, write|write, edit|bash/,
  "Codex projection must not advertise native-only, duplicate, or blocked PolyNet tools",
);
assert.doesNotMatch(
  projection.prompt,
  /USER_AGENT_SOUL|Configured agent name|Community instructions/,
  "projection must not demote identity or community instructions into user prompt text",
);
assert.match(
  projection.prompt,
  /Recent conversation:[\s\S]*User: hi[\s\S]*Assistant: Hey hey - timmy here[\s\S]*Latest user request:\nWhat is your name\?/,
  "projection prompt must contain the transcript and latest user request",
);
assert.deepEqual(projection.receipt.runtimePromptSectionIds, [
  "platform_doctrine",
  "agent_soul",
  "user_agent_soul",
  "explanation_contract",
  "harness_operating_policy",
  "community_lens",
  "community_lens_authority",
  "community_system_prompt",
  "community_feed_context",
  "community_resource_lane",
  "workspace_harness_context",
  "runtime_turn_context",
  "temporal_context",
]);
assert.equal(projection.receipt.agentNameRendered, true);
assert.equal(projection.receipt.agentSoulRendered, true);
assert.ok(
  projection.receipt.renderedRuntimePromptSectionIds.includes("user_agent_soul"),
  "receipt must prove user soul rendered",
);
assert.ok(
  projection.receipt.renderedRuntimePromptSectionIds.includes("community_lens_authority"),
  "receipt must prove community authority rendered",
);
assert.ok(
  projection.receipt.runtimePromptChars > 0 &&
    projection.receipt.developerInstructionChars >= projection.receipt.runtimePromptChars &&
    projection.receipt.promptChars > 0,
  "receipt must include prompt size accounting",
);

console.log("runtime_codex_prompt_projection_proof: ok");
