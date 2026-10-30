import type { AppPage, CommunitySettingsPane, CommunityTab } from "../../../../shared/appShellNavigation";
import type { WebCommunityChatPanelProps } from "../components/WebCommunityChatPanel";
import type { WebCommunitySecondaryPanelsProps } from "../components/WebCommunitySecondaryPanels";
import { communitySiteOrigin } from "../communitySiteOrigin";

type CommunitySurfaceCommunityLike =
  | (NonNullable<WebCommunitySecondaryPanelsProps["settings"]["activeCommunity"]> & {
        id: string;
        name: string;
        owner_id?: string | null;
        avatar_url?: string | null;
        avatar_focus_x?: number | null;
        avatar_focus_y?: number | null;
        avatar_zoom?: number | null;
        banner_url?: string | null;
        banner_focus_x?: number | null;
        banner_focus_y?: number | null;
        banner_zoom?: number | null;
      })
  | null;

type BuildWebCommunitySurfaceProjectionParams = {
  activePage: AppPage;
  communityTab: CommunityTab;
  activeCommunity: CommunitySurfaceCommunityLike | null;
  session: WebCommunityChatPanelProps["session"];
  canViewCommunityKnowledgeGraph: boolean;
  ensureSession: WebCommunitySecondaryPanelsProps["settings"]["ensureSession"];
  selectedActiveCommunitySlug: string | null;
  isAuthBootstrapComplete: boolean;
  hasAuthenticatedPresentation: boolean;
  isAuthRecoveringSignedIn: boolean;
  hasSession: boolean;
  onOpenDirectMessageFromCommunity: WebCommunityChatPanelProps["onOpenDirectMessageFromCommunity"];
  hasResolvedCommunities: boolean;
  isLoadingCommunities: boolean;
  sessionUserId: WebCommunityChatPanelProps["sessionUserId"];
  isResolvingCommunityAccess: WebCommunitySecondaryPanelsProps["settings"]["isResolvingCommunityAccess"];
  communityAccessLoadError: WebCommunitySecondaryPanelsProps["settings"]["communityAccessLoadError"];
  onRetryCommunityAccess: WebCommunitySecondaryPanelsProps["settings"]["onRetryCommunityAccess"];
  canViewActiveCommunitySettings: WebCommunitySecondaryPanelsProps["settings"]["canViewActiveCommunitySettings"];
  communitySettingsLayer: WebCommunitySecondaryPanelsProps["settings"]["communitySettingsLayer"];
  communitySettingsPane: CommunitySettingsPane;
  onSelectCommunitySettingsPane: (pane: CommunitySettingsPane, opts?: { replace?: boolean }) => void;
  canManageCommunitySettings: WebCommunitySecondaryPanelsProps["settings"]["canManageCommunitySettings"];
  requireSignIn: WebCommunitySecondaryPanelsProps["settings"]["requireSignIn"];
  accountCommerceStatus: WebCommunitySecondaryPanelsProps["settings"]["accountCommerceStatus"];
  communityPlatformFeeBps: WebCommunitySecondaryPanelsProps["settings"]["communityPlatformFeeBps"];
  accountCommerceError: WebCommunitySecondaryPanelsProps["settings"]["accountCommerceError"];
  startStripeConnectOnboarding:
    WebCommunitySecondaryPanelsProps["settings"]["startStripeConnectOnboarding"];
  isStartingStripeConnectOnboarding:
    WebCommunitySecondaryPanelsProps["settings"]["isStartingStripeConnectOnboarding"];
  settingsState: WebCommunitySecondaryPanelsProps["settings"]["state"];
  settingsActions: WebCommunitySecondaryPanelsProps["settings"]["actions"];
  setIsCommunityAvatarFocusModalOpen:
    WebCommunitySecondaryPanelsProps["settings"]["setIsCommunityAvatarFocusModalOpen"];
  setIsCommunityBannerFocusModalOpen:
    WebCommunitySecondaryPanelsProps["settings"]["setIsCommunityBannerFocusModalOpen"];
  communitySettingsAvatarUrl: WebCommunitySecondaryPanelsProps["avatarEditor"]["avatarUrl"];
  communitySettingsAvatarFocusX: WebCommunitySecondaryPanelsProps["avatarEditor"]["focusX"];
  communitySettingsAvatarFocusY: WebCommunitySecondaryPanelsProps["avatarEditor"]["focusY"];
  communitySettingsAvatarZoom: WebCommunitySecondaryPanelsProps["avatarEditor"]["zoom"];
  communitySettingsBannerUrl: WebCommunitySecondaryPanelsProps["bannerEditor"]["bannerUrl"];
  communitySettingsBannerFocusX: WebCommunitySecondaryPanelsProps["bannerEditor"]["focusX"];
  communitySettingsBannerFocusY: WebCommunitySecondaryPanelsProps["bannerEditor"]["focusY"];
  communitySettingsBannerZoom: WebCommunitySecondaryPanelsProps["bannerEditor"]["zoom"];
  markCommunitySettingsDirty: WebCommunitySecondaryPanelsProps["bannerEditor"]["markCommunitySettingsDirty"];
  aiAgentHasSession: WebCommunitySecondaryPanelsProps["aiAgent"]["hasSession"];
  canManageMembersActiveCommunity: WebCommunitySecondaryPanelsProps["aiAgent"]["canManageMembersActiveCommunity"];
  communityMemberCount: number | null;
  isLoadingCommunityAgentConfig: WebCommunitySecondaryPanelsProps["aiAgent"]["isLoadingCommunityAgentConfig"];
  communityAgentConfigError: WebCommunitySecondaryPanelsProps["aiAgent"]["communityAgentConfigError"];
  aiAgentInstructionsEditorProps: WebCommunitySecondaryPanelsProps["aiAgent"]["instructionsEditorProps"];
  workflows: WebCommunitySecondaryPanelsProps["workflows"];
  canViewActiveCommunityAnalytics: WebCommunitySecondaryPanelsProps["analytics"]["canViewActiveCommunityAnalytics"];
  canViewPlatformAnalytics: WebCommunitySecondaryPanelsProps["analytics"]["canViewPlatformAnalytics"];
  analyticsState: WebCommunitySecondaryPanelsProps["analytics"]["state"];
  analyticsActions: WebCommunitySecondaryPanelsProps["analytics"]["actions"];
  resourcesState: WebCommunitySecondaryPanelsProps["resources"]["state"];
  resourcesActions: WebCommunitySecondaryPanelsProps["resources"]["actions"];
  eventsState: WebCommunitySecondaryPanelsProps["events"]["state"];
  eventsActions: WebCommunitySecondaryPanelsProps["events"]["actions"];
  canManageResourcesActiveCommunity: boolean;
  canModerateContentActiveCommunity: boolean;
  resourceModuleModalProps: WebCommunitySecondaryPanelsProps["resourceModuleModal"];
  resourceModuleDeleteModalProps: WebCommunitySecondaryPanelsProps["resourceModuleDeleteModal"];
  canPostMessagesActiveCommunity: WebCommunityChatPanelProps["canPostMessages"];
  isProfileSetupComplete: WebCommunityChatPanelProps["isProfileSetupComplete"];
  onCommunityTypingSignal: WebCommunityChatPanelProps["onCommunityTypingSignal"];
  onCommunityTypingClear: WebCommunityChatPanelProps["onCommunityTypingClear"];
  profilesByUserId: WebCommunityChatPanelProps["profilesByUserId"];
  mentionableCommunityMembers: WebCommunityChatPanelProps["mentionableCommunityMembers"];
  replyingToMessage: WebCommunityChatPanelProps["replyingToMessage"];
  communityAttachments: WebCommunityChatPanelProps["communityAttachments"];
  communityMessageInput: WebCommunityChatPanelProps["communityMessageInput"];
  communityMessageMentions: WebCommunityChatPanelProps["communityMessageMentions"];
  setCommunityMessageMentions: WebCommunityChatPanelProps["setCommunityMessageMentions"];
  communityAgentServeIssue: WebCommunityChatPanelProps["communityAgentServeIssue"];
  onDismissCommunityAgentServeIssue: WebCommunityChatPanelProps["onDismissCommunityAgentServeIssue"];
  onStartBuilderFromServeIssue: WebCommunityChatPanelProps["onStartBuilderFromServeIssue"];
  isSendingCommunityMessage: WebCommunityChatPanelProps["isSendingCommunityMessage"];
  communityChatError: WebCommunityChatPanelProps["communityChatError"];
  fileInputRef: WebCommunityChatPanelProps["fileInputRef"];
  chatInputRef: WebCommunityChatPanelProps["chatInputRef"];
  onFinishProfileSetup: WebCommunityChatPanelProps["onFinishProfileSetup"];
  onSetReplyingToMessage: WebCommunityChatPanelProps["onSetReplyingToMessage"];
  onRemoveCommunityAttachment: WebCommunityChatPanelProps["onRemoveCommunityAttachment"];
  onCommunityAttachmentError: WebCommunityChatPanelProps["onCommunityAttachmentError"];
  onIngestCommunityAttachmentsFromFileList:
    WebCommunityChatPanelProps["onIngestCommunityAttachmentsFromFileList"];
  onCommunityFileInputChange: WebCommunityChatPanelProps["onCommunityFileInputChange"];
  onCommunityAttachmentDrop: WebCommunityChatPanelProps["onCommunityAttachmentDrop"];
  onCommunityAttachmentDragEnter: WebCommunityChatPanelProps["onCommunityAttachmentDragEnter"];
  onCommunityAttachmentDragOver: WebCommunityChatPanelProps["onCommunityAttachmentDragOver"];
  onCommunityAttachmentDragLeave: WebCommunityChatPanelProps["onCommunityAttachmentDragLeave"];
  onCommunityAttachmentPaste: WebCommunityChatPanelProps["onCommunityAttachmentPaste"];
  isCommunityAttachmentDragOver: WebCommunityChatPanelProps["isCommunityAttachmentDragOver"];
  onCommunityMessageInputChange: WebCommunityChatPanelProps["onCommunityMessageInputChange"];
  onSendCommunityMessage: WebCommunityChatPanelProps["onSendCommunityMessage"];
  displayName: WebCommunityChatPanelProps["displayName"];
  getAvatarColor: WebCommunityChatPanelProps["getAvatarColor"];
  getInitials: WebCommunityChatPanelProps["getInitials"];
  formatChatTime: WebCommunityChatPanelProps["formatChatTime"];
  truncateReplyPreview: WebCommunityChatPanelProps["truncateReplyPreview"];
  renderTextWithLinks: WebCommunityChatPanelProps["renderTextWithLinks"];
  onOpenCommunityChatLightbox: WebCommunityChatPanelProps["onOpenCommunityChatLightbox"];
  voiceButtonProps: WebCommunityChatPanelProps["voiceButtonProps"];
  drawerVoiceButtonProps: WebCommunityChatPanelProps["drawerVoiceButtonProps"];
  onCommunityVoiceInputClick: WebCommunityChatPanelProps["onCommunityVoiceInputClick"];
  lightboxModalProps: WebCommunityChatPanelProps["lightboxModalProps"];
  interactionProjection: WebCommunityChatPanelProps["interactionProjection"];
};

export function buildWebCommunitySurfaceProjection(
  params: BuildWebCommunitySurfaceProjectionParams,
): {
  communityChatPanelProps: WebCommunityChatPanelProps;
  communitySecondarySurfaceProps: WebCommunitySecondaryPanelsProps;
} {
  const communitySecondarySurfaceProps: WebCommunitySecondaryPanelsProps = {
    communityTab: params.communityTab,
    settings: {
      activeCommunity: params.activeCommunity,
      session: params.session,
      ensureSession: params.ensureSession,
      hasSession: params.hasAuthenticatedPresentation,
      isResolvingCommunityAccess:
        params.isAuthRecoveringSignedIn || params.isResolvingCommunityAccess,
      communityAccessLoadError: params.communityAccessLoadError,
      onRetryCommunityAccess: params.onRetryCommunityAccess,
      canViewActiveCommunitySettings: params.canViewActiveCommunitySettings,
      communitySettingsLayer: params.communitySettingsLayer,
      activePane: params.communitySettingsPane,
      onSelectPane: params.onSelectCommunitySettingsPane,
      canManageCommunitySettings: params.canManageCommunitySettings,
      canManageMembersActiveCommunity: params.canManageMembersActiveCommunity,
      requireSignIn: params.requireSignIn,
      accountCommerceStatus: params.accountCommerceStatus,
      communityPlatformFeeBps: params.communityPlatformFeeBps,
      accountCommerceError: params.accountCommerceError,
      startStripeConnectOnboarding: params.startStripeConnectOnboarding,
      isStartingStripeConnectOnboarding: params.isStartingStripeConnectOnboarding,
      state: params.settingsState,
      actions: params.settingsActions,
      setIsCommunityAvatarFocusModalOpen:
        params.setIsCommunityAvatarFocusModalOpen,
      setIsCommunityBannerFocusModalOpen: params.setIsCommunityBannerFocusModalOpen,
    },
    avatarEditor: {
      isSettingsTabActive: params.communityTab === "settings",
      isCommunityAvatarFocusModalOpen:
        params.settingsState.isCommunityAvatarFocusModalOpen,
      avatarUrl: params.communitySettingsAvatarUrl,
      focusX: params.communitySettingsAvatarFocusX,
      focusY: params.communitySettingsAvatarFocusY,
      zoom: params.communitySettingsAvatarZoom,
      onChangeFocusX: params.settingsActions.setCommunitySettingsAvatarFocusX,
      onChangeFocusY: params.settingsActions.setCommunitySettingsAvatarFocusY,
      onChangeZoom: params.settingsActions.setCommunitySettingsAvatarZoom,
      markCommunitySettingsDirty: params.markCommunitySettingsDirty,
      setIsCommunityAvatarFocusModalOpen:
        params.setIsCommunityAvatarFocusModalOpen,
    },
    bannerEditor: {
      isSettingsTabActive: params.communityTab === "settings",
      isCommunityBannerFocusModalOpen: params.settingsState.isCommunityBannerFocusModalOpen,
      bannerUrl: params.communitySettingsBannerUrl,
      focusX: params.communitySettingsBannerFocusX,
      focusY: params.communitySettingsBannerFocusY,
      zoom: params.communitySettingsBannerZoom,
      onChangeFocusX: params.settingsActions.setCommunitySettingsBannerFocusX,
      onChangeFocusY: params.settingsActions.setCommunitySettingsBannerFocusY,
      onChangeZoom: params.settingsActions.setCommunitySettingsBannerZoom,
      markCommunitySettingsDirty: params.markCommunitySettingsDirty,
      setIsCommunityBannerFocusModalOpen: params.setIsCommunityBannerFocusModalOpen,
    },
    aiAgent: {
      activeCommunity: params.activeCommunity,
      hasSession: params.aiAgentHasSession,
      canManageMembersActiveCommunity: params.canManageMembersActiveCommunity,
      isLoadingCommunityAgentConfig: params.isLoadingCommunityAgentConfig,
      communityAgentConfigError: params.communityAgentConfigError,
      onRequireSignIn: params.requireSignIn,
      instructionsEditorProps: params.aiAgentInstructionsEditorProps,
    },
    workflows: params.workflows,
    analytics: {
      hasActiveCommunity: Boolean(params.activeCommunity),
      hasSession: params.hasAuthenticatedPresentation,
      canViewActiveCommunityAnalytics: params.canViewActiveCommunityAnalytics,
      canViewPlatformAnalytics: params.canViewPlatformAnalytics,
      onRequireSignIn: params.requireSignIn,
      state: params.analyticsState,
      actions: params.analyticsActions,
    },
    knowledge: {
      communityId: params.activeCommunity?.id ?? null,
      communityName: params.activeCommunity?.name ?? null,
      session: params.session,
      ensureSession: params.ensureSession,
      requireSignIn: params.requireSignIn,
      canViewGraph: params.canViewCommunityKnowledgeGraph,
    },
    resources: {
      capabilities: {
        hasActiveCommunity: Boolean(params.activeCommunity),
        activeCommunityId: params.activeCommunity?.id ?? null,
        activeCommunityName: params.activeCommunity?.name ?? null,
        activeCommunitySiteOrigin: communitySiteOrigin(params.activeCommunity?.slug ?? null),
        canOperateResources: Boolean(params.hasSession && params.canManageResourcesActiveCommunity),
      },
      state: params.resourcesState,
      actions: params.resourcesActions,
    },
    events: {
      capabilities: {
        hasActiveCommunity: Boolean(params.activeCommunity),
        activeCommunityName: params.activeCommunity?.name ?? null,
        canManageEvents: Boolean(params.hasSession && params.canManageResourcesActiveCommunity),
      },
      state: params.eventsState,
      actions: params.eventsActions,
    },
    resourceModuleModal: params.resourceModuleModalProps,
    resourceModuleDeleteModal: params.resourceModuleDeleteModalProps,
  };

  const communityChatPanelProps: WebCommunityChatPanelProps = {
    activeCommunity: params.activeCommunity
      ? {
          id: params.activeCommunity.id,
          name: params.activeCommunity.name,
          owner_id: params.activeCommunity.owner_id ?? null,
          avatar_url: params.activeCommunity.avatar_url ?? null,
          avatar_focus_x: params.activeCommunity.avatar_focus_x ?? null,
          avatar_focus_y: params.activeCommunity.avatar_focus_y ?? null,
          avatar_zoom: params.activeCommunity.avatar_zoom ?? null,
        }
      : null,
    session: params.session,
    isResolvingSelectedCommunity:
      (!params.isAuthBootstrapComplete || params.hasAuthenticatedPresentation) &&
      params.activePage === "community" &&
      Boolean(String(params.selectedActiveCommunitySlug ?? "").trim()) &&
      !params.activeCommunity &&
      (!params.hasResolvedCommunities || params.isLoadingCommunities),
    hasAuthenticatedPresentation: params.hasAuthenticatedPresentation,
    isAuthRecoveringSignedIn: params.isAuthRecoveringSignedIn,
    hasSession: params.hasSession,
    onOpenDirectMessageFromCommunity: params.onOpenDirectMessageFromCommunity,
    sessionUserId: params.sessionUserId,
    canPostMessages: params.canPostMessagesActiveCommunity,
    canShareForms: params.canManageMembersActiveCommunity,
    isProfileSetupComplete: params.isProfileSetupComplete,
    canMentionEverybody: params.canManageMembersActiveCommunity,
    everybodyMemberCount: params.communityMemberCount,
    onCommunityTypingSignal: params.onCommunityTypingSignal,
    onCommunityTypingClear: params.onCommunityTypingClear,
    profilesByUserId: params.profilesByUserId,
    mentionableCommunityMembers: params.mentionableCommunityMembers,
    replyingToMessage: params.replyingToMessage,
    communityAttachments: params.communityAttachments,
    communityMessageInput: params.communityMessageInput,
    communityMessageMentions: params.communityMessageMentions,
    setCommunityMessageMentions: params.setCommunityMessageMentions,
    communityAgentServeIssue: params.communityAgentServeIssue,
    onDismissCommunityAgentServeIssue: params.onDismissCommunityAgentServeIssue,
    onStartBuilderFromServeIssue: params.onStartBuilderFromServeIssue,
    isSendingCommunityMessage: params.isSendingCommunityMessage,
    communityChatError: params.communityChatError,
    fileInputRef: params.fileInputRef,
    chatInputRef: params.chatInputRef,
    onRequireSignIn: params.requireSignIn,
    onFinishProfileSetup: params.onFinishProfileSetup,
    onSetReplyingToMessage: params.onSetReplyingToMessage,
    onRemoveCommunityAttachment: params.onRemoveCommunityAttachment,
    onCommunityAttachmentError: params.onCommunityAttachmentError,
    onIngestCommunityAttachmentsFromFileList: params.onIngestCommunityAttachmentsFromFileList,
    onCommunityFileInputChange: params.onCommunityFileInputChange,
    onCommunityAttachmentDrop: params.onCommunityAttachmentDrop,
    onCommunityAttachmentDragEnter: params.onCommunityAttachmentDragEnter,
    onCommunityAttachmentDragOver: params.onCommunityAttachmentDragOver,
    onCommunityAttachmentDragLeave: params.onCommunityAttachmentDragLeave,
    onCommunityAttachmentPaste: params.onCommunityAttachmentPaste,
    isCommunityAttachmentDragOver: params.isCommunityAttachmentDragOver,
    onCommunityMessageInputChange: params.onCommunityMessageInputChange,
    onSendCommunityMessage: params.onSendCommunityMessage,
    displayName: params.displayName,
    getAvatarColor: params.getAvatarColor,
    getInitials: params.getInitials,
    formatChatTime: params.formatChatTime,
    truncateReplyPreview: params.truncateReplyPreview,
    renderTextWithLinks: params.renderTextWithLinks,
    onOpenCommunityChatLightbox: params.onOpenCommunityChatLightbox,
    voiceButtonProps: params.voiceButtonProps,
    drawerVoiceButtonProps: params.drawerVoiceButtonProps,
    onCommunityVoiceInputClick: params.onCommunityVoiceInputClick,
    lightboxModalProps: params.lightboxModalProps,
    interactionProjection: params.interactionProjection,
  };

  return {
    communityChatPanelProps,
    communitySecondarySurfaceProps,
  };
}
