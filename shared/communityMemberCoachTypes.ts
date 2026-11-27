// Shared client-safe types and UI copy for Proactive Member Coach.
// Server-only gate rules and judge prompts stay in shared/communityMemberCoach.ts
// so they never ship in the web bundle.

import type {
  CommunityHeartbeatTier,
  MemberTemperatureCounts,
} from "./agentHeartbeat";

export const MEMBER_COACH_REASONS = [
  "member_onboarding",
  "commitment_followup",
  "board_coaching",
  "quiet_newcomer",
  "course_stall",
  "quiet_member",
] as const;

export type MemberCoachReason = (typeof MEMBER_COACH_REASONS)[number];

export const MEMBER_COACH_EDIT_MAX_CHARS = 1_500;

export const MEMBER_COACH_REASON_LABELS: Record<
  MemberCoachReason,
  { label: string; description: string; shortTag: string; privateAutoOnly?: boolean }
> = {
  member_onboarding: {
    label: "Welcome new members on Day 0",
    description:
      "Prepares a personalized onboarding welcome when someone joins, guided by your Member Board Stage 1 goal, handbook, starter course, and connected app.",
    shortTag: "Day-0 welcome",
  },
  commitment_followup: {
    label: "Follow up on member commitments",
    description:
      "Checks in privately when a member shared a goal or next step with their guide 2+ days ago. Sends directly to their private thread so their goals stay private.",
    shortTag: "Commitment check-in",
    privateAutoOnly: true,
  },
  board_coaching: {
    label: "Follow up on Member Board notes & stuck stages",
    description:
      "Acts once when you leave a fresh Guide instruction on a member's Board card, or checks in when a member is flagged as stuck.",
    shortTag: "Board check-in",
  },
  quiet_newcomer: {
    label: "Welcome quiet newcomers",
    description: "Members who joined 2–14 days ago and haven't posted yet.",
    shortTag: "Newcomer welcome",
  },
  course_stall: {
    label: "Nudge stalled course learners",
    description: "Members who paused partway through a course for 5+ days.",
    shortTag: "Course check-in",
  },
  quiet_member: {
    label: "Re-engage quiet members",
    description: "Members quiet for 2–4 weeks when a relevant event or pod call is coming up.",
    shortTag: "Event check-in",
  },
};

export type MemberCoachDraftView = {
  id: string;
  member_name: string;
  member_handle: string | null;
  reason: MemberCoachReason;
  reason_label: string;
  signal_summary: string;
  text: string;
  created_at: string;
};

export type MemberCoachHeartbeatSummary = {
  community_tier: CommunityHeartbeatTier;
  counts: MemberTemperatureCounts | null;
  sampled_at: number | null;
};

import type { FounderPlanTier } from "./founderPlan";

export type MemberCoachImpactSummary = {
  plan_tier?: FounderPlanTier;
  total_micros: number;
  live_chat_micros: number;
  proactive_micros: number;
  brief_micros: number;
  allowance_micros: number;
  included_allowance_micros?: number;
  paid_boost_micros?: number;
  usage_boost_cap_cents?: number;
  first_cycle_cap_active?: boolean;
  can_buy_usage_boost?: boolean;
  usage_boost_remaining_this_cycle?: number;
  usage_boost_block_reason?: string | null;
  percent_used: number;
  spend_truncated: boolean;
  cycle_end_at?: number | null;
  background_ai_paused?: boolean;
  reengaged_30d: number;
  contacted_30d: number;
  reengagement_truncated: boolean;
  verified_saved_members_90d?: number;
  verified_saved_mrr_base_units_90d?: number;
  verified_saved_currency?: string | null;
  verified_saved_currency_decimals?: number;
  verified_saved_mixed_currency?: boolean;
};

export type MemberCoachSettingsView = {
  enabled: boolean;
  auto_reasons: MemberCoachReason[];
  auto_reply_enabled: boolean;
  thread_followup_enabled: boolean;
  weekly_digest_enabled: boolean;
  sent_this_week: number;
  waiting_count: number;
  heartbeat?: MemberCoachHeartbeatSummary;
  impact?: MemberCoachImpactSummary;
};

export type MemberCoachPreferenceView = {
  coach_muted: boolean;
  community_muted: boolean;
  global_coach_muted?: boolean;
};

export type BuilderHeartbeatPreferenceView = {
  eligible: boolean;
  enabled: boolean;
  community_muted: boolean;
};
