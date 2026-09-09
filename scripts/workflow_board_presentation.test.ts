import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const css = readFileSync(new URL("../apps/web/src/components/WebCommunityWorkflowsSection.css", import.meta.url), "utf8");
const component = readFileSync(new URL("../apps/web/src/components/WebCommunityWorkflowsSection.tsx", import.meta.url), "utf8");

test("board keeps fixed lanes and uses defined canonical surfaces", () => {
  expect(css).toContain("flex: 0 0 272px");
  expect(css).toContain("overflow-x: auto");
  expect(css).toContain("background: var(--surface-panel)");
  expect(css).toContain("background: var(--surface-card)");
  expect(css).not.toContain("--surface-raised");
});

test("board actions remain discoverable without hover", () => {
  expect(css).not.toContain(".workflow-milestone-column:hover .workflow-milestone-edit-button");
  expect(component).toMatch(/<Plus size=\{19\} aria-hidden="true" \/>\s+Add milestone/);
  expect(component).toContain("aria-label={`Edit ${milestone.name}`}");
});
