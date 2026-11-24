// Pure deterministic policy for automatic thread follow-ups without re-tagging:
// Once the community guide has replied in a thread, members can keep talking to
// it naturally without an @mention or explicit message-reply target, within
// strict time and count bounds and with silence-by-default judgment.

export const THREAD_FOLLOWUP_WINDOW_MS = 2 * 60 * 60 * 1000;
export const THREAD_FOLLOWUP_MAX_CONSECUTIVE = 4;
export const THREAD_FOLLOWUP_SILENCE_TOKEN = "[[SILENT]]";

export type ThreadFollowupGateInput = {
  enabled: boolean;
  hasTargetReply: boolean;
  hasOtherMentions: boolean;
  lastAgentReplyCreatedAt: number | null;
  consecutiveAutoFollowups: number;
  nowMs: number;
};

export type ThreadFollowupGateResult =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "disabled"
        | "targets_other_reply"
        | "mentions_other_member"
        | "no_prior_agent_reply"
        | "window_expired"
        | "consecutive_cap_reached";
    };

export function shouldAutoFollowThreadReply(
  input: ThreadFollowupGateInput,
): ThreadFollowupGateResult {
  if (!input.enabled) return { allowed: false, reason: "disabled" };
  if (input.hasTargetReply) return { allowed: false, reason: "targets_other_reply" };
  if (input.hasOtherMentions) return { allowed: false, reason: "mentions_other_member" };
  if (
    typeof input.lastAgentReplyCreatedAt !== "number" ||
    !Number.isFinite(input.lastAgentReplyCreatedAt) ||
    input.lastAgentReplyCreatedAt <= 0
  ) {
    return { allowed: false, reason: "no_prior_agent_reply" };
  }
  const elapsedMs = input.nowMs - input.lastAgentReplyCreatedAt;
  if (elapsedMs < 0 || elapsedMs > THREAD_FOLLOWUP_WINDOW_MS) {
    return { allowed: false, reason: "window_expired" };
  }
  if (input.consecutiveAutoFollowups >= THREAD_FOLLOWUP_MAX_CONSECUTIVE) {
    return { allowed: false, reason: "consecutive_cap_reached" };
  }
  return { allowed: true };
}

// Returns true when the guide chose silence on an automatic thread follow-up
// (empty text or the [[SILENT]] sentinel, tolerating minor formatting wrappers).
export function isSilentThreadFollowupReply(rawText: string): boolean {
  const cleaned = String(rawText ?? "")
    .trim()
    .replace(/^[`"'*\s]+|[`"'*.\s]+$/g, "");
  if (!cleaned) return true;
  return cleaned.toUpperCase() === THREAD_FOLLOWUP_SILENCE_TOKEN;
}
