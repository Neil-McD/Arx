import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { ProfileDraftSnapshot } from "./profileDraftState";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";
import { resolveAuthSubject } from "./authSession";
import { formatProfileMutationError } from "./profileMutationErrors";
import { mergeUserProfileEntry } from "./userProfileMerge";
import type { SocialProfileLinks } from "./socialProfileLinks";
import {
  type AnalyticsMetricSeriesLike,
  type AnalyticsRange,
  type AnalyticsSummaryLike,
  type SessionLike,
  type UserProfileDetailLike,
  type UserProfileLike,
  emptyAnalyticsMetricSeries,
  emptyAnalyticsSummary,
  trimProfileFields,
} from "./communityAdminCore";

import { countCloudCommunityMembershipRows } from "./cloudCommunityMembershipGateway";
import {
  banCloudCommunityMember,
  fetchCloudCommunityAnalyticsSnapshot,
  removeCloudCommunityMember,
  setCloudCommunityMemberRole,
} from "./cloudCommunityAdminGateway";
import {
  fetchCloudProfileDetailByUserId,
  prepareCloudProfileAvatarField,
  upsertCloudProfileDetail,
} from "./cloudProfilesGateway";

type SaveProfileToCloudOptions = {
  socialLinks?: SocialProfileLinks;
};

type UseCommunityAdminControllerArgs<
  SessionT extends SessionLike,
  UserProfileT extends UserProfileLike,
  UserProfileDetailT extends UserProfileDetailLike,
> = {
  activeCommunityId: string | null;
  session: SessionT | null;
  ensureSession?: EnsureSessionFn<SessionT>;
  confirmAction?: (message: string) => boolean;
  reloadCommunities: (session: SessionT) => Promise<void>;
  reloadCommunityAccess: (communityId: string, session: SessionT) => Promise<void>;

  getProfileSaveSession: () => SessionT | null;
  profileSaveFailureMessage: string;
  onProfileSaveUnauthenticated?: () => void;
  applyLoadedProfileToLocal?: (profile: UserProfileDetailT) => void;
  profileIsActive?: boolean;
  captureProfileDraft: () => ProfileDraftSnapshot;
  applySavedProfileToLocal: (profile: UserProfileDetailT, submitted: ProfileDraftSnapshot) => void;
  setProfileLoadStatus?: (status: "idle" | "loading" | "ready" | "missing" | "error") => void;

  setProfilesByUserId: Dispatch<SetStateAction<Record<string, UserProfileT>>>;
  setCloudProfile: Dispatch<SetStateAction<UserProfileDetailT | null>>;
  setIsSavingProfile: Dispatch<SetStateAction<boolean>>;
  setProfileSaveError: Dispatch<SetStateAction<string | null>>;

  setIsLoadingCommunityAnalytics: Dispatch<SetStateAction<boolean>>;
  setCommunityAnalyticsError: Dispatch<SetStateAction<string | null>>;
  setCommunityAnalyticsSummary: Dispatch<SetStateAction<AnalyticsSummaryLike>>;
  setCommunityAnalyticsSeries: Dispatch<SetStateAction<AnalyticsMetricSeriesLike>>;
};

export function useCommunityAdminController<
  SessionT extends SessionLike,
  UserProfileT extends UserProfileLike,
  UserProfileDetailT extends UserProfileDetailLike,
>(
  args: UseCommunityAdminControllerArgs<
    SessionT,
    UserProfileT,
    UserProfileDetailT
  >,
) {
  const resolveCanonicalProfileUserId = useCallback((sessionRaw: SessionT | null): string | null => {
    return resolveAuthSubject(sessionRaw as any);
  }, []);

  const argsRef = useRef(args);
  argsRef.current = args;
  const communityAnalyticsLoadSeqRef = useRef(0);
  const selfProfileLoadSeqRef = useRef(0);
  const profileAccountId = resolveCanonicalProfileUserId(args.session);
  const profileAccountRef = useRef(profileAccountId);
  const profileScopeEpochRef = useRef(0);
  const profileSaveInFlightRef = useRef(false);
  const profileReadInFlightRef = useRef(false);
  if (profileAccountRef.current !== profileAccountId) {
    profileAccountRef.current = profileAccountId;
    profileScopeEpochRef.current += 1;
    selfProfileLoadSeqRef.current += 1;
    profileSaveInFlightRef.current = false;
    profileReadInFlightRef.current = false;
  }
  useEffect(() => () => {
    profileScopeEpochRef.current += 1;
    selfProfileLoadSeqRef.current += 1;
    profileReadInFlightRef.current = false;
    profileSaveInFlightRef.current = false;
  }, []);

  const loadSelfProfile = useCallback(async (session: SessionT) => {
    const current = argsRef.current;
    const profileUserId = resolveCanonicalProfileUserId(session);
    if (!profileUserId || profileUserId !== profileAccountRef.current || profileSaveInFlightRef.current || profileReadInFlightRef.current) return;
    profileReadInFlightRef.current = true;
    const seq = (selfProfileLoadSeqRef.current += 1);
    const epoch = profileScopeEpochRef.current;
    const isCurrent = () => selfProfileLoadSeqRef.current === seq && profileScopeEpochRef.current === epoch && profileAccountRef.current === profileUserId;
    current.setProfileLoadStatus?.("loading");
    try {
      const usableSession = await resolveUsableSession(session, current.ensureSession);
      if (!isCurrent()) return;
      if (!usableSession || resolveCanonicalProfileUserId(usableSession) !== profileUserId) {
        current.setProfileLoadStatus?.("error"); return;
      }
      const row = await fetchCloudProfileDetailByUserId<SessionT, UserProfileDetailT>({
        session: usableSession,
        userId: profileUserId,
      });
      if (
        !isCurrent() ||
        selfProfileLoadSeqRef.current !== seq ||
        resolveCanonicalProfileUserId(argsRef.current.session) !== profileUserId
      ) {
        return;
      }
      const latest = argsRef.current;
      latest.setCloudProfile(row);
      latest.setProfileLoadStatus?.(row ? "ready" : "missing");
      if (!row) return;
      latest.setProfilesByUserId((prev) => ({
        ...prev,
        [row.user_id]: mergeUserProfileEntry(prev[row.user_id], {
          user_id: row.user_id,
          display_name: row.display_name,
          handle: row.handle ?? null,
          normalized_handle: row.normalized_handle ?? null,
          avatar_url: row.avatar_url,
          avatar_storage_id: row.avatar_storage_id ?? null,
          avatar_focus_x: row.avatar_focus_x ?? 0.5,
          avatar_focus_y: row.avatar_focus_y ?? 0.5,
          avatar_zoom: row.avatar_zoom ?? 1,
        } as UserProfileT),
      }));
      latest.applyLoadedProfileToLocal?.(row);
    } catch {
      if (isCurrent()) argsRef.current.setProfileLoadStatus?.("error");
    } finally {
      if (profileScopeEpochRef.current === epoch) profileReadInFlightRef.current = false;
    }
  }, [resolveCanonicalProfileUserId]);

  // Active Profile requests join the same loader as account-graph hydration.
  useEffect(() => {
    const session = argsRef.current.session;
    if (args.profileIsActive && session) void loadSelfProfile(session);
  }, [args.profileIsActive, profileAccountId, loadSelfProfile]);

  const saveProfileToCloud = useCallback(async (options: SaveProfileToCloudOptions = {}): Promise<boolean> => {
    if (profileSaveInFlightRef.current) return false;
    selfProfileLoadSeqRef.current += 1;
    const current = argsRef.current;
    const candidate = current.getProfileSaveSession();
    const accountId = resolveCanonicalProfileUserId(candidate);
    const unauthenticatedMessage =
      "Your session could not be verified. Your edits are preserved. Try saving again, or sign in again.";
    if (!accountId || accountId !== profileAccountRef.current) {
      current.setProfileSaveError(unauthenticatedMessage);
      current.onProfileSaveUnauthenticated?.();
      return false;
    }
    const epoch = profileScopeEpochRef.current;
    const isCurrent = () => profileScopeEpochRef.current === epoch && profileAccountRef.current === accountId;
    const submitted = current.captureProfileDraft();
    const fields = submitted.values;
    if (submitted.accountId !== accountId) return false;
    profileSaveInFlightRef.current = true;

    const { trimmedName, trimmedHandle, trimmedBio } = trimProfileFields(
      fields.name,
      fields.handle,
      fields.bio,
    );

    current.setIsSavingProfile(true);
    current.setProfileSaveError(null);
    try {
      const session = await resolveUsableSession(candidate, current.ensureSession);
      if (!isCurrent()) return false;
      if (!session || resolveCanonicalProfileUserId(session) !== accountId) {
        current.setProfileSaveError(unauthenticatedMessage);
        current.onProfileSaveUnauthenticated?.();
        return false;
      }
      const profileUserId = resolveCanonicalProfileUserId(session);
      if (!profileUserId) throw new Error("profile_user_id_required");
      const avatarField = await prepareCloudProfileAvatarField({
        session,
        nextValue: fields.avatarUrl,
        currentStorageId: fields.avatarStorageId,
        currentResolvedUrl: fields.avatarUrl,
      });
      if (!isCurrent()) return false;
      const nextSocialLinks = options.socialLinks ?? fields.socialLinks;
      const saved = await upsertCloudProfileDetail<SessionT, UserProfileDetailT>({
        session,
        userId: profileUserId,
        displayName: trimmedName || null,
        handle: trimmedHandle || null,
        avatarStorageId: avatarField.storageId ?? null,
        avatarUrl: avatarField.url ?? null,
        avatarFocusX: fields.avatarFocusX,
        avatarFocusY: fields.avatarFocusY,
        avatarZoom: fields.avatarZoom,
        bio: trimmedBio || null,
        socialLinks: nextSocialLinks,
      });
      if (!isCurrent()) return false;
      if (!saved) {
        current.setProfileSaveError(current.profileSaveFailureMessage);
        return false;
      }
      selfProfileLoadSeqRef.current += 1;
      current.setCloudProfile(saved);
      current.setProfileLoadStatus?.("ready");
      current.setProfilesByUserId((prev) => ({
        ...prev,
        [saved.user_id]: mergeUserProfileEntry(prev[saved.user_id], {
          user_id: saved.user_id,
          display_name: saved.display_name,
          handle: saved.handle ?? null,
          normalized_handle: saved.normalized_handle ?? null,
          avatar_url: saved.avatar_url,
          avatar_storage_id: saved.avatar_storage_id ?? null,
          avatar_focus_x: saved.avatar_focus_x ?? 0.5,
          avatar_focus_y: saved.avatar_focus_y ?? 0.5,
          avatar_zoom: saved.avatar_zoom ?? 1,
        } as UserProfileT),
      }));
      current.applySavedProfileToLocal(saved, submitted);
      return true;
    } catch (error) {
      if (isCurrent()) current.setProfileSaveError(formatProfileMutationError(error, current.profileSaveFailureMessage));
      return false;
    } finally {
      if (isCurrent()) {
        profileSaveInFlightRef.current = false;
        current.setIsSavingProfile(false);
      }
    }
  }, [resolveCanonicalProfileUserId]);

  const loadCommunityAnalytics = useCallback(async (
    communityId: string,
    session: SessionT,
    range: AnalyticsRange,
  ) => {
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(session, current.ensureSession);
    if (!usableSession) return;
    const seq = (communityAnalyticsLoadSeqRef.current += 1);
    current.setIsLoadingCommunityAnalytics(true);
    current.setCommunityAnalyticsError(null);

    try {
      const snapshot = await fetchCloudCommunityAnalyticsSnapshot({
        session: usableSession,
        communityId,
        range,
      });

      if (communityAnalyticsLoadSeqRef.current !== seq) return;

      current.setCommunityAnalyticsSummary(snapshot?.summary ?? emptyAnalyticsSummary());
      current.setCommunityAnalyticsSeries(snapshot?.series ?? emptyAnalyticsMetricSeries());
    } catch (error) {
      if (communityAnalyticsLoadSeqRef.current !== seq) return;
      const message = typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : "Failed to load analytics.";
      current.setCommunityAnalyticsError(message);
    } finally {
      if (communityAnalyticsLoadSeqRef.current === seq) {
        current.setIsLoadingCommunityAnalytics(false);
      }
    }
  }, []);

  const resetCommunityAnalytics = useCallback(() => {
    const current = argsRef.current;
    communityAnalyticsLoadSeqRef.current += 1;
    current.setCommunityAnalyticsSummary(emptyAnalyticsSummary());
    current.setCommunityAnalyticsSeries(emptyAnalyticsMetricSeries());
    current.setCommunityAnalyticsError(null);
    current.setIsLoadingCommunityAnalytics(false);
  }, []);

  const reconcileCommunityMembershipViews = useCallback((communityId: string, session: SessionT) => {
    const current = argsRef.current;
    void (async () => {
      try {
        const usableSession = await resolveUsableSession(session, current.ensureSession);
        if (!usableSession) return;
        await Promise.allSettled([
          countCloudCommunityMembershipRows({
            session: usableSession,
            communityId,
            sinceIso: null,
          }),
          argsRef.current.reloadCommunities(usableSession),
          argsRef.current.reloadCommunityAccess(communityId, usableSession),
        ]);
      } catch {
        // Background reconciliation must not undo the successful local mutation.
      }
    })();
  }, []);

  const handleSetCommunityMemberRole = useCallback(async (
    membershipId: string,
    role: "co_creator" | "admin" | "moderator" | "member",
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
      reconcileCommunityMembershipViews(communityId, session);
    } catch (error) {
      console.warn("Failed to set member role:", error);
    }
  }, [reconcileCommunityMembershipViews]);

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
      reconcileCommunityMembershipViews(communityId, session);
    } catch (error) {
      console.warn("Failed to remove member:", error);
    }
  }, [reconcileCommunityMembershipViews]);

  const handleBanCommunityMember = useCallback(async (membershipId: string) => {
    const current = argsRef.current;
    const communityId = current.activeCommunityId;
    const session = await resolveUsableSession(current.session, current.ensureSession);
    if (!session || !communityId) return;
    const confirmed = current.confirmAction
      ? current.confirmAction("Ban this member? They will not be able to rejoin unless unbanned.")
      : window.confirm("Ban this member? They will not be able to rejoin unless unbanned.");
    if (!confirmed) return;
    try {
      await banCloudCommunityMember({
        session,
        communityId,
        membershipId,
      });
      reconcileCommunityMembershipViews(communityId, session);
    } catch (error) {
      console.warn("Failed to ban member:", error);
    }
  }, [reconcileCommunityMembershipViews]);

  return {
    loadSelfProfile,
    saveProfileToCloud,
    loadCommunityAnalytics,
    resetCommunityAnalytics,
    handleSetCommunityMemberRole,
    handleRemoveCommunityMember,
    handleBanCommunityMember,
  };
}
