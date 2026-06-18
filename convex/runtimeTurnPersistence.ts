import { api } from "./_generated/api";
import {
  extractInferenceSourceFromContentJson,
  extractTextFromContentJson,
} from "./httpRuntimeSupport";
import {
  normalizePersistedId,
  normalizePersistedSeq,
} from "./httpRuntimeTurnState";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isPartialAssistantContentJson(value: unknown): boolean {
  const record = asRecord(value);
  if (!record) return false;
  const meta = asRecord(record.meta);
  const partialRun = asRecord(meta?.partial_run);
  return partialRun?.incomplete === true;
}

export async function ensureRuntimeRunStarted(args: {
  ctx: any;
  ownerId: any;
  threadId: string;
  runStartArgs: Record<string, unknown>;
  fail: (status: number, payload: Record<string, unknown>) => Response;
}): Promise<{ ok: true } | { ok: false; response: Response }> {
  const { ctx, runStartArgs, fail } = args;
  try {
    await ctx.runMutation(
      (api as any).threads.ensureCloudRuntimeRunStarted as any,
      runStartArgs,
    );
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "thread_run_in_progress" || message.includes("thread_run_in_progress")) {
      return {
        ok: false,
        response: fail(409, {
          ok: false,
          code: "thread_run_in_progress",
          error: "thread_run_in_progress",
          message:
            "This thread already has a turn in progress. Wait for it to finish before sending another.",
          run_id: String(runStartArgs.runId ?? ""),
        }),
      };
    }
    throw error;
  }
}

export async function lookupExistingRuntimeReplay(args: {
  ctx: any;
  ownerId: any;
  threadId: string;
  assistantMessageKeyForRun: string;
  userMessageKeyForRun: string;
  inferenceSource: "free" | "platform" | "user_key" | "chatgpt";
}) {
  const { ctx, ownerId, threadId, assistantMessageKeyForRun, userMessageKeyForRun, inferenceSource } = args;
  const existingAssistant = (await ctx.runQuery(
    api.threads.getCloudThreadMessageByOwnerMessageKey as any,
    {
      ownerId,
      threadId,
      messageKey: assistantMessageKeyForRun,
    },
  )) as {
    _id?: unknown;
    messageKey?: unknown;
    seq?: unknown;
    contentJson?: unknown;
  } | null;
  if (!existingAssistant) return null;
  if (isPartialAssistantContentJson(existingAssistant.contentJson)) return null;
  const existingUser = (await ctx.runQuery(
    api.threads.getCloudThreadMessageByOwnerMessageKey as any,
    {
      ownerId,
      threadId,
      messageKey: userMessageKeyForRun,
    },
  )) as { _id?: unknown; messageKey?: unknown; seq?: unknown } | null;
  return {
    content: extractTextFromContentJson(existingAssistant.contentJson),
    promptTokens: null,
    completionTokens: null,
    resolvedInferenceSource: extractInferenceSourceFromContentJson(
      existingAssistant.contentJson,
      inferenceSource,
    ),
    userMessageId: normalizePersistedId(existingUser?._id),
    userMessageKey: normalizePersistedId(existingUser?.messageKey),
    userMessageSeq: normalizePersistedSeq(existingUser?.seq),
    assistantMessageId: normalizePersistedId(existingAssistant?._id),
    assistantMessageKey: normalizePersistedId(existingAssistant?.messageKey),
    assistantMessageSeq: normalizePersistedSeq(existingAssistant?.seq),
  };
}

export async function persistRuntimeUserMessage(args: {
  ctx: any;
  ownerId: any;
  threadId: string;
  messageKey: string;
  requestedModelId: string;
  runId: string;
  latestUserText: string;
}) {
  const persistedUser = (await args.ctx.runMutation(
    api.threads.addCloudThreadMessage as any,
    {
      ownerId: args.ownerId,
      threadId: args.threadId,
      messageKey: args.messageKey,
      role: "user",
      contentJson: { text: args.latestUserText },
      engineId: "runtime_turn",
      modelId: args.requestedModelId,
      runId: args.runId,
      nowMs: Date.now(),
    },
  )) as { _id?: unknown; messageKey?: unknown; seq?: unknown } | null;
  return {
    userMessageId: String(persistedUser?._id ?? "").trim() || null,
    userMessageKey: String(persistedUser?.messageKey ?? "").trim() || null,
    userMessageSeq: Number.isFinite(Number(persistedUser?.seq))
      ? Math.max(0, Math.floor(Number(persistedUser?.seq)))
      : null,
  };
}

export async function persistRuntimeAssistantMessage(args: {
  ctx: any;
  ownerId: any;
  threadId: string;
  messageKey: string;
  requestedModelId: string;
  engineId?: string | null;
  inferenceSource: "free" | "platform" | "user_key" | "chatgpt";
  lane: "public" | "platform" | "chatgpt";
  inferenceLaneFallbacks?: Array<{
    from: "chatgpt" | "platform" | "public";
    to: "chatgpt" | "platform" | "public";
    reason: string;
  }> | null;
  runId: string;
  content: string;
  partialRun?: {
    status: "error" | "cancelled";
    reason?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  } | null;
}) {
  const engineId = String(args.engineId ?? "").trim() || "runtime_turn";
  const inferenceLaneFallbacks = Array.isArray(args.inferenceLaneFallbacks)
    ? args.inferenceLaneFallbacks.filter(
        (item): item is {
          from: "chatgpt" | "platform" | "public";
          to: "chatgpt" | "platform" | "public";
          reason: string;
        } =>
          Boolean(item) &&
          (item.from === "chatgpt" || item.from === "platform" || item.from === "public") &&
          (item.to === "chatgpt" || item.to === "platform" || item.to === "public") &&
          typeof item.reason === "string" &&
          item.reason.trim().length > 0,
      )
    : [];
  const persisted = (await args.ctx.runMutation(
    api.threads.upsertCloudThreadMessageByMessageKey as any,
    {
      ownerId: args.ownerId,
      threadId: args.threadId,
      messageKey: args.messageKey,
      role: "assistant",
      contentJson: {
        text: args.content,
        meta: {
          model_id: args.requestedModelId,
          runtime_engine_id: engineId,
          inference_source: args.inferenceSource,
          lane: args.lane,
          ...(args.partialRun
            ? {
                partial_run: {
                  incomplete: true,
                  status: args.partialRun.status,
                  reason: String(args.partialRun.reason ?? "").trim() || null,
                  error_code:
                    String(args.partialRun.errorCode ?? "").trim() || null,
                  error_message:
                    String(args.partialRun.errorMessage ?? "").trim() || null,
                },
              }
            : null),
          ...(inferenceLaneFallbacks.length > 0
            ? { inference_lane_fallbacks: inferenceLaneFallbacks }
            : null),
        },
      },
      engineId,
      modelId: args.requestedModelId,
      runId: args.runId,
      nowMs: Date.now(),
    },
  )) as { _id?: unknown; messageKey?: unknown; seq?: unknown } | null;
  return {
    assistantMessageId: String(persisted?._id ?? "").trim() || null,
    assistantMessageKey: String(persisted?.messageKey ?? "").trim() || null,
    assistantMessageSeq: Number.isFinite(Number(persisted?.seq))
      ? Math.max(0, Math.floor(Number(persisted?.seq)))
      : null,
  };
}
