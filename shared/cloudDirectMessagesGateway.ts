import { ConvexReactClient } from "convex/react";
import { resolveConvexRuntimeToken, resolveAuthSubject } from "./authSession";
import { bootstrapConvexAuthenticatedClient, requireConvexUrl } from "./convexAuthenticatedClient";
import {
  createAuthenticatedConvexRealtimeClient,
  type AuthenticatedConvexRealtimeClient,
  type ConvexRealtimeAuthState,
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

type DirectMessageUploadableFile = {
  type?: string;
};

export type CloudDirectMessagesLiveClient = {
  client: ConvexReactClient;
  authSubject: string;
  close: () => void;
};

type SharedLiveClientEntry = {
  key: string;
  client: ConvexReactClient;
  realtimeClient: AuthenticatedConvexRealtimeClient;
  refCount: number;
  authState: ConvexRealtimeAuthState<any>;
  closeTimer: ReturnType<typeof setTimeout> | null;
};

let sharedLiveClientEntry: SharedLiveClientEntry | null = null;

// Effects release and immediately reacquire the client on session identity
// refreshes; the linger keeps the websocket alive across those transients.
const SHARED_LIVE_CLIENT_CLOSE_LINGER_MS = 1500;

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

function resolveSessionRuntimeToken(sessionRaw: unknown): string {
  return String(resolveConvexRuntimeToken((sessionRaw ?? null) as any) ?? "").trim();
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
  const authSubject = resolveAuthSubject(params.session as any);
  if (!authSubject) {
    throw new Error("convex_auth_subject_required");
  }
  const runtimeToken = resolveSessionRuntimeToken(params.session);
  if (!runtimeToken) {
    throw new Error("convex_identity_token_required");
  }

  const convexUrl = requireConvexUrl();
  const key = `${convexUrl}::${authSubject}`;
  let entry = sharedLiveClientEntry;
  if (entry && entry.key === key) {
    const previousRuntimeToken = resolveSessionRuntimeToken(entry.authState.sessionRef.current);
    entry.refCount += 1;
    entry.authState.sessionRef.current = params.session;
    entry.authState.ensureSessionRef.current = params.ensureSession;
    if (entry.closeTimer !== null) {
      clearTimeout(entry.closeTimer);
      entry.closeTimer = null;
    }
    if (previousRuntimeToken !== runtimeToken) {
      entry.realtimeClient.reauthenticate();
    }
  } else {
    const authState: ConvexRealtimeAuthState<SessionT> = {
      sessionRef: { current: params.session },
      ensureSessionRef: { current: params.ensureSession },
    };
    const realtimeClient = createAuthenticatedConvexRealtimeClient({
      convexUrl,
      authState,
      source: "direct_messages_live",
    });
    entry = {
      key,
      client: realtimeClient.client,
      realtimeClient,
      refCount: 1,
      authState,
      closeTimer: null,
    };
    sharedLiveClientEntry = entry;
  }

  const acquired = entry;
  let isClosed = false;
  return {
    client: acquired.client,
    authSubject,
    close: () => {
      if (isClosed) return;
      isClosed = true;
      acquired.refCount -= 1;
      if (acquired.refCount > 0) return;
      if (acquired.closeTimer !== null) {
        clearTimeout(acquired.closeTimer);
      }
      acquired.closeTimer = setTimeout(() => {
        if (acquired.refCount > 0) return;
        if (sharedLiveClientEntry === acquired) {
          sharedLiveClientEntry = null;
        }
        acquired.realtimeClient.close();
      }, SHARED_LIVE_CLIENT_CLOSE_LINGER_MS);
    },
  };
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

async function requestCloudDirectMessageAttachmentUploadUrl<SessionT>(
  params: CloudDirectMessagesGatewayParams<SessionT> & {
    conversationId: string;
  },
): Promise<string> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("directMessages:generateDirectMessageAttachmentUploadUrl" as any, {
    authSubject,
    conversationId: params.conversationId,
  });
  const uploadUrl =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? String((payload as Record<string, unknown>).uploadUrl ?? "").trim()
      : "";
  if (!uploadUrl) {
    throw new Error("Failed to start direct message attachment upload.");
  }
  return uploadUrl;
}

async function postDirectMessageAttachmentToUploadUrl(
  uploadUrl: string,
  file: File | Blob | DirectMessageUploadableFile,
): Promise<string> {
  const contentType =
    file && typeof file === "object" && "type" in file
      ? String((file as DirectMessageUploadableFile).type ?? "").trim() || "application/octet-stream"
      : "application/octet-stream";
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
    },
    body: file as BodyInit,
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

export async function uploadCloudDirectMessageAttachmentFile<SessionT>(
  params: CloudDirectMessagesGatewayParams<SessionT> & {
    conversationId: string;
    file: File | Blob | DirectMessageUploadableFile;
  },
): Promise<string> {
  const uploadUrl = await requestCloudDirectMessageAttachmentUploadUrl({
    session: params.session,
    conversationId: params.conversationId,
  });
  return await postDirectMessageAttachmentToUploadUrl(uploadUrl, params.file);
}

export async function uploadCloudDirectMessageAttachmentFileForUser<SessionT>(
  params: CloudDirectMessagesGatewayParams<SessionT> & {
    targetUserId: string;
    communityId?: string | null;
    file: File | Blob | DirectMessageUploadableFile;
  },
): Promise<string> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const communityId = String(params.communityId ?? "").trim();
  const payload = await client.mutation(
    "directMessages:generateDirectMessageAttachmentUploadUrlForUser" as any,
    {
      authSubject,
      targetUserId: params.targetUserId,
      ...(communityId ? { communityId } : null),
    },
  );
  const uploadUrl =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? String((payload as Record<string, unknown>).uploadUrl ?? "").trim()
      : "";
  if (!uploadUrl) {
    throw new Error("Failed to start direct message attachment upload.");
  }
  return await postDirectMessageAttachmentToUploadUrl(uploadUrl, params.file);
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
