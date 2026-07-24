import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

const TARGET_TRACE_ID = "wn73t3pvg8ptm3an9k23kt9mks8ag47r";
const TARGET_COMMUNITY_ID = "jx79acjdeqyyntt2twy94f50a982vmpj";
const TARGET_SOURCE_REF =
  "community_compiler_digest_signal:v1:2026-07-14:chat_activity:interaction_root:j97x0254crfzdtfvz229cwh7c589hc15_interaction_root:j97rx1kqfp943690gvs312zdr589gfn9_interaction_reply:j57tyk09d0t95as4ftqebhy85x89n6gx_interaction_root:j97wq0423r47gbaj0fb2h30mwx89mfay";
const TARGET_LAST_DIGEST_ID = "xd782kjcsmsp5jcxcmb7degjxs8ahfv2";
const POPULATED_CONFIRMATION =
  "delete_exactly_one_malformed_interaction_trace_from_dev_quick_porcupine_949";
const EMPTY_CONFIRMATION =
  "confirm_malformed_interaction_trace_is_absent_on_dev_quick_porcupine_949";
const SCAN_LIMIT = 501;

function normalizeId(value: unknown): string {
  return String(value ?? "").trim();
}

function requireStaging(): void {
  let deploymentKind = "";
  try {
    deploymentKind = String(
      (globalThis as any)?.process?.env?.POLYNET_DEPLOYMENT_KIND ?? "",
    ).trim();
  } catch {
    // Missing environment evidence must fail closed.
  }
  if (deploymentKind !== "staging") {
    throw new Error("malformed_interaction_trace_drain_staging_only");
  }
}

function containsId(value: unknown): boolean {
  return Array.isArray(value) &&
    value.some((entry) => normalizeId(entry) === TARGET_TRACE_ID);
}

async function inspect(ctx: any) {
  const communityId = ctx.db.normalizeId("communities", TARGET_COMMUNITY_ID);
  const traceId = ctx.db.normalizeId("communitySourceTraces", TARGET_TRACE_ID);
  if (!communityId || !traceId) {
    throw new Error("malformed_interaction_trace_drain_target_identity_invalid");
  }

  const [
    target,
    citations,
    serveRequests,
    nodes,
    edges,
    mutations,
    changeRequests,
    digests,
  ] = await Promise.all([
    ctx.db.get(traceId),
    ctx.db
      .query("communityEvidenceCitations")
      .withIndex("by_sourceTrace", (q: any) => q.eq("sourceTraceId", traceId))
      .take(2),
    ctx.db
      .query("communityAgentServeRequests")
      .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", communityId))
      .take(SCAN_LIMIT),
    ctx.db
      .query("communityIntelligenceNodes")
      .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
      .take(SCAN_LIMIT),
    ctx.db
      .query("communityIntelligenceEdges")
      .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
      .take(SCAN_LIMIT),
    ctx.db
      .query("communityIntelligenceMutations")
      .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", communityId))
      .take(SCAN_LIMIT),
    ctx.db
      .query("communityIntelligenceChangeRequests")
      .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", communityId))
      .take(SCAN_LIMIT),
    ctx.db
      .query("communityCompilerDigests")
      .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", communityId))
      .take(SCAN_LIMIT),
  ]);

  if (
    serveRequests.length >= SCAN_LIMIT ||
    nodes.length >= SCAN_LIMIT ||
    edges.length >= SCAN_LIMIT ||
    mutations.length >= SCAN_LIMIT ||
    changeRequests.length >= SCAN_LIMIT ||
    digests.length >= SCAN_LIMIT
  ) {
    throw new Error("malformed_interaction_trace_drain_scan_limit_exceeded");
  }

  const dependencyCounts = {
    citations: citations.length,
    serve_requests: serveRequests.filter(
      (row: any) => normalizeId(row.sourceTraceId) === TARGET_TRACE_ID,
    ).length,
    nodes: nodes.filter((row: any) => containsId(row.sourceTraceIds)).length,
    edges: edges.filter((row: any) => containsId(row.evidenceTraceIds)).length,
    mutations: mutations.filter((row: any) => containsId(row.sourceTraceIds)).length,
    change_requests: changeRequests.filter(
      (row: any) => containsId(row.sourceTraceIds),
    ).length,
    digest_items: digests.filter(
      (row: any) =>
        Array.isArray(row.items) &&
        row.items.some((item: any) => containsId(item.sourceTraceIds)),
    ).length,
  };

  return { communityId, traceId, target, dependencyCounts };
}

function assertNoDependencies(
  counts: Awaited<ReturnType<typeof inspect>>["dependencyCounts"],
) {
  if (Object.values(counts).some((count) => count !== 0)) {
    throw new Error("malformed_interaction_trace_drain_dependency_blocked");
  }
}

function assertPopulated(inspection: Awaited<ReturnType<typeof inspect>>) {
  const row = inspection.target as any;
  if (
    !row ||
    normalizeId(row._id) !== TARGET_TRACE_ID ||
    normalizeId(row.communityId) !== TARGET_COMMUNITY_ID ||
    row.sourceType !== "interaction" ||
    normalizeId(row.sourceId) !== TARGET_SOURCE_REF ||
    /^interaction:(root|reply):.+$/.test(normalizeId(row.sourceId)) ||
    row.visibilityScope !== "community" ||
    row.sourceVisibility !== "community" ||
    row.actorType !== "compiler" ||
    row.actorUserId !== undefined ||
    row.actorAgentKey !== "community_compiler_digest_v1" ||
    row.compilerGroupKey !== undefined ||
    row.compilerState !== "compiled" ||
    typeof row.compilerPendingSince !== "number" ||
    typeof row.compilerLastHandledAt !== "number" ||
    normalizeId(row.compilerLastDigestId) !== TARGET_LAST_DIGEST_ID ||
    row.compilerDecision !== undefined ||
    (row.artifactIds ?? []).length !== 0 ||
    (row.outcomeObservationIds ?? []).length !== 0
  ) {
    throw new Error("malformed_interaction_trace_drain_populated_fingerprint_mismatch");
  }
  assertNoDependencies(inspection.dependencyCounts);
}

function assertEmpty(inspection: Awaited<ReturnType<typeof inspect>>) {
  if (inspection.target !== null) {
    throw new Error("malformed_interaction_trace_drain_empty_fingerprint_mismatch");
  }
  assertNoDependencies(inspection.dependencyCounts);
}

function summary(inspection: Awaited<ReturnType<typeof inspect>>) {
  return {
    target_present: Boolean(inspection.target),
    target_trace_id: TARGET_TRACE_ID,
    dependency_counts: inspection.dependencyCounts,
  };
}

export const drainMalformedCommunityInteractionTraceInternal = internalMutation({
  args: {
    expectedState: v.union(v.literal("populated"), v.literal("empty")),
    commit: v.boolean(),
    confirmation: v.string(),
  },
  handler: async (ctx, args) => {
    requireStaging();
    const beforeInspection = await inspect(ctx);
    if (args.expectedState === "populated") {
      if (args.confirmation !== POPULATED_CONFIRMATION) {
        throw new Error("malformed_interaction_trace_drain_confirmation_invalid");
      }
      assertPopulated(beforeInspection);
    } else {
      if (args.confirmation !== EMPTY_CONFIRMATION) {
        throw new Error("malformed_interaction_trace_drain_confirmation_invalid");
      }
      assertEmpty(beforeInspection);
    }

    const before = summary(beforeInspection);
    if (!args.commit) {
      return { ok: true, committed: false, deleted: 0, before };
    }
    if (beforeInspection.target) await ctx.db.delete(beforeInspection.traceId);

    const afterInspection = await inspect(ctx);
    assertEmpty(afterInspection);
    return {
      ok: true,
      committed: true,
      deleted: beforeInspection.target ? 1 : 0,
      before,
      after: summary(afterInspection),
    };
  },
});
