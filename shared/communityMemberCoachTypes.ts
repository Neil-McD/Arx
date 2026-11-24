// Shared client-safe types and UI copy for Proactive Member Coach.
// Server-only gate rules and judge prompts stay in shared/communityMemberCoach.ts
// so they never ship in the web bundle.

export const MEMBER_COACH_REASONS = [
  "quiet_newcomer",
  "course_stall",
  "quiet_member",
] as const;

export type MemberCoachReason = (typeof MEMBER_COACH_REASONS)[number];

export const MEMBER_COACH_EDIT_MAX_CHARS = 1_500;

export const MEMBER_COACH_REASON_LABELS: Record<
  MemberCoachReason,
  { label: string; description: string; shortTag: string }
> = {
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
    description: "Members quiet for 2+ weeks when a relevant event or pod call is coming up.",
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

export type MemberCoachSettingsView = {
  enabled: boolean;
  auto_reasons: MemberCoachReason[];
  auto_reply_enabled: boolean;
  thread_followup_enabled: boolean;
  sent_this_week: number;
  waiting_count: number;
};

export type MemberCoachPreferenceView = {
  coach_muted: boolean;
  community_muted: boolean;
};
