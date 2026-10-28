import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildCommunityAiFeedEvidenceRef,
  buildCommunityInteractionEvidenceRef,
  buildCommunityResourceEvidenceRef,
  parseCommunityEvidenceRef,
} from "../shared/communityEvidenceContract.ts";
import {
  captureCommunityEvidenceCitationCore,
  captureCommunityEvidenceCitationsForSourceTracesCore,
  checkCommunityEvidenceCitationCore,
  requireCommunityEvidenceCitationVisibilityCore,
} from "../convex/communityEvidenceCitations.ts";
import { resolveCommunityEvidenceRefCore } from "../convex/communityEvidenceCore.ts";

type Row = Record<string, any> & { _id: string };

class FakeIndexBuilder {
  readonly conditions: Array<[string, unknown]> = [];

  eq(field: string, value: unknown): this {
    this.conditions.push([field, value]);
    return this;
  }
}

class FakeQuery {
  private conditions: Array<[string, unknown]> = [];
  private readonly rows: Row[];

  constructor(rows: Row[]) {
    this.rows = rows;
  }

  withIndex(_name: string, build: (q: FakeIndexBuilder) => FakeIndexBuilder): this {
    const builder = build(new FakeIndexBuilder());
    this.conditions = builder.conditions;
    return this;
  }

  private filtered(): Row[] {
    return this.rows.filter((row) =>
      this.conditions.every(([field, value]) => String(row[field] ?? "") === String(value ?? "")),
    );
  }

  async take(limit: number): Promise<Row[]> {
    return this.filtered().slice(0, limit);
  }

  async first(): Promise<Row | null> {
    return this.filtered()[0] ?? null;
  }
}

class FakeDb {
  private readonly tables = new Map<string, Row[]>();
  private counter = 0;

  normalizeId(table: string, raw: unknown): string | null {
    const value = String(raw ?? "").trim();
    return value.startsWith(`${table}_`) ? value : null;
  }

  async insert(table: string, value: Record<string, unknown>): Promise<string> {
    this.counter += 1;
    const id = `${table}_${this.counter}`;
    const row = { ...value, _id: id } as Row;
    const rows = this.tables.get(table) ?? [];
    rows.push(row);
    this.tables.set(table, rows);
    return id;
  }

  async get(id: string): Promise<Row | null> {
    for (const rows of this.tables.values()) {
      const row = rows.find((candidate) => candidate._id === String(id));
      if (row) return row;
    }
    return null;
  }

  async patch(id: string, patch: Record<string, unknown>): Promise<void> {
    const row = await this.get(id);
    if (!row) throw new Error(`missing fake row ${id}`);
    Object.assign(row, patch);
  }

  query(table: string): FakeQuery {
    return new FakeQuery(this.tables.get(table) ?? []);
  }

  rows(table: string): Row[] {
    return this.tables.get(table) ?? [];
  }
}

async function insertInteractionFixture(db: FakeDb, communityId: string, nowMs: number) {
  const rootId = await db.insert("communityInteractionRoots", {
    communityId,
    actorType: "human",
    actorUserId: "users:owner",
    kind: "discussion",
    status: "live",
    visibilityScope: "community",
    title: "Integrity decision",
    contentSummary: "The original evidence",
    replyCount: 0,
    reactionSummary: [],
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  const blockId = await db.insert("communityInteractionContentBlocks", {
    communityId,
    rootId,
    blockOrder: 0,
    blockType: "markdown_text",
    text: "The original evidence",
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  const ref = buildCommunityInteractionEvidenceRef({ objectType: "root", objectId: rootId });
  const traceId = await db.insert("communitySourceTraces", {
    communityId,
    sourceType: "interaction",
    sourceId: ref,
    title: "Integrity decision",
    summary: "The original evidence",
    visibilityScope: "community",
    sourceVisibility: "community",
    artifactIds: [],
    outcomeObservationIds: [],
    actorType: "member",
    actorUserId: "users:owner",
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  return { rootId, blockId, traceId, ref };
}

async function main() {
  const db = new FakeDb();
  const ctx = { db };
  const nowMs = 1_700_000_000_000;
  const communityId = await db.insert("communities", { name: "Integrity community" });
  const foreignCommunityId = await db.insert("communities", { name: "Foreign community" });

  assert.equal(parseCommunityEvidenceRef("interaction:root:abc")?.source_type, "interaction");
  assert.equal(parseCommunityEvidenceRef("resource:abc")?.source_type, "resource");
  assert.equal(parseCommunityEvidenceRef("ai_feed:abc")?.source_type, "ai_feed");
  assert.equal(parseCommunityEvidenceRef("trace:abc")?.source_type, "source_trace");
  assert.equal(parseCommunityEvidenceRef("interaction:wrong:abc"), null);

  const interaction = await insertInteractionFixture(db, communityId, nowMs);
  const firstCitationIds = await captureCommunityEvidenceCitationsForSourceTracesCore({
    ctx,
    communityId,
    sourceTraceIds: [interaction.traceId],
    actorType: "compiler",
    capturedAt: nowMs + 1,
  });
  const repeatedCitationIds = await captureCommunityEvidenceCitationsForSourceTracesCore({
    ctx,
    communityId,
    sourceTraceIds: [interaction.traceId],
    actorType: "compiler",
    capturedAt: nowMs + 2,
  });
  assert.deepEqual(repeatedCitationIds, firstCitationIds, "same evidence version must reuse its citation");
  assert.equal(db.rows("communityEvidenceCitations").length, 1);
  assert.equal(
    await checkCommunityEvidenceCitationCore({
      ctx,
      communityId,
      citationId: firstCitationIds[0],
    }),
    "active",
  );

  await db.patch(interaction.rootId, {
    contentSummary: "The edited evidence",
    editedAt: nowMs,
    updatedAt: nowMs,
  });
  await db.patch(interaction.blockId, { text: "The edited evidence", updatedAt: nowMs });
  assert.equal(
    await checkCommunityEvidenceCitationCore({
      ctx,
      communityId,
      citationId: firstCitationIds[0],
    }),
    "superseded",
  );
  const editedCitationIds = await captureCommunityEvidenceCitationsForSourceTracesCore({
    ctx,
    communityId,
    sourceTraceIds: [interaction.traceId],
    actorType: "compiler",
    capturedAt: nowMs + 4,
  });
  assert.notEqual(
    editedCitationIds[0],
    firstCitationIds[0],
    "same-millisecond edits must still produce a new evidence version",
  );
  assert.equal(db.rows("communityEvidenceCitations").length, 2);

  await db.patch(interaction.rootId, { status: "deleted", updatedAt: nowMs + 5 });
  assert.equal(
    await checkCommunityEvidenceCitationCore({
      ctx,
      communityId,
      citationId: editedCitationIds[0],
    }),
    "revoked",
  );

  const otherRootId = await db.insert("communityInteractionRoots", {
    communityId,
    actorType: "human",
    actorUserId: "users:owner",
    kind: "discussion",
    status: "live",
    visibilityScope: "community",
    contentSummary: "Other root",
    replyCount: 1,
    reactionSummary: [],
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  const targetReplyId = await db.insert("communityInteractionReplies", {
    communityId,
    rootId: otherRootId,
    seq: 1,
    actorType: "human",
    actorUserId: "users:owner",
    status: "live",
    visibilityScope: "community",
    contentSummary: "Target in another root",
    reactionSummary: [],
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  const localRootId = await db.insert("communityInteractionRoots", {
    communityId,
    actorType: "human",
    actorUserId: "users:owner",
    kind: "discussion",
    status: "live",
    visibilityScope: "community",
    contentSummary: "Local root",
    replyCount: 1,
    reactionSummary: [],
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  const invalidReplyId = await db.insert("communityInteractionReplies", {
    communityId,
    rootId: localRootId,
    targetReplyId,
    seq: 1,
    actorType: "human",
    actorUserId: "users:owner",
    status: "live",
    visibilityScope: "community",
    contentSummary: "Invalid cross-root reply",
    reactionSummary: [],
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  const invalidRelation = await resolveCommunityEvidenceRefCore({
    ctx,
    communityId,
    ref: buildCommunityInteractionEvidenceRef({ objectType: "reply", objectId: invalidReplyId }),
  });
  assert.notEqual(invalidRelation.status, "active", "cross-root reply targets must fail closed");

  const childLeakRootId = await db.insert("communityInteractionRoots", {
    communityId,
    actorType: "human",
    actorUserId: "users:owner",
    kind: "discussion",
    status: "live",
    visibilityScope: "community",
    contentSummary: "Child integrity root",
    replyCount: 0,
    reactionSummary: [],
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  await db.insert("communityInteractionContentBlocks", {
    communityId: foreignCommunityId,
    rootId: childLeakRootId,
    blockOrder: 0,
    blockType: "markdown_text",
    text: "Foreign child data",
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  const invalidChildren = await resolveCommunityEvidenceRefCore({
    ctx,
    communityId,
    ref: buildCommunityInteractionEvidenceRef({ objectType: "root", objectId: childLeakRootId }),
  });
  assert.equal(invalidChildren.status, "invalid", "foreign child rows must fail closed");

  const moduleId = await db.insert("communityResourceModules", {
    communityId,
    createdByUserId: "users:owner",
    status: "live",
    name: "Knowledge",
    sortOrder: 0,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  const resourceId = await db.insert("communityResources", {
    communityId,
    moduleId,
    createdByUserId: "users:owner",
    type: "note",
    role: "page",
    title: "Canonical guide",
    bodyMd: "Resource evidence",
    pinned: false,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  const resourceRef = buildCommunityResourceEvidenceRef(resourceId);
  assert.equal(
    (await resolveCommunityEvidenceRefCore({ ctx, communityId, ref: resourceRef })).status,
    "active",
  );
  await db.patch(moduleId, { status: "draft", updatedAt: nowMs + 1 });
  assert.notEqual(
    (await resolveCommunityEvidenceRefCore({ ctx, communityId, ref: resourceRef })).status,
    "active",
  );

  const postId = await db.insert("communityAiFeedPosts", {
    communityId,
    authorType: "agent",
    agentKey: "community_agent",
    authorLabel: "Community agent",
    type: "observation",
    title: "Feed observation",
    body: "AI Feed evidence",
    evidence: [],
    status: "live",
    score: 1,
    goodCount: 0,
    lowSignalCount: 0,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  const aiFeedRef = buildCommunityAiFeedEvidenceRef(postId);
  const activeAiFeedResolution = await resolveCommunityEvidenceRefCore({
    ctx,
    communityId,
    ref: aiFeedRef,
  });
  assert.equal(activeAiFeedResolution.status, "active");
  if (activeAiFeedResolution.status !== "active") {
    throw new Error("expected active historical AI Feed resolution");
  }
  const historicalAiFeedCitationId = await db.insert("communityEvidenceCitations", {
    communityId,
    sourceKind: activeAiFeedResolution.sourceKind,
    sourceRef: activeAiFeedResolution.sourceRef,
    sourceVersion: activeAiFeedResolution.sourceVersion,
    contentHash: activeAiFeedResolution.contentHash,
    provenanceHash: activeAiFeedResolution.provenanceHash,
    capturedVisibility: activeAiFeedResolution.visibilityScope,
    capturedAt: nowMs - 1,
  });
  assert.equal(
    await checkCommunityEvidenceCitationCore({
      ctx,
      communityId,
      citationId: historicalAiFeedCitationId,
    }),
    "active",
    "historical AI Feed citations must remain auditable during retirement",
  );
  await assert.rejects(
    () =>
      captureCommunityEvidenceCitationCore({
        ctx,
        communityId,
        ref: aiFeedRef,
        capturedAt: nowMs + 1,
      }),
    /community_evidence_source_retired/,
  );
  const aiFeedTraceId = await db.insert("communitySourceTraces", {
    communityId,
    sourceType: "ai_feed",
    sourceId: aiFeedRef,
    summary: "Retired AI Feed trace",
    visibilityScope: "community",
    sourceVisibility: "community",
    artifactIds: [],
    outcomeObservationIds: [],
    actorType: "compiler",
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  await assert.rejects(
    () =>
      captureCommunityEvidenceCitationsForSourceTracesCore({
        ctx,
        communityId: "foreign_community",
        sourceTraceIds: [aiFeedTraceId],
        actorType: "compiler",
        capturedAt: nowMs + 1,
      }),
    /community_evidence_source_trace_not_admissible/,
    "retirement must not disclose a foreign trace's source type",
  );
  await assert.rejects(
    () =>
      captureCommunityEvidenceCitationsForSourceTracesCore({
        ctx,
        communityId,
        sourceTraceIds: [aiFeedTraceId],
        actorType: "compiler",
        capturedAt: nowMs + 1,
      }),
    /community_evidence_source_retired/,
  );
  await db.patch(postId, { status: "hidden", updatedAt: nowMs + 1 });
  assert.notEqual(
    (await resolveCommunityEvidenceRefCore({ ctx, communityId, ref: aiFeedRef })).status,
    "active",
  );

  const redactedTraceId = await db.insert("communitySourceTraces", {
    communityId,
    sourceType: "manual",
    summary: "Redacted trace",
    visibilityScope: "admin",
    sourceVisibility: "redacted",
    artifactIds: [],
    outcomeObservationIds: [],
    actorType: "admin",
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  await assert.rejects(
    () =>
      captureCommunityEvidenceCitationsForSourceTracesCore({
        ctx,
        communityId,
        sourceTraceIds: [redactedTraceId],
        actorType: "admin",
        capturedAt: nowMs,
      }),
    /community_evidence_source_trace_not_admissible/,
  );
  const privateTraceId = await db.insert("communitySourceTraces", {
    communityId,
    sourceType: "manual",
    summary: "Admin-only trace",
    visibilityScope: "admin",
    sourceVisibility: "admin",
    artifactIds: [],
    outcomeObservationIds: [],
    actorType: "admin",
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  const compilerAdminCitationIds = await captureCommunityEvidenceCitationsForSourceTracesCore({
    ctx,
    communityId,
    sourceTraceIds: [privateTraceId],
    actorType: "compiler",
    capturedAt: nowMs,
  });
  assert.equal(
    compilerAdminCitationIds.length,
    1,
    "the autonomous compiler may cite admin evidence when its output remains admin-scoped",
  );
  const adminCitationIds = await captureCommunityEvidenceCitationsForSourceTracesCore({
    ctx,
    communityId,
    sourceTraceIds: [privateTraceId],
    actorType: "admin",
    capturedAt: nowMs,
  });
  assert.deepEqual(adminCitationIds, compilerAdminCitationIds);
  await assert.rejects(
    () =>
      requireCommunityEvidenceCitationVisibilityCore({
        ctx,
        communityId,
        citationIds: adminCitationIds,
        outputVisibility: "community",
      }),
    /community_evidence_visibility_escalation/,
  );
  const legacyChatTraceId = await db.insert("communitySourceTraces", {
    communityId,
    sourceType: "chat",
    sourceId: "legacy-message-id",
    summary: "Legacy chat traces are not canonical evidence",
    visibilityScope: "community",
    sourceVisibility: "community",
    artifactIds: [],
    outcomeObservationIds: [],
    actorType: "member",
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  await assert.rejects(
    () =>
      captureCommunityEvidenceCitationsForSourceTracesCore({
        ctx,
        communityId,
        sourceTraceIds: [legacyChatTraceId],
        actorType: "compiler",
        capturedAt: nowMs,
      }),
    /community_evidence_source_ref_required/,
  );

  const schema = await readFile(new URL("../convex/schema.ts", import.meta.url), "utf8");
  const directory = await readFile(
    new URL("../convex/communityIntelligenceDirectory.ts", import.meta.url),
    "utf8",
  );
  const resourceEvidence = await readFile(
    new URL("../convex/communityResourceEvidence.ts", import.meta.url),
    "utf8",
  );
  const compilerCandidates = await readFile(
    new URL("../convex/communityCompilerCandidates.ts", import.meta.url),
    "utf8",
  );
  const legacyChat = await readFile(new URL("../convex/communityChat.ts", import.meta.url), "utf8");
  assert.match(schema, /communityEvidenceCitations: defineTable/);
  assert.match(directory, /requireCommunityEvidenceCitationsActiveCore/);
  assert.match(directory, /community_evidence_citation_review_required/);
  assert.match(directory, /requestRecapturesAllExistingTraces\s*\? evidenceCitationIds/);
  assert.match(directory, /citationIds: effectiveEvidenceCitationIds/);
  assert.doesNotMatch(resourceEvidence, /query\("communityAiFeedPosts"/);
  assert.match(resourceEvidence, /query\("communityResourceModules"[\s\S]*communityResourceIsLiveModulePage/);
  assert.doesNotMatch(legacyChat, /createThreadUserMessage|deleteOwnMessage|patchOwnMessageContent/, "the old chat no longer writes evidence-bearing messages");
  assert.match(
    compilerCandidates,
    /resolveCurrentDigestItemTrace[\s\S]*sourceTraceIds\.length !== 1[\s\S]*sourceRevisions/,
  );
  assert.doesNotMatch(
    compilerCandidates,
    /RESOLVABLE_SOURCE_TRACE_TYPES|RESOLVABLE_COMPILER_SOURCE_TYPES/,
    "the compiler should settle the exact normalized trace, not reconstruct evidence from a source-type allowlist",
  );

  console.log("community_evidence_integrity_contract_proof: ok");
}

await main();
