import type { ComponentProps } from "react";
import type { CommunityTab } from "../../../../shared/appShellNavigation";
import type {
  CommunityAccess,
  CommunityPresenceSummary,
  UserProfile,
} from "../../../../shared/communityTypes";
import { buildCommunityThreadPath } from "../../../../shared/webAppRouteState";
import type { WebCommunityAgentDock } from "../components/WebCommunityAgentDock";
import type { buildWebShellChromeHostProps } from "./buildWebShellChromeHostProps";

type CommunityAgentDockHomeProps = ComponentProps<typeof WebCommunityAgentDock>["home"];
type HomeJoinReviewRequests = NonNullable<
  NonNullable<CommunityAgentDockHomeProps>["joinReview"]
>["requests"];
type ShellChromeHostParams = Parameters<typeof buildWebShellChromeHostProps>[0];
type ShellChromeAccountProps = ShellChromeHostParams["account"];
type ShellCommunityChannel = ShellChromeHostParams["communityChannels"][number];

export function buildWebShellAccountProps(params: {
  canonicalSessionUserId: string | null;
  displayName: (userId: string) => string;
  savedProfilesByUserId: Record<string, UserProfile>;
  activeCommunity: { id: string } | null;
  activeCommunityAccess: CommunityAccess | null;
  memberPreview: { available: boolean; active: boolean };
  onToggleMemberPreview: (next: boolean) => void;
  appTheme: NonNullable<ShellChromeAccountProps>["appTheme"];
  onSetAppTheme: NonNullable<ShellChromeAccountProps>["onSetAppTheme"];
  onSignOut: NonNullable<ShellChromeAccountProps>["onSignOut"];
}): ShellChromeAccountProps {
  if (!params.canonicalSessionUserId) return undefined;
  return {
    name: params.displayName(params.canonicalSessionUserId),
    avatarUrl: params.savedProfilesByUserId[params.canonicalSessionUserId]?.avatar_url ?? null,
    // "Host" is the owner. Being able to see settings is not enough: a
    // Polynet operator can, in communities where they are only a member.
    // Blank until this community's access has loaded, so a host never
    // sees "Member" flash first.
    roleLabel: params.memberPreview.active
      ? "Viewing as a member"
      : !params.activeCommunity ||
          params.activeCommunityAccess?.community_id !== params.activeCommunity.id
        ? ""
        : params.activeCommunity && params.activeCommunityAccess?.is_owner === true
          ? "Host"
          : "Member",
    memberView: params.memberPreview.available
      ? {
          active: params.memberPreview.active,
          onToggle: () => params.onToggleMemberPreview(!params.memberPreview.active),
        }
      : undefined,
    appTheme: params.appTheme,
    onSetAppTheme: params.onSetAppTheme,
    onSignOut: params.onSignOut,
  };
}

export function buildWebCommunityAgentHomeProps(params: {
  designV1Active: boolean;
  activeCommunity: { id: string; name: string } | null;
  canonicalSessionUserId: string | null;
  activeCommunityAccess: CommunityAccess | null;
  displayName: (userId: string) => string;
  canReviewJoinRequestsActiveCommunity: boolean;
  communityContextJoinRequests: HomeJoinReviewRequests;
  hasLoadedCommunityJoinRequests: boolean;
  communityJoinRequestsError: string | null;
  decidingCommunityJoinRequestId: string | null;
  onApproveJoinRequest: (id: string) => void;
  onDeclineJoinRequest: (id: string) => void;
  selectedActiveCommunitySlug: string | null;
  activeCommunityChannels: ShellCommunityChannel[];
  leavePhoneHome: () => void;
  onOpenJoinRequests: () => void;
  onOpenMembers: () => void;
  onSelectCommunityChannel: (channel: ShellCommunityChannel) => void;
  navigateTo: (path: string) => void;
  onSelectCommunityTab: (tab: CommunityTab) => void;
  onTurnOnAgent: () => void;
  presence: CommunityPresenceSummary | null;
}): CommunityAgentDockHomeProps {
  const { activeCommunity, canonicalSessionUserId, activeCommunityAccess } = params;
  // Home is the guide's page on desktop and the phone's Home tab alike.
  // owner_id is the database user id and canonicalSessionUserId is the
  // sign-in subject, so ownership comes from the server's access answer.
  // Members get Home too, with member-safe facts; visitors do not.
  if (
    !params.designV1Active ||
    !activeCommunity ||
    !canonicalSessionUserId ||
    activeCommunityAccess?.community_id !== activeCommunity.id ||
    !(activeCommunityAccess.is_owner === true || activeCommunityAccess.can_read_chat === true)
  ) {
    return null;
  }

  return {
    audience: activeCommunityAccess.is_owner === true ? ("host" as const) : ("member" as const),
    communityId: activeCommunity.id,
    communityName: activeCommunity.name,
    firstName: params.displayName(canonicalSessionUserId).trim().split(/\s+/)[0] || "there",
    // The host decides on the people waiting from Home itself.
    joinReview:
      activeCommunityAccess.is_owner === true && params.canReviewJoinRequestsActiveCommunity
        ? {
            requests: params.communityContextJoinRequests,
            loaded: params.hasLoadedCommunityJoinRequests && !params.communityJoinRequestsError,
            decidingId: params.decidingCommunityJoinRequestId,
            onApprove: params.onApproveJoinRequest,
            onDecline: params.onDeclineJoinRequest,
          }
        : null,
    onOpenJoinRequests: params.onOpenJoinRequests,
    onOpenMembers: () => {
      params.leavePhoneHome();
      params.onOpenMembers();
    },
    onOpenChannelByName: (channelName: string) => {
      const channel = params.activeCommunityChannels.find(
        (candidate) => candidate.name === channelName,
      );
      if (!channel) return;
      params.leavePhoneHome();
      params.onSelectCommunityChannel(channel);
    },
    // A tag opens its message; the address is the truth.
    onOpenTag: (channelSlug: string, rootId: string | null) => {
      const path = buildCommunityThreadPath(params.selectedActiveCommunitySlug, channelSlug, rootId);
      if (!path) return;
      params.leavePhoneHome();
      params.navigateTo(path);
    },
    onOpenEvents: () => {
      params.leavePhoneHome();
      params.onSelectCommunityTab("events");
    },
    onOpenKnowledge: () => {
      params.leavePhoneHome();
      params.onSelectCommunityTab("resources");
    },
    // The Agent plan is bought in Billing (no trial).
    onTurnOnAgent: params.onTurnOnAgent,
    presence: params.presence,
  };
}
