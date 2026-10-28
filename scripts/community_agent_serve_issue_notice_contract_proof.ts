import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const schema = readFileSync(join(root, "convex/schema.ts"), "utf8");
const concierge = readFileSync(join(root, "convex/communityAgentConcierge.ts"), "utf8");
const gateway = readFileSync(join(root, "shared/cloudCommunityAgentConciergeGateway.ts"), "utf8");
const app = readFileSync(join(root, "apps/web/src/App.tsx"), "utf8");
const interactionProjection = readFileSync(
  join(root, "apps/web/src/controllers/useWebCommunityInteractionProjection.ts"),
  "utf8",
);
const projection = readFileSync(join(root, "apps/web/src/controllers/buildWebCommunitySurfaceProjection.ts"), "utf8");
const chatPanel = readFileSync(join(root, "apps/web/src/components/WebCommunityChatPanel.tsx"), "utf8");
const css = [
  "apps/web/src/base.css",
  "apps/web/src/styles/shell-and-onboarding.css",
  "apps/web/src/styles/community-and-content.css",
  "apps/web/src/styles/settings-runtime-and-theme-overrides.css",
].map((path) => readFileSync(join(root, path), "utf8")).join("\n");
const packageJson = readFileSync(join(root, "package.json"), "utf8");

function exportedFunctionBlock(source: string, exportName: string): string {
  const startToken = `export const ${exportName} =`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${exportName} should exist`);
  const nextConst = source.indexOf("\nexport const ", start + startToken.length);
  return source.slice(start, nextConst === -1 ? source.length : nextConst);
}

function localConstBlock(source: string, constName: string): string {
  const startToken = `const ${constName} =`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${constName} should exist`);
  const nextConst = source.indexOf("\n  const ", start + startToken.length);
  return source.slice(start, nextConst === -1 ? source.length : nextConst);
}

assert.match(
  packageJson,
  /"check:community-agent-serve-issue-notice-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_agent_serve_issue_notice_contract_proof\.ts"/,
  "package scripts should expose the community-agent serve issue notice proof",
);

assert.match(
  schema,
  /communityAgentServeRequests: defineTable\([\s\S]*\.index\("by_requester_community_createdAt", \["requesterUserId", "communityId", "createdAt"\]\)/,
  "serve request table should support bounded same-community requester issue lookup",
);

const issueQuery = exportedFunctionBlock(concierge, "getMyLatestCommunityAgentServeIssue");
assert.match(
  issueQuery,
  /export const getMyLatestCommunityAgentServeIssue = query/,
  "serve issue lookup should be a public query, not a mutation",
);
assert.doesNotMatch(
  issueQuery,
  /nowMs: v\.optional\(v\.number\(\)\)|args\.nowMs/,
  "serve issue lookup must not accept caller-controlled freshness time",
);
assert.match(
  issueQuery,
  /const nowMs = Date\.now\(\)/,
  "serve issue lookup should use server time for freshness",
);
assert.match(
  issueQuery,
  /resolveUserIdForAuthenticatedRequest\(\{[\s\S]*authSubject: args\.authSubject \?\? null/,
  "serve issue lookup should resolve the authenticated requester",
);
assert.match(
  issueQuery,
  /requireCommunityChatAccess\(\{[\s\S]*communityId: args\.communityId[\s\S]*userId/,
  "serve issue lookup should fail closed on current community chat access",
);
assert.doesNotMatch(
  concierge,
  /userProviderConnections|userHasChatgptConnection|encryptedSecretHex/,
  "community-agent availability must not depend on a member-owned provider connection",
);
assert.match(
  issueQuery,
  /withIndex\("by_requester_community_createdAt"[\s\S]*q\.eq\("requesterUserId", userId\)\.eq\("communityId", args\.communityId\)/,
  "serve issue lookup should query by requester and community before filtering",
);
assert.match(
  issueQuery,
  /row\.agentKey !== CANONICAL_COMMUNITY_AGENT_KEY[\s\S]*row\.status !== "skipped" && row\.status !== "error"[\s\S]*founder_plan_required[\s\S]*founder_subscription_inactive/,
  "serve issue lookup should inspect only canonical hosted-funding issues",
);
assert.doesNotMatch(
  concierge,
  /requester_connection_missing|owner_credential_missing|owner_funding_suspended/,
  "serve issue lookup should not retain obsolete BYOK-era issue states",
);
assert.match(
  concierge,
  /CONCIERGE_SERVE_ISSUE_WINDOW_MS = 30 \* 60 \* 1000/,
  "serve issue freshness window should be short-lived",
);
assert.match(
  issueQuery,
  /nowMs - createdAt <= CONCIERGE_SERVE_ISSUE_WINDOW_MS/,
  "serve issue lookup should only surface fresh issues",
);
assert.match(
  issueQuery,
  /reason: "community_owner_action_required"[\s\S]*cta: null[\s\S]*community owner needs to update inference settings/,
  "serve issue lookup should return the community-owner hosted-funding issue",
);
assert.match(
  issueQuery,
  /issueCode === PLATFORM_HOME_MEMBER_AGENT_LIMIT_REACHED\)[\s\S]*reason: "member_agent_limit_reached"[\s\S]*cta: "start_builder"[\s\S]*formatPlatformHomeMemberLimitMessage\(nowMs\)/,
  "serve issue lookup should return the requester's own monthly allowance issue with the Builder action",
);
assert.doesNotMatch(
  issueQuery,
  /ctx\.db\.(insert|patch|replace|delete)|communityInteractionReplies|communityIntelligence|communitySourceTraces|runChatgptCompletion/,
  "serve issue lookup must not write chat, memory, source traces, or call inference",
);

assert.match(
  gateway,
  /export type CloudCommunityAgentServeIssue[\s\S]*reason: "community_owner_action_required" \| "member_agent_limit_reached"[\s\S]*cta: "start_builder" \| null/,
  "gateway should expose only the hosted-funding and member-allowance issues",
);
assert.match(
  gateway,
  /reason === "community_owner_action_required" && cta === null[\s\S]*reason === "member_agent_limit_reached" && cta === "start_builder"/,
  "gateway should accept only known reason and action pairs",
);
assert.match(
  gateway,
  /watchQuery\([\s\S]*api as any\)\.communityAgentConcierge\.getMyLatestCommunityAgentServeIssue[\s\S]*authSubject: params\.liveClient\.authSubject[\s\S]*communityId: params\.communityId/,
  "gateway should subscribe to requester-scoped serve issue updates",
);

assert.match(
  interactionProjection,
  /subscribeCloudCommunityAgentServeIssue[\s\S]*type CloudCommunityAgentServeIssue/,
  "the community interaction projection should import the community-agent serve issue gateway",
);
assert.match(
  interactionProjection,
  /const \[serveIssue, setServeIssue\] = useState<CloudCommunityAgentServeIssue \| null>\(null\)/,
  "the community interaction projection should keep the serve issue as local UI state",
);
assert.match(
  interactionProjection,
  /dismissedServeIssueIdsRef = useRef<Set<string>>\(new Set\(\)\)/,
  "the community interaction projection should allow per-session dismissals without mutating the serve ledger",
);
assert.match(
  interactionProjection,
  /!isCommunityChatActive[\s\S]*subscribeCloudCommunityAgentServeIssue\(\{[\s\S]*communityId: activeCommunityId/,
  "the community interaction projection should subscribe only while the active community chat is mounted",
);
assert.match(
  app,
  /isCommunityChatActive:\s*activePage === "community" &&\s*activeView === "home" &&\s*communityTab === "chat"/,
  "App composition must pass an explicit active-community-chat scope into the interaction owner",
);
assert.match(
  projection,
  /communityAgentServeIssue: WebCommunityChatPanelProps\["communityAgentServeIssue"\][\s\S]*onDismissCommunityAgentServeIssue/,
  "community surface projection should pass serve issue props through to chat",
);
assert.match(
  chatPanel,
  /communityAgentServeIssue: CloudCommunityAgentServeIssue \| null[\s\S]*onDismissCommunityAgentServeIssue/,
  "chat panel should receive the private serve issue and dismiss action",
);
assert.match(
  chatPanel,
  /community-agent-serve-notice[\s\S]*Community AI is temporarily unavailable[\s\S]*cta === "start_builder" && onStartBuilderFromServeIssue[\s\S]*onDismissCommunityAgentServeIssue/,
  "chat panel should render the hosted-funding notice and the member-allowance Builder action",
);
assert.doesNotMatch(
  `${gateway}\n${projection}\n${chatPanel}`,
  /connect_chatgpt|onConnectCommunityAgentServeProvider|needsMemberConnection/,
  "community AI notices must never route members to personal inference",
);
const noticeBlock = localConstBlock(chatPanel, "renderCommunityAgentServeNotice");
assert.doesNotMatch(
  noticeBlock,
  /createCloudCommunityInteractionComposerMessageRows|onSendCommunityMessage/,
  "chat notice must not create a public community chat reply",
);
assert.match(
  css,
  /\.community-agent-serve-notice \{[\s\S]*border-radius: 8px[\s\S]*\.community-agent-serve-notice-primary[\s\S]*\.community-agent-serve-notice-dismiss/,
  "serve issue notice should have bounded local composer styling",
);

console.log("community_agent_serve_issue_notice_contract_proof: ok");
