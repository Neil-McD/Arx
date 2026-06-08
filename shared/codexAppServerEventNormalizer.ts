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

function optionalNumberValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function readItemType(item: JsonRecord | null, params: JsonRecord): string {
  return stringValue(item?.type ?? params.itemType ?? params.type, 120);
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => stringValue(item, 500)).filter(Boolean);
}

function boundedRecord(value: unknown, fallbackKey: string): JsonRecord {
  const record = asRecord(value);
  if (record) return record;
  if (value === undefined || value === null) return {};
  if (Array.isArray(value)) return { [fallbackKey]: value.slice(0, 50) };
  return { [fallbackKey]: value };
}

function stringifyJsonValue(value: unknown, maxLength = 4000): string {
  if (typeof value === "string") return rawString(value, maxLength);
  if (value === undefined || value === null) return "";
  if (typeof value === "number" || typeof value === "boolean") return rawString(value, maxLength);
  try {
    return JSON.stringify(value).slice(0, maxLength);
  } catch {
    return rawString(value, maxLength);
  }
}

function readFileChanges(item: JsonRecord | null): JsonRecord[] {
  const changes = Array.isArray(item?.changes) ? item?.changes : [];
  const parsedChanges: JsonRecord[] = [];
  for (const change of changes) {
    const record = asRecord(change);
    if (!record) continue;
    const path = stringValue(record.path, 1000);
    const kind = stringValue(record.kind, 120) || stringValue(record.type, 120);
    if (!path && !kind) continue;
    parsedChanges.push({
      ...(path ? { path } : {}),
      kind: kind || "changed",
    });
    if (parsedChanges.length >= 100) break;
  }
  return parsedChanges;
}

function readWebSearchArgs(item: JsonRecord | null): JsonRecord {
  const action = asRecord(item?.action);
  const actionType = stringValue(action?.type, 120);
  const queries = actionType === "search" ? readStringArray(action?.queries) : [];
  const query =
    stringValue(item?.query, 1000) ||
    (actionType === "search" ? stringValue(action?.query, 1000) : "") ||
    queries[0] ||
    "";
  const url = stringValue(action?.url, 2000);
  const pattern = stringValue(action?.pattern, 1000);
  return {
    ...(query ? { query } : {}),
    ...(queries.length > 0 ? { queries } : {}),
    ...(actionType && actionType !== "search" ? { action: actionType } : {}),
    ...(url ? { url } : {}),
    ...(pattern ? { pattern } : {}),
    ...(!query && !url && !pattern ? { query_unavailable: true } : {}),
  };
}

function readToolName(item: JsonRecord | null, params: JsonRecord): string {
  const itemType = readItemType(item, params);
  if (itemType === "dynamicToolCall") {
    return stringValue(item?.tool, 160) || "dynamic_tool";
  }
  if (itemType === "mcpToolCall") {
    const server = stringValue(item?.server, 160);
    const tool = stringValue(item?.tool, 160);
    if (server && tool) return `${server}.${tool}`;
    return tool || "mcp_tool";
  }
  if (itemType === "commandExecution") return "bash";
  if (itemType === "fileChange") return "apply_patch";
  if (itemType === "webSearch") return "web_search";
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
  const itemType = readItemType(item, params);
  if (itemType === "commandExecution") {
    const command = rawString(item?.command, 8000);
    const cwd = stringValue(item?.cwd, 1000);
    return {
      ...(command ? { command } : {}),
      ...(cwd ? { cwd } : {}),
    };
  }
  if (itemType === "fileChange") return { changes: readFileChanges(item) };
  if (itemType === "webSearch") return readWebSearchArgs(item);
  if (itemType === "dynamicToolCall" || itemType === "mcpToolCall") {
    return boundedRecord(item?.arguments, "arguments");
  }
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
  const itemType = readItemType(item, params);
  if (
    itemType === "dynamicToolCall" ||
    itemType === "mcpToolCall" ||
    itemType === "commandExecution" ||
    itemType === "fileChange" ||
    itemType === "webSearch"
  ) {
    return true;
  }
  if (/tool|command|function/i.test(itemType)) return true;
  return Boolean(readToolName(item, params));
}

function readToolOutputText(item: JsonRecord | null, params: JsonRecord): string {
  const itemType = readItemType(item, params);
  if (itemType === "commandExecution") {
    return rawString(item?.aggregatedOutput ?? item?.output ?? item?.text ?? params.output ?? "", 4000).trim();
  }
  if (itemType === "dynamicToolCall") {
    const contentItems = Array.isArray(item?.contentItems) ? item?.contentItems : [];
    const text = contentItems
      .map((contentItem) => {
        const record = asRecord(contentItem);
        if (!record) return "";
        if (record.type === "text" && typeof record.text === "string") return record.text;
        if (typeof record.text === "string") return record.text;
        return "";
      })
      .filter(Boolean)
      .join("\n");
    return rawString(text || (item?.output ?? item?.text ?? params.output ?? ""), 4000);
  }
  if (itemType === "mcpToolCall") {
    return stringifyJsonValue(item?.error ?? item?.result ?? item?.output ?? params.output, 4000);
  }
  if (itemType === "webSearch") {
    const durationMs = optionalNumberValue(item?.durationMs);
    return stringifyJsonValue(
      {
        status: stringValue(item?.status ?? params.status, 80) || "completed",
        ...readWebSearchArgs(item),
        ...(durationMs !== null ? { durationMs } : {}),
      },
      4000,
    );
  }
  if (itemType === "fileChange") {
    return stringifyJsonValue(
      {
        status: stringValue(item?.status ?? params.status, 80) || "completed",
        changes: readFileChanges(item),
      },
      4000,
    );
  }
  return rawString(item?.output ?? item?.text ?? params.output ?? "", 2000);
}

function readToolStatus(item: JsonRecord | null, params: JsonRecord): "ok" | "error" {
  const status = stringValue(item?.status ?? params.status, 80).toLowerCase();
  return status === "failed" ||
    status === "error" ||
    status === "declined" ||
    status === "blocked" ||
    status === "cancelled"
    ? "error"
    : "ok";
}

function readOutputDeltaToolName(method: string): string {
  if (method === "item/commandExecution/outputDelta") return "bash";
  if (method === "item/fileChange/outputDelta") return "apply_patch";
  return "codex_tool";
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

  if (method === "item/agentReasoning/delta" || method === "item/reasoning/summaryTextDelta") {
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

  if (method === "item/reasoning/textDelta") {
    const delta = rawString(rpcParams.delta, 8000);
    if (!delta) return null;
    return {
      eventType: "codex_reasoning_text_delta",
      eventKey: `${runId}:codex_reasoning_text_delta:${suffix}`,
      payload: {
        ...base,
        reasoning_stream_id: `codex:${eventKeyPart(turnId, "turn")}`,
        reasoning_index: 0,
        delta_redacted: true,
        redacted_char_count: delta.length,
        visibility: "trace_only",
      },
    };
  }

  if (method === "item/plan/delta") {
    const delta = rawString(rpcParams.delta, 8000);
    if (!delta) return null;
    return {
      eventType: "codex_plan_delta",
      eventKey: `${runId}:codex_plan_delta:${suffix}`,
      payload: {
        ...base,
        plan_stream_id: `codex:${eventKeyPart(turnId, "turn")}`,
        delta,
      },
    };
  }

  if (method === "turn/plan/updated") {
    return {
      eventType: "codex_plan_updated",
      eventKey: `${runId}:codex_plan_updated:${eventKeyPart(turnId, "turn")}:${String(Math.max(0, ordinal))}`,
      payload: {
        ...base,
        plan: rpcParams.plan ?? null,
      },
    };
  }

  if (method === "item/commandExecution/outputDelta" || method === "item/fileChange/outputDelta") {
    const delta = rawString(rpcParams.delta, 8000);
    if (!delta) return null;
    const toolName = readOutputDeltaToolName(method);
    const callId = `codex:${runId}:${eventKeyPart(itemId, String(ordinal))}`;
    return {
      eventType: "tool_call_output_delta",
      eventKey: `${runId}:codex_tool_call_output_delta:${eventKeyPart(itemId, String(ordinal))}:${String(Math.max(0, ordinal))}`,
      payload: {
        ...base,
        tool_call_id: callId,
        provider_call_id: itemId || callId,
        tool_name: toolName,
        output_delta: delta,
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
    const outputText = readToolOutputText(item, rpcParams);
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
        status: readToolStatus(item, rpcParams),
        output_text: outputText || null,
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
