import type { ReactNode } from "react";
import type { AuthSessionLike } from "../../../../shared/authSession";
import type {
  AnalyticsRange,
  CommunityAccess,
  CommunityAnalyticsSeries,
  CommunityAnalyticsSummary,
} from "../../../../shared/communityTypes";
import type { WorkspaceComputerStartResult } from "../../../../shared/workspaceTerminalsGateway";
import type { WorkspaceCreditBalance } from "../../../../shared/workspaceCreditsGateway";
import type { CommunityMembersJoinReviewMode } from "../communityJoinPolicy";
import type { WorkspaceUserPanelIntegration } from "./WebWorkspaceUserDataPanel";
import type {
  WorkspaceUserDataPanelDataProps,
  WorkspaceUserPanelCommunity,
  WorkspaceUserPanelOnlineFace,
  WorkspaceUserPanelRecentSignal,
} from "./WebWorkspaceUserDataPanel";

type WorkspaceRightPanelCommunityRole = WorkspaceUserPanelCommunity["role"];
type WorkspaceRightPanelRecentSignalCandidate = WorkspaceUserPanelRecentSignal & {
  sortMs: number;
};

export type WorkspaceRightPanelRecentSignalTarget = WorkspaceUserPanelRecentSignal["target"];

const WORKSPACE_PANEL_HIGHLIGHT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

type WorkspaceRightPanelProfile = {
  display_name?: string | null;
  avatar_url?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
};

type WorkspaceRightPanelAvatarSource = {
  avatar_url?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
};

type WorkspaceRightPanelAiFeedPost = {
  id: string;
  title: string | null;
  post_type: "observation" | "recommendation" | "action";
  pending?: boolean | null;
  created_at: string | null;
};

type WorkspaceRightPanelResource = {
  id: string;
  type: "post" | "link" | "embed" | "file";
  title: string;
  created_at: string | null;
};

type WorkspaceRightPanelEvent = {
  id: string;
  title: string;
  starts_at: string;
  status?: string | null;
};

type WorkspaceRightPanelCommunityRecord = {
  id: string;
  slug?: string | null;
  name: string;
  one_liner?: string | null;
  visibility?: string | null;
};

type WorkspaceRightPanelOnlineFaceSource = {
  user_id: string;
  display_name?: string | null;
  avatar_url?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
};

type WorkspaceRightPanelJoinRequest = {
  id: string;
  user_id: string;
  message: string | null;
  created_at: string;
};

function normalizeWorkspaceRightPanelCommunityRole(
  access: CommunityAccess | null,
  fallbackRole: string | null | undefined,
): WorkspaceRightPanelCommunityRole {
  if (access?.is_owner) return "owner";
  const candidate = String(access?.effective_role ?? fallbackRole ?? "").trim().toLowerCase();
  if (candidate === "owner") return "owner";
  if (candidate === "admin") return "admin";
  if (candidate === "moderator" || candidate === "mod") return "moderator";
  return "member";
}

function parsePanelSignalTimestampMs(value: string | null | undefined): number | null {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePanelSignalText(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function truncatePanelSignalText(value: string | null | undefined, maxLength = 150): string {
  const normalized = normalizePanelSignalText(value);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function formatPanelAiPostTypeLabel(value: WorkspaceRightPanelAiFeedPost["post_type"]): string {
  switch (value) {
    case "action":
      return "Action";
    case "recommendation":
      return "Recommendation";
    case "observation":
    default:
      return "Observation";
  }
}

function formatPanelResourceTypeLabel(value: WorkspaceRightPanelResource["type"]): string {
  switch (value) {
    case "embed":
      return "Embed";
    case "file":
      return "File";
    case "link":
      return "Link";
    case "post":
    default:
      return "Resource";
  }
}

function formatPanelEventDateTile(value: string): { month: string; day: string } | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return {
    month: new Intl.DateTimeFormat(undefined, { month: "short" }).format(date),
    day: new Intl.DateTimeFormat(undefined, { day: "numeric" }).format(date),
  };
}

function formatPanelEventTimeLabel(value: string): string | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}


export function buildWorkspaceRightPanelRecentSignals(params: {
  nowMs?: number;
  aiFeedPosts: readonly WorkspaceRightPanelAiFeedPost[];
  resources: readonly WorkspaceRightPanelResource[];
  events: readonly WorkspaceRightPanelEvent[];
  savedProfilesByUserId: Record<string, WorkspaceRightPanelProfile>;
  displayName: (userId: string) => string;
}): WorkspaceUserPanelRecentSignal[] {
  const highlightedSignals: WorkspaceRightPanelRecentSignalCandidate[] = [];
  const nowMs = params.nowMs ?? Date.now();
  const recentStartMs = nowMs - WORKSPACE_PANEL_HIGHLIGHT_WINDOW_MS;
  const upcomingEndMs = nowMs + WORKSPACE_PANEL_HIGHLIGHT_WINDOW_MS;
  const buildAvatar = (
    userId: string,
    fallbackDisplayName: string | null,
    fallbackProfile?: WorkspaceRightPanelAvatarSource | null,
  ): WorkspaceUserPanelOnlineFace => {
    const profile = params.savedProfilesByUserId[userId] ?? null;
    return {
      userId,
      displayName: profile?.display_name ?? fallbackDisplayName,
      avatarUrl: profile?.avatar_url ?? fallbackProfile?.avatar_url ?? null,
      avatarFocusX: profile?.avatar_focus_x ?? fallbackProfile?.avatar_focus_x ?? null,
      avatarFocusY: profile?.avatar_focus_y ?? fallbackProfile?.avatar_focus_y ?? null,
      avatarZoom: profile?.avatar_zoom ?? fallbackProfile?.avatar_zoom ?? null,
    };
  };
  const finalizeSignals = (signals: WorkspaceRightPanelRecentSignalCandidate[]) =>
    signals
      .sort((a, b) => {
        const distance = Math.abs(a.sortMs - nowMs) - Math.abs(b.sortMs - nowMs);
        if (distance !== 0) return distance;
        return b.sortMs - a.sortMs;
      })
      .map(({ sortMs: _sortMs, ...signal }) => signal);

  const sortedAiPosts = [...params.aiFeedPosts]
    .filter((post) => !post.pending)
    .map((post) => ({
      post,
      createdAtMs: parsePanelSignalTimestampMs(post.created_at),
    }))
    .filter((entry): entry is { post: WorkspaceRightPanelAiFeedPost; createdAtMs: number } => entry.createdAtMs !== null)
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
  for (const latestAiPost of sortedAiPosts) {
    const aiTitle = normalizePanelSignalText(latestAiPost.post.title);
    if (!aiTitle) continue;
    const signal: WorkspaceRightPanelRecentSignalCandidate = {
      id: `ai_feed:${latestAiPost.post.id}`,
      kind: "ai_feed",
      title: truncatePanelSignalText(aiTitle, 120),
      metaLabel: formatPanelAiPostTypeLabel(latestAiPost.post.post_type),
      iconLabel: "AI",
      target: { tab: "ai_feed", itemId: latestAiPost.post.id },
      sortMs: latestAiPost.createdAtMs,
    };
    if (latestAiPost.createdAtMs >= recentStartMs && latestAiPost.createdAtMs <= nowMs) {
      highlightedSignals.push(signal);
    }
  }

  const sortedResources = [...params.resources]
    .map((resource) => ({
      resource,
      createdAtMs: parsePanelSignalTimestampMs(resource.created_at),
    }))
    .filter((entry): entry is { resource: WorkspaceRightPanelResource; createdAtMs: number } => entry.createdAtMs !== null)
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
  for (const latestResource of sortedResources) {
    const resourceTitle = normalizePanelSignalText(latestResource.resource.title);
    if (!resourceTitle) continue;
    const signal: WorkspaceRightPanelRecentSignalCandidate = {
      id: `resource:${latestResource.resource.id}`,
      kind: "resource",
      title: truncatePanelSignalText(resourceTitle, 120),
      metaLabel: formatPanelResourceTypeLabel(latestResource.resource.type),
      target: { tab: "resources", itemId: latestResource.resource.id },
      sortMs: latestResource.createdAtMs,
    };
    if (latestResource.createdAtMs >= recentStartMs && latestResource.createdAtMs <= nowMs) {
      highlightedSignals.push(signal);
    }
  }

  const sortedUpcomingEvents = [...params.events]
    .filter((event) => String(event.status ?? "").trim().toLowerCase() !== "cancelled")
    .map((event) => ({
      event,
      startsAtMs: parsePanelSignalTimestampMs(event.starts_at),
    }))
    .filter((entry): entry is { event: WorkspaceRightPanelEvent; startsAtMs: number } => entry.startsAtMs !== null)
    .filter((entry) => entry.startsAtMs >= nowMs)
    .sort((a, b) => a.startsAtMs - b.startsAtMs);
  for (const upcomingEvent of sortedUpcomingEvents) {
    const eventTitle = normalizePanelSignalText(upcomingEvent.event.title);
    if (!eventTitle) continue;
    const eventDateTile = formatPanelEventDateTile(upcomingEvent.event.starts_at);
    const signal: WorkspaceRightPanelRecentSignalCandidate = {
      id: `event:${upcomingEvent.event.id}`,
      kind: "event",
      title: truncatePanelSignalText(eventTitle, 120),
      subtitle: formatPanelEventTimeLabel(upcomingEvent.event.starts_at),
      metaLabel: "Event",
      iconLabel: "EV",
      eventMonth: eventDateTile?.month ?? null,
      eventDay: eventDateTile?.day ?? null,
      target: { tab: "events", itemId: upcomingEvent.event.id },
      sortMs: upcomingEvent.startsAtMs,
    };
    if (upcomingEvent.startsAtMs <= upcomingEndMs) {
      highlightedSignals.push(signal);
    }
  }

  return finalizeSignals(highlightedSignals);
}

export function buildWorkspaceRightPanelCommunityData(params: {
  activeCommunity: WorkspaceRightPanelCommunityRecord | null;
  activeCommunityAccess: CommunityAccess | null;
  fallbackRole: string | null | undefined;
  memberCount: number | null;
  canManage: boolean;
  muted: boolean;
  onlineFaces: readonly WorkspaceRightPanelOnlineFaceSource[];
  analytics: {
    canView: boolean;
    range: AnalyticsRange;
    isLoading: boolean;
    error: string | null;
    summary: CommunityAnalyticsSummary;
    series: CommunityAnalyticsSeries;
  };
  operations: {
    canReviewJoinRequests: boolean;
    joinReviewMode: CommunityMembersJoinReviewMode | null;
    joinRequests: readonly WorkspaceRightPanelJoinRequest[];
    isLoadingJoinRequests: boolean;
    joinRequestsError: string | null;
    decidingJoinRequestId: string | null;
  };
  savedProfilesByUserId: Record<string, WorkspaceRightPanelProfile>;
  displayName: (userId: string) => string;
  formatJoinRequestCreatedAt: (createdAt: string) => string;
  recentSignals: readonly WorkspaceUserPanelRecentSignal[];
  recentSignalFeed?: ReactNode;
  recentSignalFeedVersion?: string | null;
  integrations: readonly WorkspaceUserPanelIntegration[];
}): WorkspaceUserPanelCommunity | null {
  const activeCommunity = params.activeCommunity;
  if (!activeCommunity) return null;
  return {
    id: activeCommunity.id,
    slug: activeCommunity.slug ?? null,
    name: activeCommunity.name,
    recentSignalFeed: params.recentSignalFeed ?? null,
    recentSignalFeedVersion: params.recentSignalFeedVersion ?? null,
    oneLiner: activeCommunity.one_liner ?? null,
    visibility: activeCommunity.visibility ?? null,
    memberCount: params.memberCount,
    canManage: params.canManage,
    role: normalizeWorkspaceRightPanelCommunityRole(params.activeCommunityAccess, params.fallbackRole),
    muted: params.muted,
    onlineFaces: params.onlineFaces.map((face) => ({
      userId: face.user_id,
      displayName: face.display_name ?? null,
      avatarUrl: face.avatar_url ?? null,
      avatarFocusX: face.avatar_focus_x ?? null,
      avatarFocusY: face.avatar_focus_y ?? null,
      avatarZoom: face.avatar_zoom ?? null,
    })),
    analytics: params.analytics,
    operations: {
      canReviewJoinRequests: params.operations.canReviewJoinRequests,
      joinReviewMode: params.operations.joinReviewMode,
      pendingJoinRequests: params.operations.joinRequests.slice(0, 4).map((request) => {
        const profile = params.savedProfilesByUserId[request.user_id] ?? null;
        return {
          id: request.id,
          userId: request.user_id,
          displayName: profile?.display_name ?? params.displayName(request.user_id),
          avatarUrl: profile?.avatar_url ?? null,
          avatarFocusX: profile?.avatar_focus_x ?? null,
          avatarFocusY: profile?.avatar_focus_y ?? null,
          avatarZoom: profile?.avatar_zoom ?? null,
          message: (request.message ?? "").trim() || null,
          createdAtLabel: params.formatJoinRequestCreatedAt(request.created_at),
        };
      }),
      hiddenJoinRequestCount: Math.max(0, params.operations.joinRequests.length - 4),
      isLoadingJoinRequests: params.operations.isLoadingJoinRequests,
      joinRequestsError: params.operations.joinRequestsError,
      decidingJoinRequestId: params.operations.decidingJoinRequestId,
    },
    recentSignals: [...params.recentSignals],
    integrations: [...params.integrations],
  };
}

export function buildWorkspaceRightPanelUserData(params: {
  workspaceCreditBalance: WorkspaceCreditBalance | null;
  isLoadingWorkspaceCreditBalance: boolean;
  workspaceCreditBalanceError: string | null;
  workspaceCreditTopupError: string | null;
  isStartingWorkspaceCreditTopupCheckout: boolean;
  hasWorkspaceCardOnFile?: boolean | null;
  isStartingWorkspaceComputer: boolean;
  isStoppingWorkspaceComputer: boolean;
  workspaceComputerStartError: string | null;
  session: AuthSessionLike | null;
  activeProjectId: string | null;
  activeProjectName: string | null;
  activeThreadTitle: string | null;
  activeModelLabel: string | null;
  activeCommunity: WorkspaceUserPanelCommunity | null;
  isLoadingCommunityMemberSettings: boolean;
  communityMemberSettingsError: string | null;
  onOpenWorkspaceCreditTopup: () => void;
  onTurnOnComputer: () => Promise<WorkspaceComputerStartResult>;
  onTurnOffComputer: () => Promise<boolean>;
  onOpenRecentSignal: (target: WorkspaceRightPanelRecentSignalTarget) => void;
  onToggleSignalReaction?: (rootId: string, emoji: string) => void;
  signalQuickReactions?: string[];
  onToggleCommunityMute: (muted: boolean) => Promise<void> | void;
  onSetCommunityAnalyticsRange: (value: AnalyticsRange) => void;
  onApproveCommunityJoinRequest: (requestId: string) => Promise<void> | void;
  onDenyCommunityJoinRequest: (requestId: string) => Promise<void> | void;
  onOpenWorkspaceIntegrationSetup: () => void;
  onToggleCommunityIntegration: (
    communityAppMountId: string,
    enabled: boolean,
  ) => Promise<boolean> | boolean | Promise<void> | void;
  onOpenActiveCommunityMembers: () => void;
  onOpenActiveCommunitySettings: () => void;
}): WorkspaceUserDataPanelDataProps {
  return params;
}
