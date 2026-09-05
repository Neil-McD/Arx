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
import { useCommunityEventsTabLifecycle } from "../../../../shared/useCommunityEventsTabLifecycle";
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
  source_ingestion_kind?: "manual" | "url" | "file" | "google_drive" | "github";
  source_ingestion_error?: string | null;
  source_ingestion_attempted_at?: string | null;
  source_ingested_at?: string | null;
  source_original_filename?: string | null;
  source_original_mime_type?: string | null;
  source_original_bytes?: number | null;
  source_external_provider?: "google_drive" | "github" | null;
  source_external_id?: string | null;
  source_external_name?: string | null;
  source_external_url?: string | null;
  source_external_mime_type?: string | null;
  source_external_modified_at?: string | null;
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

export function getWebCommunityEventsMonthRange(monthIso: string): CommunityEventsRange {
  const monthStart = new Date(normalizeEventsMonthIso(monthIso));
  const start = new Date(monthStart);
  start.setDate(monthStart.getDate() - monthStart.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 42);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
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
  const [resources, setResources] = useState<WebCommunityResource[]>([]);
  const getSessionRef = useRef(getSession);
  getSessionRef.current = getSession;
  const [modules, setModules] = useState<WebCommunityResourceModule[]>([]);
  const [isLoadingResources, setIsLoadingResources] = useState(false);
  const [isLoadingModules, setIsLoadingModules] = useState(false);
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
  const events = useMemo(
    () => (eventsCacheKey ? eventsByCacheKey[eventsCacheKey] ?? [] : []),
    [eventsByCacheKey, eventsCacheKey],
  );
  const hasLoadedVisibleEventsRange = Boolean(
    eventsCacheKey
    && Object.prototype.hasOwnProperty.call(eventsByCacheKey, eventsCacheKey),
  );
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
    setIsLoadingResources,
    setIsLoadingResourceModules: setIsLoadingModules,
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
  });

  useCommunityResourcesTabLifecycle<AuthSession>({
    activePage,
    communityTab,
    session,
    activeCommunityId,
    loadCommunityResources: resourceUi.loadCommunityResources,
    requireCommunityPage: true,
  });
  useCommunityEventsTabLifecycle<AuthSession>({
    activePage,
    communityTab,
    session,
    activeCommunityId,
    range: eventsVisibleRange,
    loadCommunityEvents,
    requireCommunityPage: true,
  });

  useEffect(() => {
    const handleResourcesMutated = (event: Event) => {
      const detail = readCommunityResourcesMutatedEventDetail(event);
      if (!detail || detail.communityId !== activeCommunityId) return;
      const activeSession = getSessionRef.current();
      if (!activeSession) return;
      void Promise.all([
        resourceUi.loadCommunityResourceModules(detail.communityId, activeSession),
        resourceUi.loadCommunityResources(detail.communityId, activeSession),
      ]).catch((loadError) => {
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
    resourceUi.loadCommunityResourceModules,
    resourceUi.loadCommunityResources,
  ]);

  const resetContentState = useCallback(() => {
    setResources([]);
    setModules([]);
    setIsLoadingResources(false);
    setIsLoadingModules(false);
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
    setResources([]);
    setModules([]);
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
    isLoadingResources,
    isLoadingModules,
    events,
    hasLoadedVisibleEventsRange,
    isLoadingEvents,
    eventsError,
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
