import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildCommunityAgentServeRunId,
  communityAgentDockReplyIsVisibleToOwner,
  nextCommunityAgentServeAttempt,
  projectCommunityAgentDockPublicIssue,
} from "../shared/communityAgentDockContract.ts";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const packageJson = read("package.json");
const schema = read("convex/schema.ts");
const interactions = read("convex/communityInteractions.ts");
const serveWorker = read("convex/communityAgentServeWorker.ts");
const runtime = read("convex/communityAgentRuntime.ts");
const transport = read("convex/chatgptResponsesTransport.ts");
const gateway = read("shared/cloudCommunityInteractionsGateway.ts");
const component = read("apps/web/src/components/WebCommunityAgentDock.tsx");
const app = read("apps/web/src/App.tsx");
const dockCss = read("apps/web/src/components/WebCommunityAgentDock.css");
const transcriptQuery = interactions.match(
  /export const getMyCommunityAgentDockTranscript = query\([\s\S]*?\n\}\);\n\nexport const getMyCommunityAgentDockTurn/,
)?.[0] ?? "";
const turnQuery = interactions.match(
  /export const getMyCommunityAgentDockTurn = query\([\s\S]*?\n\}\);\n\nexport const listCommunityInteractionRoots/,
)?.[0] ?? "";

assert.match(
  packageJson,
  /"check:community-agent-dock-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_agent_dock_contract_proof\.ts"/,
  "the dock contract must remain directly runnable",
);

assert.match(
  interactions,
  /sendCommunityAgentDockMessage = mutation[\s\S]*resolveUserIdForAuthenticatedRequest[\s\S]*requireCommunityChatAccess[\s\S]*requireProfileSetupCompleteForUser/,
  "dock writes must authenticate, authorize community chat access, and require a complete profile",
);
assert.match(
  interactions,
  /actorType: "system"[\s\S]*kind: "agent_signal"[\s\S]*visibilityScope: "private"[\s\S]*communityAgentDockRootIdempotencyKey/,
  "each member/community dock must use one deterministic private canonical root",
);
assert.match(
  interactions,
  /communityAgentDockReplyIdempotencyKey[\s\S]*getExistingReplyByIdempotencyKey[\s\S]*interaction_idempotency_key_conflict/,
  "dock prompts must be idempotent and fail closed on cross-root collisions",
);
assert.match(
  interactions,
  /by_sourceRoot_createdAt[\s\S]*activeRequest\.status === "queued"[\s\S]*community_agent_dock_turn_in_progress/,
  "the server must permit only one active dock turn per member/community",
);
assert.match(
  interactions,
  /findCanonicalAgentMentionForReply[\s\S]*CANONICAL_COMMUNITY_AGENT_KEY[\s\S]*intakeCommunityAgentMention/,
  "dock prompts must enter the existing canonical Concierge intake path",
);
assert.match(
  interactions,
  /root\.idempotencyKey\.startsWith\("community_agent_dock:root:"\)[\s\S]*community_agent_dock_dedicated_endpoint_required/,
  "the generic composer must not bypass dock ownership and intake rules",
);
assert.match(
  interactions,
  /getMyCommunityAgentDockTranscript = query[\s\S]*getMyCommunityAgentDockTurn = query/,
  "dock transcript and active turn must use separate reactive queries",
);
assert.match(
  transcriptQuery,
  /requireCommunityChatAccess[\s\S]*assertOwnedCommunityAgentDockRoot/,
  "dock reads must re-check access and ownership",
);
assert.doesNotMatch(transcriptQuery, /communityAgentRunEvents|communityAgentServeRequests/);
assert.doesNotMatch(turnQuery, /mapReplyBundle|listContentBlocksForReply/);
assert.match(
  schema,
  /communityAgentServeRequests: defineTable[\s\S]*\.index\("by_sourceRoot_createdAt", \["sourceRootId", "createdAt"\]\)/,
  "dock request projection must use an exact scalable source-root index",
);
assert.match(
  interactions,
  /by_sourceRoot_createdAt[\s\S]*requesterUserId[\s\S]*communityId/,
  "indexed request reads must still verify requester and community ownership",
);
assert.match(
  interactions,
  /event\.kind === "tool_result" \? "" : event\.content/,
  "raw tool results must not be projected into the member dock",
);
assert.doesNotMatch(
  turnQuery,
  /request\.errorMessage|request\.skipReason/,
  "dock turn projection must not expose raw backend errors",
);
assert.match(
  interactions,
  /by_root_seq[\s\S]*\.order\("desc"\)[\s\S]*\.take\(COMMUNITY_AGENT_DOCK_REPLY_LIMIT\)[\s\S]*\.reverse\(\)/,
  "bounded dock reads must retain the newest messages in chronological order",
);

assert.match(
  serveWorker,
  /createServeRunEventRecorder[\s\S]*SERVE_EVENT_DELTA_FLUSH_CHARS/,
  "serve deltas must be batched before durable event writes",
);
assert.match(schema, /communityAgentServeRequests: defineTable[\s\S]*attempt: v\.optional\(v\.number\(\)\)/);
assert.match(
  serveWorker,
  /nextCommunityAgentServeAttempt\(request\.attempt\)[\s\S]*attempt,[\s\S]*buildCommunityAgentServeRunId/,
  "every claimed serve attempt must receive an isolated run-event identity",
);
for (const callback of ["onDelta", "onReasoningSummaryTextDelta", "onToolStepStart", "onToolStepFinish"]) {
  assert.match(serveWorker, new RegExp(`${callback}:`), `serve worker must wire ${callback}`);
}
assert.match(
  serveWorker,
  /type ServeRunEventKind = "reasoning" \| "assistant" \| "tool_call" \| "tool_result" \| "final" \| "error"/,
  "serve event persistence must allow only the member-visible event vocabulary",
);
assert.match(
  serveWorker,
  /onDelta: async \(delta\)[\s\S]*pushDelta\("assistant", delta\)[\s\S]*onReasoningSummaryTextDelta[\s\S]*pushDelta\("reasoning", delta\)/,
  "assistant and reasoning deltas must enter separate durable buffers",
);
for (const eventKind of ["tool_call", "tool_result", "final", "error"]) {
  assert.match(serveWorker, new RegExp(`kind: "${eventKind}"`), `serve worker must emit ${eventKind} events`);
}
assert.doesNotMatch(
  serveWorker,
  /Daytona|workspace_shell|shell_command/,
  "the community dock serve path must not expose Workspace or Daytona tools",
);
assert.match(
  serveWorker,
  /buildPrivateDockConversationContext[\s\S]*Recent private conversation \(oldest to newest\)[\s\S]*Current member message/,
  "later dock turns must receive bounded private conversation continuity",
);
assert.match(
  transport,
  /onDelta\?: \(delta: string\) => Promise<void> \| void[\s\S]*await params\.onDelta/,
  "provider text callbacks must support awaited durable streaming",
);
assert.match(
  runtime,
  /by_run_seq[\s\S]*ctx\.db\.patch\(existing\._id, row\)[\s\S]*ctx\.db\.insert\("communityAgentRunEvents"/,
  "run-event writes must be idempotent by run and sequence",
);

assert.match(
  gateway,
  /sendCloudCommunityAgentDockMessage[\s\S]*subscribeCloudCommunityAgentDockTranscript[\s\S]*subscribeCloudCommunityAgentDockTurn/,
  "the client must use dedicated authenticated transcript and turn subscriptions",
);
assert.match(
  component,
  /createCloudCommunityChatLiveClient[\s\S]*subscribeCloudCommunityAgentDockTranscript[\s\S]*subscribeCloudCommunityAgentDockTurn[\s\S]*sendCloudCommunityAgentDockMessage/,
  "the dock must subscribe only through the authenticated Convex client",
);
assert.match(component, /message\.id === pendingMessage\.replyId/);
assert.match(component, /replyId: result\.reply_id/);
assert.match(
  component,
  /requestIsActive[\s\S]*reasoningText[\s\S]*toolRows[\s\S]*assistantStream/,
  "the dock must render real request, reasoning, tool, and token state",
);
assert.doesNotMatch(
  component,
  /workspace|threadId|projectId|Daytona/i,
  "the dock UI must remain community-scoped and threadless",
);
assert.match(
  app,
  /<WebCommunityAgentDock[\s\S]*activePage === "community"[\s\S]*publicRoute\.kind !== "community_funnel"[\s\S]*hasResolvedCommunityChat/,
  "the dock must mount only on authorized internal community surfaces",
);
assert.match(app, /!isCommunityLaunchSetupModalOpen[\s\S]*!isDirectMessagesOpen[\s\S]*!isOnboardingModalOpen/);
assert.match(dockCss, /\.community-agent-dock \{[\s\S]*z-index: 70/);

assert.equal(nextCommunityAgentServeAttempt(undefined), 1);
assert.equal(nextCommunityAgentServeAttempt(1), 2);
assert.equal(buildCommunityAgentServeRunId("req_1", 0), "community-agent-serve:req_1");
assert.equal(buildCommunityAgentServeRunId("req_1", 2), "community-agent-serve:req_1:attempt:2");
assert.deepEqual(
  projectCommunityAgentDockPublicIssue({
    status: "error",
    errorCode: "provider_exception",
  }),
  { code: "turn_failed", message: "The community agent could not complete this turn." },
);
assert.equal(
  communityAgentDockReplyIsVisibleToOwner({
    actorType: "human",
    actorUserId: "user_b",
    ownerUserId: "user_a",
    canonicalAgentKey: "community_agent",
  }),
  false,
);

console.log("community_agent_dock_contract_proof: ok");
