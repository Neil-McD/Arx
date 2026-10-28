

export type RuntimeHarnessTelemetrySummary = {
  scheduleEventCount: number;
  batchTelemetryEventCount: number;
  scheduledCallCount: number;
  batchedScheduleCount: number;
  parallelScheduledBatchCount: number;
  parallelExecutedBatchCount: number;
  parallelEligibleCallCount: number;
  decisionCounts: Record<string, number>;
  executionModeCounts: Record<string, number>;
  blockerReasonCounts: Record<string, number>;
  totalEstimatedParallelSavingsMs: number;
  totalBatchWallTimeMs: number;
  totalSerialDurationEstimateMs: number;
  totalObservedToolCalls: number;
  toolStatusCounts: Record<string, number>;
  toolUseCounts: Record<string, number>;
  toolDurationTotalsMs: Record<string, number>;
  toolDurationMaxMs: Record<string, number>;
};

export type RuntimeHarnessScorecardRunSummary = {
  runId: string;
  status: string;
  visibility: string;
  startedAt: number;
  finishedAt: number | null;
  wallTimeMs: number | null;
  scheduleEventCount: number;
  batchTelemetryEventCount: number;
  scheduledCallCount: number;
  parallelExecutedBatchCount: number;
  totalEstimatedParallelSavingsMs: number;
  blockerReasonCounts: Record<string, number>;
};

export type RuntimeHarnessScorecard = {
  generatedAt: number;
  window: {
    runCount: number;
    finishedRunCount: number;
    userVisibleRunCount: number;
    internalHiddenRunCount: number;
    runsWithToolScheduleTelemetry: number;
    runsWithBatchTelemetry: number;
    runsWithParallelExecution: number;
  };
  runStatusCounts: Record<string, number>;
  latency: {
    averageRunWallTimeMs: number | null;
    medianRunWallTimeMs: number | null;
    p95RunWallTimeMs: number | null;
    maxRunWallTimeMs: number | null;
  };
  scheduling: {
    totalScheduleEvents: number;
    totalBatchTelemetryEvents: number;
    scheduledCallCount: number;
    batchedScheduleCount: number;
    parallelScheduledBatchCount: number;
    parallelExecutedBatchCount: number;
    parallelEligibleCallCount: number;
    decisionCounts: Record<string, number>;
    executionModeCounts: Record<string, number>;
    blockerReasonCounts: Record<string, number>;
  };
  savings: {
    totalEstimatedParallelSavingsMs: number;
    averageEstimatedParallelSavingsPerParallelBatchMs: number | null;
    totalBatchWallTimeMs: number;
    totalSerialDurationEstimateMs: number;
  };
  tools: {
    totalObservedToolCalls: number;
    toolStatusCounts: Record<string, number>;
    mostUsedTools: Array<{
      toolName: string;
      count: number;
    }>;
    slowestToolsByAverageDuration: Array<{
      toolName: string;
      count: number;
      averageDurationMs: number;
      maxDurationMs: number;
    }>;
  };
  runs: RuntimeHarnessScorecardRunSummary[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCountRecord(value: unknown): Record<string, number> {
  const record = asRecord(value);
  if (!record) return {};
  const out: Record<string, number> = {};
  for (const [key, rawValue] of Object.entries(record)) {
    const normalizedKey = String(key ?? "").trim();
    const normalizedValue = Math.max(0, asNumber(rawValue) ?? 0);
    if (!normalizedKey || normalizedValue <= 0) continue;
    out[normalizedKey] = normalizedValue;
  }
  return out;
}

function cloneCountRecord(value: Record<string, number>): Record<string, number> {
  return { ...value };
}

function incrementCount(target: Record<string, number>, key: string | null | undefined, amount = 1) {
  const normalizedKey = String(key ?? "").trim() || "unknown";
  target[normalizedKey] = (target[normalizedKey] ?? 0) + amount;
}

function addCountRecord(target: Record<string, number>, source: Record<string, number>) {
  for (const [key, amount] of Object.entries(source)) {
    if (!Number.isFinite(amount) || amount <= 0) continue;
    incrementCount(target, key, amount);
  }
}

export function createEmptyRuntimeHarnessTelemetrySummary(): RuntimeHarnessTelemetrySummary {
  return {
    scheduleEventCount: 0,
    batchTelemetryEventCount: 0,
    scheduledCallCount: 0,
    batchedScheduleCount: 0,
    parallelScheduledBatchCount: 0,
    parallelExecutedBatchCount: 0,
    parallelEligibleCallCount: 0,
    decisionCounts: {},
    executionModeCounts: {},
    blockerReasonCounts: {},
    totalEstimatedParallelSavingsMs: 0,
    totalBatchWallTimeMs: 0,
    totalSerialDurationEstimateMs: 0,
    totalObservedToolCalls: 0,
    toolStatusCounts: {},
    toolUseCounts: {},
    toolDurationTotalsMs: {},
    toolDurationMaxMs: {},
  };
}

export function coerceRuntimeHarnessTelemetrySummary(value: unknown): RuntimeHarnessTelemetrySummary {
  const record = asRecord(value);
  if (!record) return createEmptyRuntimeHarnessTelemetrySummary();
  return {
    scheduleEventCount: Math.max(0, asNumber(record.scheduleEventCount) ?? 0),
    batchTelemetryEventCount: Math.max(0, asNumber(record.batchTelemetryEventCount) ?? 0),
    scheduledCallCount: Math.max(0, asNumber(record.scheduledCallCount) ?? 0),
    batchedScheduleCount: Math.max(0, asNumber(record.batchedScheduleCount) ?? 0),
    parallelScheduledBatchCount: Math.max(0, asNumber(record.parallelScheduledBatchCount) ?? 0),
    parallelExecutedBatchCount: Math.max(0, asNumber(record.parallelExecutedBatchCount) ?? 0),
    parallelEligibleCallCount: Math.max(0, asNumber(record.parallelEligibleCallCount) ?? 0),
    decisionCounts: normalizeCountRecord(record.decisionCounts),
    executionModeCounts: normalizeCountRecord(record.executionModeCounts),
    blockerReasonCounts: normalizeCountRecord(record.blockerReasonCounts),
    totalEstimatedParallelSavingsMs: Math.max(0, asNumber(record.totalEstimatedParallelSavingsMs) ?? 0),
    totalBatchWallTimeMs: Math.max(0, asNumber(record.totalBatchWallTimeMs) ?? 0),
    totalSerialDurationEstimateMs: Math.max(0, asNumber(record.totalSerialDurationEstimateMs) ?? 0),
    totalObservedToolCalls: Math.max(0, asNumber(record.totalObservedToolCalls) ?? 0),
    toolStatusCounts: normalizeCountRecord(record.toolStatusCounts),
    toolUseCounts: normalizeCountRecord(record.toolUseCounts),
    toolDurationTotalsMs: normalizeCountRecord(record.toolDurationTotalsMs),
    toolDurationMaxMs: normalizeCountRecord(record.toolDurationMaxMs),
  };
}

function cloneRuntimeHarnessTelemetrySummary(summary: RuntimeHarnessTelemetrySummary): RuntimeHarnessTelemetrySummary {
  return {
    ...summary,
    decisionCounts: cloneCountRecord(summary.decisionCounts),
    executionModeCounts: cloneCountRecord(summary.executionModeCounts),
    blockerReasonCounts: cloneCountRecord(summary.blockerReasonCounts),
    toolStatusCounts: cloneCountRecord(summary.toolStatusCounts),
    toolUseCounts: cloneCountRecord(summary.toolUseCounts),
    toolDurationTotalsMs: cloneCountRecord(summary.toolDurationTotalsMs),
    toolDurationMaxMs: cloneCountRecord(summary.toolDurationMaxMs),
  };
}

export function applyRuntimeHarnessTelemetryEvent(params: {
  summary?: unknown;
  eventType: string;
  payload: unknown;
}): RuntimeHarnessTelemetrySummary {
  const next = cloneRuntimeHarnessTelemetrySummary(
    coerceRuntimeHarnessTelemetrySummary(params.summary),
  );
  const payload = asRecord(params.payload);
  if (!payload) return next;

  if (params.eventType === "tool_schedule_resolved") {
    next.scheduleEventCount += 1;

    const batchCallCount = Math.max(0, asNumber(payload.batch_call_count) ?? 0);
    next.scheduledCallCount += batchCallCount;
    if (batchCallCount > 1) next.batchedScheduleCount += 1;

    incrementCount(next.decisionCounts, asString(payload.decision));
    const executionMode = asString(payload.execution_mode);
    incrementCount(next.executionModeCounts, executionMode);
    if (executionMode === "parallel_read_batch") {
      next.parallelScheduledBatchCount += 1;
    }
    next.parallelEligibleCallCount += Math.max(
      0,
      asNumber(asRecord(payload.summary)?.parallelEligible) ?? 0,
    );
    return next;
  }

  if (params.eventType !== "tool_batch_telemetry") return next;

  next.batchTelemetryEventCount += 1;
  if (asString(payload.actual_execution_mode) === "parallel") {
    next.parallelExecutedBatchCount += 1;
  }

  next.totalEstimatedParallelSavingsMs += Math.max(
    0,
    asNumber(payload.estimated_parallel_savings_ms) ?? 0,
  );
  next.totalBatchWallTimeMs += Math.max(0, asNumber(payload.batch_wall_time_ms) ?? 0);
  next.totalSerialDurationEstimateMs += Math.max(
    0,
    asNumber(payload.serial_duration_estimate_ms) ?? 0,
  );

  addCountRecord(
    next.blockerReasonCounts,
    normalizeCountRecord(payload.parallel_blocker_reason_counts),
  );

  const toolEntries = asArray(payload.tools);
  for (const tool of toolEntries) {
    const toolRecord = asRecord(tool);
    if (!toolRecord) continue;
    const toolName = asString(toolRecord.tool_name) ?? "unknown";
    const durationMs = Math.max(0, asNumber(toolRecord.duration_ms) ?? 0);
    const status = asString(toolRecord.status) ?? "unknown";
    next.totalObservedToolCalls += 1;
    incrementCount(next.toolUseCounts, toolName);
    incrementCount(next.toolStatusCounts, status);
    next.toolDurationTotalsMs[toolName] = (next.toolDurationTotalsMs[toolName] ?? 0) + durationMs;
    next.toolDurationMaxMs[toolName] = Math.max(next.toolDurationMaxMs[toolName] ?? 0, durationMs);
  }

  if (toolEntries.length === 0) {
    addCountRecord(
      next.toolStatusCounts,
      normalizeCountRecord(payload.tool_status_counts),
    );
  }

  return next;
}
