import type { AuthSessionLike } from "./authSession";
import { bootstrapGatewayAuthContext } from "./cloudGateway";

export const CODEX_BLAXEL_DEFAULT_MODEL_ID = "gpt-5.5";

export type CloudCodexBlaxelRuntimeFailure = {
  code: string;
  message: string;
};

export type CloudCodexBlaxelRuntimeTurnResult =
  | {
      ok: true;
      runId: string;
      modelId: string | null;
    }
  | {
      ok: false;
      runId: string | null;
      failure: CloudCodexBlaxelRuntimeFailure;
    };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeFailure(
  value: unknown,
  fallbackCode: string,
  fallbackMessage: string,
): CloudCodexBlaxelRuntimeFailure {
  const record = asRecord(value);
  const code = normalizeString(record?.code) || fallbackCode;
  const message = normalizeString(record?.message) || fallbackMessage;
  return { code, message };
}

export async function runCloudCodexBlaxelRuntimeTurn(params: {
  session: AuthSessionLike;
  threadId: string;
  prompt: string;
  runId: string;
  destroyAfterRun?: boolean;
}): Promise<CloudCodexBlaxelRuntimeTurnResult> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  const threadKey = normalizeString(params.threadId);
  if (!threadKey) {
    return {
      ok: false,
      runId: normalizeString(params.runId) || null,
      failure: {
        code: "thread_id_required",
        message: "Thread id is required for Codex runtime turns.",
      },
    };
  }

  const thread = asRecord(
    await client.query("threads:getCloudThreadByThreadKey" as any, {
      authSubject,
      threadKey,
    }),
  );
  const internalThreadId = normalizeString(thread?._id);
  if (!internalThreadId) {
    return {
      ok: false,
      runId: normalizeString(params.runId) || null,
      failure: {
        code: "thread_not_found",
        message: "Thread not found.",
      },
    };
  }

  const result = asRecord(
    await client.action("blaxelCodexRuntimeTurn:runBlaxelCodexRuntimeTurn" as any, {
      authSubject,
      threadId: internalThreadId,
      prompt: normalizeString(params.prompt),
      runId: normalizeString(params.runId) || undefined,
      destroyAfterRun: params.destroyAfterRun !== false,
    }),
  );
  const resultRunId = normalizeString(result?.runId) || normalizeString(params.runId) || null;
  if (result?.ok === true) {
    return {
      ok: true,
      runId: resultRunId || normalizeString(params.runId),
      modelId: normalizeString(result.modelId) || CODEX_BLAXEL_DEFAULT_MODEL_ID,
    };
  }

  return {
    ok: false,
    runId: resultRunId,
    failure: normalizeFailure(
      result?.failure,
      "codex_blaxel_runtime_turn_failed",
      "Codex runtime turn failed.",
    ),
  };
}
