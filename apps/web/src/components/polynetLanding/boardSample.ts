import type { CloudMemberJourneyBoard, CloudMemberJourneyCard } from "../../../../../shared/cloudCommunityMemberJourneyGateway";
import { DEFAULT_JOURNEY_STAGES, type JourneyCardStatus } from "../../../../../shared/communityMemberJourney";

// The Build Club's members on the board, in the shape the server sends
// (activity as "N posts · N lessons", status from the real rule's inputs).
export function sampleJourneyBoard(now: number): CloudMemberJourneyBoard {
  const day = 86_400_000;
  type Row = [name: string, stage: string, status: JourneyCardStatus, done: number, daysAway: number, extra?: Partial<CloudMemberJourneyCard>];
  const rows: Row[] = [
    ["Kai Tanaka", "new", "on_track", 0, 1, { working_on: "A weekly writing club" }],
    ["Rosa Lind", "new", "stuck", 0, 3, { agent_outcome: "Guide drafted a newcomer welcome (waiting on Home)" }],
    ["Felix Braun", "new", "on_track", 0, 0, { working_on: "Launch a paid newsletter" }],
    ["Dev Patel", "getting_started", "on_track", 2, 0, { activity_summary: "4 posts · 2 lessons", working_on: "First 10 paying members", latest_outcome: { text: "Set his price at $49", at: new Date(now - 2 * day).toISOString() } }],
    ["Priya Shah", "getting_started", "on_track", 1, 1, { activity_summary: "5+ posts · 1 lesson", working_on: "A founding-member offer" }],
    ["Josh Reed", "getting_started", "stuck", 1, 25, { activity_summary: "2 posts · 1 lesson", working_on: "Pricing his first course", founder_instruction: "He was keen on pricing. Point him at Friday's call.", agent_outcome: "Guide drafted a check-in (waiting on Home)" }],
    ["Hana Sato", "getting_started", "needs_you", 1, 2, { money_kind: "on_hold", activity_summary: "3 posts · 1 lesson", working_on: "A launch-week checklist" }],
    ["Jon Park", "active", "on_track", 1, 0, { activity_summary: "5+ posts · 4 lessons", working_on: "Grow to 200 members", latest_outcome: { text: "Passed 100 members", at: new Date(now - day).toISOString() } }],
    ["Amir Khan", "active", "stuck", 0, 12, { activity_summary: "2 posts · 3 lessons", working_on: "Weekly calls people attend", agent_outcome: "Guide sent check-in" }],
    ["Lena Novak", "active", "on_track", 0, 1, { activity_summary: "2 posts · 3 lessons", working_on: "Her first workshop" }],
    ["Maya Chen", "graduated", "done", 0, 0, { activity_summary: "5+ posts · 7 lessons", latest_outcome: { text: "Ran her second cohort", at: new Date(now - 6 * day).toISOString() } }],
    ["Sara Lind", "graduated", "done", 0, 1, { activity_summary: "5+ posts · 6 lessons", latest_outcome: { text: "Hit $5k a month", at: new Date(now - 9 * day).toISOString() } }],
    ["Tom Alvarez", "graduated", "done", 0, 2, { activity_summary: "5+ posts · 5 lessons" }],
  ];
  const cards: CloudMemberJourneyCard[] = rows.map(([name, stage, status, done, daysAway, extra], i) => {
    const def = DEFAULT_JOURNEY_STAGES.find((entry) => entry.key === stage)!;
    const checkpoints = def.checkpoints.map((cp, j) => ({ key: cp.key, label: cp.label, kind: cp.kind, done: j < done, auto: cp.kind !== "custom", completed_at: j < done ? new Date(now - (j + 1) * day).toISOString() : null }));
    return {
      membership_id: `m${i + 1}`, user_id: `u${i + 1}`, name, handle: name.toLowerCase().replace(/\s+/g, "-"), avatar_url: null, avatar_focus_x: 50, avatar_focus_y: 50, avatar_zoom: 1,
      role: "member", plan_label: i % 4 === 3 ? "Free" : "$49 a month", money_kind: null, stage_key: stage, status, status_is_manual: false,
      founder_instruction: null, founder_instruction_updated_at: null, agent_outcome: null, agent_outcome_at: null, working_on: null, activity_summary: null,
      checkpoints, checkpoints_done: checkpoints.filter((cp) => cp.done).length, checkpoints_total: checkpoints.length, outcomes: [], latest_outcome: null,
      joined_at: new Date(now - (i + 2) * 6 * day).toISOString(), last_active_at: new Date(now - daysAway * day).toISOString(),
      ...extra,
      ...(extra?.agent_outcome ? { agent_outcome_at: new Date(now - 3 * 3_600_000).toISOString() } : {}),
      ...(extra?.founder_instruction ? { founder_instruction_updated_at: new Date(now - day).toISOString() } : {}),
    };
  });
  return { stages: DEFAULT_JOURNEY_STAGES.map((stage) => ({ ...stage, checkpoints: [...stage.checkpoints] })), auto_advance_enabled: false, cards, total_active_members: cards.length, capped: false, hosted_ai_tier: "chief_of_staff", hosted_agent_on: true };
}

