import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const workspaceHost = read("apps/web/src/components/WebWorkspaceHost.tsx");

assert.match(
  workspaceHost,
  /function isWorkspaceEditableElement\(element: Element \| null\): boolean/,
  "workspace composer focus policy must explicitly detect editable targets",
);
assert.match(
  workspaceHost,
  /function isWorkspaceInteractiveElement\(element: Element \| null\): boolean/,
  "workspace composer focus policy must explicitly detect interactive targets",
);
assert.match(
  workspaceHost,
  /function shouldFocusWorkspaceComposerFromPointer\(target: EventTarget \| null\): boolean[\s\S]*isWorkspaceInteractiveElement\(target\)[\s\S]*\.message-item[\s\S]*\.message-text[\s\S]*\.workspace-right-panel/,
  "inert workspace clicks must not steal focus from messages, text, controls, or the right panel",
);
assert.match(
  workspaceHost,
  /function shouldRestoreWorkspaceComposerAfterGlobalPointer\(target: EventTarget \| null\): boolean[\s\S]*isWorkspaceEditableElement\(target\)[\s\S]*\.message-item[\s\S]*\.message-text[\s\S]*\.workspace-right-panel__resize-handle[\s\S]*\[role='dialog'\]/,
  "global shell and panel clicks should restore composer focus while preserving editors, dialogs, previews, resize handles, and selectable message text",
);
assert.match(
  workspaceHost,
  /const focusWorkspaceComposerSafely = useCallback\(\(options\?: \{ force\?: boolean \}\) => \{[\s\S]*input\.focus\(\{ preventScroll: true \}\);[\s\S]*input\.setSelectionRange\(end, end\);/,
  "composer focus must avoid scrolling the page and leave the caret at the end of the draft",
);
assert.match(
  workspaceHost,
  /function shouldPreserveWorkspaceComposerFocus\(activeElement: Element \| null, input: HTMLTextAreaElement\): boolean[\s\S]*isWorkspaceEditableElement\(activeElement\)[\s\S]*\.modal[\s\S]*\[role='dialog'\][\s\S]*\.workspace-app-preview-card/,
  "automatic composer focus must preserve active editable, dialog, and preview focus",
);
assert.doesNotMatch(
  workspaceHost.match(/function shouldPreserveWorkspaceComposerFocus[\s\S]*?export type WorkspaceComposerDraft/)?.[0] ?? "",
  /\.workspace-right-panel/,
  "automatic composer focus should not preserve generic right-panel button focus",
);
assert.match(
  workspaceHost,
  /if \(shouldPreserveWorkspaceComposerFocus\(activeElement, input\)\) return activeElement === input;/,
  "automatic composer focus must not be blocked by unrelated navigation buttons that remain focused after route changes",
);
assert.match(
  workspaceHost,
  /if \(!isDesktopViewport\) return;[\s\S]*focusWorkspaceComposerSafely\(\);/,
  "automatic composer focus must be desktop-gated so mobile keyboards are not opened unexpectedly",
);
assert.match(
  workspaceHost,
  /window\.addEventListener\("focus", handleFocus\);[\s\S]*document\.addEventListener\("visibilitychange", handleFocus\);/,
  "workspace must restore composer focus when the app window becomes active again",
);
assert.match(
  workspaceHost,
  /const handleGlobalPointerUp = \(event: globalThis\.PointerEvent\) => \{[\s\S]*shouldRestoreWorkspaceComposerAfterGlobalPointer\(event\.target\)[\s\S]*focusWorkspaceComposerSafely\(\{ force: true \}\);[\s\S]*document\.addEventListener\("pointerup", handleGlobalPointerUp, true\);[\s\S]*document\.removeEventListener\("pointerup", handleGlobalPointerUp, true\);/,
  "workspace shell panel clicks must restore composer focus after the click action completes",
);
assert.match(
  workspaceHost,
  /const handleWorkspaceInertPointerDown = useCallback\([\s\S]*shouldFocusWorkspaceComposerFromPointer\(event\.target\)[\s\S]*focusWorkspaceComposerSafely\(\{ force: true \}\);/,
  "blank workspace pointer interaction must put the user back into the composer",
);
assert.match(
  workspaceHost,
  /className=\{`workspace-body[\s\S]*onPointerDown=\{handleWorkspaceInertPointerDown\}/,
  "workspace body must wire the inert click-to-focus policy",
);
assert.match(
  workspaceHost,
  /className=\{`workspace-composer-shell[\s\S]*onPointerDown=\{handleWorkspaceInertPointerDown\}/,
  "workspace composer shell must wire the inert click-to-focus policy",
);
assert.match(
  workspaceHost,
  /focus: \(\) => \{[\s\S]*focusWorkspaceComposerSafely\(\{ force: true \}\);[\s\S]*reset: \(\) => \{[\s\S]*focusWorkspaceComposerSafely\(\{ force: true \}\);/,
  "registered composer API must use the same safe force-focus path for explicit focus and reset",
);

console.log("workspace_composer_focus_policy_proof: ok");
