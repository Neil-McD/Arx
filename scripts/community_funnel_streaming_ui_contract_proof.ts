import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const editor = read("apps/web/src/components/WebCommunityFunnelEditor.tsx");
const dock = read("apps/web/src/components/WebMemberAgentDock.tsx");
const liveTurn = read("apps/web/src/components/WebAgentLiveTurn.tsx");
const liveTurnStyles = read("apps/web/src/components/WebAgentLiveTurn.css");
const dockStyles = read("apps/web/src/components/WebMemberAgentDock.css");
const turnRunner = read("shared/useWebTurnRunnerController.ts");

// One presentation path consumes the existing SSE/runtime state on both
// surfaces. Neither surface owns a second transport or typing simulation.
assert.match(dock, /import \{ WebAgentLiveTurn \}/);
assert.match(editor, /import \{ WebAgentLiveTurn \}/);
assert.match(dock, /<WebAgentLiveTurn[\s\S]*variant="dock"/);
assert.match(editor, /<WebAgentLiveTurn[\s\S]*variant="funnel"/);
assert.doesNotMatch(editor, /streamingState\?\.content \? \(/);
assert.doesNotMatch(liveTurn, /EventSource|WebSocket|setInterval/);
assert.match(turnRunner, /maxDelayMs = 1200/);

// Runtime events remain authoritative for activity, while assistant text uses
// the controller's smoothed aggregate path exactly once.
assert.match(liveTurn, /event\.event_type !== "assistant_text_delta"/);
assert.match(
  liveTurn,
  /const shouldRenderStreamedText = Boolean\(normalizedText\)/,
);
assert.match(liveTurn, /events=\{timelineEvents\}/);
assert.match(liveTurn, /<RuntimeLiveTimeline/);
assert.match(liveTurn, /props\.renderMarkdown\(normalizedText\)/);
assert.match(liveTurn, /web-agent-live-turn-caret/);
assert.match(liveTurn, /props\.fallbackLabel/);

// Funnel streaming is cancellable, follows only while pinned near the bottom,
// and leaves preview refresh on the canonical post-turn path.
assert.match(editor, /onClick=\{\(\) => stopStreamingTurn\(threadKey\)\}/);
assert.match(editor, /<Square aria-hidden="true"/);
assert.match(editor, /setIsAwaitingStream\(true\)/);
assert.match(editor, /onStreamStart: \(\) => setIsAwaitingStream\(false\)/);
assert.match(editor, /isActive=\{turnIsActive \|\| isAwaitingStream\}/);
assert.match(editor, /distanceFromBottom <= 48/);
assert.match(editor, /if \(!followStreamingRef\.current\) return/);
assert.match(
  editor,
  /await runAgentTurn\([\s\S]*await Promise\.all\(\[[\s\S]*refreshDraft\(session\)/,
);

// Stream and durable assistant messages share markdown presentation.
assert.match(editor, /message\.role === "assistant"[\s\S]*renderMarkdown/);

// Motion remains restrained and honors the platform preference. Old dock-only
// streaming selectors are removed so the extracted component is canonical.
assert.match(liveTurnStyles, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(liveTurnStyles, /web-agent-live-turn-caret/);
assert.doesNotMatch(dockStyles, /member-agent-dock-caret/);
assert.doesNotMatch(dockStyles, /member-agent-dock-live-turn/);

console.log("community funnel streaming UI contract proof passed");
