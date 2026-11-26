import type { Dispatch, SetStateAction } from "react";
import { buildCommunityTabPath } from "../../../../shared/webAppRouteState";
import { formatRelativeTimeFromIso } from "../../../../shared/contentFormatting";
import type { WebCommunityJoinRequest } from "./useWebCommunityAdministrationState";
import type { UserProfile as SharedUserProfile } from "../../../../shared/communityTypes";
import type { CommunityMembersJoinReviewMode } from "../communityJoinPolicy";
import type { WebCommunityMessageAttachment } from "./useWebCommunityChatController";
import type { useWebCommunityChannelsController } from "./useWebCommunityChannelsController";
import type { useWebCommunityInteractionProjection } from "./useWebCommunityInteractionProjection";
import type { CommunityTypingPresenceBundle } from "../../../../shared/communityTypes";
import type { AuthSession } from "../auth";

export type ActiveChannelScopeState = {
  activeChannelCommunityId: string | null;
  isActiveCommunityChannelLoading: boolean;
  activeCommunityChannelResolutionError: string | null;
  isAwaitingActiveCommunityInteractionScope: boolean;
};

export function deriveActiveChannelScope(params: {
  activeCommunityId: string | null;
  isChannelContextReady: boolean;
  channelResolutionStatus: string;
  channelsError: string | null;
}): ActiveChannelScopeState {
  const activeChannelCommunityId = params.isChannelContextReady
    ? params.activeCommunityId
    : null;
  const isActiveCommunityChannelLoading =
    params.channelResolutionStatus === "loading";
  const activeCommunityChannelResolutionError =
    params.channelResolutionStatus === "not_found"
      ? "This channel does not exist or is no longer available."
      : params.channelResolutionStatus === "failed"
        ? params.channelsError
        : null;
  const isAwaitingActiveCommunityInteractionScope = Boolean(
    !activeCommunityChannelResolutionError &&
    (!params.isChannelContextReady || !activeChannelCommunityId),
  );
  return {
    activeChannelCommunityId,
    isActiveCommunityChannelLoading,
    activeCommunityChannelResolutionError,
    isAwaitingActiveCommunityInteractionScope,
  };
}

export type WebCommunityContextJoinRequestItem = {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  avatarFocusX: number | null;
  avatarFocusY: number | null;
  avatarZoom: number | null;
  message: string | null;
  createdAtLabel: string;
};

export function buildWebCommunityContextJoinRequests(params: {
  activeCommunityId: string | null;
  joinRequests: WebCommunityJoinRequest[];
  profilesByUserId: Record<string, SharedUserProfile>;
  displayName: (userId: string) => string;
}): WebCommunityContextJoinRequestItem[] {
  return params.joinRequests
    .filter(
      (request) =>
        request.community_id === params.activeCommunityId &&
        String(request.status ?? "").trim().toLowerCase() === "pending",
    )
    .map((request) => {
      const profile = params.profilesByUserId[request.user_id] ?? null;
      return {
        id: request.id,
        userId: request.user_id,
        displayName: profile?.display_name ?? params.displayName(request.user_id),
        avatarUrl: profile?.avatar_url ?? null,
        avatarFocusX: profile?.avatar_focus_x ?? null,
        avatarFocusY: profile?.avatar_focus_y ?? null,
        avatarZoom: profile?.avatar_zoom ?? null,
        message: (request.message ?? "").trim() || null,
        createdAtLabel: formatRelativeTimeFromIso(request.created_at),
      };
    });
}

export function buildWebCommunityInteractionProjectionProps(params: {
  peopleOpen: boolean;
  onPeopleOpenChange: (open: boolean) => void;
  mobileThreadPage: boolean;
  channels: ReturnType<typeof useWebCommunityChannelsController>;
  channelScope: ActiveChannelScopeState;
  interaction: ReturnType<typeof useWebCommunityInteractionProjection<WebCommunityMessageAttachment>>;
  session: AuthSession | null;
  canonicalSessionUserId: string | null;
  chatDividerBoundary: number | null;
  handleChatCaughtUp: () => void;
  setCommunityChannelSlug: Dispatch<SetStateAction<string | null>>;
  mobileChromeScrollTrackingEnabled: boolean;
  setMobileChromeReadingMode: (active: boolean) => void;
  typingPresence: CommunityTypingPresenceBundle;
  presenceSummary: any;
  isLoadingCommunityPresence: boolean;
  activeCommunityId: string | null;
  communityOwnerId: string | null;
  canManageCommunityMembers: boolean;
  canReviewCommunityJoinRequests: boolean;
  canModerateContent: boolean;
  communityJoinReviewMode: CommunityMembersJoinReviewMode | null;
  communityJoinRequests: WebCommunityContextJoinRequestItem[];
  isLoadingCommunityJoinRequests: boolean;
  communityJoinRequestsError: string | null;
  decidingCommunityJoinRequestId: string | null;
  onApproveCommunityJoinRequest: (requestId: string) => Promise<void>;
  onDenyCommunityJoinRequest: (requestId: string) => Promise<void>;
  canViewMemberPlanDetails: boolean;
  isActiveCommunityOwner: boolean;
  communityInitials: (name: string) => string;
}) {
  const { channels, channelScope, interaction } = params;
  const isReady = channels.isChannelContextReady;
  const activeChannel = channels.selectedChannel;

  return {
    peopleOpen: params.peopleOpen,
    onPeopleOpenChange: params.onPeopleOpenChange,
    mobileThreadPage: params.mobileThreadPage,
    activeChannel: isReady ? activeChannel : null,
    canManageActiveChannel: params.canManageCommunityMembers && Boolean(activeChannel),
    managingChannelId: channels.managingChannelId,
    manageChannelError: channels.manageChannelError,
    onClearManageChannelError: channels.clearManageChannelError,
    onRenameChannel: channels.renameChannel,
    onDeleteChannel: channels.deleteChannel,
    pinnedRoot: isReady ? interaction.pinnedRoot : null,
    isUpdatingPinnedRoot: interaction.isUpdatingPinnedRoot,
    pinnedRootError: isReady ? interaction.pinnedRootError : null,
    canManagePinnedRoot: params.canManageCommunityMembers && Boolean(activeChannel),
    onSetPinnedRoot: interaction.setPinnedRootId,
    onMobileReadingModeChange: params.mobileChromeScrollTrackingEnabled
      ? params.setMobileChromeReadingMode
      : undefined,
    roots: isReady ? interaction.visibleRoots : [],
    activityEvents: isReady && activeChannel?.is_general ? interaction.activityEvents : [],
    selectedRootId: isReady ? interaction.selectedRootId : null,
    selectedRoot: isReady ? interaction.selectedRoot : null,
    replies: isReady ? interaction.selectedReplies : [],
    isLoadingRoots:
      channelScope.isActiveCommunityChannelLoading ||
      channelScope.isAwaitingActiveCommunityInteractionScope ||
      (isReady && interaction.isLoadingRoots),
    isLoadingReplies: isReady && interaction.isLoadingSelectedReplies,
    error:
      channelScope.activeCommunityChannelResolutionError ??
      (isReady ? interaction.error : null),
    errorActionLabel:
      channels.channelResolutionStatus === "not_found"
        ? "Return to General"
        : undefined,
    repliesError: isReady ? interaction.selectedRepliesError : null,
    onSelectRoot: interaction.selectRoot,
    onCloseDrawer: interaction.closeDrawer,
    onToggleReaction: interaction.toggleReaction,
    onEditMessage: interaction.editMessage,
    onDeleteMessage: interaction.deleteMessage,
    currentUserId: params.canonicalSessionUserId,
    chatLastSeenAt: params.chatDividerBoundary,
    rootChangeReason: interaction.rootChangeReason,
    canLoadOlderRoots: interaction.canLoadOlderRoots,
    isLoadingOlderRoots: interaction.isLoadingOlderRoots,
    onLoadOlderRoots: () => {
      if (!channelScope.activeChannelCommunityId) return;
      void interaction.loadOlderRoots(channelScope.activeChannelCommunityId, params.session);
    },
    onCaughtUp: params.handleChatCaughtUp,
    onRetryRoots: () => {
      if (channels.channelResolutionStatus === "not_found") {
        params.setCommunityChannelSlug(null);
        return;
      }
      if (channels.channelResolutionStatus === "failed") {
        channels.retryChannels();
        return;
      }
      if (!channelScope.activeChannelCommunityId) return;
      void interaction.loadRoots(channelScope.activeChannelCommunityId, params.session);
    },
    onRetryReplies: (rootId: string) => {
      void interaction.loadReplies(rootId, params.session);
    },
    onRetrySend: interaction.retryPending,
    onDiscardPending: interaction.discardPending,
    typingPresence: isReady ? params.typingPresence : undefined,
    presenceSummary: params.presenceSummary,
    isLoadingCommunityPresence: params.isLoadingCommunityPresence,
    communityId: params.activeCommunityId,
    communityOwnerId: params.communityOwnerId,
    canManageCommunityMembers: params.canManageCommunityMembers,
    canReviewCommunityJoinRequests: params.canReviewCommunityJoinRequests,
    canModerateContent: params.canModerateContent,
    communityJoinReviewMode: params.communityJoinReviewMode,
    communityJoinRequests: params.communityJoinRequests,
    isLoadingCommunityJoinRequests: params.isLoadingCommunityJoinRequests,
    communityJoinRequestsError: params.communityJoinRequestsError,
    decidingCommunityJoinRequestId: params.decidingCommunityJoinRequestId,
    onApproveCommunityJoinRequest: params.onApproveCommunityJoinRequest,
    onDenyCommunityJoinRequest: params.onDenyCommunityJoinRequest,
    canViewMemberPlanDetails: params.canViewMemberPlanDetails,
    isActiveCommunityOwner: params.isActiveCommunityOwner,
    communityInitials: params.communityInitials,
  };
}

export function buildChannelSelectPath(
  communitySlug: string | null,
  channel: { is_general?: boolean; slug: string },
): string | null {
  return buildCommunityTabPath(
    communitySlug,
    "chat",
    null,
    null,
    channel.is_general ? null : channel.slug,
  );
}
