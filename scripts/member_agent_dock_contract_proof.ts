import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildMemberAgentThreadKey,
  buildRuntimeInvocationSurfacePrompt,
  resolveRuntimeInvocationSurfaceForThread,
  restrictCapabilityFamiliesForInvocationSurface,
  restrictToolNamesForInvocationSurface,
} from "../shared/runtimeInvocationSurface.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const packageJson = read("package.json");
const threads = read("convex/threads.ts");
const resolution = read("convex/runtimeTurnResolution.ts");
const runtimeLoop = read("convex/runtimeAgentLoop.ts");
const runner = read("shared/useWebTurnRunnerController.ts");
const gateway = read("shared/cloudMemberAgentGateway.ts");
const component = read("apps/web/src/components/WebMemberAgentDock.tsx");
const app = read("apps/web/src/App.tsx");
const cognitionContract = read("docs/community-agent-cognition-contract-v1.md");

assert.match(
  packageJson,
  /"check:member-agent-dock-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/member_agent_dock_contract_proof\.ts"/,
);

assert.equal(buildMemberAgentThreadKey("community_1"), "member-agent:community_1");
assert.throws(() => buildMemberAgentThreadKey(""), /member_agent_community_required/);
assert.equal(
  resolveRuntimeInvocationSurfaceForThread({
    requestedSurface: "workspace",
    threadKey: "member-agent:community_1",
  }),
  "member_agent_dock",
  "a client must not widen a member-agent channel by claiming the Workspace surface",
);
assert.deepEqual(
  restrictCapabilityFamiliesForInvocationSurface({
    invocationSurface: "member_agent_dock",
    capabilityFamilies: [
      "product_docs",
      "community_tools",
      "web_research",
      "sandbox_tools",
      "workspace_tools",
    ],
  }),
  ["product_docs", "community_tools"],
);
assert.deepEqual(
  restrictToolNamesForInvocationSurface({
    invocationSurface: "member_agent_dock",
    toolNames: [
      "search_product_docs",
      "get_active_community_context",
      "community_resources_map",
      "community_search",
      "community_write",
      "web_research",
      "read",
      "terminal_start",
    ],
  }),
  [
    "search_product_docs",
    "get_active_community_context",
    "community_resources_map",
    "community_search",
  ],
);
assert.match(
  buildRuntimeInvocationSurfacePrompt("member_agent_dock") ?? "",
  /member's own Polynet agent[\s\S]*not the community's agent/,
);

assert.match(
  threads,
  /ensureMemberAgentCommunityThread = mutation[\s\S]*resolveOwnerIdForAuthenticatedRequest[\s\S]*requireCommunityChatAccess/,
  "the private member-agent channel must authenticate and revalidate community access",
);
assert.match(
  threads,
  /buildMemberAgentThreadKey\(communityId\)[\s\S]*member_agent_thread_context_mismatch/,
  "the server must derive the channel key and fail closed on context collisions",
);
assert.match(
  threads,
  /modelId: DEFAULT_ACTIVE_MODEL_ID[\s\S]*runtimeEngine: "polynet"/,
  "the member-agent channel must remain on the default Polynet runtime",
);

assert.match(
  resolution,
  /invocation_surface\?: RuntimeInvocationSurface[\s\S]*resolveRuntimeInvocationSurfaceForThread[\s\S]*member_agent_community_required/,
);
assert.match(
  resolution,
  /threadKey !== buildMemberAgentThreadKey\(threadCommunityId\)[\s\S]*member_agent_thread_context_mismatch/,
);
assert.match(
  resolution,
  /restrictCapabilityFamiliesForInvocationSurface[\s\S]*restrictToolNamesForInvocationSurface/,
  "the server must constrain capabilities and tools instead of trusting the web client",
);
assert.match(
  runtimeLoop,
  /params\.invocationSurface === "member_agent_dock"[\s\S]*\? \[\][\s\S]*mountedUserPlatformAppTools/,
  "member-agent dock turns must not mount personal MCP tools",
);
assert.match(
  runtimeLoop,
  /effectiveAllowedToolNames = restrictToolNamesForInvocationSurface[\s\S]*buildEffectiveAllowedToolNames/,
  "skill activation must not widen the member-agent dock tool boundary",
);
assert.match(
  runner,
  /invocation_surface: params\.invocationSurface \?\? "workspace"/,
);

assert.match(
  gateway,
  /threads:ensureMemberAgentCommunityThread/,
  "the browser must use the dedicated server-derived channel mutation",
);
assert.match(
  component,
  /ensureCloudMemberAgentCommunityThread[\s\S]*useWebTurnRunnerController[\s\S]*runAgentTurn/,
  "the dock must use the retained personal runtime and streaming controller",
);
assert.match(component, /invocationSurface: "member_agent_dock"/);
assert.match(component, /<strong>Your agent<\/strong>/);
assert.doesNotMatch(
  component,
  /sendCloudCommunityAgentDockMessage|communityAgentServeWorker|communityAgentConcierge/,
  "the personal-agent dock must not enter the community-agent Concierge path",
);
assert.match(
  app,
  /<WebMemberAgentDock[\s\S]*activePage === "community"[\s\S]*publicRoute\.kind !== "community_funnel"[\s\S]*hasResolvedCommunityChat/,
);
assert.match(
  cognitionContract,
  /member_agent_dock[\s\S]*belongs to the signed-in member, not the community[\s\S]*member_concierge[\s\S]*direct community-agent mention/,
);

console.log("member_agent_dock_contract_proof: ok");
