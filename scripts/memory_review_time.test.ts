import { expect, it } from "vitest";
import { nextMemoryReviewAtMs } from "../shared/communityMemory";

it("the nightly review runs at the next 3 am in the community's time zone", () => {
  const afternoon = Date.UTC(2026, 10, 14, 15, 0, 0);
  expect(nextMemoryReviewAtMs(afternoon, "UTC")).toBe(Date.UTC(2026, 10, 15, 3, 0, 0));
  expect(nextMemoryReviewAtMs(afternoon, null)).toBe(Date.UTC(2026, 10, 15, 3, 0, 0));
  // New York is UTC-5 in November: 3 am there is 8 am UTC.
  expect(nextMemoryReviewAtMs(afternoon, "America/New_York")).toBe(Date.UTC(2026, 10, 15, 8, 0, 0));
  // Just before 3 am it is the same night, not the next.
  expect(nextMemoryReviewAtMs(Date.UTC(2026, 10, 15, 2, 40, 0), "UTC")).toBe(Date.UTC(2026, 10, 15, 3, 0, 0));
  expect(nextMemoryReviewAtMs(Date.UTC(2026, 10, 15, 3, 5, 0), "UTC")).toBe(Date.UTC(2026, 10, 16, 3, 0, 0));
  expect(nextMemoryReviewAtMs(afternoon, "Not/AZone")).toBe(Date.UTC(2026, 10, 15, 3, 0, 0));
});
