import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const css = readFileSync(new URL("../apps/web/src/components/WebCommunityWorkflowsSection.css", import.meta.url), "utf8");
const component = readFileSync(new URL("../apps/web/src/components/WebCommunityWorkflowsSection.tsx", import.meta.url), "utf8");
const editor = readFileSync(new URL("../apps/web/src/components/WebCommunityWorkflowMilestoneModal.tsx", import.meta.url), "utf8");
const automation = readFileSync(new URL("../apps/web/src/components/WebCommunityWorkflowAutomationEditor.tsx", import.meta.url), "utf8");

test("automation editor reuses compact form selectors instead of radio banks", () => {
  expect(automation).toContain('<label>When');
  expect(automation).toContain('<label>Then');
  expect(automation).toContain('Choose a trigger');
  expect(automation).toContain('Choose an action');
  expect(automation).not.toContain('type="radio"');
  expect(automation).not.toContain('ChevronDown');
  expect(css).not.toContain('.workflow-action-choice span');
});

test("milestone editor reuses resource styles while retaining bounded scrolling", () => {
  expect(editor).toContain('className="resource-form workflow-milestone-form"');
  expect(editor).toContain('className="resource-field-label"');
  expect(css).toContain("max-height: calc(100dvh - 2 * var(--workflow-editor-inset))");
  expect(css).toContain("overscroll-behavior: contain");
  expect(css).not.toContain(".workflow-action-consequence");
  expect(css).toContain(".workflow-milestone-modal .resource-form textarea:focus");
  expect(css).toContain("field-sizing: content");
  expect(css).not.toContain(".workflow-milestone-modal input:focus-visible,");
  expect(editor).toContain('"New milestone"');
});

test("creation and advancement explain actual behavior without repeated condition labels", () => {
  expect(editor).toContain("Save this milestone to configure actions and movement.");
  expect(editor).toContain("All conditions must be met, in any order.");
  expect(editor).toContain("Does not wait for agent actions to finish.");
  expect(editor).toContain("workflowMoveLabel(props.nextMilestoneName)");
  expect(editor).not.toContain("conditions below");
  expect(automation).not.toContain("Required for completion");
  expect(automation).toContain("<strong>{triggerLabel}</strong>");
  expect(automation).toContain("!isRequirement ? <small>→ {actionLabel}</small>");
});

test("milestone views share the draft and progressive creation does not preselect choices", () => {
  expect(editor).toContain('WebPlatformTabList');
  expect(editor).toContain('label: "Overview"');
  expect(editor).toContain('label: "Automations"');
  expect(editor).toContain('&& !pendingAutomation');
  expect(editor).toContain('setSelection({ triggerSelected: false, actionSelected: false })');
  expect(editor).toContain('>Done</button>');
  expect(editor).toContain('dependent actions wait for the preceding action to complete');
  expect(automation).toContain('Previous action completed');
  expect(automation).toContain('value={triggerSelected ? automation.trigger.type : ""}');
  expect(automation).toContain('value={actionSelected ? automation.action.type : ""}');
  expect(automation).toContain('triggerReady && !isRequirement');
  expect(editor).toContain('Automatic advancement (existing system)');
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
  expect(css).toContain("padding-inline: 8px");
  expect(css).toContain("background: var(--community-rail-control-bg)");
  expect(css).toContain("border: var(--community-rail-button-border)");
  expect(component).toContain('aria-label="Add milestone"');
  expect(component).toContain("aria-label={`Edit ${milestone.name}`}");
});
