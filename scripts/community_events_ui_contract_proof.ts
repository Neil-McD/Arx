import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const app = read("apps/web/src/App.tsx");
const controller = read("shared/useCommunityEventsController.ts");
const eventsPanel = read("apps/web/src/components/WebCommunityEventsSection.tsx");
const styles = read("apps/web/src/base.css");

assert.match(
  app,
  /function getCommunityEventsMonthRange[\s\S]*start\.setDate\(monthStart\.getDate\(\) - monthStart\.getDay\(\)\);[\s\S]*end\.setDate\(start\.getDate\(\) \+ 42\);/,
  "events fetch range must cover the full 42-day visible calendar grid, including adjacent month days",
);

assert.match(
  app,
  /const \[communityEventsByCacheKey, setCommunityEventsByCacheKey\] = useState<Record<string, CommunityEvent\[\]>>\(\{\}\);/,
  "events rows must be cached by community and visible range instead of one global list",
);

assert.match(
  app,
  /buildCommunityEventsCacheKey\(activeCommunityId, communityEventsVisibleRange\)/,
  "events cache key must include the active community and the active visible range",
);

assert.match(
  app,
  /invalidateCommunityEventsCacheForCommunity[\s\S]*key\.startsWith\(cacheKeyPrefix\)[\s\S]*invalidateCommunityEventsCache: invalidateCommunityEventsCacheForCommunity/,
  "event save/cancel must invalidate every cached range for the affected community",
);

assert.match(
  controller,
  /const requestedCommunityId = String\(communityId \?\? ""\)\.trim\(\);[\s\S]*String\(argsRef\.current\.activeCommunityId \?\? ""\)\.trim\(\) === requestedCommunityId[\s\S]*if \(!isCurrentEventsLoad\(\)\) return;[\s\S]*current\.setCommunityEvents\(rows\);/,
  "late events list responses must not overwrite newer community/month state",
);

assert.match(
  controller,
  /saveCloudCommunityEvent[\s\S]*current\.invalidateCommunityEventsCache\?\.\(current\.activeCommunityId\);[\s\S]*await loadCommunityEvents/,
  "event saves must invalidate cached ranges before reloading the current range",
);

assert.match(
  controller,
  /cancelCloudCommunityEvent[\s\S]*current\.invalidateCommunityEventsCache\?\.\(current\.activeCommunityId\);[\s\S]*await loadCommunityEvents/,
  "event cancellations must invalidate cached ranges before reloading the current range",
);

assert.match(
  controller,
  /catch \(error\) \{[\s\S]*if \(!isCurrentEventsLoad\(\)\) return;[\s\S]*current\.setCommunityEventsError\(message\);/,
  "late events list errors must not overwrite newer community/month state",
);

assert.match(
  eventsPanel,
  /isRecurringCommunityEvent[\s\S]*Edit series[\s\S]*Cancel series/,
  "recurring event controls must make clear that edit/cancel operates on the whole series",
);

assert.match(
  eventsPanel,
  /aria-label=\{`\$\{dayKey\}, \$\{dayEvents\.length\} event[\s\S]*community-events-day-marker/,
  "calendar days with events need an accessible marker when event pills are hidden",
);

assert.match(
  styles,
  /@media \(max-width: 640px\) \{[\s\S]*\.community-events-day-marker \{[\s\S]*display: inline-flex;/,
  "mobile calendar must keep a visible event marker when event pills are hidden",
);

console.log("community_events_ui_contract_proof: ok");
