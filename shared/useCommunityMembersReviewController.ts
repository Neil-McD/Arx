import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";

import {
  approveCloudCommunityJoinRequest,
  denyCloudCommunityJoinRequest,
  listCloudCommunityJoinRequestRows,
  setCloudCommunityFreeAccessMode,
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
  entry_policy?: "open" | "approval" | "paid_unlock" | "paid_subscription" | null;
  updated_at: string;
};

type UseCommunityMembersReviewControllerArgs<
  SessionT extends SessionLike,
  JoinRequestT extends JoinRequestLike,
  CommunityT extends CommunityLike,
> = {
  activeCommunityId: string | null;
  session: SessionT | null;
  canManageMembersActiveCommunity: boolean;
  isSavingFreeAccessMode: boolean;
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
  setIsSavingFreeAccessMode: Dispatch<SetStateAction<boolean>>;
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

  const handleSetCommunityFreeAccessMode = useCallback(async (nextMode: "open" | "approval") => {
    const current = argsRef.current;
    const communityId = current.activeCommunityId;
    const session = current.session;
    if (!session || !communityId) return;
    if (current.isSavingFreeAccessMode) return;
    current.setCommunityJoinRequestsError(null);
    current.setIsSavingFreeAccessMode(true);
    try {
      const row = await setCloudCommunityFreeAccessMode({
        session,
        communityId,
        mode: nextMode,
      });
      const updatedCommunityId = typeof row?.community_id === "string" ? row.community_id : communityId;
      const updatedEntryPolicy =
        row?.entry_policy === "approval" ||
        row?.entry_policy === "open" ||
        row?.entry_policy === "paid_unlock" ||
        row?.entry_policy === "paid_subscription"
          ? row.entry_policy
          : nextMode;
      const updatedAt = typeof row?.updated_at === "string" ? row.updated_at : null;

      current.setCommunities((prev) =>
        prev.map((community) =>
          community.id === updatedCommunityId
            ? {
                ...community,
                entry_policy: updatedEntryPolicy,
                updated_at: updatedAt ?? community.updated_at,
              }
            : community,
        ),
      );

      if (updatedEntryPolicy === "approval") {
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
      current.setIsSavingFreeAccessMode(false);
    }
  }, [loadCommunityJoinRequests]);

  return {
    loadCommunityJoinRequests,
    handleApproveCommunityJoinRequest,
    handleDenyCommunityJoinRequest,
    handleSetCommunityFreeAccessMode,
  };
}
