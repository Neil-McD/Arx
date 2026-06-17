import { internal } from "./_generated/api";
import {
  RUNTIME_CONTEXT_INTEGRITY_EVENT_TYPE,
  buildRuntimeContextIntegrityCheck,
  type RuntimeContextIntegrityVerdict,
} from "../shared/runtimeContextIntegrity.ts";

type AppendRunEvent = (event: {
  eventType: string;
  eventKey?: string;
  payload: Record<string, unknown>;
}) => Promise<unknown>;

export async function appendRuntimeContextIntegrityCheckBestEffort(params: {
  ctx: any;
  ownerId: any;
  runId: string;
  appendRunEvent: AppendRunEvent;
}): Promise<RuntimeContextIntegrityVerdict | null> {
  const runId = String(params.runId ?? "").trim();
  if (!runId) return null;
  try {
    const [run, events] = await Promise.all([
      params.ctx.runQuery(
        internal.threads.getRuntimeRunByOwnerRunIdInternal as any,
        {
          ownerId: params.ownerId,
          runId,
        },
      ),
      params.ctx.runQuery(
        internal.threads.listRuntimeRunEventsByOwnerRunIdInternal as any,
        {
          ownerId: params.ownerId,
          runId,
        },
      ),
    ]);
    const verdict = buildRuntimeContextIntegrityCheck({
      run: run as any,
      events: Array.isArray(events) ? (events as any[]) : [],
    });
    await params.appendRunEvent({
      eventType: RUNTIME_CONTEXT_INTEGRITY_EVENT_TYPE,
      eventKey: `${runId}:${RUNTIME_CONTEXT_INTEGRITY_EVENT_TYPE}:1`,
      payload: {
        run_id: runId,
        ...verdict,
      },
    });
    return verdict;
  } catch {
    return null;
  }
}
