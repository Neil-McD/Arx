/* Visitor-mode projection builder: maps the PUBLIC data plane (pinned host
   note + host-featured messages + faces) onto the REAL interaction-feed
   bundle shapes, so /c/:slug renders through the same components a member
   sees. Pure function of its inputs — no queries, no state. */
import type {
  CommunityInteractionContentBlock,
  CommunityInteractionRootBundle,
} from "../../../../shared/cloudCommunityInteractionsGateway";
import type { UserProfile } from "../../../../shared/communityTypes";

export const VISITOR_HOST_USER_ID = "visitor-host";

export type VisitorFeaturedMessageLike = {
  id: string;
  body: string;
  created_at?: string | null;
  sender?: {
    display_name?: string | null;
    avatar_url?: string | null;
    avatar_focus_x?: number | null;
    avatar_focus_y?: number | null;
    avatar_zoom?: number | null;
  } | null;
  reactions?: Array<{ emoji: string; count: number }> | null;
};

export type VisitorHostLike = {
  display_name: string | null;
  avatar_url: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
};

type BuildVisitorProjectionArgs = {
  communityName: string;
  aboutText: string;
  host: VisitorHostLike | null;
  featuredMessages: VisitorFeaturedMessageLike[] | null;
  communityCreatedAt: string | null;
};

function markdownBlock(rootId: string, text: string): CommunityInteractionContentBlock {
  return {
    id: `${rootId}-block-0`,
    block_order: 0,
    block_type: "markdown_text",
    text,
    url: null,
    attachment_id: null,
    embed_id: null,
    workspace_ref_kind: null,
    workspace_ref_id: null,
    mention_kind: null,
    mentioned_user_id: null,
    mentioned_agent_key: null,
    mentioned_role_key: null,
  };
}

function visitorRoot(args: {
  id: string;
  kind: "announcement" | "discussion";
  actorUserId: string;
  body: string;
  createdAt: string;
  pinnedAt: string | null;
  reactions: Array<{ emoji: string; count: number }>;
}): CommunityInteractionRootBundle {
  return {
    deduped: false,
    root: {
      id: args.id,
      community_id: "visitor",
      actor_type: "human",
      actor_user_id: args.actorUserId,
      actor_agent_key: null,
      kind: args.kind,
      status: "live",
      visibility_scope: "public",
      title: null,
      content_summary: args.body,
      reply_count: 0,
      reaction_summary: args.reactions.map((entry) => ({ emoji: entry.emoji, count: entry.count })),
      viewer_emojis: [],
      idempotency_key: args.id,
      last_reply_at: null,
      last_reply_actor_user_id: null,
      pinned_at: args.pinnedAt,
      locked_at: null,
      legacy_thread_id: null,
      legacy_message_id: null,
      created_at: args.createdAt,
      updated_at: args.createdAt,
      edited_at: null,
    },
    content_blocks: [markdownBlock(args.id, args.body)],
    embeds: [],
    mentions: [],
    attachments: [],
  };
}

export function buildWebCommunityVisitorProjection(args: BuildVisitorProjectionArgs): {
  roots: CommunityInteractionRootBundle[];
  profilesByUserId: Record<string, UserProfile>;
} {
  const roots: CommunityInteractionRootBundle[] = [];
  const profilesByUserId: Record<string, UserProfile> = {};

  const hostName = args.host?.display_name?.trim() || args.communityName;
  profilesByUserId[VISITOR_HOST_USER_ID] = {
    user_id: VISITOR_HOST_USER_ID,
    display_name: hostName,
    avatar_url: args.host?.avatar_url ?? null,
    avatar_focus_x: args.host?.avatar_focus_x ?? null,
    avatar_focus_y: args.host?.avatar_focus_y ?? null,
    avatar_zoom: args.host?.avatar_zoom ?? null,
  };

  const featured = args.featuredMessages ?? [];
  const oldestFeaturedAt = featured
    .map((entry) => entry.created_at)
    .filter((value): value is string => Boolean(value))
    .sort()[0] ?? null;

  const pinnedNoteAt = args.communityCreatedAt ?? oldestFeaturedAt ?? "";
  const aboutText = args.aboutText.trim();
  if (aboutText && pinnedNoteAt) {
    roots.push(
      visitorRoot({
        id: "visitor-pinned-note",
        kind: "announcement",
        actorUserId: VISITOR_HOST_USER_ID,
        body: aboutText,
        createdAt: pinnedNoteAt,
        pinnedAt: pinnedNoteAt,
        reactions: [],
      }),
    );
  }

  featured.forEach((entry, index) => {
    const senderId = `visitor-sender-${index}`;
    profilesByUserId[senderId] = {
      user_id: senderId,
      display_name: entry.sender?.display_name?.trim() || "Member",
      avatar_url: entry.sender?.avatar_url ?? null,
      avatar_focus_x: entry.sender?.avatar_focus_x ?? null,
      avatar_focus_y: entry.sender?.avatar_focus_y ?? null,
      avatar_zoom: entry.sender?.avatar_zoom ?? null,
    };
    roots.push(
      visitorRoot({
        id: `visitor-featured-${entry.id}`,
        kind: "discussion",
        actorUserId: senderId,
        body: entry.body,
        createdAt: entry.created_at ?? "",
        pinnedAt: null,
        reactions: entry.reactions ?? [],
      }),
    );
  });

  return { roots, profilesByUserId };
}
