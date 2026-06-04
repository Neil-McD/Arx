import type { AuthSessionLike } from "./authSession";
import {
  bootstrapConvexAuthenticatedClient,
  requireConvexUrl,
  type ConvexClient,
} from "./convexAuthenticatedClient";
import { readConvexRuntimeUrl } from "./convexRuntime";

export type OperatorCodexBridgeRunResult = {
  ok?: boolean;
  code?: string;
  deploymentKind?: string;
  projectId?: string;
  threadId?: string;
  ownerId?: string | null;
  runId?: string;
  sandboxName?: string | null;
  processName?: string | null;
  providerCommandId?: string | null;
  status?: string | null;
  exitCode?: number | null;
  userMessageKey?: string | null;
  evidence?: Record<string, boolean | undefined>;
  failures?: string[];
  errors?: unknown[];
};

export type OperatorCodexBridgeRunEvent = {
  id: string;
  run_id: string;
  seq: number;
  event_type: string;
  payload: unknown;
  created_at: string;
};

export type OperatorCodexBridgeRunReadback = {
  run: {
    id: string;
    run_id: string;
    thread_id: string;
    owner_id: string;
    project_id: string;
    community_id: string | null;
    status: string;
    error_code: string | null;
    error_message: string | null;
    started_at: string;
    updated_at: string;
    last_event_seq: number;
  };
  events: OperatorCodexBridgeRunEvent[];
};

export type OperatorCodexBridgeRunReconcileResult = {
  ok?: boolean;
  code?: string;
  deploymentKind?: string;
  projectId?: string;
  threadId?: string;
  ownerId?: string | null;
  runId?: string;
  sandboxName?: string | null;
  processName?: string | null;
  runStatus?: string | null;
  processStatus?: string | null;
  processExitCode?: number | null;
  finishedRun?: boolean;
  stoppedProcess?: boolean;
  observation?: {
    stdoutTail?: string | null;
    stderrTail?: string | null;
    logsTail?: string | null;
  };
  failures?: string[];
  errors?: unknown[];
};

type ConvexThreadIdentityRow = {
  _id?: string | null;
};

async function resolveOperatorCodexBridgeCanonicalThreadId(params: {
  client: ConvexClient;
  authSubject: string;
  threadId: string | null | undefined;
}): Promise<string> {
  const requestedThreadId = String(params.threadId ?? "").trim();
  if (!requestedThreadId) throw new Error("codex_bridge_thread_id_required");

  const threadByKey = (await params.client.query("threads:getCloudThreadByThreadKey" as any, {
    authSubject: params.authSubject,
    threadKey: requestedThreadId,
  })) as ConvexThreadIdentityRow | null;
  const threadIdByKey = String(threadByKey?._id ?? "").trim();
  if (threadIdByKey) return threadIdByKey;

  try {
    const threadById = (await params.client.query("threads:getCloudThreadById" as any, {
      authSubject: params.authSubject,
      threadId: requestedThreadId,
      includeArchived: false,
    })) as ConvexThreadIdentityRow | null;
    const threadIdById = String(threadById?._id ?? "").trim();
    if (threadIdById) return threadIdById;
  } catch {
    // A route thread key is not necessarily a Convex id. Keep the backend validator strict.
  }

  throw new Error("codex_bridge_thread_not_found");
}

export async function startOperatorCodexBridgeCodexExecRunCanonical(params: {
  session: AuthSessionLike;
  projectId: string;
  threadId: string;
  prompt?: string | null;
}): Promise<OperatorCodexBridgeRunResult> {
  requireConvexUrl();
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const baseUrl = readConvexRuntimeUrl();
  const threadId = await resolveOperatorCodexBridgeCanonicalThreadId({
    client,
    authSubject,
    threadId: params.threadId,
  });
  return (await client.action("codexBridgeCodexExecSmoke:startOperatorCodexBridgeCodexExecRunAsync" as any, {
    authSubject,
    projectId: params.projectId,
    threadId,
    ...(baseUrl ? { baseUrl } : null),
    ...(params.prompt ? { prompt: params.prompt } : null),
  })) as OperatorCodexBridgeRunResult;
}

export async function startOperatorCodexBridgeThreadTurnCanonical(params: {
  session: AuthSessionLike;
  projectId: string;
  threadId: string;
  prompt: string;
}): Promise<OperatorCodexBridgeRunResult> {
  requireConvexUrl();
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const baseUrl = readConvexRuntimeUrl();
  const threadId = await resolveOperatorCodexBridgeCanonicalThreadId({
    client,
    authSubject,
    threadId: params.threadId,
  });
  return (await client.action("codexBridgeCodexExecSmoke:startOperatorCodexBridgeThreadTurnAsync" as any, {
    authSubject,
    projectId: params.projectId,
    threadId,
    prompt: params.prompt,
    ...(baseUrl ? { baseUrl } : null),
  })) as OperatorCodexBridgeRunResult;
}

export async function loadOperatorCodexBridgeRunCanonical(params: {
  session: AuthSessionLike;
  ownerId: string;
  runId: string;
  threadId?: string | null;
  afterSeq?: number | null;
  limit?: number | null;
}): Promise<OperatorCodexBridgeRunReadback | null> {
  requireConvexUrl();
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const threadId = params.threadId
    ? await resolveOperatorCodexBridgeCanonicalThreadId({
        client,
        authSubject,
        threadId: params.threadId,
      })
    : null;
  return (await client.query("operatorDashboard:getCodexBridgeRunForOperator" as any, {
    authSubject,
    ownerId: params.ownerId,
    runId: params.runId,
    ...(threadId ? { threadId } : null),
    ...(typeof params.afterSeq === "number" && Number.isFinite(params.afterSeq)
      ? { afterSeq: Math.max(0, Math.floor(params.afterSeq)) }
      : null),
    limit: Math.max(1, Math.min(500, Math.floor(params.limit ?? 120))),
  })) as OperatorCodexBridgeRunReadback | null;
}

export async function reconcileOperatorCodexBridgeRunCanonical(params: {
  session: AuthSessionLike;
  projectId: string;
  threadId: string;
  runId: string;
  processName?: string | null;
  finishStaleRunning?: boolean | null;
}): Promise<OperatorCodexBridgeRunReconcileResult> {
  requireConvexUrl();
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const threadId = await resolveOperatorCodexBridgeCanonicalThreadId({
    client,
    authSubject,
    threadId: params.threadId,
  });
  return (await client.action("codexBridgeCodexExecSmoke:reconcileOperatorCodexBridgeCodexExecRun" as any, {
    authSubject,
    projectId: params.projectId,
    threadId,
    runId: params.runId,
    ...(params.processName ? { processName: params.processName } : null),
    ...(params.finishStaleRunning === true ? { finishStaleRunning: true } : null),
  })) as OperatorCodexBridgeRunReconcileResult;
}
