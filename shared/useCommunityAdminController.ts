import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";
import { resolveAuthSubject } from "./authSession";
import { formatProfileMutationError } from "./profileMutationErrors";
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
import { preloadImageUrls } from "./preloadImageUrls";

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
  ensureCommunityChatThread: (communityId: string, session: SessionT) => Promise<string>;
  confirmAction?: (message: string) => boolean;
  reloadCommunities: (session: SessionT) => Promise<void>;
  reloadCommunityAccess: (communityId: string, session: SessionT) => Promise<void>;

  getProfileSaveSession: () => SessionT | null;
  profileName: string;
  profileHandle: string;
  profileBio: string;
  profileSocialLinks: SocialProfileLinks;
  profileAvatarUrl: string | null;
  profileAvatarStorageId: string | null;
  profileAvatarFocusX: number;
  profileAvatarFocusY: number;
  profileAvatarZoom: number;
  profileSaveTimeoutRef: MutableRefObject<number | null>;
  profileSaveFailureMessage: string;
  profileSaveUnauthenticatedErrorMessage: string | null;
  onProfileSaveUnauthenticated?: () => void;
  applyLoadedProfileToLocal?: (profile: UserProfileDetailT) => void;

  setProfilesByUserId: Dispatch<SetStateAction<Record<string, UserProfileT>>>;
  setCloudProfile: Dispatch<SetStateAction<UserProfileDetailT | null>>;
  setProfileName: Dispatch<SetStateAction<string>>;
  setProfileHandle: Dispatch<SetStateAction<string>>;
  setProfileBio: Dispatch<SetStateAction<string>>;
  setProfileSocialLinks: Dispatch<SetStateAction<SocialProfileLinks>>;
  setProfileAvatarUrl: Dispatch<SetStateAction<string | null>>;
  setProfileAvatarStorageId: Dispatch<SetStateAction<string | null>>;
  setProfileAvatarFocusX: Dispatch<SetStateAction<number>>;
  setProfileAvatarFocusY: Dispatch<SetStateAction<number>>;
  setProfileAvatarZoom: Dispatch<SetStateAction<number>>;
  setIsSavingProfile: Dispatch<SetStateAction<boolean>>;
  setProfileSaveError: Dispatch<SetStateAction<string | null>>;
  setProfileSaveSuccess: Dispatch<SetStateAction<boolean>>;

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
      await preloadImageUrls([row.avatar_url ?? null], { maxUrls: 1, timeoutMs: 1200 });
      current.setCloudProfile(row);
      current.setProfilesByUserId((prev) => ({
        ...prev,
        [row.user_id]: {
          user_id: row.user_id,
          display_name: row.display_name,
          handle: row.handle ?? null,
          normalized_handle: row.normalized_handle ?? null,
          avatar_url: row.avatar_url,
          avatar_storage_id: row.avatar_storage_id ?? null,
          avatar_focus_x: row.avatar_focus_x ?? 0.5,
          avatar_focus_y: row.avatar_focus_y ?? 0.5,
          avatar_zoom: row.avatar_zoom ?? 1,
        } as UserProfileT,
      }));
      current.applyLoadedProfileToLocal?.(row);
    } catch {
      // ignore
    }
  }, [resolveCanonicalProfileUserId]);

  const saveProfileToCloud = useCallback(async (options: SaveProfileToCloudOptions = {}): Promise<boolean> => {
    const current = argsRef.current;
    const session = await resolveUsableSession(current.getProfileSaveSession(), current.ensureSession);
    if (!session) {
      current.setProfileSaveError(current.profileSaveUnauthenticatedErrorMessage);
      current.onProfileSaveUnauthenticated?.();
      return false;
    }

    const { trimmedName, trimmedHandle, trimmedBio } = trimProfileFields(
      current.profileName,
      current.profileHandle,
      current.profileBio,
    );
    if (trimmedName !== current.profileName) current.setProfileName(trimmedName);
    if (trimmedHandle !== current.profileHandle) current.setProfileHandle(trimmedHandle);
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
      const avatarField = await prepareCloudProfileAvatarField({
        session,
        nextValue: current.profileAvatarUrl,
        currentStorageId: current.profileAvatarStorageId,
        currentResolvedUrl: current.profileAvatarUrl,
      });
      const nextSocialLinks = options.socialLinks ?? current.profileSocialLinks;
      const saved = await upsertCloudProfileDetail<SessionT, UserProfileDetailT>({
        session,
        userId: profileUserId,
        displayName: trimmedName || null,
        handle: trimmedHandle || null,
        avatarStorageId: avatarField.storageId ?? null,
        avatarUrl: avatarField.url ?? null,
        avatarFocusX: current.profileAvatarFocusX,
        avatarFocusY: current.profileAvatarFocusY,
        avatarZoom: current.profileAvatarZoom,
        bio: trimmedBio || null,
        socialLinks: nextSocialLinks,
      });
      if (!saved) {
        current.setProfileSaveError(current.profileSaveFailureMessage);
        return false;
      }
      current.setCloudProfile(saved);
      current.setProfilesByUserId((prev) => ({
        ...prev,
        [saved.user_id]: {
          user_id: saved.user_id,
          display_name: saved.display_name,
          handle: saved.handle ?? null,
          normalized_handle: saved.normalized_handle ?? null,
          avatar_url: saved.avatar_url,
          avatar_storage_id: saved.avatar_storage_id ?? null,
          avatar_focus_x: saved.avatar_focus_x ?? 0.5,
          avatar_focus_y: saved.avatar_focus_y ?? 0.5,
          avatar_zoom: saved.avatar_zoom ?? 1,
        } as UserProfileT,
      }));
      current.setProfileName(saved.display_name ?? "");
      current.setProfileHandle(saved.handle ?? "");
      current.setProfileBio(saved.bio ?? "");
      current.setProfileSocialLinks(saved.social_links ?? {
        youtube: "",
        x: "",
        instagram: "",
      });
      current.setProfileAvatarUrl(saved.avatar_url ?? null);
      current.setProfileAvatarStorageId(saved.avatar_storage_id ?? null);
      current.setProfileAvatarFocusX(saved.avatar_focus_x ?? 0.5);
      current.setProfileAvatarFocusY(saved.avatar_focus_y ?? 0.5);
      current.setProfileAvatarZoom(saved.avatar_zoom ?? 1);
      current.setProfileSaveSuccess(true);
      current.profileSaveTimeoutRef.current = window.setTimeout(() => current.setProfileSaveSuccess(false), 2000);
      return true;
    } catch (error) {
      current.setProfileSaveError(formatProfileMutationError(error, current.profileSaveFailureMessage));
      return false;
    } finally {
      current.setIsSavingProfile(false);
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
