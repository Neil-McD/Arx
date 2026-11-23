import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { AuthSession } from "../auth";
import { resolveAuthSubject } from "../../../../shared/authSession";
import type { AppPage, CommunityTab } from "../../../../shared/appShellNavigation";
import { parseEmbedUrl } from "../../../../shared/linkEmbedUi";
import {
  COMMUNITY_RESOURCES_MUTATED_EVENT,
  readCommunityResourcesMutatedEventDetail,
} from "../../../../shared/communityResourceMutationEvents";
import type { CloudCommunityEvent } from "../../../../shared/cloudCommunityEventsGateway";
import {
  useCommunityEventsController,
  type CommunityEventsRange,
} from "../../../../shared/useCommunityEventsController";
import { useLiveQuery } from "../../../../shared/liveQuery";
import { coerceGatewayRows } from "../../../../shared/cloudGateway";
import { useCommunityResourcesTabLifecycle } from "../../../../shared/useCommunityResourcesTabLifecycle";
import { useWebCommunityResourceUiController } from "./useWebCommunityResourceUiController";

export type WebCommunityResource = {
  id: string;
  community_id?: string | null;
  module_id: string | null;
  directory_uri: string;
  directory_path: string;
  type: "post" | "link" | "embed" | "file";
  resource_role: "page" | "source";
  resource_status: "draft" | "review" | "published" | "processing" | "failed";
  source_resource_id?: string | null;
  title: string;
  body_md: string | null;
  body_chars?: number | null;
  url: string | null;
  file_key?: string | null;
  source_ingestion_status?: "not_required" | "queued" | "processing" | "ready" | "failed";
  source_ingestion_kind?: "manual" | "url" | "file";
  source_ingestion_error?: string | null;
  source_ingestion_attempted_at?: string | null;
  source_ingested_at?: string | null;
  source_original_filename?: string | null;
  source_original_mime_type?: string | null;
  source_original_bytes?: number | null;
  pinned: boolean;
  sort_order: number | null;
  created_at: string;
};

export type WebCommunityResourceModule = {
  id: string;
  community_id?: string | null;
  directory_uri: string;
  directory_path: string;
  module_status: "draft" | "live";
  name: string;
  description_md: string | null;
  banner_url: string | null;
  banner_focus_x: number | null;
  banner_focus_y: number | null;
  banner_zoom: number | null;
  sort_order: number;
};

type EnsureAuthSession = (
  session?: AuthSession | null,
  source?: string,
  options?: { forceRefresh?: boolean },
) => Promise<AuthSession | null>;

type UseWebCommunityContentControllerParams = {
  activeCommunityId: string | null;
  activePage: AppPage;
  communityTab: CommunityTab;
  ensureSession: EnsureAuthSession;
  getSession: () => AuthSession | null;
  session: AuthSession | null;
};

function normalizeEventsMonthIso(raw: string | null | undefined): string {
  const date = raw ? new Date(raw) : new Date();
  const normalized = Number.isFinite(date.getTime()) ? date : new Date();
  return new Date(normalized.getFullYear(), normalized.getMonth(), 1).toISOString();
}

// Design system v1 lists events instead of showing a month: the last three
// weeks and the next six, from the start of today (the server allows 62 days).
// The span is counted in elapsed time, not calendar days, so a daylight-saving
// change inside the window can never push it past the server's 62-day limit.
const EVENTS_LIST_SPAN_MS = 61 * 86_400_000;

export function getWebCommunityEventsListRange(now: Date = new Date()): CommunityEventsRange {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(today);
  start.setDate(today.getDate() - 21);
  return { startIso: start.toISOString(), endIso: new Date(start.getTime() + EVENTS_LIST_SPAN_MS).toISOString() };
}

export function getWebCommunityEventsMonthRange(_monthIso: string): CommunityEventsRange {
  return getWebCommunityEventsListRange();
}

function buildEventsCacheKey(
  communityId: string,
  range: CommunityEventsRange,
): string {
  return `${communityId}:${range.startIso}:${range.endIso}`;
}

export function useWebCommunityContentController(
  params: UseWebCommunityContentControllerParams,
) {
  const {
    activeCommunityId,
    activePage,
    communityTab,
    ensureSession,
    getSession,
    session,
  } = params;
  const resourceIdentity = JSON.stringify([resolveAuthSubject(session), activeCommunityId]);
  const resourceOwner = useRef({ identity: resourceIdentity, epoch: 0 });
  if (resourceOwner.current.identity !== resourceIdentity) resourceOwner.current = { identity: resourceIdentity, epoch: resourceOwner.current.epoch + 1 };
  const resourceScope = `${resourceIdentity}:${resourceOwner.current.epoch}`;
  const [resourceData, setResourceData] = useState<{ scope: string; resources: WebCommunityResource[]; modules: WebCommunityResourceModule[] }>(() => ({ scope: resourceScope, resources: [], modules: [] }));
  const ownedResourceData = resourceData.scope === resourceScope ? resourceData : { scope: resourceScope, resources: [], modules: [] };
  if (ownedResourceData !== resourceData) setResourceData(ownedResourceData);
  const { resources, modules } = ownedResourceData;
  const setResources = useCallback<Dispatch<SetStateAction<WebCommunityResource[]>>>((next) => {
    setResourceData((current) => current.scope !== resourceScope ? current : { ...current, resources: typeof next === "function" ? next(current.resources) : next });
  }, [resourceScope]);
  const setModules = useCallback<Dispatch<SetStateAction<WebCommunityResourceModule[]>>>((next) => {
    setResourceData((current) => current.scope !== resourceScope ? current : { ...current, modules: typeof next === "function" ? next(current.modules) : next });
  }, [resourceScope]);
  const getSessionRef = useRef(getSession);
  getSessionRef.current = getSession;
  const [eventsByCacheKey, setEventsByCacheKey] =
    useState<Record<string, CloudCommunityEvent[]>>({});
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [eventsVisibleMonthIso, setEventsVisibleMonthIso] = useState(() =>
    normalizeEventsMonthIso(null),
  );
  const eventsVisibleRange = useMemo(
    () => getWebCommunityEventsMonthRange(eventsVisibleMonthIso),
    [eventsVisibleMonthIso],
  );
  const eventsCacheKey = useMemo(
    () =>
      activeCommunityId && resolveAuthSubject(session)
        ? buildEventsCacheKey(`${activeCommunityId}:${resolveAuthSubject(session)}`, eventsVisibleRange)
        : null,
    [activeCommunityId, eventsVisibleRange, session?.user.id],
  );
  const eventsSubject = resolveAuthSubject(session);
  const eventsLiveArgs = useMemo(
    () =>
      activePage === "community" && communityTab === "events" && activeCommunityId && eventsSubject
        ? {
            authSubject: eventsSubject,
            communityId: activeCommunityId,
            startIso: eventsVisibleRange.startIso,
            endIso: eventsVisibleRange.endIso,
            includeCancelled: false,
            overlap: true,
            limit: 500,
          }
        : null,
    [activeCommunityId, activePage, communityTab, eventsSubject, eventsVisibleRange.endIso, eventsVisibleRange.startIso],
  );
  // Single live stream (shared/liveQuery.ts): opening Events subscribes once
  // and keeps the last answer warm for 30s across tab switches — no duplicate
  // one-shot HTTP read on tab entry.
  const liveEvents = useLiveQuery<unknown>(
    session,
    "communityEvents:listCommunityEvents",
    eventsLiveArgs,
  );
  const liveEventsRows = useMemo(
    () => (liveEvents.data !== undefined ? coerceGatewayRows<CloudCommunityEvent>(liveEvents.data) : null),
    [liveEvents.data],
  );
  const events = useMemo(
    () => {
      if (eventsLiveArgs && liveEventsRows !== null) return liveEventsRows;
      return eventsCacheKey ? eventsByCacheKey[eventsCacheKey] ?? [] : [];
    },
    [eventsByCacheKey, eventsCacheKey, eventsLiveArgs, liveEventsRows],
  );
  const hasLoadedVisibleEventsRange = Boolean(
    (eventsLiveArgs && liveEventsRows !== null)
    || (eventsCacheKey && Object.prototype.hasOwnProperty.call(eventsByCacheKey, eventsCacheKey)),
  );
  const liveEventsErrorMessage =
    eventsLiveArgs && liveEvents.error
      ? (liveEvents.error instanceof Error ? liveEvents.error.message : "Could not load community events.")
      : null;
  const effectiveEventsError = eventsError ?? (!hasLoadedVisibleEventsRange ? liveEventsErrorMessage : null);
  const effectiveIsLoadingEvents =
    isLoadingEvents
    || Boolean(eventsLiveArgs && liveEventsRows === null && !liveEvents.error && !eventsError && !hasLoadedVisibleEventsRange);
  const setEvents = useCallback<Dispatch<SetStateAction<CloudCommunityEvent[]>>>(
    (nextEvents) => {
      setEventsByCacheKey((current) => {
        const currentEvents = eventsCacheKey ? current[eventsCacheKey] ?? [] : [];
        const resolvedEvents =
          typeof nextEvents === "function" ? nextEvents(currentEvents) : nextEvents;
        if (!eventsCacheKey) {
          return resolvedEvents.length === 0 ? {} : current;
        }
        return { ...current, [eventsCacheKey]: resolvedEvents };
      });
    },
    [eventsCacheKey],
  );
  const resetEventsCache = useCallback(() => {
    setEventsByCacheKey({});
  }, []);
  const invalidateEventsCacheForCommunity = useCallback((communityId: string) => {
    const prefix = `${communityId}:`;
    setEventsByCacheKey((current) => {
      let changed = false;
      const next: Record<string, CloudCommunityEvent[]> = {};
      for (const [key, cachedEvents] of Object.entries(current)) {
        if (key.startsWith(prefix)) {
          changed = true;
          continue;
        }
        next[key] = cachedEvents;
      }
      return changed ? next : current;
    });
  }, []);

  const resourceUi = useWebCommunityResourceUiController<
    AuthSession,
    WebCommunityResource,
    WebCommunityResourceModule
  >({
    activeCommunityId,
    session,
    ensureSession,
    parseEmbedUrl,
    communityResources: resources,
    communityResourceModules: modules,
    setCommunityResources: setResources,
    setCommunityResourceModules: setModules,
  });

  const {
    loadCommunityEvents,
    handleSaveCommunityEvent,
    handleCancelCommunityEvent,
  } = useCommunityEventsController<AuthSession>({
    activeCommunityId,
    visibleRange: eventsVisibleRange,
    session,
    ensureSession,
    setCommunityEvents: setEvents,
    setIsLoadingCommunityEvents: setIsLoadingEvents,
    setCommunityEventsError: setEventsError,
    invalidateCommunityEventsCache: invalidateEventsCacheForCommunity,
    skipReloadAfterMutation: Boolean(eventsLiveArgs),
  });

  // Live (shared/liveQuery.ts): while Knowledge is open, courses and lessons
  // commit straight from the live stream (with the 201-row overflow sentinel)
  // — no throw-away stringify-and-refetch on live changes, and zero initial
  // HTTP fetch when returning within the 30s linger window.
  const knowledgeLiveArgs = useMemo(
    () =>
      activePage === "community" && communityTab === "resources" && activeCommunityId && eventsSubject
        ? { authSubject: eventsSubject, communityId: activeCommunityId, limit: 201 }
        : null,
    [activeCommunityId, activePage, communityTab, eventsSubject],
  );
  const liveResources = useLiveQuery<unknown>(
    session,
    "communityResources:listCommunityResources",
    knowledgeLiveArgs,
  );
  const liveModules = useLiveQuery<unknown>(
    session,
    "communityResources:listCommunityResourceModules",
    knowledgeLiveArgs,
  );
  const hasWarmLiveKnowledge = Boolean(
    knowledgeLiveArgs
    && liveResources.data !== undefined && !liveResources.error
    && liveModules.data !== undefined && !liveModules.error,
  );

  useEffect(() => {
    if (!activeCommunityId || !knowledgeLiveArgs) return;
    if (liveResources.error) {
      if (liveResources.data !== undefined) {
        resourceUi.applyLiveResourceCollectionError("resources", activeCommunityId, liveResources.error);
      }
      return;
    }
    if (liveResources.data === undefined) return;
    resourceUi.applyLiveResourceCollection(
      "resources",
      activeCommunityId,
      coerceGatewayRows<WebCommunityResource>(liveResources.data),
    );
  }, [
    activeCommunityId,
    knowledgeLiveArgs,
    liveResources.data,
    liveResources.error,
    resourceUi.applyLiveResourceCollection,
    resourceUi.applyLiveResourceCollectionError,
  ]);

  useEffect(() => {
    if (!activeCommunityId || !knowledgeLiveArgs) return;
    if (liveModules.error) {
      if (liveModules.data !== undefined) {
        resourceUi.applyLiveResourceCollectionError("modules", activeCommunityId, liveModules.error);
      }
      return;
    }
    if (liveModules.data === undefined) return;
    resourceUi.applyLiveResourceCollection(
      "modules",
      activeCommunityId,
      coerceGatewayRows<WebCommunityResourceModule>(liveModules.data),
    );
  }, [
    activeCommunityId,
    knowledgeLiveArgs,
    liveModules.data,
    liveModules.error,
    resourceUi.applyLiveResourceCollection,
    resourceUi.applyLiveResourceCollectionError,
  ]);

  useCommunityResourcesTabLifecycle<AuthSession>({
    activePage,
    communityTab,
    session,
    activeCommunityId,
    loadCommunityResources: resourceUi.loadCommunityResources,
    requireCommunityPage: true,
    skipInitialLoad: hasWarmLiveKnowledge,
  });

  useEffect(() => {
    const handleResourcesMutated = (event: Event) => {
      const detail = readCommunityResourcesMutatedEventDetail(event);
      if (!detail || detail.communityId !== activeCommunityId) return;
      const activeSession = getSessionRef.current();
      if (!activeSession) return;
      void resourceUi.loadCommunityResources(detail.communityId, activeSession).catch((loadError) => {
        console.warn(
          "[community-resources] failed to refresh after resource mutation:",
          loadError,
        );
      });
    };
    window.addEventListener(COMMUNITY_RESOURCES_MUTATED_EVENT, handleResourcesMutated);
    return () => {
      window.removeEventListener(COMMUNITY_RESOURCES_MUTATED_EVENT, handleResourcesMutated);
    };
  }, [
    activeCommunityId,
    resourceUi.loadCommunityResources,
  ]);

  const resetContentState = useCallback(() => {
    setResources([]);
    setModules([]);
    resetEventsCache();
    setIsLoadingEvents(false);
    setEventsError(null);
    resourceUi.setEditingResourceId(null);
    resourceUi.setResourceTitleInput("");
    resourceUi.setResourceUrlInput("");
    resourceUi.setResourceBodyInput("");
    resourceUi.setResourcePinnedInput(false);
    resourceUi.setResourceError(null);
    resourceUi.setIsSavingResource(false);
  }, [resetEventsCache, resourceUi]);

  useEffect(() => {
    setIsLoadingEvents(false);
    setEventsError(null);
  }, [activeCommunityId]);

  const reloadActiveEvents = useCallback(
    async (range: CommunityEventsRange): Promise<void> => {
      if (!activeCommunityId || !session) return;
      await loadCommunityEvents(
        activeCommunityId,
        session,
        range,
      );
    },
    [activeCommunityId, session, loadCommunityEvents],
  );

  return {
    resources,
    modules,
    isLoadingResources: resourceUi.resourceRead.status === "pending",
    isLoadingModules: resourceUi.moduleRead.status === "pending",
    retryResourceRead: (collection: "resources" | "modules") => {
      if (!activeCommunityId || !session) return Promise.resolve();
      return resourceUi.refreshCommunityResources(activeCommunityId, session, [collection]);
    },
    events,
    hasLoadedVisibleEventsRange,
    isLoadingEvents: effectiveIsLoadingEvents,
    eventsError: effectiveEventsError,
    eventsVisibleMonthIso,
    setEventsVisibleMonthIso,
    eventsVisibleRange,
    eventsCacheKey,
    resetEventsCache,
    resetContentState,
    loadCommunityEvents,
    reloadActiveEvents,
    handleSaveCommunityEvent,
    handleCancelCommunityEvent,
    ...resourceUi,
  };
}
