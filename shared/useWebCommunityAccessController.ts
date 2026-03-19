import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import {
  abortAllScopedRequests, beginScopedAbortRequest, finishScopedAbortRequest, isAbortError, } from "./communityFetchAbortScope";

import { listCloudCommunityMembershipRows } from "./cloudCommunityMembershipGateway";
import { listCloudProfileRowsByUserIds } from "./cloudProfilesGateway";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";

type UseWebCommunityAccessControllerArgs<SessionT, CommunityRecordT, UserProfileT> = {
  toCanonicalCommunityVisibility: (
    value: unknown,
    fallback?: "published" | "unlisted",
  ) => "published" | "unlisted";

  activeCommunityId: string | null;
  setIsLoadingCommunities: Dispatch<SetStateAction<boolean>>;
  setCommunityRoleById: Dispatch<SetStateAction<Record<string, string>>>;
  setCommunities: Dispatch<SetStateAction<CommunityRecordT[]>>;
  setActiveCommunityId: Dispatch<SetStateAction<string | null>>;

  setProfilesByUserId: Dispatch<SetStateAction<Record<string, UserProfileT>>>;
  ensureSession?: EnsureSessionFn<SessionT>;
};

export function useWebCommunityAccessController<
  SessionT,
  CommunityRecordT extends { id: string; visibility: string },
  UserProfileT extends { user_id: string },
>(args: UseWebCommunityAccessControllerArgs<SessionT, CommunityRecordT, UserProfileT>) {
  const argsRef = useRef(args);
  argsRef.current = args;
  const fetchAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const loadCommunitiesSeqRef = useRef(0);

  const loadCommunities = useCallback(async (session: SessionT): Promise<void> => {
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(session, current.ensureSession);
    if (!usableSession) return;
    const seq = (loadCommunitiesSeqRef.current += 1);
    const fetchController = beginScopedAbortRequest({
      inFlightByKind: fetchAbortControllersRef.current,
      kind: "community_access_list",
    });
    try {
      current.setIsLoadingCommunities(true);
      const rows = await listCloudCommunityMembershipRows<SessionT, CommunityRecordT>({
        session: usableSession,
        selectMode: "full",
        init: { signal: fetchController.signal },
      });
      const typedRows = rows as Array<{
        community_id: string;
        role: string;
        communities: CommunityRecordT;
      }>;
      const roleMap: Record<string, string> = {};
      for (const row of typedRows) {
        if (row.community_id) roleMap[row.community_id] = row.role;
      }
      current.setCommunityRoleById(roleMap);

      const list = typedRows
        .map((row) => row.communities)
        .filter(Boolean)
        .map((community) => ({
          ...community,
          visibility: current.toCanonicalCommunityVisibility(community.visibility, "unlisted"),
        }));
      current.setCommunities(list);
      if (!current.activeCommunityId) {
        if (list.length > 0) current.setActiveCommunityId(list[0].id);
        return;
      }
      if (!list.some((item) => item.id === current.activeCommunityId) && list.length > 0) {
        current.setActiveCommunityId(list[0].id);
      }
    } catch (error) {
      if (isAbortError(error)) return;
      console.warn("Failed to load communities:", error);
    } finally {
      finishScopedAbortRequest({
        inFlightByKind: fetchAbortControllersRef.current,
        kind: "community_access_list",
        controller: fetchController,
      });
      if (loadCommunitiesSeqRef.current === seq) {
        current.setIsLoadingCommunities(false);
      }
    }
  }, []);

  const loadUserProfiles = useCallback(async (userIds: string[], session: SessionT): Promise<void> => {
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(session, current.ensureSession);
    if (!usableSession) return;
    const unique = Array.from(new Set(userIds.map((id) => id.trim()).filter(Boolean)));
    if (unique.length === 0) return;
    try {
      const profiles = (await listCloudProfileRowsByUserIds<SessionT>({
        session: usableSession,
        userIds: unique,
      })) as unknown as UserProfileT[];
      if (profiles.length === 0) return;
      current.setProfilesByUserId((prev) => {
        const next = { ...prev };
        for (const profile of profiles) {
          next[profile.user_id] = profile;
        }
        return next;
      });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    return () => {
      abortAllScopedRequests(fetchAbortControllersRef.current);
    };
  }, []);

  return {
    loadCommunities,
    loadUserProfiles,
  };
}
