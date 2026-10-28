import { type AuthSessionLike } from "./authSession";
import { resolveConvexRuntimeToken } from "./authSession";
import { type ConvexClient } from "./convexAuthenticatedClient";
import { readConvexRuntimeUrl } from "./convexRuntime";
import { bootstrapGatewayAuthContextIfAvailable } from "./cloudGateway";
import {
  COMMUNITY_AGENT_ATTACHMENT_UPLOAD_PATH,
  type CommunityAgentImageAttachment,
} from "./communityAgentAttachments";

export type CloudThreadRecordInput = {
  threadId: string;
  title?: string | null;
  modelId?: string | null;
  communityId?: string | null;
  contextVersion?: number | null;
};

export type CloudThreadMessageInput = {
  threadId: string;
  messageId?: string | null;
  seq?: number | null;
  role: "user" | "assistant" | "system";
  contentJson: unknown;
  engineId?: string | null;
  modelId?: string | null;
  runId?: string | null;
};

// Gateway class: authenticated mutation bridge with optional fail-soft behavior when Convex is unavailable locally.

async function resolveInternalThreadId(params: {
  client: ConvexClient;
  authSubject: string;
  threadKey: string;
}): Promise<string | null> {
  const row = (await params.client.query("threads:getCloudThreadByThreadKey" as any, {
    authSubject: params.authSubject,
    threadKey: params.threadKey,
  })) as { _id?: string | null } | null;
  return String(row?._id ?? "").trim() || null;
}

export async function ensureCloudThreadRecord(params: {
  session: AuthSessionLike;
  thread: CloudThreadRecordInput;
  nowMs?: number;
}): Promise<void> {
  const bootstrapped = await bootstrapGatewayAuthContextIfAvailable(params.session);
  if (!bootstrapped) return;
  const { client, authSubject } = bootstrapped;
  const threadId = String(params.thread.threadId ?? "").trim();
  if (!threadId) return;
  await client.mutation("threads:ensureCloudThread" as any, {
    authSubject,
    threadKey: threadId,
    title: typeof params.thread.title === "string" ? params.thread.title.trim() || undefined : undefined,
    titleSource: "auto",
    modelId: String(params.thread.modelId ?? "").trim() || undefined,
    communityId: String(params.thread.communityId ?? "").trim() || undefined,
    contextVersion:
      typeof params.thread.contextVersion === "number" && Number.isFinite(params.thread.contextVersion)
        ? Math.max(0, Math.floor(params.thread.contextVersion))
        : undefined,
    nowMs: params.nowMs ?? Date.now(),
  });
}

export async function addCloudThreadMessage(params: {
  session: AuthSessionLike;
  message: CloudThreadMessageInput;
  nowMs?: number;
}): Promise<void> {
  const bootstrapped = await bootstrapGatewayAuthContextIfAvailable(params.session);
  if (!bootstrapped) return;
  const { client, authSubject } = bootstrapped;
  const threadKey = String(params.message.threadId ?? "").trim();
  if (!threadKey) return;
  await ensureCloudThreadRecord({
    session: params.session,
    thread: {
      threadId: threadKey,
    },
    nowMs: params.nowMs,
  });
  const internalThreadId = await resolveInternalThreadId({
    client,
    authSubject,
    threadKey,
  });
  if (!internalThreadId) return;
  await client.mutation("threads:addCloudThreadMessage" as any, {
    authSubject,
    threadId: internalThreadId,
    messageKey: String(params.message.messageId ?? "").trim() || undefined,
    seq:
      typeof params.message.seq === "number" && Number.isFinite(params.message.seq)
        ? Math.max(0, Math.floor(params.message.seq))
        : undefined,
    role: params.message.role,
    contentJson: params.message.contentJson,
    engineId: String(params.message.engineId ?? "").trim() || undefined,
    modelId: String(params.message.modelId ?? "").trim() || undefined,
    runId: String(params.message.runId ?? "").trim() || undefined,
    nowMs: params.nowMs ?? Date.now(),
  });
}

export async function uploadCloudCommunityAgentImageFile(params: {
  session: AuthSessionLike;
  threadId: string;
  messageId: string;
  file: File;
}): Promise<CommunityAgentImageAttachment> {
  const bootstrapped = await bootstrapGatewayAuthContextIfAvailable(params.session);
  if (!bootstrapped) throw new Error("Failed to start image upload.");
  const { client, authSubject } = bootstrapped;
  const threadKey = String(params.threadId ?? "").trim();
  const internalThreadId = await resolveInternalThreadId({
    client,
    authSubject,
    threadKey,
  });
  if (!internalThreadId) throw new Error("Failed to start image upload.");
  const runtimeToken = resolveConvexRuntimeToken(params.session);
  const runtimeBaseUrl = String(readConvexRuntimeUrl() ?? "").replace(/\/+$/, "");
  const messageKey = String(params.messageId ?? "").trim();
  if (!runtimeToken || !runtimeBaseUrl || !messageKey) {
    throw new Error("Failed to start image upload.");
  }
  const response = await fetch(`${runtimeBaseUrl}${COMMUNITY_AGENT_ATTACHMENT_UPLOAD_PATH}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${runtimeToken}`,
      "Content-Type": params.file.type || "application/octet-stream",
      "X-Polynet-Thread-Id": internalThreadId,
      "X-Polynet-Message-Key": messageKey,
      "X-Polynet-File-Name": encodeURIComponent(params.file.name),
    },
    body: params.file,
  });
  if (!response.ok) throw new Error("Failed to upload image.");
  const payload = (await response.json()) as {
    attachment?: {
    storageId?: string | null;
    name?: string | null;
    mime?: string | null;
    size?: number | null;
    } | null;
  } | null;
  const attachment = payload?.attachment ?? null;
  const claimedStorageId = String(attachment?.storageId ?? "").trim();
  const mime = String(attachment?.mime ?? "").trim();
  const size = Number(attachment?.size);
  if (!claimedStorageId || !mime || !Number.isFinite(size) || size <= 0) {
    throw new Error("Failed to verify image upload.");
  }
  return {
    id: crypto.randomUUID(),
    name: String(attachment?.name ?? params.file.name).trim() || "image",
    type: "image",
    mime,
    size: Math.floor(size),
    storage_id: claimedStorageId,
  };
}

export async function deleteCloudThreadMessage(params: {
  session: AuthSessionLike;
  threadId: string;
  messageId: string;
  nowMs?: number;
}): Promise<void> {
  const bootstrapped = await bootstrapGatewayAuthContextIfAvailable(params.session);
  if (!bootstrapped) return;
  const { client, authSubject } = bootstrapped;
  const threadKey = String(params.threadId ?? "").trim();
  if (!threadKey) return;
  const messageKey = String(params.messageId ?? "").trim();
  if (!messageKey) return;
  const internalThreadId = await resolveInternalThreadId({
    client,
    authSubject,
    threadKey,
  });
  if (!internalThreadId) return;
  await client.mutation("threads:deleteCloudThreadMessage" as any, {
    authSubject,
    threadId: internalThreadId,
    messageKey,
    nowMs: params.nowMs ?? Date.now(),
  });
}

export async function markCloudThreadAgentAttentionSeen(params: {
  session: AuthSessionLike;
  threadId: string;
  nowMs?: number;
}): Promise<void> {
  const bootstrapped = await bootstrapGatewayAuthContextIfAvailable(params.session);
  if (!bootstrapped) return;
  const { client, authSubject } = bootstrapped;
  const threadKey = String(params.threadId ?? "").trim();
  if (!threadKey) return;
  await client.mutation("threads:markCloudThreadAgentAttentionSeen" as any, {
    authSubject,
    threadKey,
    nowMs: params.nowMs ?? Date.now(),
  });
}
