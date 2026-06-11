import { type AuthSessionLike } from "./authSession";
import { type ConvexClient } from "./convexAuthenticatedClient";
import {
  bootstrapGatewayAuthContextIfAvailable,
  readGatewayConvexIdMaybe,
} from "./cloudGateway";

export type CloudThreadRecordInput = {
  threadId: string;
  title?: string | null;
  modelId?: string | null;
  projectId?: string | null;
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
  const maybeProjectId = readGatewayConvexIdMaybe(params.thread.projectId);
  await client.mutation("threads:ensureCloudThread" as any, {
    authSubject,
    threadKey: threadId,
    title: typeof params.thread.title === "string" ? params.thread.title.trim() || undefined : undefined,
    titleSource: "auto",
    modelId: String(params.thread.modelId ?? "").trim() || undefined,
    projectId: maybeProjectId ?? undefined,
    communityId: String(params.thread.communityId ?? "").trim() || undefined,
    contextVersion:
      typeof params.thread.contextVersion === "number" && Number.isFinite(params.thread.contextVersion)
        ? Math.max(0, Math.floor(params.thread.contextVersion))
        : undefined,
    nowMs: params.nowMs ?? Date.now(),
  });
}

export async function updateCloudThreadRecord(params: {
  session: AuthSessionLike;
  thread: Omit<CloudThreadRecordInput, "communityId" | "contextVersion">;
  nowMs?: number;
}): Promise<void> {
  const bootstrapped = await bootstrapGatewayAuthContextIfAvailable(params.session);
  if (!bootstrapped) return;
  const { client, authSubject } = bootstrapped;
  const threadKey = String(params.thread.threadId ?? "").trim();
  if (!threadKey) return;
  const internalThreadId = await resolveInternalThreadId({
    client,
    authSubject,
    threadKey,
  });
  if (!internalThreadId) {
    await ensureCloudThreadRecord({
      session: params.session,
      thread: params.thread,
      nowMs: params.nowMs,
    });
    return;
  }
  const maybeProjectId = readGatewayConvexIdMaybe(params.thread.projectId);
  await client.mutation("threads:updateCloudThread" as any, {
    authSubject,
    threadId: internalThreadId,
    title: typeof params.thread.title === "string" ? params.thread.title.trim() || undefined : undefined,
    titleSource: "auto",
    modelId: String(params.thread.modelId ?? "").trim() || undefined,
    projectId: maybeProjectId ?? undefined,
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
      typeof params.message.seq === "number" &&
      Number.isFinite(params.message.seq) &&
      Math.floor(params.message.seq) > 0
        ? Math.floor(params.message.seq)
        : undefined,
    role: params.message.role,
    contentJson: params.message.contentJson,
    engineId: String(params.message.engineId ?? "").trim() || undefined,
    modelId: String(params.message.modelId ?? "").trim() || undefined,
    runId: String(params.message.runId ?? "").trim() || undefined,
    nowMs: params.nowMs ?? Date.now(),
  });
}

export async function requestCloudThreadAttachmentUploadUrl(params: {
  session: AuthSessionLike;
  threadId: string;
}): Promise<string> {
  const bootstrapped = await bootstrapGatewayAuthContextIfAvailable(params.session);
  if (!bootstrapped) throw new Error("Failed to start thread attachment upload.");
  const { client, authSubject } = bootstrapped;
  const threadKey = String(params.threadId ?? "").trim();
  if (!threadKey) throw new Error("Failed to start thread attachment upload.");
  const internalThreadId = await resolveInternalThreadId({
    client,
    authSubject,
    threadKey,
  });
  if (!internalThreadId) throw new Error("Failed to start thread attachment upload.");
  const payload = (await client.mutation("threads:generateCloudThreadAttachmentUploadUrl" as any, {
    authSubject,
    threadId: internalThreadId,
  })) as { uploadUrl?: string | null } | null;
  const uploadUrl = String(payload?.uploadUrl ?? "").trim();
  if (!uploadUrl) throw new Error("Failed to start thread attachment upload.");
  return uploadUrl;
}

export async function uploadCloudThreadAttachmentFile(params: {
  session: AuthSessionLike;
  threadId: string;
  file: File | Blob;
}): Promise<string> {
  const uploadUrl = await requestCloudThreadAttachmentUploadUrl({
    session: params.session,
    threadId: params.threadId,
  });
  const contentType =
    params.file && typeof params.file === "object" && "type" in params.file
      ? String((params.file as File | Blob).type ?? "").trim() || "application/octet-stream"
      : "application/octet-stream";
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: params.file as BodyInit,
  });
  if (!response.ok) throw new Error("Failed to upload attachment.");
  const payload = (await response.json()) as { storageId?: string | null };
  const storageId = String(payload?.storageId ?? "").trim();
  if (!storageId) throw new Error("Failed to upload attachment.");
  return storageId;
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

export async function archiveCloudThreadRecord(params: {
  session: AuthSessionLike;
  threadId: string;
  nowMs?: number;
}): Promise<void> {
  const bootstrapped = await bootstrapGatewayAuthContextIfAvailable(params.session);
  if (!bootstrapped) return;
  const { client, authSubject } = bootstrapped;
  const threadKey = String(params.threadId ?? "").trim();
  if (!threadKey) return;
  const internalThreadId = await resolveInternalThreadId({
    client,
    authSubject,
    threadKey,
  });
  if (!internalThreadId) return;
  await client.mutation("threads:archiveCloudThread" as any, {
    authSubject,
    threadId: internalThreadId,
    nowMs: params.nowMs ?? Date.now(),
  });
}

export async function steerCloudRuntimeRunByThreadKey(params: {
  session: AuthSessionLike;
  threadId: string;
  runId?: string | null;
  text: string;
}): Promise<void> {
  const bootstrapped = await bootstrapGatewayAuthContextIfAvailable(params.session);
  if (!bootstrapped) return;
  const { client, authSubject } = bootstrapped;
  const threadKey = String(params.threadId ?? "").trim();
  const text = String(params.text ?? "").trim();
  if (!threadKey || !text) return;
  await client.mutation("threads:steerCloudRuntimeRunByThreadKey" as any, {
    authSubject,
    threadKey,
    runId: String(params.runId ?? "").trim() || undefined,
    text,
  });
}

export async function cancelCloudRuntimeRunByThreadKey(params: {
  session: AuthSessionLike;
  threadId: string;
  runId?: string | null;
  nowMs?: number;
}): Promise<void> {
  const bootstrapped = await bootstrapGatewayAuthContextIfAvailable(params.session);
  if (!bootstrapped) return;
  const { client, authSubject } = bootstrapped;
  const threadKey = String(params.threadId ?? "").trim();
  if (!threadKey) return;
  await client.mutation("threads:cancelCloudRuntimeRunByThreadKey" as any, {
    authSubject,
    threadKey,
    runId: String(params.runId ?? "").trim() || undefined,
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
