import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const app = read("apps/web/src/App.tsx");
const webContentController = read(
  "apps/web/src/controllers/useWebCommunityContentController.ts",
);
const controller = read("shared/useCommunityEventsController.ts");
const eventsPanel = read("apps/web/src/components/WebCommunityEventsSection.tsx");
const styles = [read("apps/web/src/base.css"), read("apps/web/src/styles/shell-and-onboarding.css"), read("apps/web/src/styles/community-and-content.css"), read("apps/web/src/styles/settings-runtime-and-theme-overrides.css")].join("\n");

assert.match(
  webContentController,
  /function getWebCommunityEventsMonthRange[\s\S]*start\.setDate\(monthStart\.getDate\(\) - monthStart\.getDay\(\)\);[\s\S]*end\.setDate\(start\.getDate\(\) \+ 42\);/,
  "events fetch range must retain the 42-day buffer used for recurrence expansion and month transitions",
);

assert.match(
  webContentController,
  /const \[eventsByCacheKey, setEventsByCacheKey\][\s\S]*useState<Record<string, CloudCommunityEvent\[\]>>\(\{\}\);/,
  "events rows must be cached by community and visible range instead of one global list",
);

assert.match(
  webContentController,
  /buildEventsCacheKey\(`\$\{activeCommunityId\}:\$\{resolveAuthSubject\(session\)\}`, eventsVisibleRange\)/,
  "events cache key must include account, active community, and visible range",
);

assert.match(
  webContentController,
  /invalidateEventsCacheForCommunity[\s\S]*key\.startsWith\(prefix\)[\s\S]*invalidateCommunityEventsCache: invalidateEventsCacheForCommunity/,
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
  /const visibleMonthEvents = useMemo\([\s\S]*\.filter\(\(event\) =>[\s\S]*isSameLocalMonth\(startsAt, monthDate\)[\s\S]*\.sort\(\(a, b\) => Date\.parse\(a\.starts_at\) - Date\.parse\(b\.starts_at\)/,
  "the visible projection must be one chronological ledger restricted to the viewer-local month",
);

assert.match(
  eventsPanel,
  /const eventDayGroups = useMemo\([\s\S]*new Map<string, EventDayGroup>\(\)[\s\S]*grouped\.set\(key, \{ key, date, events: \[event\] \}\)[\s\S]*Array\.from\(grouped\.values\(\)\)/,
  "chronological rows must be grouped by viewer-local date without a parallel calendar model",
);

assert.match(
  eventsPanel,
  /aria-label="Previous month"[\s\S]*formatMonthLabel\(monthDate\)[\s\S]*aria-label="Next month"/,
  "month navigation must remain compact and accessible",
);

assert.match(
  eventsPanel,
  /capabilities\.hasActiveCommunity && capabilities\.canManageEvents[\s\S]*community-events-new-btn[\s\S]*New event/,
  "event creation must remain visible only to authorized community managers",
);

assert.match(
  eventsPanel,
  /state\.eventsError[\s\S]*role="alert"[\s\S]*actions\.reloadEvents\(currentRange\)[\s\S]*Retry/,
  "load failures must stay visible and provide an explicit retry path",
);

assert.match(
  eventsPanel,
  /showInitialEventsLoading[\s\S]*role="status">Loading events…[\s\S]*eventDayGroups\.length === 0[\s\S]*No events in \{formatMonthLabel\(monthDate\)\}/,
  "the ledger must distinguish initial loading from a month-specific empty state",
);

assert.match(
  eventsPanel,
  /<time className="community-events-date" dateTime=\{toLocalDateKey\(group\.date\)\}>[\s\S]*dayLabel\.weekday[\s\S]*dayLabel\.day[\s\S]*group\.events\.map/,
  "each chronological group must expose a semantic date before its event rows",
);

assert.match(
  eventsPanel,
  /const editLabel = isRecurring \? "Edit series" : "Edit event";[\s\S]*const cancelLabel = isRecurring \? "Cancel series" : "Cancel event";[\s\S]*aria-label=\{editLabel\}[\s\S]*>\s*Edit\s*<\/button>[\s\S]*aria-label=\{cancelLabel\}[\s\S]*>\s*Cancel\s*<\/button>/,
  "event controls must keep compact visible labels while preserving series-aware accessible labels",
);

assert.match(
  eventsPanel,
  /formatEventTime\(event\)[\s\S]*community-events-time[\s\S]*eventTimeLabel\.primary[\s\S]*eventTimeLabel\.secondary/,
  "event rows must expose viewer-local time and event timezone context",
);

assert.match(
  eventsPanel,
  /formatRecurrenceLabel\(event\)[\s\S]*community-events-meta[\s\S]*event\.location_label[\s\S]*recurrenceLabel[\s\S]*community-events-description/,
  "event rows must preserve recurrence, location, and description context",
);

assert.match(
  eventsPanel,
  /event\.url[\s\S]*community-events-primary-link[\s\S]*eventLinkLabel[\s\S]*buildGoogleCalendarUrl\(event\)[\s\S]*Add to calendar/,
  "event rows must preserve the event destination and calendar export actions",
);

assert.match(
  eventsPanel,
  /const timezone = normalizeCommunityEventTimeZone\(draft\.timezone\);[\s\S]*communityEventDateTimeInputToIso\(draft\.starts_at, timezone\)[\s\S]*timezone,/,
  "event saves must parse datetime-local inputs against the selected event timezone",
);

assert.match(
  eventsPanel,
  /<span>Event timezone<\/span>[\s\S]*normalizeCommunityEventTimeZone\(draft\.timezone\)/,
  "event editor must expose the event timezone anchor",
);

assert.match(
  eventsPanel,
  /role="dialog"[\s\S]*aria-modal="true"[\s\S]*aria-labelledby="community-event-modal-title"[\s\S]*aria-busy=\{isSaving\}/,
  "event editor must expose a labelled modal boundary and saving state",
);

assert.match(
  eventsPanel,
  /draft\.recurrence_frequency !== "none" \? \([\s\S]*<span>Repeats until<\/span>/,
  "the recurrence end field must stay absent until recurrence is enabled",
);

assert.doesNotMatch(
  eventsPanel,
  /selectedDayKey|buildCalendarDays|community-events-grid|community-events-agenda|feed-header-badge|>\s*Refresh\s*</,
  "the canonical projection must not retain the calendar selector, parallel agenda, ambiguous count, or manual refresh control",
);

const eventsStylesStart = styles.indexOf(".community-events-panel {");
const eventsStylesEnd = styles.indexOf("/*\n * Light component adapters.", eventsStylesStart);
assert.ok(eventsStylesStart >= 0 && eventsStylesEnd > eventsStylesStart, "events styles must have a bounded canonical section");
const eventsStyles = styles.slice(eventsStylesStart, eventsStylesEnd);

assert.match(
  eventsStyles,
  /\.community-events-day-group \{[\s\S]*grid-template-columns: 68px minmax\(0, 1fr\);[\s\S]*\.community-events-item \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto;/,
  "desktop events must use a flat date-and-row ledger",
);

assert.match(
  eventsStyles,
  /@container community-events \(max-width: 680px\) \{[\s\S]*\.community-events-item \{[\s\S]*grid-template-columns: minmax\(0, 1fr\);[\s\S]*\.community-events-actions \{[\s\S]*justify-content: flex-start;/,
  "event actions must stack from the component's own width rather than only the viewport",
);

assert.match(
  eventsStyles,
  /\.community-event-form input,[\s\S]*background: var\(--bg-input\);[\s\S]*border-color: var\(--border-active\);[\s\S]*box-shadow: 0 0 0 2px var\(--focus-ring\);/,
  "event editor controls must consume shared semantic theme tokens",
);

assert.doesNotMatch(
  eventsStyles,
  /community-events-(?:calendar|grid|agenda|weekdays|day-pill|day-marker|day-dot)|rgba\(255|#fff\b|color-scheme:\s*dark|filter:\s*invert|data:image/,
  "events styles must not retain the old calendar/agenda selectors or force dark-theme colors",
);

assert.doesNotMatch(
  styles,
  /:root\[data-theme=[^\]]+\][^{]*community-events/,
  "events must remain one shared projection instead of theme-specific UI forks",
);

console.log("community_events_ui_contract_proof: ok");
