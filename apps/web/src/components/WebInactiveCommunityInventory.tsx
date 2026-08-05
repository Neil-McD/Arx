import { useCallback, useEffect, useRef, useState } from "react";

import { resolveAuthSubject, type AuthSessionLike } from "../../../../shared/authSession";
import { listCloudMyInactiveCommunityLifecycleRows } from "../../../../shared/cloudCommunityLifecycleGateway";
import type { InactiveCommunityLifecycleSummary } from "../../../../shared/communityLifecycleManagement";

export type WebInactiveCommunityInventoryProps = {
  session: unknown | null;
  onOpenCommunity: (slug: string) => void;
};

type InactiveLifecycleStatus = "archiving" | "archived";

type InactiveLifecycleLane = {
  cursor: string | null;
  isDone: boolean;
};

const INACTIVE_LIFECYCLE_STATUSES: InactiveLifecycleStatus[] = [
  "archiving",
  "archived",
];

function mergeInactiveCommunityRows(
  current: InactiveCommunityLifecycleSummary[],
  incoming: InactiveCommunityLifecycleSummary[],
) {
  const byId = new Map(
    [...current, ...incoming].map((item) => [item.community_id, item]),
  );
  return [...byId.values()].sort((left, right) =>
    right.updated_at - left.updated_at || left.slug.localeCompare(right.slug),
  );
}

export function WebInactiveCommunityInventory(
  props: WebInactiveCommunityInventoryProps,
) {
  const sessionRef = useRef(props.session);
  sessionRef.current = props.session;
  const sessionKey = resolveAuthSubject(props.session as AuthSessionLike);
  const [items, setItems] = useState<InactiveCommunityLifecycleSummary[]>([]);
  const [itemsSessionKey, setItemsSessionKey] = useState(sessionKey);
  const [isLoading, setIsLoading] = useState(Boolean(sessionKey));
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const requestRef = useRef(0);
  const lanesRef = useRef<Record<InactiveLifecycleStatus, InactiveLifecycleLane>>({
    archiving: { cursor: null, isDone: false },
    archived: { cursor: null, isDone: false },
  });

  const load = useCallback(async (reset: boolean) => {
    if (!sessionKey || !sessionRef.current) {
      setItems([]);
      setItemsSessionKey(sessionKey);
      setIsLoading(false);
      setError(null);
      setHasMore(false);
      return;
    }
    if (reset) {
      setItems([]);
      setItemsSessionKey(sessionKey);
      lanesRef.current = {
        archiving: { cursor: null, isDone: false },
        archived: { cursor: null, isDone: false },
      };
    }
    const statuses = INACTIVE_LIFECYCLE_STATUSES.filter(
      (status) => !lanesRef.current[status].isDone,
    );
    if (statuses.length === 0) {
      setHasMore(false);
      return;
    }
    const request = requestRef.current + 1;
    requestRef.current = request;
    setIsLoading(true);
    setError(null);
    try {
      const results = await Promise.all(
        statuses.map(async (lifecycleStatus) => ({
          lifecycleStatus,
          page: await listCloudMyInactiveCommunityLifecycleRows({
            session: sessionRef.current,
            lifecycleStatus,
            cursor: lanesRef.current[lifecycleStatus].cursor,
            numItems: 25,
          }),
        })),
      );
      if (requestRef.current !== request) return;
      const incoming = results.flatMap(({ page }) => page.items);
      for (const { lifecycleStatus, page } of results) {
        lanesRef.current[lifecycleStatus] = {
          cursor: page.continue_cursor,
          isDone: page.is_done,
        };
      }
      setItems((current) =>
        mergeInactiveCommunityRows(reset ? [] : current, incoming),
      );
      setItemsSessionKey(sessionKey);
      setHasMore(
        INACTIVE_LIFECYCLE_STATUSES.some(
          (status) => !lanesRef.current[status].isDone,
        ),
      );
    } catch {
      if (requestRef.current !== request) return;
      setError("Archived communities could not be loaded.");
    } finally {
      if (requestRef.current === request) setIsLoading(false);
    }
  }, [sessionKey]);

  useEffect(() => {
    void load(true);
    return () => {
      requestRef.current += 1;
    };
  }, [load]);

  const visibleItems = itemsSessionKey === sessionKey ? items : [];
  const isSessionTransition = itemsSessionKey !== sessionKey;
  if (!isSessionTransition && !isLoading && !error && visibleItems.length === 0) {
    return null;
  }
  const isInitialLoad =
    Boolean(sessionKey) &&
    (isLoading || isSessionTransition) &&
    visibleItems.length === 0;
  const isInitialError = Boolean(error) && visibleItems.length === 0;

  return (
    <div className="settings-section inactive-community-inventory">
      <div className="settings-section-title">Archived communities</div>
      <div className="settings-section-desc">
        Communities that are dormant or finishing archival are kept separate from your active community rail.
      </div>
      {isInitialLoad ? (
        <div className="inactive-community-inventory-status">
          Checking archived communities…
        </div>
      ) : isInitialError ? (
        <div className="inactive-community-inventory-status">
          <span>{error}</span>
          <button type="button" className="secondary" onClick={() => void load(true)}>
            Retry
          </button>
        </div>
      ) : (
        <div className="inactive-community-inventory-list">
          {visibleItems.map((community) => (
            <button
              key={community.community_id}
              type="button"
              className="inactive-community-inventory-row"
              onClick={() => props.onOpenCommunity(community.slug)}
            >
              <span>
                <strong>{community.name}</strong>
                <small>/{community.slug}</small>
              </span>
              <span className="inactive-community-inventory-state">
                {community.lifecycle_status === "archiving"
                  ? "Archiving"
                  : "Archived"}
              </span>
            </button>
          ))}
          {error ? (
            <div className="inactive-community-inventory-status">
              <span>{error}</span>
              <button type="button" className="secondary" onClick={() => void load(false)}>
                Retry
              </button>
            </div>
          ) : hasMore ? (
            <button
              type="button"
              className="secondary inactive-community-inventory-more"
              disabled={isLoading}
              onClick={() => void load(false)}
            >
              {isLoading ? "Loading…" : "Load more"}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
