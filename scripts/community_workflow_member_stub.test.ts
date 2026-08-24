import { expect, test } from "vitest";

import { formatWorkflowStageAge } from "../apps/web/src/components/WebCommunityWorkflowMemberStub";

const NOW_MS = Date.parse("2026-08-24T14:00:00.000Z");

test("workflow member stub expresses recent stage age without false precision", () => {
  expect(
    formatWorkflowStageAge("2026-08-24T13:59:30.000Z", NOW_MS),
  ).toBe("Entered just now");
  expect(
    formatWorkflowStageAge("2026-08-24T11:00:00.000Z", NOW_MS),
  ).toBe("In this stage 3h");
  expect(
    formatWorkflowStageAge("2026-08-20T14:00:00.000Z", NOW_MS),
  ).toBe("In this stage 4d");
});

test("workflow member stub keeps long stage age compact", () => {
  expect(
    formatWorkflowStageAge("2026-08-03T14:00:00.000Z", NOW_MS),
  ).toBe("In this stage 3w");
  expect(
    formatWorkflowStageAge("2026-05-24T14:00:00.000Z", NOW_MS),
  ).toBe("In this stage 3mo");
});

test("workflow member stub handles invalid and future timestamps safely", () => {
  expect(formatWorkflowStageAge("not-a-date", NOW_MS)).toBe(
    "Stage timing unavailable",
  );
  expect(
    formatWorkflowStageAge("2026-08-25T14:00:00.000Z", NOW_MS),
  ).toBe("Entered just now");
});
