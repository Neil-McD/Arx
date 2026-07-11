import { type AuthSessionLike } from "./authSession";
import {
  bootstrapConvexAuthenticatedClient,
  hasConvexUrl,
  type ConvexClient,
} from "./convexAuthenticatedClient";
import {
  normalizeRuntimeEngine,
  type RuntimeEngine,
} from "./runtimeEngine";

type ConvexThreadRow = {
  _id?: string | null;
  context?: string | null;
  threadKey?: string | null;
  title?: string | null;
  modelId?: string | null;
  runtimeEngine?: string | null;
  projectId?: string | null;
  communityId?: string | null;
  contextVersion?: number | null;
  latestUserVisibleCompletedRunId?: string | null;
  lastSeenUserVisibleCompletedRunId?: string | null;
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
  visibility?: string | null;
  internalFollowupKind?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
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

export type CloudThreadTransportRow = {
  id: string;
  title: string | null;
  model_id: string | null;
  runtime_engine: RuntimeEngine | null;
  project_id: string | null;
  community_id: string | null;
  context_version: number;
  agent_attention: boolean;
  created_at: string;
  updated_at: string;
  last_seq: number;
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

export type CloudRuntimeComputerUseLiveSession = {
  preview_proxy_token: string;
  expires_at: string;
};

export type CloudRuntimeComputerUseLiveSessionDebug = {
  [key: string]: unknown;
};

export type CloudRuntimeComputerUseLiveSessionLookup =
  | {
      ok: true;
      session: CloudRuntimeComputerUseLiveSession;
      debug?: CloudRuntimeComputerUseLiveSessionDebug | null;
    }
  | {
      ok: false;
      code: string;
      retryable: boolean;
      debug?: CloudRuntimeComputerUseLiveSessionDebug | null;
    };

export type CloudRuntimeComputerUseScreenshot = {
  frame_url: string | null;
  frame_mime_type: string | null;
  frame_size_bytes: number | null;
  screenshot_method: string | null;
  screenshot_width: number | null;
  screenshot_height: number | null;
};

export type CloudRuntimeComputerUseScreenshotLookup =
  | {
      ok: true;
      screenshot: CloudRuntimeComputerUseScreenshot;
      debug?: CloudRuntimeComputerUseLiveSessionDebug | null;
    }
  | {
      ok: false;
      code: string;
      retryable: boolean;
      debug?: CloudRuntimeComputerUseLiveSessionDebug | null;
    };

export type CloudRuntimeDaytonaPreviewSession = {
  preview_proxy_token: string | null;
  preview_url: string | null;
  preview_port: number;
  preview_path: string | null;
  preview_label: string | null;
  expires_at: string;
  expires_in_seconds: number;
  auth_mode: string | null;
  preview_transport: "polynet_preview_gateway" | "daytona_signed_direct" | string | null;
};

export type CloudRuntimeDaytonaPreviewSessionLookup =
  | {
      ok: true;
      session: CloudRuntimeDaytonaPreviewSession;
    }
  | {
      ok: false;
      code: string;
      retryable: boolean;
    };

export type CloudRuntimeDaytonaPreviewStopResult =
  | {
      ok: true;
      stopped_preview_ports: number[];
      target_run_id: string | null;
      target_id: string | null;
      sandbox_id: string | null;
      teardown_state: string | null;
    }
  | {
      ok: false;
      code: string;
      retryable: boolean;
      message: string | null;
    };

export function isConvexCloudThreadsEnabled(): boolean {
  return hasConvexUrl();
}

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

function mapConvexThreadRow(row: ConvexThreadRow): CloudThreadTransportRow | null {
  if (!row) return null;
  if (typeof row.archivedAt === "number" && Number.isFinite(row.archivedAt)) return null;
  const id = String(row.threadKey ?? "").trim() || String(row._id ?? "").trim();
  if (!id) return null;
  return {
    id,
    title: typeof row.title === "string" ? row.title : null,
    model_id: typeof row.modelId === "string" ? row.modelId : null,
    runtime_engine: normalizeRuntimeEngine(row.runtimeEngine),
    project_id: typeof row.projectId === "string" ? row.projectId : null,
    community_id: typeof row.communityId === "string" ? row.communityId : null,
    context_version: Math.max(0, Math.floor(toFiniteNumber(row.contextVersion, 0))),
    agent_attention:
      String(row.latestUserVisibleCompletedRunId ?? "").trim().length > 0 &&
      String(row.latestUserVisibleCompletedRunId ?? "").trim() !==
        String(row.lastSeenUserVisibleCompletedRunId ?? "").trim(),
    created_at: toIsoStringFromMs(row.createdAt),
    updated_at: toIsoStringFromMs(row.updatedAt),
    last_seq: Math.max(0, Math.floor(toFiniteNumber(row.lastSeq, 0))),
  };
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

function mapConvexRuntimeRunEventRow(
  row: ConvexRuntimeRunEventRow,
): CloudRuntimeRunEventTransportRow | null {
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
  session: AuthSessionLike,
): Promise<CloudThreadTransportRow[] | null> {
  const bootstrapped = await bootstrapConvexOwnerId(session);
  if (!bootstrapped) return null;
  const { client, authSubject } = bootstrapped;
  const rows = (await client.query("threads:listCloudThreadsByOwner" as any, {
    authSubject,
    includeArchived: false,
  })) as ConvexThreadRow[];
  return rows
    .map((row) => mapConvexThreadRow(row))
    .filter((row): row is CloudThreadTransportRow => Boolean(row))
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
}

export async function getConvexCloudThreadRowByThreadKey(params: {
  session: AuthSessionLike;
  threadKey: string;
}): Promise<CloudThreadTransportRow | null> {
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
  session: AuthSessionLike;
  threadKey: string;
  pageSize: number;
  beforeSeq?: number;
  maxScan?: number;
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
    .filter((row): row is CloudMessageTransportRow => Boolean(row));
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

export async function listConvexCloudThreadMessagesByThreadKey(params: {
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

  const targetLimit = Math.max(1, Math.min(10_000, Math.floor(params.limit ?? 10_000)));
  const rows: CloudMessageTransportRow[] = [];
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
  session: AuthSessionLike;
  threadKey: string;
}): Promise<CloudRuntimeRunTransportRow | null> {
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

export async function listConvexCloudRuntimeRunEvents(params: {
  session: AuthSessionLike;
  runId: string;
  threadId?: string;
  afterSeq?: number;
  limit?: number;
}): Promise<CloudRuntimeRunEventTransportRow[] | null> {
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
    .filter((row): row is CloudRuntimeRunEventTransportRow => Boolean(row));
}

export async function getConvexCloudRuntimeRunComputerUseLiveSession(params: {
  session: AuthSessionLike;
  runId: string;
}): Promise<CloudRuntimeComputerUseLiveSessionLookup> {
  const bootstrapped = await bootstrapConvexOwnerId(params.session);
  if (!bootstrapped) {
    return {
      ok: false,
      code: "auth_unavailable",
      retryable: false,
    };
  }
  const { client, authSubject } = bootstrapped;
  const runId = String(params.runId ?? "").trim();
  if (!runId) {
    return {
      ok: false,
      code: "invalid_run_id",
      retryable: false,
    };
  }
  const payload = (await client.action("threads:getCloudRuntimeRunComputerUseLiveSession" as any, {
    authSubject,
    runId,
  })) as Record<string, unknown> | null;
  if (!payload || payload.ok !== true) {
    const code = String(payload?.code ?? "live_desktop_unavailable").trim() || "live_desktop_unavailable";
    const retryable =
      typeof payload?.retryable === "boolean"
        ? payload.retryable
        : code !== "runtime_run_not_found" && code !== "live_desktop_inactive" && code !== "auth_unavailable";
    const debug =
      payload?.debug && typeof payload.debug === "object" && !Array.isArray(payload.debug)
        ? (payload.debug as CloudRuntimeComputerUseLiveSessionDebug)
        : null;
    return {
      ok: false,
      code,
      retryable,
      debug,
    };
  }
  const previewProxyToken = String(payload.preview_proxy_token ?? "").trim();
  const expiresAtMs = Number(payload.expires_at ?? 0);
  if (!previewProxyToken || !Number.isFinite(expiresAtMs) || expiresAtMs <= 0) {
    return {
      ok: false,
      code: "live_desktop_unavailable",
      retryable: true,
      debug:
        payload?.debug && typeof payload.debug === "object" && !Array.isArray(payload.debug)
          ? (payload.debug as CloudRuntimeComputerUseLiveSessionDebug)
          : null,
    };
  }
  return {
    ok: true,
    session: {
      preview_proxy_token: previewProxyToken,
      expires_at: toIsoStringFromMs(expiresAtMs),
    },
    debug:
      payload?.debug && typeof payload.debug === "object" && !Array.isArray(payload.debug)
        ? (payload.debug as CloudRuntimeComputerUseLiveSessionDebug)
        : null,
  };
}

export async function captureConvexCloudRuntimeRunComputerUseScreenshot(params: {
  session: AuthSessionLike;
  runId: string;
  reason?: string;
}): Promise<CloudRuntimeComputerUseScreenshotLookup> {
  const bootstrapped = await bootstrapConvexOwnerId(params.session);
  if (!bootstrapped) {
    return {
      ok: false,
      code: "auth_unavailable",
      retryable: false,
    };
  }
  const { client, authSubject } = bootstrapped;
  const runId = String(params.runId ?? "").trim();
  if (!runId) {
    return {
      ok: false,
      code: "invalid_run_id",
      retryable: false,
    };
  }
  const payload = (await client.action("threads:captureCloudRuntimeRunComputerUseScreenshot" as any, {
    authSubject,
    runId,
    ...(typeof params.reason === "string" && params.reason.trim()
      ? { reason: params.reason.trim() }
      : null),
  })) as Record<string, unknown> | null;
  const debug =
    payload?.debug && typeof payload.debug === "object" && !Array.isArray(payload.debug)
      ? (payload.debug as CloudRuntimeComputerUseLiveSessionDebug)
      : null;
  if (!payload || payload.ok !== true) {
    const code =
      String(payload?.code ?? "daytona_computer_use_screenshot_unavailable").trim() ||
      "daytona_computer_use_screenshot_unavailable";
    return {
      ok: false,
      code,
      retryable:
        typeof payload?.retryable === "boolean"
          ? payload.retryable
          : code !== "runtime_run_not_found" && code !== "auth_unavailable",
      debug,
    };
  }
  const frameSize = Number(payload.frame_size_bytes ?? 0);
  const width = Number(payload.screenshot_width ?? 0);
  const height = Number(payload.screenshot_height ?? 0);
  return {
    ok: true,
    screenshot: {
      frame_url: typeof payload.frame_url === "string" && payload.frame_url.trim()
        ? payload.frame_url.trim()
        : null,
      frame_mime_type:
        typeof payload.frame_mime_type === "string" && payload.frame_mime_type.trim()
          ? payload.frame_mime_type.trim()
          : null,
      frame_size_bytes: Number.isFinite(frameSize) && frameSize > 0 ? Math.floor(frameSize) : null,
      screenshot_method:
        typeof payload.screenshot_method === "string" && payload.screenshot_method.trim()
          ? payload.screenshot_method.trim()
          : null,
      screenshot_width: Number.isFinite(width) && width > 0 ? Math.floor(width) : null,
      screenshot_height: Number.isFinite(height) && height > 0 ? Math.floor(height) : null,
    },
    debug,
  };
}

export async function getConvexCloudRuntimeRunDaytonaPreviewSession(params: {
  session: AuthSessionLike;
  runId: string;
  port: number;
}): Promise<CloudRuntimeDaytonaPreviewSessionLookup> {
  const bootstrapped = await bootstrapConvexOwnerId(params.session);
  if (!bootstrapped) {
    return {
      ok: false,
      code: "auth_unavailable",
      retryable: false,
    };
  }
  const { client, authSubject } = bootstrapped;
  const runId = String(params.runId ?? "").trim();
  const port = Math.floor(Number(params.port));
  if (!runId) {
    return {
      ok: false,
      code: "invalid_run_id",
      retryable: false,
    };
  }
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return {
      ok: false,
      code: "invalid_preview_port",
      retryable: false,
    };
  }
  const payload = (await client.action("threads:getCloudRuntimeRunDaytonaPreviewSession" as any, {
    authSubject,
    runId,
    port,
  })) as Record<string, unknown> | null;
  if (!payload || payload.ok !== true) {
    const code = String(payload?.code ?? "daytona_preview_unavailable").trim() || "daytona_preview_unavailable";
    return {
      ok: false,
      code,
      retryable:
        typeof payload?.retryable === "boolean"
          ? payload.retryable
          : code !== "runtime_run_not_found" &&
            code !== "daytona_sandbox_not_available" &&
            code !== "auth_unavailable",
    };
  }
  const previewTransport =
    typeof payload.preview_transport === "string" ? payload.preview_transport : null;
  const previewProxyToken = String(payload.preview_proxy_token ?? "").trim();
  const previewUrl = String(payload.preview_url ?? "").trim();
  const previewPort = Math.floor(toFiniteNumber(payload.preview_port, port));
  const expiresAtMs = Number(payload.expires_at ?? 0);
  const hasExpectedTransportUrl =
    previewTransport === "daytona_signed_direct" ? Boolean(previewUrl) : Boolean(previewProxyToken);
  if (!hasExpectedTransportUrl || !Number.isFinite(expiresAtMs) || expiresAtMs <= 0) {
    return {
      ok: false,
      code: "daytona_preview_unavailable",
      retryable: true,
    };
  }
  return {
    ok: true,
    session: {
      preview_proxy_token: previewProxyToken || null,
      preview_url: previewUrl || null,
      preview_port: previewPort,
      preview_path: typeof payload.preview_path === "string" ? payload.preview_path : null,
      preview_label: typeof payload.preview_label === "string" ? payload.preview_label : null,
      expires_at: toIsoStringFromMs(expiresAtMs),
      expires_in_seconds: Math.max(0, Math.floor(toFiniteNumber(payload.expires_in_seconds, 0))),
      auth_mode: typeof payload.auth_mode === "string" ? payload.auth_mode : null,
      preview_transport: previewTransport,
    },
  };
}

export async function stopConvexCloudRuntimeRunDaytonaPreview(params: {
  session: AuthSessionLike;
  runId: string;
  port: number;
}): Promise<CloudRuntimeDaytonaPreviewStopResult> {
  const bootstrapped = await bootstrapConvexOwnerId(params.session);
  if (!bootstrapped) {
    return {
      ok: false,
      code: "auth_unavailable",
      retryable: false,
      message: "Authentication session is unavailable.",
    };
  }
  const { client, authSubject } = bootstrapped;
  const runId = String(params.runId ?? "").trim();
  const port = Math.floor(Number(params.port));
  if (!runId) {
    return {
      ok: false,
      code: "invalid_run_id",
      retryable: false,
      message: "Runtime run id is invalid.",
    };
  }
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return {
      ok: false,
      code: "invalid_preview_port",
      retryable: false,
      message: "Preview port is invalid.",
    };
  }
  const payload = (await client.action("threads:stopCloudRuntimeRunDaytonaPreview" as any, {
    authSubject,
    runId,
    port,
  })) as Record<string, unknown> | null;
  if (!payload || payload.ok !== true) {
    const code = String(payload?.code ?? "daytona_preview_stop_failed").trim() || "daytona_preview_stop_failed";
    return {
      ok: false,
      code,
      retryable:
        typeof payload?.retryable === "boolean"
          ? payload.retryable
          : code !== "runtime_run_not_found" &&
            code !== "daytona_runtime_target_not_found" &&
            code !== "daytona_sandbox_not_available" &&
            code !== "daytona_preview_not_authorized" &&
            code !== "daytona_preview_port_not_active" &&
            code !== "auth_unavailable",
      message: typeof payload?.message === "string" ? payload.message : null,
    };
  }
  const stoppedPreviewPorts = Array.isArray(payload.stopped_preview_ports)
    ? payload.stopped_preview_ports
        .map((value) => Math.floor(Number(value)))
        .filter((value) => Number.isFinite(value) && value > 0)
    : [];
  return {
    ok: true,
    stopped_preview_ports: stoppedPreviewPorts,
    target_run_id: typeof payload.target_run_id === "string" ? payload.target_run_id : null,
    target_id: typeof payload.target_id === "string" ? payload.target_id : null,
    sandbox_id: typeof payload.sandbox_id === "string" ? payload.sandbox_id : null,
    teardown_state: typeof payload.teardown_state === "string" ? payload.teardown_state : null,
  };
}
