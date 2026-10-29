import { useCallback, useEffect, useRef } from "react";

import type { AuthSession } from "../auth";
import { fetchCloudCommunityMemberBillingHistory } from "../../../../shared/cloudCommunityAdminGateway";
import { setCloudCommunityFreeAccessMode } from "../../../../shared/cloudCommunityAdminGateway";
import type { WebCommunityRecord } from "../webAppContracts";

type EnsureAuthSession = (
  session?: AuthSession | null,
  source?: string,
  options?: { forceRefresh?: boolean },
) => Promise<AuthSession | null>;

export function useWebCommunityMemberManagementController(params: {
  activeCommunityId: string | null;
  canManageMembers: boolean;
  ensureSession: EnsureAuthSession;
  loadDirectoryMembers: (
    communityId: string,
    session: AuthSession,
  ) => Promise<unknown>;
  removeMember: (membershipId: string) => Promise<unknown>;
  banMember: (membershipId: string) => Promise<unknown>;
  setMemberRole: (
    membershipId: string,
    role: "co_creator" | "admin" | "moderator" | "member",
  ) => Promise<unknown>;
  setCommunities: (
    updater: (current: WebCommunityRecord[]) => WebCommunityRecord[],
  ) => void;
  setFreeAccessError: (value: string | null) => void;
  setIsSettingFreeAccess: (value: boolean) => void;
  clearJoinRequests: () => void;
}) {
  const activeCommunityIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeCommunityIdRef.current = params.activeCommunityId;
  }, [params.activeCommunityId]);

  const getActiveCommunity = useCallback(() =>
    activeCommunityIdRef.current ?? params.activeCommunityId,
  [params.activeCommunityId]);

  const loadMemberBillingHistory = useCallback(async (
    membershipId: string,
  ) => {
    const session = await params.ensureSession();
    const communityId = getActiveCommunity();
    if (!session || !communityId) return null;
    return await fetchCloudCommunityMemberBillingHistory({
      session,
      communityId,
      membershipId,
      limit: 20,
    });
  }, [getActiveCommunity, params.ensureSession]);

  const reloadDirectory = useCallback(async () => {
    const session = await params.ensureSession();
    const communityId = getActiveCommunity();
    if (!session || !communityId) return;
    await params.loadDirectoryMembers(communityId, session);
  }, [getActiveCommunity, params.ensureSession, params.loadDirectoryMembers]);

  const setMemberRole = useCallback(async (
    membershipId: string,
    role: "co_creator" | "admin" | "moderator" | "member",
  ) => {
    await params.setMemberRole(membershipId, role);
    await reloadDirectory();
  }, [params.setMemberRole, reloadDirectory]);

  const removeMember = useCallback(async (membershipId: string) => {
    await params.removeMember(membershipId);
    await reloadDirectory();
  }, [params.removeMember, reloadDirectory]);

  const banMember = useCallback(async (membershipId: string) => {
    await params.banMember(membershipId);
    await reloadDirectory();
  }, [params.banMember, reloadDirectory]);

  const setFreeAccessMode = useCallback(async (
    mode: "open" | "approval",
  ) => {
    const session = await params.ensureSession();
    const communityId = getActiveCommunity();
    if (!session || !communityId || !params.canManageMembers) return;
    const isStillActive = () => getActiveCommunity() === communityId;
    params.setFreeAccessError(null);
    params.setIsSettingFreeAccess(true);
    try {
      const result = await setCloudCommunityFreeAccessMode({
        session,
        communityId,
        mode,
      });
      params.setCommunities((current) =>
        current.map((community) =>
          community.id === communityId
            ? {
                ...community,
                entry_policy: result?.entry_policy ?? mode,
                updated_at: result?.updated_at ?? community.updated_at,
              }
            : community,
        ),
      );
      const approvedPendingRequestCount = Math.max(
        0,
        Number(result?.approved_pending_request_count ?? 0) || 0,
      );
      if ((result?.entry_policy ?? mode) !== "approval" && isStillActive()) {
        params.clearJoinRequests();
      }
      if (approvedPendingRequestCount > 0 && isStillActive()) {
        await params.loadDirectoryMembers(communityId, session);
      }
    } catch (error) {
      if (!isStillActive()) return;
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Failed to update auto-join.";
      params.setFreeAccessError(message || "Failed to update auto-join.");
    } finally {
      if (isStillActive()) params.setIsSettingFreeAccess(false);
    }
  }, [
    getActiveCommunity,
    params.canManageMembers,
    params.clearJoinRequests,
    params.ensureSession,
    params.loadDirectoryMembers,
    params.setCommunities,
    params.setFreeAccessError,
    params.setIsSettingFreeAccess,
  ]);

  return {
    loadMemberBillingHistory,
    reloadDirectory,
    setMemberRole,
    removeMember,
    banMember,
    setFreeAccessMode,
  };
}
