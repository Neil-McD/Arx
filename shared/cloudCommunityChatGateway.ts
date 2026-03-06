import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

type CloudCommunityChatGatewayParams<SessionT> = {
  session: SessionT;
};

function coerceObjectRows<TRow>(payload: unknown): TRow[] {
  if (Array.isArray(payload)) return payload as TRow[];
  if (!payload || typeof payload !== "object") return [];
  const payloadObj = payload as Record<string, unknown>;
  const keys = ["rows", "items", "data"] as const;
  for (const key of keys) {
    const value = payloadObj[key];
    if (Array.isArray(value)) return value as TRow[];
  }
  return [payload as TRow];
}

export async function deleteCloudMessageReactionById<SessionT>(
  params: CloudCommunityChatGatewayParams<SessionT> & {
    reactionId: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:deleteMessageReactionById" as any, {
    authSubject,
    reactionId: params.reactionId,
  });
}

export async function createCloudMessageReaction<SessionT, TReaction = unknown>(
  params: CloudCommunityChatGatewayParams<SessionT> & {
    messageId: string;
    emoji: string;
  },
): Promise<TReaction[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("community:createMessageReaction" as any, {
    authSubject,
    messageId: params.messageId,
    emoji: params.emoji,
  });
  return coerceObjectRows<TReaction>(payload);
}

export async function patchCloudOwnMessageContent<SessionT>(
  params: CloudCommunityChatGatewayParams<SessionT> & {
    messageId: string;
    senderId: string;
    contentJson: unknown;
  },
): Promise<void> {
  void params.senderId;
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:patchOwnMessageContent" as any, {
    authSubject,
    messageId: params.messageId,
    contentJson: params.contentJson,
  });
}

export async function deleteCloudOwnMessage<SessionT>(
  params: CloudCommunityChatGatewayParams<SessionT> & {
    messageId: string;
    senderId: string;
  },
): Promise<void> {
  void params.senderId;
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:deleteOwnMessage" as any, {
    authSubject,
    messageId: params.messageId,
  });
}

export async function createCloudThreadUserMessageRows<SessionT, TRow = unknown>(
  params: CloudCommunityChatGatewayParams<SessionT> & {
    threadId: string;
    text: string;
    attachments?: unknown[];
    replyToId?: string | null;
  },
): Promise<TRow[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("community:createThreadUserMessage" as any, {
    authSubject,
    threadId: params.threadId,
    text: params.text,
    attachments: params.attachments ?? [],
    replyToId: params.replyToId ?? null,
  });
  return coerceObjectRows<TRow>(payload);
}

export async function ensureCloudCommunityChatThread<SessionT>(
  params: CloudCommunityChatGatewayParams<SessionT> & {
    communityId: string;
    init?: RequestInit;
  },
): Promise<string> {
  void params.init;
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = (await client.mutation("community:ensureCommunityChatThread" as any, {
    authSubject,
    communityId: params.communityId,
  })) as { thread_id?: string | null };
  const threadId = String(payload?.thread_id ?? "").trim();
  if (!threadId) throw new Error("Failed to ensure community chat thread.");
  return threadId;
}

export async function listCloudThreadMessages<SessionT, TRow = unknown>(
  params: CloudCommunityChatGatewayParams<SessionT> & {
    threadId: string;
    beforeSeq?: number | null;
    limit?: number;
    init?: RequestInit;
  },
): Promise<TRow[]> {
  void params.init;
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:listThreadMessages" as any, {
    authSubject,
    threadId: params.threadId,
    beforeSeq: params.beforeSeq ?? null,
    limit: params.limit ?? 100,
  });
  return coerceObjectRows<TRow>(payload);
}

export async function listCloudMessageReactions<SessionT, TRow = unknown>(
  params: CloudCommunityChatGatewayParams<SessionT> & {
    messageIds: string[];
    init?: RequestInit;
  },
): Promise<TRow[]> {
  void params.init;
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:listMessageReactions" as any, {
    authSubject,
    messageIds: params.messageIds,
  });
  return coerceObjectRows<TRow>(payload);
}

export async function listCloudThreadUserMessageSenderIds<SessionT>(
  params: CloudCommunityChatGatewayParams<SessionT> & {
    threadId: string;
    sinceIso?: string | null;
    limit?: number;
  },
): Promise<string[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("community:listThreadUserMessageSenderIds" as any, {
    authSubject,
    threadId: params.threadId,
    sinceIso: params.sinceIso ?? null,
    limit: params.limit ?? 5000,
  });
  const rows = coerceObjectRows<{ sender_id: string | null }>(payload);
  const senders = new Set<string>();
  for (const row of rows) {
    const sender = String(row.sender_id ?? "").trim();
    if (sender) senders.add(sender);
  }
  return [...senders];
}
