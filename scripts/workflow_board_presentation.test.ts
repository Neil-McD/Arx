import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const css = readFileSync(new URL("../apps/web/src/components/WebCommunityWorkflowsSection.css", import.meta.url), "utf8");
const component = readFileSync(new URL("../apps/web/src/components/WebCommunityWorkflowsSection.tsx", import.meta.url), "utf8");
const editor = readFileSync(new URL("../apps/web/src/components/WebCommunityWorkflowMilestoneModal.tsx", import.meta.url), "utf8");
const automation = readFileSync(new URL("../apps/web/src/components/WebCommunityWorkflowAutomationEditor.tsx", import.meta.url), "utf8");

test("milestone editor reuses resource styles while retaining bounded scrolling", () => {
  expect(editor).toContain('className="resource-form workflow-milestone-form"');
  expect(editor).toContain('className="resource-field-label"');
  expect(css).toContain("max-height: calc(100dvh - 2 * var(--workflow-editor-inset))");
  expect(css).toContain("overscroll-behavior: contain");
  expect(css).not.toContain(".workflow-action-consequence");
});

test("creation and advancement explain actual behavior without repeated condition labels", () => {
  expect(editor).toContain("Save this milestone to configure actions and movement.");
  expect(editor).toContain("All conditions must be met, in any order.");
  expect(editor).toContain("Does not wait for agent actions to finish.");
  expect(editor).toContain("workflowMoveLabel(props.nextMilestoneName)");
  expect(editor).not.toContain("conditions below");
  expect(automation).not.toContain("Required for completion");
  expect(automation).toContain("<strong>{actionLabel}</strong>");
  expect(automation).toContain("!isRequirement ? <small>{triggerLabel}</small>");
});

test("board keeps fixed lanes and uses defined canonical surfaces", () => {
  expect(css).toContain("flex: 0 0 272px");
  expect(css).toContain("overflow-x: auto");
  expect(css).toContain("background: var(--surface-panel)");
  expect(css).toContain("background: var(--surface-card)");
  expect(css).not.toContain("--surface-raised");
});

test("board actions remain discoverable without hover", () => {
  expect(css).not.toContain(".workflow-milestone-column:hover .workflow-milestone-edit-button");
  expect(component).toContain('<MoreHorizontal size={18} aria-hidden="true" />');
  expect(component).not.toContain("<Pencil");
  expect(component).toMatch(/\}\)\}\s*<\/div>\s*<button\s+className="workflow-add-milestone-button"/);
  expect(css).toContain("border-bottom: 1px solid var(--stroke-divider-accent)");
  expect(css).toContain(".workflow-board-stage");
  expect(component).toContain('aria-label="Add milestone"');
  expect(component).toContain("aria-label={`Edit ${milestone.name}`}");
});
