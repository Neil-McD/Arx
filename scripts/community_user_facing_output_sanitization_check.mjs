import { sanitizeUserFacingAssistantText } from "../shared/communityUserFacingOutputSanitizer.mjs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(haystack, needle, message) {
  assert(haystack.includes(needle), `${message} | expected to include: ${needle} | got: ${haystack}`);
}

function assertExcludes(haystack, needle, message) {
  assert(!haystack.includes(needle), `${message} | expected to exclude: ${needle} | got: ${haystack}`);
}

const COMMUNITY_ID = "fbf4361-b041-4f7e-9108-8c1b9e20c8a0";
const THREAD_ID = "7e33f7b4-35b2-4c00-9774-44dd86cd8b86";
const RUN_ID = "b8f9e9f3-9439-4f7d-bd99-40c9961d6ef8";
const MESSAGE_ID = "9c965756-a9f4-47e0-9b4d-6fa0f0fc5808";

const caseCommunityReplacement = sanitizeUserFacingAssistantText({
  text: `The active community identifier is ${COMMUNITY_ID}.`,
  communityId: COMMUNITY_ID,
  communityName: "xcv",
  blockedIds: [THREAD_ID],
});
assertIncludes(caseCommunityReplacement, "xcv", "community id should be replaced with community name");
assertExcludes(caseCommunityReplacement, COMMUNITY_ID, "community id should never leak after sanitization");

const caseLabelValueRedaction = sanitizeUserFacingAssistantText({
  text: `context_ignored community_id: ${COMMUNITY_ID}, thread_id='${THREAD_ID}', run_id=\`${RUN_ID}\``,
});
assertExcludes(caseLabelValueRedaction, COMMUNITY_ID, "community_id key-value should redact value");
assertExcludes(caseLabelValueRedaction, THREAD_ID, "thread_id key-value should redact value");
assertExcludes(caseLabelValueRedaction, RUN_ID, "run_id key-value should redact value");
assertIncludes(caseLabelValueRedaction, "community_id: [redacted]", "community_id redaction token should be present");

const caseBacktickPair = sanitizeUserFacingAssistantText({
  text: "`message_id` `" + MESSAGE_ID + "`",
});
assertExcludes(caseBacktickPair, MESSAGE_ID, "backticked internal key/value should redact value");
assertIncludes(caseBacktickPair, "`message_id` `[redacted]`", "backticked replacement should be deterministic");

const caseBlockedId = sanitizeUserFacingAssistantText({
  text: `Trace: ${THREAD_ID}`,
  blockedIds: [THREAD_ID],
});
assertExcludes(caseBlockedId, THREAD_ID, "explicit blocked ids should always redact");
assertIncludes(caseBlockedId, "[redacted]", "blocked id redaction token should be present");

const caseNonInternalGuidance = sanitizeUserFacingAssistantText({
  text: "UUIDs are useful for distributed systems.",
});
assert(caseNonInternalGuidance === "UUIDs are useful for distributed systems.", "normal non-internal guidance should remain unchanged");

console.log("PASS: community user-facing output sanitization checks passed.");
