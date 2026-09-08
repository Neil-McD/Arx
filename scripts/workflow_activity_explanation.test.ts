import { expect, test } from "vitest";
import { workflowActivityExplanation as explain } from "../shared/workflowActivityExplanation";

test.each(["queued", "running", "responded", "requested", "channel_ready"])("does not diagnose live or successful work: %s", status => {
  expect(explain(status, "channel_access_missing")).toEqual({});
});
test("unknown errors never leak payloads or claim non-delivery", () => {
  const result = explain("failed", "PRIVATE_PROVIDER_PAYLOAD");
  expect(result.failure_reason).toContain("partial work");
  expect(result.failure_reason).not.toContain("PRIVATE_PROVIDER_PAYLOAD");
  expect(result.failure_reason).not.toContain("Not delivered");
});
test("unverifiable links never diagnose from a foreign error", () => {
  expect(explain("unavailable", "workflow_member_context_changed")).toEqual(explain("unavailable"));
});
test("only a recorded context change establishes no longer applicable", () => {
  expect(explain("failed", "workflow_member_context_changed").status).toBe("not_applicable");
  expect(explain("failed", "workflow_timer_unavailable").status).toBeUndefined();
});
test("trusted intake codes share the same explanation", () => {
  expect(explain("failed", "agent_channel_access_missing")).toEqual(explain("failed", "channel_access_missing"));
});
