import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";

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
  entry_policy?: "open" | "approval" | "paid_subscription" | null;
  updated_at: string;
};

function readCommunityJoinRequestErrorText(error: unknown): string {
  if (typeof error === "string") return error.trim();
  if (error instanceof Error) return String(error.message ?? "").trim();
  return "";
}

function formatCommunityJoinRequestError(error: unknown, fallback: string): string {
  const text = readCommunityJoinRequestErrorText(error);
  const normalized = text.toLowerCase();
  if (
    normalized.includes("community_forbidden") ||
    normalized.includes("community_entitlement_required") ||
    normalized.includes("not_entitled")
  ) {
    return "Only community moderators, admins, and owners can review join requests.";
  }
  if (
    normalized.includes("not authenticated") ||
    normalized.includes("authentication") ||
    normalized.includes("user_not_found") ||
    normalized.includes("auth subject")
  ) {
    return "Sign in again to review join requests.";
  }
  if (
    normalized.includes("[request id:") ||
    normalized.includes("server error") ||
    normalized.includes("uncaught error") ||
    normalized.includes("../convex/") ||
    normalized.includes("/convex/") ||
    normalized.includes(" at ")
  ) {
    return fallback;
  }
  return text || fallback;
}

type UseCommunityMembersReviewControllerArgs<
  SessionT extends SessionLike,
  JoinRequestT extends JoinRequestLike,
  CommunityT extends CommunityLike,
> = {
  activeCommunityId: string | null;
  session: SessionT | null;
  ensureSession?: EnsureSessionFn<SessionT>;
  isSavingFreeAccessMode: boolean;
  loadUserProfiles: (userIds: string[], session: SessionT) => Promise<void> | void;
  loadCommunityMembers: (communityId: string, session: SessionT) => Promise<void> | void;
  onJoinRequestApproved?: (params: { communityId: string; requestId: string }) => void;
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
    const usableSession = await resolveUsableSession(session, current.ensureSession);
    if (!usableSession) return;
    current.setIsLoadingCommunityJoinRequests(true);
    current.setCommunityJoinRequestsError(null);
    try {
      const rows = await listCloudCommunityJoinRequestRows<SessionT, JoinRequestT>({
        session: usableSession,
        communityId,
      });
      const normalizedRows = Array.isArray(rows) ? rows : [];
      current.setCommunityJoinRequests(normalizedRows);
      const userIds = Array.from(new Set(normalizedRows.map((row) => row.user_id)));
      await current.loadUserProfiles(userIds, usableSession);
    } catch (error) {
      current.setCommunityJoinRequests([]);
      current.setCommunityJoinRequestsError(
        formatCommunityJoinRequestError(error, "Failed to load join requests."),
      );
    } finally {
      current.setIsLoadingCommunityJoinRequests(false);
    }
  }, []);

  const handleApproveCommunityJoinRequest = useCallback(async (requestId: string) => {
    const current = argsRef.current;
    const communityId = current.activeCommunityId;
    const session = await resolveUsableSession(current.session, current.ensureSession);
    if (!session || !communityId) return;
    current.setCommunityJoinRequestsError(null);
    current.setDecidingCommunityJoinRequestId(requestId);
    try {
      await approveCloudCommunityJoinRequest({
        session,
        requestId,
      });
      await Promise.all([
        current.loadCommunityMembers(communityId, session),
        loadCommunityJoinRequests(communityId, session),
      ]);
      current.onJoinRequestApproved?.({
        communityId,
        requestId,
      });
    } catch (error) {
      current.setCommunityJoinRequestsError(
        formatCommunityJoinRequestError(error, "Failed to approve request."),
      );
    } finally {
      current.setDecidingCommunityJoinRequestId(null);
    }
  }, [loadCommunityJoinRequests]);

  const handleDenyCommunityJoinRequest = useCallback(async (requestId: string) => {
    const current = argsRef.current;
    const communityId = current.activeCommunityId;
    const session = await resolveUsableSession(current.session, current.ensureSession);
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
      current.setCommunityJoinRequestsError(
        formatCommunityJoinRequestError(error, "Failed to deny request."),
      );
    } finally {
      current.setDecidingCommunityJoinRequestId(null);
    }
  }, [loadCommunityJoinRequests]);

  const handleSetCommunityFreeAccessMode = useCallback(async (nextMode: "open" | "approval") => {
    const current = argsRef.current;
    const communityId = current.activeCommunityId;
    const session = await resolveUsableSession(current.session, current.ensureSession);
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
      current.setCommunityJoinRequestsError(
        formatCommunityJoinRequestError(error, "Failed to update join approvals."),
      );
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
