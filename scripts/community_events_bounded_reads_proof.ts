import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageJson = readFileSync("package.json", "utf8");
const schemaSource = readFileSync("convex/schema.ts", "utf8");
const eventsSource = readFileSync("convex/communityEvents.ts", "utf8");

assert.match(
  packageJson,
  /"check:community-events-bounded-reads-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_events_bounded_reads_proof\.ts"/,
  "package.json should expose the bounded community events read proof",
);

assert.match(
  schemaSource,
  /\.index\("by_community_status_recurrenceFrequency_startsAt", \["communityId", "status", "recurrenceFrequency", "startsAt"\]\)/,
  "communityEvents should have a community-scoped status + recurrence + startsAt index",
);

assert.match(
  eventsSource,
  /const MAX_EVENT_WINDOW_CANDIDATES_PER_STATUS = 1000;/,
  "communityEvents should cap direct window candidates at the public response maximum",
);

assert.match(
  eventsSource,
  /const MAX_RECURRING_EVENT_CANDIDATES_PER_STATUS_FREQUENCY = 1000;/,
  "communityEvents should cap recurring candidates by status and frequency at the public response maximum",
);

assert.match(
  eventsSource,
  /async function listCommunityEventExpansionCandidates[\s\S]*\.withIndex\("by_community_status_startsAt"[\s\S]*\.take\(MAX_EVENT_WINDOW_CANDIDATES_PER_STATUS \+ \(params\.overlap \? 1 : 0\)\)[\s\S]*\.withIndex\("by_community_status_recurrenceFrequency_startsAt"[\s\S]*\.take\(MAX_RECURRING_EVENT_CANDIDATES_PER_STATUS_FREQUENCY \+ \(params\.overlap \? 1 : 0\)\)/,
  "listCommunityEvents should fetch bounded direct and recurring expansion candidates",
);

const listCommunityEventsBody = eventsSource.match(
  /export const listCommunityEvents = query\(\{[\s\S]*?\n\}\);/,
)?.[0];
assert.ok(listCommunityEventsBody, "listCommunityEvents should exist");

assert.doesNotMatch(
  listCommunityEventsBody,
  /\.withIndex\("by_community"[\s\S]*?\.collect\(\)/,
  "listCommunityEvents should not collect every event in the community",
);

assert.match(
  listCommunityEventsBody,
  /listCommunityEventExpansionCandidates\(\{[\s\S]*communityId: args\.communityId[\s\S]*startMs[\s\S]*endMs[\s\S]*includeCancelled/,
  "listCommunityEvents should use the bounded expansion candidate helper",
);

assert.match(
  listCommunityEventsBody,
  /return expandCommunityEventRows\(\{ rows, startMs, endMs, includeCancelled, limit, overlap \}\);/,
  "listCommunityEvents should keep the canonical expansion mapper",
);

console.log("community_events_bounded_reads_proof: ok");
