import { expect, test } from "vitest";
import { memoryAgentStatus } from "../apps/web/src/components/ChannelRosterPanel";

const overview = (state: string, stopReason: string | null = null) => ({
  agent: {
    key: "community_agent" as const, status: state, activity_state: state, last_run_at: null, last_run_status: state,
    last_wake_reason: null, recent_actions_summary: { applied: 0 },
    recent_runs: [{ id: "run", status: state, activity_state: state, trigger_type: "heartbeat", heartbeat_id: null, wake_reason: null,
      stop_reason: stopReason, tool_step_count: 0, applied_change_request_count: 0, started_at: null, finished_at: null }],
  },
});

test("the memory card says why the agent couldn't run instead of a bare Error", () => {
  const funding = "Couldn't run: AI usage isn't set up or has run out";
  expect(memoryAgentStatus(overview("error", "founder_inference_pricing_misconfigured"))).toBe(funding);
  expect(memoryAgentStatus(overview("error", "Uncaught Error: founder_inference_pricing_misconfigured at handler"))).toBe(funding);
  expect(memoryAgentStatus(overview("error", "runtime_exception"))).toBe("Couldn't run last time");
  expect(memoryAgentStatus(overview("error"))).toBe("Couldn't run last time");
  expect(memoryAgentStatus(overview("resting"))).toBe("Resting");
  expect(memoryAgentStatus(overview("updated_directory"))).toBe("Updated memory");
  expect(memoryAgentStatus(overview("some_new_state"))).toBe("Some New State");
});

test("members see a calm status when the agent couldn't run", () => {
  expect(memoryAgentStatus(overview("error", "founder_inference_pricing_misconfigured"), { canManage: false })).toBe("Resting");
  expect(memoryAgentStatus(overview("resting"), { canManage: false })).toBe("Resting");
  expect(memoryAgentStatus(overview("error"), { canManage: true })).toBe("Couldn't run last time");
});
