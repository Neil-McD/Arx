import type { CommunityInteractionRootBundle } from "../../../../shared/cloudCommunityInteractionsGateway";

function rootCreatedAtMs(bundle: CommunityInteractionRootBundle): number {
  const milliseconds = Date.parse(bundle.root.created_at);
  return Number.isFinite(milliseconds) ? milliseconds : 0;
}

function newestFirst(roots: CommunityInteractionRootBundle[]): CommunityInteractionRootBundle[] {
  return roots.sort((left, right) => rootCreatedAtMs(right) - rootCreatedAtMs(left));
}

// An older page: add it to what is loaded.
export function mergeOlderRootPage(
  current: CommunityInteractionRootBundle[],
  older: CommunityInteractionRootBundle[],
): CommunityInteractionRootBundle[] {
  const rootsById = new Map<string, CommunityInteractionRootBundle>();
  for (const bundle of current) rootsById.set(bundle.root.id, bundle);
  for (const bundle of older) rootsById.set(bundle.root.id, bundle);
  return newestFirst(Array.from(rootsById.values()));
}

// The live window is the newest `windowLimit` posts. It replaces everything it
// covers, so a post deleted elsewhere drops out; older pages stay loaded.
export function applyLiveRootWindow(
  current: CommunityInteractionRootBundle[],
  live: CommunityInteractionRootBundle[],
  windowLimit: number,
): CommunityInteractionRootBundle[] {
  const liveIds = new Set(live.map((bundle) => bundle.root.id));
  const windowFull = live.length >= windowLimit;
  const oldestLiveMs = windowFull ? Math.min(...live.map(rootCreatedAtMs)) : Number.NEGATIVE_INFINITY;
  // Below a full window are older pages; at the boundary timestamp a post may just be cut off, so keep it.
  const older = current.filter((bundle) => !liveIds.has(bundle.root.id) && windowFull && rootCreatedAtMs(bundle) <= oldestLiveMs);
  return newestFirst([...older, ...live]);
}
