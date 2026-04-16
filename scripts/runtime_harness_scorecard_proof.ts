import assert from "node:assert/strict";

import {
  applyRuntimeHarnessTelemetryEvent,
  buildRuntimeHarnessScorecard,
  buildRuntimeHarnessTelemetrySummaryFromEvents,
  createEmptyRuntimeHarnessTelemetrySummary,
} from "../shared/runtimeHarnessScorecard.ts";

const runParallelEvents = [
  {
    eventType: "tool_schedule_resolved",
    payload: {
      batch_call_count: 2,
      decision: "parallel",
      execution_mode: "parallel_read_batch",
      summary: {
        parallelEligible: 2,
      },
    },
  },
  {
    eventType: "tool_batch_telemetry",
    payload: {
      actual_execution_mode: "parallel",
      estimated_parallel_savings_ms: 120,
      batch_wall_time_ms: 80,
      serial_duration_estimate_ms: 200,
      parallel_blocker_reason_counts: {},
      tool_status_counts: {
        ok: 2,
      },
      tools: [
        {
          tool_name: "read",
          duration_ms: 100,
          status: "ok",
        },
        {
          tool_name: "glob",
          duration_ms: 100,
          status: "ok",
        },
      ],
    },
  },
] as const;

const runSerialEvents = [
  {
    eventType: "tool_schedule_resolved",
    payload: {
      batch_call_count: 1,
      decision: "serial",
      execution_mode: "serial",
      summary: {
        parallelEligible: 0,
      },
    },
  },
  {
    eventType: "tool_batch_telemetry",
    payload: {
      actual_execution_mode: "serial",
      estimated_parallel_savings_ms: 0,
      batch_wall_time_ms: 50,
      serial_duration_estimate_ms: 50,
      parallel_blocker_reason_counts: {
        mutates_state: 1,
      },
      tool_status_counts: {
        error: 1,
      },
      tools: [
        {
          tool_name: "write",
          duration_ms: 50,
          status: "error",
        },
      ],
    },
  },
] as const;

let incrementalParallelSummary = createEmptyRuntimeHarnessTelemetrySummary();
for (const event of runParallelEvents) {
  incrementalParallelSummary = applyRuntimeHarnessTelemetryEvent({
    summary: incrementalParallelSummary,
    eventType: event.eventType,
    payload: event.payload,
  });
}
const replayedParallelSummary = buildRuntimeHarnessTelemetrySummaryFromEvents([
  ...runParallelEvents,
]);
assert.deepEqual(incrementalParallelSummary, replayedParallelSummary);

const scorecard = buildRuntimeHarnessScorecard({
  nowMs: 1_700_000_000_000,
  runs: [
    {
      run: {
        runId: "run-parallel",
        status: "ok",
        visibility: "user_visible",
        startedAt: 1_000,
        finishedAt: 5_000,
      },
      telemetrySummary: replayedParallelSummary,
    },
    {
      run: {
        runId: "run-serial",
        status: "error",
        visibility: "user_visible",
        startedAt: 6_000,
        finishedAt: 10_000,
      },
      telemetrySummary: buildRuntimeHarnessTelemetrySummaryFromEvents([
        ...runSerialEvents,
      ]),
    },
  ],
});

assert.equal(scorecard.window.runCount, 2);
assert.equal(scorecard.window.finishedRunCount, 2);
assert.equal(scorecard.window.runsWithToolScheduleTelemetry, 2);
assert.equal(scorecard.window.runsWithParallelExecution, 1);

assert.equal(scorecard.scheduling.totalScheduleEvents, 2);
assert.equal(scorecard.scheduling.totalBatchTelemetryEvents, 2);
assert.equal(scorecard.scheduling.scheduledCallCount, 3);
assert.equal(scorecard.scheduling.parallelScheduledBatchCount, 1);
assert.equal(scorecard.scheduling.parallelExecutedBatchCount, 1);
assert.equal(scorecard.scheduling.parallelEligibleCallCount, 2);
assert.equal(scorecard.scheduling.blockerReasonCounts.mutates_state, 1);

assert.equal(scorecard.savings.totalEstimatedParallelSavingsMs, 120);
assert.equal(scorecard.savings.averageEstimatedParallelSavingsPerParallelBatchMs, 120);
assert.equal(scorecard.savings.totalBatchWallTimeMs, 130);
assert.equal(scorecard.savings.totalSerialDurationEstimateMs, 250);

assert.equal(scorecard.tools.totalObservedToolCalls, 3);
assert.equal(scorecard.tools.toolStatusCounts.ok, 2);
assert.equal(scorecard.tools.toolStatusCounts.error, 1);
assert.equal(scorecard.tools.mostUsedTools[0]?.toolName, "glob");
assert.equal(scorecard.tools.slowestToolsByAverageDuration[0]?.averageDurationMs, 100);

assert.equal(scorecard.latency.averageRunWallTimeMs, 4_000);
assert.equal(scorecard.latency.medianRunWallTimeMs, 4_000);
assert.equal(scorecard.latency.p95RunWallTimeMs, 4_000);

assert.equal(scorecard.runs[0]?.runId, "run-serial");
assert.equal(scorecard.runs[1]?.runId, "run-parallel");

console.log("runtime_harness_scorecard_proof: ok");
