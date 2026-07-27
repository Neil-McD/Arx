import type { DragEvent, ReactNode } from "react";
import type { SettingsGroup } from "../../../../shared/appShellNavigation";
import type { AppTheme } from "../../../../shared/theme";
import type { AccountCommerceStatus } from "../../../../shared/accountCommerceStatusGateway";
import type { BuilderPartnerProgramSnapshot } from "../../../../shared/builderPartnerProgramGateway";
import type { SocialProfileLinks } from "../../../../shared/socialProfileLinks";
import type { PendingPurchaseClaim } from "../../../../shared/pay_first";
import type { EffectiveSkill } from "../../../../shared/effectiveSkills";
import type { CreateSkillPackageInput } from "../../../../shared/skillPackageTypes";
import type { UserPlatformInstalledSkill } from "../../../../shared/userPlatformSkillTypes";
import type { UseWebProviderConnectionUiControllerResult } from "../controllers/useWebProviderConnectionUiController";
import type { useWebProfileSettingsUiController } from "../controllers/useWebProfileSettingsUiController";
import type { useWebPersonalAccountSettingsController } from "../controllers/useWebPersonalAccountSettingsController";
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
      PendingPurchaseClaim
    >;
  };
  personalAccount: {
    session: SessionLike;
    formatRelativeTime: (value: string) => string;
    controller: ReturnType<typeof useWebPersonalAccountSettingsController>;
  };
	  billing: {
	    session: SessionLike;
	    startPremiumSubscriptionCheckout: () => Promise<void> | void;
	    billingUi: UseWebBillingUiControllerResult<
	      AccountCommerceStatus,
	      PendingPurchaseClaim
	    >;
	  };
  skills: {
    session: SessionLike;
    requireSignIn: () => void;
    effectiveSkills: EffectiveSkill[];
    isLoadingEffectiveSkills: boolean;
    effectiveSkillsError: string | null;
    userPlatformSkills: UserPlatformInstalledSkill[];
    isLoadingUserPlatformSkills: boolean;
    userPlatformSkillError: string | null;
    userPlatformSkillMutationError: string | null;
    isCreatingUserPlatformSkill: boolean;
    updatingUserPlatformSkillInstallId: string | null;
    removingUserPlatformSkillInstallId: string | null;
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
  const {
    settingsGroup,
    profile,
    account,
    personalAccount,
    billing,
    skills,
    appearance,
  } = props;

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
    session: personalAccount.session,
    exportError: personalAccount.controller.dataExport.error,
    exportThreadsCsv: personalAccount.controller.dataExport.exportThreadsCsv,
    exportMessagesCsv: personalAccount.controller.dataExport.exportMessagesCsv,
    exportMemoryCsv: personalAccount.controller.dataExport.exportMemoryCsv,
    isExporting: personalAccount.controller.dataExport.isExporting,
    userMemorySettings: personalAccount.controller.personalAgent.settings,
    isLoadingUserMemorySettings:
      personalAccount.controller.personalAgent.isLoading,
    saveUserMemorySettings:
      personalAccount.controller.personalAgent.saveSettings,
    personalMemoryError: personalAccount.controller.personalMemory.error,
    isLoadingPersonalMemory:
      personalAccount.controller.personalMemory.isLoading,
    personalMemoryItems: personalAccount.controller.personalMemory.items,
    personalMemoryQuery: personalAccount.controller.personalMemory.query,
    setPersonalMemoryQuery:
      personalAccount.controller.personalMemory.setQuery,
    loadPersonalMemoryItems:
      personalAccount.controller.personalMemory.loadItems,
    formatRelativeTime: personalAccount.formatRelativeTime,
    handleTogglePersonalMemoryPinned:
      personalAccount.controller.personalMemory.togglePinned,
    handleDeletePersonalMemoryItem:
      personalAccount.controller.personalMemory.deleteItem,
    setMemoryImportError:
      personalAccount.controller.personalMemoryUi.setMemoryImportError,
    setIsMemoryImportModalOpen:
      personalAccount.controller.personalMemoryUi.setIsMemoryImportModalOpen,
    newPersonalMemoryContent:
      personalAccount.controller.personalMemory.newContent,
    setNewPersonalMemoryContent:
      personalAccount.controller.personalMemory.setNewContent,
    setNewPersonalMemoryPinned:
      personalAccount.controller.personalMemory.setNewPinned,
    handleCreatePersonalMemoryItem:
      personalAccount.controller.personalMemory.createItem,
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

  const skillsSectionProps = {
    session: skills.session,
    effectiveSkills: skills.effectiveSkills,
    isLoadingEffectiveSkills: skills.isLoadingEffectiveSkills,
    effectiveSkillsError: skills.effectiveSkillsError,
    userPlatformSkills: skills.userPlatformSkills,
    isLoadingUserPlatformSkills: skills.isLoadingUserPlatformSkills,
    userPlatformSkillError: skills.userPlatformSkillError,
    userPlatformSkillMutationError: skills.userPlatformSkillMutationError,
    isCreatingUserPlatformSkill: skills.isCreatingUserPlatformSkill,
    updatingUserPlatformSkillInstallId:
      skills.updatingUserPlatformSkillInstallId,
    removingUserPlatformSkillInstallId:
      skills.removingUserPlatformSkillInstallId,
    onCreateUserPlatformSkill: skills.onCreateUserPlatformSkill,
    onSaveUserPlatformSkill: skills.onSaveUserPlatformSkill,
    onUpdateUserPlatformSkill: skills.onUpdateUserPlatformSkill,
    onDeleteUserPlatformSkill: skills.onDeleteUserPlatformSkill,
  };

  return (
    <>
      {settingsGroup === "profile" ? <WebProfileSettingsSection {...profileSectionProps} /> : null}
      {settingsGroup === "account" ? <WebAccountSettingsSection {...accountSectionProps} /> : null}
      {settingsGroup === "billing" ? <WebBillingSettingsSection {...billingSectionProps} /> : null}
      {settingsGroup === "partners" ? <WebBuilderPartnerSettingsSection {...accountSectionProps} /> : null}
      {settingsGroup === "agent" ? <WebAgentSettingsSection {...agentSectionProps} /> : null}
      {settingsGroup === "integrations" ? (
        <WebIntegrationsSettingsSection {...skillsSectionProps} />
      ) : null}
      {settingsGroup === "appearance" ? <WebAppearanceSettingsSection {...appearanceSectionProps} /> : null}
    </>
  );
}
