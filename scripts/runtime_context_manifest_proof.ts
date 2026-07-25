import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildRuntimeContextManifest,
} from "../shared/runtimeContextManifest.ts";
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
    "community_resources_map",
    "community_resource_builder_stage_changeset",
    "community_memory_search",
    "community_memory_read",
    "community_search",
    "community_write",
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
    "community_resources_map",
    "community_resource_builder_stage_changeset",
    "community_memory_search",
    "community_memory_read",
    "community_search",
    "community_write",
    "member_profile_confirm_facts",
    "web_research",
    "read",
    "write",
    "terminal_start",
    "computer_screenshot",
  ],
  mountedTools: [
    {
      runtime_tool_name: "me__github_create_issue",
      app_name: "GitHub",
      risk_level: "write",
    },
  ],
  communityResourceLane: {
    lane: "builder",
    can_read_live_resources: true,
    can_use_resource_builder: true,
  },
  communitySystemPrompt: "Use the community launch style.",
  communityAbout: "A founder launch community.",
  agentSoul: "Be direct.",
  runtimeTurnEnvelope: envelope,
  runtimeTurnContext: contextPacket,
  selectedPlatformSkills: [
    {
      name: "Resources Architect",
      mention_token: "resources-architect",
    },
  ],
  selectedPersonalSkills: [
    {
      name: "My QA Checklist",
      mention_token: "qa",
      skill_revision_id: "rev_personal_1",
    },
  ],
  selectedCommunitySkills: [
    {
      name: "Launch Voice",
      mention_token: "launch",
      skill_revision_id: "rev_community_1",
    },
  ],
});

assert.equal(fullManifest.version, 1);
assert.equal(fullManifest.scope.communityId, "community_1");
assert.equal(fullManifest.scope.communityContextVersion, 3);
assert.equal(fullManifest.scope.resourceLane, "builder");
assert.equal(fullManifest.request.hasUserRequest, true);
assert.equal(fullManifest.request.conversationMessageCount, 2);

assert.ok(ids(fullManifest.prompts).includes("platform_doctrine"));
assert.ok(ids(fullManifest.prompts).includes("community_lens"));
assert.ok(ids(fullManifest.prompts).includes("community_system_prompt"));
assert.ok(ids(fullManifest.prompts).includes("community_resource_lane:builder"));
assert.ok(ids(fullManifest.prompts).includes("platform_skill:resources-architect"));
assert.ok(ids(fullManifest.prompts).includes("personal_skill:qa"));
assert.ok(ids(fullManifest.prompts).includes("community_skill:launch"));

assert.ok(ids(fullManifest.resources).includes("product_docs"));
assert.ok(ids(fullManifest.resources).includes("active_community_context"));
assert.ok(ids(fullManifest.resources).includes("community_resources"));
assert.ok(ids(fullManifest.resources).includes("community_compiled_memory"));
assert.ok(ids(fullManifest.resources).includes("community_activity_archive"));
assert.ok(ids(fullManifest.resources).includes("workspace_files"));
assert.ok(ids(fullManifest.resources).includes("web_external_evidence"));
assert.ok(ids(fullManifest.resources).includes("background_terminal_output"));
assert.ok(!ids(fullManifest.resources).includes("message_attachments"));

assert.equal(toolByName(fullManifest, "community_write")?.effect, "write");
assert.equal(toolByName(fullManifest, "community_memory_search")?.family, "community_memory");
assert.equal(toolByName(fullManifest, "community_memory_read")?.effect, "read");
assert.equal(toolByName(fullManifest, "member_profile_confirm_facts")?.family, "member_profile");
assert.equal(toolByName(fullManifest, "member_profile_confirm_facts")?.effect, "write");
assert.equal(toolByName(fullManifest, "read")?.family, "sandbox_read");
assert.equal(toolByName(fullManifest, "write")?.family, "sandbox_write");
assert.equal(toolByName(fullManifest, "terminal_start")?.effect, "process");
assert.equal(toolByName(fullManifest, "computer_screenshot")?.effect, "ui");
assert.equal(toolByName(fullManifest, "me__github_create_issue")?.source, "mounted_app_tool");
assert.equal(toolByName(fullManifest, "me__github_create_issue")?.effect, "write");

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
  selectedPersonalSkills: [
    {
      name: "My QA Checklist",
      mention_token: "qa",
    },
  ],
});
assert.ok(ids(selectedSkillOnlyManifest.prompts).includes("personal_skill:qa"));
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
