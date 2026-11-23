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
const eventsList = read("apps/web/src/v1/KitEventsList.tsx");
const eventForm = read("apps/web/src/v1/KitEventForm.tsx");
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
  /splitCommunityEvents\(state\.events, listNow\)[\s\S]*<KitEventsList[\s\S]*featured=\{listParts\.featured\}[\s\S]*comingUp=\{listParts\.comingUp\}[\s\S]*past=\{listParts\.past\}/,
  "the visible projection must render the unified v1 events list split into featured, coming up, and past",
);

assert.match(
  eventsPanel,
  /canManage=\{capabilities\.hasActiveCommunity && capabilities\.canManageEvents\}/,
  "event management controls must remain visible only to authorized community managers",
);

assert.match(
  eventsPanel,
  /state\.eventsError[\s\S]*role="alert"[\s\S]*actions\.reloadEvents\(currentRange\)[\s\S]*Retry/,
  "load failures must stay visible and provide an explicit retry path",
);

assert.match(
  eventsPanel,
  /showInitialEventsLoading[\s\S]*role="status">Loading events…/,
  "events must distinguish initial loading cleanly before showing the list",
);

assert.match(
  eventsPanel,
  /timeLabel=\{formatEventTime\}[\s\S]*calendarUrl=\{buildGoogleCalendarUrl\}/,
  "events list must wire viewer-local time formatting and Google Calendar export",
);

assert.match(
  eventsPanel,
  /const timezone = normalizeCommunityEventTimeZone\(nextDraft\.timezone\);[\s\S]*communityEventDateTimeInputToIso\(nextDraft\.starts_at, timezone\)[\s\S]*timezone,/,
  "event saves must parse datetime-local inputs against the selected event timezone",
);

assert.match(
  eventForm,
  /<span>Time zone<\/span>[\s\S]*<select value=\{draft\.timezone\}/,
  "event editor must expose the event timezone selector",
);

assert.match(
  eventForm,
  /<form className=\{cx\("evp"\)\} aria-label=\{heading\} aria-busy=\{props\.isSaving\}/,
  "event editor must expose an accessible form label and saving state",
);

assert.match(
  eventForm,
  /draft\.recurrence_frequency !== "none" \? \([\s\S]*<span>Last date/,
  "the recurrence end field must stay absent until recurrence is enabled",
);

assert.match(
  eventsList,
  /Add an event/,
  "v1 events list must retain the manager event creation action",
);

assert.doesNotMatch(
  eventsPanel,
  /selectedDayKey|buildCalendarDays|community-events-grid|community-events-agenda|community-events-month-nav|EventModal|feed-header-badge|>\s*Refresh\s*</,
  "the canonical projection must not retain the classic month nav, event modal, calendar selector, parallel agenda, ambiguous count, or manual refresh control",
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
