import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";

import {
  approveCloudCommunityJoinRequest,
  denyCloudCommunityJoinRequest,
  listCloudCommunityJoinRequestRows,
  listCloudCommunityPricingRows,
  setCloudCommunityFreeJoinRequiresApproval,
} from "./cloudCommunityAdminGateway";

type SessionLike = {
  user: {
    id: string;
  };
};

type JoinRequestLike = {
  id: string;
  user_id: string;
};

type CommunityLike = {
  id: string;
  free_join_requires_approval: boolean;
  updated_at: string;
};

type CommunityPricingRow = {
  billing_period?: string;
};

type UseCommunityMembersReviewControllerArgs<
  SessionT extends SessionLike,
  JoinRequestT extends JoinRequestLike,
  CommunityT extends CommunityLike,
> = {
  activeCommunityId: string | null;
  session: SessionT | null;
  canManageMembersActiveCommunity: boolean;
  isSavingFreeJoinRequiresApproval: boolean;
  loadUserProfiles: (userIds: string[], session: SessionT) => Promise<void> | void;
  loadCommunityMembers: (
    communityId: string,
    session: SessionT,
    opts?: { includeStatus?: boolean },
  ) => Promise<void> | void;
  setCommunities: Dispatch<SetStateAction<CommunityT[]>>;
  setCommunityJoinRequests: Dispatch<SetStateAction<JoinRequestT[]>>;
  setIsLoadingCommunityJoinRequests: Dispatch<SetStateAction<boolean>>;
  setCommunityJoinRequestsError: Dispatch<SetStateAction<string | null>>;
  setDecidingCommunityJoinRequestId: Dispatch<SetStateAction<string | null>>;
  setIsSavingFreeJoinRequiresApproval: Dispatch<SetStateAction<boolean>>;
};

export function useCommunityMembersReviewController<
  SessionT extends SessionLike,
  JoinRequestT extends JoinRequestLike,
  CommunityT extends CommunityLike,
>(
  args: UseCommunityMembersReviewControllerArgs<SessionT, JoinRequestT, CommunityT>,
) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const loadCommunityJoinRequests = useCallback(async (communityId: string, session: SessionT) => {
    const current = argsRef.current;
    current.setIsLoadingCommunityJoinRequests(true);
    current.setCommunityJoinRequestsError(null);
    try {
      const rows = await listCloudCommunityJoinRequestRows<SessionT, JoinRequestT>({
        session,
        communityId,
      });
      const normalizedRows = Array.isArray(rows) ? rows : [];
      current.setCommunityJoinRequests(normalizedRows);
      const userIds = Array.from(new Set(normalizedRows.map((row) => row.user_id)));
      await current.loadUserProfiles(userIds, session);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to load join requests.";
      current.setCommunityJoinRequests([]);
      current.setCommunityJoinRequestsError(message);
    } finally {
      current.setIsLoadingCommunityJoinRequests(false);
    }
  }, []);

  const loadCommunityHasPaidPlans = useCallback(async (communityId: string, session: SessionT): Promise<boolean> => {
    const rows = await listCloudCommunityPricingRows<SessionT, CommunityPricingRow>({
      session,
      communityId,
    });
    return rows.length > 0;
  }, []);

  const handleApproveCommunityJoinRequest = useCallback(async (requestId: string) => {
    const current = argsRef.current;
    const communityId = current.activeCommunityId;
    const session = current.session;
    if (!session || !communityId) return;
    current.setCommunityJoinRequestsError(null);
    current.setDecidingCommunityJoinRequestId(requestId);
    try {
      await approveCloudCommunityJoinRequest({
        session,
        requestId,
      });
      await Promise.all([
        current.loadCommunityMembers(communityId, session, { includeStatus: current.canManageMembersActiveCommunity }),
        loadCommunityJoinRequests(communityId, session),
      ]);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to approve request.";
      current.setCommunityJoinRequestsError(message);
    } finally {
      current.setDecidingCommunityJoinRequestId(null);
    }
  }, [loadCommunityJoinRequests]);

  const handleDenyCommunityJoinRequest = useCallback(async (requestId: string) => {
    const current = argsRef.current;
    const communityId = current.activeCommunityId;
    const session = current.session;
    if (!session || !communityId) return;
    current.setCommunityJoinRequestsError(null);
    current.setDecidingCommunityJoinRequestId(requestId);
    try {
      await denyCloudCommunityJoinRequest({
        session,
        requestId,
      });
      await loadCommunityJoinRequests(communityId, session);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to deny request.";
      current.setCommunityJoinRequestsError(message);
    } finally {
      current.setDecidingCommunityJoinRequestId(null);
    }
  }, [loadCommunityJoinRequests]);

  const handleSetCommunityFreeJoinRequiresApproval = useCallback(async (nextRequiresApproval: boolean) => {
    const current = argsRef.current;
    const communityId = current.activeCommunityId;
    const session = current.session;
    if (!session || !communityId) return;
    if (current.isSavingFreeJoinRequiresApproval) return;
    current.setCommunityJoinRequestsError(null);
    current.setIsSavingFreeJoinRequiresApproval(true);
    try {
      const row = await setCloudCommunityFreeJoinRequiresApproval({
        session,
        communityId,
        requiresApproval: nextRequiresApproval,
      });
      const updatedCommunityId = typeof row?.community_id === "string" ? row.community_id : communityId;
      const updatedRequiresApproval =
        typeof row?.free_join_requires_approval === "boolean" ? row.free_join_requires_approval : nextRequiresApproval;
      const updatedAt = typeof row?.updated_at === "string" ? row.updated_at : null;

      current.setCommunities((prev) =>
        prev.map((community) =>
          community.id === updatedCommunityId
            ? {
                ...community,
                free_join_requires_approval: updatedRequiresApproval,
                updated_at: updatedAt ?? community.updated_at,
              }
            : community,
        ),
      );

      if (updatedRequiresApproval) {
        await loadCommunityJoinRequests(updatedCommunityId, session);
      } else {
        current.setCommunityJoinRequestsError(null);
        current.setDecidingCommunityJoinRequestId(null);
      }
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to update join approvals.";
      current.setCommunityJoinRequestsError(message);
    } finally {
      current.setIsSavingFreeJoinRequiresApproval(false);
    }
  }, [loadCommunityJoinRequests]);

  return {
    loadCommunityHasPaidPlans,
    loadCommunityJoinRequests,
    handleApproveCommunityJoinRequest,
    handleDenyCommunityJoinRequest,
    handleSetCommunityFreeJoinRequiresApproval,
  };
}
