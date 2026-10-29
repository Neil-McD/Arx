import { useCallback, useEffect, useState } from "react";
import type { CommunityLessonProgressStatus } from "../../../../shared/communityLessonContract";
import type { CommunityTrackView } from "../../../../shared/communityLessonTracks";
import {
  fetchCloudOwnResourceProgress,
  setCloudOwnLessonResponse,
  setCloudOwnResourceProgress,
  type CommunityLessonResponse,
  type CommunityResourceProgressState,
  type SetCommunityLessonResponseResult,
} from "../../../../shared/cloudCommunityResourceProgressGateway";

export type WebCommunityLessonProgress = {
  /** Status by lesson ref; a lesson with no entry is not started. */
  statusByRef: Readonly<Record<string, CommunityLessonProgressStatus>>;
  /** Saved answers to lesson elements, by lesson ref, then element id. */
  responsesByRef: Readonly<Record<string, Readonly<Record<string, CommunityLessonResponse>>>>;
  /** The member's skill tracks, as the server worked them out (rules, Workflow stage, client properties). */
  tracks: readonly CommunityTrackView[];
  loaded: boolean;
  error: string | null;
  /** Why the last Mark as done on a lesson didn't stick, shown beside that lesson's button. */
  statusError: { ref: string; message: string } | null;
  /** Reads progress again, e.g. after the owner changed a track. */
  reload: () => void;
  setStatus: (resourceId: string, ref: string, status: CommunityLessonProgressStatus) => void;
  answer: (resourceId: string, ref: string, element: string, value: true | string[] | null) => Promise<SetCommunityLessonResponseResult>;
};

type LoadedProgress = {
  communityId: string;
  statusByRef: Record<string, CommunityLessonProgressStatus>;
  responsesByRef: Record<string, Record<string, CommunityLessonResponse>>;
  tracks: CommunityTrackView[];
};

/**
 * The signed-in member's own lesson progress for one community, read from and
 * written to the same store the site SDK's progress()/setProgress() use. Writes
 * show at once and are put back if the server refuses them (a locked lesson).
 */
// The server names unfinished parts by element id; the member needs the plain reason.
function statusFailureMessage(code: string, message: string): string {
  if (code === "lesson_elements_incomplete") return "Answer the required questions in this lesson first, then mark it done.";
  return message;
}

export function useWebCommunityLessonProgress<SessionT>(params: {
  communityId: string | null;
  session: SessionT | null;
}): WebCommunityLessonProgress {
  const { communityId, session } = params;
  const [state, setState] = useState<LoadedProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<{ ref: string; message: string } | null>(null);

  const load = useCallback(() => {
    if (!communityId || !session) return () => {};
    let cancelled = false;
    fetchCloudOwnResourceProgress({ session, communityId })
      .then((progress: CommunityResourceProgressState) => {
        if (cancelled) return;
        setState({
          communityId,
          statusByRef: Object.fromEntries(progress.lessons.map((lesson) => [lesson.ref, lesson.status])),
          responsesByRef: Object.fromEntries(progress.lessons.map((lesson) => [
            lesson.ref,
            Object.fromEntries((lesson.responses ?? []).map((response) => [response.element, response])),
          ])),
          tracks: progress.tracks ?? [],
        });
        setError(null);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Progress is unavailable.");
      });
    return () => { cancelled = true; };
  }, [communityId, session]);

  useEffect(() => load(), [load]);

  const setStatus = useCallback((resourceId: string, ref: string, status: CommunityLessonProgressStatus) => {
    if (!communityId || !session) return;
    let previous: CommunityLessonProgressStatus | undefined;
    // Only the member's own retry clears the reason; the viewer's automatic
    // in_progress write after a short read must not wipe it.
    if (status === "done") setStatusError((current) => (current?.ref === ref ? null : current));
    setState((current) => {
      const own = current?.communityId === communityId ? current : null;
      const statusByRef = { ...(own?.statusByRef ?? {}) };
      previous = statusByRef[ref];
      statusByRef[ref] = status;
      return { communityId, statusByRef, responsesByRef: own?.responsesByRef ?? {}, tracks: own?.tracks ?? [] };
    });
    setCloudOwnResourceProgress({ session, communityId, resourceId, status })
      .then((result) => {
        // Finishing a step can open stages and tracks; the server works that out.
        if (result.ok) { if (status === "done" || previous === "done") load(); return; }
        const message = statusFailureMessage(result.code, result.message);
        setError(message);
        setStatusError({ ref, message });
        setState((current) => {
          if (!current || current.communityId !== communityId) return current;
          const statusByRef = { ...current.statusByRef };
          if (previous) statusByRef[ref] = previous; else delete statusByRef[ref];
          return { ...current, statusByRef };
        });
      })
      .catch(() => { load(); });
  }, [communityId, session, load]);

  // Answers wait for the server: a quiz's result is only known once it's graded.
  const answer = useCallback(async (resourceId: string, ref: string, element: string, value: true | string[] | null) => {
    if (!communityId || !session) {
      return { ok: false as const, code: "signed_out", message: "Sign in to save your answers." };
    }
    const result = await setCloudOwnLessonResponse({ session, communityId, resourceId, element, value });
    if (result.ok) {
      setStatusError((current) => (current?.ref === ref ? null : current));
      setState((current) => {
        if (!current || current.communityId !== communityId) return current;
        const lessonResponses = { ...(current.responsesByRef[ref] ?? {}) };
        if (result.response) lessonResponses[element] = result.response; else delete lessonResponses[element];
        const statusByRef = { ...current.statusByRef };
        if (!statusByRef[ref] || statusByRef[ref] === "not_started") statusByRef[ref] = "in_progress";
        return { ...current, statusByRef, responsesByRef: { ...current.responsesByRef, [ref]: lessonResponses } };
      });
    }
    return result;
  }, [communityId, session]);

  const current = state && state.communityId === communityId ? state : null;
  return {
    statusByRef: current?.statusByRef ?? {},
    responsesByRef: current?.responsesByRef ?? {},
    tracks: current?.tracks ?? [],
    loaded: Boolean(current),
    error,
    statusError: current ? statusError : null,
    reload: load,
    setStatus,
    answer,
  };
}
