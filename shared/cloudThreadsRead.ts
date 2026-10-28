import { type AuthSessionLike } from "./authSession";
import {
  bootstrapConvexAuthenticatedClient,
  type ConvexClient,
} from "./convexAuthenticatedClient";

type ConvexThreadRow = {
  _id?: string | null;
};

type ConvexMessageRow = {
  _id?: string | null;
  threadId?: string | null;
  messageKey?: string | null;
  seq?: number | null;
  role?: string | null;
  contentJson?: unknown;
  engineId?: string | null;
  modelId?: string | null;
  runId?: string | null;
  createdAt?: number | null;
};

type ConvexRuntimeRunRow = {
  _id?: string | null;
  runId?: string | null;
  threadId?: string | null;
  status?: string | null;
  visibility?: string | null;
  internalFollowupKind?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  startedAt?: number | null;
  updatedAt?: number | null;
  lastEventSeq?: number | null;
};

export type CloudMessageTransportRow = {
  id: string;
  thread_id: string;
  seq: number;
  role: string;
  content_json: unknown;
  engine_id: string | null;
  model_id: string | null;
  run_id: string | null;
  created_at: string;
};

export type CloudRuntimeRunTransportRow = {
  id: string;
  run_id: string;
  thread_id: string | null;
  status: string | null;
  error_code: string | null;
  error_message: string | null;
  started_at: string;
  updated_at: string;
  last_event_seq: number;
};

export type CloudRuntimeRunEventTransportRow = {
  id: string;
  run_id: string;
  seq: number;
  event_type: string;
  payload: unknown;
  created_at: string;
};

async function bootstrapConvexOwnerId(session: AuthSessionLike): Promise<{
  client: ConvexClient;
  authSubject: string;
} | null> {
  try {
    const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
    return { client, authSubject };
  } catch {
    return null;
  }
}

function toIsoStringFromMs(value: unknown): string {
  const ms = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : Date.now();
  return new Date(ms).toISOString();
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function mapConvexMessageRow(
  row: ConvexMessageRow,
  threadKey: string,
): CloudMessageTransportRow | null {
  const id = String(row.messageKey ?? "").trim() || String(row._id ?? "").trim();
  if (!id) return null;
  const seq = Math.max(0, Math.floor(toFiniteNumber(row.seq, 0)));
  const role = String(row.role ?? "").trim().toLowerCase();
  if (role !== "user" && role !== "assistant" && role !== "system") return null;
  return {
    id,
    thread_id: threadKey,
    seq,
    role,
    content_json: row.contentJson ?? { text: "" },
    engine_id: typeof row.engineId === "string" ? row.engineId : null,
    model_id: typeof row.modelId === "string" ? row.modelId : null,
    run_id: typeof row.runId === "string" ? row.runId : null,
    created_at: toIsoStringFromMs(row.createdAt),
  };
}

function mapConvexRuntimeRunRow(row: ConvexRuntimeRunRow): CloudRuntimeRunTransportRow | null {
  if (!row) return null;
  const id = String(row._id ?? "").trim() || String(row.runId ?? "").trim();
  const runId = String(row.runId ?? "").trim();
  if (!id || !runId) return null;
  return {
    id,
    run_id: runId,
    thread_id: typeof row.threadId === "string" ? row.threadId : null,
    status: typeof row.status === "string" ? row.status : null,
    error_code: typeof row.errorCode === "string" ? row.errorCode : null,
    error_message: typeof row.errorMessage === "string" ? row.errorMessage : null,
    started_at: toIsoStringFromMs(row.startedAt),
    updated_at: toIsoStringFromMs(row.updatedAt),
    last_event_seq: Math.max(0, Math.floor(toFiniteNumber(row.lastEventSeq, 0))),
  };
}

export async function listConvexCloudNewestThreadMessagesByThreadKey(params: {
  session: AuthSessionLike;
  threadKey: string;
  limit?: number;
}): Promise<CloudMessageTransportRow[] | null> {
  const bootstrapped = await bootstrapConvexOwnerId(params.session);
  if (!bootstrapped) return null;
  const { client, authSubject } = bootstrapped;
  const threadKey = String(params.threadKey ?? "").trim();
  if (!threadKey) return [];

  const thread = (await client.query("threads:getCloudThreadByThreadKey" as any, {
    authSubject,
    threadKey,
  })) as ConvexThreadRow | null;
  const internalThreadId = String(thread?._id ?? "").trim();
  if (!internalThreadId) return [];

  const limit = Math.max(1, Math.min(1000, Math.floor(params.limit ?? 200)));
  const rows = (await client.query("threads:listNewestCloudThreadMessages" as any, {
    authSubject,
    threadId: internalThreadId,
    limit,
  })) as ConvexMessageRow[];
  return rows
    .map((row) => mapConvexMessageRow(row, threadKey))
    .filter((row): row is CloudMessageTransportRow => Boolean(row));
}

export async function getConvexCloudRuntimeRunByRunId(params: {
  session: AuthSessionLike;
  runId: string;
  threadId?: string;
}): Promise<CloudRuntimeRunTransportRow | null> {
  const bootstrapped = await bootstrapConvexOwnerId(params.session);
  if (!bootstrapped) return null;
  const { client, authSubject } = bootstrapped;
  const runId = String(params.runId ?? "").trim();
  if (!runId) return null;
  const row = (await client.query("threads:getCloudRuntimeRunByOwnerRunId" as any, {
    authSubject,
    runId,
    ...(typeof params.threadId === "string" && params.threadId.trim()
      ? { threadId: params.threadId.trim() }
      : null),
  })) as ConvexRuntimeRunRow | null;
  if (!row) return null;
  return mapConvexRuntimeRunRow(row);
}
