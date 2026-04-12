import type { AppPage, CommunityTab } from "../../../../shared/appShellNavigation";
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
  selectedActiveCommunitySlug: string | null;
  hasSession: boolean;
  hasResolvedCommunities: boolean;
  isLoadingCommunities: boolean;
  sessionUserId: WebCommunityChatPanelProps["sessionUserId"];
  canViewActiveCommunitySettings: WebCommunitySecondaryPanelsProps["settings"]["canViewActiveCommunitySettings"];
  communitySettingsLayer: WebCommunitySecondaryPanelsProps["settings"]["communitySettingsLayer"];
  canManageCommunitySettings: WebCommunitySecondaryPanelsProps["settings"]["canManageCommunitySettings"];
  canDeleteActiveCommunity: WebCommunitySecondaryPanelsProps["settings"]["canDeleteCommunity"];
  openAuthGate: WebCommunitySecondaryPanelsProps["settings"]["openAuthGate"];
  settingsState: WebCommunitySecondaryPanelsProps["settings"]["state"];
  settingsActions: WebCommunitySecondaryPanelsProps["settings"]["actions"];
  setIsCommunityBannerFocusModalOpen:
    WebCommunitySecondaryPanelsProps["settings"]["setIsCommunityBannerFocusModalOpen"];
  communitySettingsBannerUrl: WebCommunitySecondaryPanelsProps["bannerEditor"]["bannerUrl"];
  communitySettingsBannerFocusX: WebCommunitySecondaryPanelsProps["bannerEditor"]["focusX"];
  communitySettingsBannerFocusY: WebCommunitySecondaryPanelsProps["bannerEditor"]["focusY"];
  communitySettingsBannerZoom: WebCommunitySecondaryPanelsProps["bannerEditor"]["zoom"];
  markCommunitySettingsDirty: WebCommunitySecondaryPanelsProps["bannerEditor"]["markCommunitySettingsDirty"];
  feedState: WebCommunitySecondaryPanelsProps["feed"]["state"];
  feedActions: WebCommunitySecondaryPanelsProps["feed"]["actions"];
  polynetState: WebCommunitySecondaryPanelsProps["polynet"]["state"];
  polynetActions: WebCommunitySecondaryPanelsProps["polynet"]["actions"];
  canViewActiveCommunityPolynet: WebCommunitySecondaryPanelsProps["polynet"]["canManagePolynet"];
  aiAgentHasSession: WebCommunitySecondaryPanelsProps["aiAgent"]["hasSession"];
  canManageMembersActiveCommunity: WebCommunitySecondaryPanelsProps["aiAgent"]["canManageMembersActiveCommunity"];
  isLoadingCommunityAgentConfig: WebCommunitySecondaryPanelsProps["aiAgent"]["isLoadingCommunityAgentConfig"];
  communityAgentConfigError: WebCommunitySecondaryPanelsProps["aiAgent"]["communityAgentConfigError"];
  isActiveCommunityOwner: WebCommunitySecondaryPanelsProps["members"]["capabilities"]["isActiveCommunityOwner"];
  aiAgentLandingEditorProps: WebCommunitySecondaryPanelsProps["aiAgent"]["landingEditorProps"];
  isLoadingCommunityFunnel: WebCommunitySecondaryPanelsProps["funnel"]["isLoadingCommunityFunnel"];
  communityFunnelError: WebCommunitySecondaryPanelsProps["funnel"]["communityFunnelError"];
  funnelEditorProps: WebCommunitySecondaryPanelsProps["funnel"]["editorProps"];
  canViewActiveCommunityAnalytics: WebCommunitySecondaryPanelsProps["analytics"]["canViewActiveCommunityAnalytics"];
  analyticsState: WebCommunitySecondaryPanelsProps["analytics"]["state"];
  analyticsActions: WebCommunitySecondaryPanelsProps["analytics"]["actions"];
  resourcesState: WebCommunitySecondaryPanelsProps["resources"]["state"];
  resourcesActions: WebCommunitySecondaryPanelsProps["resources"]["actions"];
  canManageResourcesActiveCommunity: boolean;
  membersState: WebCommunitySecondaryPanelsProps["members"]["state"];
  membersActions: WebCommunitySecondaryPanelsProps["members"]["actions"];
  canReviewJoinRequestsActiveCommunity: WebCommunitySecondaryPanelsProps["members"]["capabilities"]["canReviewJoinRequests"];
  canViewMemberPlanDetailsActiveCommunity:
    WebCommunitySecondaryPanelsProps["members"]["capabilities"]["canViewMemberPlanDetails"];
  resourceModalProps: WebCommunitySecondaryPanelsProps["resourceModal"];
  canPostMessagesActiveCommunity: WebCommunityChatPanelProps["canPostMessages"];
  isLoadingChat: WebCommunityChatPanelProps["isLoadingChat"];
  hasResolvedCommunityChat: WebCommunityChatPanelProps["hasResolvedCommunityChat"];
  isLoadingMoreChat: WebCommunityChatPanelProps["isLoadingMoreChat"];
  communityChatHasMore: WebCommunityChatPanelProps["communityChatHasMore"];
  communityMessages: WebCommunityChatPanelProps["communityMessages"];
  communityMessageById: WebCommunityChatPanelProps["communityMessageById"];
  messageReactions: WebCommunityChatPanelProps["messageReactions"];
  profilesByUserId: WebCommunityChatPanelProps["profilesByUserId"];
  editingMessageId: WebCommunityChatPanelProps["editingMessageId"];
  editingMessageText: WebCommunityChatPanelProps["editingMessageText"];
  reactionPickerMessageId: WebCommunityChatPanelProps["reactionPickerMessageId"];
  replyingToMessage: WebCommunityChatPanelProps["replyingToMessage"];
  communityAttachments: WebCommunityChatPanelProps["communityAttachments"];
  communityMessageInput: WebCommunityChatPanelProps["communityMessageInput"];
  isSendingCommunityMessage: WebCommunityChatPanelProps["isSendingCommunityMessage"];
  communityChatError: WebCommunityChatPanelProps["communityChatError"];
  isUserAtBottom: WebCommunityChatPanelProps["isUserAtBottom"];
  unreadCount: WebCommunityChatPanelProps["unreadCount"];
  reactionEmojis: WebCommunityChatPanelProps["reactionEmojis"];
  messageListRef: WebCommunityChatPanelProps["messageListRef"];
  fileInputRef: WebCommunityChatPanelProps["fileInputRef"];
  chatInputRef: WebCommunityChatPanelProps["chatInputRef"];
  onChatScroll: WebCommunityChatPanelProps["onChatScroll"];
  onScrollToBottom: WebCommunityChatPanelProps["onScrollToBottom"];
  onSetReplyingToMessage: WebCommunityChatPanelProps["onSetReplyingToMessage"];
  onRemoveCommunityAttachment: WebCommunityChatPanelProps["onRemoveCommunityAttachment"];
  onCommunityFileInputChange: WebCommunityChatPanelProps["onCommunityFileInputChange"];
  onCommunityMessageInputChange: WebCommunityChatPanelProps["onCommunityMessageInputChange"];
  onSendCommunityMessage: WebCommunityChatPanelProps["onSendCommunityMessage"];
  displayName: WebCommunityChatPanelProps["displayName"];
  shouldShowCommunitySenderMeta: WebCommunityChatPanelProps["shouldShowCommunitySenderMeta"];
  shouldShowDateSeparator: WebCommunityChatPanelProps["shouldShowDateSeparator"];
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
  lightboxModalProps: WebCommunityChatPanelProps["lightboxModalProps"];
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
      hasSession: params.hasSession,
      canViewActiveCommunitySettings: params.canViewActiveCommunitySettings,
      communitySettingsLayer: params.communitySettingsLayer,
      canManageCommunitySettings: params.canManageCommunitySettings,
      canDeleteCommunity: params.canDeleteActiveCommunity,
      openAuthGate: params.openAuthGate,
      state: params.settingsState,
      actions: params.settingsActions,
      setIsCommunityBannerFocusModalOpen: params.setIsCommunityBannerFocusModalOpen,
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
        hasSession: params.hasSession,
        activeCommunityName: params.activeCommunity?.name ?? null,
      },
      state: params.feedState,
      actions: params.feedActions,
    },
    polynet: {
      hasActiveCommunity: Boolean(params.activeCommunity),
      activeCommunityName: params.activeCommunity?.name ?? null,
      hasSession: params.hasSession,
      canManagePolynet: params.canViewActiveCommunityPolynet,
      onOpenAuthGate: params.openAuthGate,
      state: params.polynetState,
      actions: params.polynetActions,
    },
    aiAgent: {
      activeCommunity: params.activeCommunity,
      hasSession: params.aiAgentHasSession,
      canManageMembersActiveCommunity: params.canManageMembersActiveCommunity,
      isLoadingCommunityAgentConfig: params.isLoadingCommunityAgentConfig,
      communityAgentConfigError: params.communityAgentConfigError,
      onOpenAuthGate: params.openAuthGate,
      landingEditorProps: params.aiAgentLandingEditorProps,
    },
    funnel: {
      activeCommunity: params.activeCommunity,
      hasSession: params.hasSession,
      canManageMembersActiveCommunity: params.canManageMembersActiveCommunity,
      isLoadingCommunityFunnel: params.isLoadingCommunityFunnel,
      communityFunnelError: params.communityFunnelError,
      onOpenAuthGate: params.openAuthGate,
      editorProps: params.funnelEditorProps,
    },
    analytics: {
      hasActiveCommunity: Boolean(params.activeCommunity),
      hasSession: params.hasSession,
      canViewActiveCommunityAnalytics: params.canViewActiveCommunityAnalytics,
      onOpenAuthGate: params.openAuthGate,
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
    resourceModal: params.resourceModalProps,
  };

  const communityChatPanelProps: WebCommunityChatPanelProps = {
    activeCommunity: params.activeCommunity ? { name: params.activeCommunity.name } : null,
    isResolvingSelectedCommunity:
      params.hasSession &&
      params.activePage === "community" &&
      Boolean(String(params.selectedActiveCommunitySlug ?? "").trim()) &&
      !params.activeCommunity &&
      (!params.hasResolvedCommunities || params.isLoadingCommunities),
    hasSession: params.hasSession,
    sessionUserId: params.sessionUserId,
    canPostMessages: params.canPostMessagesActiveCommunity,
    canModerateMessages: params.canManageResourcesActiveCommunity,
    isLoadingChat: params.isLoadingChat,
    hasResolvedCommunityChat: params.hasResolvedCommunityChat,
    isLoadingMoreChat: params.isLoadingMoreChat,
    communityChatHasMore: params.communityChatHasMore,
    communityMessages: params.communityMessages,
    communityMessageById: params.communityMessageById,
    messageReactions: params.messageReactions,
    profilesByUserId: params.profilesByUserId,
    editingMessageId: params.editingMessageId,
    editingMessageText: params.editingMessageText,
    reactionPickerMessageId: params.reactionPickerMessageId,
    replyingToMessage: params.replyingToMessage,
    communityAttachments: params.communityAttachments,
    communityMessageInput: params.communityMessageInput,
    isSendingCommunityMessage: params.isSendingCommunityMessage,
    communityChatError: params.communityChatError,
    isUserAtBottom: params.isUserAtBottom,
    unreadCount: params.unreadCount,
    reactionEmojis: params.reactionEmojis,
    messageListRef: params.messageListRef,
    fileInputRef: params.fileInputRef,
    chatInputRef: params.chatInputRef,
    onChatScroll: params.onChatScroll,
    onOpenAuthGate: params.openAuthGate,
    onScrollToBottom: params.onScrollToBottom,
    onSetReplyingToMessage: params.onSetReplyingToMessage,
    onRemoveCommunityAttachment: params.onRemoveCommunityAttachment,
    onCommunityFileInputChange: params.onCommunityFileInputChange,
    onCommunityMessageInputChange: params.onCommunityMessageInputChange,
    onSendCommunityMessage: params.onSendCommunityMessage,
    displayName: params.displayName,
    shouldShowCommunitySenderMeta: params.shouldShowCommunitySenderMeta,
    shouldShowDateSeparator: params.shouldShowDateSeparator,
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
    lightboxModalProps: params.lightboxModalProps,
  };

  return {
    communityChatPanelProps,
    communitySecondarySurfaceProps,
  };
}
