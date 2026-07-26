/* Member ontology public surface — docs/member-ontology-contract-v1.md.
   Members approve facts, agents propose facts, admins transition nothing.
   Every read goes through readMemberFactsForLens (the shared predicate). */
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import {
  communityMembershipRowIsActive,
  getUniqueCommunityMembershipByPair,
} from "./communityCore";
import {
  assertCanonicalCommunityJoinRequest,
  getUniqueCommunityJoinRequestByPair,
} from "./communityJoinRequestCore";
import {
  insertMemberFacts,
  loadMemberAccountContext,
  readMemberFactsForLens,
  readMemberSpine,
  transitionMemberFactConsent,
  type MemberFactRow,
} from "./memberOntologyCore";
import {
  buildPolynetProfileFactBatchKey,
  normalizePolynetProfileConfirmInput,
} from "../shared/polynetProfileMcpContract";

const MCP_PROFILE_FACT_LIMIT = 100;
const MCP_PROFILE_MARKER_PREFIX = "external_mcp_profile:";

const factDraftValidator = v.object({
  kind: v.string(),
  body: v.string(),
  provenance: v.string(),
  confidence: v.optional(v.number()),
  evidenceRef: v.optional(v.string()),
});

function mapFactForOutput(row: MemberFactRow) {
  return {
    id: String(row._id),
    community_id: row.communityId ? String(row.communityId) : null,
    kind: row.kind,
    body: row.body,
    provenance: row.provenance,
    consent_state: row.consentState,
    confidence: row.confidence,
    created_at: row.createdAt,
  };
}

function mapAccountForMcp(account: Awaited<ReturnType<typeof loadMemberAccountContext>>) {
  return {
    display_name: account.displayName,
    handle: account.handle,
    tier: account.tier,
    timezone: account.timezone,
    inference_provider: account.inferenceProvider,
    social_links: account.socialLinks,
    memberships: account.memberships.map((membership) => ({
      community_name: membership.communityName,
      role: membership.role,
      access_source: membership.accessSource,
    })),
    owned_communities: account.ownedCommunities.map((community) => ({
      name: community.name,
    })),
  };
}

/* External MCP self-profile bridge. The HTTP provider supplies the verified
   actor's database id; neither function accepts a user or community selector
   from the MCP client. Profile facts are platform scoped by construction. */
export const getMemberProfileForMcpInternal = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const [account, facts, spine] = await Promise.all([
      loadMemberAccountContext(ctx, args.userId, Date.now()),
      readMemberFactsForLens(ctx, {
        subjectUserId: args.userId,
        lens: { kind: "external_profile" },
        scope: { communityId: null },
      }),
      readMemberSpine(ctx, args.userId),
    ]);
    const platformFacts = facts.sort((left, right) => right.updatedAt - left.updatedAt);
    return {
      scope: "platform",
      account: mapAccountForMcp(account),
      spine,
      facts: platformFacts.slice(0, MCP_PROFILE_FACT_LIMIT).map(mapFactForOutput),
      fact_count: platformFacts.length,
      facts_truncated: platformFacts.length > MCP_PROFILE_FACT_LIMIT,
    };
  },
});

export const confirmMemberProfileFactsForMcpInternal = internalMutation({
  args: {
    userId: v.id("users"),
    confirmMarker: v.string(),
    facts: v.array(
      v.object({
        kind: v.string(),
        body: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const normalized = normalizePolynetProfileConfirmInput({
      confirm_marker: args.confirmMarker,
      facts: args.facts,
    });
    if (!normalized.ok) throw new Error(normalized.message);

    const evidenceMarker = `${MCP_PROFILE_MARKER_PREFIX}${normalized.input.confirmMarker}`;
    const existingRows = (await ctx.db
      .query("memberFacts")
      .withIndex("by_user_community", (q: any) =>
        q.eq("userId", args.userId).eq("communityId", undefined),
      )
      .collect()) as MemberFactRow[];
    const priorBatch = existingRows.filter((row) => row.evidenceRefs.includes(evidenceMarker));
    if (priorBatch.length > 0) {
      const priorKey = buildPolynetProfileFactBatchKey(priorBatch);
      const requestedKey = buildPolynetProfileFactBatchKey(normalized.input.facts);
      if (priorKey !== requestedKey) {
        throw new Error("member_profile_confirm_marker_conflict");
      }
      return {
        ok: true,
        scope: "platform",
        inserted: priorBatch.length,
        deduplicated: true,
        fact_ids: priorBatch.map((row) => String(row._id)),
      };
    }

    const nowMs = Date.now();
    const insertedIds = await insertMemberFacts(ctx, {
      userId: args.userId,
      communityId: null,
      drafts: normalized.input.facts.map((fact) => ({
        kind: fact.kind,
        body: fact.body,
        provenance: "stated_interview" as const,
        confidence: 1,
      })),
      createdByActorType: "member",
      createdByUserId: args.userId,
      confirmMarker: evidenceMarker,
      nowMs,
    });
    return {
      ok: true,
      scope: "platform",
      inserted: insertedIds.length,
      deduplicated: false,
      fact_ids: insertedIds,
    };
  },
});

async function loadActiveMembership(ctx: any, communityId: any, userId: any) {
  const membership = await getUniqueCommunityMembershipByPair({
    ctx,
    communityId,
    userId,
  });
  return membership && communityMembershipRowIsActive(membership) ? membership : null;
}

async function hasPendingJoinRequest(ctx: any, communityId: any, userId: any): Promise<boolean> {
  const request = await getUniqueCommunityJoinRequestByPair({
    ctx,
    communityId,
    userId,
  });
  return Boolean(request && assertCanonicalCommunityJoinRequest(request) === "pending");
}

/* The interview confirm card: one batch, one approval marker, community scope.
   Requires the subject to be in motion in that community — an active member,
   or an applicant whose interview rides the pending join request. */
export const confirmMemberInterviewFacts = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    confirmMarker: v.optional(v.string()),
    facts: v.array(factDraftValidator),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const membership = await loadActiveMembership(ctx, args.communityId, userId);
    if (!membership && !(await hasPendingJoinRequest(ctx, args.communityId, userId))) {
      throw new Error("member_fact_membership_required");
    }
    for (const draft of args.facts) {
      if (draft.provenance !== "stated_interview" && draft.provenance !== "form_answer") {
        throw new Error("member_fact_provenance_invalid");
      }
    }
    const nowMs = Date.now();
    const insertedIds = await insertMemberFacts(ctx, {
      userId,
      communityId: args.communityId,
      drafts: args.facts as never,
      createdByActorType: "member",
      createdByUserId: userId,
      confirmMarker: args.confirmMarker ?? `interview:${nowMs}`,
      nowMs,
    });
    return { inserted: insertedIds.length };
  },
});

export const approveMemberFact = mutation({
  args: {
    authSubject: v.optional(v.string()),
    factId: v.id("memberFacts"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    await transitionMemberFactConsent(ctx, {
      factId: args.factId,
      to: "approved",
      actorType: "member",
      actorUserId: userId,
      nowMs: Date.now(),
    });
    return { ok: true };
  },
});

export const retractMemberFact = mutation({
  args: {
    authSubject: v.optional(v.string()),
    factId: v.id("memberFacts"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    await transitionMemberFactConsent(ctx, {
      factId: args.factId,
      to: "retracted",
      actorType: "member",
      actorUserId: userId,
      nowMs: Date.now(),
    });
    return { ok: true };
  },
});
