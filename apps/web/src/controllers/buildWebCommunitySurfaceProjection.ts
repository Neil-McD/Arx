import type { AppPage, CommunitySettingsPane, CommunityTab } from "../../../../shared/appShellNavigation";
import type { WebCommunityChatPanelProps } from "../components/WebCommunityChatPanel";
import type { WebCommunitySecondaryPanelsProps } from "../components/WebCommunitySecondaryPanels";

type CommunitySurfaceCommunityLike =
  | (NonNullable<WebCommunitySecondaryPanelsProps["settings"]["activeCommunity"]> &
      NonNullable<WebCommunitySecondaryPanelsProps["members"]["activeCommunity"]> & {
        avatar_url?: string | null;
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
  selectedActiveCommunitySlug: string | null;
  hasAuthenticatedPresentation: boolean;
  isAuthRecoveringSignedIn: boolean;
  hasSession: boolean;
  onOpenDirectMessageFromCommunity: WebCommunityChatPanelProps["onOpenDirectMessageFromCommunity"];
  hasResolvedCommunities: boolean;
  isLoadingCommunities: boolean;
  sessionUserId: WebCommunityChatPanelProps["sessionUserId"];
  canViewActiveCommunitySettings: WebCommunitySecondaryPanelsProps["settings"]["canViewActiveCommunitySettings"];
  communitySettingsLayer: WebCommunitySecondaryPanelsProps["settings"]["communitySettingsLayer"];
  communitySettingsPane: CommunitySettingsPane;
  onSelectCommunitySettingsPane: (pane: CommunitySettingsPane, opts?: { replace?: boolean }) => void;
  canManageCommunitySettings: WebCommunitySecondaryPanelsProps["settings"]["canManageCommunitySettings"];
  canDeleteActiveCommunity: WebCommunitySecondaryPanelsProps["settings"]["canDeleteCommunity"];
  requireSignIn: WebCommunitySecondaryPanelsProps["settings"]["requireSignIn"];
  accountCommerceStatus: WebCommunitySecondaryPanelsProps["settings"]["accountCommerceStatus"];
  accountCommerceError: WebCommunitySecondaryPanelsProps["settings"]["accountCommerceError"];
  startStripeConnectOnboarding:
    WebCommunitySecondaryPanelsProps["settings"]["startStripeConnectOnboarding"];
  isStartingStripeConnectOnboarding:
    WebCommunitySecondaryPanelsProps["settings"]["isStartingStripeConnectOnboarding"];
  communityIntegrations:
    WebCommunitySecondaryPanelsProps["settings"]["communityIntegrations"];
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
  feedState: WebCommunitySecondaryPanelsProps["feed"]["state"];
  feedActions: WebCommunitySecondaryPanelsProps["feed"]["actions"];
  polynetState: WebCommunitySecondaryPanelsProps["polynet"]["state"];
  polynetActions: WebCommunitySecondaryPanelsProps["polynet"]["actions"];
  canViewActiveCommunityPolynet: WebCommunitySecondaryPanelsProps["polynet"]["canViewPolynet"];
  aiAgentHasSession: WebCommunitySecondaryPanelsProps["aiAgent"]["hasSession"];
  canManageMembersActiveCommunity: WebCommunitySecondaryPanelsProps["aiAgent"]["canManageMembersActiveCommunity"];
  aiAgentPreferredTab: WebCommunitySecondaryPanelsProps["aiAgent"]["preferredTab"];
  isLoadingCommunityAgentConfig: WebCommunitySecondaryPanelsProps["aiAgent"]["isLoadingCommunityAgentConfig"];
  communityAgentConfigError: WebCommunitySecondaryPanelsProps["aiAgent"]["communityAgentConfigError"];
  isActiveCommunityOwner: WebCommunitySecondaryPanelsProps["members"]["capabilities"]["isActiveCommunityOwner"];
  aiAgentWorkspaceEditorProps: WebCommunitySecondaryPanelsProps["aiAgent"]["workspaceEditorProps"];
  aiAgentAppsEditorProps: WebCommunitySecondaryPanelsProps["aiAgent"]["appsEditorProps"];
  aiAgentSkillsEditorProps: WebCommunitySecondaryPanelsProps["aiAgent"]["skillsEditorProps"];
  isLoadingCommunityFunnel: WebCommunitySecondaryPanelsProps["funnel"]["isLoadingCommunityFunnel"];
  communityFunnelError: WebCommunitySecondaryPanelsProps["funnel"]["communityFunnelError"];
  funnelEditorProps: WebCommunitySecondaryPanelsProps["funnel"]["editorProps"];
  canViewActiveCommunityAnalytics: WebCommunitySecondaryPanelsProps["analytics"]["canViewActiveCommunityAnalytics"];
  analyticsState: WebCommunitySecondaryPanelsProps["analytics"]["state"];
  analyticsActions: WebCommunitySecondaryPanelsProps["analytics"]["actions"];
  resourcesState: WebCommunitySecondaryPanelsProps["resources"]["state"];
  resourcesActions: WebCommunitySecondaryPanelsProps["resources"]["actions"];
  eventsState: WebCommunitySecondaryPanelsProps["events"]["state"];
  eventsActions: WebCommunitySecondaryPanelsProps["events"]["actions"];
  canManageResourcesActiveCommunity: boolean;
  canModerateContentActiveCommunity: boolean;
  membersState: WebCommunitySecondaryPanelsProps["members"]["state"];
  membersActions: WebCommunitySecondaryPanelsProps["members"]["actions"];
  canReviewJoinRequestsActiveCommunity: WebCommunitySecondaryPanelsProps["members"]["capabilities"]["canReviewJoinRequests"];
  canViewMemberPlanDetailsActiveCommunity:
    WebCommunitySecondaryPanelsProps["members"]["capabilities"]["canViewMemberPlanDetails"];
  resourceModuleModalProps: WebCommunitySecondaryPanelsProps["resourceModuleModal"];
  resourceModuleDeleteModalProps: WebCommunitySecondaryPanelsProps["resourceModuleDeleteModal"];
  resourceModalProps: WebCommunitySecondaryPanelsProps["resourceModal"];
  canPostMessagesActiveCommunity: WebCommunityChatPanelProps["canPostMessages"];
  isProfileSetupComplete: WebCommunityChatPanelProps["isProfileSetupComplete"];
  isLoadingChat: WebCommunityChatPanelProps["isLoadingChat"];
  hasResolvedCommunityChat: WebCommunityChatPanelProps["hasResolvedCommunityChat"];
  isLoadingMoreChat: WebCommunityChatPanelProps["isLoadingMoreChat"];
  communityChatHasMore: WebCommunityChatPanelProps["communityChatHasMore"];
  communityMessages: WebCommunityChatPanelProps["communityMessages"];
  communityActivityEvents: WebCommunityChatPanelProps["communityActivityEvents"];
  communityMessageById: WebCommunityChatPanelProps["communityMessageById"];
  messageReactions: WebCommunityChatPanelProps["messageReactions"];
  typingPresence: WebCommunityChatPanelProps["typingPresence"];
  onThreadTypingSignal: WebCommunityChatPanelProps["onThreadTypingSignal"];
  profilesByUserId: WebCommunityChatPanelProps["profilesByUserId"];
  editingMessageId: WebCommunityChatPanelProps["editingMessageId"];
  editingMessageText: WebCommunityChatPanelProps["editingMessageText"];
  reactionPickerMessageId: WebCommunityChatPanelProps["reactionPickerMessageId"];
  replyingToMessage: WebCommunityChatPanelProps["replyingToMessage"];
  communityAttachments: WebCommunityChatPanelProps["communityAttachments"];
  communityMessageInput: WebCommunityChatPanelProps["communityMessageInput"];
  communityMessageMentions: WebCommunityChatPanelProps["communityMessageMentions"];
  setCommunityMessageMentions: WebCommunityChatPanelProps["setCommunityMessageMentions"];
  isSendingCommunityMessage: WebCommunityChatPanelProps["isSendingCommunityMessage"];
  communityChatError: WebCommunityChatPanelProps["communityChatError"];
  isUserAtBottom: WebCommunityChatPanelProps["isUserAtBottom"];
  unreadCount: WebCommunityChatPanelProps["unreadCount"];
  copiedCommunityMessageId: WebCommunityChatPanelProps["copiedCommunityMessageId"];
  reactionEmojis: WebCommunityChatPanelProps["reactionEmojis"];
  messageListRef: WebCommunityChatPanelProps["messageListRef"];
  fileInputRef: WebCommunityChatPanelProps["fileInputRef"];
  chatInputRef: WebCommunityChatPanelProps["chatInputRef"];
  onChatScroll: WebCommunityChatPanelProps["onChatScroll"];
  onFinishProfileSetup: WebCommunityChatPanelProps["onFinishProfileSetup"];
  onScrollToBottom: WebCommunityChatPanelProps["onScrollToBottom"];
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
  shouldShowCommunitySenderMeta: WebCommunityChatPanelProps["shouldShowCommunitySenderMeta"];
  getAvatarColor: WebCommunityChatPanelProps["getAvatarColor"];
  getInitials: WebCommunityChatPanelProps["getInitials"];
  formatChatTime: WebCommunityChatPanelProps["formatChatTime"];
  parseReplyPrefix: WebCommunityChatPanelProps["parseReplyPrefix"];
  truncateReplyPreview: WebCommunityChatPanelProps["truncateReplyPreview"];
  renderTextWithLinks: WebCommunityChatPanelProps["renderTextWithLinks"];
  onScrollToReplyMessage: WebCommunityChatPanelProps["onScrollToReplyMessage"];
  onOpenCommunityChatLightbox: WebCommunityChatPanelProps["onOpenCommunityChatLightbox"];
  onToggleReaction: WebCommunityChatPanelProps["onToggleReaction"];
  onSetReactionPickerMessageId: WebCommunityChatPanelProps["onSetReactionPickerMessageId"];
  onStartReply: WebCommunityChatPanelProps["onStartReply"];
  onCopyMessage: WebCommunityChatPanelProps["onCopyMessage"];
  onStartEdit: WebCommunityChatPanelProps["onStartEdit"];
  onDeleteMessage: WebCommunityChatPanelProps["onDeleteMessage"];
  onEditingMessageTextChange: WebCommunityChatPanelProps["onEditingMessageTextChange"];
  onSaveEdit: WebCommunityChatPanelProps["onSaveEdit"];
  onCancelEdit: WebCommunityChatPanelProps["onCancelEdit"];
  voiceButtonProps: WebCommunityChatPanelProps["voiceButtonProps"];
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
      hasSession: params.hasAuthenticatedPresentation,
      canViewActiveCommunitySettings: params.canViewActiveCommunitySettings,
      communitySettingsLayer: params.communitySettingsLayer,
      activePane: params.communitySettingsPane,
      onSelectPane: params.onSelectCommunitySettingsPane,
      canManageCommunitySettings: params.canManageCommunitySettings,
      canDeleteCommunity: params.canDeleteActiveCommunity,
      requireSignIn: params.requireSignIn,
      accountCommerceStatus: params.accountCommerceStatus,
      accountCommerceError: params.accountCommerceError,
      startStripeConnectOnboarding: params.startStripeConnectOnboarding,
      isStartingStripeConnectOnboarding: params.isStartingStripeConnectOnboarding,
      communityIntegrations: params.communityIntegrations,
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
    feed: {
      capabilities: {
        hasActiveCommunity: Boolean(params.activeCommunity),
        hasSession: params.hasAuthenticatedPresentation,
        activeCommunityName: params.activeCommunity?.name ?? null,
        canModerateFeed: params.canModerateContentActiveCommunity,
      },
      state: params.feedState,
      actions: params.feedActions,
    },
    polynet: {
      hasActiveCommunity: Boolean(params.activeCommunity),
      activeCommunityName: params.activeCommunity?.name ?? null,
      hasSession: params.hasAuthenticatedPresentation,
      canViewPolynet: params.canViewActiveCommunityPolynet,
      onRequireSignIn: params.requireSignIn,
      state: params.polynetState,
      actions: params.polynetActions,
    },
    aiAgent: {
      activeCommunity: params.activeCommunity,
      hasSession: params.aiAgentHasSession,
      canManageMembersActiveCommunity: params.canManageMembersActiveCommunity,
      preferredTab: params.aiAgentPreferredTab,
      isLoadingCommunityAgentConfig: params.isLoadingCommunityAgentConfig,
      communityAgentConfigError: params.communityAgentConfigError,
      onRequireSignIn: params.requireSignIn,
      workspaceEditorProps: params.aiAgentWorkspaceEditorProps,
      appsEditorProps: params.aiAgentAppsEditorProps,
      skillsEditorProps: params.aiAgentSkillsEditorProps,
    },
    funnel: {
      activeCommunity: params.activeCommunity,
      hasSession: params.hasAuthenticatedPresentation,
      canManageMembersActiveCommunity: params.canManageMembersActiveCommunity,
      isLoadingCommunityFunnel: params.isLoadingCommunityFunnel,
      communityFunnelError: params.communityFunnelError,
      onRequireSignIn: params.requireSignIn,
      editorProps: params.funnelEditorProps,
    },
    analytics: {
      hasActiveCommunity: Boolean(params.activeCommunity),
      hasSession: params.hasAuthenticatedPresentation,
      canViewActiveCommunityAnalytics: params.canViewActiveCommunityAnalytics,
      onRequireSignIn: params.requireSignIn,
      state: params.analyticsState,
      actions: params.analyticsActions,
    },
    resources: {
      capabilities: {
        hasActiveCommunity: Boolean(params.activeCommunity),
        activeCommunityName: params.activeCommunity?.name ?? null,
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
    members: {
      activeCommunity: params.activeCommunity,
      capabilities: {
        canManageMembers: params.canManageMembersActiveCommunity,
        canManageJoinPolicy: params.canManageMembersActiveCommunity,
        canReviewJoinRequests: params.canReviewJoinRequestsActiveCommunity,
        canViewMemberPlanDetails: params.canViewMemberPlanDetailsActiveCommunity,
        isActiveCommunityOwner: params.isActiveCommunityOwner,
      },
      state: params.membersState,
      actions: params.membersActions,
    },
    resourceModuleModal: params.resourceModuleModalProps,
    resourceModuleDeleteModal: params.resourceModuleDeleteModalProps,
    resourceModal: params.resourceModalProps,
  };

  const communityChatPanelProps: WebCommunityChatPanelProps = {
    activeCommunity: params.activeCommunity
      ? {
          id: params.activeCommunity.id,
          name: params.activeCommunity.name,
          owner_id: params.activeCommunity.owner_id ?? null,
        }
      : null,
    session: params.session,
    isResolvingSelectedCommunity:
      params.hasAuthenticatedPresentation &&
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
    isProfileSetupComplete: params.isProfileSetupComplete,
    canModerateMessages: params.canModerateContentActiveCommunity,
    isLoadingChat: params.isLoadingChat,
    hasResolvedCommunityChat: params.hasResolvedCommunityChat,
    isLoadingMoreChat: params.isLoadingMoreChat,
    communityChatHasMore: params.communityChatHasMore,
    communityMessages: params.communityMessages,
    communityActivityEvents: params.communityActivityEvents,
    communityMessageById: params.communityMessageById,
    messageReactions: params.messageReactions,
    typingPresence: params.typingPresence,
    onThreadTypingSignal: params.onThreadTypingSignal,
    profilesByUserId: params.profilesByUserId,
    editingMessageId: params.editingMessageId,
    editingMessageText: params.editingMessageText,
    reactionPickerMessageId: params.reactionPickerMessageId,
    replyingToMessage: params.replyingToMessage,
    communityAttachments: params.communityAttachments,
    communityMessageInput: params.communityMessageInput,
    communityMessageMentions: params.communityMessageMentions,
    setCommunityMessageMentions: params.setCommunityMessageMentions,
    isSendingCommunityMessage: params.isSendingCommunityMessage,
    communityChatError: params.communityChatError,
    isUserAtBottom: params.isUserAtBottom,
    unreadCount: params.unreadCount,
    copiedCommunityMessageId: params.copiedCommunityMessageId,
    reactionEmojis: params.reactionEmojis,
    messageListRef: params.messageListRef,
    fileInputRef: params.fileInputRef,
    chatInputRef: params.chatInputRef,
    onChatScroll: params.onChatScroll,
    onRequireSignIn: params.requireSignIn,
    onFinishProfileSetup: params.onFinishProfileSetup,
    onScrollToBottom: params.onScrollToBottom,
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
    shouldShowCommunitySenderMeta: params.shouldShowCommunitySenderMeta,
    getAvatarColor: params.getAvatarColor,
    getInitials: params.getInitials,
    formatChatTime: params.formatChatTime,
    parseReplyPrefix: params.parseReplyPrefix,
    truncateReplyPreview: params.truncateReplyPreview,
    renderTextWithLinks: params.renderTextWithLinks,
    onScrollToReplyMessage: params.onScrollToReplyMessage,
    onOpenCommunityChatLightbox: params.onOpenCommunityChatLightbox,
    onToggleReaction: params.onToggleReaction,
    onSetReactionPickerMessageId: params.onSetReactionPickerMessageId,
    onStartReply: params.onStartReply,
    onCopyMessage: params.onCopyMessage,
    onStartEdit: params.onStartEdit,
    onDeleteMessage: params.onDeleteMessage,
    onEditingMessageTextChange: params.onEditingMessageTextChange,
    onSaveEdit: params.onSaveEdit,
    onCancelEdit: params.onCancelEdit,
    voiceButtonProps: params.voiceButtonProps,
    onCommunityVoiceInputClick: params.onCommunityVoiceInputClick,
    lightboxModalProps: params.lightboxModalProps,
    interactionProjection: params.interactionProjection,
  };

  return {
    communityChatPanelProps,
    communitySecondarySurfaceProps,
  };
}
