import { type CloudAuthSession } from "./cloudAuthSession";
import {
  bootstrapConvexAuthenticatedClient,
  hasConvexUrl,
  type ConvexClient,
} from "./convexAuthenticatedClient";

type ConvexThreadRow = {
  _id?: string | null;
  context?: string | null;
  threadKey?: string | null;
  title?: string | null;
  modelId?: string | null;
  projectId?: string | null;
  communityId?: string | null;
  contextVersion?: number | null;
  lastSeq?: number | null;
  createdAt?: number | null;
  updatedAt?: number | null;
  archivedAt?: number | null;
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
  requestedExecutionTarget?: string | null;
  requiresWorkspaceTools?: boolean | null;
  startedAt?: number | null;
  updatedAt?: number | null;
  lastEventSeq?: number | null;
};

type ConvexRuntimeRunEventRow = {
  _id?: string | null;
  runId?: string | null;
  seq?: number | null;
  eventType?: string | null;
  payload?: unknown;
  createdAt?: number | null;
};

export type DaytonaCloudThreadTransportRow = {
  id: string;
  title: string | null;
  model_id: string | null;
  project_id: string | null;
  community_id: string | null;
  context_version: number;
  created_at: string;
  updated_at: string;
  last_seq: number;
};

export type DaytonaCloudMessageTransportRow = {
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

export type DaytonaCloudRuntimeRunTransportRow = {
  id: string;
  run_id: string;
  thread_id: string | null;
  status: string | null;
  requires_workspace_tools: boolean;
  started_at: string;
  updated_at: string;
  last_event_seq: number;
};

export type DaytonaCloudRuntimeRunEventTransportRow = {
  id: string;
  run_id: string;
  seq: number;
  event_type: string;
  payload: unknown;
  created_at: string;
};

export function isConvexCloudThreadsEnabled(): boolean {
  return hasConvexUrl();
}

async function bootstrapConvexOwnerId(session: CloudAuthSession): Promise<{
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

function mapConvexThreadRow(row: ConvexThreadRow): DaytonaCloudThreadTransportRow | null {
  if (!row) return null;
  if (typeof row.archivedAt === "number" && Number.isFinite(row.archivedAt)) return null;
  const id = String(row.threadKey ?? "").trim() || String(row._id ?? "").trim();
  if (!id) return null;
  return {
    id,
    title: typeof row.title === "string" ? row.title : null,
    model_id: typeof row.modelId === "string" ? row.modelId : null,
    project_id: typeof row.projectId === "string" ? row.projectId : null,
    community_id: typeof row.communityId === "string" ? row.communityId : null,
    context_version: Math.max(0, Math.floor(toFiniteNumber(row.contextVersion, 0))),
    created_at: toIsoStringFromMs(row.createdAt),
    updated_at: toIsoStringFromMs(row.updatedAt),
    last_seq: Math.max(0, Math.floor(toFiniteNumber(row.lastSeq, 0))),
  };
}

function mapConvexMessageRow(
  row: ConvexMessageRow,
  threadKey: string,
): DaytonaCloudMessageTransportRow | null {
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

function mapConvexRuntimeRunRow(row: ConvexRuntimeRunRow): DaytonaCloudRuntimeRunTransportRow | null {
  if (!row) return null;
  const id = String(row._id ?? "").trim() || String(row.runId ?? "").trim();
  const runId = String(row.runId ?? "").trim();
  if (!id || !runId) return null;
  const requiresWorkspaceTools =
    typeof row.requiresWorkspaceTools === "boolean"
      ? row.requiresWorkspaceTools
      : row.requestedExecutionTarget === "daytona_workspace";
  return {
    id,
    run_id: runId,
    thread_id: typeof row.threadId === "string" ? row.threadId : null,
    status: typeof row.status === "string" ? row.status : null,
    requires_workspace_tools: requiresWorkspaceTools,
    started_at: toIsoStringFromMs(row.startedAt),
    updated_at: toIsoStringFromMs(row.updatedAt),
    last_event_seq: Math.max(0, Math.floor(toFiniteNumber(row.lastEventSeq, 0))),
  };
}

function mapConvexRuntimeRunEventRow(
  row: ConvexRuntimeRunEventRow,
): DaytonaCloudRuntimeRunEventTransportRow | null {
  const id = String(row._id ?? "").trim();
  const runId = String(row.runId ?? "").trim();
  const eventType = String(row.eventType ?? "").trim();
  if (!id || !runId || !eventType) return null;
  return {
    id,
    run_id: runId,
    seq: Math.max(0, Math.floor(toFiniteNumber(row.seq, 0))),
    event_type: eventType,
    payload: row.payload ?? null,
    created_at: toIsoStringFromMs(row.createdAt),
  };
}

export async function listConvexCloudThreadRows(
  session: CloudAuthSession,
): Promise<DaytonaCloudThreadTransportRow[] | null> {
  const bootstrapped = await bootstrapConvexOwnerId(session);
  if (!bootstrapped) return null;
  const { client, authSubject } = bootstrapped;
  const rows = (await client.query("threads:listCloudThreadsByOwner" as any, {
    authSubject,
    includeArchived: false,
  })) as ConvexThreadRow[];
  return rows
    .map((row) => mapConvexThreadRow(row))
    .filter((row): row is DaytonaCloudThreadTransportRow => Boolean(row))
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
}

export async function getConvexCloudThreadRowByThreadKey(params: {
  session: CloudAuthSession;
  threadKey: string;
}): Promise<DaytonaCloudThreadTransportRow | null> {
  const bootstrapped = await bootstrapConvexOwnerId(params.session);
  if (!bootstrapped) return null;
  const { client, authSubject } = bootstrapped;
  const key = String(params.threadKey ?? "").trim();
  if (!key) return null;
  const row = (await client.query("threads:getCloudThreadByThreadKey" as any, {
    authSubject,
    threadKey: key,
  })) as ConvexThreadRow | null;
  if (!row) return null;
  return mapConvexThreadRow(row);
}

export async function listConvexCloudThreadMessagesPageByThreadKey(params: {
  session: CloudAuthSession;
  threadKey: string;
  pageSize: number;
  beforeSeq?: number;
  maxScan?: number;
}): Promise<DaytonaCloudMessageTransportRow[] | null> {
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

  const maxScan = Math.max(1, Math.min(10_000, Math.floor(params.maxScan ?? 2000)));
  const scanned = (await client.query("threads:listCloudThreadMessages" as any, {
    authSubject,
    threadId: internalThreadId,
    limit: maxScan,
  })) as ConvexMessageRow[];

  const beforeSeq =
    typeof params.beforeSeq === "number" && Number.isFinite(params.beforeSeq)
      ? Math.floor(params.beforeSeq)
      : null;
  const filtered = beforeSeq === null ? scanned : scanned.filter((row) => toFiniteNumber(row.seq, -1) < beforeSeq);
  const pageSize = Math.max(1, Math.min(5000, Math.floor(params.pageSize)));
  const page = filtered.slice(Math.max(0, filtered.length - pageSize));

  return page
    .map((row) => mapConvexMessageRow(row, threadKey))
    .filter((row): row is DaytonaCloudMessageTransportRow => Boolean(row));
}

export async function listConvexCloudThreadMessagesByThreadKey(params: {
  session: CloudAuthSession;
  threadKey: string;
  limit?: number;
}): Promise<DaytonaCloudMessageTransportRow[] | null> {
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

  const targetLimit = Math.max(1, Math.min(10_000, Math.floor(params.limit ?? 10_000)));
  const rows: DaytonaCloudMessageTransportRow[] = [];
  let afterSeq: number | undefined;
  while (rows.length < targetLimit) {
    const batchLimit = Math.max(1, Math.min(2_000, targetLimit - rows.length));
    const batch = (await client.query("threads:listCloudThreadMessages" as any, {
      authSubject,
      threadId: internalThreadId,
      limit: batchLimit,
      ...(typeof afterSeq === "number" ? { afterSeq } : null),
    })) as ConvexMessageRow[];
    if (!Array.isArray(batch) || batch.length === 0) break;

    let maxSeq = Number.NEGATIVE_INFINITY;
    for (const row of batch) {
      const mapped = mapConvexMessageRow(row, threadKey);
      if (mapped) rows.push(mapped);
      maxSeq = Math.max(maxSeq, toFiniteNumber(row.seq, Number.NEGATIVE_INFINITY));
      if (rows.length >= targetLimit) break;
    }

    if (batch.length < batchLimit) break;
    if (!Number.isFinite(maxSeq) || maxSeq < 0) break;
    if (typeof afterSeq === "number" && maxSeq <= afterSeq) break;
    afterSeq = Math.floor(maxSeq);
  }

  return rows;
}

export async function getConvexCloudRunningRuntimeRunByThreadKey(params: {
  session: CloudAuthSession;
  threadKey: string;
}): Promise<DaytonaCloudRuntimeRunTransportRow | null> {
  const bootstrapped = await bootstrapConvexOwnerId(params.session);
  if (!bootstrapped) return null;
  const { client, authSubject } = bootstrapped;
  const threadKey = String(params.threadKey ?? "").trim();
  if (!threadKey) return null;
  const row = (await client.query("threads:getCloudRunningRuntimeRunByThreadKey" as any, {
    authSubject,
    threadKey,
  })) as ConvexRuntimeRunRow | null;
  if (!row) return null;
  return mapConvexRuntimeRunRow(row);
}

export async function listConvexCloudRuntimeRunEvents(params: {
  session: CloudAuthSession;
  runId: string;
  threadId?: string;
  afterSeq?: number;
  limit?: number;
}): Promise<DaytonaCloudRuntimeRunEventTransportRow[] | null> {
  const bootstrapped = await bootstrapConvexOwnerId(params.session);
  if (!bootstrapped) return null;
  const { client, authSubject } = bootstrapped;
  const runId = String(params.runId ?? "").trim();
  if (!runId) return [];
  const rows = (await client.query("threads:listCloudRuntimeRunEvents" as any, {
    authSubject,
    runId,
    ...(typeof params.threadId === "string" && params.threadId.trim() ? { threadId: params.threadId } : null),
    ...(typeof params.afterSeq === "number" && Number.isFinite(params.afterSeq)
      ? { afterSeq: Math.max(0, Math.floor(params.afterSeq)) }
      : null),
    limit: Math.max(1, Math.min(500, Math.floor(params.limit ?? 200))),
  })) as ConvexRuntimeRunEventRow[];
  return (rows ?? [])
    .map((row) => mapConvexRuntimeRunEventRow(row))
    .filter((row): row is DaytonaCloudRuntimeRunEventTransportRow => Boolean(row));
}
