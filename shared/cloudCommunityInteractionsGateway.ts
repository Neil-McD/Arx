import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

type CloudCommunityInteractionsGatewayParams<SessionT> = {
  session: SessionT;
};

export type CommunityInteractionReactionSummary = {
  emoji: string;
  count: number;
};

export type CommunityInteractionContentBlock = {
  id: string;
  block_order: number;
  block_type: "markdown_text" | "link" | "workspace_ref" | "mention" | string;
  text: string | null;
  url: string | null;
  attachment_id: string | null;
  embed_id: string | null;
  workspace_ref_kind: string | null;
  workspace_ref_id: string | null;
  mention_kind: string | null;
  mentioned_user_id: string | null;
  mentioned_agent_key: string | null;
  mentioned_role_key: string | null;
};

export type CommunityInteractionEmbed = {
  id: string;
  embed_kind: "link" | "workspace_ref" | string;
  status: "pending" | "ready" | "failed" | "redacted" | string;
  visibility_scope: string;
  source_url: string | null;
  normalized_source_url: string | null;
  workspace_ref_kind: string | null;
  workspace_ref_id: string | null;
  provider: string | null;
  title: string | null;
  description: string | null;
  image_url: string | null;
  video_url: string | null;
  fetched_at: string | null;
  error: string | null;
};

export type CommunityInteractionMention = {
  id: string;
  mention_kind: string;
  mentioned_user_id: string | null;
  mentioned_agent_key: string | null;
  mentioned_role_key: string | null;
  notify_state: string;
};

export type CommunityInteractionRootRecord = {
  id: string;
  community_id: string;
  actor_type: "human" | "personal_agent" | "community_agent" | "system" | string;
  actor_user_id: string | null;
  actor_agent_key: string | null;
  kind: "discussion" | "announcement" | "question" | "resource_share" | "agent_signal" | string;
  status: string;
  visibility_scope: string;
  title: string | null;
  content_summary: string;
  reply_count: number;
  reaction_summary: CommunityInteractionReactionSummary[];
  viewer_emojis: string[];
  idempotency_key: string;
  last_reply_at: string | null;
  last_reply_actor_user_id: string | null;
  pinned_at: string | null;
  locked_at: string | null;
  legacy_thread_id: string | null;
  legacy_message_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CommunityInteractionReplyRecord = {
  id: string;
  community_id: string;
  root_id: string;
  seq: number;
  actor_type: "human" | "personal_agent" | "community_agent" | "system" | string;
  actor_user_id: string | null;
  actor_agent_key: string | null;
  target_reply_id: string | null;
  status: string;
  visibility_scope: string;
  content_summary: string;
  reaction_summary: CommunityInteractionReactionSummary[];
  viewer_emojis: string[];
  idempotency_key: string;
  legacy_thread_id: string | null;
  legacy_message_id: string | null;
  legacy_target_message_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CommunityInteractionRootBundle = {
  deduped: boolean;
  root: CommunityInteractionRootRecord;
  content_blocks: CommunityInteractionContentBlock[];
  embeds: CommunityInteractionEmbed[];
  mentions: CommunityInteractionMention[];
};

export type CommunityInteractionReplyBundle = {
  deduped: boolean;
  reply: CommunityInteractionReplyRecord;
  content_blocks: CommunityInteractionContentBlock[];
  embeds: CommunityInteractionEmbed[];
  mentions: CommunityInteractionMention[];
};

function coerceObjectRows<TRow>(payload: unknown, key: string): TRow[] {
  if (Array.isArray(payload)) return payload as TRow[];
  if (!payload || typeof payload !== "object") return [];
  const value = (payload as Record<string, unknown>)[key];
  return Array.isArray(value) ? (value as TRow[]) : [];
}

export async function listCloudCommunityInteractionRoots<SessionT>(
  params: CloudCommunityInteractionsGatewayParams<SessionT> & {
    communityId: string;
    beforeCreatedAt?: number | null;
    limit?: number;
    kind?: string | null;
  },
): Promise<CommunityInteractionRootBundle[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:listCommunityInteractionRoots" as any, {
    authSubject,
    communityId: params.communityId,
    beforeCreatedAt: params.beforeCreatedAt ?? null,
    limit: params.limit ?? 40,
    kind: params.kind ?? null,
  });
  return coerceObjectRows<CommunityInteractionRootBundle>(payload, "roots");
}

export async function listCloudCommunityInteractionReplies<SessionT>(
  params: CloudCommunityInteractionsGatewayParams<SessionT> & {
    rootId: string;
    beforeSeq?: number | null;
    limit?: number;
  },
): Promise<CommunityInteractionReplyBundle[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:listCommunityInteractionReplies" as any, {
    authSubject,
    rootId: params.rootId,
    beforeSeq: params.beforeSeq ?? null,
    limit: params.limit ?? 80,
  });
  return coerceObjectRows<CommunityInteractionReplyBundle>(payload, "replies");
}

export async function createCloudCommunityInteractionComposerMessageRows<SessionT, TRow = unknown>(
  params: CloudCommunityInteractionsGatewayParams<SessionT> & {
    communityId: string;
    idempotencyKey: string;
    text: string;
    rootId?: string | null;
    replyToMessageId?: string | null;
  },
): Promise<TRow[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("community:createCommunityInteractionComposerMessage" as any, {
    authSubject,
    communityId: params.communityId,
    idempotencyKey: params.idempotencyKey,
    text: params.text,
    rootId: params.rootId ?? null,
    replyToMessageId: params.replyToMessageId ?? null,
  });
  return coerceObjectRows<TRow>(payload, "rows");
}

export async function toggleCloudCommunityInteractionReaction<SessionT>(
  params: CloudCommunityInteractionsGatewayParams<SessionT> & {
    targetType: "root" | "reply";
    targetId: string;
    emoji: string;
  },
): Promise<{ reacted: boolean; reaction_summary: CommunityInteractionReactionSummary[] }> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("community:toggleCommunityInteractionReaction" as any, {
    authSubject,
    targetType: params.targetType,
    targetId: params.targetId,
    emoji: params.emoji,
  });
  const result = (payload ?? {}) as {
    reacted?: boolean;
    reaction_summary?: CommunityInteractionReactionSummary[];
  };
  return {
    reacted: Boolean(result.reacted),
    reaction_summary: Array.isArray(result.reaction_summary) ? result.reaction_summary : [],
  };
}
