/* Member ontology public surface — docs/member-ontology-contract-v1.md.
   Members approve facts, agents propose facts, admins transition nothing.
   Every read goes through readMemberFactsForLens (the shared predicate). */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { communityMembershipRowIsActive } from "./communityCore";
import {
  insertMemberFacts,
  loadMemberAccountContext,
  readMemberFactsForLens,
  readMemberSpine,
  transitionMemberFactConsent,
  type MemberFactRow,
} from "./memberOntologyCore";
import { renderMemberContextMarkdown } from "../shared/memberContextMarkdown";

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

async function loadActiveMembership(ctx: any, communityId: any, userId: any) {
  const membership = await ctx.db
    .query("communityMemberships")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", communityId).eq("userId", userId))
    .first();
  return membership && communityMembershipRowIsActive(membership) ? membership : null;
}

async function hasPendingJoinRequest(ctx: any, communityId: any, userId: any): Promise<boolean> {
  const request = await ctx.db
    .query("communityJoinRequests")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", communityId).eq("userId", userId))
    .first();
  return Boolean(request && request.status === "pending");
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

/* Platform-scoped facts the member typed into the bridge (social links). */
export const recordStatedBridgeFacts = mutation({
  args: {
    authSubject: v.optional(v.string()),
    links: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const drafts = args.links
      .map((link) => String(link ?? "").trim())
      .filter(Boolean)
      .map((link) => ({ kind: "link" as const, body: link, provenance: "stated_bridge" as const }));
    if (drafts.length === 0) return { inserted: 0 };
    const insertedIds = await insertMemberFacts(ctx, {
      userId,
      communityId: null,
      drafts,
      createdByActorType: "member",
      createdByUserId: userId,
      nowMs: Date.now(),
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

/* "Who is @handle?" — the narrowest lens. Both viewer and subject must hold
   ACTIVE memberships in the shared community: when a membership ends, this
   read returns nothing for that community (retention-on-leave invariant —
   the founder lens, not this one, retains). */
export const getMemberOrientation = query({
  args: {
    authSubject: v.optional(v.string()),
    subjectUserId: v.id("users"),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const viewerUserId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const isSelf = String(viewerUserId) === String(args.subjectUserId);
    if (!isSelf) {
      const viewerMembership = await loadActiveMembership(ctx, args.communityId, viewerUserId);
      const subjectMembership = await loadActiveMembership(ctx, args.communityId, args.subjectUserId);
      if (!viewerMembership || !subjectMembership) {
        throw new Error("member_orientation_membership_required");
      }
    }
    const facts = await readMemberFactsForLens(ctx, {
      subjectUserId: args.subjectUserId,
      lens: isSelf
        ? { kind: "self" }
        : { kind: "member_orientation", communityId: String(args.communityId) },
    });
    const spine = await readMemberSpine(ctx, args.subjectUserId);
    return {
      subject_user_id: String(args.subjectUserId),
      spine,
      facts: facts.map(mapFactForOutput),
    };
  },
});

/* The exact artifact slice 5 injects into the guide's context, and the same
   one the member sees as "what Polynet knows about me". Self lens. */
export const getMyMemberContextMarkdown = query({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.optional(v.id("communities")),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const [account, facts, community] = await Promise.all([
      loadMemberAccountContext(ctx, userId, Date.now()),
      readMemberFactsForLens(ctx, { subjectUserId: userId, lens: { kind: "self" } }),
      args.communityId ? ctx.db.get(args.communityId) : Promise.resolve(null),
    ]);
    const rendered = renderMemberContextMarkdown({
      account,
      facts,
      lens: { kind: "self" },
      communityId: args.communityId ? String(args.communityId) : null,
      communityName: community?.name ?? null,
    });
    return {
      member_md: rendered.memberMd,
      community_md: rendered.communityMd,
    };
  },
});

export const getMyMemberFacts = query({
  args: {
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const facts = await readMemberFactsForLens(ctx, {
      subjectUserId: userId,
      lens: { kind: "self" },
    });
    const spine = await readMemberSpine(ctx, userId);
    return { spine, facts: facts.map(mapFactForOutput) };
  },
});
