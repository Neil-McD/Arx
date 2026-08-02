import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";

import { listCloudCommunityMembershipRows } from "./cloudCommunityMembershipGateway";
import { listCloudProfileRowsByUserIds } from "./cloudProfilesGateway";
import { mergeUserProfileEntries } from "./userProfileMerge";
import { preloadImageUrls } from "./preloadImageUrls";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";
import { formatWorkspaceRestoreErrorMessage } from "./appErrorMappings";

type UseWebCommunityAccessControllerArgs<SessionT, CommunityRecordT, UserProfileT> = {
  toCanonicalCommunityVisibility: (
    value: unknown,
    fallback?: "published" | "unlisted",
  ) => "published" | "unlisted";

  activeCommunitySlug: string | null;
  loadingResetKey?: string | null;
  setIsLoadingCommunities: Dispatch<SetStateAction<boolean>>;
  setHasResolvedCommunities: Dispatch<SetStateAction<boolean>>;
  setCommunities: Dispatch<SetStateAction<CommunityRecordT[]>>;
  applyCommunityShellState: (opts: { communitySlug?: string | null }) => void;

  setProfilesByUserId: Dispatch<SetStateAction<Record<string, UserProfileT>>>;
  ensureSession?: EnsureSessionFn<SessionT>;
};

type LoadUserProfilesOptions = {
  force?: boolean;
};

export function useWebCommunityAccessController<
  SessionT,
  CommunityRecordT extends { id: string; slug?: string | null; visibility: string },
  UserProfileT extends { user_id: string },
>(args: UseWebCommunityAccessControllerArgs<SessionT, CommunityRecordT, UserProfileT>) {
  const argsRef = useRef(args);
  argsRef.current = args;
  const loadCommunitiesSeqRef = useRef(0);
  const hasCompletedInitialLoadRef = useRef(false);
  const hydratedProfileIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    hasCompletedInitialLoadRef.current = false;
    hydratedProfileIdsRef.current = new Set();
  }, [args.loadingResetKey]);

  const loadCommunities = useCallback(async (session: SessionT): Promise<void> => {
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(session, current.ensureSession);
    if (!usableSession) return;
    const seq = (loadCommunitiesSeqRef.current += 1);
    const shouldShowLoading = !hasCompletedInitialLoadRef.current;
    try {
      if (shouldShowLoading) {
        current.setIsLoadingCommunities(true);
      }
      const rows = await listCloudCommunityMembershipRows<SessionT, CommunityRecordT>({
        session: usableSession,
        selectMode: "full",
      });
      if (loadCommunitiesSeqRef.current !== seq) return;
      const typedRows = rows as Array<{
        communities: CommunityRecordT;
      }>;
      const list = typedRows
        .map((row) => row.communities)
        .filter(Boolean)
        .map((community) => ({
          ...community,
          visibility: current.toCanonicalCommunityVisibility(community.visibility, "unlisted"),
        }));
      await preloadImageUrls(
        list.flatMap((community: any) => [community?.avatar_url ?? null, community?.banner_url ?? null]),
        { maxUrls: 12, timeoutMs: 1500 },
      );
      if (loadCommunitiesSeqRef.current !== seq) return;
      current.setCommunities(list);
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
      console.warn(
        "Failed to load communities:",
        formatWorkspaceRestoreErrorMessage(error, "Couldn't load your communities right now."),
      );
    } finally {
      if (loadCommunitiesSeqRef.current === seq) {
        hasCompletedInitialLoadRef.current = true;
        current.setIsLoadingCommunities(false);
        current.setHasResolvedCommunities(true);
      }
    }
  }, []);

  const loadUserProfiles = useCallback(async (
    userIds: string[],
    session: SessionT,
    options: LoadUserProfilesOptions = {},
  ): Promise<void> => {
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(session, current.ensureSession);
    if (!usableSession) return;
    const unique = Array.from(new Set(userIds.map((id) => id.trim()).filter(Boolean)));
    const idsToFetch = options.force
      ? unique
      : unique.filter((id) => !hydratedProfileIdsRef.current.has(id));
    if (idsToFetch.length === 0) return;
    try {
      const profiles = (await listCloudProfileRowsByUserIds<SessionT>({
        session: usableSession,
        userIds: idsToFetch,
      })) as unknown as UserProfileT[];
      for (const id of idsToFetch) {
        hydratedProfileIdsRef.current.add(id);
      }
      if (profiles.length === 0) return;
      await preloadImageUrls(
        profiles.map((profile: any) => profile?.avatar_url ?? null),
        { maxUrls: profiles.length, timeoutMs: 1200 },
      );
      current.setProfilesByUserId((prev) => mergeUserProfileEntries(prev, profiles));
    } catch {
      // ignore
    }
  }, []);

  return {
    loadCommunities,
    loadUserProfiles,
  };
}
