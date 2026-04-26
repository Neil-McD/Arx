import { bootstrapConvexAuthenticatedClient, type ConvexClient } from "./convexAuthenticatedClient";
import {
  finishProductLatencyTrace,
  startProductLatencyTrace,
} from "./productLatencyTrace";
import type { ThreadContextCloudState } from "./threadContextCloudSync";

type CloudThreadContextGatewayParams<SessionT> = {
  session: SessionT;
  threadId: string;
};

type ConvexThreadContextRow = {
  thread_id: string;
  community_id: string | null;
  context_version: unknown;
  updated_at: string;
};

type ConvexThreadLookupRow = {
  _id?: string | null;
};

function parseContextVersion(value: unknown, fallback: number): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function bootstrapConvexOwner(sessionRaw: unknown): Promise<{
  client: ConvexClient;
  authSubject: string;
}> {
  const trace = startProductLatencyTrace("lens.bootstrap_convex");
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(sessionRaw);
  finishProductLatencyTrace(trace, "ok", undefined, { minDurationMs: 1 });
  return { client, authSubject };
}

async function resolveInternalThreadIdByThreadKey(params: {
  client: ConvexClient;
  authSubject: string;
  threadKey: string;
}): Promise<string | null> {
  const trace = startProductLatencyTrace("lens.resolve_thread_id", {
    threadKey: params.threadKey,
  });
  const row = (await params.client.query("threads:getCloudThreadByThreadKey" as any, {
    authSubject: params.authSubject,
    threadKey: params.threadKey,
  })) as ConvexThreadLookupRow | null;
  const internalThreadId = String(row?._id ?? "").trim() || null;
  finishProductLatencyTrace(
    trace,
    internalThreadId ? "ok" : "error",
    { found: Boolean(internalThreadId) },
    { minDurationMs: 1 },
  );
  return internalThreadId;
}

export async function fetchCloudThreadContextById<SessionT>(
  params: CloudThreadContextGatewayParams<SessionT>,
): Promise<ThreadContextCloudState | null> {
  const trace = startProductLatencyTrace("lens.fetch_cloud_context", {
    threadId: params.threadId,
  });
  const { client, authSubject } = await bootstrapConvexOwner(params.session);
  const threadKey = String(params.threadId ?? "").trim();
  if (!threadKey) {
    finishProductLatencyTrace(trace, "error", { reason: "missing_thread_key" });
    return null;
  }
  const internalThreadId = await resolveInternalThreadIdByThreadKey({
    client,
    authSubject,
    threadKey,
  });
  if (!internalThreadId) {
    finishProductLatencyTrace(trace, "error", { reason: "thread_not_found" });
    return null;
  }
  const row = (await client.query("threads:getCloudThreadContext" as any, {
    authSubject,
    threadId: internalThreadId,
  })) as ConvexThreadContextRow | null;
  if (!row?.thread_id) {
    finishProductLatencyTrace(trace, "error", { reason: "context_not_found" });
    return null;
  }
  const context = {
    thread_id: threadKey,
    community_id: row.community_id ?? null,
    context_version: parseContextVersion(row.context_version, 0),
    updated_at: row.updated_at,
  };
  finishProductLatencyTrace(
    trace,
    "ok",
    { communityId: context.community_id, contextVersion: context.context_version },
    { minDurationMs: 1 },
  );
  return context;
}

export async function setCloudThreadContext<SessionT>(
  params: {
    session: SessionT;
    threadId: string;
    expectedContextVersion: number;
    communityId: string | null;
    updateCommunityId?: boolean;
  },
): Promise<ThreadContextCloudState | null> {
  const trace = startProductLatencyTrace("lens.set_cloud_context", {
    threadId: params.threadId,
    toCommunityId: params.communityId,
    expectedContextVersion: params.expectedContextVersion,
    singleCall: true,
  });
  try {
    const { client, authSubject } = await bootstrapConvexOwner(params.session);
    const threadKey = String(params.threadId ?? "").trim();
    if (!threadKey) {
      finishProductLatencyTrace(trace, "error", { reason: "missing_thread_key" });
      return null;
    }
    const row = (await client.mutation("threads:setCloudThreadContextByThreadKey" as any, {
      authSubject,
      threadKey,
      expectedContextVersion: Math.max(0, Math.floor(params.expectedContextVersion)),
      communityId: params.communityId,
      updateCommunityId: params.updateCommunityId ?? true,
    })) as ConvexThreadContextRow | null;
    if (!row?.thread_id) {
      finishProductLatencyTrace(trace, "error", { reason: "context_not_updated" });
      return null;
    }
    const context = {
      thread_id: threadKey,
      community_id: row.community_id ?? null,
      context_version: parseContextVersion(row.context_version, params.expectedContextVersion + 1),
      updated_at: row.updated_at,
    };
    finishProductLatencyTrace(
      trace,
      "ok",
      { communityId: context.community_id, contextVersion: context.context_version },
      { minDurationMs: 1 },
    );
    return context;
  } catch (error) {
    finishProductLatencyTrace(
      trace,
      "error",
      { error: error instanceof Error ? error.message : String(error) },
    );
    throw error;
  }
}
