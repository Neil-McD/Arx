import type { CommunityInteractionRootBundle } from "../../../../shared/cloudCommunityInteractionsGateway";

export type InteractionFeedSegment =
  | { type: "day"; key: string; label: string }
  | { type: "system"; key: string; bundle: CommunityInteractionRootBundle }
  | { type: "group"; key: string; bundles: CommunityInteractionRootBundle[] };

const GROUP_GAP_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function toMs(value: string): number {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function dayKey(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(ms: number, nowMs: number): string {
  const key = dayKey(ms);
  if (key === dayKey(nowMs)) return "Today";
  if (key === dayKey(nowMs - DAY_MS)) return "Yesterday";
  const date = new Date(ms);
  const sameYear = date.getFullYear() === new Date(nowMs).getFullYear();
  return date.toLocaleDateString(
    undefined,
    sameYear
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" },
  );
}

function groupIdentity(root: CommunityInteractionRootBundle["root"]): string {
  const actor = root.actor_user_id ?? root.actor_agent_key ?? root.actor_type;
  return `${actor}::${root.kind}`;
}

type OpenGroup = {
  key: string;
  identity: string;
  bundles: CommunityInteractionRootBundle[];
  lastMs: number;
};

export function groupInteractionFeed(
  roots: CommunityInteractionRootBundle[],
  nowMs: number = Date.now(),
): InteractionFeedSegment[] {
  const ordered = [...roots].sort((left, right) => toMs(left.root.created_at) - toMs(right.root.created_at));
  const segments: InteractionFeedSegment[] = [];
  let currentDay: string | null = null;
  let open: OpenGroup | null = null;

  const flush = () => {
    if (open) {
      segments.push({ type: "group", key: open.key, bundles: open.bundles });
      open = null;
    }
  };

  for (const bundle of ordered) {
    const ms = toMs(bundle.root.created_at);
    const day = dayKey(ms);
    if (day !== currentDay) {
      flush();
      segments.push({ type: "day", key: `day:${day}`, label: dayLabel(ms, nowMs) });
      currentDay = day;
    }
    if (bundle.root.actor_type === "system") {
      flush();
      segments.push({ type: "system", key: `system:${bundle.root.id}`, bundle });
      continue;
    }
    const identity = groupIdentity(bundle.root);
    if (open && open.identity === identity && ms - open.lastMs <= GROUP_GAP_MS) {
      open.bundles.push(bundle);
      open.lastMs = ms;
    } else {
      flush();
      open = { key: `group:${bundle.root.id}`, identity, bundles: [bundle], lastMs: ms };
    }
  }
  flush();
  return segments;
}
