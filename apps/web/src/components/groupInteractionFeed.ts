import type { CommunityInteractionRootBundle } from "../../../../shared/cloudCommunityInteractionsGateway";
import type { CommunityActivityEvent } from "../../../../shared/communityTypes";

export type InteractionFeedSegment =
  | { type: "day"; key: string; label: string }
  | { type: "system"; key: string; bundle: CommunityInteractionRootBundle }
  | { type: "member_arrivals"; key: string; events: CommunityActivityEvent[] }
  | { type: "group"; key: string; bundles: CommunityInteractionRootBundle[] };

const GROUP_GAP_MS = 5 * 60 * 1000;
export const MEMBER_ARRIVAL_GROUP_GAP_MS = 15 * 60 * 1000;
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

type OpenArrivalGroup = {
  key: string;
  events: CommunityActivityEvent[];
  lastMs: number;
};

type FeedItem =
  | { type: "root"; key: string; createdAt: string; bundle: CommunityInteractionRootBundle }
  | { type: "member_arrival"; key: string; createdAt: string; event: CommunityActivityEvent };

export function groupInteractionFeed(
  roots: CommunityInteractionRootBundle[],
  activityEvents: CommunityActivityEvent[] = [],
  nowMs: number = Date.now(),
): InteractionFeedSegment[] {
  const ordered: FeedItem[] = [
    ...roots.map((bundle): FeedItem => ({
      type: "root",
      key: `root:${bundle.root.id}`,
      createdAt: bundle.root.created_at,
      bundle,
    })),
    ...activityEvents
      .filter((event) => event.type === "member_joined")
      .map((event): FeedItem => ({
        type: "member_arrival",
        key: `member_arrival:${event.id}`,
        createdAt: event.created_at,
        event,
      })),
  ].sort((left, right) => (
    toMs(left.createdAt) - toMs(right.createdAt) || left.key.localeCompare(right.key)
  ));
  const segments: InteractionFeedSegment[] = [];
  let currentDay: string | null = null;
  let open: OpenGroup | null = null;
  let openArrivals: OpenArrivalGroup | null = null;

  const flushRoots = () => {
    if (open) {
      segments.push({ type: "group", key: open.key, bundles: open.bundles });
      open = null;
    }
  };

  const flushArrivals = () => {
    if (openArrivals) {
      segments.push({
        type: "member_arrivals",
        key: openArrivals.key,
        events: openArrivals.events,
      });
      openArrivals = null;
    }
  };

  const flush = () => {
    flushRoots();
    flushArrivals();
  };

  for (const item of ordered) {
    const ms = toMs(item.createdAt);
    const day = dayKey(ms);
    if (day !== currentDay) {
      flush();
      segments.push({ type: "day", key: `day:${day}`, label: dayLabel(ms, nowMs) });
      currentDay = day;
    }
    if (item.type === "member_arrival") {
      flushRoots();
      if (openArrivals && ms - openArrivals.lastMs <= MEMBER_ARRIVAL_GROUP_GAP_MS) {
        openArrivals.events.push(item.event);
        openArrivals.lastMs = ms;
      } else {
        flushArrivals();
        openArrivals = {
          key: `member_arrivals:${item.event.id}`,
          events: [item.event],
          lastMs: ms,
        };
      }
      continue;
    }
    flushArrivals();
    const bundle = item.bundle;
    if (bundle.root.actor_type === "system") {
      flushRoots();
      segments.push({ type: "system", key: `system:${bundle.root.id}`, bundle });
      continue;
    }
    const identity = groupIdentity(bundle.root);
    if (open && open.identity === identity && ms - open.lastMs <= GROUP_GAP_MS) {
      open.bundles.push(bundle);
      open.lastMs = ms;
    } else {
      flushRoots();
      open = { key: `group:${bundle.root.id}`, identity, bundles: [bundle], lastMs: ms };
    }
  }
  flush();
  return segments;
}
