import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { resolveAuthSubject, type AuthSessionLike } from "./authSession";
import {
  cancelCloudCommunityEvent,
  listCloudCommunityEvents,
  saveCloudCommunityEvent,
  type CloudCommunityEvent,
  type CloudCommunityEventSavePayload,
} from "./cloudCommunityEventsGateway";
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
  visibleRange?: CommunityEventsRange;
  setCommunityEvents: Dispatch<SetStateAction<CloudCommunityEvent[]>>;
  setIsLoadingCommunityEvents: Dispatch<SetStateAction<boolean>>;
  setCommunityEventsError: Dispatch<SetStateAction<string | null>>;
  invalidateCommunityEventsCache?: (communityId: string) => void;
};

export function useCommunityEventsController<SessionT extends SessionLike>(
  args: UseCommunityEventsControllerArgs<SessionT>,
) {
  const argsRef = useRef(args);
  argsRef.current = args;
  const eventsLoadGenerationRef = useRef(0);
  const scopeKey = JSON.stringify([resolveAuthSubject(args.session as AuthSessionLike), args.activeCommunityId, args.visibleRange]);
  const scopeRef = useRef(scopeKey);
  if (scopeRef.current !== scopeKey) {
    scopeRef.current = scopeKey;
    eventsLoadGenerationRef.current += 1;
  }
  useEffect(() => () => { eventsLoadGenerationRef.current += 1; }, []);

  const loadCommunityEvents = useCallback(async (
    communityId: string,
    session: SessionT,
    range: CommunityEventsRange,
  ) => {
    const current = argsRef.current;
    const requestedCommunityId = String(communityId ?? "").trim();
    const account = resolveAuthSubject(session as AuthSessionLike);
    if (!requestedCommunityId || requestedCommunityId !== current.activeCommunityId || !account || account !== resolveAuthSubject(current.session as AuthSessionLike)) return;
    if (current.visibleRange && (current.visibleRange.startIso !== range.startIso || current.visibleRange.endIso !== range.endIso)) return;
    const requestScope = scopeRef.current;
    const generation = (eventsLoadGenerationRef.current += 1);
    const isCurrentEventsLoad = () =>
      eventsLoadGenerationRef.current === generation &&
      scopeRef.current === requestScope &&
      String(argsRef.current.activeCommunityId ?? "").trim() === requestedCommunityId;
    current.setIsLoadingCommunityEvents(true);
    current.setCommunityEventsError(null);
    try {
      const usableSession = await resolveUsableSession(session, current.ensureSession);
      if (!isCurrentEventsLoad()) return;
      if (resolveAuthSubject(usableSession as AuthSessionLike) !== account) {
        current.setCommunityEventsError("Your session could not be verified. Try again, or sign in again.");
        return;
      }
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
      if (!isCurrentEventsLoad()) return;
      const message = error instanceof Error ? error.message : "Could not load community events.";
      current.setCommunityEventsError(message);
    } finally {
      if (isCurrentEventsLoad()) {
        current.setIsLoadingCommunityEvents(false);
      }
    }
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
