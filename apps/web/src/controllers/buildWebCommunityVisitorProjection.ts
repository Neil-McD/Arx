/* Visitor-mode projection builder: maps the public host note and face onto the
   real interaction-feed bundle shape, so /c/:slug renders through the same
   components a member sees. Pure function of its inputs — no queries, no state. */
import type {
  CommunityInteractionContentBlock,
  CommunityInteractionRootBundle,
} from "../../../../shared/cloudCommunityInteractionsGateway";
import type { UserProfile } from "../../../../shared/communityTypes";

export const VISITOR_HOST_USER_ID = "visitor-host";

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
  actorUserId: string;
  body: string;
  createdAt: string;
  pinnedAt: string | null;
}): CommunityInteractionRootBundle {
  return {
    deduped: false,
    root: {
      id: args.id,
      community_id: "visitor",
      actor_type: "human",
      actor_user_id: args.actorUserId,
      actor_agent_key: null,
      kind: "announcement",
      status: "live",
      visibility_scope: "public",
      title: null,
      content_summary: args.body,
      reply_count: 0,
      reaction_summary: [],
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

  const pinnedNoteAt = args.communityCreatedAt ?? "";
  const aboutText = args.aboutText.trim();
  if (aboutText && pinnedNoteAt) {
    roots.push(
      visitorRoot({
        id: "visitor-pinned-note",
        actorUserId: VISITOR_HOST_USER_ID,
        body: aboutText,
        createdAt: pinnedNoteAt,
        pinnedAt: pinnedNoteAt,
      }),
    );
  }

  return { roots, profilesByUserId };
}
