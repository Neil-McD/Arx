import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const schema = readFileSync(join(root, "convex/schema.ts"), "utf8");
const concierge = readFileSync(join(root, "convex/communityAgentConcierge.ts"), "utf8");
const gateway = readFileSync(join(root, "shared/cloudCommunityAgentConciergeGateway.ts"), "utf8");
const app = readFileSync(join(root, "apps/web/src/App.tsx"), "utf8");
const projection = readFileSync(join(root, "apps/web/src/controllers/buildWebCommunitySurfaceProjection.ts"), "utf8");
const chatPanel = readFileSync(join(root, "apps/web/src/components/WebCommunityChatPanel.tsx"), "utf8");
const css = readFileSync(join(root, "apps/web/src/base.css"), "utf8");
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
assert.match(
  concierge,
  /userHasChatgptConnection[\s\S]*query\("userProviderConnections" as any\)[\s\S]*withIndex\("by_user_provider"[\s\S]*q\.eq\("userId", userId\)\.eq\("provider", "chatgpt"\)[\s\S]*encryptedSecretHex/,
  "serve issue lookup should check the requester's current ChatGPT connection",
);
assert.match(
  issueQuery,
  /if \(await userHasChatgptConnection\(ctx, userId\)\) \{[\s\S]*return null/,
  "serve issue lookup should hide historical missing-connection issues after the requester connects ChatGPT",
);
assert.match(
  issueQuery,
  /withIndex\("by_requester_community_createdAt"[\s\S]*q\.eq\("requesterUserId", userId\)\.eq\("communityId", args\.communityId\)/,
  "serve issue lookup should query by requester and community before filtering",
);
assert.match(
  issueQuery,
  /row\.agentKey !== CANONICAL_COMMUNITY_AGENT_KEY[\s\S]*row\.status !== "skipped"[\s\S]*row\.intakeReason !== "requester_connection_missing"/,
  "serve issue lookup should only surface skipped canonical community-agent missing-connection requests",
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
  /reason: "provider_connection_required"[\s\S]*cta: "connect_chatgpt"[\s\S]*Connect ChatGPT to use the community agent/,
  "serve issue lookup should return a narrow ChatGPT connection issue payload",
);
assert.doesNotMatch(
  issueQuery,
  /ctx\.db\.(insert|patch|replace|delete)|communityInteractionReplies|communityIntelligence|communitySourceTraces|runChatgptCompletion/,
  "serve issue lookup must not write chat, memory, source traces, or call inference",
);

assert.match(
  gateway,
  /export type CloudCommunityAgentServeIssue[\s\S]*reason: "provider_connection_required"[\s\S]*cta: "connect_chatgpt"/,
  "gateway should expose the narrow serve issue type",
);
assert.match(
  gateway,
  /client\.query\("communityAgentConcierge:getMyLatestCommunityAgentServeIssue" as any[\s\S]*authSubject[\s\S]*communityId: params\.communityId/,
  "gateway should fetch the requester-scoped serve issue",
);
assert.match(
  gateway,
  /watchQuery\([\s\S]*api as any\)\.communityAgentConcierge\.getMyLatestCommunityAgentServeIssue[\s\S]*authSubject: params\.liveClient\.authSubject[\s\S]*communityId: params\.communityId/,
  "gateway should subscribe to requester-scoped serve issue updates",
);

assert.match(
  app,
  /subscribeCloudCommunityAgentServeIssue[\s\S]*type CloudCommunityAgentServeIssue/,
  "App should import the community-agent serve issue gateway",
);
assert.match(
  app,
  /const \[communityAgentServeIssue, setCommunityAgentServeIssue\] =[\s\S]*useState<CloudCommunityAgentServeIssue \| null>\(null\)/,
  "App should keep the serve issue as local UI state",
);
assert.match(
  app,
  /dismissedCommunityAgentServeIssueIdsRef = useRef<Set<string>>\(new Set\(\)\)/,
  "App should allow per-session dismissals without mutating the serve ledger",
);
assert.match(
  app,
  /activePage !== "community"[\s\S]*communityTab !== "chat"[\s\S]*subscribeCloudCommunityAgentServeIssue\(\{[\s\S]*communityId: activeCommunityId/,
  "App should subscribe only while the user is inside the active community chat",
);
assert.match(
  app,
  /handleConnectCommunityAgentServeProvider[\s\S]*providerConnectionUi\.handleConnectChatgpt\(\)/,
  "App notice action should open the existing ChatGPT connection flow",
);

assert.match(
  projection,
  /communityAgentServeIssue: WebCommunityChatPanelProps\["communityAgentServeIssue"\][\s\S]*onDismissCommunityAgentServeIssue[\s\S]*onConnectCommunityAgentServeProvider/,
  "community surface projection should pass serve issue props through to chat",
);
assert.match(
  chatPanel,
  /communityAgentServeIssue: CloudCommunityAgentServeIssue \| null[\s\S]*onDismissCommunityAgentServeIssue[\s\S]*onConnectCommunityAgentServeProvider/,
  "chat panel should receive the private serve issue and notice actions",
);
assert.match(
  chatPanel,
  /community-agent-serve-notice[\s\S]*Connect ChatGPT to use the community agent[\s\S]*onConnectCommunityAgentServeProvider[\s\S]*onDismissCommunityAgentServeIssue/,
  "chat panel should render a local ChatGPT connection notice with connect and dismiss actions",
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
