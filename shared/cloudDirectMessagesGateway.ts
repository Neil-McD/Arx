import { ConvexReactClient } from "convex/react";
import { resolveAuthIdentityToken, resolveAuthSubject } from "./authSession";
import { bootstrapConvexAuthenticatedClient, requireConvexUrl } from "./convexAuthenticatedClient";
import type {
  DirectMessage,
  DirectMessageConversation,
  DirectMessageRecipient,
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

function resolveSessionIdentityToken(sessionRaw: unknown): string {
  return String(resolveAuthIdentityToken((sessionRaw ?? null) as any) ?? "").trim();
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
  params: CloudDirectMessagesGatewayParams<SessionT>,
): CloudDirectMessagesLiveClient {
  const authSubject = resolveAuthSubject(params.session as any);
  if (!authSubject) {
    throw new Error("convex_auth_subject_required");
  }
  const identityToken = resolveSessionIdentityToken(params.session);
  if (!identityToken) {
    throw new Error("convex_identity_token_required");
  }

  const client = new ConvexReactClient(requireConvexUrl());
  client.setAuth(async () => resolveSessionIdentityToken(params.session) || null);
  return {
    client,
    authSubject,
    close: () => {
      client.close();
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

export async function listCloudDirectMessages<SessionT>(
  params: CloudDirectMessagesGatewayParams<SessionT> & {
    conversationId: string;
    beforeSeq?: number | null;
    limit?: number;
  },
): Promise<DirectMessage[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("directMessages:listDirectMessages" as any, {
    authSubject,
    conversationId: params.conversationId,
    beforeSeq: params.beforeSeq ?? null,
    limit: params.limit ?? 100,
  });
  return coerceRows<DirectMessage>(payload);
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

export async function listCloudEligibleDirectMessageRecipientsForViewer<SessionT>(
  params: CloudDirectMessagesGatewayParams<SessionT> & {
    search?: string;
    limit?: number;
  },
): Promise<DirectMessageRecipient[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("directMessages:listEligibleDirectMessageRecipientsForViewer" as any, {
    authSubject,
    search: params.search ?? "",
    limit: params.limit ?? 20,
  });
  return coerceRows<DirectMessageRecipient>(payload);
}

export async function markCloudDirectConversationRead<SessionT>(
  params: CloudDirectMessagesGatewayParams<SessionT> & {
    conversationId: string;
  },
): Promise<DirectMessageConversation> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = (await client.mutation("directMessages:markDirectConversationRead" as any, {
    authSubject,
    conversationId: params.conversationId,
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
  },
): Promise<DirectMessage> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = (await client.mutation("directMessages:sendDirectMessage" as any, {
    authSubject,
    conversationId: params.conversationId,
    text: params.text,
    attachments: params.attachments ?? [],
  })) as DirectMessage | null;
  if (!payload?.id) throw new Error("Failed to send direct message.");
  return payload;
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
  const contentType =
    params.file && typeof params.file === "object" && "type" in params.file
      ? String((params.file as DirectMessageUploadableFile).type ?? "").trim() || "application/octet-stream"
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
