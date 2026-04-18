import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import {
  abortAllScopedRequests, beginScopedAbortRequest, finishScopedAbortRequest, isAbortError, } from "./communityFetchAbortScope";

import { listCloudCommunityMembershipRows } from "./cloudCommunityMembershipGateway";
import { listCloudProfileRowsByUserIds } from "./cloudProfilesGateway";
import { preloadImageUrls } from "./preloadImageUrls";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";

type UseWebCommunityAccessControllerArgs<SessionT, CommunityRecordT, UserProfileT> = {
  toCanonicalCommunityVisibility: (
    value: unknown,
    fallback?: "published" | "unlisted",
  ) => "published" | "unlisted";

  activeCommunitySlug: string | null;
  loadingResetKey?: string | null;
  setIsLoadingCommunities: Dispatch<SetStateAction<boolean>>;
  setHasResolvedCommunities: Dispatch<SetStateAction<boolean>>;
  setCommunityRoleById: Dispatch<SetStateAction<Record<string, string>>>;
  setCommunities: Dispatch<SetStateAction<CommunityRecordT[]>>;
  applyCommunityShellState: (opts: { communitySlug?: string | null }) => void;

  setProfilesByUserId: Dispatch<SetStateAction<Record<string, UserProfileT>>>;
  ensureSession?: EnsureSessionFn<SessionT>;
};

export function useWebCommunityAccessController<
  SessionT,
  CommunityRecordT extends { id: string; slug?: string | null; visibility: string },
  UserProfileT extends { user_id: string },
>(args: UseWebCommunityAccessControllerArgs<SessionT, CommunityRecordT, UserProfileT>) {
  const argsRef = useRef(args);
  argsRef.current = args;
  const fetchAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const loadCommunitiesSeqRef = useRef(0);
  const hasCompletedInitialLoadRef = useRef(false);

  useEffect(() => {
    hasCompletedInitialLoadRef.current = false;
  }, [args.loadingResetKey]);

  const loadCommunities = useCallback(async (session: SessionT): Promise<void> => {
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(session, current.ensureSession);
    if (!usableSession) return;
    const seq = (loadCommunitiesSeqRef.current += 1);
    const fetchController = beginScopedAbortRequest({
      inFlightByKind: fetchAbortControllersRef.current,
      kind: "community_access_list",
    });
    const shouldShowLoading = !hasCompletedInitialLoadRef.current;
    try {
      if (shouldShowLoading) {
        current.setIsLoadingCommunities(true);
      }
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
      void preloadImageUrls(
        list.flatMap((community: any) => [community?.avatar_url ?? null, community?.banner_url ?? null]),
        { maxUrls: 12, timeoutMs: 1500 },
      ).catch(() => {
        // Ignore image warmup failures; community access state should not wait on them.
      });
      if (!current.activeCommunitySlug) {
        const nextCommunitySlug = String(list[0]?.slug ?? "").trim() || null;
        if (nextCommunitySlug) current.applyCommunityShellState({ communitySlug: nextCommunitySlug });
        return;
      }
      if (!list.some((item) => String(item.slug ?? "").trim() === current.activeCommunitySlug) && list.length > 0) {
        const nextCommunitySlug = String(list[0]?.slug ?? "").trim() || null;
        if (nextCommunitySlug) current.applyCommunityShellState({ communitySlug: nextCommunitySlug });
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
        hasCompletedInitialLoadRef.current = true;
        current.setIsLoadingCommunities(false);
        current.setHasResolvedCommunities(true);
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
      await preloadImageUrls(
        profiles.map((profile: any) => profile?.avatar_url ?? null),
        { maxUrls: unique.length, timeoutMs: 1200 },
      );
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
