import type { DragEvent, ReactNode } from "react";
import type { SettingsGroup } from "../../../../shared/appShellNavigation";
import type { AppTheme } from "../../../../shared/theme";
import type { AccountCommerceStatus } from "../../../../shared/accountCommerceStatusGateway";
import type { BuilderPartnerProgramSnapshot } from "../../../../shared/builderPartnerProgramGateway";
import type { SocialProfileLinks } from "../../../../shared/socialProfileLinks";
import type { UseWebProviderConnectionUiControllerResult } from "../controllers/useWebProviderConnectionUiController";
import type { useWebProfileSettingsUiController } from "../controllers/useWebProfileSettingsUiController";
import type { useWebPersonalMemoryUiController } from "../controllers/useWebPersonalMemoryUiController";
import type { UseWebBillingUiControllerResult } from "../controllers/useWebBillingUiController";
import { WebAccountDataExportSection } from "./WebAccountDataExportSection";
import { WebAccountSettingsSection } from "./WebAccountSettingsSection";
import { WebAppearanceSettingsSection } from "./WebAppearanceSettingsSection";
import { WebBillingSettingsSection } from "./WebBillingSettingsSection";
import { WebBuilderPartnerSettingsSection } from "./WebBuilderPartnerSettingsSection";
import { WebPersonalAgentSettingsSection } from "./WebPersonalAgentSettingsSection";
import { WebPersonalMemorySettingsSection } from "./WebPersonalMemorySettingsSection";
import { WebPolynetMcpSettingsSection } from "./WebPolynetMcpSettingsSection";
import { WebProfileSettingsSection } from "./WebProfileSettingsSection";

type SessionLike = {
  user: {
    id: string;
    email?: string | null;
  };
} | null;

type OwnedCommunity = {
  id: string;
  slug: string;
  name: string;
  avatar_url: string | null;
};

export type WebSettingsPanelsProps = {
  settingsGroup: SettingsGroup;
  profile: {
    session: SessionLike;
    cloudProfile: unknown | null;
    profileUi: ReturnType<typeof useWebProfileSettingsUiController>;
    handleProfileAvatarDrop: (event: DragEvent<HTMLDivElement>) => void;
    handleProfileAvatarUpload: (file: File | null) => Promise<void> | void;
    getInitials: (value: string) => string;
    saveProfileToCloud: (options?: { socialLinks?: SocialProfileLinks }) => Promise<boolean | void> | boolean | void;
  };
  account: {
    session: SessionLike;
    authError: string | null;
    requireSignIn: () => void;
    handleSignOut: () => Promise<void> | void;
    isLoadingChatgptConnection: boolean;
    chatgptConnection: {
      connected: boolean;
      email?: string | null;
      updated_at?: string | null;
    };
    isLoadingOpenAiConnection: boolean;
    openAiConnection: {
      connected: boolean;
      key_last_four?: string | null;
      updated_at?: string | null;
    };
    hasPendingChatgptAuth: boolean;
    formatRelativeTime: (value: string) => string;
    communities: OwnedCommunity[];
    communityRoleById: Record<string, string>;
    openOwnedCommunitySettings: (communityId: string) => void;
    communityInitials: (value: string) => string;
    builderPartnerProgram: BuilderPartnerProgramSnapshot | null;
    isLoadingBuilderPartnerProgram: boolean;
    builderPartnerProgramError: string | null;
    isAcceptingBuilderPartnerTerms: boolean;
    renderMarkdown: (text: string) => ReactNode;
    loadBuilderPartnerProgram: (session: NonNullable<SessionLike>) => Promise<void> | void;
    acceptBuilderPartnerTerms: (termsVersion: string) => Promise<void> | void;
    openAccountSetup: () => void;
    openCreateCommunityModal: () => void;
    startStripeConnectOnboarding: (opts?: {
      context?: "account" | "community";
      communitySlug?: string | null;
      country?: string | null;
    }) => Promise<void> | void;
    canUseDevTierOverride: boolean;
    setDevAccountTier: (tier: "free" | "architect") => Promise<void> | void;
    providerConnectionUi: UseWebProviderConnectionUiControllerResult;
    billingUi: UseWebBillingUiControllerResult<AccountCommerceStatus>;
  };
  agent: {
    session: SessionLike;
    exportError: string | null;
    exportThreadsCsv: () => Promise<void> | void;
    exportMessagesCsv: () => Promise<void> | void;
    exportMemoryCsv: () => Promise<void> | void;
    isExporting: boolean;
    userMemorySettings: {
      memory_mode: "off" | "suggest" | "auto";
      remember_intent_enabled: boolean;
      agent_name: string;
      agent_soul: string;
    };
    isLoadingUserMemorySettings: boolean;
    saveUserMemorySettings: (next: {
      memory_mode: "off" | "suggest" | "auto";
      remember_intent_enabled: boolean;
      agent_name: string;
      agent_soul: string;
    }) => Promise<void> | void;
    formatRelativeTime: (value: string) => string;
    handleTogglePersonalMemoryPinned: (item: {
      id: string;
      content: string;
      scope: "global" | "workspace";
      scope_id: string | null;
      pinned: boolean;
      created_at: string;
      updated_at: string;
    }) => Promise<void> | void;
    handleDeletePersonalMemoryItem: (id: string) => Promise<void> | void;
    handleCreatePersonalMemoryItem: () => Promise<void> | void;
    loadPersonalMemoryItems: () => Promise<void> | void;
    personalMemoryUi: ReturnType<typeof useWebPersonalMemoryUiController>;
  };
  billing: {
    session: SessionLike;
    startPremiumSubscriptionCheckout: () => Promise<void> | void;
    billingUi: UseWebBillingUiControllerResult<AccountCommerceStatus>;
  };
  appearance: {
    appTheme: AppTheme;
    setAppTheme: (value: AppTheme) => void;
  };
};

export function WebSettingsPanels(props: WebSettingsPanelsProps) {
  const { settingsGroup, profile, account, agent, billing, appearance } =
    props;

  const profileSectionProps = {
    session: profile.session,
    cloudProfile: profile.cloudProfile,
    profileAvatarUrl: profile.profileUi.profileAvatarUrl,
    profileAvatarFocusX: profile.profileUi.profileAvatarFocusX,
    profileAvatarFocusY: profile.profileUi.profileAvatarFocusY,
    profileAvatarZoom: profile.profileUi.profileAvatarZoom,
    profileName: profile.profileUi.profileName,
    profileHandle: profile.profileUi.profileHandle,
    profileBio: profile.profileUi.profileBio,
    profileSocialLinks: profile.profileUi.profileSocialLinks,
    isProfileAvatarDragOver: profile.profileUi.isProfileAvatarDragOver,
    profileNeedsSave: profile.profileUi.profileNeedsSave,
    isSavingProfile: profile.profileUi.isSavingProfile,
    isProfileDirty: profile.profileUi.isProfileDirty,
    profileSaveError: profile.profileUi.profileSaveError,
    profileSaveSuccess: profile.profileUi.profileSaveSuccess,
    isProfileAvatarFocusModalOpen: profile.profileUi.isProfileAvatarFocusModalOpen,
    setIsProfileAvatarDragOver: profile.profileUi.setIsProfileAvatarDragOver,
    setProfileAvatarFocusX: profile.profileUi.setProfileAvatarFocusX,
    setProfileAvatarFocusY: profile.profileUi.setProfileAvatarFocusY,
    setProfileAvatarZoom: profile.profileUi.setProfileAvatarZoom,
    setIsProfileAvatarFocusModalOpen: profile.profileUi.setIsProfileAvatarFocusModalOpen,
    handleProfileAvatarDrop: profile.handleProfileAvatarDrop,
    handleProfileAvatarUpload: profile.handleProfileAvatarUpload,
    onRemoveProfileAvatar: () => {
      profile.profileUi.setProfileAvatarUrl(null);
      profile.profileUi.setProfileAvatarStorageId(null);
      profile.profileUi.setProfileAvatarFocusX(0.5);
      profile.profileUi.setProfileAvatarFocusY(0.5);
      profile.profileUi.setProfileAvatarZoom(1);
    },
    getInitials: profile.getInitials,
    setProfileName: profile.profileUi.setProfileName,
    setProfileHandle: profile.profileUi.setProfileHandle,
    setProfileBio: profile.profileUi.setProfileBio,
    setProfileSocialLink: profile.profileUi.setProfileSocialLink,
    saveProfileToCloud: profile.saveProfileToCloud,
  };

  const accountSectionProps = {
    session: account.session,
    authError: account.authError,
    requireSignIn: account.requireSignIn,
    handleSignOut: account.handleSignOut,
    isLoadingChatgptConnection: account.isLoadingChatgptConnection,
    chatgptConnection: account.chatgptConnection,
    isConnectingChatgpt: account.providerConnectionUi.isConnectingChatgpt,
    isPollingChatgptConnection: account.providerConnectionUi.isPollingChatgptConnection,
    hasPendingChatgptAuth: account.hasPendingChatgptAuth,
    handleConnectChatgpt: account.providerConnectionUi.handleConnectChatgpt,
    handleDisconnectChatgpt: account.providerConnectionUi.handleDisconnectChatgpt,
    chatgptDeviceUserCode: account.providerConnectionUi.chatgptDeviceUserCode,
    chatgptConnectionError: account.providerConnectionUi.chatgptConnectionError,
    chatgptConnectionSuccess: account.providerConnectionUi.chatgptConnectionSuccess,
    isLoadingOpenAiConnection: account.isLoadingOpenAiConnection,
    openAiConnection: account.openAiConnection,
    openAiApiKeyDraft: account.providerConnectionUi.openAiApiKeyDraft,
    setOpenAiApiKeyDraft: account.providerConnectionUi.setOpenAiApiKeyDraft,
    isSavingOpenAiConnection: account.providerConnectionUi.isSavingOpenAiConnection,
    openAiConnectionError: account.providerConnectionUi.openAiConnectionError,
    openAiConnectionSuccess: account.providerConnectionUi.openAiConnectionSuccess,
    handleConnectOpenAi: account.providerConnectionUi.handleConnectOpenAi,
    handleDisconnectOpenAi: account.providerConnectionUi.handleDisconnectOpenAi,
    formatRelativeTime: account.formatRelativeTime,
    accountCommerceStatus: account.billingUi.accountCommerceStatus,
    communities: account.communities,
    communityRoleById: account.communityRoleById,
    openOwnedCommunitySettings: account.openOwnedCommunitySettings,
    communityInitials: account.communityInitials,
    builderPartnerProgram: account.builderPartnerProgram,
    isLoadingBuilderPartnerProgram: account.isLoadingBuilderPartnerProgram,
    builderPartnerProgramError: account.builderPartnerProgramError,
    isAcceptingBuilderPartnerTerms: account.isAcceptingBuilderPartnerTerms,
    renderMarkdown: account.renderMarkdown,
    loadBuilderPartnerProgram: account.loadBuilderPartnerProgram,
    acceptBuilderPartnerTerms: account.acceptBuilderPartnerTerms,
    openAccountSetup: account.openAccountSetup,
    openCreateCommunityModal: account.openCreateCommunityModal,
    startStripeConnectOnboarding: account.startStripeConnectOnboarding,
    accountCommerceError: account.billingUi.accountCommerceError,
    isStartingStripeConnectOnboarding: account.billingUi.isStartingStripeConnectOnboarding,
    canUseDevTierOverride: account.canUseDevTierOverride,
    isSettingDevAccountTier: account.billingUi.isSettingDevAccountTier,
    setDevAccountTier: account.setDevAccountTier,
    devAccountTierError: account.billingUi.devAccountTierError,
  };

  const personalAgentSectionProps = {
    session: agent.session,
    settings: agent.userMemorySettings,
    isLoading: agent.isLoadingUserMemorySettings,
    onSave: agent.saveUserMemorySettings,
  };

  const personalMemorySectionProps = {
    session: agent.session,
    error: agent.personalMemoryUi.personalMemoryError,
    isLoading: agent.personalMemoryUi.isLoadingPersonalMemory,
    items: agent.personalMemoryUi.personalMemoryItems,
    query: agent.personalMemoryUi.personalMemoryQuery,
    setQuery: agent.personalMemoryUi.setPersonalMemoryQuery,
    loadItems: agent.loadPersonalMemoryItems,
    formatRelativeTime: agent.formatRelativeTime,
    togglePinned: agent.handleTogglePersonalMemoryPinned,
    deleteItem: agent.handleDeletePersonalMemoryItem,
    newContent: agent.personalMemoryUi.newPersonalMemoryContent,
    setNewContent: agent.personalMemoryUi.setNewPersonalMemoryContent,
    createItem: agent.handleCreatePersonalMemoryItem,
  };

  const dataExportSectionProps = {
    session: agent.session,
    error: agent.exportError,
    isExporting: agent.isExporting,
    exportThreadsCsv: agent.exportThreadsCsv,
    exportMessagesCsv: agent.exportMessagesCsv,
    exportMemoryCsv: agent.exportMemoryCsv,
  };

  const billingSectionProps = {
    session: billing.session,
    accountCommerceStatus: billing.billingUi.accountCommerceStatus,
    isLoadingAccountCommerce: billing.billingUi.isLoadingAccountCommerce,
    accountCommerceError: billing.billingUi.accountCommerceError,
    startPremiumSubscriptionCheckout: billing.startPremiumSubscriptionCheckout,
  };

  const appearanceSectionProps = {
    appTheme: appearance.appTheme,
    setAppTheme: appearance.setAppTheme,
  };

  return (
    <>
      {settingsGroup === "profile" ? (
        <WebProfileSettingsSection {...profileSectionProps} />
      ) : null}
      {settingsGroup === "account" ? (
        <>
          <WebAccountSettingsSection {...accountSectionProps} />
          <WebPersonalAgentSettingsSection {...personalAgentSectionProps} />
          <WebPersonalMemorySettingsSection {...personalMemorySectionProps} />
          <WebAccountDataExportSection {...dataExportSectionProps} />
        </>
      ) : null}
      {settingsGroup === "billing" ? (
        <WebBillingSettingsSection {...billingSectionProps} />
      ) : null}
      {settingsGroup === "mcp" ? <WebPolynetMcpSettingsSection /> : null}
      {settingsGroup === "partners" ? (
        <WebBuilderPartnerSettingsSection {...accountSectionProps} />
      ) : null}
      {settingsGroup === "appearance" ? (
        <WebAppearanceSettingsSection {...appearanceSectionProps} />
      ) : null}
    </>
  );
}
