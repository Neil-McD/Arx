import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { hasRecentAuthFlowPending, type AuthSession } from "../auth";
import {
  loadCloudAccountSetupStatus,
  prepareCloudProfileAvatarField,
  recordMemberTimezoneRpc,
  resolveCloudOnboardingProfileDetail,
  upsertCloudProfileDetail,
} from "../../../../shared/cloudProfilesGateway";
import {
  formatAccountSetupMissingGuidance,
  isAccountSetupStatusIdentityComplete,
  type AccountSetupStatus,
} from "../../../../shared/accountSetup";
import { resolveAuthSubject } from "../../../../shared/authSession";
import type { UserProfileDetail } from "../../../../shared/communityTypes";
import { formatProfileMutationError } from "../../../../shared/profileMutationErrors";
import type { AppPage } from "../../../../shared/appShellNavigation";
import { isRootAppRoutePath } from "../../../../shared/webAppRouteState";
import { useWebProfileSettingsUiController } from "./useWebProfileSettingsUiController";
import { readProfileDraftForUser } from "../../../../shared/profileDraftStorage";

type LegalAcceptance = {
  termsOfServiceVersion: string;
  privacyPolicyVersion: string;
} | null;

type ProfileDraft = {
  name: string;
  handle: string;
  bio: string;
};

type OnboardingActions = {
  navigateTo: (path: string, options?: { replace?: boolean }) => void;
  enterDefaultDestination: (options: {
    session: AuthSession;
    replace: boolean;
  }) => Promise<boolean>;
};

export function useWebOnboardingProfileController(params: {
  session: AuthSession | null;
  getSession: () => AuthSession | null;
  ensureSession: (
    session?: AuthSession | null,
    reason?: string,
  ) => Promise<AuthSession | null>;
  requireSignIn: (intent?: {
    reason: string;
    payload: Record<string, unknown>;
  }) => void;
  profileStorageUserId: string | null;
  activePage: AppPage;
  publicRouteKind: string;
  isAuthBootstrapComplete: boolean;
}) {
  const initialProfileDraft = useMemo<ProfileDraft>(
    () => readProfileDraftForUser(params.profileStorageUserId),
    [params.profileStorageUserId],
  );
  const [cloudProfile, setCloudProfile] = useState<UserProfileDetail | null>(null);
  const [accountSetupStatus, setAccountSetupStatus] =
    useState<AccountSetupStatus | null>(null);
  const [isLoadingAccountSetupStatus, setIsLoadingAccountSetupStatus] =
    useState(false);
  const [hasLoadedOnboardingProfile, setHasLoadedOnboardingProfile] =
    useState(false);
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);
  const [isSavingOnboarding, setIsSavingOnboarding] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const actionsRef = useRef<OnboardingActions>({
    navigateTo: () => undefined,
    enterDefaultDestination: async () => false,
  });
  const getSessionRef = useRef(params.getSession);
  getSessionRef.current = params.getSession;
  const timezoneSyncKeyRef = useRef<string | null>(null);
  const onboardingRedirectUserIdRef = useRef<string | null>(null);

  const profile = useWebProfileSettingsUiController({
    profileStorageUserId: params.profileStorageUserId,
    initialProfileDraft,
    session: params.session,
    cloudProfile,
  });

  const effectiveAccountSetupStatus =
    accountSetupStatus ?? cloudProfile?.account_setup ?? null;
  const isProfileSetupCompleteForPublicActions =
    !params.session ||
    Boolean(
      effectiveAccountSetupStatus &&
      isAccountSetupStatusIdentityComplete(effectiveAccountSetupStatus),
    );
  const isAccountSetupCompleteForBuilderActions =
    !params.session || Boolean(effectiveAccountSetupStatus?.completed);

  const applySavedProfile = useCallback(
    (saved: UserProfileDetail): void => {
      setCloudProfile(saved);
      if (saved.account_setup) setAccountSetupStatus(saved.account_setup);
      setHasLoadedOnboardingProfile(true);
      profile.setProfileName(saved.display_name ?? "");
      profile.setProfileHandle(saved.handle ?? "");
      profile.setProfileBio(saved.bio ?? "");
      profile.setProfileSocialLinks(
        saved.social_links ?? { youtube: "", x: "", instagram: "" },
      );
      profile.setProfileAvatarUrl(saved.avatar_url ?? null);
      profile.setProfileAvatarStorageId(saved.avatar_storage_id ?? null);
      profile.setProfileAvatarFocusX(saved.avatar_focus_x ?? 0.5);
      profile.setProfileAvatarFocusY(saved.avatar_focus_y ?? 0.5);
      profile.setProfileAvatarZoom(saved.avatar_zoom ?? 1);
    },
    [profile],
  );

  const openProfileSetup = useCallback(() => {
    setOnboardingError(null);
    setIsOnboardingModalOpen(true);
  }, []);

  const closeProfileSetup = useCallback(() => {
    setIsOnboardingModalOpen(false);
  }, []);

  const refreshAccountSetupStatus = useCallback(
    async (
      nextSession: AuthSession | null =
        getSessionRef.current() ?? params.session,
    ) => {
      if (!nextSession) {
        setAccountSetupStatus(null);
        return null;
      }
      const usableSession = await params.ensureSession(nextSession);
      if (!usableSession) return null;
      setIsLoadingAccountSetupStatus(true);
      try {
        const status = await loadCloudAccountSetupStatus<AuthSession>({
          session: usableSession,
        });
        setAccountSetupStatus(status);
        return status;
      } catch {
        return null;
      } finally {
        setIsLoadingAccountSetupStatus(false);
      }
    },
    [params.ensureSession, params.session],
  );

  const loadProfileForOnboarding = useCallback(
    async (activeSession: AuthSession): Promise<UserProfileDetail | null> => {
      const userId = resolveAuthSubject(activeSession);
      if (!userId) return null;
      const row = await resolveCloudOnboardingProfileDetail<
        AuthSession,
        UserProfileDetail
      >({
        session: activeSession,
        userId,
      });
      setHasLoadedOnboardingProfile(true);
      if (row) {
        setCloudProfile(row);
        if (row.account_setup) setAccountSetupStatus(row.account_setup);
        profile.applyLoadedProfileToLocal(row);
      }
      return row;
    },
    [profile],
  );

  const validateProfileInputs = useCallback(
    (legalAcceptance: LegalAcceptance): boolean => {
      const displayName = profile.profileName.trim();
      const handle = profile.profileHandle.trim() || null;
      const avatarUrl = profile.profileAvatarUrl?.trim() || null;
      if (!displayName || !handle || !avatarUrl) {
        setOnboardingError(
          "Add your display name, handle, and profile photo to continue.",
        );
        return false;
      }
      const currentSetup =
        accountSetupStatus ?? cloudProfile?.account_setup ?? null;
      if (
        currentSetup?.missing.includes("platform_legal") !== false &&
        !legalAcceptance
      ) {
        setOnboardingError(
          "Agree to the Terms of Service and acknowledge the Privacy & AI Data Policy to continue.",
        );
        return false;
      }
      return true;
    },
    [accountSetupStatus, cloudProfile?.account_setup, profile],
  );

  const saveOnboardingProfile = useCallback(
    async (legalAcceptance: LegalAcceptance): Promise<boolean> => {
      const activeSession = await params.ensureSession();
      if (!activeSession) {
        params.requireSignIn({ reason: "try_polynet_free", payload: {} });
        return false;
      }
      const userId = resolveAuthSubject(activeSession);
      if (!userId) {
        setOnboardingError(
          "We could not verify your account. Sign in again to continue.",
        );
        return false;
      }
      if (!validateProfileInputs(legalAcceptance)) return false;

      setIsSavingOnboarding(true);
      setOnboardingError(null);
      try {
        const avatarField = await prepareCloudProfileAvatarField<AuthSession>({
          session: activeSession,
          nextValue: profile.profileAvatarUrl,
          currentStorageId: profile.profileAvatarStorageId,
          currentResolvedUrl: profile.profileAvatarUrl,
        });
        const saved = await upsertCloudProfileDetail<
          AuthSession,
          UserProfileDetail
        >({
          session: activeSession,
          userId,
          displayName: profile.profileName.trim(),
          handle: profile.profileHandle.trim() || null,
          avatarStorageId: avatarField.storageId ?? null,
          avatarUrl: avatarField.url ?? null,
          avatarFocusX: profile.profileAvatarFocusX,
          avatarFocusY: profile.profileAvatarFocusY,
          avatarZoom: profile.profileAvatarZoom,
          bio: profile.profileBio.trim() || null,
          socialLinks: profile.profileSocialLinks,
          markOnboardingDismissed: false,
          termsOfServiceVersion:
            legalAcceptance?.termsOfServiceVersion ?? null,
          privacyPolicyVersion:
            legalAcceptance?.privacyPolicyVersion ?? null,
        });
        if (saved) applySavedProfile(saved);
        return true;
      } catch (error) {
        setOnboardingError(
          formatProfileMutationError(error, "Failed to save your profile."),
        );
        return false;
      } finally {
        setIsSavingOnboarding(false);
      }
    },
    [
      applySavedProfile,
      params.ensureSession,
      params.requireSignIn,
      profile,
      validateProfileInputs,
    ],
  );

  const finishOnboarding = useCallback(
    async (options?: { navigate?: boolean }): Promise<boolean> => {
      const shouldNavigate = options?.navigate !== false;
      const activeSession = await params.ensureSession();
      if (!activeSession) {
        params.requireSignIn({ reason: "try_polynet_free", payload: {} });
        return false;
      }
      const userId = resolveAuthSubject(activeSession);
      if (!userId) {
        setOnboardingError(
          "We could not verify your account. Sign in again to continue.",
        );
        return false;
      }

      const displayName = profile.profileName.trim() || null;
      const handle = profile.profileHandle.trim() || null;
      const avatarUrl = profile.profileAvatarUrl?.trim() || null;
      if (!displayName || !handle || !avatarUrl) {
        setOnboardingError(
          "Add your display name, handle, and profile photo to continue.",
        );
        return false;
      }

      setIsSavingOnboarding(true);
      setOnboardingError(null);
      try {
        const latestSetup = await loadCloudAccountSetupStatus<AuthSession>({
          session: activeSession,
        });
        if (latestSetup) setAccountSetupStatus(latestSetup);
        if (!latestSetup?.completed) {
          setOnboardingError(formatAccountSetupMissingGuidance(latestSetup));
          if (shouldNavigate) setIsOnboardingModalOpen(true);
          return false;
        }
        const avatarField = await prepareCloudProfileAvatarField<AuthSession>({
          session: activeSession,
          nextValue: profile.profileAvatarUrl,
          currentStorageId: profile.profileAvatarStorageId,
          currentResolvedUrl: profile.profileAvatarUrl,
        });
        const saved = await upsertCloudProfileDetail<
          AuthSession,
          UserProfileDetail
        >({
          session: activeSession,
          userId,
          displayName,
          handle,
          avatarStorageId: avatarField.storageId ?? null,
          avatarUrl: avatarField.url ?? null,
          avatarFocusX: profile.profileAvatarFocusX,
          avatarFocusY: profile.profileAvatarFocusY,
          avatarZoom: profile.profileAvatarZoom,
          bio: profile.profileBio.trim() || null,
          socialLinks: profile.profileSocialLinks,
          completeOnboarding: true,
        });
        if (saved) applySavedProfile(saved);
        setIsOnboardingModalOpen(false);

        if (!shouldNavigate) return true;
        const entered = await actionsRef.current.enterDefaultDestination({
          session: activeSession,
          replace: true,
        });
        if (!entered) {
          setOnboardingError("We could not open your community. Try again.");
          return false;
        }
        return true;
      } catch (error) {
        setOnboardingError(
          formatProfileMutationError(error, "Failed to save onboarding."),
        );
        return false;
      } finally {
        setIsSavingOnboarding(false);
      }
    },
    [
      applySavedProfile,
      params.ensureSession,
      params.requireSignIn,
      profile,
    ],
  );

  const routeTryPolynetFree = useCallback(
    async (
      nextSession: AuthSession | null =
        getSessionRef.current() ?? params.session,
    ): Promise<void> => {
      if (!nextSession) {
        params.requireSignIn({ reason: "try_polynet_free", payload: {} });
        return;
      }
      try {
        const row = await loadProfileForOnboarding(nextSession);
        if (row?.account_setup?.completed) {
          setIsOnboardingModalOpen(false);
          const entered =
            await actionsRef.current.enterDefaultDestination({
              session: nextSession,
              replace: true,
            });
          if (!entered) {
            setOnboardingError("We could not open your community. Try again.");
            actionsRef.current.navigateTo("/discover", { replace: true });
          }
          return;
        }
      } catch {
        // Unknown setup state is resolved by the canonical platform bridge.
      }
      actionsRef.current.navigateTo("/onboarding");
    },
    [
      loadProfileForOnboarding,
      params.requireSignIn,
      params.session,
    ],
  );

  const resetSignedOutState = useCallback(() => {
    setCloudProfile(null);
    setAccountSetupStatus(null);
    setIsLoadingAccountSetupStatus(false);
    setHasLoadedOnboardingProfile(false);
    setIsOnboardingModalOpen(false);
    setIsSavingOnboarding(false);
    setOnboardingError(null);
    timezoneSyncKeyRef.current = null;
    onboardingRedirectUserIdRef.current = null;
  }, []);

  useEffect(() => {
    resetSignedOutState();
  }, [params.profileStorageUserId, resetSignedOutState]);

  useEffect(() => {
    if (
      !params.isAuthBootstrapComplete ||
      !params.session ||
      params.publicRouteKind !== "app" ||
      params.activePage !== "landing" ||
      !isRootAppRoutePath(window.location.pathname || "/")
    ) {
      return;
    }
    void routeTryPolynetFree(params.session);
  }, [
    params.activePage,
    params.isAuthBootstrapComplete,
    params.publicRouteKind,
    params.session,
    routeTryPolynetFree,
  ]);

  useEffect(() => {
    if (params.activePage !== "onboarding") return;
    if (!params.isAuthBootstrapComplete || params.session) return;
    if (hasRecentAuthFlowPending()) return;
    params.requireSignIn({ reason: "try_polynet_free", payload: {} });
  }, [
    params.activePage,
    params.isAuthBootstrapComplete,
    params.requireSignIn,
    params.session,
  ]);

  useEffect(() => {
    if (params.activePage !== "onboarding" || !params.session) return;
    let cancelled = false;
    void (async () => {
      const row =
        cloudProfile ?? (await loadProfileForOnboarding(params.session!));
      if (cancelled || !row?.account_setup?.completed) return;
      const userId = resolveAuthSubject(params.session);
      if (!userId || onboardingRedirectUserIdRef.current === userId) return;
      onboardingRedirectUserIdRef.current = userId;
      setIsOnboardingModalOpen(false);
      const entered = await actionsRef.current.enterDefaultDestination({
        session: params.session!,
        replace: true,
      });
      if (!cancelled && !entered) {
        setOnboardingError("We could not open your community. Try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    cloudProfile,
    loadProfileForOnboarding,
    params.activePage,
    params.session,
  ]);

  useEffect(() => {
    const authSubject = resolveAuthSubject(params.session);
    if (!params.session || !cloudProfile || !authSubject) return;
    let browserTimezone = "";
    try {
      browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    } catch {
      return;
    }
    if (!browserTimezone) return;
    const syncKey = `${authSubject}:${browserTimezone}`;
    if (timezoneSyncKeyRef.current === syncKey) return;
    timezoneSyncKeyRef.current = syncKey;
    const stored =
      (cloudProfile as { timezone?: string | null }).timezone ?? null;
    if (stored === browserTimezone) return;
    void recordMemberTimezoneRpc({
      session: params.session,
      timezone: browserTimezone,
    }).catch(() => null);
  }, [cloudProfile, params.session]);

  useEffect(() => {
    const needsProfile =
      params.activePage === "settings" ||
      params.activePage === "community" ||
      params.activePage === "onboarding" ||
      params.publicRouteKind === "community_funnel";
    if (
      !needsProfile ||
      !params.isAuthBootstrapComplete ||
      !params.session ||
      cloudProfile ||
      hasLoadedOnboardingProfile
    ) {
      return;
    }
    void loadProfileForOnboarding(params.session);
  }, [
    cloudProfile,
    hasLoadedOnboardingProfile,
    loadProfileForOnboarding,
    params.activePage,
    params.isAuthBootstrapComplete,
    params.publicRouteKind,
    params.session,
  ]);

  return useMemo(
    () => ({
      actionsRef,
      profile,
      cloudProfile,
      setCloudProfile,
      accountSetupStatus,
      setAccountSetupStatus,
      isLoadingAccountSetupStatus,
      setIsLoadingAccountSetupStatus,
      effectiveAccountSetupStatus,
      isProfileSetupCompleteForPublicActions,
      isAccountSetupCompleteForBuilderActions,
      hasLoadedOnboardingProfile,
      setHasLoadedOnboardingProfile,
      isOnboardingModalOpen,
      setIsOnboardingModalOpen,
      isSavingOnboarding,
      onboardingError,
      setOnboardingError,
      openProfileSetup,
      closeProfileSetup,
      refreshAccountSetupStatus,
      loadProfileForOnboarding,
      validateProfileInputs,
      saveOnboardingProfile,
      finishOnboarding,
      routeTryPolynetFree,
      resetSignedOutState,
    }),
    [
      accountSetupStatus,
      closeProfileSetup,
      cloudProfile,
      effectiveAccountSetupStatus,
      finishOnboarding,
      hasLoadedOnboardingProfile,
      isAccountSetupCompleteForBuilderActions,
      isLoadingAccountSetupStatus,
      isOnboardingModalOpen,
      isProfileSetupCompleteForPublicActions,
      isSavingOnboarding,
      loadProfileForOnboarding,
      onboardingError,
      openProfileSetup,
      profile,
      refreshAccountSetupStatus,
      routeTryPolynetFree,
      saveOnboardingProfile,
      validateProfileInputs,
      resetSignedOutState,
    ],
  );
}
