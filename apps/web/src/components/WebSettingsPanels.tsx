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
import { WebProfileCommunityVisibility } from "./WebProfileCommunityVisibility";
import { WebYourMembershipsSection } from "./WebYourMembershipsSection";
import { WebYourDisplaySection } from "./WebYourDisplaySection";
import { WebSettingsFold } from "./WebSettingsFold";
import { WebSocialProfileLinksFields } from "./WebSocialProfileLinksFields";
import { SOCIAL_PROFILE_KINDS } from "../../../../shared/socialProfileLinks";

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
    // The community whose colours Your settings wears, for the Display samples.
    community?: { id: string; name: string } | null;
  };
  // Opens an in-app path (a community's own Settings from Memberships).
  onOpenPath?: (path: string) => void;
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

  switch (props.settingsGroup) {
    case "profile": {
      const visibility = (props.profile.cloudProfile ?? {}) as { show_owned_communities?: boolean; show_joined_communities?: boolean };
      const showOwned = visibility.show_owned_communities !== false;
      const showJoined = visibility.show_joined_communities !== false;
      const ui = props.profile.profileUi;
      const linkCount = SOCIAL_PROFILE_KINDS.filter((kind) => Boolean(ui.profileSocialLinks?.[kind])).length;
      const linksDisabled =
        !props.profile.session || ui.isSavingProfile || ui.profileLoadStatus === "loading" ||
        (!props.profile.cloudProfile && ui.profileLoadStatus === "error");
      return (
        <>
          <WebProfileSettingsSection {...profileSectionProps} hideLinks />
          <WebSettingsFold
            id="profile-links"
            title="Links"
            summary={linkCount === 0 ? "None yet. Add YouTube, X or Instagram." : `${linkCount} ${linkCount === 1 ? "link" : "links"} on your profile`}
          >
            <WebSocialProfileLinksFields
              values={ui.profileSocialLinks}
              disabled={linksDisabled}
              variant="settings"
              onChange={ui.setProfileSocialLink}
              onSave={(nextLinks) => props.profile.saveProfileToCloud({ socialLinks: nextLinks })}
            />
          </WebSettingsFold>
          <WebSettingsFold
            id="profile-communities"
            title="On your profile"
            summary={showOwned && showJoined ? "Shows the communities you create and the ones you're in"
              : showOwned ? "Shows the communities you create"
              : showJoined ? "Shows the communities you're in"
              : "Hides your communities"}
          >
            <WebProfileCommunityVisibility bare session={props.profile.session} showOwned={showOwned} showJoined={showJoined} />
          </WebSettingsFold>
        </>
      );
    }
    case "account":
      return (
        <>
          <WebAccountSettingsSection {...props.account} />
          {props.emailPreferences.isVisible ? (
            <WebSettingsFold
              id="account-email"
              title="Email"
              summary={!props.emailPreferences.hasLoaded ? "Which community emails Polynet sends you"
                : props.emailPreferences.weeklyDigestEnabled ? "Weekly digest on" : "Weekly digest off"}
            >
              <WebEmailPreferencesSection {...props.emailPreferences} />
            </WebSettingsFold>
          ) : null}
        </>
      );
    case "memberships":
      return (
        <WebYourMembershipsSection
          session={props.profile.session}
          onOpenPath={(path) => (props.onOpenPath ? props.onOpenPath(path) : window.location.assign(path))}
        />
      );
    case "apps":
      return <WebPolynetMcpAccountSection session={props.account.session} />;
    case "billing":
      return <WebBillingSettingsSection {...props.billing} />;
    case "appearance":
      return (
        <WebYourDisplaySection
          session={props.profile.session}
          appTheme={props.appearance.appTheme}
          setAppTheme={props.appearance.setAppTheme}
          community={props.appearance.community ?? null}
        />
      );
  }
}
