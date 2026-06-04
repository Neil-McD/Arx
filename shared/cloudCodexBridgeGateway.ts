import type { AuthSessionLike } from "./authSession";
import { bootstrapConvexAuthenticatedClient, requireConvexUrl } from "./convexAuthenticatedClient";
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

export async function startOperatorCodexBridgeCodexExecRunCanonical(params: {
  session: AuthSessionLike;
  projectId: string;
  threadId: string;
  prompt?: string | null;
}): Promise<OperatorCodexBridgeRunResult> {
  requireConvexUrl();
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const baseUrl = readConvexRuntimeUrl();
  return (await client.action("codexBridgeCodexExecSmoke:startOperatorCodexBridgeCodexExecRun" as any, {
    authSubject,
    projectId: params.projectId,
    threadId: params.threadId,
    ...(baseUrl ? { baseUrl } : null),
    ...(params.prompt ? { prompt: params.prompt } : null),
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
  return (await client.query("operatorDashboard:getCodexBridgeRunForOperator" as any, {
    authSubject,
    ownerId: params.ownerId,
    runId: params.runId,
    ...(params.threadId ? { threadId: params.threadId } : null),
    ...(typeof params.afterSeq === "number" && Number.isFinite(params.afterSeq)
      ? { afterSeq: Math.max(0, Math.floor(params.afterSeq)) }
      : null),
    limit: Math.max(1, Math.min(500, Math.floor(params.limit ?? 120))),
  })) as OperatorCodexBridgeRunReadback | null;
}
