import type { DragEvent } from "react";
import type { SettingsGroup } from "../../../../shared/appShellNavigation";
import type { AppTheme } from "../../../../shared/theme";
import type { BuilderBillingStatus } from "../../../../shared/builderBillingStatusGateway";
import type { WorkspaceCreditBalance } from "../../../../shared/workspaceCreditsGateway";
import type { PendingPurchaseClaim } from "../../../../shared/pay_first";
import type { UserPlatformMountedApp } from "../../../../shared/userPlatformAppMountTypes";
import type { UseWebProviderConnectionUiControllerResult } from "../controllers/useWebProviderConnectionUiController";
import type { useWebProfileSettingsUiController } from "../controllers/useWebProfileSettingsUiController";
import type { useWebPersonalMemoryUiController } from "../controllers/useWebPersonalMemoryUiController";
import type { UseWebBillingUiControllerResult } from "../controllers/useWebBillingUiController";
import { WebAccountSettingsSection } from "./WebAccountSettingsSection";
import { WebAgentSettingsSection } from "./WebAgentSettingsSection";
import { WebAppearanceSettingsSection } from "./WebAppearanceSettingsSection";
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
    saveProfileToCloud: () => Promise<void> | void;
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
    hasPendingChatgptAuth: boolean;
    isLoadingOpenRouterConnection: boolean;
    openRouterConnection: {
      connected: boolean;
      key_last_four?: string | null;
      updated_at?: string | null;
    };
    formatRelativeTime: (value: string) => string;
    communities: OwnedCommunity[];
    communityRoleById: Record<string, string>;
    openOwnedCommunitySettings: (communityId: string) => void;
    communityInitials: (value: string) => string;
    openBuilderUpgrade: (context: "builder") => void;
    openBuilderBillingPortal: () => Promise<void> | void;
    canUseDevTierOverride: boolean;
    setDevBuilderTier: (tier: "free" | "builder") => Promise<void> | void;
    redeemPendingPurchases: () => Promise<void> | void;
    ensureSession: () => Promise<SessionLike>;
    loadPendingPurchaseClaims: (session: NonNullable<SessionLike>) => Promise<void>;
    providerConnectionUi: UseWebProviderConnectionUiControllerResult;
    billingUi: UseWebBillingUiControllerResult<BuilderBillingStatus, WorkspaceCreditBalance, PendingPurchaseClaim>;
  };
  agent: {
    session: SessionLike;
    exportError: string | null;
    exportThreadsCsv: () => Promise<void> | void;
    exportMessagesCsv: () => Promise<void> | void;
    exportMemoryCsv: () => Promise<void> | void;
    isExporting: boolean;
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
    openBuilderUpgrade: (context: "builder") => void;
    startWorkspaceCreditTopupCheckout: () => Promise<void> | void;
    personalMemoryUi: ReturnType<typeof useWebPersonalMemoryUiController>;
    billingUi: UseWebBillingUiControllerResult<BuilderBillingStatus, WorkspaceCreditBalance, PendingPurchaseClaim>;
  };
  integrations: {
    session: SessionLike;
    requireSignIn: () => void;
    openDiscoverApps: () => void;
    userPlatformAppMounts: UserPlatformMountedApp[];
    isLoadingUserPlatformAppMounts: boolean;
    userPlatformAppMountError: string | null;
    userPlatformAppMutationError: string | null;
    updatingUserPlatformAppMountId: string | null;
    refreshingUserPlatformAppMountId: string | null;
    reconnectingUserPlatformAppMountId: string | null;
    removingUserPlatformAppMountId: string | null;
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
    onUnmountUserPlatformApp: (
      userPlatformAppMountId: string,
    ) => Promise<void> | Promise<boolean> | boolean | void;
  };
  appearance: {
    appTheme: AppTheme;
    setAppTheme: (value: AppTheme) => void;
  };
};

export function WebSettingsPanels(props: WebSettingsPanelsProps) {
  const { settingsGroup, profile, account, agent, integrations, appearance } =
    props;

  const profileSectionProps = {
    session: profile.session,
    cloudProfile: profile.cloudProfile,
    profileAvatarUrl: profile.profileUi.profileAvatarUrl,
    profileName: profile.profileUi.profileName,
    profileUsername: profile.profileUi.profileUsername,
    profileBio: profile.profileUi.profileBio,
    isProfileAvatarDragOver: profile.profileUi.isProfileAvatarDragOver,
    profileNeedsSave: profile.profileUi.profileNeedsSave,
    isSavingProfile: profile.profileUi.isSavingProfile,
    isProfileDirty: profile.profileUi.isProfileDirty,
    profileSaveError: profile.profileUi.profileSaveError,
    profileSaveSuccess: profile.profileUi.profileSaveSuccess,
    setIsProfileAvatarDragOver: profile.profileUi.setIsProfileAvatarDragOver,
    handleProfileAvatarDrop: profile.handleProfileAvatarDrop,
    handleProfileAvatarUpload: profile.handleProfileAvatarUpload,
    setProfileAvatarUrl: profile.profileUi.setProfileAvatarUrl,
    getInitials: profile.getInitials,
    setProfileName: profile.profileUi.setProfileName,
    setProfileUsername: profile.profileUi.setProfileUsername,
    setProfileBio: profile.profileUi.setProfileBio,
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
    isLoadingOpenRouterConnection: account.isLoadingOpenRouterConnection,
    openRouterConnection: account.openRouterConnection,
    openRouterApiKeyDraft: account.providerConnectionUi.openRouterApiKeyDraft,
    setOpenRouterApiKeyDraft: account.providerConnectionUi.setOpenRouterApiKeyDraft,
    isSavingOpenRouterConnection: account.providerConnectionUi.isSavingOpenRouterConnection,
    handleConnectOpenRouter: account.providerConnectionUi.handleConnectOpenRouter,
    handleDisconnectOpenRouter: account.providerConnectionUi.handleDisconnectOpenRouter,
    openRouterConnectionError: account.providerConnectionUi.openRouterConnectionError,
    openRouterConnectionSuccess: account.providerConnectionUi.openRouterConnectionSuccess,
    formatRelativeTime: account.formatRelativeTime,
    builderBillingStatus: account.billingUi.builderBillingStatus,
    communities: account.communities,
    communityRoleById: account.communityRoleById,
    openOwnedCommunitySettings: account.openOwnedCommunitySettings,
    communityInitials: account.communityInitials,
    openBuilderUpgrade: account.openBuilderUpgrade,
    openBuilderBillingPortal: account.openBuilderBillingPortal,
    builderBillingError: account.billingUi.builderBillingError,
    isOpeningBuilderBillingPortal: account.billingUi.isOpeningBuilderBillingPortal,
    canUseDevTierOverride: account.canUseDevTierOverride,
    isSettingDevBuilderTier: account.billingUi.isSettingDevBuilderTier,
    setDevBuilderTier: account.setDevBuilderTier,
    devBuilderTierError: account.billingUi.devBuilderTierError,
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
    personalMemoryError: agent.personalMemoryUi.personalMemoryError,
    builderBillingStatus: agent.billingUi.builderBillingStatus,
    openBuilderUpgrade: agent.openBuilderUpgrade,
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
    workspaceCreditBalance: agent.billingUi.workspaceCreditBalance,
    isLoadingWorkspaceCreditBalance: agent.billingUi.isLoadingWorkspaceCreditBalance,
    workspaceCreditBalanceError: agent.billingUi.workspaceCreditBalanceError,
    isStartingWorkspaceCreditTopupCheckout: agent.billingUi.isStartingWorkspaceCreditTopupCheckout,
    workspaceCreditTopupError: agent.billingUi.workspaceCreditTopupError,
    startWorkspaceCreditTopupCheckout: agent.startWorkspaceCreditTopupCheckout,
  };

  const appearanceSectionProps = {
    appTheme: appearance.appTheme,
    setAppTheme: appearance.setAppTheme,
  };

  const integrationsSectionProps = {
    session: integrations.session,
    requireSignIn: integrations.requireSignIn,
    openDiscoverApps: integrations.openDiscoverApps,
    userPlatformAppMounts: integrations.userPlatformAppMounts,
    isLoadingUserPlatformAppMounts: integrations.isLoadingUserPlatformAppMounts,
    userPlatformAppMountError: integrations.userPlatformAppMountError,
    userPlatformAppMutationError: integrations.userPlatformAppMutationError,
    updatingUserPlatformAppMountId: integrations.updatingUserPlatformAppMountId,
    refreshingUserPlatformAppMountId:
      integrations.refreshingUserPlatformAppMountId,
    reconnectingUserPlatformAppMountId:
      integrations.reconnectingUserPlatformAppMountId,
    removingUserPlatformAppMountId: integrations.removingUserPlatformAppMountId,
    onUpdateUserPlatformAppMount: integrations.onUpdateUserPlatformAppMount,
    onRefreshUserPlatformApp: integrations.onRefreshUserPlatformApp,
    onReconnectUserPlatformApp: integrations.onReconnectUserPlatformApp,
    onUnmountUserPlatformApp: integrations.onUnmountUserPlatformApp,
  };

  return (
    <>
      {settingsGroup === "profile" ? <WebProfileSettingsSection {...profileSectionProps} /> : null}
      {settingsGroup === "account" ? <WebAccountSettingsSection {...accountSectionProps} /> : null}
      {settingsGroup === "agent" ? <WebAgentSettingsSection {...agentSectionProps} /> : null}
      {settingsGroup === "integrations" ? (
        <WebIntegrationsSettingsSection {...integrationsSectionProps} />
      ) : null}
      {settingsGroup === "appearance" ? <WebAppearanceSettingsSection {...appearanceSectionProps} /> : null}
    </>
  );
}
