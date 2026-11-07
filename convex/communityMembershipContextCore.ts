import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  communityMembershipRowIsActive,
  getUniqueCommunityMembershipByPair,
  requireCommunityChatAccess,
  toIsoString,
} from "./communityCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { readBoundedMemberOrientationFacts } from "./memberOntologyCore";
import type { CommunityMemberSelfContext } from "../shared/communityMemberSelfContext";

// A member's own context in a community, for them (and the agent working for
// them): identity, role, and the facts the community has approved to know.
// Canonical records stay authoritative; nothing here is persisted.
export async function resolveSelfCommunityMembershipContext(args: {
  ctx: QueryCtx;
  actorUserId: Id<"users">;
  communityId: Id<"communities">;
}): Promise<CommunityMemberSelfContext> {
  const { community } = await requireCommunityChatAccess({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.actorUserId,
  });
  const membership = await getUniqueCommunityMembershipByPair({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.actorUserId,
  });
  const isOwner = String(community.ownerId) === String(args.actorUserId);
  const active = communityMembershipRowIsActive(membership) ? membership : null;
  if (!isOwner && !active) throw new Error("community_member_not_found");
  const [profile, factPage] = await Promise.all([
    resolveUserProfileDisplayProjection(args.ctx, args.actorUserId),
    readBoundedMemberOrientationFacts(args.ctx, { subjectUserId: args.actorUserId, communityId: args.communityId }),
  ]);
  return {
    read_at: toIsoString(Date.now()),
    user_id: String(args.actorUserId),
    community_id: String(args.communityId),
    membership_id: active ? String(active._id) : null,
    display_name: profile.display_name ?? "Member",
    role: isOwner ? "owner" : String(membership!.role),
    joined_at: active ? toIsoString(active.activatedAt ?? active.createdAt) : null,
    approved_community_context: factPage.facts
      .map((fact) => ({
        id: String(fact._id),
        kind: fact.kind,
        body: fact.body,
        provenance: fact.provenance,
        created_at: toIsoString(fact.createdAt),
        updated_at: toIsoString(fact.updatedAt),
      }))
      .sort((left, right) => (left.kind === right.kind ? left.body.localeCompare(right.body) : left.kind.localeCompare(right.kind))),
    facts_truncated: factPage.truncated,
  };
}
