import { expect, it } from "vitest";
import { workflowSectionFromSearch, workflowSectionUrl } from "../shared/workflowSection";
it("accepts only the three workflow sections", () => {
  expect(workflowSectionFromSearch("?section=forms")).toBe("forms");
  expect(workflowSectionFromSearch("?section=integrations")).toBe("integrations");
  expect(workflowSectionFromSearch("?section=unknown")).toBe("workflows");
  expect(workflowSectionFromSearch("")).toBe("workflows");
});
it("keeps community scope and unrelated URL state intact", () => {
  expect(workflowSectionUrl("https://example.com/c/test/workflows?other=1#anchor", "forms"))
    .toBe("/c/test/workflows?other=1&section=forms#anchor");
  expect(workflowSectionUrl("https://example.com/c/test/workflows?section=forms", "workflows"))
    .toBe("/c/test/workflows");
});
