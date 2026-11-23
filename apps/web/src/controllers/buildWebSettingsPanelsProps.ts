import type { MutableRefObject } from "react";
import type { SettingsGroup } from "../../../../shared/appShellNavigation";
import type { AuthSession } from "../auth";
import type { WebSettingsPanelsProps } from "../components/WebSettingsPanels";
import type { useWebEmailPreferencesController } from "./useWebEmailPreferencesController";
import type { useWebFounderBillingController } from "./useWebFounderBillingController";

type EmailPreferencesController = ReturnType<typeof useWebEmailPreferencesController>;
type FounderBillingController = ReturnType<typeof useWebFounderBillingController>;

export function buildWebSettingsPanelsProps(params: {
  settingsGroup: SettingsGroup;
  session: AuthSession | null;
  sessionRef: MutableRefObject<AuthSession | null>;
  cloudProfile: WebSettingsPanelsProps["profile"]["cloudProfile"];
  profileUi: WebSettingsPanelsProps["profile"]["profileUi"];
  loadSelfProfile: (session: AuthSession) => Promise<unknown> | void;
  handleProfileAvatarDrop: WebSettingsPanelsProps["profile"]["handleProfileAvatarDrop"];
  handleProfileAvatarUpload: WebSettingsPanelsProps["profile"]["handleProfileAvatarUpload"];
  getInitials: WebSettingsPanelsProps["profile"]["getInitials"];
  saveProfileToCloud: WebSettingsPanelsProps["profile"]["saveProfileToCloud"];
  authError: string | null;
  requireSignIn: WebSettingsPanelsProps["account"]["requireSignIn"];
  handleSignOut: WebSettingsPanelsProps["account"]["handleSignOut"];
  founderBilling: FounderBillingController;
  emailPreferences: EmailPreferencesController;
  appTheme: WebSettingsPanelsProps["appearance"]["appTheme"];
  setAppTheme: WebSettingsPanelsProps["appearance"]["setAppTheme"];
}): WebSettingsPanelsProps {
  const { founderBilling, emailPreferences } = params;
  return {
    settingsGroup: params.settingsGroup,
    profile: {
      session: params.session,
      cloudProfile: params.cloudProfile,
      profileUi: params.profileUi,
      reloadProfile: () => {
        const currentSession = params.sessionRef.current;
        if (currentSession) void params.loadSelfProfile(currentSession);
      },
      handleProfileAvatarDrop: params.handleProfileAvatarDrop,
      handleProfileAvatarUpload: params.handleProfileAvatarUpload,
      getInitials: params.getInitials,
      saveProfileToCloud: params.saveProfileToCloud,
    },
    account: {
      session: params.session,
      authError: params.authError,
      requireSignIn: params.requireSignIn,
      handleSignOut: params.handleSignOut,
      founderBillingOverview: founderBilling.overview,
      founderBillingActionCommunityId: founderBilling.actionCommunityId,
      founderBillingError: founderBilling.error,
      retryCommunityArchive: founderBilling.retryArchiveCleanup,
      restoreCommunityWithoutPayment: founderBilling.restoreCommunityWithoutPayment,
    },
    emailPreferences: {
      isVisible: Boolean(params.session),
      weeklyDigestEnabled: emailPreferences.weeklyDigestEnabled,
      hasLoaded: emailPreferences.hasLoaded,
      isLoading: emailPreferences.isLoading,
      isSaving: emailPreferences.isSaving,
      error: emailPreferences.error,
      onChangeWeeklyDigestEnabled: emailPreferences.updateWeeklyDigestEnabled,
    },
    appearance: {
      appTheme: params.appTheme,
      setAppTheme: params.setAppTheme,
    },
  };
}
