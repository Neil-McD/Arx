import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  buildCommunityInteractionEvidenceRef,
  deriveCommunityInteractionLineageEnvelope,
  normalizeCommunityEvidenceSearchLimit,
  parseCommunityInteractionEvidenceRef,
} from "../shared/communityEvidenceContract.ts";
import {
  communityInteractionEvidenceSourceIsReadable,
  resolveCommunityInteractionEvidenceSource,
} from "../convex/communityInteractionEvidenceCore.ts";

const root = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await readFile(path.join(root, relativePath), "utf8");
}

const [
  schema,
  evidence,
  audit,
  recent,
  communityChat,
  interactions,
  runtimeLoop,
  retrievalTools,
  invocationSurface,
  conciergeTools,
  conciergeWorker,
  mcp,
  httpMcp,
  canonicalExecutor,
  lineageContract,
  evidenceCore,
  channelCore,
] = await Promise.all([
  read("convex/schema.ts"),
  read("convex/communityInteractionEvidence.ts"),
  read("convex/communityEvidenceAudit.ts"),
  read("convex/communityRecentContext.ts"),
  read("convex/communityChat.ts"),
  read("convex/communityInteractions.ts"),
  read("convex/runtimeAgentLoop.ts"),
  read("shared/retrievalTools.ts"),
  read("shared/runtimeInvocationSurface.ts"),
  read("shared/communityAgentConciergeTools.ts"),
  read("convex/communityAgentServeWorker.ts"),
  read("shared/polynetMcp.ts"),
  read("convex/httpMcp.ts"),
  read("convex/polynetCanonicalExecutor.ts"),
  read("docs/community-lineage-ontology-contract-v0.md"),
  read("convex/communityInteractionEvidenceCore.ts"),
  read("convex/communityChannelCore.ts"),
]);

assert.match(schema, /communityEvidenceRetrievalLogs: defineTable/);
assert.match(schema, /v\.literal\("interaction"\)/);
assert.match(evidence, /buildCommunityInteractionEvidenceRef/);
assert.match(evidence, /requireCommunityChatAccess/);
assert.match(evidence, /communityEvidenceAudit\.recordCommunityEvidenceRetrievalInternal/);
assert.match(evidence, /recordTrustedCommunitySourceTraceCore/);
assert.match(evidence, /const actor = sourceTraceActor\(row\)/);
assert.match(evidence, /actorUserId: actor\.actorUserId/);
assert.match(evidence, /actorAgentKey: actor\.actorAgentKey/);
assert.match(evidence, /deriveCommunityInteractionLineageEnvelope/);
assert.match(evidence, /lineage,/);
assert.doesNotMatch(evidence, /syncArchiveDocumentForInteraction|deleteArchiveDocumentBySource/);
assert.match(evidence, /backfillCommunityInteractionEvidenceInternal/);
assert.match(evidence, /sourceVisibility: "redacted"/);
assert.match(evidence, /compilerState: "excluded_by_visibility"/);
assert.match(evidence, /compilerDecision: undefined/);
assert.match(evidence, /redactCommunityInteractionEvidenceChildrenInternal/);
assert.match(evidence, /async function upsertInteractionSourceTrace/);
assert.match(evidence, /compilerGroupKey: `interaction_episode:\$\{normalizeIdValue\(root\._id\)\}`/);
assert.doesNotMatch(evidence, /promoteCommunityInteractionEvidenceInternal/);
assert.doesNotMatch(evidence, /communityInteractionSourceTraceLinks/);
assert.match(evidenceCore, /normalizeId\(table as any/);
assert.match(evidenceCore, /normalizeId\([\s\S]*"communityInteractionRoots" as any/);
assert.match(evidenceCore, /normalizeIdValue\(root\.communityId\) !== normalizeIdValue\(args\.communityId\)/);
assert.match(evidenceCore, /normalizeIdValue\(root\.communityId\) !== normalizeIdValue\(row\.communityId\)/);

const syncStart = evidence.indexOf("export const syncCommunityInteractionEvidenceInternal");
const redactionStart = evidence.indexOf("export const redactCommunityInteractionEvidenceChildrenInternal");
assert.ok(syncStart >= 0 && redactionStart > syncStart, "sync and redaction blocks must exist");
const syncBlock = evidence.slice(syncStart, redactionStart);
assert.match(
  syncBlock,
  /const traced = await upsertInteractionSourceTrace\([\s\S]*traced: true/,
  "every live readable interaction should enter the compiler evidence ledger without a promotion gate",
);

assert.match(audit, /export const recordCommunityEvidenceRetrievalInternal/);
assert.doesNotMatch(audit, /query: v\.optional/);
assert.doesNotMatch(audit, /args\.query/);

const backfillStart = evidence.indexOf("export const listCommunityInteractionEvidenceBackfillBatchInternal");
const redactionBlock = evidence.slice(redactionStart, backfillStart);
assert.match(redactionBlock, /query\("communityInteractionReplies" as any\)/);
assert.doesNotMatch(redactionBlock, /query\("communityInteractionSourceTraceLinks" as any\)/);

const retrievalAuditStart = evidence.indexOf("const retrievalId: any = await ctx.runMutation");
assert.ok(retrievalAuditStart >= 0, "retrieval audit block must exist");
assert.match(evidence, /const results = recent\.results/);
assert.match(evidence, /strategy: "bounded_lexical"/);
assert.doesNotMatch(evidence, /vectorSearch|embedGemini|archiveAvailable|archiveError|archive_error/);

assert.match(
  recent,
  /listAllActiveChannelReadableRows<InteractionContextRow>[\s\S]*tableName: "communityInteractionRoots"[\s\S]*tableName: "communityInteractionReplies"/,
);
assert.match(
  recent,
  /requireReadableChannelForAddressableRow[\s\S]*channel_slug: channel\.slug/,
  "recent context should aggregate active channels and retain channel provenance",
);
assert.match(
  channelCore,
  /listReadableRowsForChannelIds[\s\S]*by_community_channel_visibility_status_createdAt/,
);
assert.match(
  recent,
  /normalizeIdValue\(root\.communityId\) === normalizeIdValue\(args\.communityId\)/,
  "recent context must reject a reply parent from another community",
);
assert.doesNotMatch(recent, /query\("communityChatMessages"/);
assert.match(recent, /recent_context_v2/);

assert.match(evidence, /"communityInteractionRoots" as any/);
assert.match(evidence, /"communityInteractionReplies" as any/);
assert.doesNotMatch(communityChat, /communityArchiveDocuments|deleteArchiveDocumentBySource/);
assert.match(interactions, /scheduleCommunityInteractionEvidenceSync/);

assert.doesNotMatch(retrievalTools, /community_chat_search|community_chat_read/);
for (const source of [invocationSurface, conciergeTools]) {
  assert.match(source, /polynet_search/);
  assert.match(source, /polynet_read/);
  assert.doesNotMatch(source, /community_chat_search|community_chat_read/);
}
assert.match(runtimeLoop, /executePolynetCanonicalTool/);
assert.match(conciergeWorker, /executeConciergeTool/);
assert.match(conciergeWorker, /executeRetrievalHarnessTool/);
assert.match(conciergeWorker, /evidenceSurface: "community_concierge"/);
assert.match(mcp, /getPolynetCanonicalToolDefinitions/);
assert.doesNotMatch(mcp, /polynet_community_chat_search|polynet_community_chat_read/);
assert.match(
  canonicalExecutor,
  /communityInteractionEvidence[\s\S]*searchCommunityInteractionEvidenceInternal/,
);
assert.match(
  canonicalExecutor,
  /communityInteractionEvidence[\s\S]*readCommunityInteractionEvidenceForToolInternal/,
);
assert.match(httpMcp, /executePolynetCanonicalTool/);
assert.match(httpMcp, /evidenceSurface: "external_mcp"/);
assert.match(lineageContract, /profile projection: `source_only`/);
assert.match(lineageContract, /Searchability is not acceptance/);

const rootRef = buildCommunityInteractionEvidenceRef({ objectType: "root", objectId: "root_123" });
assert.equal(rootRef, "interaction:root:root_123");
assert.deepEqual(parseCommunityInteractionEvidenceRef(rootRef), {
  objectType: "root",
  objectId: "root_123",
});
assert.equal(parseCommunityInteractionEvidenceRef("chat:legacy_123"), null);
assert.equal(normalizeCommunityEvidenceSearchLimit(0), 1);
assert.equal(normalizeCommunityEvidenceSearchLimit(999), 20);

const rootId = "roots:root_1";
const replyId = "replies:reply_1";
const foreignRootId = "roots:root_foreign";
const rows = new Map<string, any>([
  [
    rootId,
    {
      _id: rootId,
      communityId: "community_1",
      actorType: "human",
      status: "live",
      visibilityScope: "community",
      contentSummary: "root",
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  [
    replyId,
    {
      _id: replyId,
      communityId: "community_1",
      rootId,
      actorType: "human",
      status: "live",
      visibilityScope: "community",
      contentSummary: "reply",
      createdAt: 2,
      updatedAt: 2,
    },
  ],
  [
    foreignRootId,
    {
      _id: foreignRootId,
      communityId: "community_2",
      actorType: "human",
      status: "live",
      visibilityScope: "community",
      contentSummary: "foreign root",
      createdAt: 1,
      updatedAt: 1,
    },
  ],
]);
const mockCtx = {
  db: {
    normalizeId(table: string, id: string) {
      const prefix = table === "communityInteractionRoots" ? "roots:" : "replies:";
      return String(id).startsWith(prefix) ? id : null;
    },
    async get(id: string) {
      return rows.get(id) ?? null;
    },
  },
};
const resolvedReply = await resolveCommunityInteractionEvidenceSource({
  ctx: mockCtx,
  communityId: "community_1",
  objectType: "reply",
  objectId: replyId,
});
assert.ok(resolvedReply);
assert.equal(communityInteractionEvidenceSourceIsReadable(resolvedReply), true);
assert.equal(
  await resolveCommunityInteractionEvidenceSource({
    ctx: mockCtx,
    communityId: "community_1",
    objectType: "root",
    objectId: replyId,
  }),
  null,
  "reply ids must not resolve through root references",
);
rows.set(replyId, { ...rows.get(replyId), rootId: foreignRootId });
assert.equal(
  await resolveCommunityInteractionEvidenceSource({
    ctx: mockCtx,
    communityId: "community_1",
    objectType: "reply",
    objectId: replyId,
  }),
  null,
  "cross-community parents must fail closed",
);

const replyLineage = deriveCommunityInteractionLineageEnvelope({
  actorType: "human",
  actorUserId: "user_123",
  communityId: "community_123",
  objectType: "reply",
  objectId: "reply_123",
  rootId: "root_123",
  targetReplyId: "reply_122",
});
assert.deepEqual(replyLineage.credit, { type: "user", user_id: "user_123" });
assert.equal(replyLineage.evidence.ref, "interaction:reply:reply_123");
assert.equal(replyLineage.episode.ref, "interaction:root:root_123");
assert.equal(replyLineage.relation?.ref, "interaction:reply:reply_122");
assert.equal(replyLineage.profile_projection, "source_only");

console.log("community_interaction_evidence_spine_contract_proof: ok");
