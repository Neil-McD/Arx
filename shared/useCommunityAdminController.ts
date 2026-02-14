import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

type SessionLike = {
  user: {
    id: string;
  };
};

type CommunityMemberLike = {
  user_id: string;
};

type UserProfileLike = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
};

type UserProfileDetailLike = UserProfileLike & {
  bio: string | null;
};

type AnalyticsSummaryLike = {
  total_members: number | null;
  new_members_window: number | null;
  active_members_window: number | null;
  retention_window: number | null;
  total_resources: number | null;
  resources_added_window: number | null;
};

type AnalyticsPointLike = {
  label: string;
  value: number;
};

type AnalyticsRange = "7d" | "30d" | "90d" | "1y" | "all";
type AnalyticsBucket = "day" | "week" | "month";

type UseCommunityAdminControllerArgs<
  SessionT extends SessionLike,
  CommunityMemberT extends CommunityMemberLike,
  UserProfileT extends UserProfileLike,
  UserProfileDetailT extends UserProfileDetailLike,
> = {
  activeCommunityId: string | null;
  supabaseSession: SessionT | null;
  getSupabaseUrl: () => string | null;
  fetchWithSupabaseAuth: (url: string, init: RequestInit, session: SessionT) => Promise<Response>;
  readSupabaseError: (response: Response) => Promise<string>;
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
    const url = current.getSupabaseUrl();
    if (!url) return;
    const membershipsUrl = `${url}/rest/v1/community_memberships?select=id,community_id,user_id,role,created_at&community_id=eq.${communityId}&order=created_at.asc&limit=200`;
    const adminUrl = `${url}/rest/v1/rpc/list_community_members_admin`;

    let response: Response;
    try {
      response = await current.fetchWithSupabaseAuth(
        opts?.includeStatus ? adminUrl : membershipsUrl,
        opts?.includeStatus
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ p_community_id: communityId }),
            }
          : {},
        session,
      );
    } catch {
      return;
    }

    if (!response.ok && opts?.includeStatus) {
      try {
        response = await current.fetchWithSupabaseAuth(membershipsUrl, {}, session);
      } catch {
        return;
      }
    }
    if (!response.ok) return;

    const rows = (await response.json()) as CommunityMemberT[];
    current.setCommunityMembers(rows);

    const userIds = Array.from(new Set(rows.map((row) => row.user_id)));
    if (userIds.length === 0) return;

    if (current.loadUserProfiles) {
      await current.loadUserProfiles(userIds, session);
      return;
    }

    const idsFilter = userIds.map((id) => `"${id}"`).join(",");
    try {
      const profilesResponse = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/profiles?select=user_id,display_name,avatar_url&user_id=in.(${idsFilter})`,
        {},
        session,
      );
      if (!profilesResponse.ok) return;
      const profiles = (await profilesResponse.json()) as UserProfileT[];
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
    const url = current.getSupabaseUrl();
    if (!url) return;
    try {
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/profiles?select=user_id,display_name,avatar_url,bio&user_id=eq.${encodeURIComponent(
          session.user.id,
        )}&limit=1`,
        { method: "GET" },
        session,
      );
      if (!response.ok) return;
      const rows = (await response.json()) as UserProfileDetailT[];
      const row = rows[0];
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
    const url = current.getSupabaseUrl();
    if (!session || !url) {
      current.setProfileSaveError(current.profileSaveUnauthenticatedErrorMessage);
      current.onProfileSaveUnauthenticated?.();
      return;
    }

    const trimmedName = current.profileName.trim();
    const trimmedBio = current.profileBio.trim();
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
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/profiles?on_conflict=user_id&select=user_id,display_name,avatar_url,bio`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates,return=representation",
          },
          body: JSON.stringify({
            user_id: session.user.id,
            display_name: trimmedName || null,
            avatar_url: current.profileAvatarUrl ?? null,
            bio: trimmedBio || null,
          }),
        },
        session,
      );
      if (!response.ok) throw new Error(await current.readSupabaseError(response));
      const rows = (await response.json()) as UserProfileDetailT[];
      const saved = rows[0];
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
    const url = current.getSupabaseUrl();
    if (!url) return;
    current.setIsLoadingCommunityAnalytics(true);
    current.setCommunityAnalyticsError(null);
    current.setCommunityRevenueError(null);

    const now = Date.now();
    const rangeToWindowStart = (): Date | null => {
      switch (range) {
        case "7d":
          return new Date(now - 7 * 86400000);
        case "30d":
          return new Date(now - 30 * 86400000);
        case "90d":
          return new Date(now - 90 * 86400000);
        case "1y":
          return new Date(now - 365 * 86400000);
        case "all": {
          if (!communityCreatedAt) return null;
          const created = new Date(communityCreatedAt);
          return Number.isNaN(created.getTime()) ? null : created;
        }
        default:
          return new Date(now - 30 * 86400000);
      }
    };

    const windowStart = rangeToWindowStart();
    const sinceWindowIso = windowStart ? windowStart.toISOString() : null;
    const chartBucket: AnalyticsBucket =
      range === "7d" || range === "30d" ? "day" : range === "90d" ? "week" : "month";

    const fetchCount = async (queryUrl: string): Promise<number | null> => {
      let response: Response;
      try {
        response = await current.fetchWithSupabaseAuth(
          queryUrl,
          { method: "HEAD", headers: { Prefer: "count=exact" } },
          session,
        );
      } catch {
        return null;
      }
      if (!response.ok) return null;
      return current.parseContentRangeTotal(response.headers.get("content-range"));
    };

    const fetchEntitledMemberCount = async (): Promise<number | null> => {
      try {
        const response = await current.fetchWithSupabaseAuth(
          `${url}/rest/v1/rpc/community_entitled_member_count`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ p_community_id: communityId }),
          },
          session,
        );
        if (!response.ok) return null;
        const data = await response.json();
        if (typeof data === "number") return data;
        if (typeof data === "string") return Number(data) || 0;
        const asObj = data as Record<string, unknown> | null;
        const maybeValue = asObj && typeof asObj === "object" ? asObj["community_entitled_member_count"] : null;
        if (typeof maybeValue === "number") return maybeValue;
        if (typeof maybeValue === "string") return Number(maybeValue) || 0;
        return null;
      } catch {
        return null;
      }
    };

    const startOfBucket = (date: Date, bucket: AnalyticsBucket): Date => {
      if (bucket === "month") return new Date(date.getFullYear(), date.getMonth(), 1);
      if (bucket === "week") {
        const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const day = d.getDay();
        const diff = (day + 6) % 7;
        d.setDate(d.getDate() - diff);
        return d;
      }
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    };

    const addBucket = (date: Date, bucket: AnalyticsBucket): Date => {
      if (bucket === "month") return new Date(date.getFullYear(), date.getMonth() + 1, 1);
      if (bucket === "week") return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7);
      return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    };

    const bucketKey = (date: Date, bucket: AnalyticsBucket): string => {
      if (bucket === "month") return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      return current.dateKeyLocal(date);
    };

    const bucketLabel = (date: Date, bucket: AnalyticsBucket): string => {
      if (bucket === "month") return date.toLocaleDateString([], { month: "short", year: "2-digit" });
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    };

    const buildSeries = (
      rows: Array<{ created_at: string }>,
      start: Date,
      bucket: AnalyticsBucket,
    ): AnalyticsPointLike[] => {
      const end = new Date();
      const startBucket = startOfBucket(start, bucket);
      const endBucket = startOfBucket(end, bucket);

      const counts = new Map<string, number>();
      for (const row of rows) {
        const created = new Date(row.created_at);
        if (Number.isNaN(created.getTime())) continue;
        if (created < startBucket) continue;
        const key = bucketKey(startOfBucket(created, bucket), bucket);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }

      const points: AnalyticsPointLike[] = [];
      for (let cursor = startBucket; cursor <= endBucket; cursor = addBucket(cursor, bucket)) {
        const key = bucketKey(cursor, bucket);
        points.push({ label: bucketLabel(cursor, bucket), value: counts.get(key) ?? 0 });
      }
      return points;
    };

    try {
      const [entitledMembers, rosterMembers, totalResources, newMembersWindow, resourcesAddedWindow] = await Promise.all([
        fetchEntitledMemberCount(),
        fetchCount(`${url}/rest/v1/community_memberships?select=id&community_id=eq.${communityId}`),
        fetchCount(`${url}/rest/v1/community_resources?select=id&community_id=eq.${communityId}`),
        sinceWindowIso
          ? fetchCount(
              `${url}/rest/v1/community_memberships?select=id&community_id=eq.${communityId}&created_at=gte.${encodeURIComponent(
                sinceWindowIso,
              )}`,
            )
          : null,
        sinceWindowIso
          ? fetchCount(
              `${url}/rest/v1/community_resources?select=id&community_id=eq.${communityId}&created_at=gte.${encodeURIComponent(
                sinceWindowIso,
              )}`,
            )
          : null,
      ]);

      const totalMembers = entitledMembers ?? rosterMembers;

      let memberJoinsWindow: Array<{ created_at: string }> = [];
      try {
        const joinQueryBase = `${url}/rest/v1/community_memberships?select=created_at&community_id=eq.${communityId}`;
        const joinQuery =
          sinceWindowIso !== null
            ? `${joinQueryBase}&created_at=gte.${encodeURIComponent(sinceWindowIso)}`
            : joinQueryBase;
        const response = await current.fetchWithSupabaseAuth(
          `${joinQuery}&order=created_at.asc&limit=5000`,
          {},
          session,
        );
        if (response.ok) {
          memberJoinsWindow = (await response.json()) as Array<{ created_at: string }>;
        }
      } catch {
        // ignore
      }

      let activeMembersWindow: number | null = null;
      try {
        const threadId = await current.ensureCommunityChatThread(communityId, session);
        const messagesQueryBase = `${url}/rest/v1/messages?select=sender_id&thread_id=eq.${encodeURIComponent(
          threadId,
        )}&role=eq.user`;
        const messagesQuery =
          sinceWindowIso !== null
            ? `${messagesQueryBase}&created_at=gte.${encodeURIComponent(sinceWindowIso)}`
            : messagesQueryBase;
        const response = await current.fetchWithSupabaseAuth(
          `${messagesQuery}&limit=5000`,
          {},
          session,
        );
        if (response.ok) {
          const rows = (await response.json()) as Array<{ sender_id: string | null }>;
          const senders = new Set<string>();
          for (const row of rows) {
            const sender = (row.sender_id ?? "").trim();
            if (sender) senders.add(sender);
          }
          activeMembersWindow = senders.size;
        }
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
        buildSeries(memberJoinsWindow, windowStart ?? new Date(now - 30 * 86400000), chartBucket),
      );

      try {
        const response = await current.fetchWithSupabaseAuth(
          `${url}/rest/v1/rpc/community_revenue_series`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ p_community_id: communityId, p_range: range }),
          },
          session,
        );
        if (!response.ok) {
          const message = await current.readSupabaseError(response);
          if (message.includes("schema cache")) {
            current.setCommunityRevenueSeries(
              buildSeries([], windowStart ?? new Date(now - 30 * 86400000), chartBucket),
            );
            current.setCommunityRevenueMeta(null);
            current.setCommunityRevenueError(null);
          } else {
            current.setCommunityRevenueSeries([]);
            current.setCommunityRevenueMeta(null);
            current.setCommunityRevenueError(message);
          }
        } else {
          const rows = (await response.json()) as Array<{
            bucket_start: string;
            net_base_units: number | string | null;
            currency: string | null;
            currency_decimals: number | null;
          }>;
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
                label: bucketLabel(date, chartBucket),
                value: Number(row.net_base_units ?? 0) || 0,
              };
            }),
          );
        }
      } catch {
        current.setCommunityRevenueSeries([]);
        current.setCommunityRevenueMeta(null);
        current.setCommunityRevenueError("Failed to load revenue.");
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
    current.setCommunityAnalyticsSummary({
      total_members: null,
      new_members_window: null,
      active_members_window: null,
      retention_window: null,
      total_resources: null,
      resources_added_window: null,
    });
    current.setCommunityAnalyticsSeries([]);
    current.setCommunityRevenueSeries([]);
    current.setCommunityRevenueMeta(null);
    current.setCommunityRevenueError(null);
    current.setCommunityAnalyticsError(null);
    current.setIsLoadingCommunityAnalytics(false);
  }, []);

  const handleSetCommunityMemberRole = useCallback(async (userId: string, role: string) => {
    const current = argsRef.current;
    const communityId = current.activeCommunityId;
    const session = current.supabaseSession;
    if (!session || !communityId) return;
    const url = current.getSupabaseUrl();
    if (!url) return;
    try {
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/set_member_role`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            p_community_id: communityId,
            p_user_id: userId,
            p_role: role,
          }),
        },
        session,
      );
      if (!response.ok) {
        const message = await current.readSupabaseError(response);
        console.warn("Failed to set member role:", message);
      }
    } catch (error) {
      console.warn("Failed to set member role:", error);
    } finally {
      await loadCommunityMembers(communityId, session, { includeStatus: current.getMemberRefreshIncludeStatus() });
      await current.reloadCommunities(session);
      await current.reloadCommunityAccess(communityId, session);
    }
  }, [loadCommunityMembers]);

  const handleRemoveCommunityMember = useCallback(async (userId: string) => {
    const current = argsRef.current;
    const communityId = current.activeCommunityId;
    const session = current.supabaseSession;
    if (!session || !communityId) return;
    const confirmed = current.confirmAction
      ? current.confirmAction("Remove this member?")
      : window.confirm("Remove this member?");
    if (!confirmed) return;
    const url = current.getSupabaseUrl();
    if (!url) return;
    try {
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/remove_member`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            p_community_id: communityId,
            p_user_id: userId,
          }),
        },
        session,
      );
      if (!response.ok) {
        const message = await current.readSupabaseError(response);
        console.warn("Failed to remove member:", message);
      }
    } catch (error) {
      console.warn("Failed to remove member:", error);
    } finally {
      await loadCommunityMembers(communityId, session, { includeStatus: current.getMemberRefreshIncludeStatus() });
      await current.reloadCommunities(session);
      await current.reloadCommunityAccess(communityId, session);
    }
  }, [loadCommunityMembers]);

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
