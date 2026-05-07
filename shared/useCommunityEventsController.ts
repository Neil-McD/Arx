import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import {
  cancelCloudCommunityEvent,
  listCloudCommunityEvents,
  saveCloudCommunityEvent,
  type CloudCommunityEvent,
  type CloudCommunityEventSavePayload,
} from "./cloudCommunityEventsGateway";
import {
  abortAllScopedRequests,
  beginScopedAbortRequest,
  finishScopedAbortRequest,
  isAbortError,
} from "./communityFetchAbortScope";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";

type SessionLike = unknown;

export type CommunityEventsRange = {
  startIso: string;
  endIso: string;
};

type UseCommunityEventsControllerArgs<SessionT extends SessionLike> = {
  activeCommunityId: string | null;
  session: SessionT | null;
  ensureSession?: EnsureSessionFn<SessionT>;
  setCommunityEvents: Dispatch<SetStateAction<CloudCommunityEvent[]>>;
  setIsLoadingCommunityEvents: Dispatch<SetStateAction<boolean>>;
  setCommunityEventsError: Dispatch<SetStateAction<string | null>>;
  setCommunityEventsSuccess: Dispatch<SetStateAction<boolean>>;
  invalidateCommunityEventsCache?: (communityId: string) => void;
};

export function useCommunityEventsController<SessionT extends SessionLike>(
  args: UseCommunityEventsControllerArgs<SessionT>,
) {
  const argsRef = useRef(args);
  argsRef.current = args;
  const fetchAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const eventsLoadGenerationRef = useRef(0);

  const loadCommunityEvents = useCallback(async (
    communityId: string,
    session: SessionT,
    range: CommunityEventsRange,
  ) => {
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(session, current.ensureSession);
    if (!usableSession) return;
    const requestedCommunityId = String(communityId ?? "").trim();
    if (!requestedCommunityId) return;
    const generation = (eventsLoadGenerationRef.current += 1);
    const isCurrentEventsLoad = () =>
      eventsLoadGenerationRef.current === generation &&
      String(argsRef.current.activeCommunityId ?? "").trim() === requestedCommunityId;
    const fetchController = beginScopedAbortRequest({
      inFlightByKind: fetchAbortControllersRef.current,
      kind: "community_events_list",
    });
    current.setIsLoadingCommunityEvents(true);
    current.setCommunityEventsError(null);
    try {
      const rows = await listCloudCommunityEvents({
        session: usableSession,
        communityId: requestedCommunityId,
        startIso: range.startIso,
        endIso: range.endIso,
        limit: 500,
      });
      if (!isCurrentEventsLoad()) return;
      current.setCommunityEvents(rows);
    } catch (error) {
      if (isAbortError(error)) return;
      if (!isCurrentEventsLoad()) return;
      const message = error instanceof Error ? error.message : "Could not load community events.";
      current.setCommunityEventsError(message);
    } finally {
      finishScopedAbortRequest({
        inFlightByKind: fetchAbortControllersRef.current,
        kind: "community_events_list",
        controller: fetchController,
      });
      if (isCurrentEventsLoad()) {
        current.setIsLoadingCommunityEvents(false);
      }
    }
  }, []);

  useEffect(() => {
    return () => abortAllScopedRequests(fetchAbortControllersRef.current);
  }, []);

  const handleSaveCommunityEvent = useCallback(async (
    eventId: string | null,
    payload: CloudCommunityEventSavePayload,
    range: CommunityEventsRange,
  ) => {
    const current = argsRef.current;
    const session = await resolveUsableSession(current.session, current.ensureSession);
    if (!session || !current.activeCommunityId) return false;
    try {
      current.setCommunityEventsError(null);
      await saveCloudCommunityEvent({
        session,
        eventId,
        payload: {
          community_id: current.activeCommunityId,
          ...payload,
        },
      });
      current.invalidateCommunityEventsCache?.(current.activeCommunityId);
      await loadCommunityEvents(current.activeCommunityId, session, range);
      current.setCommunityEventsSuccess(true);
      window.setTimeout(() => current.setCommunityEventsSuccess(false), 2000);
      return true;
    } catch (error) {
      current.setCommunityEventsError(error instanceof Error ? error.message : "Could not save community event.");
      return false;
    }
  }, [loadCommunityEvents]);

  const handleCancelCommunityEvent = useCallback(async (
    eventId: string,
    range: CommunityEventsRange,
  ) => {
    const current = argsRef.current;
    const session = await resolveUsableSession(current.session, current.ensureSession);
    if (!session || !current.activeCommunityId) return false;
    try {
      current.setCommunityEventsError(null);
      await cancelCloudCommunityEvent({
        session,
        eventId,
      });
      current.invalidateCommunityEventsCache?.(current.activeCommunityId);
      await loadCommunityEvents(current.activeCommunityId, session, range);
      return true;
    } catch (error) {
      current.setCommunityEventsError(error instanceof Error ? error.message : "Could not cancel community event.");
      return false;
    }
  }, [loadCommunityEvents]);

  return {
    loadCommunityEvents,
    handleSaveCommunityEvent,
    handleCancelCommunityEvent,
  };
}
