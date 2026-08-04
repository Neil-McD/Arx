import {
  communityAcceptsNewOperations,
  communityIsLifecycleProtected,
  communityIsOperational,
  normalizeCommunityLifecycleStatus,
  type CommunityLifecycleLike,
} from "../shared/communityLifecycle";

export {
  communityAcceptsNewOperations,
  communityIsArchived,
  communityIsLifecycleProtected,
  communityIsOperational,
  normalizeCommunityLifecycleGeneration,
  normalizeCommunityLifecycleStatus,
} from "../shared/communityLifecycle";
export type { CommunityLifecycleStatus } from "../shared/communityLifecycle";

type CommunityLifecycleOwnerRow = CommunityLifecycleLike & {
  _id: any;
  ownerId: any;
};

export function requireOperationalCommunity<
  TCommunity extends CommunityLifecycleLike,
>(community: TCommunity): TCommunity {
  if (!communityIsOperational(community)) {
    throw new Error("community_archived");
  }
  return community;
}

export function requireActiveCommunity<
  TCommunity extends CommunityLifecycleLike,
>(community: TCommunity): TCommunity {
  if (!communityAcceptsNewOperations(community)) {
    const lifecycleStatus = normalizeCommunityLifecycleStatus(
      community.lifecycleStatus,
    );
    throw new Error(
      lifecycleStatus === "archived"
        ? "community_archived"
        : "community_sunsetting",
    );
  }
  return community;
}

export function assertCommunityMayBeArchived(
  community: CommunityLifecycleLike,
): void {
  if (communityIsLifecycleProtected(community)) {
    throw new Error("community_lifecycle_protected");
  }
}

export async function requireCommunityOwnerAnyLifecycle<
  TCommunity extends CommunityLifecycleOwnerRow = CommunityLifecycleOwnerRow,
>(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<{ community: TCommunity }> {
  const community = (await args.ctx.db.get(
    args.communityId,
  )) as TCommunity | null;
  if (!community) throw new Error("community_not_found");
  if (String(community.ownerId) !== String(args.userId)) {
    throw new Error("community_owner_required");
  }
  return { community };
}
