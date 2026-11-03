import { presentInteractionActorType } from "../shared/communityAgentIdentity";
import { SHARED_SEARCH_ACCESS_KEY, restrictedSearchAccessKey, syncCommunitySearchDoc } from "./communitySearchDocs";
import { buildCommunitySearchQuery, searchWords, stemSearchWord } from "../shared/communitySearchText";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { getCommunityChannelCapabilities, resolveCommunityChannelActor, type ChannelActor, type ChannelActorKind } from "./communityChannelAccess";
import { channelActorKindValidator } from "./communityChannelValidators";
import {
  normalizeIdValue,
  requireCommunityChatAccess,
  resolvePublicUserId,
  toIsoString,
} from "./communityCore";
import { normalizeOptionalText, truncateText } from "./communityText";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { recordTrustedCommunitySourceTraceCore } from "./communityIntelligenceDirectory";
import {
  communityInteractionEvidenceSourceIsReadable,
  resolveCommunityInteractionEvidenceSource,
  requireSharedInteractionEvidenceChannel,
  type CommunityInteractionEvidenceRow,
  type ResolvedCommunityInteractionEvidence,
} from "./communityInteractionEvidenceCore";
import {
  communityEvidenceSurfaceValidator,
  resolveTrustedCommunityEvidenceUserId,
} from "./communityEvidenceAudit";
import {
  buildCommunityInteractionEvidenceRef,
  communityInteractionVisibilityIsEvidenceReadable,
  deriveCommunityInteractionLineageEnvelope,
  normalizeCommunityEvidenceSearchLimit,
  parseCommunityInteractionEvidenceRef,
  type CommunityEvidenceSurface,
  type CommunityInteractionEvidenceObjectType,
} from "../shared/communityEvidenceContract";
import {
  type CommunityChannelLike,
  interactionBelongsToChannel,
  listSharedChannelReadableRows,
  listChannelReadableRows,
  listSharedCommunityChannels,
  requireSharedChannelForAddressableRow,
  requireChannelFromAuthorizedSet,
  resolveAuthorizedCommunityChannel,
} from "./communityChannelCore";

type InteractionRow = CommunityInteractionEvidenceRow;

type CommunityRow = {
  _id: any;
  name?: string;
  slug?: string;
};

type ContentBlockRow = {
  _id: any;
  communityId: any;
  rootId?: any;
  replyId?: any;
  blockOrder: number;
  blockType: string;
  text?: string;
  url?: string;
  workspaceRefKind?: string;
  workspaceRefId?: string;
};

type AttachmentRow = {
  _id: any;
  communityId: any;
  rootId?: any;
  replyId?: any;
  attachmentKind: string;
  status: string;
  name: string;
  mimeType?: string;
  sizeBytes: number;
  externalUrl?: string;
};

type EmbedRow = {
  _id: any;
  communityId: any;
  rootId?: any;
  replyId?: any;
  embedKind: string;
  status: string;
  visibilityScope: "private" | "admin" | "community" | "public";
  sourceUrl?: string;
  workspaceRefKind?: string;
  workspaceRefId?: string;
  title?: string;
  description?: string;
};

const evidenceObjectTypeValidator = v.union(v.literal("root"), v.literal("reply"));
const RECENT_ROOT_SCAN_LIMIT = 80;
const RECENT_REPLY_SCAN_LIMIT = 160;

function interactionChildBelongsToEvidence(args: {
  child: { communityId: any; rootId?: any; replyId?: any };
  communityId: any;
  objectType: CommunityInteractionEvidenceObjectType;
  objectId: any;
}): boolean {
  if (normalizeIdValue(args.child.communityId) !== normalizeIdValue(args.communityId)) {
    return false;
  }
  if (args.objectType === "root") {
    return (
      normalizeIdValue(args.child.rootId) === normalizeIdValue(args.objectId) &&
      !normalizeIdValue(args.child.replyId)
    );
  }
  return (
    normalizeIdValue(args.child.replyId) === normalizeIdValue(args.objectId) &&
    !normalizeIdValue(args.child.rootId)
  );
}

function tokenizeQuery(raw: unknown): string[] {
  return Array.from(
    new Set(
      String(raw ?? "")
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2),
    ),
  ).slice(0, 16);
}

function scoreEvidenceText(raw: unknown, tokens: string[]): number {
  const text = String(raw ?? "").toLowerCase();
  if (!text || tokens.length === 0) return 0;
  let matches = 0;
  for (const token of tokens) {
    if (text.includes(token)) matches += 1;
  }
  return matches === 0 ? 0 : Number((matches / tokens.length).toFixed(4));
}

async function loadReadableInteraction(args: {
  ctx: any;
  communityId: any;
  objectType: CommunityInteractionEvidenceObjectType;
  objectId: any;
  actor?: ChannelActor;
}): Promise<{
  row: InteractionRow;
  root: InteractionRow;
  channel: CommunityChannelLike;
}> {
  const source = await resolveCommunityInteractionEvidenceSource(args);
  if (!source) {
    throw new Error("community_interaction_evidence_not_found");
  }
  if (!communityInteractionEvidenceSourceIsReadable(source)) {
    throw new Error("community_interaction_evidence_not_readable");
  }
  let channel: CommunityChannelLike;
  try {
    channel = args.actor ? await resolveAuthorizedCommunityChannel({ ctx: args.ctx, communityId: args.communityId,
      channelId: source.root.channelId, actor: args.actor, capability: "canRead" }) : await requireSharedInteractionEvidenceChannel({
      ctx: args.ctx,
      communityId: args.communityId,
      source,
    });
    if (!interactionBelongsToChannel(source.row, channel)) throw new Error("interaction_channel_invalid");
  } catch {
    throw new Error("community_interaction_evidence_channel_not_readable");
  }
  return { row: source.row, root: source.root, channel };
}

const EVIDENCE_SNIPPET_CHARS = 500;

type ChatPresentation = { viewerUserId: any; profiles: Map<string, Promise<Record<string, unknown>>> };

function newChatPresentation(viewerUserId: any): ChatPresentation {
  return { viewerUserId, profiles: new Map() };
}

async function actorProfile(ctx: any, userId: any, presentation: ChatPresentation) {
  const key = normalizeIdValue(userId);
  if (!presentation.profiles.has(key)) {
    presentation.profiles.set(key, (async () => {
      const [user, display] = await Promise.all([ctx.db.get(userId), resolveUserProfileDisplayProjection(ctx, userId)]);
      return { display_name: display.display_name, handle: normalizeOptionalText((user as any)?.handle, 64), avatar_url: display.avatar_url };
    })());
  }
  return await presentation.profiles.get(key)!;
}

// What a chat surface needs beyond evidence: who posted, reactions (and the
// viewer's own), replies and edits. Only computed for channel and thread listings.
async function chatPresentationFields(args: {
  ctx: any; objectType: CommunityInteractionEvidenceObjectType; row: InteractionRow; presentation: ChatPresentation;
}) {
  const row = args.row as any;
  const viewerKey = normalizeIdValue(args.presentation.viewerUserId);
  const mine = viewerKey
    ? await args.ctx.db
        .query("communityInteractionReactions" as any)
        .withIndex(args.objectType === "root" ? "by_root_actor_emoji" : "by_reply_actor_emoji", (q: any) =>
          q.eq(args.objectType === "root" ? "rootId" : "replyId", row._id).eq("actorKey", viewerKey))
        .take(32)
    : [];
  const files = await args.ctx.db
    .query("communityInteractionAttachments" as any)
    .withIndex(args.objectType === "root" ? "by_root" : "by_reply", (q: any) =>
      q.eq(args.objectType === "root" ? "rootId" : "replyId", row._id))
    .take(8);
  // The whole post, so a chat surface never has to guess from the 500-char snippet.
  const blocks = await args.ctx.db
    .query("communityInteractionContentBlocks" as any)
    .withIndex(args.objectType === "root" ? "by_root_order" : "by_reply_order", (q: any) =>
      q.eq(args.objectType === "root" ? "rootId" : "replyId", row._id))
    .take(64);
  const text = blocks
    .filter((block: any) => (args.objectType === "root" ? !block.replyId : true) && typeof block.text === "string")
    .sort((a: any, b: any) => a.blockOrder - b.blockOrder)
    .map((block: any) => block.text.trim())
    .filter(Boolean)
    .join("\n\n") || String(row.contentSummary ?? "");
  return {
    actorProfile: row.actorUserId ? await actorProfile(args.ctx, row.actorUserId, args.presentation) : null,
    fields: {
      reactions: Array.isArray(row.reactionSummary)
        ? row.reactionSummary.map((entry: any) => ({ emoji: String(entry.emoji), count: Number(entry.count) || 0 }))
        : [],
      reacted_by_me: mine.map((reaction: any) => String(reaction.emoji)),
      by_me: Boolean(viewerKey) && normalizeIdValue(row.actorUserId) === viewerKey,
      // Members delete anything posted for them but edit only what they wrote themselves.
      can_edit: Boolean(viewerKey) && normalizeIdValue(row.actorUserId) === viewerKey && row.actorType === "human",
      reply_count: args.objectType === "root" ? Math.max(0, Math.floor(Number(row.replyCount) || 0)) : null,
      // Files are fetched by ref through the caller's own surface (the edge for front ends).
      attachments: files.filter((file: any) => file.status === "uploaded").map((file: any) => ({
        ref: `attachment:${normalizeIdValue(file._id)}`, name: String(file.name ?? "attachment"),
        kind: file.attachmentKind ?? "file", mime: file.mimeType ?? "application/octet-stream", size: Number(file.sizeBytes) || 0,
      })),
      edited_at: row.editedAt ? toIsoString(row.editedAt) : null,
      text,
      snippet_truncated: text.replace(/\s+/g, " ").trim().length > EVIDENCE_SNIPPET_CHARS,
    },
  };
}

async function mapEvidenceSearchItem(args: {
  ctx: any;
  community: CommunityRow;
  objectType: CommunityInteractionEvidenceObjectType;
  row: InteractionRow;
  root: InteractionRow;
  channel: CommunityChannelLike;
  score: number | null;
  source: "recent" | "archive" | "index";
  userIdCache?: Map<string, string | null>;
  presentation?: ChatPresentation;
  // From the search row's full text, around the match.
  snippet?: string | null;
}) {
  const publicActorUserId = args.row.actorUserId
    ? await resolvePublicUserId(args.ctx, args.row.actorUserId, args.userIdCache)
    : null;
  const chat = args.presentation
    ? await chatPresentationFields({ ctx: args.ctx, objectType: args.objectType, row: args.row, presentation: args.presentation })
    : null;
  const ref = buildCommunityInteractionEvidenceRef({
    objectType: args.objectType,
    objectId: normalizeIdValue(args.row._id),
  });
  const actorUserId =
    publicActorUserId ??
    (args.row.actorUserId ? normalizeIdValue(args.row.actorUserId) : null);
  const lineage = deriveCommunityInteractionLineageEnvelope({
    actorType: args.row.actorType,
    actorUserId,
    actorAgentKey: args.row.actorAgentKey ?? null,
    communityId: normalizeIdValue(args.community._id),
    channelId: normalizeIdValue(args.channel._id) || null,
    channelSlug: args.channel.slug,
    objectType: args.objectType,
    objectId: normalizeIdValue(args.row._id),
    rootId: normalizeIdValue(args.root._id),
    targetReplyId: args.row.targetReplyId
      ? normalizeIdValue(args.row.targetReplyId)
      : null,
  });
  const slug = String(args.community.slug ?? "").trim();
  return {
    ref,
    source_type: "interaction" as const,
    source_id: ref,
    object_type: args.objectType,
    object_id: normalizeIdValue(args.row._id),
    root_id: normalizeIdValue(args.root._id),
    interaction_kind: args.root.kind ?? "discussion",
    channel_id: normalizeIdValue(args.channel._id) || null,
    channel_slug: args.channel.slug,
    version: Math.max(1, Math.floor(Number(args.row.updatedAt) || 1)),
    visibility_scope: args.row.visibilityScope,
    title: normalizeOptionalText(args.root.title, 180),
    snippet: args.snippet ?? truncateText(args.row.contentSummary, EVIDENCE_SNIPPET_CHARS),
    actor: {
      // One agent per community: older posts by the retired personal agent read as the community agent.
      type: chat ? presentInteractionActorType(args.row.actorType) : args.row.actorType,
      user_id: actorUserId,
      agent_key: args.row.actorAgentKey ?? null,
      ...(chat?.actorProfile ?? {}),
    },
    ...(chat?.fields ?? {}),
    lineage,
    created_at: toIsoString(args.row.createdAt),
    updated_at: toIsoString(args.row.updatedAt),
    score: args.score,
    retrieval_source: args.source,
    deep_link: slug
      ? `/c/${encodeURIComponent(slug)}/chat${
          args.channel.systemRole === "general"
            ? ""
            : `/${encodeURIComponent(args.channel.slug)}`
        }?evidence=${encodeURIComponent(ref)}`
      : null,
  };
}

async function searchRecentCommunityInteractionEvidence(args: {
  ctx: any;
  userId: any;
  communityId: any;
  query: string;
  limit: number;
  channelId?: any | null;
  channelSlug?: string | null;
  beforeCreatedAt?: number | null;
  actorKind?: ChannelActorKind;
  presentForViewer?: boolean;
}) {
  await requireCommunityChatAccess({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.userId,
  });
  const community = (await args.ctx.db.get(args.communityId)) as CommunityRow | null;
  if (!community) throw new Error("community_not_found");
  const actor = args.actorKind && args.actorKind !== "community_agent" && (args.channelId || args.channelSlug)
    ? await resolveCommunityChannelActor({ ...args, kind: args.actorKind }) : undefined;
  const requestedChannelId = normalizeIdValue(args.channelId);
  const requestedChannelSlug = String(args.channelSlug ?? "").trim();
  let selectedChannel: CommunityChannelLike | null = null;
  if (requestedChannelId || requestedChannelSlug) {
    const scopedActor = actor ?? await resolveCommunityChannelActor({ ...args, kind: "community_agent" });
    selectedChannel = await resolveAuthorizedCommunityChannel({ ctx: args.ctx, communityId: args.communityId,
      channelId: requestedChannelId || null, channelSlug: requestedChannelSlug || null,
      actor: scopedActor, capability: "canRead" });
    if (!actor && selectedChannel.accessMode !== "all_members") throw new Error("community_channel_unavailable");
  }
  const channelsForRead = selectedChannel ? [selectedChannel] : await listSharedCommunityChannels({ ctx: args.ctx, communityId: args.communityId });
  const [roots, replies] = await Promise.all([
    selectedChannel
      ? listChannelReadableRows<InteractionRow>({
          ctx: args.ctx,
          actor,
          tableName: "communityInteractionRoots",
          communityId: args.communityId,
          channel: selectedChannel,
          limit: RECENT_ROOT_SCAN_LIMIT,
          beforeCreatedAt: args.beforeCreatedAt,
        })
      : listSharedChannelReadableRows<InteractionRow>({
          ctx: args.ctx,
          tableName: "communityInteractionRoots",
          communityId: args.communityId,
          limit: RECENT_ROOT_SCAN_LIMIT,
          beforeCreatedAt: args.beforeCreatedAt,
        }),
    selectedChannel
      ? listChannelReadableRows<InteractionRow>({
          ctx: args.ctx,
          actor,
          tableName: "communityInteractionReplies",
          communityId: args.communityId,
          channel: selectedChannel,
          limit: RECENT_REPLY_SCAN_LIMIT,
          beforeCreatedAt: args.beforeCreatedAt,
        })
      : listSharedChannelReadableRows<InteractionRow>({
          ctx: args.ctx,
          tableName: "communityInteractionReplies",
          communityId: args.communityId,
          limit: RECENT_REPLY_SCAN_LIMIT,
          beforeCreatedAt: args.beforeCreatedAt,
        }),
  ]);
  const readableRoots = new Map<string, InteractionRow>();
  const rootChannels = new Map<string, CommunityChannelLike>();
  const admitRoot = (root: InteractionRow) => {
    if (!communityInteractionVisibilityIsEvidenceReadable(root.visibilityScope)) {
      return;
    }
    try {
      const channel = (actor ? requireChannelFromAuthorizedSet : requireSharedChannelForAddressableRow)({
        row: root,
        communityId: args.communityId,
        channels: channelsForRead,
      });
      const rootId = normalizeIdValue(root._id);
      readableRoots.set(rootId, root);
      rootChannels.set(rootId, channel);
    } catch {
      // Invalid channel ownership fails closed.
    }
  };
  roots.forEach(admitRoot);
  const missingRootIds = Array.from(
    new Set(
      replies
        .map((reply) => normalizeIdValue(reply.rootId))
        .filter((rootId) => rootId && !readableRoots.has(rootId)),
    ),
  );
  for (const rootId of missingRootIds) {
    const canonicalRootId = args.ctx.db.normalizeId(
      "communityInteractionRoots" as any,
      rootId,
    );
    const root = canonicalRootId
      ? ((await args.ctx.db.get(canonicalRootId)) as InteractionRow | null)
      : null;
    if (
      root?.status === "live" &&
      normalizeIdValue(root.communityId) === normalizeIdValue(args.communityId) &&
      communityInteractionVisibilityIsEvidenceReadable(root.visibilityScope)
    ) {
      admitRoot(root);
    }
  }
  const tokens = tokenizeQuery(args.query);
  const browsingRecentActivity = tokens.length === 0;
  const rankedCandidates = [
    ...Array.from(readableRoots.values()).map((row) => ({
      objectType: "root" as const,
      row,
      root: row,
      channel: rootChannels.get(normalizeIdValue(row._id))!,
      score: scoreEvidenceText(`${row.title ?? ""} ${row.contentSummary}`, tokens),
    })),
    ...replies
      .filter(
        (row) => {
          const channel = rootChannels.get(normalizeIdValue(row.rootId));
          return Boolean(
            communityInteractionVisibilityIsEvidenceReadable(row.visibilityScope) &&
            channel &&
            interactionBelongsToChannel(row, channel),
          );
        },
      )
      .map((row) => ({
        objectType: "reply" as const,
        row,
        root: readableRoots.get(normalizeIdValue(row.rootId)),
        channel: rootChannels.get(normalizeIdValue(row.rootId)),
        score: scoreEvidenceText(row.contentSummary, tokens),
      }))
      .filter(
        (entry): entry is typeof entry & {
          root: InteractionRow;
          channel: CommunityChannelLike;
        } => Boolean(entry.root && entry.channel),
      ),
  ]
    .filter((entry) => browsingRecentActivity || entry.score > 0)
    .sort((a, b) =>
      browsingRecentActivity
        ? b.row.createdAt - a.row.createdAt
        : b.score - a.score || b.row.createdAt - a.row.createdAt,
    );
  const candidates = rankedCandidates.slice(0, args.limit);
  const userIdCache = new Map<string, string | null>();
  const presentation = args.presentForViewer ? newChatPresentation(args.userId) : undefined;
  return {
    community: {
      id: normalizeIdValue(community._id),
      slug: String(community.slug ?? "").trim() || null,
      name: String(community.name ?? "").trim() || "Community",
    },
    results: await Promise.all(
      candidates.map((entry) =>
        mapEvidenceSearchItem({
          ctx: args.ctx,
          community,
          objectType: entry.objectType,
          row: entry.row,
          root: entry.root,
          channel: entry.channel,
          score: entry.score,
          source: "recent",
          userIdCache,
          presentation,
        }),
      ),
    ),
    truncated: rankedCandidates.length > args.limit,
  };
}

// ---------- full-history search over the search rows ----------

const INDEXED_CANDIDATES_PER_KEY = 60;
// Date ranges and newest-first apply after the index ranks, so they read a
// wider window; truncated says when even that was cut short.
const INDEXED_CANDIDATES_PER_KEY_WIDE = 256;
// A manager may read every private room; search the first ones by position.
const MAX_RESTRICTED_SEARCH_KEYS = 20;
const SNIPPET_RADIUS_CHARS = 220;

// The body line of a search row (line two), around the first matching word.
function snippetAroundMatch(searchText: string, query: string): string | null {
  const body = String(searchText ?? "").split("\n")[1] ?? "";
  if (!body) return null;
  const terms = new Set(searchWords(query).map(stemSearchWord));
  let at = -1;
  for (const match of body.matchAll(/[\p{L}\p{N}]+/gu)) {
    if (terms.has(stemSearchWord(match[0].toLowerCase()))) { at = match.index ?? -1; break; }
  }
  if (at < 0 || body.length <= SNIPPET_RADIUS_CHARS * 2) return truncateText(body, EVIDENCE_SNIPPET_CHARS);
  const start = Math.max(0, at - SNIPPET_RADIUS_CHARS);
  const end = Math.min(body.length, at + SNIPPET_RADIUS_CHARS);
  return `${start > 0 ? "…" : ""}${body.slice(start, end).trim()}${end < body.length ? "…" : ""}`;
}

const PRIVATE_ROOM_SCAN_BOUND = 200;

// The private rooms an actor can read, by position: managers from the room
// list, members from their grants (stale grants to archived rooms are skipped).
// Returns at most one more than the search bound, and whether the scan itself
// hit its bound (then rooms past it may be missing: the search is incomplete).
export async function listReadablePrivateRoomsForSearch(ctx: any, communityId: any, actor: ChannelActor): Promise<{ rooms: CommunityChannelLike[]; scanCapped: boolean }> {
  const candidates: any[] = actor.isManager
    ? await ctx.db.query("communityChannels").withIndex("by_community_access_status_position", (q: any) =>
      q.eq("communityId", communityId).eq("accessMode", "restricted").eq("status", "active")).take(PRIVATE_ROOM_SCAN_BOUND)
    : await Promise.all((await ctx.db.query("communityChannelParticipants").withIndex("by_community_principal_status", (q: any) =>
      q.eq("communityId", communityId).eq("principalKey", actor.principalKey).eq("status", "active")).take(PRIVATE_ROOM_SCAN_BOUND))
      .map((grant: any) => ctx.db.get(grant.channelId)));
  const rooms: CommunityChannelLike[] = [];
  for (const channel of candidates) {
    if (!channel || normalizeIdValue(channel.communityId) !== normalizeIdValue(communityId) || channel.status !== "active" ||
      channel.accessMode !== "restricted") continue;
    if (!(await getCommunityChannelCapabilities({ ctx, channel, actor })).canRead) continue;
    rooms.push(channel);
  }
  rooms.sort((a, b) => a.position - b.position || normalizeIdValue(a._id).localeCompare(normalizeIdValue(b._id)));
  return { rooms: rooms.slice(0, MAX_RESTRICTED_SEARCH_KEYS + 1), scanCapped: candidates.length >= PRIVATE_ROOM_SCAN_BOUND };
}

// Every live post and reply the reader may read, by words, across all history.
// The index only proposes candidates: each is re-read and re-checked against
// its post, thread and channel before it is returned.
async function searchIndexedCommunityInteractionEvidence(args: {
  ctx: any;
  userId: any;
  communityId: any;
  query: string;
  limit: number;
  actorKind?: ChannelActorKind;
  channelId?: any | null;
  channelSlug?: string | null;
  authorUserId?: any | null;
  kind?: "post" | "reply" | null;
  fromMs?: number | null;
  toMs?: number | null;
  sort?: "relevant" | "newest" | null;
}) {
  await requireCommunityChatAccess({ ctx: args.ctx, communityId: args.communityId, userId: args.userId });
  const community = (await args.ctx.db.get(args.communityId)) as CommunityRow | null;
  if (!community) throw new Error("community_not_found");
  // Members search the rooms they can read, private ones included; the
  // community agent answering in public searches shared rooms only.
  const memberActor = args.actorKind && args.actorKind !== "community_agent"
    ? await resolveCommunityChannelActor({ ...args, kind: args.actorKind }) : undefined;
  const requestedChannelId = normalizeIdValue(args.channelId);
  const requestedChannelSlug = String(args.channelSlug ?? "").trim();
  let channels: CommunityChannelLike[];
  if (requestedChannelId || requestedChannelSlug) {
    const scopedActor = memberActor ?? await resolveCommunityChannelActor({ ...args, kind: "community_agent" });
    const selected = await resolveAuthorizedCommunityChannel({ ctx: args.ctx, communityId: args.communityId,
      channelId: requestedChannelId || null, channelSlug: requestedChannelSlug || null, actor: scopedActor, capability: "canRead" });
    if (!memberActor && selected.accessMode !== "all_members") throw new Error("community_channel_unavailable");
    channels = [selected];
  } else {
    channels = await listSharedCommunityChannels({ ctx: args.ctx, communityId: args.communityId });
  }
  // A member's private rooms (a community may have up to 100), read with
  // bounded takes, never paginate, which a query may call only once.
  let moreRestricted = false;
  if (memberActor && !(requestedChannelId || requestedChannelSlug)) {
    const { rooms: privateRooms, scanCapped } = await listReadablePrivateRoomsForSearch(args.ctx, args.communityId, memberActor);
    moreRestricted = privateRooms.length > MAX_RESTRICTED_SEARCH_KEYS || scanCapped;
    channels = [...channels, ...privateRooms];
  }
  const restricted = channels.filter((channel) => channel.accessMode === "restricted");
  const keys = [
    ...(channels.some((channel) => channel.accessMode === "all_members") ? [SHARED_SEARCH_ACCESS_KEY] : []),
    ...restricted.slice(0, MAX_RESTRICTED_SEARCH_KEYS).map((channel) => restrictedSearchAccessKey(channel._id)),
  ];
  const searchQuery = buildCommunitySearchQuery(args.query);
  // One named room narrows the index to that room. General also owns the
  // posts from before channels, which carry none: they get their own query, so
  // other rooms never use up General's window.
  const selected = channels.length === 1 && (requestedChannelId || requestedChannelSlug) ? channels[0] : null;
  const lanes: Array<{ accessKey: string; channelId?: any }> = selected
    ? [
        ...(selected._id ? [{ accessKey: keys[0], channelId: selected._id }] : []),
        ...(selected.systemRole === "general" ? [{ accessKey: SHARED_SEARCH_ACCESS_KEY, channelId: undefined }] : []),
      ]
    : keys.map((accessKey) => ({ accessKey }));
  const window = args.fromMs || args.toMs || args.sort === "newest" ? INDEXED_CANDIDATES_PER_KEY_WIDE : INDEXED_CANDIDATES_PER_KEY;
  const perKey = await Promise.all(lanes.map((lane) =>
    args.ctx.db.query("communitySearchDocs").withSearchIndex("search_text", (q: any) => {
      let search = q.search("searchText", searchQuery).eq("communityId", args.communityId).eq("accessKey", lane.accessKey);
      if (args.authorUserId) search = search.eq("authorUserId", args.authorUserId);
      if ("channelId" in lane) search = search.eq("channelId", lane.channelId);
      if (args.kind) search = search.eq("kind", args.kind);
      return search;
    }).take(window)));
  // Interleave by rank so one busy room can't crowd out the others.
  const docs: any[] = [];
  for (let rank = 0; rank < window; rank += 1) {
    for (const list of perKey) if (list[rank]) docs.push(list[rank]);
  }
  const accepted: Array<{ objectType: "root" | "reply"; row: InteractionRow; root: InteractionRow; channel: CommunityChannelLike; doc: any; rank: number }> = [];
  for (const [rank, doc] of docs.entries()) {
    const objectType = doc.replyId ? "reply" as const : "root" as const;
    const row = (await args.ctx.db.get(doc.replyId ?? doc.rootId)) as InteractionRow | null;
    const root = objectType === "root" ? row : ((await args.ctx.db.get(doc.rootId)) as InteractionRow | null);
    if (!row || !root || row.status !== "live" || root.status !== "live") continue;
    if (!communityInteractionVisibilityIsEvidenceReadable(row.visibilityScope) || !communityInteractionVisibilityIsEvidenceReadable(root.visibilityScope)) continue;
    let channel: CommunityChannelLike;
    try {
      channel = requireChannelFromAuthorizedSet({ row: root, communityId: args.communityId, channels });
    } catch {
      continue;
    }
    if (objectType === "reply" && !interactionBelongsToChannel(row, channel)) continue;
    if (args.fromMs && row.createdAt < args.fromMs) continue;
    if (args.toMs && row.createdAt > args.toMs) continue;
    accepted.push({ objectType, row, root, channel, doc, rank });
  }
  if (args.sort === "newest") accepted.sort((a, b) => b.row.createdAt - a.row.createdAt);
  const page = accepted.slice(0, args.limit);
  const userIdCache = new Map<string, string | null>();
  return {
    community: {
      id: normalizeIdValue(community._id),
      slug: String(community.slug ?? "").trim() || null,
      name: String(community.name ?? "").trim() || "Community",
    },
    results: await Promise.all(page.map((entry) => mapEvidenceSearchItem({
      ctx: args.ctx,
      community,
      objectType: entry.objectType,
      row: entry.row,
      root: entry.root,
      channel: entry.channel,
      // Rank order from the index, newer wins ties; higher is better.
      score: Math.max(1, docs.length - entry.rank),
      source: "index",
      userIdCache,
      snippet: snippetAroundMatch(entry.doc.searchText, args.query),
    }))),
    truncated: accepted.length > args.limit || perKey.some((list) => list.length >= window) ||
      restricted.length > MAX_RESTRICTED_SEARCH_KEYS || moreRestricted,
  };
}

const searchKindValidator = v.optional(v.union(v.literal("post"), v.literal("reply")));
const searchSortValidator = v.optional(v.union(v.literal("relevant"), v.literal("newest")));

export const searchIndexedCommunityInteractionEvidenceInternal = internalQuery({
  args: {
    actorKind: v.optional(channelActorKindValidator),
    userId: v.id("users"),
    communityId: v.id("communities"),
    query: v.string(),
    limit: v.number(),
    channelId: v.optional(v.id("communityChannels")),
    channelSlug: v.optional(v.string()),
    authorUserId: v.optional(v.id("users")),
    kind: searchKindValidator,
    fromMs: v.optional(v.number()),
    toMs: v.optional(v.number()),
    sort: searchSortValidator,
  },
  handler: async (ctx, args) =>
    await searchIndexedCommunityInteractionEvidence({ ctx, ...args, limit: normalizeCommunityEvidenceSearchLimit(args.limit) }),
});

export const searchRecentCommunityInteractionEvidenceInternal = internalQuery({
  args: {
    actorKind: v.optional(channelActorKindValidator),
    userId: v.id("users"),
    communityId: v.id("communities"),
    query: v.string(),
    limit: v.number(),
    channelId: v.optional(v.id("communityChannels")),
    channelSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) =>
    await searchRecentCommunityInteractionEvidence({
      ctx,
      actorKind: args.actorKind,
      userId: args.userId,
      communityId: args.communityId,
      query: args.query,
      limit: normalizeCommunityEvidenceSearchLimit(args.limit),
      channelId: args.channelId,
      channelSlug: args.channelSlug,
    }),
});

export const listRecentCommunityInteractionEvidenceInternal = internalQuery({
  args: {
    actorKind: v.optional(channelActorKindValidator),
    userId: v.id("users"),
    communityId: v.id("communities"),
    cursor: v.optional(v.string()),
    limit: v.number(),
    channelId: v.optional(v.id("communityChannels")),
    channelSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const requestedLimit = Math.floor(Number(args.limit));
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(2, Math.min(50, requestedLimit))
      : 20;
    const beforeCreatedAt = args.cursor ? Number(args.cursor) : null;
    if (
      beforeCreatedAt !== null &&
      (!Number.isSafeInteger(beforeCreatedAt) || beforeCreatedAt <= 0)
    ) {
      throw new Error("community_interaction_list_cursor_invalid");
    }
    const recent = await searchRecentCommunityInteractionEvidence({
      ctx,
      actorKind: args.actorKind,
      userId: args.userId,
      communityId: args.communityId,
      query: "",
      limit: limit + 1,
      channelId: args.channelId,
      channelSlug: args.channelSlug,
      beforeCreatedAt,
      presentForViewer: true,
    });
    const results = recent.results.slice(0, limit);
    const lastCreatedAt = results.length
      ? Date.parse(String(results[results.length - 1]?.created_at ?? ""))
      : Number.NaN;
    const hasMore = recent.results.length > limit || recent.truncated;
    return {
      ...recent,
      results,
      truncated: hasMore,
      next_cursor:
        hasMore && Number.isSafeInteger(lastCreatedAt)
          ? String(lastCreatedAt)
          : null,
    };
  },
});

const THREAD_REPLY_PAGE = 100;

// One post and its replies, oldest first, for a chat thread. Same access as
// reading the post itself.
export const listCommunityInteractionThreadInternal = internalQuery({
  args: {
    actorKind: v.optional(channelActorKindValidator),
    userId: v.id("users"),
    communityId: v.id("communities"),
    channelSlug: v.string(),
    rootId: v.string(),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId: args.userId });
    const afterCreatedAt = args.cursor ? Number(args.cursor) : null;
    if (afterCreatedAt !== null && (!Number.isSafeInteger(afterCreatedAt) || afterCreatedAt <= 0)) {
      throw new Error("community_interaction_thread_cursor_invalid");
    }
    const { row: root, channel } = await loadReadableInteraction({
      ctx,
      actor: args.actorKind && args.actorKind !== "community_agent"
        ? await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId: args.userId, kind: args.actorKind })
        : undefined,
      communityId: args.communityId,
      objectType: "root",
      objectId: args.rootId,
    });
    if (channel.slug !== args.channelSlug) throw new Error("community_interaction_evidence_channel_mismatch");
    const community = (await ctx.db.get(args.communityId)) as CommunityRow | null;
    if (!community) throw new Error("community_not_found");
    const page = (await ctx.db
      .query("communityInteractionReplies" as any)
      .withIndex("by_root_status_createdAt", (q: any) => {
        const scoped = q.eq("rootId", root._id).eq("status", "live");
        return afterCreatedAt === null ? scoped : scoped.gt("createdAt", afterCreatedAt);
      })
      .take(THREAD_REPLY_PAGE + 1)) as InteractionRow[];
    const replies = page.slice(0, THREAD_REPLY_PAGE).filter((reply) =>
      communityInteractionVisibilityIsEvidenceReadable(reply.visibilityScope) && interactionBelongsToChannel(reply, channel));
    const presentation = newChatPresentation(args.userId);
    const userIdCache = new Map<string, string | null>();
    const map = (objectType: "root" | "reply", row: InteractionRow) => mapEvidenceSearchItem({
      ctx, community, objectType, row, root, channel, score: null, source: "recent", userIdCache, presentation,
    });
    const last = page.length > THREAD_REPLY_PAGE ? page[THREAD_REPLY_PAGE - 1] : null;
    return {
      root: afterCreatedAt === null ? await map("root", root) : null,
      replies: await Promise.all(replies.map((reply) => map("reply", reply))),
      next_cursor: last ? String(last.createdAt) : null,
    };
  },
});

export const readCommunityInteractionEvidenceInternal = internalQuery({
  args: {
    actorKind: v.optional(channelActorKindValidator),
    userId: v.id("users"),
    communityId: v.id("communities"),
    ref: v.string(),
    expectedChannelId: v.optional(v.id("communityChannels")),
    expectedChannelSlug: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId: args.userId });
    const parsed = parseCommunityInteractionEvidenceRef(args.ref);
    if (!parsed) throw new Error("community_interaction_evidence_ref_invalid");
    const { row, root, channel } = await loadReadableInteraction({
      ctx,
      actor: args.actorKind && args.actorKind !== "community_agent" && (args.expectedChannelId || args.expectedChannelSlug)
        ? await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId: args.userId, kind: args.actorKind }) : undefined,
      communityId: args.communityId,
      objectType: parsed.objectType,
      objectId: parsed.objectId,
    });
    if (
      args.expectedChannelId &&
      normalizeIdValue(channel._id) !== normalizeIdValue(args.expectedChannelId)
    ) {
      throw new Error("community_interaction_evidence_channel_mismatch");
    }
    if (args.expectedChannelSlug && channel.slug !== args.expectedChannelSlug) {
      throw new Error("community_interaction_evidence_channel_mismatch");
    }
    const community = (await ctx.db.get(args.communityId)) as CommunityRow | null;
    if (!community) throw new Error("community_not_found");
    const [blocks, attachments, embeds] = (await Promise.all([
      ctx.db
        .query("communityInteractionContentBlocks" as any)
        .withIndex(
          parsed.objectType === "root" ? "by_root_order" : "by_reply_order",
          (q: any) =>
            q.eq(parsed.objectType === "root" ? "rootId" : "replyId", row._id),
        )
        .take(64),
      ctx.db
        .query("communityInteractionAttachments" as any)
        .withIndex(parsed.objectType === "root" ? "by_root" : "by_reply", (q: any) =>
          q.eq(parsed.objectType === "root" ? "rootId" : "replyId", row._id),
        )
        .take(32),
      ctx.db
        .query("communityInteractionEmbeds" as any)
        .withIndex(parsed.objectType === "root" ? "by_root" : "by_reply", (q: any) =>
          q.eq(parsed.objectType === "root" ? "rootId" : "replyId", row._id),
        )
        .take(32),
    ])) as [ContentBlockRow[], AttachmentRow[], EmbedRow[]];
    if (
      [...blocks, ...attachments, ...embeds].some(
        (child) =>
          !interactionChildBelongsToEvidence({
            child,
            communityId: args.communityId,
            objectType: parsed.objectType,
            objectId: row._id,
          }),
      )
    ) {
      throw new Error("community_interaction_evidence_not_readable");
    }
    const summary = await mapEvidenceSearchItem({
      ctx,
      community,
      objectType: parsed.objectType,
      row,
      root,
      channel,
      score: null,
      source: "recent",
    });
    return {
      ...summary,
      content_blocks: blocks
        .slice()
        .sort((a, b) => a.blockOrder - b.blockOrder)
        .map((block) => ({
          id: normalizeIdValue(block._id),
          order: block.blockOrder,
          type: block.blockType,
          text: block.text ?? null,
          url: block.url ?? null,
          workspace_ref_kind: block.workspaceRefKind ?? null,
          workspace_ref_id: block.workspaceRefId ?? null,
        })),
      attachments: attachments
        .filter((attachment) => attachment.status !== "deleted")
        .map((attachment) => ({
          id: normalizeIdValue(attachment._id),
          kind: attachment.attachmentKind,
          status: attachment.status,
          name: attachment.name,
          mime_type: attachment.mimeType ?? null,
          size_bytes: attachment.sizeBytes,
          external_url: channel.accessMode === "restricted" ? null : attachment.externalUrl ?? null,
        })),
      embeds: embeds
        .filter(
          (embed) =>
            embed.embedKind === "workspace_ref" &&
            embed.status !== "redacted" &&
            communityInteractionVisibilityIsEvidenceReadable(embed.visibilityScope),
        )
        .map((embed) => ({
          id: normalizeIdValue(embed._id),
          kind: embed.embedKind,
          status: embed.status,
          source_url: embed.sourceUrl ?? null,
          workspace_ref_kind: embed.workspaceRefKind ?? null,
          workspace_ref_id: embed.workspaceRefId ?? null,
          title: embed.title ?? null,
          description: embed.description ?? null,
        })),
      edited_at: typeof row.editedAt === "number" ? toIsoString(row.editedAt) : null,
    };
  },
});

export const searchCommunityInteractionEvidenceInternal = internalAction({
  args: {
    actorKind: v.optional(channelActorKindValidator),
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    query: v.string(),
    limit: v.optional(v.number()),
    channelId: v.optional(v.id("communityChannels")),
    channelSlug: v.optional(v.string()),
    authorUserId: v.optional(v.id("users")),
    kind: searchKindValidator,
    fromMs: v.optional(v.number()),
    toMs: v.optional(v.number()),
    sort: searchSortValidator,
    surface: communityEvidenceSurfaceValidator,
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const userId = await resolveTrustedCommunityEvidenceUserId({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject,
    });
    const query = truncateText(args.query, 240);
    if (!query) throw new Error("community_chat_search_query_required");
    const limit = normalizeCommunityEvidenceSearchLimit(args.limit);
    // Words search the whole history through the search rows; a query with no
    // searchable words browses recent activity as before.
    const indexed = Boolean(buildCommunitySearchQuery(query));
    const filtered = Boolean(args.authorUserId || args.kind || args.fromMs || args.toMs);
    // Filters narrow a word search; browsing recent activity can't honor them.
    if (!indexed && (filtered || args.sort)) throw new Error("community_search_filters_need_words");
    type SearchPage = { community: Record<string, unknown>; results: Array<Record<string, unknown>>; truncated: boolean };
    const recentScan = async () => (await ctx.runQuery(
      (internal as any).communityInteractionEvidence.searchRecentCommunityInteractionEvidenceInternal,
      { actorKind: args.actorKind, userId, communityId: args.communityId, query, limit, channelId: args.channelId, channelSlug: args.channelSlug },
    )) as SearchPage;
    let strategy = indexed ? "full_text_index" : "bounded_lexical";
    let recent = (await ctx.runQuery(
      indexed
        ? (internal as any).communityInteractionEvidence.searchIndexedCommunityInteractionEvidenceInternal
        : (internal as any).communityInteractionEvidence.searchRecentCommunityInteractionEvidenceInternal,
      {
        actorKind: args.actorKind,
        userId,
        communityId: args.communityId,
        query,
        limit,
        channelId: args.channelId,
        channelSlug: args.channelSlug,
        ...(indexed ? {
          ...(args.authorUserId ? { authorUserId: args.authorUserId } : {}),
          ...(args.kind ? { kind: args.kind } : {}),
          ...(args.fromMs ? { fromMs: args.fromMs } : {}),
          ...(args.toMs ? { toMs: args.toMs } : {}),
          ...(args.sort ? { sort: args.sort } : {}),
        } : {}),
      },
    )) as SearchPage;
    // Until a community's search rows are built (just after a release), an
    // unfiltered search that finds nothing falls back to the recent scan.
    // Only when the scan can search the same words: a query it can't tokenize
    // (non-Latin, one letter) would otherwise read as "browse recent".
    if (indexed && !filtered && !args.sort && recent.results.length === 0 && tokenizeQuery(query).length > 0) {
      const indexTruncated = recent.truncated;
      recent = await recentScan();
      // An index search that was cut short stays marked incomplete.
      recent = { ...recent, truncated: recent.truncated || indexTruncated };
      strategy = "bounded_lexical_fallback";
    }
    const results = recent.results;
    const resultRefs = results.map((result) => String(result.ref ?? "")).filter(Boolean);
    const retrievalId: any = await ctx.runMutation(
      (internal as any).communityEvidenceAudit.recordCommunityEvidenceRetrievalInternal,
      {
        communityId: args.communityId,
        userId,
        surface: args.surface,
        capability: "community_chat_search",
        resultRefs,
      },
    );
    return {
      ok: true,
      community: recent.community,
      query,
      results,
      truncated: recent.truncated,
      retrieval_id: normalizeIdValue(retrievalId),
      diagnostics: {
        version: 2,
        source: "community_interactions",
        strategy,
      },
    };
  },
});

export const readCommunityInteractionEvidenceForToolInternal = internalAction({
  args: {
    actorKind: v.optional(channelActorKindValidator),
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    ref: v.string(),
    expectedChannelId: v.optional(v.id("communityChannels")),
    expectedChannelSlug: v.optional(v.string()),
    surface: communityEvidenceSurfaceValidator,
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const userId = await resolveTrustedCommunityEvidenceUserId({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject,
    });
    const ref = truncateText(args.ref, 512);
    if (!parseCommunityInteractionEvidenceRef(ref)) {
      throw new Error("community_interaction_evidence_ref_invalid");
    }
    const evidence: any = await ctx.runQuery(
      (internal as any).communityInteractionEvidence.readCommunityInteractionEvidenceInternal,
      {
        actorKind: args.actorKind,
        userId,
        communityId: args.communityId,
        ref,
        expectedChannelId: args.expectedChannelId,
        expectedChannelSlug: args.expectedChannelSlug,
      },
    );
    const retrievalId: any = await ctx.runMutation(
      (internal as any).communityEvidenceAudit.recordCommunityEvidenceRetrievalInternal,
      {
        communityId: args.communityId,
        userId,
        surface: args.surface,
        capability: "community_chat_read",
        resultRefs: [ref],
      },
    );
    return {
      ok: true,
      evidence,
      retrieval_id: normalizeIdValue(retrievalId),
    };
  },
});

function sourceTraceActor(row: InteractionRow): {
  actorType: "member" | "agent" | "system";
  actorUserId?: any;
  actorAgentKey?: string;
} {
  if (row.actorType === "human" && row.actorUserId) {
    return { actorType: "member", actorUserId: row.actorUserId };
  }
  if (presentInteractionActorType(row.actorType) === "community_agent") {
    return {
      actorType: "agent",
      ...(row.actorUserId ? { actorUserId: row.actorUserId } : null),
      actorAgentKey: row.actorAgentKey ?? row.actorType,
    };
  }
  return {
    actorType: "system",
    actorAgentKey: row.actorAgentKey ?? "community_interaction_evidence_sync",
  };
}

async function removeInteractionSourceTrace(args: {
  ctx: any;
  communityId: any;
  ref: string;
  nowMs: number;
}) {
  const directTrace = await args.ctx.db
    .query("communitySourceTraces" as any)
    .withIndex("by_community_source", (q: any) =>
      q.eq("communityId", args.communityId).eq("sourceType", "interaction").eq("sourceId", args.ref),
    )
    .first();
  const traceId = directTrace?._id;
  if (traceId) {
    await args.ctx.db.patch(traceId as any, {
      sourceVisibility: "redacted",
      visibilityScope: "admin",
      compilerState: "excluded_by_visibility",
      compilerPendingSince: undefined,
      compilerContinuationReady: undefined,
      compilerLastHandledAt: args.nowMs,
      compilerLastDigestId: undefined,
      compilerDecision: undefined,
      updatedAt: args.nowMs,
    });
  }
}

async function upsertInteractionSourceTrace(args: {
  ctx: any;
  communityId: any;
  source: ResolvedCommunityInteractionEvidence;
  channel: CommunityChannelLike;
  nowMs: number;
}) {
  const { row, root, objectType } = args.source;
  const ref = buildCommunityInteractionEvidenceRef({
    objectType,
    objectId: normalizeIdValue(row._id),
  });
  const actor = sourceTraceActor(row);
  const trace = await recordTrustedCommunitySourceTraceCore({
    ctx: args.ctx,
    communityId: args.communityId,
    channelId: args.channel._id,
    sourceType: "interaction",
    sourceId: ref,
    title: objectType === "root" ? row.title : root.title,
    summary: row.contentSummary,
    visibilityScope: row.visibilityScope,
    sourceVisibility: row.visibilityScope,
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorAgentKey: actor.actorAgentKey,
    compilerGroupKey: `interaction_episode:${normalizeIdValue(root._id)}`,
    nowMs: args.nowMs,
  });
  return { ref, sourceTraceId: (trace as any).id };
}

export const syncCommunityInteractionEvidenceInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    objectType: evidenceObjectTypeValidator,
    objectId: v.string(),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const ref = buildCommunityInteractionEvidenceRef({
      objectType: args.objectType,
      objectId: args.objectId,
    });
    const source = await resolveCommunityInteractionEvidenceSource({
      ctx,
      communityId: args.communityId,
      objectType: args.objectType,
      objectId: args.objectId,
    });
    let channel: CommunityChannelLike | null = null;
    if (source && communityInteractionEvidenceSourceIsReadable(source)) {
      try {
        channel = await requireSharedInteractionEvidenceChannel({
          ctx,
          communityId: args.communityId,
          source,
        });
      } catch {
        channel = null;
      }
    }
    if (!source || !communityInteractionEvidenceSourceIsReadable(source) || !channel) {
      await removeInteractionSourceTrace({
        ctx,
        communityId: args.communityId,
        ref,
        nowMs,
      });
      if (args.objectType === "root") {
        await ctx.scheduler.runAfter(
          0,
          (internal as any).communityInteractionEvidence.redactCommunityInteractionEvidenceChildrenInternal,
          {
            communityId: args.communityId,
            rootId: args.objectId,
          },
        );
      }
      return { ok: true, traced: false, ref };
    }
    const traced = await upsertInteractionSourceTrace({
      ctx,
      communityId: args.communityId,
      source,
      channel,
      nowMs,
    });
    return {
      ok: true,
      traced: true,
      ref,
      source_trace_id: traced.sourceTraceId,
    };
  },
});

export const redactCommunityInteractionEvidenceChildrenInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    rootId: v.string(),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const rootId = ctx.db.normalizeId("communityInteractionRoots", args.rootId);
    if (!rootId) throw new Error("community_interaction_evidence_root_not_found");
    const root = await ctx.db.get(rootId);
    if (
      root &&
      normalizeIdValue((root as any).communityId) !== normalizeIdValue(args.communityId)
    ) {
      throw new Error("community_interaction_evidence_root_not_found");
    }
    const batch = await ctx.db
      .query("communityInteractionReplies" as any)
      .withIndex("by_root_createdAt", (q: any) => q.eq("rootId", rootId))
      .paginate({
        numItems: 50,
        cursor: args.cursor ?? null,
      });
    let redacted = 0;
    for (const reply of batch.page) {
      const ref = buildCommunityInteractionEvidenceRef({
        objectType: "reply",
        objectId: normalizeIdValue(reply._id),
      });
      await removeInteractionSourceTrace({
        ctx,
        communityId: args.communityId,
        ref,
        nowMs: Date.now(),
      });
      redacted += 1;
    }
    if (!batch.isDone) {
      await ctx.scheduler.runAfter(
        0,
        (internal as any).communityInteractionEvidence.redactCommunityInteractionEvidenceChildrenInternal,
        {
          communityId: args.communityId,
          rootId: normalizeIdValue(rootId),
          cursor: batch.continueCursor,
        },
      );
    }
    return {
      ok: true,
      redacted,
      complete: batch.isDone,
      continue_cursor: batch.continueCursor,
    };
  },
});

export const listCommunityInteractionEvidenceBackfillBatchInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
    objectType: evidenceObjectTypeValidator,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query(
        args.objectType === "root"
          ? ("communityInteractionRoots" as any)
          : ("communityInteractionReplies" as any),
      )
      .withIndex("by_community_createdAt", (q: any) =>
        q.eq("communityId", args.communityId),
      )
      .order("asc")
      .paginate(args.paginationOpts);
  },
});

export const backfillCommunityInteractionEvidenceInternal = internalAction({
  args: {
    communityId: v.id("communities"),
    objectType: evidenceObjectTypeValidator,
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const batch: any = await ctx.runQuery(
      (internal as any).communityInteractionEvidence.listCommunityInteractionEvidenceBackfillBatchInternal,
      {
        communityId: args.communityId,
        objectType: args.objectType,
        paginationOpts: {
          numItems: 50,
          cursor: args.cursor ?? null,
        },
      },
    );
    let synced = 0;
    for (const row of Array.isArray(batch?.page) ? batch.page : []) {
      await ctx.runMutation(
        (internal as any).communityInteractionEvidence.syncCommunityInteractionEvidenceInternal,
        {
          communityId: args.communityId,
          objectType: args.objectType,
          objectId: normalizeIdValue(row._id),
        },
      );
      synced += 1;
    }
    if (!batch?.isDone && batch?.continueCursor) {
      await ctx.scheduler.runAfter(
        0,
        (internal as any).communityInteractionEvidence.backfillCommunityInteractionEvidenceInternal,
        {
          communityId: args.communityId,
          objectType: args.objectType,
          cursor: batch.continueCursor,
        },
      );
    }
    return {
      ok: true,
      object_type: args.objectType,
      synced,
      complete: Boolean(batch?.isDone),
      continue_cursor: batch?.continueCursor ?? null,
    };
  },
});

// Every write to a post or reply calls this. The search row is rebuilt in the
// same transaction (never stale); the compiler's evidence follows on a job.
export async function scheduleCommunityInteractionEvidenceSync(args: {
  ctx: { db: any; scheduler: { runAfter: (...args: any[]) => Promise<unknown> } };
  communityId: any;
  objectType: CommunityInteractionEvidenceObjectType;
  objectId: any;
}): Promise<void> {
  await syncCommunitySearchDoc(args.ctx, {
    communityId: args.communityId,
    objectType: args.objectType,
    objectId: args.objectId,
  });
  await args.ctx.scheduler.runAfter(
    0,
    (internal as any).communityInteractionEvidence.syncCommunityInteractionEvidenceInternal,
    {
      communityId: args.communityId,
      objectType: args.objectType,
      objectId: normalizeIdValue(args.objectId),
    },
  );
}

export type { CommunityEvidenceSurface };
