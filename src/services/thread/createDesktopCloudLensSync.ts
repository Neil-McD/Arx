import { ThreadRecord } from "../../runtime/arp/types";

import { fetchCloudThreadContextById, setCloudThreadContext } from "../../../shared/cloudThreadContextGateway";
import {
  syncThreadCommunityLensCloud,
  type ThreadContextCloudState,
} from "../../../shared/threadContextCloudSync";

type DesktopCloudSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: {
    id: string;
    email?: string;
  };
};

type CreateDesktopCloudLensSyncDeps = {
  toUnixSecondsFromIso: (value: string | null | undefined) => number | null;
  getThreads: () => ThreadRecord[];
  setThreads: (updater: (prev: ThreadRecord[]) => ThreadRecord[]) => void;
};

type SetThreadCommunityLensInCloudParams = {
  threadId: string;
  communityId: string | null;
  session: DesktopCloudSession;
  expectedContextVersion: number | null;
};

function isThreadContextVersionConflict(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("thread context version conflict")
    || normalized.includes("thread_context_version_conflict");
}

export function createDesktopCloudLensSync(deps: CreateDesktopCloudLensSyncDeps) {
  return async function setThreadCommunityLensInCloud(
    params: SetThreadCommunityLensInCloudParams,
  ): Promise<ThreadRecord | null> {
    const applyObservedContext = (context: ThreadContextCloudState): void => {
      const updatedAt = deps.toUnixSecondsFromIso(context.updated_at) ?? Math.floor(Date.now() / 1000);
      deps.setThreads((prev) =>
        prev.map((thread) =>
          thread.id === params.threadId
            ? {
                ...thread,
                community_id: context.community_id ?? null,
                context_version: context.context_version,
                updated_at: updatedAt,
              }
            : thread,
        ),
      );
    };

    const loadLatestCloudContext = async (): Promise<ThreadContextCloudState | null> => {
      return await fetchCloudThreadContextById({
        session: params.session,
        threadId: params.threadId,
      });
    };

    const setCloudContext = async (
      expectedContextVersion: number,
    ): Promise<ThreadContextCloudState | null> => {
      return await setCloudThreadContext({
        session: params.session,
        threadId: params.threadId,
        expectedContextVersion,
        communityId: params.communityId,
      });
    };

    const updated = await syncThreadCommunityLensCloud({
      threadId: params.threadId,
      desiredCommunityId: params.communityId,
      initialExpectedContextVersion: params.expectedContextVersion,
      fetchLatestContext: loadLatestCloudContext,
      setThreadContext: setCloudContext,
      onObservedContext: applyObservedContext,
      isConflictError: isThreadContextVersionConflict,
    });

    if (
      !updated
      && (params.expectedContextVersion === null || !Number.isFinite(params.expectedContextVersion))
    ) {
      throw new Error("Thread not found.");
    }

    const current = deps.getThreads().find((thread) => thread.id === params.threadId) ?? null;
    if (!current) return null;
    if (!updated) return current;

    const updatedAt = deps.toUnixSecondsFromIso(updated.updated_at) ?? current.updated_at;
    return {
      ...current,
      community_id: updated.community_id ?? null,
      context_version: updated.context_version,
      updated_at: updatedAt,
      last_event_at: Math.max(current.last_event_at ?? 0, updatedAt),
    };
  };
}
