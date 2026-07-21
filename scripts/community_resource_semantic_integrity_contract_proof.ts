import assert from "node:assert/strict";
import { buildCommunityResourceEvidenceRef } from "../shared/communityEvidenceContract.ts";
import {
  captureCommunityEvidenceCitationsForSourceTracesCore,
  checkCommunityEvidenceCitationCore,
} from "../convex/communityEvidenceCitations.ts";
import {
  revokeCommunityResourceMemoryProjection,
  syncCommunityResourceMemoryProjection,
} from "../convex/communityResourceMemoryProjection.ts";

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

  constructor(private readonly rows: Row[]) {}

  withIndex(_name: string, build: (q: FakeIndexBuilder) => FakeIndexBuilder): this {
    this.conditions = build(new FakeIndexBuilder()).conditions;
    return this;
  }

  private filtered(): Row[] {
    return this.rows.filter((row) =>
      this.conditions.every(([field, value]) => String(row[field] ?? "") === String(value ?? "")),
    );
  }

  async first(): Promise<Row | null> {
    return this.filtered()[0] ?? null;
  }

  async take(limit: number): Promise<Row[]> {
    return this.filtered().slice(0, limit);
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
    const id = `${table}_${++this.counter}`;
    const rows = this.tables.get(table) ?? [];
    rows.push({ ...value, _id: id } as Row);
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

  async delete(id: string): Promise<void> {
    for (const [table, rows] of this.tables) {
      const index = rows.findIndex((candidate) => candidate._id === String(id));
      if (index < 0) continue;
      rows.splice(index, 1);
      this.tables.set(table, rows);
      return;
    }
  }

  query(table: string): FakeQuery {
    return new FakeQuery(this.tables.get(table) ?? []);
  }

  rows(table: string): Row[] {
    return this.tables.get(table) ?? [];
  }
}

function resourceTrace(db: FakeDb, sourceRef: string): Row {
  const trace = db.rows("communitySourceTraces").find((row) => row.sourceId === sourceRef);
  assert.ok(trace, "canonical resource trace should exist");
  return trace;
}

async function settleTrace(db: FakeDb, traceId: string, nowMs: number): Promise<void> {
  await db.patch(traceId, {
    compilerState: "compiled",
    compilerPendingSince: undefined,
    compilerLastHandledAt: nowMs,
    compilerLastDigestId: "communityCompilerDigests_settled",
    compilerDecision: {
      version: 1,
      workKey: `settled:${traceId}`,
      disposition: "retain",
      reason: "proof_settled",
      decidedAt: nowMs,
    },
  });
}

async function captureResourceCitation(args: {
  db: FakeDb;
  communityId: string;
  traceId: string;
  nowMs: number;
}): Promise<string> {
  const ids = await captureCommunityEvidenceCitationsForSourceTracesCore({
    ctx: { db: args.db },
    communityId: args.communityId,
    sourceTraceIds: [args.traceId],
    actorType: "compiler",
    capturedAt: args.nowMs,
  });
  assert.equal(ids.length, 1);
  return String(ids[0]);
}

async function main() {
  const db = new FakeDb();
  const ctx = { db };
  const baseNow = 1_700_000_000_000;
  let nowMs = baseNow;
  const communityId = await db.insert("communities", { name: "Semantic integrity", activeMemberCount: 1 });
  const moduleId = await db.insert("communityResourceModules", {
    communityId,
    createdByUserId: "users_owner",
    status: "live",
    name: "Knowledge",
    descriptionMd: "Canonical context",
    sortOrder: 0,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  const longPrefix = "A".repeat(4_600);
  const resourceId = await db.insert("communityResources", {
    communityId,
    moduleId,
    createdByUserId: "users_owner",
    type: "note",
    role: "page",
    title: "Canonical guide",
    bodyMd: `${longPrefix}TAIL_ONE`,
    url: "https://example.com/guide",
    pinned: false,
    sortOrder: 0,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  const sourceRef = buildCommunityResourceEvidenceRef(resourceId);

  await syncCommunityResourceMemoryProjection(ctx, (await db.get(resourceId))!, ++nowMs);
  let trace = resourceTrace(db, sourceRef);
  assert.equal(trace.compilerState, "pending");
  assert.match(trace.contentHash, /^[a-f0-9]{64}$/);
  assert.match(trace.provenanceHash, /^[a-f0-9]{64}$/);

  await settleTrace(db, trace._id, ++nowMs);
  const originalTraceUpdatedAt = trace.updatedAt;
  const originalCitationId = await captureResourceCitation({
    db,
    communityId,
    traceId: trace._id,
    nowMs: ++nowMs,
  });

  await db.patch(resourceId, { pinned: true, updatedAt: ++nowMs });
  await syncCommunityResourceMemoryProjection(ctx, (await db.get(resourceId))!, ++nowMs);
  trace = resourceTrace(db, sourceRef);
  assert.equal(trace.compilerState, "compiled", "pinning must not reopen compiler work");
  assert.equal(trace.updatedAt, originalTraceUpdatedAt, "pinning must not advance semantic trace time");
  assert.equal(
    await checkCommunityEvidenceCitationCore({ ctx, communityId, citationId: originalCitationId }),
    "active",
    "pinning must not supersede an evidence citation",
  );

  await db.patch(resourceId, { sortOrder: 10, updatedAt: ++nowMs });
  await syncCommunityResourceMemoryProjection(ctx, (await db.get(resourceId))!, ++nowMs);
  trace = resourceTrace(db, sourceRef);
  assert.equal(trace.compilerState, "compiled", "ordering must not reopen compiler work");
  assert.equal(
    await checkCommunityEvidenceCitationCore({ ctx, communityId, citationId: originalCitationId }),
    "active",
    "ordering must not supersede an evidence citation",
  );

  await db.patch(resourceId, { bodyMd: `${longPrefix}TAIL_TWO`, updatedAt: ++nowMs });
  await syncCommunityResourceMemoryProjection(ctx, (await db.get(resourceId))!, ++nowMs);
  trace = resourceTrace(db, sourceRef);
  assert.equal(trace.compilerState, "pending", "tail-only edits after character 4000 must reopen work");
  assert.equal(
    await checkCommunityEvidenceCitationCore({ ctx, communityId, citationId: originalCitationId }),
    "superseded",
    "tail-only edits must supersede the old citation",
  );

  const semanticEdits: Array<[string, Record<string, unknown>]> = [
    ["title", { title: "Canonical guide v2" }],
    ["body", { bodyMd: "A wholly new body" }],
    ["url", { url: "https://example.com/guide-v2" }],
  ];
  for (const [label, patch] of semanticEdits) {
    trace = resourceTrace(db, sourceRef);
    await settleTrace(db, trace._id, ++nowMs);
    const citationId = await captureResourceCitation({
      db,
      communityId,
      traceId: trace._id,
      nowMs: ++nowMs,
    });
    await db.patch(resourceId, { ...patch, updatedAt: ++nowMs });
    await syncCommunityResourceMemoryProjection(ctx, (await db.get(resourceId))!, ++nowMs);
    trace = resourceTrace(db, sourceRef);
    assert.equal(trace.compilerState, "pending", `${label} edits must reopen compiler work`);
    assert.equal(
      await checkCommunityEvidenceCitationCore({ ctx, communityId, citationId }),
      "superseded",
      `${label} edits must supersede the old citation`,
    );
  }

  trace = resourceTrace(db, sourceRef);
  await settleTrace(db, trace._id, ++nowMs);
  const replayCitationId = await captureResourceCitation({
    db,
    communityId,
    traceId: trace._id,
    nowMs: ++nowMs,
  });
  const replayTraceUpdatedAt = trace.updatedAt;
  await syncCommunityResourceMemoryProjection(ctx, (await db.get(resourceId))!, ++nowMs);
  trace = resourceTrace(db, sourceRef);
  assert.equal(trace.compilerState, "compiled", "identical replay must not reopen compiler work");
  assert.equal(trace.updatedAt, replayTraceUpdatedAt, "identical replay must be a semantic no-op");
  assert.equal(
    await checkCommunityEvidenceCitationCore({ ctx, communityId, citationId: replayCitationId }),
    "active",
  );

  const sameContextModuleId = await db.insert("communityResourceModules", {
    communityId,
    createdByUserId: "users_owner",
    status: "live",
    name: "Knowledge",
    descriptionMd: "Canonical context",
    sortOrder: 1,
    createdAt: ++nowMs,
    updatedAt: nowMs,
  });
  const beforeMoveContentHash = trace.contentHash;
  const beforeMoveProvenanceHash = trace.provenanceHash;
  await db.patch(resourceId, { moduleId: sameContextModuleId, updatedAt: ++nowMs });
  await syncCommunityResourceMemoryProjection(ctx, (await db.get(resourceId))!, ++nowMs);
  trace = resourceTrace(db, sourceRef);
  assert.equal(trace.compilerState, "pending", "module moves must reopen compiler work");
  assert.equal(trace.contentHash, beforeMoveContentHash, "same-context moves should preserve content identity");
  assert.notEqual(trace.provenanceHash, beforeMoveProvenanceHash, "module moves must change provenance");

  await settleTrace(db, trace._id, ++nowMs);
  const moduleContextCitationId = await captureResourceCitation({
    db,
    communityId,
    traceId: trace._id,
    nowMs: ++nowMs,
  });
  await db.patch(sameContextModuleId, {
    name: "Operating knowledge",
    descriptionMd: "Changed canonical context",
    updatedAt: ++nowMs,
  });
  await syncCommunityResourceMemoryProjection(ctx, (await db.get(resourceId))!, ++nowMs);
  trace = resourceTrace(db, sourceRef);
  assert.equal(trace.compilerState, "pending", "module context changes must reopen compiler work");
  assert.equal(
    await checkCommunityEvidenceCitationCore({ ctx, communityId, citationId: moduleContextCitationId }),
    "superseded",
  );

  await settleTrace(db, trace._id, ++nowMs);
  const visibilityCitationId = await captureResourceCitation({
    db,
    communityId,
    traceId: trace._id,
    nowMs: ++nowMs,
  });
  const visibleContentHash = trace.contentHash;
  const visibleProvenanceHash = trace.provenanceHash;
  await db.patch(sameContextModuleId, { status: "draft", updatedAt: ++nowMs });
  await syncCommunityResourceMemoryProjection(ctx, (await db.get(resourceId))!, ++nowMs);
  trace = resourceTrace(db, sourceRef);
  assert.equal(trace.sourceVisibility, "redacted");
  assert.equal(trace.compilerState, "excluded_by_visibility");
  assert.equal(
    await checkCommunityEvidenceCitationCore({ ctx, communityId, citationId: visibilityCitationId }),
    "revoked",
  );

  await db.patch(sameContextModuleId, { status: "live", updatedAt: ++nowMs });
  await syncCommunityResourceMemoryProjection(ctx, (await db.get(resourceId))!, ++nowMs);
  trace = resourceTrace(db, sourceRef);
  assert.equal(trace.sourceVisibility, "community");
  assert.equal(trace.compilerState, "pending", "republishing must reopen compiler work after redaction");
  assert.equal(trace.contentHash, visibleContentHash);
  assert.equal(trace.provenanceHash, visibleProvenanceHash);
  assert.equal(
    await checkCommunityEvidenceCitationCore({ ctx, communityId, citationId: visibilityCitationId }),
    "active",
    "an identical republish should reactivate the same immutable evidence citation",
  );

  await db.patch(visibilityCitationId, { sourceVersion: `u:${baseNow}:legacy` });
  assert.equal(
    await checkCommunityEvidenceCitationCore({ ctx, communityId, citationId: visibilityCitationId }),
    "active",
    "legacy timestamped citations remain active when fingerprints and visibility match",
  );
  const reusedLegacyCitationId = await captureResourceCitation({
    db,
    communityId,
    traceId: trace._id,
    nowMs: ++nowMs,
  });
  assert.equal(reusedLegacyCitationId, visibilityCitationId, "equivalent legacy citations must be reused");

  const resource = (await db.get(resourceId))!;
  await revokeCommunityResourceMemoryProjection(ctx, resource, ++nowMs);
  await db.delete(resourceId);
  trace = resourceTrace(db, sourceRef);
  assert.equal(trace.sourceVisibility, "redacted");
  assert.equal(
    await checkCommunityEvidenceCitationCore({ ctx, communityId, citationId: visibilityCitationId }),
    "revoked",
    "deletion must permanently revoke the source citation",
  );

  console.log("community_resource_semantic_integrity_contract_proof: ok");
}

await main();
