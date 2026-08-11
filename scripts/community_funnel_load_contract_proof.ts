import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const funnelActions = read("apps/web/src/controllers/useWebPublicFunnelActions.ts");
const app = read("apps/web/src/App.tsx");

// --- The base load must MERGE into the same community, never replace it ---
// The memory graph + stats are folded in by async fetches; a bare replace on a
// re-fire drops them for a beat, which is the right-panel flicker.
assert.match(
  funnelActions,
  /setPublicCommunity\(\(prev\) =>[\s\S]{0,200}prev\.slug === resolvedSlug[\s\S]{0,160}\.\.\.prev,[\s\S]{0,80}\.\.\.loadedCommunity/,
  "the funnel base load must merge into prev on same-slug (keep memory/stats), never bare-replace the community",
);
assert.doesNotMatch(
  funnelActions,
  /setPublicCommunity\(\{/,
  "the funnel base load must not do a bare object-literal replace of the community — that drops merged memory/stats and flickers the panel",
);

// --- The funnel load must re-fire on subject changes, not session identity churn ---
assert.match(
  app,
  /sessionDependency: resolveAuthSubject\(session\)/,
  "the funnel load effect dependency must be the stable authenticated subject, not the session object",
);
assert.doesNotMatch(
  app,
  /sessionDependency: session,/,
  "the funnel load must not depend on the raw session object identity — it re-hammers the load + stats query and blinks the panel",
);

console.log("community funnel load contract proof passed: base load merges (no flicker), effect re-fires on subject changes only.");
