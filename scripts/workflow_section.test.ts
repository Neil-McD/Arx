import { expect, it } from "vitest";
import { isWorkflowMembersSearch, workflowSectionFromSearch, workflowSectionUrl } from "../shared/workflowSection";
import { parseCommunityTab } from "../shared/appShellNavigation";
it("accepts launch sections and sends deferred integration links to workflows", () => {
  expect(workflowSectionFromSearch("?section=forms")).toBe("forms");
  // Members moved to its own tab: old links are sent there, never to a Workflows section.
  expect(workflowSectionFromSearch("?section=clients")).toBe("workflows");
  expect(isWorkflowMembersSearch("?section=clients")).toBe(true);
  expect(isWorkflowMembersSearch("?section=forms")).toBe(false);
  expect(parseCommunityTab("people")).toBe("people");
  expect(parseCommunityTab("clients")).toBe("people");
  expect(workflowSectionFromSearch("?section=runs")).toBe("runs");
  // Old Test run links land on Run history, which holds the tests now.
  expect(workflowSectionFromSearch("?section=test")).toBe("runs");
  expect(workflowSectionFromSearch("?section=integrations")).toBe("workflows");
  expect(workflowSectionFromSearch("?section=unknown")).toBe("workflows");
  expect(workflowSectionFromSearch("")).toBe("workflows");
});
it("keeps community scope and unrelated URL state intact", () => {
  expect(workflowSectionUrl("https://example.com/c/test/workflows?other=1#anchor", "forms"))
    .toBe("/c/test/workflows?other=1&section=forms#anchor");
  expect(workflowSectionUrl("https://example.com/c/test/workflows?section=forms", "workflows"))
    .toBe("/c/test/workflows");
});
