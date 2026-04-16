type RuntimeHarnessRunLike = {
  runId: string;
  status: string;
  visibility?: string;
  startedAt: number;
  finishedAt?: number;
};

type RuntimeHarnessEventLike = {
  eventType: string;
  payload: unknown;
};

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

function percentile(values: number[], ratio: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * clampedRatio) - 1));
  return sorted[index] ?? null;
}

type ToolAggregate = {
  count: number;
  totalDurationMs: number;
  maxDurationMs: number;
};

function topEntriesByCount(counts: Record<string, number>, limit: number) {
  return Object.entries(counts)
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return left[0].localeCompare(right[0]);
    })
    .slice(0, limit)
    .map(([toolName, count]) => ({ toolName, count }));
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

export function buildRuntimeHarnessTelemetrySummaryFromEvents(
  events: RuntimeHarnessEventLike[],
): RuntimeHarnessTelemetrySummary {
  let summary = createEmptyRuntimeHarnessTelemetrySummary();
  for (const event of events) {
    summary = applyRuntimeHarnessTelemetryEvent({
      summary,
      eventType: event.eventType,
      payload: event.payload,
    });
  }
  return summary;
}

export function buildRuntimeHarnessScorecard(params: {
  runs: Array<{
    run: RuntimeHarnessRunLike;
    telemetrySummary?: unknown;
  }>;
  nowMs?: number;
}): RuntimeHarnessScorecard {
  const nowMs =
    typeof params.nowMs === "number" && Number.isFinite(params.nowMs)
      ? Math.floor(params.nowMs)
      : Date.now();
  const runStatusCounts: Record<string, number> = {};
  const decisionCounts: Record<string, number> = {};
  const executionModeCounts: Record<string, number> = {};
  const blockerReasonCounts: Record<string, number> = {};
  const toolStatusCounts: Record<string, number> = {};
  const toolCounts: Record<string, number> = {};
  const toolAggregates = new Map<string, ToolAggregate>();
  const runWallTimes: number[] = [];
  const runs: RuntimeHarnessScorecardRunSummary[] = [];

  let userVisibleRunCount = 0;
  let internalHiddenRunCount = 0;
  let finishedRunCount = 0;
  let runsWithToolScheduleTelemetry = 0;
  let runsWithBatchTelemetry = 0;
  let runsWithParallelExecution = 0;

  let totalScheduleEvents = 0;
  let totalBatchTelemetryEvents = 0;
  let scheduledCallCount = 0;
  let batchedScheduleCount = 0;
  let parallelScheduledBatchCount = 0;
  let parallelExecutedBatchCount = 0;
  let parallelEligibleCallCount = 0;
  let totalEstimatedParallelSavingsMs = 0;
  let totalBatchWallTimeMs = 0;
  let totalSerialDurationEstimateMs = 0;
  let totalObservedToolCalls = 0;

  for (const entry of params.runs) {
    const run = entry.run;
    const summary = coerceRuntimeHarnessTelemetrySummary(entry.telemetrySummary);
    const visibility = String(run.visibility ?? "user_visible").trim() || "user_visible";
    if (visibility === "internal_hidden") {
      internalHiddenRunCount += 1;
    } else {
      userVisibleRunCount += 1;
    }
    incrementCount(runStatusCounts, run.status);

    const finishedAt = asNumber(run.finishedAt) ?? null;
    const wallTimeMs =
      typeof finishedAt === "number" && Number.isFinite(run.startedAt)
        ? Math.max(0, finishedAt - Math.floor(run.startedAt))
        : null;
    if (typeof wallTimeMs === "number") {
      finishedRunCount += 1;
      runWallTimes.push(wallTimeMs);
    }

    if (summary.scheduleEventCount > 0) runsWithToolScheduleTelemetry += 1;
    if (summary.batchTelemetryEventCount > 0) runsWithBatchTelemetry += 1;
    if (summary.parallelExecutedBatchCount > 0) runsWithParallelExecution += 1;

    totalScheduleEvents += summary.scheduleEventCount;
    totalBatchTelemetryEvents += summary.batchTelemetryEventCount;
    scheduledCallCount += summary.scheduledCallCount;
    batchedScheduleCount += summary.batchedScheduleCount;
    parallelScheduledBatchCount += summary.parallelScheduledBatchCount;
    parallelExecutedBatchCount += summary.parallelExecutedBatchCount;
    parallelEligibleCallCount += summary.parallelEligibleCallCount;
    totalEstimatedParallelSavingsMs += summary.totalEstimatedParallelSavingsMs;
    totalBatchWallTimeMs += summary.totalBatchWallTimeMs;
    totalSerialDurationEstimateMs += summary.totalSerialDurationEstimateMs;
    totalObservedToolCalls += summary.totalObservedToolCalls;

    addCountRecord(decisionCounts, summary.decisionCounts);
    addCountRecord(executionModeCounts, summary.executionModeCounts);
    addCountRecord(blockerReasonCounts, summary.blockerReasonCounts);
    addCountRecord(toolStatusCounts, summary.toolStatusCounts);
    addCountRecord(toolCounts, summary.toolUseCounts);

    for (const [toolName, count] of Object.entries(summary.toolUseCounts)) {
      const normalizedCount = Math.max(0, count);
      if (normalizedCount <= 0) continue;
      const aggregate = toolAggregates.get(toolName) ?? {
        count: 0,
        totalDurationMs: 0,
        maxDurationMs: 0,
      };
      aggregate.count += normalizedCount;
      aggregate.totalDurationMs += Math.max(
        0,
        summary.toolDurationTotalsMs[toolName] ?? 0,
      );
      aggregate.maxDurationMs = Math.max(
        aggregate.maxDurationMs,
        Math.max(0, summary.toolDurationMaxMs[toolName] ?? 0),
      );
      toolAggregates.set(toolName, aggregate);
    }

    runs.push({
      runId: run.runId,
      status: run.status,
      visibility,
      startedAt: Math.floor(run.startedAt),
      finishedAt,
      wallTimeMs,
      scheduleEventCount: summary.scheduleEventCount,
      batchTelemetryEventCount: summary.batchTelemetryEventCount,
      scheduledCallCount: summary.scheduledCallCount,
      parallelExecutedBatchCount: summary.parallelExecutedBatchCount,
      totalEstimatedParallelSavingsMs: summary.totalEstimatedParallelSavingsMs,
      blockerReasonCounts: cloneCountRecord(summary.blockerReasonCounts),
    });
  }

  const averageRunWallTimeMs =
    runWallTimes.length > 0
      ? Math.round(runWallTimes.reduce((sum, value) => sum + value, 0) / runWallTimes.length)
      : null;

  const slowestToolsByAverageDuration = [...toolAggregates.entries()]
    .map(([toolName, aggregate]) => ({
      toolName,
      count: aggregate.count,
      averageDurationMs:
        aggregate.count > 0 ? Math.round(aggregate.totalDurationMs / aggregate.count) : 0,
      maxDurationMs: aggregate.maxDurationMs,
    }))
    .sort((left, right) => {
      if (right.averageDurationMs !== left.averageDurationMs) {
        return right.averageDurationMs - left.averageDurationMs;
      }
      if (right.maxDurationMs !== left.maxDurationMs) return right.maxDurationMs - left.maxDurationMs;
      return left.toolName.localeCompare(right.toolName);
    })
    .slice(0, 10);

  return {
    generatedAt: nowMs,
    window: {
      runCount: params.runs.length,
      finishedRunCount,
      userVisibleRunCount,
      internalHiddenRunCount,
      runsWithToolScheduleTelemetry,
      runsWithBatchTelemetry,
      runsWithParallelExecution,
    },
    runStatusCounts,
    latency: {
      averageRunWallTimeMs,
      medianRunWallTimeMs: percentile(runWallTimes, 0.5),
      p95RunWallTimeMs: percentile(runWallTimes, 0.95),
      maxRunWallTimeMs: runWallTimes.length > 0 ? Math.max(...runWallTimes) : null,
    },
    scheduling: {
      totalScheduleEvents,
      totalBatchTelemetryEvents,
      scheduledCallCount,
      batchedScheduleCount,
      parallelScheduledBatchCount,
      parallelExecutedBatchCount,
      parallelEligibleCallCount,
      decisionCounts,
      executionModeCounts,
      blockerReasonCounts,
    },
    savings: {
      totalEstimatedParallelSavingsMs,
      averageEstimatedParallelSavingsPerParallelBatchMs:
        parallelExecutedBatchCount > 0
          ? Math.round(totalEstimatedParallelSavingsMs / parallelExecutedBatchCount)
          : null,
      totalBatchWallTimeMs,
      totalSerialDurationEstimateMs,
    },
    tools: {
      totalObservedToolCalls,
      toolStatusCounts,
      mostUsedTools: topEntriesByCount(toolCounts, 10),
      slowestToolsByAverageDuration,
    },
    runs: runs.sort((left, right) => right.startedAt - left.startedAt),
  };
}
