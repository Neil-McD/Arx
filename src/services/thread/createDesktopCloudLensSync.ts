import type { ThreadRecord } from "../../runtime/arp/types";
import type { SupabaseSession } from "../../../shared/supabaseAuthCore";
import {
  syncThreadCommunityLensCloud,
  type ThreadContextCloudState,
} from "../../../shared/threadContextCloudSync";

type FetchWithSupabaseAuth = (
  url: string,
  init: RequestInit,
  session: SupabaseSession,
) => Promise<Response>;

type CreateDesktopCloudLensSyncDeps = {
  getSupabaseUrl: () => string | null;
  fetchWithSupabaseAuth: FetchWithSupabaseAuth;
  readSupabaseError: (response: Response) => Promise<string>;
  toUnixSecondsFromIso: (value: string | null | undefined) => number | null;
  setThreads: (updater: (prev: ThreadRecord[]) => ThreadRecord[]) => void;
  getCloudThreadRecord: (
    threadId: string,
    session: SupabaseSession,
  ) => Promise<ThreadRecord | null>;
};

type SetThreadCommunityLensInCloudParams = {
  threadId: string;
  communityId: string | null;
  session: SupabaseSession;
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
    const url = deps.getSupabaseUrl();
    if (!url) throw new Error("Missing Supabase URL.");

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
      const contextResponse = await deps.fetchWithSupabaseAuth(
        `${url}/rest/v1/threads?select=id,community_id,context_version,updated_at&id=eq.${encodeURIComponent(params.threadId)}&limit=1`,
        { method: "GET" },
        params.session,
      );
      if (!contextResponse.ok) throw new Error(await deps.readSupabaseError(contextResponse));
      const rows = (await contextResponse.json()) as Array<{
        id: string;
        community_id: string | null;
        context_version: unknown;
        updated_at: string;
      }>;
      const row = rows[0] ?? null;
      if (!row?.id) return null;
      const parsedVersion =
        typeof row.context_version === "number"
          ? row.context_version
          : typeof row.context_version === "string"
            ? Number(row.context_version)
            : Number.NaN;
      return {
        thread_id: row.id,
        community_id: row.community_id ?? null,
        context_version: Number.isFinite(parsedVersion) ? parsedVersion : 0,
        updated_at: row.updated_at,
      };
    };

    const setCloudContext = async (
      expectedContextVersion: number,
    ): Promise<ThreadContextCloudState | null> => {
      const response = await deps.fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/set_thread_context`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            p_thread_id: params.threadId,
            p_expected_context_version: expectedContextVersion,
            p_community_id: params.communityId,
            p_update_community_id: true,
          }),
        },
        params.session,
      );
      if (!response.ok) throw new Error(await deps.readSupabaseError(response));
      const rows = (await response.json()) as Array<{
        thread_id: string;
        community_id: string | null;
        context_version: unknown;
        updated_at: string;
      }>;
      const row = rows[0] ?? null;
      if (!row?.thread_id) return null;
      const parsedVersion =
        typeof row.context_version === "number"
          ? row.context_version
          : typeof row.context_version === "string"
            ? Number(row.context_version)
            : Number.NaN;
      return {
        thread_id: row.thread_id,
        community_id: row.community_id ?? null,
        context_version: Number.isFinite(parsedVersion) ? parsedVersion : expectedContextVersion + 1,
        updated_at: row.updated_at,
      };
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
    return deps.getCloudThreadRecord(params.threadId, params.session);
  };
}
