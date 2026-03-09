import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
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
  listCloudCommunityRevenueSeriesRows,
  removeCloudCommunityMember,
  setCloudCommunityMemberRole,
} from "./cloudCommunityAdminGateway";
import {
  fetchCloudProfileDetailByUserId,
  listCloudProfileRowsByUserIds,
  upsertCloudProfileDetail,
} from "./cloudProfilesGateway";
import { listCloudThreadUserMessageSenderIds } from "./cloudCommunityChatGateway";

type UseCommunityAdminControllerArgs<
  SessionT extends SessionLike,
  CommunityMemberT extends CommunityMemberLike,
  UserProfileT extends UserProfileLike,
  UserProfileDetailT extends UserProfileDetailLike,
> = {
  activeCommunityId: string | null;
  session: SessionT | null;
  parseContentRangeTotal: (value: string | null) => number | null;
  dateKeyLocal: (date: Date) => string;
  ensureCommunityChatThread: (communityId: string, session: SessionT) => Promise<string>;
  confirmAction?: (message: string) => boolean;
  getMemberRefreshIncludeStatus: () => boolean;
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
  setCommunityRevenueError: Dispatch<SetStateAction<string | null>>;
  setCommunityAnalyticsSummary: Dispatch<SetStateAction<AnalyticsSummaryLike>>;
  setCommunityAnalyticsSeries: Dispatch<SetStateAction<AnalyticsPointLike[]>>;
  setCommunityRevenueSeries: Dispatch<SetStateAction<AnalyticsPointLike[]>>;
  setCommunityRevenueMeta: Dispatch<SetStateAction<{ currency: string; currency_decimals: number } | null>>;
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
  const argsRef = useRef(args);
  argsRef.current = args;

  const loadCommunityMembers = useCallback(async (
    communityId: string,
    session: SessionT,
    opts?: { includeStatus?: boolean },
  ) => {
    const current = argsRef.current;
    void opts;
    let rows: CommunityMemberT[] | null = null;
    try {
      rows = (await listCloudCommunityMembershipAdminRows({
        session,
        communityId,
        limit: 200,
      })) as unknown as CommunityMemberT[];
    } catch {
      return;
    }

    current.setCommunityMembers(rows);

    const userIds = Array.from(new Set(rows.map((row) => row.user_id)));
    if (userIds.length === 0) return;

    if (current.loadUserProfiles) {
      await current.loadUserProfiles(userIds, session);
      return;
    }

    try {
      const profiles = await listCloudProfileRowsByUserIds<SessionT, UserProfileT>({
        session,
        userIds,
      });
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

  const loadSelfProfile = useCallback(async (session: SessionT) => {
    const current = argsRef.current;
    try {
      const row = await fetchCloudProfileDetailByUserId<SessionT, UserProfileDetailT>({
        session,
        userId: session.user.id,
      });
      if (!row) return;

      current.setCloudProfile(row);
      current.setProfilesByUserId((prev) => ({
        ...prev,
        [row.user_id]: { user_id: row.user_id, display_name: row.display_name, avatar_url: row.avatar_url } as UserProfileT,
      }));
      current.applyLoadedProfileToLocal?.(row);
    } catch {
      // ignore
    }
  }, []);

  const saveProfileToCloud = useCallback(async () => {
    const current = argsRef.current;
    const session = current.getProfileSaveSession();
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
      const saved = await upsertCloudProfileDetail<SessionT, UserProfileDetailT>({
        session,
        userId: session.user.id,
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
  }, []);

  const loadCommunityAnalytics = useCallback(async (
    communityId: string,
    session: SessionT,
    range: AnalyticsRange,
    communityCreatedAt: string | null,
  ) => {
    const current = argsRef.current;
    current.setIsLoadingCommunityAnalytics(true);
    current.setCommunityAnalyticsError(null);
    current.setCommunityRevenueError(null);

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
          session,
          communityId,
        }),
        countCloudCommunityMembershipRows({
          session,
          communityId,
        }),
        countCloudCommunityResourceRows({
          session,
          communityId,
        }),
        sinceWindowIso
          ? countCloudCommunityMembershipRows({
              session,
              communityId,
              sinceIso: sinceWindowIso,
            })
          : null,
        sinceWindowIso
          ? countCloudCommunityResourceRows({
              session,
              communityId,
              sinceIso: sinceWindowIso,
            })
          : null,
      ]);

      const totalMembers = entitledMembers ?? rosterMembers;

      let memberJoinsWindow: Array<{ created_at: string }> = [];
      try {
        memberJoinsWindow = await listCloudCommunityMembershipCreatedAtRows({
          session,
          communityId,
          sinceIso: sinceWindowIso,
          limit: 5000,
        });
      } catch {
        // ignore
      }

      let activeMembersWindow: number | null = null;
      try {
        const threadId = await current.ensureCommunityChatThread(communityId, session);
        const senders = await listCloudThreadUserMessageSenderIds({
          session,
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

      try {
        const rows = await listCloudCommunityRevenueSeriesRows({
          session,
          communityId,
          range,
        });
        const metaCurrency = rows[0]?.currency ?? null;
        const metaDecimals = rows[0]?.currency_decimals ?? null;
        if (metaCurrency && metaDecimals != null) {
          current.setCommunityRevenueMeta({ currency: metaCurrency, currency_decimals: metaDecimals });
        } else {
          current.setCommunityRevenueMeta(null);
        }
        current.setCommunityRevenueSeries(
          rows.map((row) => {
            const date = new Date(row.bucket_start);
            return {
              label: analyticsBucketLabel(date, chartBucket),
              value: Number(row.net_base_units ?? 0) || 0,
            };
          }),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load revenue.";
        if (message.includes("schema cache")) {
          current.setCommunityRevenueSeries(
            buildAnalyticsSeries({
              rows: [],
              start: windowStart ?? new Date(now - 30 * 86400000),
              bucket: chartBucket,
              dateKeyLocal: current.dateKeyLocal,
            }),
          );
          current.setCommunityRevenueMeta(null);
          current.setCommunityRevenueError(null);
        } else {
          current.setCommunityRevenueSeries([]);
          current.setCommunityRevenueMeta(null);
          current.setCommunityRevenueError(message);
        }
      }
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
    current.setCommunityRevenueSeries([]);
    current.setCommunityRevenueMeta(null);
    current.setCommunityRevenueError(null);
    current.setCommunityAnalyticsError(null);
    current.setIsLoadingCommunityAnalytics(false);
  }, []);

  const refreshCommunityMembershipViews = useCallback(async (communityId: string, session: SessionT) => {
    const current = argsRef.current;
    await loadCommunityMembers(communityId, session, { includeStatus: current.getMemberRefreshIncludeStatus() });
    await current.reloadCommunities(session);
    await current.reloadCommunityAccess(communityId, session);
  }, [loadCommunityMembers]);

  const handleSetCommunityMemberRole = useCallback(async (userId: string, role: "admin" | "member") => {
    const current = argsRef.current;
    const communityId = current.activeCommunityId;
    const session = current.session;
    if (!session || !communityId) return;
    try {
      await setCloudCommunityMemberRole({
        session,
        communityId,
        userId,
        role,
      });
    } catch (error) {
      console.warn("Failed to set member role:", error);
    } finally {
      await refreshCommunityMembershipViews(communityId, session);
    }
  }, [refreshCommunityMembershipViews]);

  const handleRemoveCommunityMember = useCallback(async (userId: string) => {
    const current = argsRef.current;
    const communityId = current.activeCommunityId;
    const session = current.session;
    if (!session || !communityId) return;
    const confirmed = current.confirmAction
      ? current.confirmAction("Remove this member?")
      : window.confirm("Remove this member?");
    if (!confirmed) return;
    try {
      await removeCloudCommunityMember({
        session,
        communityId,
        userId,
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
