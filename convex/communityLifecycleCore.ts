import {
  communityAcceptsNewOperations,
  COMMUNITY_LIFECYCLE_GENERATION_STALE_ERROR,
  communityIsLifecycleProtected,
  communityIsOperational,
  normalizeCommunityLifecycleGeneration,
  normalizeCommunityLifecycleStatus,
  resolveCommunityNewOperationsErrorCode,
  type CommunityLifecycleLike,
} from "../shared/communityLifecycle";

export {
  communityAcceptsNewOperations,
  COMMUNITY_LIFECYCLE_GENERATION_STALE_ERROR,
  communityIsArchived,
  communityIsLifecycleProtected,
  communityIsOperational,
  normalizeCommunityLifecycleGeneration,
  normalizeCommunityLifecycleStatus,
  resolveCommunityNewOperationsErrorCode,
} from "../shared/communityLifecycle";
export type { CommunityLifecycleStatus } from "../shared/communityLifecycle";

type CommunityLifecycleOwnerRow = CommunityLifecycleLike & {
  _id: any;
  ownerId: any;
};

export type CommunityArchiveBeginPlan =
  | {
      mode: "create";
      previousGeneration: number;
      lifecycleGeneration: number;
    }
  | {
      mode: "reuse";
      lifecycleGeneration: number;
    };

export function resolveCommunityArchiveBeginPlan(args: {
  community: CommunityLifecycleLike;
  expectedGeneration: unknown;
}): CommunityArchiveBeginPlan {
  assertCommunityMayBeArchived(args.community);
  const status = normalizeCommunityLifecycleStatus(
    args.community.lifecycleStatus,
  );
  const currentGeneration = normalizeCommunityLifecycleGeneration(
    args.community.lifecycleGeneration,
  );

  if (status === "archived") {
    throw new Error("community_already_archived");
  }
  if (status === "archiving") {
    return {
      mode: "reuse",
      lifecycleGeneration: currentGeneration,
    };
  }

  const expectedGeneration = normalizeCommunityLifecycleGeneration(
    args.expectedGeneration,
  );
  if (expectedGeneration !== currentGeneration) {
    throw new Error("community_archive_generation_stale");
  }
  const lifecycleGeneration = currentGeneration + 1;
  if (!Number.isSafeInteger(lifecycleGeneration)) {
    throw new Error("community_lifecycle_generation_exhausted");
  }
  return {
    mode: "create",
    previousGeneration: currentGeneration,
    lifecycleGeneration,
  };
}

export function requireOperationalCommunity<
  TCommunity extends CommunityLifecycleLike,
>(community: TCommunity): TCommunity {
  if (!communityIsOperational(community)) {
    throw new Error(
      resolveCommunityNewOperationsErrorCode(community) ??
        "community_lifecycle_status_invalid",
    );
  }
  return community;
}

export async function requireOperationalCommunityById<
  TCommunity extends CommunityLifecycleLike = CommunityLifecycleLike,
>(args: {
  ctx: { db: { get: (id: any) => Promise<unknown> } };
  communityId: any;
}): Promise<TCommunity> {
  const community = (await args.ctx.db.get(args.communityId)) as TCommunity | null;
  if (!community) throw new Error("community_not_found");
  return requireOperationalCommunity(community);
}

export function requireActiveCommunity<
  TCommunity extends CommunityLifecycleLike,
>(community: TCommunity): TCommunity {
  if (!communityAcceptsNewOperations(community)) {
    throw new Error(
      resolveCommunityNewOperationsErrorCode(community) ??
        "community_lifecycle_status_invalid",
    );
  }
  return community;
}

export function requireMatchingCommunityLifecycleGeneration(args: {
  community: CommunityLifecycleLike;
  expectedGeneration: unknown;
  errorCode: string;
}): number {
  const currentGeneration = normalizeCommunityLifecycleGeneration(
    args.community.lifecycleGeneration,
  );
  const expectedGeneration = normalizeCommunityLifecycleGeneration(
    args.expectedGeneration,
  );
  if (currentGeneration !== expectedGeneration) {
    throw new Error(args.errorCode);
  }
  return currentGeneration;
}

export function communityAcceptsNewOperationsAtGeneration(args: {
  community: CommunityLifecycleLike | null | undefined;
  expectedGeneration: unknown;
}): boolean {
  if (!args.community) return false;
  try {
    if (!communityAcceptsNewOperations(args.community)) return false;
    return normalizeCommunityLifecycleGeneration(
      args.community.lifecycleGeneration,
    ) === normalizeCommunityLifecycleGeneration(args.expectedGeneration);
  } catch {
    return false;
  }
}

export function resolveCommunityWorkAdmissionErrorCode(args: {
  community: CommunityLifecycleLike | null | undefined;
  expectedGeneration: unknown;
}): string | null {
  if (!args.community) return "community_not_found";
  try {
    const lifecycleError = resolveCommunityNewOperationsErrorCode(args.community);
    if (lifecycleError) return lifecycleError;
    return normalizeCommunityLifecycleGeneration(
      args.community.lifecycleGeneration,
    ) === normalizeCommunityLifecycleGeneration(args.expectedGeneration)
      ? null
      : COMMUNITY_LIFECYCLE_GENERATION_STALE_ERROR;
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "community_lifecycle_status_invalid";
  }
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
