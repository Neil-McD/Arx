import type {
  CommunityArchiveCommandResult,
  CommunityLifecycleManagementRow,
  InactiveCommunityLifecyclePage,
} from "./communityLifecycleManagement";
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

export async function getCloudMyCommunityLifecycleManagementBySlug<SessionT>(
  params: {
    session: SessionT;
    communitySlug: string;
  },
): Promise<CommunityLifecycleManagementRow | null> {
  const { client } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query(
    "communityLifecycleOperations:getMyCommunityLifecycleManagementBySlug" as any,
    { communitySlug: params.communitySlug },
  ) as CommunityLifecycleManagementRow | null;
  return payload;
}

export async function listCloudMyInactiveCommunityLifecycleRows<SessionT>(
  params: {
    session: SessionT;
    lifecycleStatus: "archiving" | "archived";
    cursor?: string | null;
    numItems?: number;
  },
): Promise<InactiveCommunityLifecyclePage> {
  const { client } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query(
    "communityLifecycleOperations:listMyInactiveCommunityLifecycleRows" as any,
    {
      lifecycleStatus: params.lifecycleStatus,
      paginationOpts: {
        cursor: params.cursor ?? null,
        numItems: params.numItems ?? 25,
      },
    },
  ) as {
    items?: unknown;
    continue_cursor?: unknown;
    is_done?: unknown;
  };
  return {
    items: Array.isArray(payload.items)
      ? payload.items as InactiveCommunityLifecyclePage["items"]
      : [],
    continue_cursor:
      typeof payload.continue_cursor === "string"
        ? payload.continue_cursor
        : null,
    is_done: payload.is_done === true,
  };
}

export async function requestCloudMyCommunityArchive<SessionT>(params: {
  session: SessionT;
  communityId: string;
  expectedGeneration: number;
}): Promise<CommunityArchiveCommandResult> {
  const { client } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.mutation(
    "communityLifecycleOperations:requestMyCommunityArchive" as any,
    {
      communityId: params.communityId as any,
      expectedGeneration: params.expectedGeneration,
    },
  ) as CommunityArchiveCommandResult;
}
