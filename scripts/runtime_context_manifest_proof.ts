import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildRuntimeContextManifest,
} from "../shared/runtimeContextManifest.ts";
import { buildPlatformHarnessRuntimePromptBundle } from "../shared/runtimePrompt.ts";
import { buildRuntimeTurnContextPacket } from "../shared/runtimeTurnContextPacket.ts";
import { buildRuntimeTurnEnvelope } from "../shared/runtimeTurnEnvelope.ts";

function ids(values: Array<{ id: string }>): string[] {
  return values.map((value) => value.id).sort();
}

function toolByName(
  manifest: ReturnType<typeof buildRuntimeContextManifest>,
  name: string,
) {
  return manifest.tools.find((tool) => tool.name === name) ?? null;
}

const envelope = buildRuntimeTurnEnvelope({
  latestUserText: "Build the launch wiki and inspect the workspace.",
  threadId: "thread_1",
  communityId: "community_1",
  projectId: "project_1",
  communityResourceLane: {
    lane: "builder",
    can_read_live_resources: true,
    can_use_resource_builder: true,
  },
  allowedToolNames: [
    "search_product_docs",
    "get_product_doc",
    "polynet_list",
    "polynet_read",
    "polynet_search",
    "polynet_write",
    "polynet_call",
    "member_profile_confirm_facts",
    "web_research",
    "read",
    "write",
    "terminal_start",
    "computer_screenshot",
  ],
});

const contextPacket = buildRuntimeTurnContextPacket({
  latestUserText: "Build the launch wiki and inspect the workspace.",
  runtimeTurnEnvelope: envelope,
  threadWorkingState: {
    version: 1,
    goal: "Improve context routing.",
    currentStep: "Build the manifest proof.",
    verifiedFindings: ["Runtime event table can hold arbitrary payloads."],
  },
  activeBackgroundTerminals: [
    {
      id: "terminal_1",
      status: "running",
      command: "npm run dev",
    },
  ],
  recentToolAttempts: [
    {
      toolName: "read",
      status: "ok",
      outputPreview: "Read runtime context map.",
      createdAt: 1,
    },
  ],
});

const fullPromptBundle = buildPlatformHarnessRuntimePromptBundle({
  loopBudget: { maxToolSteps: 8, maxRepeatedIdenticalCalls: 2, maxConsecutiveFailures: 3, maxNoProgressSteps: 3 },
  allowedToolNames: envelope.authority.allowedToolNames,
  harnessName: "chat_tools",
  invocationSurface: "member_agent_dock",
  communityId: "community_1",
  communityName: "Launch Community",
  communitySlug: "launch-community",
  communityAbout: "A founder launch community.",
  communitySystemPrompt: "Use the community launch style.",
  communityResourceLane: envelope.authority.communityResourceLane,
  agentSoul: "Be direct.",
  projectLabel: "Launch workspace",
  runtimeTurnContext: contextPacket,
  currentDateTimeIso: "2026-06-17T12:00:00.000Z",
  promptExtensions: [
    { id: "platform_skill_overlay", layer: "scoped", slot: "instruction", owner: "platform", authority: "platform_policy", source: "fixture", reason: "selected platform skill instructions", text: "\nPLATFORM_SKILL_FIXTURE" },
    { id: "personal_skill_overlay", layer: "scoped", slot: "instruction", owner: "user", authority: "user_preference", source: "fixture", reason: "selected personal skill instructions", text: "\nPERSONAL_SKILL_FIXTURE" },
    { id: "community_skill_overlay", layer: "scoped", slot: "instruction", owner: "community", authority: "community_policy", source: "fixture", reason: "selected community skill instructions", text: "\nCOMMUNITY_SKILL_FIXTURE" },
  ],
});

const fullManifest = buildRuntimeContextManifest({
  generatedAt: "2026-06-17T12:00:00.000Z",
  userId: "user_1",
  threadId: "thread_1",
  communityId: "community_1",
  communityContextVersion: 3,
  projectId: "project_1",
  harnessName: "chat_tools",
  inferenceSource: "platform",
  latestUserText: "Build the launch wiki and inspect the workspace.",
  messages: [
    { role: "system", content: "client supplied system message" },
    { role: "user", content: "Build the launch wiki and inspect the workspace." },
  ],
  allowedToolNames: [
    "search_product_docs",
    "get_product_doc",
    "polynet_list",
    "polynet_read",
    "polynet_search",
    "polynet_write",
    "polynet_call",
    "member_profile_confirm_facts",
    "web_research",
    "read",
    "write",
    "terminal_start",
    "computer_screenshot",
  ],
  communityResourceLane: {
    lane: "builder",
    can_read_live_resources: true,
    can_use_resource_builder: true,
  },
  communityAbout: "A founder launch community.",
  promptSections: fullPromptBundle.sections,
  runtimeTurnEnvelope: envelope,
  runtimeTurnContext: contextPacket,
});

assert.equal(fullManifest.version, 2);
assert.equal(fullManifest.scope.communityId, "community_1");
assert.equal(fullManifest.scope.communityContextVersion, 3);
assert.equal(fullManifest.scope.resourceLane, "builder");
assert.equal(fullManifest.request.hasUserRequest, true);
assert.equal(fullManifest.request.conversationMessageCount, 2);

assert.ok(ids(fullManifest.prompts).includes("platform_doctrine"));
assert.ok(ids(fullManifest.prompts).includes("community_lens"));
assert.ok(ids(fullManifest.prompts).includes("community_system_prompt"));
assert.ok(ids(fullManifest.prompts).includes("community_resource_lane"));
assert.ok(ids(fullManifest.prompts).includes("platform_skill_overlay"));
assert.ok(ids(fullManifest.prompts).includes("personal_skill_overlay"));
assert.ok(ids(fullManifest.prompts).includes("community_skill_overlay"));
assert.deepEqual(
  ids(fullManifest.prompts),
  ids(fullPromptBundle.sections.filter((section) => section.rendered)),
);

assert.ok(ids(fullManifest.resources).includes("product_docs"));
assert.ok(ids(fullManifest.resources).includes("active_community_context"));
assert.ok(ids(fullManifest.resources).includes("workspace_files"));
assert.ok(ids(fullManifest.resources).includes("web_external_evidence"));
assert.ok(ids(fullManifest.resources).includes("background_terminal_output"));
assert.ok(!ids(fullManifest.resources).includes("message_attachments"));

assert.equal(toolByName(fullManifest, "polynet_write")?.effect, "write");
assert.equal(toolByName(fullManifest, "polynet_search")?.family, "community_context");
assert.equal(toolByName(fullManifest, "polynet_search")?.effect, "read");
assert.equal(toolByName(fullManifest, "member_profile_confirm_facts")?.family, "member_profile");
assert.equal(toolByName(fullManifest, "member_profile_confirm_facts")?.effect, "write");
assert.equal(toolByName(fullManifest, "read")?.family, "sandbox_read");
assert.equal(toolByName(fullManifest, "write")?.family, "sandbox_write");
assert.equal(toolByName(fullManifest, "terminal_start")?.effect, "process");
assert.equal(toolByName(fullManifest, "computer_screenshot")?.effect, "ui");

assert.ok(ids(fullManifest.runtimeState).includes("runtime_turn_envelope"));
assert.ok(ids(fullManifest.runtimeState).includes("thread_working_state"));
assert.ok(ids(fullManifest.runtimeState).includes("active_background_terminals"));
assert.ok(ids(fullManifest.runtimeState).includes("recent_tool_attempts"));
assert.ok(ids(fullManifest.runtimeState).includes("temporal_context"));

assert.ok(
  fullManifest.exclusions.some((entry) => entry.source === "client_system_messages_authenticated"),
  "client system messages should be explicitly excluded from authenticated authority",
);
assert.ok(
  fullManifest.exclusions.some((entry) => entry.source === "provider_credentials"),
  "provider credentials should be explicitly excluded",
);
assert.ok(
  fullManifest.exclusions.some((entry) => entry.source === "message_attachments"),
  "attachments should not appear as active evidence without explicit parsing or reading",
);

const noCommunityManifest = buildRuntimeContextManifest({
  generatedAt: "2026-06-17T12:00:00.000Z",
  userId: "user_1",
  threadId: "thread_2",
  projectId: null,
  latestUserText: "What is Polynet?",
  allowedToolNames: ["search_product_docs", "get_product_doc", "web_research"],
  promptSections: [],
});

assert.ok(!ids(noCommunityManifest.prompts).includes("community_lens"));
assert.ok(!ids(noCommunityManifest.resources).includes("community_resources"));
assert.ok(
  noCommunityManifest.exclusions.some((entry) => entry.source === "community_lens"),
  "missing community scope should be visible as an exclusion",
);

const selectedSkillOnlyManifest = buildRuntimeContextManifest({
  userId: "user_1",
  threadId: "thread_3",
  latestUserText: "Use $qa.",
  allowedToolNames: [],
  promptSections: [
    {
      id: "personal_skill_overlay", layer: "scoped", slot: "instruction",
      owner: "user", authority: "user_preference", rendered: true,
      chars: 21, source: "fixture", reason: "selected personal skill instructions",
    },
  ],
});
assert.ok(ids(selectedSkillOnlyManifest.prompts).includes("personal_skill_overlay"));
assert.equal(
  selectedSkillOnlyManifest.tools.length,
  0,
  "selected skills should not grant tools by themselves",
);

const runtimeAgentLoopSource = readFileSync("convex/runtimeAgentLoop.ts", "utf8");
assert.match(
  runtimeAgentLoopSource,
  /buildRuntimeContextManifest\(\{/,
  "runtime loop should build the context manifest from resolved context",
);
assert.match(
  runtimeAgentLoopSource,
  /eventType:\s*"runtime_context_manifest_resolved"/,
  "runtime loop should emit the manifest as a run event",
);
assert.match(
  runtimeAgentLoopSource,
  /eventKey:\s*`\$\{params\.runId\}:runtime_context_manifest_resolved:1`/,
  "manifest event should be idempotent per run",
);

console.log("runtime_context_manifest_proof: ok");
