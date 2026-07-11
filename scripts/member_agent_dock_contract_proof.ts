import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildMemberAgentThreadKey,
  buildRuntimeInvocationSurfacePrompt,
  resolveRuntimeInvocationSurfaceForThread,
  restrictCapabilityFamiliesForInvocationSurface,
  restrictToolNamesForInvocationSurface,
} from "../shared/runtimeInvocationSurface.ts";
import { buildMemberAgentConversationContext } from "../shared/memberAgentConversationContext.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const packageJson = read("package.json");
const threads = read("convex/threads.ts");
const resolution = read("convex/runtimeTurnResolution.ts");
const runtimeLoop = read("convex/runtimeAgentLoop.ts");
const runner = read("shared/useWebTurnRunnerController.ts");
const gateway = read("shared/cloudMemberAgentGateway.ts");
const threadReadGateway = read("shared/cloudThreadsRead.ts");
const component = read("apps/web/src/components/WebMemberAgentDock.tsx");
const styles = read("apps/web/src/components/WebMemberAgentDock.css");
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
  /listNewestCloudThreadMessages = query[\s\S]*by_thread_seq[\s\S]*order\("desc"\)[\s\S]*take\(safeLimit\)/,
  "the dock transcript must read from the newest end of the message index",
);
assert.match(
  threads,
  /listMemberAgentRuntimeMessagesInternal = internalQuery[\s\S]*expectedUserMessageKey[\s\S]*lte\("seq", expected\.seq\)[\s\S]*order\("desc"\)/,
  "runtime history must stop at the persisted user message that started the turn",
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
  /invocationSurface === "member_agent_dock"[\s\S]*listMemberAgentRuntimeMessagesInternal[\s\S]*buildMemberAgentConversationContext[\s\S]*else \{[\s\S]*asRuntimeMessages\(input\)/,
  "member-agent history must come from stored rows while other runtime surfaces retain their existing input contract",
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
assert.doesNotMatch(
  runner,
  /messageId,[\s\S]{0,160}seq: 0,[\s\S]{0,160}role: params\.role/,
  "new browser messages must let Convex assign their canonical sequence",
);
assert.match(
  threads,
  /typeof args\.seq === "number" && Number\.isFinite\(args\.seq\) && args\.seq > 0[\s\S]*const seq = explicitSeq \?\?/,
  "the cloud write boundary must reject sequence zero as a client-assigned canonical position",
);

assert.match(
  gateway,
  /threads:ensureMemberAgentCommunityThread/,
  "the browser must use the dedicated server-derived channel mutation",
);
assert.match(
  threadReadGateway,
  /listConvexCloudNewestThreadMessagesByThreadKey[\s\S]*threads:listNewestCloudThreadMessages/,
);
assert.match(
  component,
  /ensureCloudMemberAgentCommunityThread[\s\S]*useWebTurnRunnerController[\s\S]*runAgentTurn/,
  "the dock must use the retained personal runtime and streaming controller",
);
assert.match(component, /invocationSurface: "member_agent_dock"/);
assert.match(component, /communityScopeRef[\s\S]*isCurrentScope/);
assert.doesNotMatch(
  component,
  /useEffect\(\(\) => \{\s*activeThreadKeyRef\.current = threadKey;/,
  "a passive effect must not overwrite a synchronously selected thread during transcript loading",
);
assert.match(
  component,
  /listConvexCloudNewestThreadMessagesByThreadKey[\s\S]*activeThreadKeyRef\.current !== targetThreadKey/,
  "late transcript reads must not commit outside their active community and thread",
);
assert.match(
  component,
  /messages: \[optimisticMessage\]/,
  "the browser must send only the current user message, not authoritative history",
);
assert.match(component, /<strong>Your agent<\/strong>/);
assert.match(
  styles,
  /--member-agent-accent: #a78bfa;[\s\S]*--member-agent-accent-soft: rgba\(167, 139, 250, 0\.16\);/,
  "the dock must reuse the platform's established purple agent identity",
);
assert.match(
  styles,
  /\.member-agent-dock-launcher \{[\s\S]*width: 64px;[\s\S]*height: 64px;[\s\S]*overflow: visible;[\s\S]*color: var\(--member-agent-accent\);[\s\S]*background: transparent;[\s\S]*border: 0;[\s\S]*box-shadow: none;/,
  "the agent launcher must keep a stable hit target without painting a visible container",
);
assert.match(
  styles,
  /\.member-agent-dock-launcher svg \{[\s\S]*width: 44px;[\s\S]*height: 44px;[\s\S]*drop-shadow\(0 0 7px rgba\(167, 139, 250, 0\.42\)\);[\s\S]*animation: member-agent-dock-breathe 5\.6s ease-in-out infinite;/,
  "the floating purple agent mark must remain visually prominent without an orb or button surface",
);
assert.match(
  component,
  /member-agent-dock-launcher\$\{turnIsActive \? " is-working" : ""\}/,
  "the launcher must derive its working presence from the existing turn lifecycle",
);
assert.match(
  styles,
  /\.member-agent-dock-launcher\.is-working svg \{[\s\S]*animation: member-agent-dock-working-pulse 1\.35s ease-in-out infinite;/,
  "an active agent turn must use the faster working pulse",
);
assert.match(
  styles,
  /\.member-agent-dock-launcher:hover svg,[\s\S]*\.member-agent-dock-launcher:focus-visible svg \{[\s\S]*drop-shadow\(0 0 11px rgba\(167, 139, 250, 0\.62\)\);[\s\S]*animation: none;/,
  "hover and keyboard focus must hold a stable bright state instead of freezing an arbitrary animation frame",
);
const launcherMotion = ["member-agent-dock-breathe", "member-agent-dock-working-pulse"]
  .map((name) => styles.match(new RegExp(`@keyframes ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? "")
  .join("\n");
assert.doesNotMatch(
  launcherMotion,
  /transform|translate|rotate/,
  "launcher presence must never bounce, lift, or spin",
);
assert.match(
  styles,
  /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.member-agent-dock-launcher svg,[\s\S]*animation: none;/,
  "launcher presence animation must respect reduced-motion preferences",
);
const launcherHover = styles.match(/\.member-agent-dock-launcher:hover \{[\s\S]*?\n\}/)?.[0] ?? "";
assert.doesNotMatch(
  launcherHover,
  /transform|stroke-active|border|box-shadow/,
  "hover must not lift the launcher or reintroduce a visible container",
);
assert.match(
  styles,
  /\.member-agent-dock-message\.is-user \{[\s\S]*max-width: 84%;[\s\S]*margin-left: auto;[\s\S]*background: var\(--surface-card-alt\);/,
  "stored user roles must render as right-aligned conversation bubbles",
);
assert.doesNotMatch(
  styles,
  /\.member-agent-dock-message\.is-human/,
  "the dock must not style the obsolete human role name",
);
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
  /member_agent_dock[\s\S]*belongs to the signed-in member, not the community[\s\S]*server constructs bounded conversation history[\s\S]*member_concierge[\s\S]*direct community-agent mention/,
);

const canonicalContext = buildMemberAgentConversationContext({
  expectedUserMessageKey: "user-3",
  maxMessages: 3,
  rows: [
    { messageKey: "assistant-4", seq: 4, role: "assistant", contentJson: { text: "future" } },
    { messageKey: "user-3", seq: 3, role: "user", contentJson: { text: "current" } },
    { messageKey: "assistant-2", seq: 2, role: "assistant", contentJson: { text: "prior answer" } },
    { messageKey: "user-1", seq: 1, role: "user", contentJson: { text: "prior question" } },
  ],
});
assert.deepEqual(canonicalContext, {
  ok: true,
  expectedUserSeq: 3,
  characterCount: 33,
  messages: [
    { role: "user", content: "prior question" },
    { role: "assistant", content: "prior answer" },
    { role: "user", content: "current" },
  ],
});

const boundedContext = buildMemberAgentConversationContext({
  expectedUserMessageKey: "user-2",
  maxCharacters: 8,
  rows: [
    { messageKey: "user-2", seq: 2, role: "user", contentJson: { text: "123456789" } },
    { messageKey: "assistant-1", seq: 1, role: "assistant", contentJson: { text: "older" } },
  ],
});
assert.deepEqual(boundedContext, {
  ok: true,
  expectedUserSeq: 2,
  characterCount: 8,
  messages: [{ role: "user", content: "12345678" }],
});
assert.deepEqual(
  buildMemberAgentConversationContext({
    expectedUserMessageKey: "missing",
    rows: [],
  }),
  { ok: false, code: "expected_user_message_missing" },
);
assert.deepEqual(
  buildMemberAgentConversationContext({
    expectedUserMessageKey: "assistant-1",
    rows: [
      { messageKey: "assistant-1", seq: 1, role: "assistant", contentJson: { text: "no" } },
    ],
  }),
  { ok: false, code: "expected_message_not_user" },
);

console.log("member_agent_dock_contract_proof: ok");
