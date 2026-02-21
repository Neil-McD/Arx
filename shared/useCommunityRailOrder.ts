import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type CommunityLike = {
  id: string;
};

type UseCommunityRailOrderArgs<TCommunity extends CommunityLike> = {
  communities: TCommunity[];
  storageKey: string;
};

function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function dedupeIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const id of ids) {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    deduped.push(trimmed);
  }
  return deduped;
}

function readStoredOrder(storageKey: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return dedupeIds(parsed.filter((value): value is string => typeof value === "string"));
  } catch {
    return [];
  }
}

function writeStoredOrder(storageKey: string, ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    if (ids.length === 0) {
      window.localStorage.removeItem(storageKey);
      return;
    }
    window.localStorage.setItem(storageKey, JSON.stringify(ids));
  } catch {
    // Best-effort persistence only.
  }
}

function normalizeOrder(orderIds: string[], availableIds: string[]): string[] {
  const availableSet = new Set(availableIds);
  const next: string[] = [];

  for (const id of dedupeIds(orderIds)) {
    if (availableSet.has(id)) next.push(id);
  }

  for (const id of availableIds) {
    if (!availableSet.has(id)) continue;
    if (!next.includes(id)) next.push(id);
  }

  return next;
}

function moveIdBefore(orderIds: string[], draggedId: string, targetId: string): string[] {
  if (draggedId === targetId) return orderIds;
  const fromIndex = orderIds.indexOf(draggedId);
  const targetIndex = orderIds.indexOf(targetId);
  if (fromIndex < 0 || targetIndex < 0) return orderIds;

  const next = orderIds.slice();
  next.splice(fromIndex, 1);
  const insertIndex = next.indexOf(targetId);
  if (insertIndex < 0) return orderIds;
  next.splice(insertIndex, 0, draggedId);
  return next;
}

function moveIdToIndex(orderIds: string[], draggedId: string, targetIndexInput: number): string[] {
  const fromIndex = orderIds.indexOf(draggedId);
  if (fromIndex < 0) return orderIds;
  const targetIndex = Math.max(0, Math.min(orderIds.length - 1, targetIndexInput));
  if (fromIndex === targetIndex) return orderIds;

  const next = orderIds.slice();
  next.splice(fromIndex, 1);
  next.splice(targetIndex, 0, draggedId);
  return next;
}

export function useCommunityRailOrder<TCommunity extends CommunityLike>(
  args: UseCommunityRailOrderArgs<TCommunity>,
) {
  const { communities, storageKey } = args;
  const availableIds = useMemo(() => communities.map((community) => community.id), [communities]);
  const [orderIds, setOrderIds] = useState<string[]>(() => readStoredOrder(storageKey));
  const skipPersistRef = useRef(false);

  useEffect(() => {
    skipPersistRef.current = true;
    setOrderIds(readStoredOrder(storageKey));
  }, [storageKey]);

  useEffect(() => {
    setOrderIds((previous) => {
      const normalized = normalizeOrder(previous, availableIds);
      return arraysEqual(previous, normalized) ? previous : normalized;
    });
  }, [availableIds]);

  useEffect(() => {
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }
    writeStoredOrder(storageKey, orderIds);
  }, [storageKey, orderIds]);

  const orderedCommunities = useMemo(() => {
    if (communities.length < 2) return communities;
    const orderIndexById = new Map<string, number>();
    for (let index = 0; index < orderIds.length; index += 1) {
      orderIndexById.set(orderIds[index], index);
    }
    return communities
      .slice()
      .sort((left, right) => (orderIndexById.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (orderIndexById.get(right.id) ?? Number.MAX_SAFE_INTEGER));
  }, [communities, orderIds]);

  const moveCommunityBefore = useCallback(
    (draggedId: string, targetId: string) => {
      const dragged = draggedId.trim();
      const target = targetId.trim();
      if (!dragged || !target || dragged === target) return;
      setOrderIds((previous) => {
        const normalized = normalizeOrder(previous, availableIds);
        return moveIdBefore(normalized, dragged, target);
      });
    },
    [availableIds],
  );

  const moveCommunityToIndex = useCallback(
    (draggedId: string, targetIndex: number) => {
      const dragged = draggedId.trim();
      if (!dragged) return;
      setOrderIds((previous) => {
        const normalized = normalizeOrder(previous, availableIds);
        return moveIdToIndex(normalized, dragged, targetIndex);
      });
    },
    [availableIds],
  );

  return {
    orderedCommunities,
    moveCommunityBefore,
    moveCommunityToIndex,
  };
}
