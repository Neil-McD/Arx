import type { AuthSessionLike } from "../../../../shared/authSession";
import { classifyMediaKind } from "../../../../shared/attachmentHelpers";
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

type WorkspaceRightPanelChatAttachment = {
  type?: string | null;
  mime?: string | null;
  name?: string | null;
  url?: string | null;
  data_url?: string | null;
};

// Structural view of an interaction root bundle — Recent signal's chat rows are sourced from these
// (top-level posts), which carry reaction state + a root id for reacting from the panel.
type WorkspaceRightPanelInteractionRoot = {
  pending?: string | null;
  root: {
    id: string;
    actor_user_id: string | null;
    content_summary: string;
    reply_count?: number | null;
    last_reply_at?: string | null;
    reaction_summary?: readonly { emoji: string; count: number }[] | null;
    viewer_emojis?: readonly string[] | null;
    created_at: string | null;
  };
  attachments?: readonly WorkspaceRightPanelChatAttachment[] | null;
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

function formatPanelRelativeTime(iso: string | null, nowMs: number): string | null {
  const ms = parsePanelSignalTimestampMs(iso);
  if (ms === null) return null;
  const diffMin = Math.floor(Math.max(0, nowMs - ms) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

// Drop the projection's "Shared attachment: name" summary line — the media chip carries it now.
function stripSharedAttachmentSummaryLine(text: string): string {
  return text
    .split(/\n{2,}/)
    .filter((part) => !/^shared attachments?:/i.test(part.trim()))
    .join("\n\n")
    .trim();
}

// Reduce a message's attachments (or a bare URL) to a single compact signal media descriptor.
function deriveSignalMedia(
  attachments: readonly WorkspaceRightPanelChatAttachment[] | null | undefined,
  body: string,
): WorkspaceUserPanelRecentSignal["media"] {
  const list = Array.isArray(attachments) ? attachments : [];
  let imageThumb: string | null = null;
  let hasVideo = false;
  let hasAudio = false;
  let hasFile = false;
  for (const attachment of list) {
    const source =
      (typeof attachment.data_url === "string" && attachment.data_url.trim()) ||
      (typeof attachment.url === "string" && attachment.url.trim()) ||
      null;
    if (attachment.type === "image" && source) {
      imageThumb = imageThumb ?? source;
      continue;
    }
    const kind = classifyMediaKind(attachment.mime, attachment.name);
    if (kind === "video") hasVideo = true;
    else if (kind === "audio") hasAudio = true;
    else hasFile = true;
  }
  if (imageThumb) return { kind: "image", thumbnailUrl: imageThumb, label: null };
  if (hasVideo) return { kind: "video", label: "Video" };
  if (hasAudio) return { kind: "audio", label: "Audio" };
  if (hasFile) return { kind: "file", label: "Attachment" };
  if (/\bhttps?:\/\/\S+/i.test(body)) return { kind: "link", label: "Link" };
  return null;
}

export function buildWorkspaceRightPanelRecentSignals(params: {
  nowMs?: number;
  communityInteractionRoots: readonly WorkspaceRightPanelInteractionRoot[];
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

  const sortedRoots = [...params.communityInteractionRoots]
    .filter((bundle) => !bundle.pending && !String(bundle.root.id ?? "").startsWith("pending:"))
    .map((bundle) => ({
      bundle,
      createdAtMs: parsePanelSignalTimestampMs(bundle.root.created_at),
    }))
    .filter((entry): entry is { bundle: WorkspaceRightPanelInteractionRoot; createdAtMs: number } => entry.createdAtMs !== null)
    .sort((a, b) => b.createdAtMs - a.createdAtMs);

  for (const { bundle, createdAtMs } of sortedRoots) {
    const root = bundle.root;
    const actorId = String(root.actor_user_id ?? "").trim();
    const actorName = actorId ? params.displayName(actorId) : "Member";
    const rawBody = String(root.content_summary ?? "");
    const hasAttachments = Array.isArray(bundle.attachments) && bundle.attachments.length > 0;
    const media = deriveSignalMedia(bundle.attachments, rawBody);
    const cleanedBody = hasAttachments ? stripSharedAttachmentSummaryLine(rawBody) : rawBody;
    const snippet = truncatePanelSignalText(cleanedBody, 160);
    if (!snippet && !media) continue;
    const viewerEmojis = new Set(root.viewer_emojis ?? []);
    const reactions = (root.reaction_summary ?? [])
      .filter((reaction) => reaction.emoji && reaction.count > 0)
      .map((reaction) => ({ emoji: reaction.emoji, count: reaction.count, reacted: viewerEmojis.has(reaction.emoji) }));
    const replyCount = Math.max(0, Math.floor(root.reply_count ?? 0));
    const signal: WorkspaceRightPanelRecentSignalCandidate = {
      id: `chat:${root.id}`,
      kind: "chat",
      title: actorName,
      subtitle: snippet || null,
      media,
      rootId: root.id,
      reactions: reactions.length > 0 ? reactions : null,
      replyCount,
      lastReplyLabel: replyCount > 0 ? formatPanelRelativeTime(root.last_reply_at ?? null, nowMs) : null,
      avatar: actorId ? buildAvatar(actorId, actorName) : null,
      replyContext: null,
      target: { tab: "chat", itemId: root.id },
      sortMs: createdAtMs,
    };
    if (createdAtMs >= recentStartMs && createdAtMs <= nowMs) {
      highlightedSignals.push(signal);
    }
  }

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
  integrations: readonly WorkspaceUserPanelIntegration[];
}): WorkspaceUserPanelCommunity | null {
  const activeCommunity = params.activeCommunity;
  if (!activeCommunity) return null;
  return {
    id: activeCommunity.id,
    slug: activeCommunity.slug ?? null,
    name: activeCommunity.name,
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
