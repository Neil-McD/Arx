import type { ConvexReactClient } from "convex/react";
import { api } from "../convex/_generated/api";
import { bootstrapConvexAuthenticatedClient, requireConvexUrl } from "./convexAuthenticatedClient";
import {
  acquireAuthenticatedConvexRealtimeClient,
  type ConvexRealtimeEnsureSession,
} from "./convexRealtimeAuth";
import type { CommunityActivityEventType } from "./communityTypes";
import { resolveConvexRuntimeToken, type AuthSessionLike } from "./authSession";
import { readConvexRuntimeUrl } from "./convexRuntime";
import { COMMUNITY_ATTACHMENT_DOWNLOAD_PATH, COMMUNITY_ATTACHMENT_UPLOAD_PATH } from "./communityAttachmentPolicy";

type CloudCommunityChatGatewayParams<SessionT> = {
  session: SessionT;
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

export async function uploadCloudCommunityChatAttachmentFile<SessionT>(
  params: CloudCommunityChatGatewayParams<SessionT> & {
    communityId: string;
    channelId?: string | null;
    rootId?: string | null;
    messageKey: string;
    file: File;
  },
): Promise<{ attachmentId: string; name: string; mime: string; size: number; type: "image" | "video" | "file" }> {
  await bootstrapConvexAuthenticatedClient(params.session);
  const token = resolveConvexRuntimeToken(params.session as AuthSessionLike);
  const baseUrl = String(readConvexRuntimeUrl() ?? "").replace(/\/+$/, "");
  if (!token || !baseUrl) throw new Error("Failed to start community attachment upload.");
  const response = await fetch(`${baseUrl}${COMMUNITY_ATTACHMENT_UPLOAD_PATH}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": params.file.type || "application/octet-stream",
      "X-Polynet-Community-Id": params.communityId,
      ...(params.channelId ? { "X-Polynet-Channel-Id": params.channelId } : {}),
      ...(params.rootId ? { "X-Polynet-Root-Id": params.rootId } : {}),
      "X-Polynet-Message-Key": params.messageKey,
      "X-Polynet-File-Name": encodeURIComponent(params.file.name),
    },
    body: params.file,
  });
  if (!response.ok) {
    throw new Error("Failed to upload attachment.");
  }
  const payload = await response.json();
  if (!payload?.attachment?.attachmentId) {
    throw new Error("Failed to upload attachment.");
  }
  return payload.attachment;
}

export async function downloadCloudCommunityChatAttachment<SessionT>(params: {
  session: SessionT; attachmentId: string; signal?: AbortSignal;
  /** Give up when no bytes arrive for this long (a body that stalls after its
   *  headers), while a slow download that keeps moving carries on. */
  idleTimeoutMs?: number;
}): Promise<Blob> {
  await bootstrapConvexAuthenticatedClient(params.session);
  const token = resolveConvexRuntimeToken(params.session as AuthSessionLike);
  const baseUrl = String(readConvexRuntimeUrl() ?? "").replace(/\/+$/, "");
  if (!token || !baseUrl) throw new Error("Sign in to open this attachment.");
  const idle = params.idleTimeoutMs ? new AbortController() : null;
  const abortIdle = () => idle?.abort(new Error("attachment_download_idle"));
  params.signal?.addEventListener("abort", abortIdle, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const kick = () => {
    if (!idle) return;
    clearTimeout(timer);
    timer = setTimeout(abortIdle, params.idleTimeoutMs);
  };
  try {
    kick();
    const response = await fetch(`${baseUrl}${COMMUNITY_ATTACHMENT_DOWNLOAD_PATH}`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "X-Polynet-Attachment-Id": params.attachmentId },
      signal: idle?.signal ?? params.signal,
    });
    if (!response.ok) throw new Error("This attachment is unavailable or you no longer have access.");
    if (!idle || !response.body) return await response.blob();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      kick();
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    return new Blob(chunks as BlobPart[], { type: response.headers.get("content-type") ?? "" });
  } finally {
    clearTimeout(timer);
    params.signal?.removeEventListener("abort", abortIdle);
  }
}
