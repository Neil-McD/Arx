import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";

import {
  approveCloudCommunityJoinRequest,
  denyCloudCommunityJoinRequest,
  listCloudCommunityJoinRequestRows,
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
> = {
  activeCommunityId: string | null;
  session: SessionT | null;
  ensureSession?: EnsureSessionFn<SessionT>;
  loadUserProfiles: (userIds: string[], session: SessionT) => Promise<void> | void;
  reloadCommunityDirectoryMembers: (communityId: string, session: SessionT) => Promise<void> | void;
  onJoinRequestApproved?: (params: { communityId: string; requestId: string }) => Promise<void> | void;
  setCommunityJoinRequests: Dispatch<SetStateAction<JoinRequestT[]>>;
  setIsLoadingCommunityJoinRequests: Dispatch<SetStateAction<boolean>>;
  setCommunityJoinRequestsError: Dispatch<SetStateAction<string | null>>;
  setDecidingCommunityJoinRequestId: Dispatch<SetStateAction<string | null>>;
};

export function useCommunityMembersReviewController<
  SessionT extends SessionLike,
  JoinRequestT extends JoinRequestLike,
>(
  args: UseCommunityMembersReviewControllerArgs<SessionT, JoinRequestT>,
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
        current.reloadCommunityDirectoryMembers(communityId, session),
        loadCommunityJoinRequests(communityId, session),
        current.onJoinRequestApproved?.({
          communityId,
          requestId,
        }),
      ]);
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

  return {
    loadCommunityJoinRequests,
    handleApproveCommunityJoinRequest,
    handleDenyCommunityJoinRequest,
  };
}
