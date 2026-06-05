type JsonRecord = Record<string, unknown>;

export type NormalizedCodexAppServerEvent = {
  eventType: string;
  eventKey: string;
  payload: JsonRecord;
  assistantTextDelta?: string;
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function stringValue(value: unknown, maxLength = 500): string {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, maxLength) : "";
}

function rawString(value: unknown, maxLength = 4000): string {
  const normalized = typeof value === "string" ? value : String(value ?? "");
  return normalized ? normalized.slice(0, maxLength) : "";
}

function numberValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : null;
}

function eventKeyPart(value: unknown, fallback: string): string {
  const normalized = String(value ?? "").trim();
  return (normalized || fallback).replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 120);
}

function readNestedId(record: JsonRecord, key: string): string {
  const nested = asRecord(record[key]);
  return stringValue(nested?.id, 200);
}

function readTurnId(params: JsonRecord): string {
  return (
    stringValue(params.turnId, 200) ||
    readNestedId(params, "turn") ||
    stringValue(asRecord(params.turn)?.turnId, 200)
  );
}

function readThreadId(params: JsonRecord): string {
  return stringValue(params.threadId, 200) || readNestedId(params, "thread");
}

function readItemId(params: JsonRecord): string {
  const item = asRecord(params.item);
  return stringValue(params.itemId, 200) || stringValue(params.id, 200) || stringValue(item?.id, 200);
}

function readToolName(item: JsonRecord | null, params: JsonRecord): string {
  const candidates = [
    item?.toolName,
    item?.tool_name,
    item?.name,
    asRecord(item?.toolCall)?.name,
    asRecord(item?.call)?.name,
    params.toolName,
    params.tool_name,
  ];
  for (const candidate of candidates) {
    const normalized = stringValue(candidate, 160);
    if (normalized) return normalized;
  }
  return "";
}

function readToolArgs(item: JsonRecord | null, params: JsonRecord): JsonRecord {
  const candidates = [
    asRecord(item?.args),
    asRecord(item?.arguments),
    asRecord(asRecord(item?.toolCall)?.args),
    asRecord(asRecord(item?.call)?.args),
    asRecord(params.args),
    asRecord(params.arguments),
  ];
  return candidates.find(Boolean) ?? {};
}

function isToolItem(item: JsonRecord | null, params: JsonRecord): boolean {
  const itemType = stringValue(item?.type ?? params.itemType ?? params.type, 120);
  if (/tool|command|function/i.test(itemType)) return true;
  return Boolean(readToolName(item, params));
}

function basePayload(params: {
  runId: string;
  method: string;
  threadId: string;
  turnId: string;
  itemId?: string | null;
}): JsonRecord {
  return {
    run_id: params.runId,
    codex_method: params.method,
    codex_thread_id: params.threadId || null,
    codex_turn_id: params.turnId || null,
    codex_item_id: params.itemId || null,
    harness: {
      kind: "codex_app_server",
    },
  };
}

export function normalizeCodexAppServerNotification(params: {
  runId: string;
  message: unknown;
  ordinal?: number | null;
}): NormalizedCodexAppServerEvent | null {
  const message = asRecord(params.message);
  if (!message) return null;
  const method = stringValue(message.method, 200);
  if (!method) return null;
  const rpcParams = asRecord(message.params) ?? {};
  const runId = stringValue(params.runId, 200);
  if (!runId) return null;
  const ordinal = numberValue(params.ordinal) ?? 0;
  const threadId = readThreadId(rpcParams);
  const turnId = readTurnId(rpcParams);
  const itemId = readItemId(rpcParams);
  const item = asRecord(rpcParams.item);
  const base = basePayload({ runId, method, threadId, turnId, itemId });
  const suffix = [
    eventKeyPart(method, "notification"),
    eventKeyPart(turnId, "turn"),
    eventKeyPart(itemId, "item"),
    String(Math.max(0, ordinal)),
  ].join(":");

  if (method === "thread/started") {
    return {
      eventType: "codex_thread_started",
      eventKey: `${runId}:codex_thread_started:${eventKeyPart(threadId, "thread")}`,
      payload: {
        ...base,
        codex_thread_id: threadId || readNestedId(rpcParams, "thread") || null,
      },
    };
  }

  if (method === "turn/started") {
    return {
      eventType: "codex_turn_started",
      eventKey: `${runId}:codex_turn_started:${eventKeyPart(turnId, "turn")}`,
      payload: base,
    };
  }

  if (method === "item/agentMessage/delta") {
    const delta = rawString(rpcParams.delta, 8000);
    if (!delta) return null;
    return {
      eventType: "assistant_text_delta",
      eventKey: `${runId}:assistant_text_delta:${suffix}`,
      payload: {
        ...base,
        delta,
      },
      assistantTextDelta: delta,
    };
  }

  if (method === "item/agentReasoning/delta") {
    const delta = rawString(rpcParams.delta, 8000);
    if (!delta) return null;
    return {
      eventType: "reasoning_summary_text_delta",
      eventKey: `${runId}:reasoning_summary_text_delta:${suffix}`,
      payload: {
        ...base,
        summary_stream_id: `codex:${eventKeyPart(turnId, "turn")}`,
        summary_index: 0,
        delta,
      },
    };
  }

  if (method === "item/started" && isToolItem(item, rpcParams)) {
    const toolName = readToolName(item, rpcParams) || "codex_tool";
    const callId = `codex:${runId}:${eventKeyPart(itemId, String(ordinal))}`;
    return {
      eventType: "tool_call_started",
      eventKey: `${runId}:codex_tool_call_started:${eventKeyPart(itemId, String(ordinal))}`,
      payload: {
        ...base,
        tool_call_id: callId,
        provider_call_id: itemId || callId,
        tool_name: toolName,
        args: readToolArgs(item, rpcParams),
        attempt: 1,
      },
    };
  }

  if (method === "item/completed" && isToolItem(item, rpcParams)) {
    const toolName = readToolName(item, rpcParams) || "codex_tool";
    const callId = `codex:${runId}:${eventKeyPart(itemId, String(ordinal))}`;
    const status = stringValue(item?.status ?? rpcParams.status, 80);
    return {
      eventType: "tool_call_finished",
      eventKey: `${runId}:codex_tool_call_finished:${eventKeyPart(itemId, String(ordinal))}`,
      payload: {
        ...base,
        tool_call_id: callId,
        provider_call_id: itemId || callId,
        tool_name: toolName,
        args: readToolArgs(item, rpcParams),
        attempt: 1,
        status: status === "failed" || status === "error" ? "error" : "ok",
        output_text: rawString(item?.output ?? item?.text ?? rpcParams.output ?? "", 2000) || null,
      },
    };
  }

  if (method === "turn/completed") {
    const turn = asRecord(rpcParams.turn);
    return {
      eventType: "codex_turn_completed",
      eventKey: `${runId}:codex_turn_completed:${eventKeyPart(readTurnId(rpcParams), "turn")}`,
      payload: {
        ...base,
        codex_turn_status: stringValue(turn?.status ?? rpcParams.status, 80) || null,
        codex_item_count: Array.isArray(turn?.items) ? turn.items.length : null,
      },
    };
  }

  if (method === "error") {
    const error = asRecord(rpcParams.error);
    return {
      eventType: "codex_app_server_error",
      eventKey: `${runId}:codex_app_server_error:${String(Math.max(0, ordinal))}`,
      payload: {
        ...base,
        error_code: stringValue(error?.code ?? rpcParams.code, 160) || null,
        error_message: stringValue(error?.message ?? rpcParams.message, 1000) || null,
      },
    };
  }

  return null;
}
