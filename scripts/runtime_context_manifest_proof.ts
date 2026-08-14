import assert from "node:assert/strict";
import { buildRuntimeContextManifest } from "../shared/runtimeContextManifest.ts";
import { buildPlatformHarnessRuntimePromptBundle } from "../shared/runtimePrompt.ts";
import { buildRuntimeTurnContextPacket } from "../shared/runtimeTurnContextPacket.ts";

const allowedToolNames = [
  "search_product_docs",
  "get_product_doc",
  "polynet_list",
  "polynet_read",
  "polynet_search",
  "polynet_write",
  "polynet_call",
  "member_conversations_list",
  "member_conversation_read",
  "member_profile_confirm_facts",
  "web_research",
] as const;
const packet = buildRuntimeTurnContextPacket({
  latestUserText: "Inspect the active community.",
  threadWorkingState: {
    goal: "Summarize current community activity.",
    currentStep: "Read authorized sources.",
    filesChanged: [],
    verifiedFindings: [],
  },
  recentToolAttempts: [
    { toolName: "polynet_search", status: "ok", outputPreview: "2 matches" },
  ],
});
const promptBundle = buildPlatformHarnessRuntimePromptBundle({
  loopBudget: {
    maxToolSteps: 8,
    maxRepeatedIdenticalCalls: 2,
    maxConsecutiveFailures: 3,
    maxNoProgressSteps: 3,
  },
  allowedToolNames,
  harnessName: "chat_tools",
  invocationSurface: "member_agent_dock",
  communityId: "community_1",
  communityName: "Manifest Community",
  communityAbout: "A manifest fixture.",
  communityResourceLane: {
    lane: "member",
    can_read_live_resources: true,
    can_use_resource_builder: false,
  },
  runtimeTurnContext: packet,
  currentDateTimeIso: "2026-06-17T12:00:00.000Z",
});
const manifest = buildRuntimeContextManifest({
  generatedAt: "2026-06-17T12:00:00.000Z",
  userId: "user_1",
  threadId: "thread_1",
  communityId: "community_1",
  communityContextVersion: 3,
  harnessName: "chat_tools",
  inferenceSource: "platform",
  latestUserText: "Inspect the active community.",
  messages: [{ role: "user", content: "Inspect the active community." }],
  allowedToolNames,
  communityResourceLane: {
    lane: "member",
    can_read_live_resources: true,
    can_use_resource_builder: false,
  },
  communityAbout: "A manifest fixture.",
  promptSections: promptBundle.sections,
  runtimeTurnContext: packet,
});

assert.equal(manifest.version, 2);
assert.equal(manifest.scope.communityId, "community_1");
assert.equal(manifest.summary.fixedToolCount, allowedToolNames.length);
assert.deepEqual(
  manifest.tools.map((tool) => tool.name),
  [...allowedToolNames],
);
assert.equal(
  manifest.tools.find((tool) => tool.name === "polynet_read")?.family,
  "community_context",
);
assert.equal(
  manifest.tools.find((tool) => tool.name === "polynet_write")?.effect,
  "write",
);
assert.ok(manifest.resources.some((resource) => resource.id === "product_docs"));
assert.ok(
  manifest.resources.some((resource) => resource.id === "active_community_context"),
);
assert.ok(manifest.runtimeState.some((state) => state.id === "thread_working_state"));
assert.ok(manifest.runtimeState.some((state) => state.id === "recent_tool_attempts"));
assert.doesNotMatch(
  JSON.stringify(manifest),
  /workspace_files|background_terminal|active_background_terminal|sandbox_read|sandbox_write/,
);

console.log("runtime_context_manifest_proof: ok");
