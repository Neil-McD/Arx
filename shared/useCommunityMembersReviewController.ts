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

function isCommunityJoinRequestAlreadyDecidedError(error: unknown): boolean {
  return readCommunityJoinRequestErrorText(error)
    .toLowerCase()
    .includes("join_request_already_decided");
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
  const loadGenerationRef = useRef(0);
  const decisionGenerationRef = useRef(0);
  const activeDecisionRef = useRef<{
    communityId: string;
    requestId: string;
    token: number;
  } | null>(null);

  const resetCommunityJoinRequests = useCallback(() => {
    loadGenerationRef.current += 1;
    decisionGenerationRef.current += 1;
    activeDecisionRef.current = null;
    const current = argsRef.current;
    current.setCommunityJoinRequests([]);
    current.setIsLoadingCommunityJoinRequests(false);
    current.setCommunityJoinRequestsError(null);
    current.setDecidingCommunityJoinRequestId(null);
  }, []);

  const loadCommunityJoinRequests = useCallback(async (communityId: string, session: SessionT) => {
    const generation = ++loadGenerationRef.current;
    const isCurrentLoad = () =>
      generation === loadGenerationRef.current &&
      argsRef.current.activeCommunityId === communityId;
    if (!isCurrentLoad()) return;
    argsRef.current.setIsLoadingCommunityJoinRequests(true);
    argsRef.current.setCommunityJoinRequestsError(null);
    try {
      const usableSession = await resolveUsableSession(
        session,
        argsRef.current.ensureSession,
      );
      if (!usableSession || !isCurrentLoad()) return;
      const rows = await listCloudCommunityJoinRequestRows<SessionT, JoinRequestT>({
        session: usableSession,
        communityId,
      });
      if (!isCurrentLoad()) return;
      const normalizedRows = Array.isArray(rows) ? rows : [];
      argsRef.current.setCommunityJoinRequests(normalizedRows);
      const userIds = Array.from(new Set(normalizedRows.map((row) => row.user_id)));
      try {
        await argsRef.current.loadUserProfiles(userIds, usableSession);
      } catch {
        // Request review remains usable with the existing display-name fallback.
      }
    } catch (error) {
      if (!isCurrentLoad()) return;
      argsRef.current.setCommunityJoinRequests([]);
      argsRef.current.setCommunityJoinRequestsError(
        formatCommunityJoinRequestError(error, "Failed to load join requests."),
      );
    } finally {
      if (isCurrentLoad()) {
        argsRef.current.setIsLoadingCommunityJoinRequests(false);
      }
    }
  }, []);

  const runCommunityJoinRequestDecision = useCallback(async (
    requestId: string,
    decision: "approve" | "deny",
  ) => {
    const communityId = argsRef.current.activeCommunityId;
    if (!communityId) return;
    if (activeDecisionRef.current?.communityId === communityId) return;
    const token = ++decisionGenerationRef.current;
    activeDecisionRef.current = { communityId, requestId, token };
    const isCurrentDecision = () =>
      activeDecisionRef.current?.token === token &&
      argsRef.current.activeCommunityId === communityId;
    argsRef.current.setCommunityJoinRequestsError(null);
    argsRef.current.setDecidingCommunityJoinRequestId(requestId);
    let session: SessionT | null = null;
    try {
      session = await resolveUsableSession(
        argsRef.current.session,
        argsRef.current.ensureSession,
      );
      if (!session || !isCurrentDecision()) return;
      if (decision === "approve") {
        await approveCloudCommunityJoinRequest({ session, requestId });
      } else {
        await denyCloudCommunityJoinRequest({ session, requestId });
      }
      if (!isCurrentDecision()) return;
      if (decision === "approve") {
        await Promise.all([
          argsRef.current.reloadCommunityDirectoryMembers(communityId, session),
          loadCommunityJoinRequests(communityId, session),
          argsRef.current.onJoinRequestApproved?.({
            communityId,
            requestId,
          }),
        ]);
      } else {
        await loadCommunityJoinRequests(communityId, session);
      }
    } catch (error) {
      if (!isCurrentDecision()) return;
      if (isCommunityJoinRequestAlreadyDecidedError(error) && session) {
        await loadCommunityJoinRequests(communityId, session);
      } else {
        argsRef.current.setCommunityJoinRequestsError(
          formatCommunityJoinRequestError(
            error,
            decision === "approve"
              ? "Failed to approve request."
              : "Failed to deny request.",
          ),
        );
      }
    } finally {
      if (activeDecisionRef.current?.token === token) {
        activeDecisionRef.current = null;
        if (argsRef.current.activeCommunityId === communityId) {
          argsRef.current.setDecidingCommunityJoinRequestId(null);
        }
      }
    }
  }, [loadCommunityJoinRequests]);

  const handleApproveCommunityJoinRequest = useCallback(
    async (requestId: string) => {
      await runCommunityJoinRequestDecision(requestId, "approve");
    },
    [runCommunityJoinRequestDecision],
  );

  const handleDenyCommunityJoinRequest = useCallback(
    async (requestId: string) => {
      await runCommunityJoinRequestDecision(requestId, "deny");
    },
    [runCommunityJoinRequestDecision],
  );

  return {
    resetCommunityJoinRequests,
    loadCommunityJoinRequests,
    handleApproveCommunityJoinRequest,
    handleDenyCommunityJoinRequest,
  };
}
