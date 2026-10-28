/* Member ontology public surface — docs/member-ontology-contract-v1.md.
   Members approve facts, agents propose facts, admins transition nothing.
   Every read goes through readMemberFactsForLens (the shared predicate). */
import { v, type ObjectType } from "convex/values";
import { internalMutation, mutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import {
  communityMembershipRowIsActive,
  getUniqueCommunityMembershipByPair,
  requireCommunityUserNotBlocked,
} from "./communityCore";
import {
  assertCanonicalCommunityJoinRequest,
  getCurrentCommunityJoinRequestByPair,
} from "./communityJoinRequestCore";
import {
  insertMemberFacts,
} from "./memberOntologyCore";

const factDraftValidator = v.object({
  kind: v.string(),
  body: v.string(),
  provenance: v.string(),
  confidence: v.optional(v.number()),
  evidenceRef: v.optional(v.string()),
});

/* External MCP self-profile bridge. The HTTP provider supplies the verified
   actor's database id; neither function accepts a user or community selector
   from the MCP client. Profile facts are platform scoped by construction. */

async function loadActiveMembership(ctx: any, communityId: any, userId: any) {
  const membership = await getUniqueCommunityMembershipByPair({
    ctx,
    communityId,
    userId,
  });
  return membership && communityMembershipRowIsActive(membership) ? membership : null;
}

async function hasPendingJoinRequest(ctx: any, communityId: any, userId: any): Promise<boolean> {
  const request = await getCurrentCommunityJoinRequestByPair({
    ctx,
    communityId,
    userId,
  });
  return Boolean(request && assertCanonicalCommunityJoinRequest(request) === "pending");
}

/* The interview confirm card: one batch, one approval marker, community scope.
   Requires the subject to be in motion in that community — an active member,
   or an applicant whose interview rides the pending join request. */
const confirmMemberInterviewFactsArgs = {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    confirmMarker: v.optional(v.string()),
    facts: v.array(factDraftValidator),
  };

async function confirmMemberInterviewFactsHandler(ctx: MutationCtx, args: ObjectType<typeof confirmMemberInterviewFactsArgs>, userId: Id<"users">) {
    await requireCommunityUserNotBlocked({
      ctx,
      communityId: args.communityId,
      userId,
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
}

export const confirmMemberInterviewFacts = mutation({
  args: confirmMemberInterviewFactsArgs,
  handler: async (ctx, args) => await confirmMemberInterviewFactsHandler(ctx, args, await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null })),
});

// For a turn from a community front end: the member was authenticated by the
// front end's session, which has no Convex identity.
export const confirmMemberInterviewFactsForTrustedUserInternal = internalMutation({
  args: { ...confirmMemberInterviewFactsArgs, trustedUserId: v.id("users") },
  handler: async (ctx, { trustedUserId, ...args }) => await confirmMemberInterviewFactsHandler(ctx, args, trustedUserId),
});

/* "Who is @handle?" — the narrowest lens. Both viewer and subject must hold
   ACTIVE memberships in the shared community: when a membership ends, this
   read returns nothing for that community (retention-on-leave invariant —
   the founder lens, not this one, retains). */

/* The exact artifact slice 5 injects into the guide's context, and the same
   one the member sees as "what Polynet knows about me". Self lens. */

