import type { DragEvent } from "react";

import type { SettingsGroup } from "../../../../shared/appShellNavigation";
import type { SocialProfileLinks } from "../../../../shared/socialProfileLinks";
import type { AppTheme } from "../../../../shared/theme";
import type { useWebProfileSettingsUiController } from "../controllers/useWebProfileSettingsUiController";
import type { AuthSession } from "../auth";
import {
  WebAccountSettingsSection,
  type WebAccountSettingsSectionProps,
} from "./WebAccountSettingsSection";
import { WebAppearanceSettingsSection } from "./WebAppearanceSettingsSection";
import {
  WebEmailPreferencesSection,
  type WebEmailPreferencesSectionProps,
} from "./WebEmailPreferencesSection";
import {
  WebBillingSettingsSection,
  type WebBillingSettingsSectionProps,
} from "./WebBillingSettingsSection";
import { WebPolynetMcpAccountSection } from "./WebPolynetMcpAccountSection";
import { WebProfileSettingsSection } from "./WebProfileSettingsSection";
import { WebArchivedCommunityList } from "./WebArchivedCommunityList";
import { SettingsPageHead, SettingsSaveStatus } from "./SettingsRows";
import { isDesignV1Active } from "../../../../shared/designSystem";
import { settingsGroupLabel } from "../../../../shared/appShellNavigation";

type SessionLike = AuthSession | null;

export type WebSettingsPanelsProps = {
  settingsGroup: SettingsGroup;
  profile: {
    session: SessionLike;
    cloudProfile: unknown | null;
    reloadProfile?: () => void;
    profileUi: ReturnType<typeof useWebProfileSettingsUiController>;
    handleProfileAvatarDrop: (event: DragEvent<HTMLDivElement>) => void;
    handleProfileAvatarUpload: (file: File | null) => Promise<void> | void;
    getInitials: (value: string) => string;
    saveProfileToCloud: (options?: {
      socialLinks?: SocialProfileLinks;
    }) => Promise<boolean | void> | boolean | void;
  };
  account: WebAccountSettingsSectionProps;
  emailPreferences: WebEmailPreferencesSectionProps;
  billing: WebBillingSettingsSectionProps;
  appearance: {
    appTheme: AppTheme;
    setAppTheme: (value: AppTheme) => void;
  };
};

export function WebSettingsPanels(props: WebSettingsPanelsProps) {
  const profileSectionProps = {
    session: props.profile.session,
    cloudProfile: props.profile.cloudProfile,
    profileLoadStatus: props.profile.profileUi.profileLoadStatus,
    reloadProfile: props.profile.reloadProfile,
    profileAvatarUrl: props.profile.profileUi.profileAvatarUrl,
    profileAvatarFocusX: props.profile.profileUi.profileAvatarFocusX,
    profileAvatarFocusY: props.profile.profileUi.profileAvatarFocusY,
    profileAvatarZoom: props.profile.profileUi.profileAvatarZoom,
    profileName: props.profile.profileUi.profileName,
    profileHandle: props.profile.profileUi.profileHandle,
    profileBio: props.profile.profileUi.profileBio,
    profileSocialLinks: props.profile.profileUi.profileSocialLinks,
    isProfileAvatarDragOver: props.profile.profileUi.isProfileAvatarDragOver,
    profileNeedsSave: props.profile.profileUi.profileNeedsSave,
    isSavingProfile: props.profile.profileUi.isSavingProfile,
    isProfileDirty: props.profile.profileUi.isProfileDirty,
    profileSaveError: props.profile.profileUi.profileSaveError,
    isProfileAvatarFocusModalOpen:
      props.profile.profileUi.isProfileAvatarFocusModalOpen,
    setIsProfileAvatarDragOver:
      props.profile.profileUi.setIsProfileAvatarDragOver,
    setProfileAvatarFocusX: props.profile.profileUi.setProfileAvatarFocusX,
    setProfileAvatarFocusY: props.profile.profileUi.setProfileAvatarFocusY,
    setProfileAvatarZoom: props.profile.profileUi.setProfileAvatarZoom,
    setIsProfileAvatarFocusModalOpen:
      props.profile.profileUi.setIsProfileAvatarFocusModalOpen,
    handleProfileAvatarDrop: props.profile.handleProfileAvatarDrop,
    handleProfileAvatarUpload: props.profile.handleProfileAvatarUpload,
    onRemoveProfileAvatar: () => {
      props.profile.profileUi.setProfileAvatarUrl(null);
      props.profile.profileUi.setProfileAvatarStorageId(null);
      props.profile.profileUi.setProfileAvatarFocusX(0.5);
      props.profile.profileUi.setProfileAvatarFocusY(0.5);
      props.profile.profileUi.setProfileAvatarZoom(1);
    },
    getInitials: props.profile.getInitials,
    setProfileName: props.profile.profileUi.setProfileName,
    setProfileHandle: props.profile.profileUi.setProfileHandle,
    setProfileBio: props.profile.profileUi.setProfileBio,
    setProfileSocialLink: props.profile.profileUi.setProfileSocialLink,
    saveProfileToCloud: props.profile.saveProfileToCloud,
  };

  if (isDesignV1Active()) {
    // Design v1 has no Billing page: each community's Agent plan is on its
    // Guide. An old /settings/billing link opens Account.
    if (props.settingsGroup === "billing") {
      return (
        <>
          <SettingsPageHead title={settingsGroupLabel("account")} />
          <WebSettingsPanelBody {...props} settingsGroup="account" profileSectionProps={profileSectionProps} />
        </>
      );
    }
    const p = profileSectionProps;
    const status = props.settingsGroup === "profile" && p.session ? (
      <SettingsSaveStatus saving={p.isSavingProfile} dirty={p.profileNeedsSave}
        error={p.profileSaveError ?? (p.profileLoadStatus === "error" ? "Couldn't load your profile" : null)} />
    ) : null;
    return (
      <>
        <SettingsPageHead title={settingsGroupLabel(props.settingsGroup)} status={status} />
        <WebSettingsPanelBody {...props} profileSectionProps={profileSectionProps} />
      </>
    );
  }
  return <WebSettingsPanelBody {...props} profileSectionProps={profileSectionProps} />;
}

function WebSettingsPanelBody(props: WebSettingsPanelsProps & { profileSectionProps: Parameters<typeof WebProfileSettingsSection>[0] }) {
  const profileSectionProps = props.profileSectionProps;
  switch (props.settingsGroup) {
    case "profile":
      return <WebProfileSettingsSection {...profileSectionProps} />;
    case "account":
      return (
        <>
          <WebAccountSettingsSection {...props.account} />
          <WebEmailPreferencesSection {...props.emailPreferences} />
          <WebPolynetMcpAccountSection session={props.account.session} />
          {isDesignV1Active() && props.account.session ? (
            <WebArchivedCommunityList
              communities={props.account.founderBillingOverview.communities.filter((community) => community.lifecycle_status === "archived")}
              actionCommunityId={props.account.founderBillingActionCommunityId}
              error={props.account.founderBillingError}
              retryCommunityArchive={props.account.retryCommunityArchive}
              restoreCommunityWithoutPayment={props.account.restoreCommunityWithoutPayment}
            />
          ) : null}
        </>
      );
    case "billing":
      return <WebBillingSettingsSection {...props.billing} />;
    case "appearance":
      return (
        <WebAppearanceSettingsSection
          appTheme={props.appearance.appTheme}
          setAppTheme={props.appearance.setAppTheme}
        />
      );
  }
}
