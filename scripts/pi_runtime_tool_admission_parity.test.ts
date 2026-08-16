import { describe, expect, it } from "vitest";
import { runPiAgentCoreAdmissionProbe } from "./support/piAgentCoreAdmissionProbe.ts";

describe("Pi governed tool-admission parity", () => {
  it("atomically rejects an over-budget batch before any admitted start or execution", async () => {
    const result = await runPiAgentCoreAdmissionProbe("over_budget_batch");

    expect(result.admissionFailure).toEqual({
      code: "tool_budget_exhausted",
      pendingToolCallId: "batch-2",
      pendingToolName: "polynet_read_two",
    });
    expect(result.providerCalls).toBe(1);
    expect(result.eventTypes).toContain("tool_execution_start");
    expect(result.admittedToolStartIds).toEqual([]);
    expect(result.admittedToolFinishes).toEqual([]);
    expect(result.executedToolCallIds).toEqual([]);
  });

  it("atomically rejects a repeated call inside a batch", async () => {
    const result = await runPiAgentCoreAdmissionProbe("repeated_batch");

    expect(result.admissionFailure).toEqual({
      code: "repeated_call_blocked",
      pendingToolCallId: "repeat-2",
      pendingToolName: "polynet_read_one",
    });
    expect(result.providerCalls).toBe(1);
    expect(result.admittedToolStartIds).toEqual([]);
    expect(result.admittedToolFinishes).toEqual([]);
    expect(result.executedToolCallIds).toEqual([]);
  });

  it("carries repetition state across turns and blocks before a second execution", async () => {
    const result = await runPiAgentCoreAdmissionProbe("repeated_across_turns");

    expect(result.admissionFailure).toEqual({
      code: "repeated_call_blocked",
      pendingToolCallId: "repeat-turn-2",
      pendingToolName: "polynet_read_one",
    });
    expect(result.providerCalls).toBe(2);
    expect(result.admittedToolStartIds).toEqual(["repeat-turn-1"]);
    expect(result.executedToolCallIds).toEqual(["repeat-turn-1"]);
  });

  it("rejects an allowed and unknown mixed batch before admitting either member", async () => {
    const result = await runPiAgentCoreAdmissionProbe("mixed_unknown_batch");

    expect(result.admissionFailure).toEqual({
      code: "invalid_model_output",
      pendingToolCallId: "mixed-unknown",
      pendingToolName: "polynet_unadmitted_write",
    });
    expect(result.providerCalls).toBe(1);
    expect(result.admittedToolStartIds).toEqual([]);
    expect(result.admittedToolFinishes).toEqual([]);
    expect(result.executedToolCallIds).toEqual([]);
  });

  it("rejects duplicate provider call IDs before tool admission", async () => {
    const result = await runPiAgentCoreAdmissionProbe("duplicate_call_ids");

    expect(result.admissionFailure).toEqual({
      code: "invalid_model_output",
      pendingToolCallId: "duplicate",
      pendingToolName: "polynet_read_two",
    });
    expect(result.providerCalls).toBe(1);
    expect(result.admittedToolStartIds).toEqual([]);
    expect(result.admittedToolFinishes).toEqual([]);
    expect(result.executedToolCallIds).toEqual([]);
  });

  it("fails a terminal liveness check before admitting a tool", async () => {
    const result = await runPiAgentCoreAdmissionProbe(
      "inactive_before_admission",
    );

    expect(result.admissionFailure).toEqual({
      code: "runtime_run_not_active",
      pendingToolCallId: "inactive-1",
      pendingToolName: "polynet_read_one",
    });
    expect(result.providerCalls).toBe(1);
    expect(result.admittedToolStartIds).toEqual([]);
    expect(result.admittedToolFinishes).toEqual([]);
    expect(result.executedToolCallIds).toEqual([]);
  });

  it("rechecks liveness between batch preflight and the admitted start", async () => {
    const result = await runPiAgentCoreAdmissionProbe(
      "inactive_between_preflight_and_start",
    );

    expect(result.admissionFailure).toEqual({
      code: "runtime_run_not_active",
      pendingToolCallId: "inactive-race-1",
      pendingToolName: "polynet_read_one",
    });
    expect(result.providerCalls).toBe(1);
    expect(result.admittedToolStartIds).toEqual([]);
    expect(result.admittedToolFinishes).toEqual([]);
    expect(result.executedToolCallIds).toEqual([]);
  });

  it("starts admitted malformed calls but never invokes their executor", async () => {
    const result = await runPiAgentCoreAdmissionProbe("invalid_arguments");

    expect(result.admissionFailure).toBeNull();
    expect(result.admittedToolStartIds).toEqual(["invalid-1"]);
    expect(result.admittedToolFinishes).toEqual([
      { toolCallId: "invalid-1", isError: true },
    ]);
    expect(result.executedToolCallIds).toEqual([]);
  });

  it("preserves admitted starts and source-ordered results for a mixed valid and invalid batch", async () => {
    const result = await runPiAgentCoreAdmissionProbe(
      "mixed_valid_invalid_batch",
    );

    expect(result.admissionFailure).toBeNull();
    expect(result.admittedToolStartIds).toEqual([
      "mixed-invalid",
      "mixed-valid",
    ]);
    expect(result.executedToolCallIds).toEqual(["mixed-valid"]);
    expect(result.returnedToolResults.map((entry) => entry.toolCallId)).toEqual([
      "mixed-invalid",
      "mixed-valid",
    ]);
    expect(result.returnedToolResults.map((entry) => entry.isError)).toEqual([
      true,
      false,
    ]);
  });

  it("preserves serial execution and source order", async () => {
    const result = await runPiAgentCoreAdmissionProbe("serial_batch");

    expect(result.admissionFailure).toBeNull();
    expect(result.admittedToolStartIds).toEqual(["batch-1", "batch-2"]);
    expect(result.executedToolCallIds).toEqual(["batch-1", "batch-2"]);
    expect(result.returnedToolResults.map((entry) => entry.toolCallId)).toEqual([
      "batch-1",
      "batch-2",
    ]);
    expect(result.maxInFlight).toBe(1);
  });

  it("preserves permitted parallel execution with source-ordered results", async () => {
    const result = await runPiAgentCoreAdmissionProbe("parallel_batch");

    expect(result.admissionFailure).toBeNull();
    expect(result.admittedToolStartIds).toEqual(["batch-1", "batch-2"]);
    expect(result.executedToolCallIds).toEqual(["batch-1", "batch-2"]);
    expect(result.returnedToolResults.map((entry) => entry.toolCallId)).toEqual([
      "batch-1",
      "batch-2",
    ]);
    expect(result.maxInFlight).toBe(2);
  });
});
