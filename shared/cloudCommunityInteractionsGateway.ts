import { api } from "../convex/_generated/api";
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { CloudCommunityChatLiveClient } from "./cloudCommunityChatGateway";

type CloudCommunityInteractionsGatewayParams<SessionT> = {
  session: SessionT;
};

export type CommunityInteractionReactionSummary = {
  emoji: string;
  count: number;
};

export type CommunityInteractionAttachment = {
  id: string;
  name: string;
  type: "image" | "file" | string;
  mime: string | null;
  size: number;
  url?: string | null;
  storage_id?: string | null;
  data_url?: string | null;
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
  status: "pending" | "ready" | "failed" | "unavailable" | "redacted" | string;
  visibility_scope: string;
  source_url: string | null;
  normalized_source_url: string | null;
  workspace_ref_kind: string | null;
  workspace_ref_id: string | null;
  preview_kind: "video" | "social_post" | "link" | string | null;
  author_name: string | null;
  author_handle: string | null;
  author_avatar_url: string | null;
  provider: string | null;
  provider_post_id: string | null;
  published_at: string | null;
  post_context: "post" | "reply" | "quote" | string | null;
  title: string | null;
  description: string | null;
  image_url: string | null;
  image_alt: string | null;
  video_url: string | null;
  resolver_version: number | null;
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
  channel_id: string | null;
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
  edited_at: string | null;
};

export type CommunityInteractionReplyRecord = {
  id: string;
  community_id: string;
  channel_id: string | null;
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
  edited_at: string | null;
};

export type CommunityInteractionPendingStatus = "sending" | "failed";

export type CommunityInteractionRootBundle = {
  deduped: boolean;
  root: CommunityInteractionRootRecord;
  content_blocks: CommunityInteractionContentBlock[];
  embeds: CommunityInteractionEmbed[];
  mentions: CommunityInteractionMention[];
  attachments: CommunityInteractionAttachment[];
  /** Client-only: present on optimistic (not-yet-confirmed) messages. */
  pending?: CommunityInteractionPendingStatus;
};

export type CommunityInteractionReplyBundle = {
  deduped: boolean;
  reply: CommunityInteractionReplyRecord;
  content_blocks: CommunityInteractionContentBlock[];
  embeds: CommunityInteractionEmbed[];
  mentions: CommunityInteractionMention[];
  attachments: CommunityInteractionAttachment[];
  /** Client-only: present on optimistic (not-yet-confirmed) messages. */
  pending?: CommunityInteractionPendingStatus;
};

export type CommunityAgentDockEvent = {
  id: string;
  seq: number;
  kind: "reasoning" | "assistant" | "tool_call" | "tool_result" | "final" | "error" | string;
  tool_name: string | null;
  status: string | null;
  error_code: string | null;
  content: string;
  created_at: string;
};

export type CommunityAgentDockMessage = {
  id: string;
  actor_type: "human" | "community_agent" | string;
  actor_agent_key: string | null;
  text: string;
  created_at: string;
};

export type CommunityAgentDockRequest = {
  id: string;
  status: "queued" | "skipped" | "running" | "responded" | "error" | string;
  intake_reason: string;
  attempt: number;
  response_reply_id: string | null;
  public_issue: { code: string; message: string } | null;
  created_at: string;
  updated_at: string;
};

export type CommunityAgentDockTranscript = {
  root_id: string | null;
  messages: CommunityAgentDockMessage[];
};

export type CommunityAgentDockTurn = {
  request: CommunityAgentDockRequest | null;
  events: CommunityAgentDockEvent[];
};

function coerceObjectRows<TRow>(payload: unknown, key: string): TRow[] {
  if (Array.isArray(payload)) return payload as TRow[];
  if (!payload || typeof payload !== "object") return [];
  const value = (payload as Record<string, unknown>)[key];
  return Array.isArray(value) ? (value as TRow[]) : [];
}

function coerceNullableNumber(payload: unknown, key: string): number | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export type CommunityInteractionRootPage = {
  roots: CommunityInteractionRootBundle[];
  nextBeforeCreatedAt: number | null;
};

export async function listCloudCommunityInteractionRoots<SessionT>(
  params: CloudCommunityInteractionsGatewayParams<SessionT> & {
    communityId: string;
    channelId?: string | null;
    beforeCreatedAt?: number | null;
    limit?: number;
    kind?: string | null;
  },
): Promise<CommunityInteractionRootBundle[]> {
  const page = await listCloudCommunityInteractionRootsPage(params);
  return page.roots;
}

export async function listCloudCommunityInteractionRootsPage<SessionT>(
  params: CloudCommunityInteractionsGatewayParams<SessionT> & {
    communityId: string;
    channelId?: string | null;
    beforeCreatedAt?: number | null;
    limit?: number;
    kind?: string | null;
  },
): Promise<CommunityInteractionRootPage> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("communityInteractions:listCommunityInteractionRoots" as any, {
    authSubject,
    communityId: params.communityId,
    ...(params.channelId ? { channelId: params.channelId } : null),
    beforeCreatedAt: params.beforeCreatedAt ?? null,
    limit: params.limit ?? 40,
    kind: params.kind ?? null,
  });
  return {
    roots: coerceObjectRows<CommunityInteractionRootBundle>(payload, "roots"),
    nextBeforeCreatedAt: coerceNullableNumber(payload, "next_before_created_at"),
  };
}

export async function listCloudCommunityInteractionReplies<SessionT>(
  params: CloudCommunityInteractionsGatewayParams<SessionT> & {
    rootId: string;
    beforeSeq?: number | null;
    limit?: number;
  },
): Promise<CommunityInteractionReplyBundle[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("communityInteractions:listCommunityInteractionReplies" as any, {
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
    channelId?: string | null;
    idempotencyKey: string;
    text: string;
    rootId?: string | null;
    replyToMessageId?: string | null;
    mentions?: { userId?: string; agentKey?: string; roleKey?: string }[];
    attachments?: unknown[];
  },
): Promise<TRow[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation(
    api.communityInteractions.createCommunityInteractionComposerMessage,
    {
      authSubject,
      communityId: params.communityId,
      ...(params.channelId ? { channelId: params.channelId } : null),
      idempotencyKey: params.idempotencyKey,
      text: params.text,
      rootId: params.rootId ?? null,
      replyToMessageId: params.replyToMessageId ?? null,
      ...(params.mentions && params.mentions.length ? { mentions: params.mentions } : null),
      ...(params.attachments && params.attachments.length ? { attachments: params.attachments } : null),
    } as any,
  );
  return coerceObjectRows<TRow>(payload, "rows");
}

export async function sendCloudCommunityAgentDockMessage<SessionT>(
  params: CloudCommunityInteractionsGatewayParams<SessionT> & {
    communityId: string;
    idempotencyKey: string;
    text: string;
  },
): Promise<{
  root_id: string;
  reply_id: string;
  serve_request_id: string | null;
  serve_status: string;
  intake_reason: string;
  deduped: boolean;
}> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.mutation("communityInteractions:sendCommunityAgentDockMessage" as any, {
    authSubject,
    communityId: params.communityId,
    idempotencyKey: params.idempotencyKey,
    text: params.text,
  }) as any;
}

export async function toggleCloudCommunityInteractionReaction<SessionT>(
  params: CloudCommunityInteractionsGatewayParams<SessionT> & {
    targetType: "root" | "reply";
    targetId: string;
    emoji: string;
  },
): Promise<{ reacted: boolean; reaction_summary: CommunityInteractionReactionSummary[] }> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("communityInteractions:toggleCommunityInteractionReaction" as any, {
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

export async function editCloudCommunityInteractionMessage<SessionT>(
  params: CloudCommunityInteractionsGatewayParams<SessionT> & {
    targetType: "root" | "reply";
    targetId: string;
    text: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("communityInteractions:editCommunityInteractionMessage" as any, {
    authSubject,
    targetType: params.targetType,
    targetId: params.targetId,
    text: params.text,
  });
}

export async function deleteCloudCommunityInteractionMessage<SessionT>(
  params: CloudCommunityInteractionsGatewayParams<SessionT> & {
    targetType: "root" | "reply";
    targetId: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("communityInteractions:deleteCommunityInteractionMessage" as any, {
    authSubject,
    targetType: params.targetType,
    targetId: params.targetId,
  });
}

export function subscribeCloudCommunityInteractionRoots(params: {
  liveClient: CloudCommunityChatLiveClient;
  communityId: string;
  channelId?: string | null;
  limit?: number;
  kind?: string | null;
  onUpdate: (roots: CommunityInteractionRootBundle[]) => void;
  onError?: (error: unknown) => void;
}): () => void {
  const watch = params.liveClient.client.watchQuery(
    (api as any).communityInteractions.listCommunityInteractionRoots,
    {
      authSubject: params.liveClient.authSubject,
      communityId: params.communityId as any,
      ...(params.channelId ? { channelId: params.channelId as any } : null),
      beforeCreatedAt: null,
      limit: params.limit ?? 40,
      kind: params.kind ?? null,
    } as any,
  );
  const publish = () => {
    try {
      const result = watch.localQueryResult() as { roots?: CommunityInteractionRootBundle[] } | undefined;
      if (typeof result === "undefined") return;
      params.onUpdate(Array.isArray(result?.roots) ? result.roots : []);
    } catch (error) {
      params.onError?.(error);
    }
  };
  publish();
  return watch.onUpdate(publish);
}

export function subscribeCloudCommunityInteractionReplies(params: {
  liveClient: CloudCommunityChatLiveClient;
  rootId: string;
  limit?: number;
  onUpdate: (replies: CommunityInteractionReplyBundle[]) => void;
  onError?: (error: unknown) => void;
}): () => void {
  const watch = params.liveClient.client.watchQuery(
    (api as any).communityInteractions.listCommunityInteractionReplies,
    {
      authSubject: params.liveClient.authSubject,
      rootId: params.rootId as any,
      beforeSeq: null,
      limit: params.limit ?? 80,
    } as any,
  );
  const publish = () => {
    try {
      const result = watch.localQueryResult() as { replies?: CommunityInteractionReplyBundle[] } | undefined;
      if (typeof result === "undefined") return;
      params.onUpdate(Array.isArray(result?.replies) ? result.replies : []);
    } catch (error) {
      params.onError?.(error);
    }
  };
  publish();
  return watch.onUpdate(publish);
}

export function subscribeCloudCommunityAgentDockTranscript(params: {
  liveClient: CloudCommunityChatLiveClient;
  communityId: string;
  onUpdate: (transcript: CommunityAgentDockTranscript) => void;
  onError?: (error: unknown) => void;
}): () => void {
  const watch = params.liveClient.client.watchQuery(
    (api as any).communityInteractions.getMyCommunityAgentDockTranscript,
    {
      authSubject: params.liveClient.authSubject,
      communityId: params.communityId as any,
    } as any,
  );
  const publish = () => {
    try {
      const result = watch.localQueryResult() as CommunityAgentDockTranscript | undefined;
      if (typeof result === "undefined") return;
      params.onUpdate({
        root_id: result?.root_id ?? null,
        messages: Array.isArray(result?.messages) ? result.messages : [],
      });
    } catch (error) {
      params.onError?.(error);
    }
  };
  publish();
  return watch.onUpdate(publish);
}

export function subscribeCloudCommunityAgentDockTurn(params: {
  liveClient: CloudCommunityChatLiveClient;
  communityId: string;
  onUpdate: (turn: CommunityAgentDockTurn) => void;
  onError?: (error: unknown) => void;
}): () => void {
  const watch = params.liveClient.client.watchQuery(
    (api as any).communityInteractions.getMyCommunityAgentDockTurn,
    {
      authSubject: params.liveClient.authSubject,
      communityId: params.communityId as any,
    } as any,
  );
  const publish = () => {
    try {
      const result = watch.localQueryResult() as CommunityAgentDockTurn | undefined;
      if (typeof result === "undefined") return;
      params.onUpdate({
        request: result?.request ?? null,
        events: Array.isArray(result?.events) ? result.events : [],
      });
    } catch (error) {
      params.onError?.(error);
    }
  };
  publish();
  return watch.onUpdate(publish);
}
