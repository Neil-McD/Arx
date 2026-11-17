import type { ConvexReactClient } from "convex/react";
import { bootstrapConvexAuthenticatedClient, requireConvexUrl } from "./convexAuthenticatedClient";
import { resolveConvexRuntimeToken, type AuthSessionLike } from "./authSession";
import { readConvexRuntimeUrl } from "./convexRuntime";
import { DIRECT_MESSAGE_ATTACHMENT_DOWNLOAD_PATH, DIRECT_MESSAGE_ATTACHMENT_UPLOAD_PATH } from "./communityAttachmentPolicy";
import {
  acquireAuthenticatedConvexRealtimeClient,
  type ConvexRealtimeEnsureSession,
} from "./convexRealtimeAuth";
import type {
  DirectMessage,
  DirectMessageConversation,
  DirectMessageNetworkPeopleBundle,
  DirectMessageNetworkPerson,
  DirectMessagePeerPresence,
  DirectMessageTypingPresenceBundle,
} from "./communityTypes";

type CloudDirectMessagesGatewayParams<SessionT> = {
  session: SessionT;
};

export type CloudDirectMessagesLiveClient = {
  client: ConvexReactClient;
  authSubject: string;
  close: () => void;
};

function coerceRows<TRow>(payload: unknown): TRow[] {
  if (Array.isArray(payload)) return payload as TRow[];
  if (!payload || typeof payload !== "object") return [];
  const payloadObj = payload as Record<string, unknown>;
  for (const key of ["rows", "items", "data"] as const) {
    const value = payloadObj[key];
    if (Array.isArray(value)) return value as TRow[];
  }
  return [payload as TRow];
}

function emitLiveRows<TRow>(
  watch: { localQueryResult(): unknown },
  onUpdate: (rows: TRow[]) => void,
  onError?: (error: unknown) => void,
) {
  try {
    const result = watch.localQueryResult();
    if (typeof result === "undefined") return;
    onUpdate(coerceRows<TRow>(result));
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

export function createCloudDirectMessagesLiveClient<SessionT>(
  params: CloudDirectMessagesGatewayParams<SessionT> & {
    ensureSession?: ConvexRealtimeEnsureSession<SessionT>;
  },
): CloudDirectMessagesLiveClient {
  return acquireAuthenticatedConvexRealtimeClient({
    convexUrl: requireConvexUrl(),
    session: params.session,
    ensureSession: params.ensureSession,
  });
}

export async function ensureCloudDirectConversationFromCommunity<SessionT>(
  params: CloudDirectMessagesGatewayParams<SessionT> & {
    targetUserId: string;
    communityId: string;
  },
): Promise<DirectMessageConversation> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = (await client.mutation("directMessages:ensureDirectConversationFromCommunity" as any, {
    authSubject,
    targetUserId: params.targetUserId,
    communityId: params.communityId,
  })) as DirectMessageConversation | null;
  if (!payload?.id) throw new Error("Failed to open direct message.");
  return payload;
}

export async function listCloudDirectConversations<SessionT>(
  params: CloudDirectMessagesGatewayParams<SessionT> & {
    limit?: number;
  },
): Promise<DirectMessageConversation[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("directMessages:listMyDirectConversations" as any, {
    authSubject,
    limit: params.limit ?? 30,
  });
  return coerceRows<DirectMessageConversation>(payload);
}

export async function listCloudNetworkPeople<SessionT>(
  params: CloudDirectMessagesGatewayParams<SessionT> & {
    search?: string;
    limit?: number;
    excludeUserIds?: readonly string[];
  },
): Promise<DirectMessageNetworkPeopleBundle> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const excludeUserIds = (params.excludeUserIds ?? [])
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .slice(0, 200);
  const payload = (await client.query("directMessages:listNetworkPeopleForViewer" as any, {
    authSubject,
    search: params.search ?? "",
    limit: params.limit ?? 20,
    ...(excludeUserIds.length > 0 ? { excludeUserIds } : null),
  })) as DirectMessageNetworkPeopleBundle | null;
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.people)) {
    return { people: [], source_community_count: 0, has_more: false };
  }
  return {
    people: payload.people as DirectMessageNetworkPerson[],
    source_community_count: Math.max(0, Math.floor(Number(payload.source_community_count ?? 0))),
    has_more: Boolean(payload.has_more),
  };
}

export async function sendCloudDirectMessageToUser<SessionT>(
  params: CloudDirectMessagesGatewayParams<SessionT> & {
    targetUserId: string;
    communityId?: string | null;
    text: string;
    attachments?: unknown[];
    clientMessageId?: string | null;
  },
): Promise<{ conversation: DirectMessageConversation; message: DirectMessage }> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const communityId = String(params.communityId ?? "").trim();
  const clientMessageId = String(params.clientMessageId ?? "").trim();
  const payload = (await client.mutation("directMessages:sendDirectMessageToUser" as any, {
    authSubject,
    targetUserId: params.targetUserId,
    ...(communityId ? { communityId } : null),
    text: params.text,
    attachments: params.attachments ?? [],
    ...(clientMessageId ? { clientMessageId } : null),
  })) as { conversation: DirectMessageConversation | null; message: DirectMessage | null } | null;
  if (!payload?.conversation?.id || !payload?.message?.id) {
    throw new Error("Failed to send direct message.");
  }
  return {
    conversation: payload.conversation,
    message: payload.message,
  };
}

export async function listCloudDirectMessagePeerPresence<SessionT>(
  params: CloudDirectMessagesGatewayParams<SessionT> & {
    targetUserIds: readonly string[];
  },
): Promise<DirectMessagePeerPresence[]> {
  const targetUserIds = params.targetUserIds
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .slice(0, 50);
  if (targetUserIds.length === 0) return [];
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = (await client.query("directMessages:listDirectMessagePeerPresenceForViewer" as any, {
    authSubject,
    targetUserIds,
  })) as { peers?: DirectMessagePeerPresence[] } | null;
  return Array.isArray(payload?.peers) ? payload.peers : [];
}

export async function setCloudDirectConversationMuted<SessionT>(
  params: CloudDirectMessagesGatewayParams<SessionT> & {
    conversationId: string;
    muted: boolean;
  },
): Promise<DirectMessageConversation> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = (await client.mutation("directMessages:setDirectConversationMuted" as any, {
    authSubject,
    conversationId: params.conversationId,
    muted: params.muted,
  })) as DirectMessageConversation | null;
  if (!payload?.id) throw new Error("Failed to update conversation.");
  return payload;
}

export async function markCloudDirectConversationRead<SessionT>(
  params: CloudDirectMessagesGatewayParams<SessionT> & {
    conversationId: string;
    throughSeq: number;
  },
): Promise<DirectMessageConversation> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = (await client.mutation("directMessages:markDirectConversationRead" as any, {
    authSubject,
    conversationId: params.conversationId,
    throughSeq: Math.floor(params.throughSeq),
  })) as DirectMessageConversation | null;
  if (!payload?.id) throw new Error("Failed to mark direct message as read.");
  return payload;
}

export function subscribeCloudDirectConversations<TRow = DirectMessageConversation>(
  params: {
    liveClient: CloudDirectMessagesLiveClient;
    limit?: number;
    onUpdate: (rows: TRow[]) => void;
    onError?: (error: unknown) => void;
  },
): () => void {
  const watch = params.liveClient.client.watchQuery(
    "directMessages:listMyDirectConversations" as any,
    {
      authSubject: params.liveClient.authSubject,
      limit: params.limit ?? 30,
    } as any,
  );
  const publish = () => {
    emitLiveRows<TRow>(watch as any, params.onUpdate, params.onError);
  };
  publish();
  return watch.onUpdate(publish);
}

export function subscribeCloudDirectMessages<TRow = DirectMessage>(
  params: {
    liveClient: CloudDirectMessagesLiveClient;
    conversationId: string;
    limit?: number;
    onUpdate: (rows: TRow[]) => void;
    onError?: (error: unknown) => void;
  },
): () => void {
  const watch = params.liveClient.client.watchQuery(
    "directMessages:listDirectMessages" as any,
    {
      authSubject: params.liveClient.authSubject,
      conversationId: params.conversationId as any,
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

export function subscribeCloudDirectTyping<TResult = DirectMessageTypingPresenceBundle>(
  params: {
    liveClient: CloudDirectMessagesLiveClient;
    conversationId: string;
    onUpdate: (result: TResult) => void;
    onError?: (error: unknown) => void;
  },
): () => void {
  const watch = params.liveClient.client.watchQuery(
    "directMessages:listDirectTyping" as any,
    {
      authSubject: params.liveClient.authSubject,
      conversationId: params.conversationId as any,
    } as any,
  );
  const publish = () => {
    emitLiveResult<TResult>(watch as any, params.onUpdate, params.onError);
  };
  publish();
  return watch.onUpdate(publish);
}

export async function sendCloudDirectMessage<SessionT>(
  params: CloudDirectMessagesGatewayParams<SessionT> & {
    conversationId: string;
    text: string;
    attachments?: unknown[];
    clientMessageId?: string | null;
  },
): Promise<DirectMessage> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const clientMessageId = String(params.clientMessageId ?? "").trim();
  const payload = (await client.mutation("directMessages:sendDirectMessage" as any, {
    authSubject,
    conversationId: params.conversationId,
    text: params.text,
    attachments: params.attachments ?? [],
    ...(clientMessageId ? { clientMessageId } : null),
  })) as DirectMessage | null;
  if (!payload?.id) throw new Error("Failed to send direct message.");
  return payload;
}

export async function blockCloudDirectMessageUser<SessionT>(
  params: CloudDirectMessagesGatewayParams<SessionT> & {
    targetUserId: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("directMessages:blockDirectMessageUser" as any, {
    authSubject,
    targetUserId: params.targetUserId,
  });
}

export async function unblockCloudDirectMessageUser<SessionT>(
  params: CloudDirectMessagesGatewayParams<SessionT> & {
    targetUserId: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("directMessages:unblockDirectMessageUser" as any, {
    authSubject,
    targetUserId: params.targetUserId,
  });
}


export async function setCloudDirectTyping<SessionT>(
  params: CloudDirectMessagesGatewayParams<SessionT> & {
    conversationId: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("directMessages:setDirectTyping" as any, {
    authSubject,
    conversationId: params.conversationId,
  });
}

export async function clearCloudDirectTyping<SessionT>(
  params: CloudDirectMessagesGatewayParams<SessionT> & {
    conversationId: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("directMessages:clearDirectTyping" as any, {
    authSubject,
    conversationId: params.conversationId,
  });
}

// A file for a direct message goes to the server, which stores it itself and
// answers with a reservation id. A send names that id; nothing else about the
// file is taken from the browser. For a first message there is no
// conversation yet: name the person instead.
export async function uploadCloudDirectMessageAttachmentFile<SessionT>(
  params: CloudDirectMessagesGatewayParams<SessionT> & {
    conversationId?: string | null;
    targetUserId?: string | null;
    communityId?: string | null;
    messageKey: string;
    file: File;
  },
): Promise<{ attachmentId: string; name: string; mime: string; size: number; type: "image" | "video" | "file" }> {
  await bootstrapConvexAuthenticatedClient(params.session);
  const token = resolveConvexRuntimeToken(params.session as AuthSessionLike);
  const baseUrl = String(readConvexRuntimeUrl() ?? "").replace(/\/+$/, "");
  if (!token || !baseUrl) throw new Error("Sign in to attach files.");
  const response = await fetch(`${baseUrl}${DIRECT_MESSAGE_ATTACHMENT_UPLOAD_PATH}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": params.file.type || "application/octet-stream",
      ...(params.conversationId ? { "X-Polynet-Conversation-Id": params.conversationId } : {}),
      ...(params.targetUserId ? { "X-Polynet-Target-User-Id": params.targetUserId } : {}),
      ...(params.communityId ? { "X-Polynet-Community-Id": params.communityId } : {}),
      "X-Polynet-Message-Key": params.messageKey,
      "X-Polynet-File-Name": encodeURIComponent(params.file.name || "attachment"),
    },
    body: params.file,
  });
  if (response.status === 413) throw new Error("That file is too large.");
  if (response.status === 429) throw new Error("Too many files waiting to send. Send or remove some first.");
  if (!response.ok) throw new Error("That file couldn't be attached.");
  const payload = await response.json();
  if (!payload?.attachment?.attachmentId) throw new Error("That file couldn't be attached.");
  return payload.attachment;
}

// Only someone in the conversation is given the file.
export async function downloadCloudDirectMessageAttachment<SessionT>(params: {
  session: SessionT; attachmentId: string; signal?: AbortSignal;
}): Promise<Blob> {
  await bootstrapConvexAuthenticatedClient(params.session);
  const token = resolveConvexRuntimeToken(params.session as AuthSessionLike);
  const baseUrl = String(readConvexRuntimeUrl() ?? "").replace(/\/+$/, "");
  if (!token || !baseUrl) throw new Error("Sign in to open this file.");
  const response = await fetch(`${baseUrl}${DIRECT_MESSAGE_ATTACHMENT_DOWNLOAD_PATH}`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "X-Polynet-Attachment-Id": params.attachmentId },
    signal: params.signal,
  });
  if (!response.ok) throw new Error("This file is unavailable.");
  return response.blob();
}
