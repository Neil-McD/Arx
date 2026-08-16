import type { RuntimeKernelToolExecutionResult as NativeToolExecutionResult } from "../shared/runtimeKernelTypes";
import type { RuntimeToolSchedulePlan } from "../shared/runtimeToolPolicy";

export type RuntimeToolBatchExecutionMode = "serial" | "parallel";

export type RuntimeToolBatchTelemetryRecord = {
  providerCallId: string;
  toolName: string;
  index: number;
  iteration: number | null;
  startedAtMs: number | null;
  finishedAtMs: number | null;
  durationMs: number | null;
  status: NativeToolExecutionResult["status"] | null;
  errorCode: string | null;
  madeProgress: boolean | null;
  repeatedCallCount: number | null;
  consecutiveFailureCount: number | null;
  consecutiveNoProgressCount: number | null;
};

export type ActiveRuntimeToolBatchTelemetry = {
  startingIteration: number;
  batchCallCount: number;
  isBatch: boolean;
  remainingToolBudget: number;
  parallelReadToolsEnabled: boolean;
  scheduledAtMs: number;
  schedule: RuntimeToolSchedulePlan;
  actualExecutionMode: RuntimeToolBatchExecutionMode;
  completedToolCount: number;
  recordsByCallId: Map<string, RuntimeToolBatchTelemetryRecord>;
};

export function summarizeToolBatchBlockerReasons(
  schedule: RuntimeToolSchedulePlan,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const call of schedule.calls) {
    for (const reason of call.reasons) {
      if (reason === "parallel_safe_read_only") continue;
      counts[reason] = (counts[reason] ?? 0) + 1;
    }
  }
  return counts;
}

export function buildToolBatchTelemetryPayload(params: {
  runId: string;
  harnessName: "chat_tools";
  telemetry: ActiveRuntimeToolBatchTelemetry;
  terminalStopReason?: string | null;
  terminalFailureCode?: string | null;
  pendingToolCallId?: string | null;
}): Record<string, unknown> {
  const records = [...params.telemetry.recordsByCallId.values()].sort(
    (left, right) => left.index - right.index,
  );
  const durationValues = records
    .map((record) => record.durationMs)
    .filter((value): value is number => typeof value === "number");
  const startedAtValues = records
    .map((record) => record.startedAtMs)
    .filter((value): value is number => typeof value === "number");
  const finishedAtValues = records
    .map((record) => record.finishedAtMs)
    .filter((value): value is number => typeof value === "number");
  const batchStartedAtMs =
    startedAtValues.length > 0
      ? Math.min(...startedAtValues)
      : params.telemetry.scheduledAtMs;
  const batchFinishedAtMs =
    finishedAtValues.length > 0
      ? Math.max(...finishedAtValues)
      : params.telemetry.scheduledAtMs;
  const batchWallTimeMs = Math.max(0, batchFinishedAtMs - batchStartedAtMs);
  const serialDurationEstimateMs = durationValues.reduce(
    (sum, value) => sum + value,
    0,
  );
  const estimatedParallelSavingsMs =
    params.telemetry.actualExecutionMode === "parallel"
      ? Math.max(0, serialDurationEstimateMs - batchWallTimeMs)
      : 0;
  const statusCounts: Record<string, number> = {};
  for (const record of records) {
    const status = record.status ?? "unknown";
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  }

  return {
    run_id: params.runId,
    harness_name: params.harnessName,
    starting_iteration: params.telemetry.startingIteration,
    batch_call_count: params.telemetry.batchCallCount,
    completed_tool_count: params.telemetry.completedToolCount,
    batch_completed:
      params.telemetry.completedToolCount >= params.telemetry.batchCallCount,
    is_batch: params.telemetry.isBatch,
    remaining_tool_budget: params.telemetry.remainingToolBudget,
    parallel_read_tools_enabled: params.telemetry.parallelReadToolsEnabled,
    schedule_decision: params.telemetry.schedule.decision,
    schedule_execution_mode: params.telemetry.schedule.executionMode,
    schedule_reason: params.telemetry.schedule.reason,
    actual_execution_mode: params.telemetry.actualExecutionMode,
    parallel_eligible_call_count: params.telemetry.schedule.summary.parallelEligible,
    parallel_blocker_reason_counts: summarizeToolBatchBlockerReasons(
      params.telemetry.schedule,
    ),
    batch_scheduled_at_ms: params.telemetry.scheduledAtMs,
    batch_started_at_ms: batchStartedAtMs,
    batch_finished_at_ms: batchFinishedAtMs,
    batch_wall_time_ms: batchWallTimeMs,
    serial_duration_estimate_ms: serialDurationEstimateMs,
    estimated_parallel_savings_ms: estimatedParallelSavingsMs,
    tool_status_counts: statusCounts,
    tools: records.map((record) => ({
      provider_call_id: record.providerCallId,
      tool_name: record.toolName,
      index: record.index,
      iteration: record.iteration,
      started_at_ms: record.startedAtMs,
      finished_at_ms: record.finishedAtMs,
      duration_ms: record.durationMs,
      status: record.status,
      error_code: record.errorCode,
      made_progress: record.madeProgress,
      repeated_call_count: record.repeatedCallCount,
      consecutive_failure_count: record.consecutiveFailureCount,
      consecutive_no_progress_count: record.consecutiveNoProgressCount,
    })),
    terminal_stop_reason: params.terminalStopReason ?? null,
    terminal_failure_code: params.terminalFailureCode ?? null,
    pending_tool_call_id: params.pendingToolCallId ?? null,
  };
}
