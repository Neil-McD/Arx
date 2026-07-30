import { ConvexReactClient } from "convex/react";
import { api } from "../convex/_generated/api";
import { resolveAuthSubject, resolveConvexRuntimeToken } from "./authSession";
import { bootstrapConvexAuthenticatedClient, requireConvexUrl } from "./convexAuthenticatedClient";
import {
  createAuthenticatedConvexRealtimeClient,
  type ConvexRealtimeAuthState,
  type ConvexRealtimeEnsureSession,
} from "./convexRealtimeAuth";

type CloudCommunityChatGatewayParams<SessionT> = {
  session: SessionT;
};

type CommunityChatUploadableFile = {
  type?: string;
};

const MAX_REACTION_MESSAGE_IDS_PER_REQUEST = 100;

export type CloudCommunityChatLiveClient = {
  client: ConvexReactClient;
  authSubject: string;
  close: () => void;
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

function resolveSessionRuntimeToken(sessionRaw: unknown): string {
  return String(resolveConvexRuntimeToken((sessionRaw ?? null) as any) ?? "").trim();
}

export function createCloudCommunityChatLiveClient<SessionT>(
  params: CloudCommunityChatGatewayParams<SessionT> & {
    ensureSession?: ConvexRealtimeEnsureSession<SessionT>;
  },
): CloudCommunityChatLiveClient {
  const authSubject = resolveAuthSubject(params.session as any);
  if (!authSubject) {
    throw new Error("convex_auth_subject_required");
  }
  const runtimeToken = resolveSessionRuntimeToken(params.session);
  if (!runtimeToken) {
    throw new Error("convex_identity_token_required");
  }

  const authState: ConvexRealtimeAuthState<SessionT> = {
    sessionRef: { current: params.session },
    ensureSessionRef: { current: params.ensureSession },
  };
  const realtimeClient = createAuthenticatedConvexRealtimeClient({
    convexUrl: requireConvexUrl(),
    authState,
    source: "community_chat_live",
  });
  return {
    client: realtimeClient.client,
    authSubject,
    close: () => {
      realtimeClient.close();
    },
  };
}

function emitLiveRows<TRow>(
  watch: { localQueryResult(): unknown },
  onUpdate: (rows: TRow[]) => void,
  onError?: (error: unknown) => void,
) {
  try {
    const result = watch.localQueryResult();
    if (typeof result === "undefined") return;
    onUpdate(coerceObjectRows<TRow>(result));
  } catch (error) {
    onError?.(error);
  }
}

function emitLiveResult<TResult>(
  watch: { localQueryResult(): unknown },
  onUpdate: (result: TResult) => void,
  onError?: (error: unknown) => void,
) {
  try {
    const result = watch.localQueryResult();
    if (typeof result === "undefined") return;
    onUpdate(result as TResult);
  } catch (error) {
    onError?.(error);
  }
}

export function subscribeCloudThreadMessages<TRow = unknown>(
  params: {
    liveClient: CloudCommunityChatLiveClient;
    threadId: string;
    limit?: number;
    onUpdate: (rows: TRow[]) => void;
    onError?: (error: unknown) => void;
  },
): () => void {
  const watch = params.liveClient.client.watchQuery(
    api.communityChat.listThreadMessages,
    {
      authSubject: params.liveClient.authSubject,
      threadId: params.threadId as any,
      beforeSeq: null,
      limit: params.limit ?? 100,
    } as any,
  );
  const publish = () => {
    emitLiveRows<TRow>(watch as any, params.onUpdate, params.onError);
  };
  publish();
  return watch.onUpdate(publish);
}

export function subscribeCloudMessageReactions<TRow = unknown>(
  params: {
    liveClient: CloudCommunityChatLiveClient;
    messageIds: string[];
    onUpdate: (rows: TRow[]) => void;
    onError?: (error: unknown) => void;
  },
): () => void {
  const messageIds = Array.from(
    new Set(params.messageIds.map((value) => String(value ?? "").trim()).filter(Boolean)),
  ).slice(0, MAX_REACTION_MESSAGE_IDS_PER_REQUEST);
  if (messageIds.length === 0) {
    params.onUpdate([]);
    return () => {};
  }
  const watch = params.liveClient.client.watchQuery(
    api.communityChat.listMessageReactions,
    {
      authSubject: params.liveClient.authSubject,
      messageIds,
    } as any,
  );
  const publish = () => {
    emitLiveRows<TRow>(watch as any, params.onUpdate, params.onError);
  };
  publish();
  return watch.onUpdate(publish);
}

export function subscribeCloudCommunityTyping<TResult = unknown>(
  params: {
    liveClient: CloudCommunityChatLiveClient;
    communityId: string;
    onUpdate: (result: TResult) => void;
    onError?: (error: unknown) => void;
  },
): () => void {
  const watch = params.liveClient.client.watchQuery(
    api.communityChat.listCommunityTyping,
    {
      authSubject: params.liveClient.authSubject,
      communityId: params.communityId as any,
    } as any,
  );
  const publish = () => {
    emitLiveResult<TResult>(watch as any, params.onUpdate, params.onError);
  };
  publish();
  return watch.onUpdate(publish);
}

export function subscribeCloudCommunityActivityEvents<TRow = unknown>(
  params: {
    liveClient: CloudCommunityChatLiveClient;
    communityId: string;
    limit?: number;
    onUpdate: (rows: TRow[]) => void;
    onError?: (error: unknown) => void;
  },
): () => void {
  const watch = params.liveClient.client.watchQuery(
    "communityActivity:listCommunityActivityEvents" as any,
    {
      authSubject: params.liveClient.authSubject,
      communityId: params.communityId as any,
      beforeCreatedAt: null,
      limit: params.limit ?? 50,
    } as any,
  );
  const publish = () => {
    emitLiveRows<TRow>(watch as any, params.onUpdate, params.onError);
  };
  publish();
  return watch.onUpdate(publish);
}

export async function setCloudCommunityTyping<SessionT>(
  params: CloudCommunityChatGatewayParams<SessionT> & {
    communityId: string;
    rootId?: string | null;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("communityChat:setCommunityTyping" as any, {
    authSubject,
    communityId: params.communityId,
    rootId: params.rootId ?? undefined,
  });
}

export async function clearCloudCommunityTyping<SessionT>(
  params: CloudCommunityChatGatewayParams<SessionT> & {
    communityId: string;
    rootId?: string | null;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("communityChat:clearCommunityTyping" as any, {
    authSubject,
    communityId: params.communityId,
    rootId: params.rootId ?? undefined,
  });
}

export async function deleteCloudMessageReactionById<SessionT>(
  params: CloudCommunityChatGatewayParams<SessionT> & {
    reactionId: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("communityChat:deleteMessageReactionById" as any, {
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
  const payload = await client.mutation("communityChat:createMessageReaction" as any, {
    authSubject,
    messageId: params.messageId,
    emoji: params.emoji,
  });
  return coerceObjectRows<TReaction>(payload);
}

export async function patchCloudOwnMessageContent<SessionT>(
  params: CloudCommunityChatGatewayParams<SessionT> & {
    messageId: string;
    contentJson: unknown;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("communityChat:patchOwnMessageContent" as any, {
    authSubject,
    messageId: params.messageId,
    contentJson: params.contentJson,
  });
}

export async function deleteCloudOwnMessage<SessionT>(
  params: CloudCommunityChatGatewayParams<SessionT> & {
    messageId: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("communityChat:deleteOwnMessage" as any, {
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
  const payload = await client.mutation("communityChat:createThreadUserMessage" as any, {
    authSubject,
    threadId: params.threadId,
    text: params.text,
    attachments: params.attachments ?? [],
    replyToId: params.replyToId ?? null,
  });
  return coerceObjectRows<TRow>(payload);
}

async function requestCloudCommunityChatAttachmentUploadUrl<SessionT>(
  params: CloudCommunityChatGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<string> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("communityChat:generateCommunityChatAttachmentUploadUrl" as any, {
    authSubject,
    communityId: params.communityId,
  });
  const uploadUrl =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? String((payload as Record<string, unknown>).uploadUrl ?? "").trim()
      : "";
  if (!uploadUrl) {
    throw new Error("Failed to start community attachment upload.");
  }
  return uploadUrl;
}

export async function uploadCloudCommunityChatAttachmentFile<SessionT>(
  params: CloudCommunityChatGatewayParams<SessionT> & {
    communityId: string;
    file: File | Blob | CommunityChatUploadableFile;
  },
): Promise<string> {
  const uploadUrl = await requestCloudCommunityChatAttachmentUploadUrl({
    session: params.session,
    communityId: params.communityId,
  });
  const contentType =
    params.file && typeof params.file === "object" && "type" in params.file
      ? String((params.file as CommunityChatUploadableFile).type ?? "").trim() || "application/octet-stream"
      : "application/octet-stream";
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
    },
    body: params.file as BodyInit,
  });
  if (!response.ok) {
    throw new Error("Failed to upload attachment.");
  }
  const payload = (await response.json()) as { storageId?: string | null };
  const storageId = String(payload?.storageId ?? "").trim();
  if (!storageId) {
    throw new Error("Failed to upload attachment.");
  }
  return storageId;
}

export async function ensureCloudCommunityChatThread<SessionT>(
  params: CloudCommunityChatGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<string> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = (await client.mutation("communityChat:ensureCommunityChatThread" as any, {
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
  },
): Promise<TRow[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("communityChat:listThreadMessages" as any, {
    authSubject,
    threadId: params.threadId,
    beforeSeq: params.beforeSeq ?? null,
    limit: params.limit ?? 100,
  });
  return coerceObjectRows<TRow>(payload);
}

export async function listCloudCommunityActivityEvents<SessionT, TRow = unknown>(
  params: CloudCommunityChatGatewayParams<SessionT> & {
    communityId: string;
    beforeCreatedAt?: number | null;
    limit?: number;
  },
): Promise<TRow[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("communityActivity:listCommunityActivityEvents" as any, {
    authSubject,
    communityId: params.communityId,
    beforeCreatedAt: params.beforeCreatedAt ?? null,
    limit: params.limit ?? 50,
  });
  return coerceObjectRows<TRow>(payload);
}

export async function listCloudMessageReactions<SessionT, TRow = unknown>(
  params: CloudCommunityChatGatewayParams<SessionT> & {
    messageIds: string[];
  },
): Promise<TRow[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("communityChat:listMessageReactions" as any, {
    authSubject,
    messageIds: params.messageIds,
  });
  return coerceObjectRows<TRow>(payload);
}
