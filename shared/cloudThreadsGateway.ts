import { type CloudAuthSession } from "./cloudAuthSession";
import { bootstrapConvexAuthenticatedClient, type ConvexClient } from "./convexAuthenticatedClient";

export type CloudThreadRecordInput = {
  threadId: string;
  title?: string | null;
  engineId?: string | null;
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

async function bootstrapConvexOwnerContext(session: CloudAuthSession): Promise<{
  client: ConvexClient;
  authSubject: string;
}> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return { client, authSubject };
}

async function bootstrapConvexOwnerContextIfAvailable(session: CloudAuthSession): Promise<{
  client: ConvexClient;
  authSubject: string;
} | null> {
  try {
    return await bootstrapConvexOwnerContext(session);
  } catch (error) {
    const message = String(error ?? "");
    if (message.includes("convex_url_required")) return null;
    throw error;
  }
}

function readConvexIdMaybe(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (/^[a-zA-Z0-9_-]{10,}$/.test(value)) return value;
  return null;
}

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
  session: CloudAuthSession;
  thread: CloudThreadRecordInput;
  nowMs?: number;
}): Promise<void> {
  const bootstrapped = await bootstrapConvexOwnerContextIfAvailable(params.session);
  if (!bootstrapped) return;
  const { client, authSubject } = bootstrapped;
  const threadId = String(params.thread.threadId ?? "").trim();
  if (!threadId) return;
  const maybeProjectId = readConvexIdMaybe(params.thread.projectId);
  await client.mutation("threads:ensureCloudThread" as any, {
    authSubject,
    threadKey: threadId,
    title: typeof params.thread.title === "string" ? params.thread.title.trim() || undefined : undefined,
    titleSource: "auto",
    engineId: String(params.thread.engineId ?? "").trim() || undefined,
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
  session: CloudAuthSession;
  thread: CloudThreadRecordInput;
  nowMs?: number;
}): Promise<void> {
  const bootstrapped = await bootstrapConvexOwnerContextIfAvailable(params.session);
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
  const maybeProjectId = readConvexIdMaybe(params.thread.projectId);
  await client.mutation("threads:updateCloudThread" as any, {
    authSubject,
    threadId: internalThreadId,
    title: typeof params.thread.title === "string" ? params.thread.title.trim() || undefined : undefined,
    titleSource: "auto",
    modelId: String(params.thread.modelId ?? "").trim() || undefined,
    engineId: String(params.thread.engineId ?? "").trim() || undefined,
    projectId: maybeProjectId ?? undefined,
    communityId: String(params.thread.communityId ?? "").trim() || undefined,
    contextVersion:
      typeof params.thread.contextVersion === "number" && Number.isFinite(params.thread.contextVersion)
        ? Math.max(0, Math.floor(params.thread.contextVersion))
        : undefined,
    nowMs: params.nowMs ?? Date.now(),
  });
}

export async function addCloudThreadMessage(params: {
  session: CloudAuthSession;
  message: CloudThreadMessageInput;
  nowMs?: number;
}): Promise<void> {
  const bootstrapped = await bootstrapConvexOwnerContextIfAvailable(params.session);
  if (!bootstrapped) return;
  const { client, authSubject } = bootstrapped;
  const threadKey = String(params.message.threadId ?? "").trim();
  if (!threadKey) return;
  await ensureCloudThreadRecord({
    session: params.session,
    thread: {
      threadId: threadKey,
      engineId: params.message.engineId ?? null,
      modelId: params.message.modelId ?? null,
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

export async function deleteCloudThreadMessage(params: {
  session: CloudAuthSession;
  threadId: string;
  messageId: string;
  nowMs?: number;
}): Promise<void> {
  const bootstrapped = await bootstrapConvexOwnerContextIfAvailable(params.session);
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
  session: CloudAuthSession;
  threadId: string;
  nowMs?: number;
}): Promise<void> {
  const bootstrapped = await bootstrapConvexOwnerContextIfAvailable(params.session);
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
