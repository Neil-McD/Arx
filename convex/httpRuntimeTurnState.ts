import { api, internal } from "./_generated/api";
import type { RuntimeTurnContextSnapshotV1 } from "../shared/runtimeTurnContextPacket";

type RuntimeLane = "public" | "platform" | "daytona" | "chatgpt";
type RuntimeInferenceSource = "free" | "platform" | "user_key" | "chatgpt";

type JsonResponseFn = (req: Request, status: number, payload: unknown) => Response;
export type SseResponseEvent = {
  event: string;
  data: Record<string, unknown>;
};

export type SseResponseStreamWriter = {
  send: (entry: SseResponseEvent) => void;
  close: () => void;
};

export type SseResponseSource =
  | SseResponseEvent[]
  | ((writer: SseResponseStreamWriter) => Promise<void> | void);

export type SseResponseFn = (req: Request, source: SseResponseSource) => Response;

type RuntimeSuccessPayload = {
  content: string;
  promptTokens: number | null;
  completionTokens: number | null;
  resolvedInferenceSource: RuntimeInferenceSource;
  inferenceLaneFallbacks?: Array<{
    from: "chatgpt" | "platform" | "public";
    to: "chatgpt" | "platform" | "public";
    reason: string;
  }> | null;
  userMessageId: string | null;
  userMessageKey: string | null;
  userMessageSeq: number | null;
  assistantMessageId: string | null;
  assistantMessageKey: string | null;
  assistantMessageSeq: number | null;
};

export function normalizePersistedId(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

export function normalizePersistedSeq(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : null;
}

export function buildRuntimeTurnSuccessResponder(params: {
  req: Request;
  stream: boolean;
  runId: string;
  requestId: string;
  lane: RuntimeLane;
  requestedModelId: string | null;
  jsonResponse: JsonResponseFn;
  sseResponse: SseResponseFn;
}): (payload: RuntimeSuccessPayload) => Response {
  return (payload) => {
    if (!params.stream) {
      return params.jsonResponse(params.req, 200, {
        ok: true,
        run_id: params.runId,
        request_id: params.requestId,
        lane: params.lane,
        engine_id: "runtime_convex",
        model_id: params.requestedModelId,
        inference_source: payload.resolvedInferenceSource,
        inference_lane_fallbacks: payload.inferenceLaneFallbacks ?? null,
        content: payload.content,
        prompt_tokens: payload.promptTokens,
        completion_tokens: payload.completionTokens,
        user_message_id: payload.userMessageId,
        user_message_key: payload.userMessageKey,
        user_message_seq: payload.userMessageSeq,
        assistant_message_id: payload.assistantMessageId,
        assistant_message_key: payload.assistantMessageKey,
        assistant_message_seq: payload.assistantMessageSeq,
      });
    }
    return params.sseResponse(params.req, [
      {
        event: "start",
        data: {
          run_id: params.runId,
          request_id: params.requestId,
          stage: "start",
          lane: params.lane,
          engine_id: "runtime_convex",
          model_id: params.requestedModelId,
          inference_source: payload.resolvedInferenceSource,
          inference_lane_fallbacks: payload.inferenceLaneFallbacks ?? null,
          prompt_tokens: payload.promptTokens,
          completion_tokens: payload.completionTokens,
        },
      },
      {
        event: "delta",
        data: {
          delta: payload.content,
          full_content: payload.content,
          request_id: params.requestId,
          stage: "streaming",
          prompt_tokens: payload.promptTokens,
          completion_tokens: payload.completionTokens,
        },
      },
      {
        event: "done",
        data: {
          run_id: params.runId,
          request_id: params.requestId,
          stage: "done",
          lane: params.lane,
          engine_id: "runtime_convex",
          model_id: params.requestedModelId,
          inference_source: payload.resolvedInferenceSource,
          inference_lane_fallbacks: payload.inferenceLaneFallbacks ?? null,
          full_content: payload.content,
          prompt_tokens: payload.promptTokens,
          completion_tokens: payload.completionTokens,
          user_message_id: payload.userMessageId,
          user_message_key: payload.userMessageKey,
          user_message_seq: payload.userMessageSeq,
          assistant_message_id: payload.assistantMessageId,
          assistant_message_key: payload.assistantMessageKey,
          assistant_message_seq: payload.assistantMessageSeq,
        },
      },
    ]);
  };
}

export function buildRuntimeRunPersistenceHelpers(params: {
  ctx: any;
  userId: string;
  threadId: string;
  runId: string;
}): {
  appendRunEvent: (params: {
    eventType: string;
    eventKey?: string;
    payload: Record<string, unknown>;
  }) => Promise<unknown>;
  finishRunBestEffort: (params: {
    status: "ok" | "error" | "cancelled";
    reason?: string;
    errorCode?: string;
    errorMessage?: string;
    contextSnapshot?: RuntimeTurnContextSnapshotV1 | null;
  }) => Promise<void>;
  touchRunHeartbeatBestEffort: () => Promise<void>;
} {
  const appendRunEvent = async (event: {
    eventType: string;
    eventKey?: string;
    payload: Record<string, unknown>;
  }): Promise<unknown> => {
    return await params.ctx.runMutation((api as any).threads.appendCloudRuntimeRunEvent as any, {
      ownerId: params.userId,
      threadId: params.threadId,
      runId: params.runId,
      eventType: event.eventType,
      eventKey: event.eventKey,
      payload: event.payload,
      nowMs: Date.now(),
    });
  };

  const finishRunBestEffort = async (finish: {
    status: "ok" | "error" | "cancelled";
    reason?: string;
    errorCode?: string;
    errorMessage?: string;
    contextSnapshot?: RuntimeTurnContextSnapshotV1 | null;
  }): Promise<void> => {
    if (finish.contextSnapshot) {
      try {
        await params.ctx.runMutation(
          (internal as any).threads.setCloudRuntimeRunContextSnapshotInternal as any,
          {
            ownerId: params.userId,
            threadId: params.threadId,
            runId: params.runId,
            phase: "finished",
            snapshot: finish.contextSnapshot,
            nowMs: Date.now(),
          },
        );
      } catch {
        // Best-effort audit snapshot; finishing the run is the primary state transition.
      }
    }
    try {
      await params.ctx.runMutation((api as any).threads.finishCloudRuntimeRun as any, {
        ownerId: params.userId,
        threadId: params.threadId,
        runId: params.runId,
        status: finish.status,
        reason: finish.reason,
        errorCode: finish.errorCode,
        errorMessage: finish.errorMessage,
        nowMs: Date.now(),
      });
    } catch {
      // Best-effort: response semantics should not regress when telemetry persistence fails.
    }
  };

  const touchRunHeartbeatBestEffort = async (): Promise<void> => {
    try {
      await params.ctx.runMutation((internal as any).threads.touchCloudRuntimeRunHeartbeatInternal as any, {
        ownerId: params.userId,
        threadId: params.threadId,
        runId: params.runId,
        nowMs: Date.now(),
      });
    } catch {
      // Best-effort: liveness should not interrupt the active turn.
    }
  };

  return {
    appendRunEvent,
    finishRunBestEffort,
    touchRunHeartbeatBestEffort,
  };
}
