import type { ConvexReactClient } from "convex/react";
import { api } from "../convex/_generated/api";
import { bootstrapConvexAuthenticatedClient, requireConvexUrl } from "./convexAuthenticatedClient";
import {
  acquireAuthenticatedConvexRealtimeClient,
  type ConvexRealtimeEnsureSession,
} from "./convexRealtimeAuth";
import type { CommunityActivityEventType } from "./communityTypes";

type CloudCommunityChatGatewayParams<SessionT> = {
  session: SessionT;
};

type CommunityChatUploadableFile = {
  type?: string;
};

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

export function createCloudCommunityChatLiveClient<SessionT>(
  params: CloudCommunityChatGatewayParams<SessionT> & {
    ensureSession?: ConvexRealtimeEnsureSession<SessionT>;
  },
): CloudCommunityChatLiveClient {
  return acquireAuthenticatedConvexRealtimeClient({
    convexUrl: requireConvexUrl(),
    session: params.session,
    ensureSession: params.ensureSession,
  });
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

export function subscribeCloudCommunityTyping<TResult = unknown>(
  params: {
    liveClient: CloudCommunityChatLiveClient;
    communityId: string;
    channelId?: string | null;
    onUpdate: (result: TResult) => void;
    onError?: (error: unknown) => void;
  },
): () => void {
  const watch = params.liveClient.client.watchQuery(
    api.communityChat.listCommunityTyping,
    {
      authSubject: params.liveClient.authSubject,
      communityId: params.communityId as any,
      ...(params.channelId ? { channelId: params.channelId as any } : null),
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
    type?: CommunityActivityEventType;
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
      ...(params.type ? { type: params.type } : null),
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
    channelId?: string | null;
    rootId?: string | null;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("communityChat:setCommunityTyping" as any, {
    authSubject,
    communityId: params.communityId,
    ...(params.channelId ? { channelId: params.channelId } : null),
    rootId: params.rootId ?? undefined,
  });
}

export async function clearCloudCommunityTyping<SessionT>(
  params: CloudCommunityChatGatewayParams<SessionT> & {
    communityId: string;
    channelId?: string | null;
    rootId?: string | null;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("communityChat:clearCommunityTyping" as any, {
    authSubject,
    communityId: params.communityId,
    ...(params.channelId ? { channelId: params.channelId } : null),
    rootId: params.rootId ?? undefined,
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
