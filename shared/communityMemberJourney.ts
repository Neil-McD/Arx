// Member Journey Board contract (docs/specs/proactive-community-agent-v0.md).
// Stages are ordered plain-English milestones for the community; every active
// member sits on one stage card with a live health status, privacy-safe agent
// outcome note, and an optional founder instruction the proactive agent reads
// on its next check-in.

export type JourneyCardStatus = "on_track" | "stuck" | "needs_you" | "done";

export const JOURNEY_CARD_STATUSES: readonly JourneyCardStatus[] = [
  "needs_you",
  "stuck",
  "on_track",
  "done",
] as const;

export const JOURNEY_CARD_STATUS_LABELS: Record<JourneyCardStatus, string> = {
  on_track: "On track",
  stuck: "Stuck",
  needs_you: "Needs you",
  done: "Done",
};

export type JourneyStageDefinition = {
  key: string;
  name: string;
  goal: string;
  position: number;
};

export const MIN_JOURNEY_STAGES = 2;
export const MAX_JOURNEY_STAGES = 8;
export const MAX_STAGE_NAME_CHARS = 48;
export const MAX_STAGE_GOAL_CHARS = 240;
export const MAX_FOUNDER_INSTRUCTION_CHARS = 500;
export const MAX_AGENT_OUTCOME_CHARS = 200;

export const DEFAULT_JOURNEY_STAGES: readonly JourneyStageDefinition[] = [
  {
    key: "new",
    name: "New",
    goal: "Just joined. Help them get oriented and say hello.",
    position: 0,
  },
  {
    key: "getting_started",
    name: "Getting started",
    goal: "Working through early lessons and setting a concrete goal.",
    position: 1,
  },
  {
    key: "active",
    name: "Active",
    goal: "Participating regularly and making steady progress.",
    position: 2,
  },
  {
    key: "graduated",
    name: "Graduated",
    goal: "Reached the community's main milestone or helping newer members.",
    position: 3,
  },
] as const;

export function slugifyJourneyStageKey(raw: string, fallbackIndex: number): string {
  const cleaned = String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  return cleaned || `stage_${fallbackIndex + 1}`;
}

export function normalizeJourneyStages(
  rawStages: ReadonlyArray<{ key?: string | null; name: string; goal?: string | null }>,
): { ok: true; stages: JourneyStageDefinition[] } | { ok: false; code: string } {
  if (!Array.isArray(rawStages) || rawStages.length < MIN_JOURNEY_STAGES || rawStages.length > MAX_JOURNEY_STAGES) {
    return { ok: false, code: "journey_stages_count_invalid" };
  }
  const seenKeys = new Set<string>();
  const stages: JourneyStageDefinition[] = [];
  for (let index = 0; index < rawStages.length; index += 1) {
    const entry = rawStages[index];
    const name = String(entry?.name ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_STAGE_NAME_CHARS);
    if (!name) return { ok: false, code: "journey_stage_name_required" };
    const goal = String(entry?.goal ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_STAGE_GOAL_CHARS);
    const baseKey = slugifyJourneyStageKey(entry?.key ? String(entry.key) : name, index);
    let key = baseKey;
    let suffix = 2;
    while (seenKeys.has(key)) {
      key = `${baseKey.slice(0, 28)}_${suffix}`;
      suffix += 1;
    }
    seenKeys.add(key);
    stages.push({ key, name, goal, position: index });
  }
  return { ok: true, stages };
}

export function normalizeFounderInstruction(raw: unknown): string | null {
  const cleaned = String(raw ?? "").replace(/\r\n/g, "\n").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, MAX_FOUNDER_INSTRUCTION_CHARS);
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function defaultStageKeyForMember(args: {
  stages: readonly JourneyStageDefinition[];
  joinedAtMs: number | null;
  lastActiveAtMs: number | null;
  nowMs: number;
}): string {
  const stages = args.stages.length > 0 ? args.stages : DEFAULT_JOURNEY_STAGES;
  const firstKey = stages[0]!.key;
  const secondKey = stages[Math.min(1, stages.length - 1)]!.key;
  if (!args.joinedAtMs) return firstKey;
  const ageDays = (args.nowMs - args.joinedAtMs) / DAY_MS;
  if (ageDays <= 7) return firstKey;
  if (args.lastActiveAtMs && args.lastActiveAtMs > args.joinedAtMs) return secondKey;
  return firstKey;
}

export function deriveMemberJourneyStatus(args: {
  statusOverride?: JourneyCardStatus | null;
  stageKey: string;
  stages: readonly JourneyStageDefinition[];
  moneyKind: "on_hold" | "cancelling" | null;
  lastActiveAtMs: number | null;
  joinedAtMs: number | null;
  unansweredCoachCount: number;
  nowMs: number;
}): JourneyCardStatus {
  if (args.statusOverride) return args.statusOverride;
  if (args.moneyKind === "on_hold" || args.moneyKind === "cancelling") return "needs_you";
  const lastStage = args.stages[args.stages.length - 1];
  if (lastStage && args.stages.length >= 2 && args.stageKey === lastStage.key) return "done";
  const referenceAt = args.lastActiveAtMs ?? args.joinedAtMs;
  const quietDays = referenceAt ? (args.nowMs - referenceAt) / DAY_MS : 0;
  if (quietDays >= 14 || args.unansweredCoachCount >= 1) return "stuck";
  return "on_track";
}

export function formatCoachOutcomeSummary(check: {
  status: string;
  reason: string;
  sentAt?: number | null;
  createdAt: number;
  replied?: boolean;
}): string {
  const reasonLabel =
    check.reason === "quiet_newcomer"
      ? "newcomer welcome"
      : check.reason === "course_stall"
        ? "course check-in"
        : check.reason === "commitment_followup"
          ? "commitment follow-up"
          : "check-in";
  if (check.status === "waiting" || check.status === "draft") return `Guide drafted a ${reasonLabel} (waiting on Home)`;
  if (check.status === "sent") {
    return check.replied ? `Guide sent ${reasonLabel} · replied` : `Guide sent ${reasonLabel}`;
  }
  return `Guide checked in (${reasonLabel})`;
}
