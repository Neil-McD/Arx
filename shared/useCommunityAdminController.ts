import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";
import { resolveAuthSubject } from "./authSession";
import {
  type AnalyticsPointLike, type AnalyticsRange, type AnalyticsSummaryLike, type CommunityMemberLike, type SessionLike, type UserProfileDetailLike, type UserProfileLike, analyticsBucketLabel, buildAnalyticsSeries, emptyAnalyticsSummary, resolveAnalyticsBucket, resolveAnalyticsWindowStart, trimProfileFields, } from "./communityAdminCore";

import {
  countCloudCommunityMembershipRows,
  listCloudCommunityMembershipAdminRows,
  listCloudCommunityMembershipCreatedAtRows,
} from "./cloudCommunityMembershipGateway";
import {
  countCloudCommunityResourceRows,
  fetchCloudCommunityEntitledMemberCount,
  removeCloudCommunityMember,
  setCloudCommunityMemberRole,
} from "./cloudCommunityAdminGateway";
import {
  fetchCloudProfileDetailByUserId,
  listCloudProfileRowsByUserIds,
  upsertCloudProfileDetail,
} from "./cloudProfilesGateway";
import { listCloudThreadUserMessageSenderIds } from "./cloudCommunityChatGateway";
import { preloadImageUrls } from "./preloadImageUrls";

type UseCommunityAdminControllerArgs<
  SessionT extends SessionLike,
  CommunityMemberT extends CommunityMemberLike,
  UserProfileT extends UserProfileLike,
  UserProfileDetailT extends UserProfileDetailLike,
> = {
  activeCommunityId: string | null;
  session: SessionT | null;
  ensureSession?: EnsureSessionFn<SessionT>;
  parseContentRangeTotal: (value: string | null) => number | null;
  dateKeyLocal: (date: Date) => string;
  ensureCommunityChatThread: (communityId: string, session: SessionT) => Promise<string>;
  confirmAction?: (message: string) => boolean;
  reloadCommunities: (session: SessionT) => Promise<void>;
  reloadCommunityAccess: (communityId: string, session: SessionT) => Promise<void>;
  loadUserProfiles?: (userIds: string[], session: SessionT) => Promise<void> | void;

  getProfileSaveSession: () => SessionT | null;
  profileName: string;
  profileBio: string;
  profileAvatarUrl: string | null;
  profileSaveTimeoutRef: MutableRefObject<number | null>;
  profileSaveFailureMessage: string;
  profileSaveUnauthenticatedErrorMessage: string | null;
  onProfileSaveUnauthenticated?: () => void;
  applyLoadedProfileToLocal?: (profile: UserProfileDetailT) => void;

  setCommunityMembers: Dispatch<SetStateAction<CommunityMemberT[]>>;
  setIsLoadingCommunityMembers: Dispatch<SetStateAction<boolean>>;
  setHasResolvedCommunityMembers: Dispatch<SetStateAction<boolean>>;
  setProfilesByUserId: Dispatch<SetStateAction<Record<string, UserProfileT>>>;
  setCloudProfile: Dispatch<SetStateAction<UserProfileDetailT | null>>;
  setProfileName: Dispatch<SetStateAction<string>>;
  setProfileBio: Dispatch<SetStateAction<string>>;
  setProfileAvatarUrl: Dispatch<SetStateAction<string | null>>;
  setIsSavingProfile: Dispatch<SetStateAction<boolean>>;
  setProfileSaveError: Dispatch<SetStateAction<string | null>>;
  setProfileSaveSuccess: Dispatch<SetStateAction<boolean>>;

  setIsLoadingCommunityAnalytics: Dispatch<SetStateAction<boolean>>;
  setCommunityAnalyticsError: Dispatch<SetStateAction<string | null>>;
  setCommunityAnalyticsSummary: Dispatch<SetStateAction<AnalyticsSummaryLike>>;
  setCommunityAnalyticsSeries: Dispatch<SetStateAction<AnalyticsPointLike[]>>;
};

export function useCommunityAdminController<
  SessionT extends SessionLike,
  CommunityMemberT extends CommunityMemberLike,
  UserProfileT extends UserProfileLike,
  UserProfileDetailT extends UserProfileDetailLike,
>(
  args: UseCommunityAdminControllerArgs<
    SessionT,
    CommunityMemberT,
    UserProfileT,
    UserProfileDetailT
  >,
) {
  const resolveCanonicalProfileUserId = useCallback((sessionRaw: SessionT | null): string | null => {
    return resolveAuthSubject(sessionRaw as any);
  }, []);

  const argsRef = useRef(args);
  argsRef.current = args;
  const communityMembersLoadSeqRef = useRef(0);

  const loadCommunityMembers = useCallback(async (
    communityId: string,
    session: SessionT,
  ) => {
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(session, current.ensureSession);
    if (!usableSession) return;
    const seq = (communityMembersLoadSeqRef.current += 1);
    current.setIsLoadingCommunityMembers(true);
    try {
      const rows = (await listCloudCommunityMembershipAdminRows({
        session: usableSession,
        communityId,
        limit: 200,
      })) as unknown as CommunityMemberT[];
      await preloadImageUrls(
        rows.map((row: any) => row?.avatar_url ?? null),
        { maxUrls: rows.length, timeoutMs: 1200 },
      );

      if (communityMembersLoadSeqRef.current !== seq) return;

      current.setProfilesByUserId((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const row of rows) {
          const profileLike = row as unknown as UserProfileT & {
            display_name?: string | null;
            avatar_url?: string | null;
          };
          if (!profileLike.user_id) continue;
          if (profileLike.display_name == null && profileLike.avatar_url == null) continue;
          next[profileLike.user_id] = {
            ...(next[profileLike.user_id] ?? ({} as UserProfileT)),
            user_id: profileLike.user_id,
            display_name: profileLike.display_name ?? null,
            avatar_url: profileLike.avatar_url ?? null,
          } as UserProfileT;
          changed = true;
        }
        return changed ? next : prev;
      });

      const userIds = Array.from(new Set(rows.map((row) => row.user_id)));
      if (userIds.length > 0) {
        if (current.loadUserProfiles) {
          await current.loadUserProfiles(userIds, usableSession);
        } else {
          try {
            const profiles = await listCloudProfileRowsByUserIds<SessionT, UserProfileT>({
              session: usableSession,
              userIds,
            });
            if (communityMembersLoadSeqRef.current !== seq) return;
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
        }
      }

      if (communityMembersLoadSeqRef.current !== seq) return;
      current.setCommunityMembers(rows);
    } catch {
      // ignore
    } finally {
      if (communityMembersLoadSeqRef.current === seq) {
        current.setHasResolvedCommunityMembers(true);
        current.setIsLoadingCommunityMembers(false);
      }
    }
  }, []);

  const loadSelfProfile = useCallback(async (session: SessionT) => {
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(session, current.ensureSession);
    if (!usableSession) return;
    const profileUserId = resolveCanonicalProfileUserId(usableSession);
    if (!profileUserId) return;
    try {
      const row = await fetchCloudProfileDetailByUserId<SessionT, UserProfileDetailT>({
        session: usableSession,
        userId: profileUserId,
      });
      if (!row) return;
      current.setCloudProfile(row);
      current.setProfilesByUserId((prev) => ({
        ...prev,
        [row.user_id]: { user_id: row.user_id, display_name: row.display_name, avatar_url: row.avatar_url } as UserProfileT,
      }));
      current.applyLoadedProfileToLocal?.(row);
      void preloadImageUrls([row.avatar_url ?? null], { maxUrls: 1, timeoutMs: 1200 }).catch(() => {
        // Ignore avatar warmup failures; profile state is already applied.
      });
    } catch {
      // ignore
    }
  }, [resolveCanonicalProfileUserId]);

  const saveProfileToCloud = useCallback(async () => {
    const current = argsRef.current;
    const session = await resolveUsableSession(current.getProfileSaveSession(), current.ensureSession);
    if (!session) {
      current.setProfileSaveError(current.profileSaveUnauthenticatedErrorMessage);
      current.onProfileSaveUnauthenticated?.();
      return;
    }

    const { trimmedName, trimmedBio } = trimProfileFields(current.profileName, current.profileBio);
    if (trimmedName !== current.profileName) current.setProfileName(trimmedName);
    if (trimmedBio !== current.profileBio) current.setProfileBio(trimmedBio);

    if (current.profileSaveTimeoutRef.current) {
      window.clearTimeout(current.profileSaveTimeoutRef.current);
      current.profileSaveTimeoutRef.current = null;
    }

    current.setIsSavingProfile(true);
    current.setProfileSaveError(null);
    current.setProfileSaveSuccess(false);
    try {
      const profileUserId = resolveCanonicalProfileUserId(session);
      if (!profileUserId) throw new Error("profile_user_id_required");
      const saved = await upsertCloudProfileDetail<SessionT, UserProfileDetailT>({
        session,
        userId: profileUserId,
        displayName: trimmedName || null,
        avatarUrl: current.profileAvatarUrl ?? null,
        bio: trimmedBio || null,
      });
      if (saved) {
        current.setCloudProfile(saved);
        current.setProfilesByUserId((prev) => ({
          ...prev,
          [saved.user_id]: {
            user_id: saved.user_id,
            display_name: saved.display_name,
            avatar_url: saved.avatar_url,
          } as UserProfileT,
        }));
        current.setProfileName(saved.display_name ?? "");
        current.setProfileBio(saved.bio ?? "");
        current.setProfileAvatarUrl(saved.avatar_url ?? null);
      }
      current.setProfileSaveSuccess(true);
      current.profileSaveTimeoutRef.current = window.setTimeout(() => current.setProfileSaveSuccess(false), 2000);
    } catch (error) {
      const message = typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : current.profileSaveFailureMessage;
      current.setProfileSaveError(message);
    } finally {
      current.setIsSavingProfile(false);
    }
  }, [resolveCanonicalProfileUserId]);

  const loadCommunityAnalytics = useCallback(async (
    communityId: string,
    session: SessionT,
    range: AnalyticsRange,
    communityCreatedAt: string | null,
  ) => {
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(session, current.ensureSession);
    if (!usableSession) return;
    current.setIsLoadingCommunityAnalytics(true);
    current.setCommunityAnalyticsError(null);

    const now = Date.now();
    const windowStart = resolveAnalyticsWindowStart({
      range,
      nowMs: now,
      communityCreatedAt,
    });
    const sinceWindowIso = windowStart ? windowStart.toISOString() : null;
    const chartBucket = resolveAnalyticsBucket(range);

    try {
      const [entitledMembers, rosterMembers, totalResources, newMembersWindow, resourcesAddedWindow] = await Promise.all([
        fetchCloudCommunityEntitledMemberCount({
          session: usableSession,
          communityId,
        }),
        countCloudCommunityMembershipRows({
          session: usableSession,
          communityId,
        }),
        countCloudCommunityResourceRows({
          session: usableSession,
          communityId,
        }),
        sinceWindowIso
          ? countCloudCommunityMembershipRows({
              session: usableSession,
              communityId,
              sinceIso: sinceWindowIso,
            })
          : null,
        sinceWindowIso
          ? countCloudCommunityResourceRows({
              session: usableSession,
              communityId,
              sinceIso: sinceWindowIso,
            })
          : null,
      ]);

      const totalMembers = entitledMembers ?? rosterMembers;

      let memberJoinsWindow: Array<{ created_at: string }> = [];
      try {
        memberJoinsWindow = await listCloudCommunityMembershipCreatedAtRows({
          session: usableSession,
          communityId,
          sinceIso: sinceWindowIso,
          limit: 5000,
        });
      } catch {
        // ignore
      }

      let activeMembersWindow: number | null = null;
      try {
        const threadId = await current.ensureCommunityChatThread(communityId, usableSession);
        const senders = await listCloudThreadUserMessageSenderIds({
          session: usableSession,
          threadId,
          sinceIso: sinceWindowIso,
          limit: 5000,
        });
        activeMembersWindow = senders.length;
      } catch {
        // ignore
      }

      const retentionWindow =
        totalMembers && totalMembers > 0 && activeMembersWindow != null ? activeMembersWindow / totalMembers : null;

      current.setCommunityAnalyticsSummary({
        total_members: totalMembers,
        new_members_window: newMembersWindow ?? totalMembers,
        active_members_window: activeMembersWindow,
        retention_window: retentionWindow,
        total_resources: totalResources,
        resources_added_window: resourcesAddedWindow ?? totalResources,
      });
      current.setCommunityAnalyticsSeries(
        buildAnalyticsSeries({
          rows: memberJoinsWindow,
          start: windowStart ?? new Date(now - 30 * 86400000),
          bucket: chartBucket,
          dateKeyLocal: current.dateKeyLocal,
        }),
      );
    } catch (error) {
      const message = typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : "Failed to load analytics.";
      current.setCommunityAnalyticsError(message);
    } finally {
      current.setIsLoadingCommunityAnalytics(false);
    }
  }, []);

  const resetCommunityAnalytics = useCallback(() => {
    const current = argsRef.current;
    current.setCommunityAnalyticsSummary(emptyAnalyticsSummary());
    current.setCommunityAnalyticsSeries([]);
    current.setCommunityAnalyticsError(null);
    current.setIsLoadingCommunityAnalytics(false);
  }, []);

  const refreshCommunityMembershipViews = useCallback(async (communityId: string, session: SessionT) => {
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(session, current.ensureSession);
    if (!usableSession) return;
    await loadCommunityMembers(communityId, usableSession);
    await current.reloadCommunities(usableSession);
    await current.reloadCommunityAccess(communityId, usableSession);
  }, [loadCommunityMembers]);

  const handleSetCommunityMemberRole = useCallback(async (
    membershipId: string,
    role: "admin" | "moderator" | "member",
  ) => {
    const current = argsRef.current;
    const communityId = current.activeCommunityId;
    const session = await resolveUsableSession(current.session, current.ensureSession);
    if (!session || !communityId) return;
    try {
      await setCloudCommunityMemberRole({
        session,
        communityId,
        membershipId,
        role,
      });
    } catch (error) {
      console.warn("Failed to set member role:", error);
    } finally {
      await refreshCommunityMembershipViews(communityId, session);
    }
  }, [refreshCommunityMembershipViews]);

  const handleRemoveCommunityMember = useCallback(async (membershipId: string) => {
    const current = argsRef.current;
    const communityId = current.activeCommunityId;
    const session = await resolveUsableSession(current.session, current.ensureSession);
    if (!session || !communityId) return;
    const confirmed = current.confirmAction
      ? current.confirmAction("Remove this member?")
      : window.confirm("Remove this member?");
    if (!confirmed) return;
    try {
      await removeCloudCommunityMember({
        session,
        communityId,
        membershipId,
      });
    } catch (error) {
      console.warn("Failed to remove member:", error);
    } finally {
      await refreshCommunityMembershipViews(communityId, session);
    }
  }, [refreshCommunityMembershipViews]);

  return {
    loadCommunityMembers,
    loadSelfProfile,
    saveProfileToCloud,
    loadCommunityAnalytics,
    resetCommunityAnalytics,
    handleSetCommunityMemberRole,
    handleRemoveCommunityMember,
  };
}
