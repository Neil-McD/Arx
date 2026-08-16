import { describe, expect, it } from "vitest";
import {
  PI_AGENT_CORE_ADMISSION_CONSTANTS,
  runPiAgentCoreAdmissionProbe,
} from "./support/piAgentCoreAdmissionProbe.ts";

describe("Pi agent-core admission", () => {
  it("returns a final response with the exact server-owned prompt and tools", async () => {
    const result = await runPiAgentCoreAdmissionProbe("assistant_final");

    expect(result.finalAssistantText).toBe("Pi admission probe complete.");
    expect(result.finalStopReason).toBe("stop");
    expect(result.providerSystemPrompts).toEqual([
      PI_AGENT_CORE_ADMISSION_CONSTANTS.systemPrompt,
    ]);
    expect(result.providerToolNames).toEqual([
      [...PI_AGENT_CORE_ADMISSION_CONSTANTS.admittedToolNames],
    ]);
    expect(result.eventTypes[0]).toBe("agent_start");
    expect(result.eventTypes.at(-1)).toBe("agent_end");
  });

  it("round-trips one admitted tool through the closed probe registry", async () => {
    const result = await runPiAgentCoreAdmissionProbe("admitted_tool");

    expect(result.providerCalls).toBe(2);
    expect(result.executedToolNames).toEqual(["polynet_read_one"]);
    expect(result.observedToolResults.at(-1)).toMatchObject({
      toolCallId: "admitted-1",
      toolName: "polynet_read_one",
      isError: false,
    });
    expect(result.eventTypes).toContain("tool_execution_start");
    expect(result.eventTypes).toContain("tool_execution_end");
  });

  it("lets Pi reject a provider-selected tool absent from the admitted set", async () => {
    const result = await runPiAgentCoreAdmissionProbe("unknown_tool");

    expect(result.executedToolNames).toEqual([]);
    expect(result.observedToolResults.at(-1)).toMatchObject({
      toolCallId: "unknown-1",
      toolName: PI_AGENT_CORE_ADMISSION_CONSTANTS.unknownToolName,
      isError: true,
    });
    expect(result.observedToolResults.at(-1)?.text).toContain("not found");
  });

  it("rejects invalid arguments before the admitted implementation runs", async () => {
    const result = await runPiAgentCoreAdmissionProbe("invalid_arguments");

    expect(result.executedToolNames).toEqual([]);
    expect(result.observedToolResults.at(-1)).toMatchObject({
      toolCallId: "invalid-1",
      toolName: "polynet_read_one",
      isError: true,
    });
  });

  it("propagates an already-aborted signal into the provider boundary", async () => {
    const result = await runPiAgentCoreAdmissionProbe("aborted");

    expect(result.providerCalls).toBe(1);
    expect(result.executedToolNames).toEqual([]);
    expect(result.finalStopReason).toBe("aborted");
    expect(result.eventTypes.at(-1)).toBe("agent_end");
  });

  it("preserves serial execution and source-ordered tool results", async () => {
    const result = await runPiAgentCoreAdmissionProbe("serial_batch");

    expect(result.executedToolNames).toEqual([
      "polynet_read_one",
      "polynet_read_two",
    ]);
    expect(result.maxInFlight).toBe(1);
    expect(result.observedToolResults.slice(-2).map((entry) => entry.toolCallId)).toEqual([
      "batch-1",
      "batch-2",
    ]);
  });

  it("executes a permitted parallel batch concurrently but returns source order", async () => {
    const result = await runPiAgentCoreAdmissionProbe("parallel_batch");

    expect(result.executedToolNames).toEqual([
      "polynet_read_one",
      "polynet_read_two",
    ]);
    expect(result.maxInFlight).toBe(2);
    expect(result.observedToolResults.slice(-2).map((entry) => entry.toolCallId)).toEqual([
      "batch-1",
      "batch-2",
    ]);
  });
});
