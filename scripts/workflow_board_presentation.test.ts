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

test("stage editor reuses resource styles while retaining bounded scrolling", () => {
  expect(editor).toContain('className="resource-form workflow-milestone-form"');
  expect(editor).toContain('className="resource-field-label"');
  expect(css).toContain("max-height: calc(100dvh - 2 * var(--workflow-editor-inset))");
  expect(css).toContain("overscroll-behavior: contain");
  expect(css).not.toContain(".workflow-action-consequence");
  expect(css).toContain(".workflow-milestone-modal .resource-form textarea:focus");
  expect(css).toContain("field-sizing: content");
  expect(css).not.toContain(".workflow-milestone-modal input:focus-visible,");
  expect(editor).toContain('"New stage"');
});

test("creation presents one trigger-to-action path", () => {
  expect(editor).toContain("Save this stage to configure actions.");
  expect(editor).not.toContain("Automatic advancement (existing system)");
  expect(editor).not.toContain("Add condition");
  expect(automation).not.toContain("Evaluate goal</option>");
  expect(automation).toContain("<strong>{triggerLabel}</strong>");
  expect(automation).toContain("<small>→ {actionLabel}</small>");
});

test("stage views share the draft and progressive creation does not preselect choices", () => {
  expect(editor).toContain('WebPlatformTabList');
  expect(editor).toContain('label: "Overview"');
  expect(editor).toContain('label: "Automations"');
  expect(editor).toContain('&& !pendingAutomation');
  expect(editor).toContain('setSelection({ triggerSelected: false, actionSelected: false })');
  expect(editor).toContain('>Done</button>');
  expect(editor).toContain('dependent actions wait for the preceding action to complete');
  expect(automation).toContain('After an earlier step');
  expect(automation).toContain('value={triggerSelected ? automation.trigger.type : ""}');
  expect(automation).toContain('value={actionSelected ? automation.action.type : ""}');
  expect(automation).toContain('triggerReady && !props.hideTypeSelects ? <label>Then');
  expect(editor).not.toContain('Automatic advancement (existing system)');
});

test("board keeps fixed lanes and uses defined canonical surfaces", () => {
  expect(css).toContain("flex: 0 0 272px");
  expect(css).toContain("overflow-x: auto");
  expect(css).toContain("background: var(--surface-panel)");
  expect(css).toContain("background: var(--surface-card)");
  expect(css).not.toContain("--surface-raised");
});

test("Workflows has one row of tabs and stages are set up from the automations list", () => {
  // The old Automations | Members switch under the tabs is gone: Members is the Members database tab.
  expect(component).not.toContain("pn-wf-view-switch");
  expect(component).toContain('workflows: "Automations", runs: "Run history", changes: "Recent changes", forms: "Forms", welcome: "Welcome page"');
  const automations = readFileSync(new URL("../apps/web/src/components/WebCommunityWorkflowAutomations.tsx", import.meta.url), "utf8");
  expect(automations).toContain("aria-label={`Stage settings for ${milestone.name}`}");
  expect(automations).toContain("onClick={props.onAddStage}");
  // One accent, no colour per kind of trigger (polynet-ui/airtable-study).
  const page = readFileSync(new URL("../apps/web/src/components/WebCommunityWorkflowsPage.css", import.meta.url), "utf8");
  expect(page).not.toContain("--au-people");
});
