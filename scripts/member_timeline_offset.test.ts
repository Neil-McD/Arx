import { expect, test } from "vitest";
import { normalizeToolArguments } from "../shared/toolRegistry";

// "Read this path again with offset 25" must reach the timeline intact.
test("a timeline read keeps its offset through tool validation; bad offsets are refused", () => {
  const path = "/communities/sunrise/members/maya/timeline.md";
  expect(normalizeToolArguments("polynet_read", { path, offset: 25 })).toMatchObject({ path, offset: 25 });
  expect(normalizeToolArguments("polynet_read", { path })).not.toHaveProperty("offset", 25);
  expect(() => normalizeToolArguments("polynet_read", { path, offset: 9_999 })).toThrow(/offset/);
});
