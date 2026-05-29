import type { DragEvent, ReactNode } from "react";
import type { SettingsGroup } from "../../../../shared/appShellNavigation";
import type { AppTheme } from "../../../../shared/theme";
import type { AccountCommerceStatus } from "../../../../shared/accountCommerceStatusGateway";
import type { BuilderPartnerProgramSnapshot } from "../../../../shared/builderPartnerProgramGateway";
import type { SocialProfileLinks } from "../../../../shared/socialProfileLinks";
import type {
  WorkspaceBillingOverview,
  WorkspaceCreditBalance,
} from "../../../../shared/workspaceCreditsGateway";
import type {
  WorkspaceCreditTopupSurface,
  WorkspaceToolBalanceTopupPackId,
} from "../../../../shared/workspaceCredits";
import type { PendingPurchaseClaim } from "../../../../shared/pay_first";
import type { EffectiveMcpApp } from "../../../../shared/effectiveMcpApps";
import type { EffectiveSkill } from "../../../../shared/effectiveSkills";
import type { DeveloperAppAuthType } from "../../../../shared/communityAppMountTypes";
import type { CreateSkillPackageInput } from "../../../../shared/skillPackageTypes";
import type { UserPlatformInstalledSkill } from "../../../../shared/userPlatformSkillTypes";
import type {
  BeginUserPlatformAppOAuthOptions,
  BeginUserPlatformAppOAuthResult,
  ConnectUserPlatformAppInput,
  ConnectUserPlatformAppResult,
} from "../../../../shared/userPlatformAppMountTypes";
import type { UseWebProviderConnectionUiControllerResult } from "../controllers/useWebProviderConnectionUiController";
import type { useWebProfileSettingsUiController } from "../controllers/useWebProfileSettingsUiController";
import type { useWebPersonalMemoryUiController } from "../controllers/useWebPersonalMemoryUiController";
import type { UseWebBillingUiControllerResult } from "../controllers/useWebBillingUiController";
import { WebAccountSettingsSection } from "./WebAccountSettingsSection";
import { WebAgentSettingsSection } from "./WebAgentSettingsSection";
import { WebAppearanceSettingsSection } from "./WebAppearanceSettingsSection";
import { WebBillingSettingsSection } from "./WebBillingSettingsSection";
import { WebBuilderPartnerSettingsSection } from "./WebBuilderPartnerSettingsSection";
import { WebIntegrationsSettingsSection } from "./WebIntegrationsSettingsSection";
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
    deleteAccount: () => Promise<void> | void;
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
    redeemPendingPurchases: () => Promise<void> | void;
    ensureSession: () => Promise<SessionLike>;
    loadPendingPurchaseClaims: (session: NonNullable<SessionLike>) => Promise<void>;
    providerConnectionUi: UseWebProviderConnectionUiControllerResult;
    billingUi: UseWebBillingUiControllerResult<
      AccountCommerceStatus,
      WorkspaceCreditBalance,
      WorkspaceBillingOverview,
      PendingPurchaseClaim
    >;
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
    startWorkspaceCreditTopupCheckout: (
      packId?: WorkspaceToolBalanceTopupPackId,
      surface?: WorkspaceCreditTopupSurface,
    ) => Promise<void> | void;
    workspaceCardOnFileStatus: {
      has_card_on_file?: unknown;
      payment_method_status?: unknown;
      card_brand?: unknown;
      card_last4?: unknown;
    } | null;
    workspaceCardOnFileError: string | null;
    isStartingWorkspaceCardSetupCheckout: boolean;
    workspaceCardSetupError: string | null;
    startWorkspaceCardSetupCheckout: () => Promise<void> | void;
    billingUi: UseWebBillingUiControllerResult<
      AccountCommerceStatus,
      WorkspaceCreditBalance,
      WorkspaceBillingOverview,
      PendingPurchaseClaim
    >;
  };
  integrations: {
    session: SessionLike;
    requireSignIn: () => void;
    openDiscoverApps: () => void;
    openDiscoverSkills: () => void;
    shouldOpenCreateSkillComposer: boolean;
    onConsumeCreateSkillComposerOpen: () => void;
    effectiveMcpApps: EffectiveMcpApp[];
    isLoadingEffectiveMcpApps: boolean;
    effectiveMcpAppsError: string | null;
    effectiveSkills: EffectiveSkill[];
    isLoadingEffectiveSkills: boolean;
    effectiveSkillsError: string | null;
    isLoadingUserPlatformAppMounts: boolean;
    userPlatformAppMountError: string | null;
    userPlatformAppMutationError: string | null;
    isConnectingUserPlatformApp: boolean;
    updatingUserPlatformAppMountId: string | null;
    refreshingUserPlatformAppMountId: string | null;
    refreshingCommunityAppMountId: string | null;
    reconnectingUserPlatformAppMountId: string | null;
    removingUserPlatformAppMountId: string | null;
    userPlatformSkills: UserPlatformInstalledSkill[];
    isLoadingUserPlatformSkills: boolean;
    userPlatformSkillError: string | null;
    userPlatformSkillMutationError: string | null;
    isCreatingUserPlatformSkill: boolean;
    updatingUserPlatformSkillInstallId: string | null;
    removingUserPlatformSkillInstallId: string | null;
    onConnectUserPlatformApp: (
      input: ConnectUserPlatformAppInput,
    ) => Promise<ConnectUserPlatformAppResult>;
    onBeginUserPlatformAppOAuth: (
      catalogAppId: string,
      options?: BeginUserPlatformAppOAuthOptions,
    ) => Promise<BeginUserPlatformAppOAuthResult>;
    onUpdateUserPlatformAppMount: (
      userPlatformAppMountId: string,
      patch: {
        enabled?: boolean;
        enabledTools?: string[];
      },
    ) => Promise<void> | Promise<boolean> | boolean | void;
    onRefreshUserPlatformApp: (
      userPlatformAppMountId: string,
    ) => Promise<void> | Promise<boolean> | boolean | void;
    onReconnectUserPlatformApp: (
      userPlatformAppMountId: string,
      secret: string,
    ) => Promise<void> | Promise<boolean> | boolean | void;
    onSetupImportedCommunityMcpApp: (input: {
      community_app_mount_id: string;
      endpoint_url: string;
      auth_type: DeveloperAppAuthType;
      secret?: string;
    }) => Promise<void> | Promise<boolean> | boolean | void;
    onUnmountUserPlatformApp: (
      userPlatformAppMountId: string,
    ) => Promise<void> | Promise<boolean> | boolean | void;
    onCreateUserPlatformSkill: (
      input: CreateSkillPackageInput,
    ) => Promise<void> | Promise<boolean> | boolean | void;
    onSaveUserPlatformSkill: (
      userPlatformSkillInstallId: string,
      input: CreateSkillPackageInput,
    ) => Promise<void> | Promise<boolean> | boolean | void;
    onUpdateUserPlatformSkill: (
      userPlatformSkillInstallId: string,
      patch: {
        enabled?: boolean;
      },
    ) => Promise<void> | Promise<boolean> | boolean | void;
    onDeleteUserPlatformSkill: (
      userPlatformSkillInstallId: string,
    ) => Promise<void> | Promise<boolean> | boolean | void;
  };
  appearance: {
    appTheme: AppTheme;
    setAppTheme: (value: AppTheme) => void;
  };
};

export function WebSettingsPanels(props: WebSettingsPanelsProps) {
  const { settingsGroup, profile, account, agent, billing, integrations, appearance } =
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
    deleteAccount: account.deleteAccount,
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
    pendingPurchaseClaims: account.billingUi.pendingPurchaseClaims,
    isLoadingPendingPurchases: account.billingUi.isLoadingPendingPurchases,
    isRedeemingPendingPurchases: account.billingUi.isRedeemingPendingPurchases,
    redeemPendingPurchases: account.redeemPendingPurchases,
    refreshPendingPurchases: async () => {
      const session = await account.ensureSession();
      if (!session) return;
      await account.loadPendingPurchaseClaims(session);
    },
    pendingPurchasesError: account.billingUi.pendingPurchasesError,
    pendingPurchasesSuccess: account.billingUi.pendingPurchasesSuccess,
  };

  const agentSectionProps = {
    session: agent.session,
    exportError: agent.exportError,
    exportThreadsCsv: agent.exportThreadsCsv,
    exportMessagesCsv: agent.exportMessagesCsv,
    exportMemoryCsv: agent.exportMemoryCsv,
    isExporting: agent.isExporting,
    userMemorySettings: agent.userMemorySettings,
    isLoadingUserMemorySettings: agent.isLoadingUserMemorySettings,
    saveUserMemorySettings: agent.saveUserMemorySettings,
    personalMemoryError: agent.personalMemoryUi.personalMemoryError,
    isLoadingPersonalMemory: agent.personalMemoryUi.isLoadingPersonalMemory,
    personalMemoryItems: agent.personalMemoryUi.personalMemoryItems,
    personalMemoryQuery: agent.personalMemoryUi.personalMemoryQuery,
    setPersonalMemoryQuery: agent.personalMemoryUi.setPersonalMemoryQuery,
    loadPersonalMemoryItems: agent.loadPersonalMemoryItems,
    formatRelativeTime: agent.formatRelativeTime,
    handleTogglePersonalMemoryPinned: agent.handleTogglePersonalMemoryPinned,
    handleDeletePersonalMemoryItem: agent.handleDeletePersonalMemoryItem,
    setMemoryImportError: agent.personalMemoryUi.setMemoryImportError,
    setIsMemoryImportModalOpen: agent.personalMemoryUi.setIsMemoryImportModalOpen,
    newPersonalMemoryContent: agent.personalMemoryUi.newPersonalMemoryContent,
    setNewPersonalMemoryContent: agent.personalMemoryUi.setNewPersonalMemoryContent,
    setNewPersonalMemoryPinned: agent.personalMemoryUi.setNewPersonalMemoryPinned,
    handleCreatePersonalMemoryItem: agent.handleCreatePersonalMemoryItem,
  };

  const billingSectionProps = {
    session: billing.session,
    workspaceCreditBalance: billing.billingUi.workspaceCreditBalance,
    isLoadingWorkspaceCreditBalance: billing.billingUi.isLoadingWorkspaceCreditBalance,
    workspaceCreditBalanceError: billing.billingUi.workspaceCreditBalanceError,
    workspaceBillingOverview: billing.billingUi.workspaceBillingOverview,
    isLoadingWorkspaceBillingOverview: billing.billingUi.isLoadingWorkspaceBillingOverview,
    workspaceBillingOverviewError: billing.billingUi.workspaceBillingOverviewError,
    isStartingWorkspaceCreditTopupCheckout: billing.billingUi.isStartingWorkspaceCreditTopupCheckout,
    workspaceCreditTopupError: billing.billingUi.workspaceCreditTopupError,
    workspaceCardOnFileStatus: billing.workspaceCardOnFileStatus,
    workspaceCardOnFileError: billing.workspaceCardOnFileError,
    isStartingWorkspaceCardSetupCheckout: billing.isStartingWorkspaceCardSetupCheckout,
    workspaceCardSetupError: billing.workspaceCardSetupError,
    startWorkspaceCreditTopupCheckout: billing.startWorkspaceCreditTopupCheckout,
    startWorkspaceCardSetupCheckout: billing.startWorkspaceCardSetupCheckout,
  };

  const appearanceSectionProps = {
    appTheme: appearance.appTheme,
    setAppTheme: appearance.setAppTheme,
  };

  const integrationsSectionProps = {
    session: integrations.session,
    requireSignIn: integrations.requireSignIn,
    openDiscoverApps: integrations.openDiscoverApps,
    openDiscoverSkills: integrations.openDiscoverSkills,
    shouldOpenCreateSkillComposer: integrations.shouldOpenCreateSkillComposer,
    onConsumeCreateSkillComposerOpen:
      integrations.onConsumeCreateSkillComposerOpen,
    effectiveMcpApps: integrations.effectiveMcpApps,
    isLoadingEffectiveMcpApps: integrations.isLoadingEffectiveMcpApps,
    effectiveMcpAppsError: integrations.effectiveMcpAppsError,
    effectiveSkills: integrations.effectiveSkills,
    isLoadingEffectiveSkills: integrations.isLoadingEffectiveSkills,
    effectiveSkillsError: integrations.effectiveSkillsError,
    isLoadingUserPlatformAppMounts: integrations.isLoadingUserPlatformAppMounts,
    userPlatformAppMountError: integrations.userPlatformAppMountError,
    userPlatformAppMutationError: integrations.userPlatformAppMutationError,
    isConnectingUserPlatformApp: integrations.isConnectingUserPlatformApp,
    updatingUserPlatformAppMountId: integrations.updatingUserPlatformAppMountId,
    refreshingUserPlatformAppMountId:
      integrations.refreshingUserPlatformAppMountId,
    refreshingCommunityAppMountId: integrations.refreshingCommunityAppMountId,
    reconnectingUserPlatformAppMountId:
      integrations.reconnectingUserPlatformAppMountId,
    removingUserPlatformAppMountId: integrations.removingUserPlatformAppMountId,
    userPlatformSkills: integrations.userPlatformSkills,
    isLoadingUserPlatformSkills: integrations.isLoadingUserPlatformSkills,
    userPlatformSkillError: integrations.userPlatformSkillError,
    userPlatformSkillMutationError: integrations.userPlatformSkillMutationError,
    isCreatingUserPlatformSkill: integrations.isCreatingUserPlatformSkill,
    updatingUserPlatformSkillInstallId:
      integrations.updatingUserPlatformSkillInstallId,
    removingUserPlatformSkillInstallId:
      integrations.removingUserPlatformSkillInstallId,
    onConnectUserPlatformApp: integrations.onConnectUserPlatformApp,
    onBeginUserPlatformAppOAuth: integrations.onBeginUserPlatformAppOAuth,
    onUpdateUserPlatformAppMount: integrations.onUpdateUserPlatformAppMount,
    onRefreshUserPlatformApp: integrations.onRefreshUserPlatformApp,
    onReconnectUserPlatformApp: integrations.onReconnectUserPlatformApp,
    onSetupImportedCommunityMcpApp:
      integrations.onSetupImportedCommunityMcpApp,
    onUnmountUserPlatformApp: integrations.onUnmountUserPlatformApp,
    onCreateUserPlatformSkill: integrations.onCreateUserPlatformSkill,
    onSaveUserPlatformSkill: integrations.onSaveUserPlatformSkill,
    onUpdateUserPlatformSkill: integrations.onUpdateUserPlatformSkill,
    onDeleteUserPlatformSkill: integrations.onDeleteUserPlatformSkill,
  };

  return (
    <>
      {settingsGroup === "profile" ? <WebProfileSettingsSection {...profileSectionProps} /> : null}
      {settingsGroup === "account" ? <WebAccountSettingsSection {...accountSectionProps} /> : null}
      {settingsGroup === "billing" ? <WebBillingSettingsSection {...billingSectionProps} /> : null}
      {settingsGroup === "partners" ? <WebBuilderPartnerSettingsSection {...accountSectionProps} /> : null}
      {settingsGroup === "agent" ? <WebAgentSettingsSection {...agentSectionProps} /> : null}
      {settingsGroup === "integrations" ? (
        <WebIntegrationsSettingsSection {...integrationsSectionProps} />
      ) : null}
      {settingsGroup === "appearance" ? <WebAppearanceSettingsSection {...appearanceSectionProps} /> : null}
    </>
  );
}
