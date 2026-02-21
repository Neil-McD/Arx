export const USER_FACING_INTERNAL_IDENTIFIER_KEYS = Object.freeze([
  "community_id",
  "thread_id",
  "message_id",
  "sender_id",
  "resource_id",
  "memory_id",
  "user_id",
  "run_id",
  "tool_call_id",
  "candidate_id",
  "promoted_memory_id",
  "internal_source_id",
]);

const UUID_V4ISH_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

function escapeRegExp(input) {
  return String(input ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeIdentifierLabelValuePairs(text) {
  let out = text;
  for (const key of USER_FACING_INTERNAL_IDENTIFIER_KEYS) {
    const keyPattern = escapeRegExp(key);
    const colonOrEqualsPattern = new RegExp(
      `\\b(${keyPattern})\\b\\s*([:=])\\s*(\\\`[^\\\`\\n]+\\\`|\"[^\"]+\"|'[^']+'|[^\\s,.;)\\]]+)`,
      "gi",
    );
    out = out.replace(colonOrEqualsPattern, (_, matchedKey, sep) => `${matchedKey}${sep} [redacted]`);

    const backtickPairPattern = new RegExp(
      `\\\`(${keyPattern})\\\`\\s*\\\`[^\\\`\\n]+\\\``,
      "gi",
    );
    out = out.replace(backtickPairPattern, "`$1` `[redacted]`");
  }

  const naturalLanguageLabelPattern = /\b(community|thread|message|run|tool(?:\s+call)?)\s+(id|identifier)\b\s*(is|:)?\s*(\`[^`\n]+\`|'[^']+'|"[^"]+"|[0-9a-f-]{8,})/gi;
  out = out.replace(naturalLanguageLabelPattern, (_match, subject, label, connective) => {
    const maybeConnective = connective ? ` ${connective}` : "";
    return `${subject} ${label}${maybeConnective} [redacted]`;
  });

  return out;
}

export function sanitizeUserFacingAssistantText(params) {
  const inputText = String(params?.text ?? "");
  if (!inputText) return "";

  const communityId = String(params?.communityId ?? "").trim();
  const communityName = String(params?.communityName ?? "").trim();
  const communityReplacement = communityName || "active community";
  const blockedIdsRaw = Array.isArray(params?.blockedIds) ? params.blockedIds : [];
  const blockedIds = blockedIdsRaw
    .map((value) => String(value ?? "").trim())
    .filter((value, index, all) => Boolean(value) && all.indexOf(value) === index);

  let output = inputText;

  if (communityId) {
    const communityPattern = new RegExp(escapeRegExp(communityId), "gi");
    output = output.replace(communityPattern, communityReplacement);
  }

  for (const blockedId of blockedIds) {
    if (!blockedId || blockedId.toLowerCase() === communityId.toLowerCase()) continue;
    const blockedPattern = new RegExp(escapeRegExp(blockedId), "gi");
    output = output.replace(blockedPattern, "[redacted]");
  }

  output = sanitizeIdentifierLabelValuePairs(output);

  // Final pass: if a blocked identifier was embedded in punctuation and survived earlier passes, redact it.
  for (const blockedId of blockedIds) {
    if (!blockedId || blockedId.toLowerCase() === communityId.toLowerCase()) continue;
    const blockedPattern = new RegExp(escapeRegExp(blockedId), "gi");
    output = output.replace(blockedPattern, "[redacted]");
  }

  // Never emit the active community UUID as plain text.
  if (communityId && UUID_V4ISH_RE.test(communityId)) {
    UUID_V4ISH_RE.lastIndex = 0;
    const communityPattern = new RegExp(escapeRegExp(communityId), "gi");
    output = output.replace(communityPattern, communityReplacement);
  } else {
    UUID_V4ISH_RE.lastIndex = 0;
  }

  return output;
}
