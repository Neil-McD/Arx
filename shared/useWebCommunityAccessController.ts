import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";

import { listCloudCommunityMembershipRows } from "./cloudCommunityMembershipGateway";
import { listCloudProfileRowsByUserIds } from "./cloudProfilesGateway";
import { mergeUserProfileEntries } from "./userProfileMerge";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";
import { formatWorkspaceRestoreErrorMessage } from "./appErrorMappings";
import {
  beginProfileHydrationRequest,
  createProfileHydrationRequestRegistry,
  finishProfileHydrationRequest,
} from "./profileHydrationRequestRegistry";

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
  const profileRequestRegistryRef = useRef(createProfileHydrationRequestRegistry());

  useEffect(() => {
    loadCommunitiesSeqRef.current += 1;
    hasCompletedInitialLoadRef.current = false;
    profileRequestRegistryRef.current = createProfileHydrationRequestRegistry();
  }, [args.loadingResetKey]);

  const loadCommunities = useCallback(async (session: SessionT): Promise<void> => {
    const usableSession = await resolveUsableSession(
      session,
      argsRef.current.ensureSession,
    );
    if (!usableSession) return;
    const current = argsRef.current;
    const requestScope = String(current.loadingResetKey ?? "");
    const seq = (loadCommunitiesSeqRef.current += 1);
    const isCurrentRequest = () => (
      loadCommunitiesSeqRef.current === seq &&
      String(argsRef.current.loadingResetKey ?? "") === requestScope
    );
    const shouldShowLoading = !hasCompletedInitialLoadRef.current;
    try {
      if (shouldShowLoading) {
        current.setIsLoadingCommunities(true);
      }
      const rows = await listCloudCommunityMembershipRows<SessionT, CommunityRecordT>({
        session: usableSession,
        selectMode: "full",
      });
      if (!isCurrentRequest()) return;
      const typedRows = rows as Array<{
        community_id: string;
        role: string;
        communities: CommunityRecordT;
      }>;
      const roleMap: Record<string, string> = {};
      for (const row of typedRows) {
        if (row.community_id) roleMap[row.community_id] = row.role;
      }

      const list = typedRows
        .map((row) => row.communities)
        .filter(Boolean)
        .map((community) => ({
          ...community,
          visibility: current.toCanonicalCommunityVisibility(community.visibility, "unlisted"),
        }));
      if (!isCurrentRequest()) return;
      const latest = argsRef.current;
      latest.setCommunityRoleById(roleMap);
      latest.setCommunities(list);
      if (!latest.activeCommunitySlug) {
        const nextCommunitySlug = String(list[0]?.slug ?? "").trim() || null;
        if (nextCommunitySlug) latest.applyCommunityShellState({ communitySlug: nextCommunitySlug });
        return;
      }
      if (!list.some((item) => String(item.slug ?? "").trim() === latest.activeCommunitySlug) && list.length > 0) {
        const nextCommunitySlug = String(list[0]?.slug ?? "").trim() || null;
        if (nextCommunitySlug) latest.applyCommunityShellState({ communitySlug: nextCommunitySlug });
      }
    } catch (error) {
      if (isCurrentRequest()) {
        console.warn(
          "Failed to load communities:",
          formatWorkspaceRestoreErrorMessage(error, "Couldn't load your communities right now."),
        );
      }
    } finally {
      if (isCurrentRequest()) {
        hasCompletedInitialLoadRef.current = true;
        argsRef.current.setIsLoadingCommunities(false);
        argsRef.current.setHasResolvedCommunities(true);
      }
    }
  }, []);

  const loadUserProfiles = useCallback(async (
    userIds: string[],
    session: SessionT,
    options: LoadUserProfilesOptions = {},
  ): Promise<void> => {
    const usableSession = await resolveUsableSession(
      session,
      argsRef.current.ensureSession,
    );
    if (!usableSession) return;
    const current = argsRef.current;
    const requestScope = String(current.loadingResetKey ?? "");
    const registry = profileRequestRegistryRef.current;
    const request = beginProfileHydrationRequest(registry, userIds, options);
    if (!request) return;
    try {
      const profiles = (await listCloudProfileRowsByUserIds<SessionT>({
        session: usableSession,
        userIds: request.userIds,
      })) as unknown as UserProfileT[];
      if (
        profileRequestRegistryRef.current !== registry ||
        String(argsRef.current.loadingResetKey ?? "") !== requestScope
      ) {
        return;
      }
      const currentUserIds = finishProfileHydrationRequest(
        registry,
        request,
        { successful: true },
      );
      const currentProfiles = profiles.filter((profile) => (
        currentUserIds.has(String(profile.user_id ?? "").trim())
      ));
      if (currentProfiles.length === 0) return;
      argsRef.current.setProfilesByUserId((prev) => (
        mergeUserProfileEntries(prev, currentProfiles)
      ));
    } catch {
      if (
        profileRequestRegistryRef.current === registry &&
        String(argsRef.current.loadingResetKey ?? "") === requestScope
      ) {
        finishProfileHydrationRequest(registry, request, { successful: false });
      }
    }
  }, []);

  return {
    loadCommunities,
    loadUserProfiles,
  };
}
