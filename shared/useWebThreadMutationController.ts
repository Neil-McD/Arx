import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import type { ThreadContextCloudState } from "./threadContextCloudSync";

type ThreadRecord = {
  id: string;
  title: string | null;
  engine_id: string;
  model_id: string | null;
  project_id: string | null;
  community_id: string | null;
  context_version: number;
  last_seq: number;
  created_at: number;
  updated_at: number;
};

type ModelToggle = {
  id: string;
  label: string;
  enabled: boolean;
};

type UseWebThreadMutationControllerArgs<SessionT> = {
  getSupabaseUrl: () => string | null;
  getSupabaseAuthUid: (session: SessionT) => string;
  fetchWithSupabaseAuth: (url: string, init: RequestInit, session: SessionT) => Promise<Response>;
  readSupabaseError: (response: Response) => Promise<string>;
  syncThreadCommunityLensCloud: typeof import("./threadContextCloudSync").syncThreadCommunityLensCloud;
  deriveThreadTitleFromUserText: (userText: string) => string | null;
  isMissingThreadTitleValue: (value: string | null | undefined) => boolean;
  toEpochSeconds: (value: string) => number;

  activeCommunityId: string | null;
  activeProjectId?: string | null;
  activeModelId: string | null;
  modelToggles: ModelToggle[];
  threads: ThreadRecord[];
  defaultActiveModelId: string;

  setThreads: Dispatch<SetStateAction<ThreadRecord[]>>;
  setWorkspaceWantsNewChatMode: (next: boolean) => void;
  setActiveThreadId: Dispatch<SetStateAction<string | null>>;
};

export function useWebThreadMutationController<SessionT>(
  args: UseWebThreadMutationControllerArgs<SessionT>,
) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const createThread = useCallback(async (session: SessionT): Promise<ThreadRecord | null> => {
    const current = argsRef.current;
    const url = current.getSupabaseUrl();
    if (!url) return null;
    const nowSec = Math.floor(Date.now() / 1000);
    const id = crypto.randomUUID();
    const ownerId = current.getSupabaseAuthUid(session);
    const communityId = current.activeCommunityId;
    const enabled = current.modelToggles.filter((toggle) => toggle.enabled);
    const preferredModelId =
      (current.activeModelId ?? "").trim() ||
      enabled.find((toggle) => toggle.id === current.defaultActiveModelId)?.id ||
      enabled[0]?.id ||
      current.defaultActiveModelId;
    const preferredProjectId = (current.activeProjectId ?? "").trim();
    let projectId = preferredProjectId;
    if (!projectId) {
      const projectResponse = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/rpc/ensure_default_cloud_project`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
        session,
      );
      if (!projectResponse.ok) {
        const message = await current.readSupabaseError(projectResponse);
        throw new Error(message);
      }
      const payload = (await projectResponse.json()) as unknown;
      const rows = Array.isArray(payload) ? payload : [payload];
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const candidate = String((row as Record<string, unknown>).id ?? "").trim();
        if (!candidate) continue;
        projectId = candidate;
        break;
      }
      if (!projectId) {
        throw new Error("Default cloud project payload is missing id.");
      }
    }
    const body = {
      id,
      owner_id: ownerId,
      title: null,
      engine_id: "arx_harness",
      model_id: preferredModelId,
      thread_lane: "chat",
      project_id: projectId,
      community_id: communityId,
    };
    try {
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/threads`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        session,
      );
      if (!response.ok) {
        const message = await current.readSupabaseError(response);
        throw new Error(message);
      }
      const record: ThreadRecord = {
        id,
        title: null,
        engine_id: "arx_harness",
        model_id: preferredModelId,
        project_id: projectId,
        community_id: communityId,
        context_version: 0,
        last_seq: 0,
        created_at: nowSec,
        updated_at: nowSec,
      };
      current.setThreads((prev) => [record, ...prev]);
      current.setWorkspaceWantsNewChatMode(false);
      current.setActiveThreadId(id);
      return record;
    } catch (error) {
      console.warn("Failed to create thread:", error);
      return null;
    }
  }, []);

  const updateThreadModel = useCallback(async (threadId: string, modelId: string, session: SessionT): Promise<void> => {
    const current = argsRef.current;
    const url = current.getSupabaseUrl();
    if (!url) return;
    try {
      const response = await current.fetchWithSupabaseAuth(
        `${url}/rest/v1/threads?id=eq.${encodeURIComponent(threadId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ model_id: modelId }),
        },
        session,
      );
      if (!response.ok) throw new Error(await current.readSupabaseError(response));
      current.setThreads((prev) => prev.map((thread) => (thread.id === threadId ? { ...thread, model_id: modelId } : thread)));
    } catch (error) {
      console.warn("Failed to update thread model:", error);
    }
  }, []);

  const maybeSetThreadTitleFromText = useCallback(
    async (threadId: string, userText: string, session: SessionT): Promise<void> => {
      const current = argsRef.current;
      const nextTitle = current.deriveThreadTitleFromUserText(userText);
      if (!nextTitle) return;
      let shouldPersist = false;
      current.setThreads((prev) =>
        prev.map((thread) => {
          if (thread.id !== threadId) return thread;
          if (!current.isMissingThreadTitleValue(thread.title)) return thread;
          shouldPersist = true;
          return { ...thread, title: nextTitle };
        }),
      );
      if (!shouldPersist) return;

      const url = current.getSupabaseUrl();
      if (!url) return;
      try {
        const response = await current.fetchWithSupabaseAuth(
          `${url}/rest/v1/threads?id=eq.${encodeURIComponent(threadId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
            body: JSON.stringify({ title: nextTitle }),
          },
          session,
        );
        if (!response.ok) throw new Error(await current.readSupabaseError(response));
      } catch (error) {
        console.warn("Failed to set thread title:", error);
      }
    },
    [],
  );

  const setThreadCommunityLens = useCallback(
    async (
      threadId: string,
      communityId: string | null,
      session: SessionT,
    ): Promise<{ thread_id: string; community_id: string | null; context_version: number; updated_at: string } | null> => {
      const current = argsRef.current;
      const url = current.getSupabaseUrl();
      if (!url) return null;

      const applyObservedContext = (context: ThreadContextCloudState): void => {
        current.setThreads((prev) =>
          prev.map((thread) =>
            thread.id === threadId
              ? {
                  ...thread,
                  community_id: context.community_id,
                  context_version: context.context_version,
                  updated_at: current.toEpochSeconds(context.updated_at),
                }
              : thread,
          ),
        );
      };

      const loadLatestCloudContext = async (): Promise<ThreadContextCloudState | null> => {
        const contextResponse = await current.fetchWithSupabaseAuth(
          `${url}/rest/v1/threads?select=id,community_id,context_version,updated_at&id=eq.${encodeURIComponent(threadId)}&limit=1`,
          { method: "GET" },
          session,
        );
        if (!contextResponse.ok) throw new Error(await current.readSupabaseError(contextResponse));
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

      const currentThread = current.threads.find((thread) => thread.id === threadId) ?? null;
      const expectedContextVersion =
        typeof currentThread?.context_version === "number" ? currentThread.context_version : null;

      const setCloudContext = async (expectedVersion: number): Promise<ThreadContextCloudState | null> => {
        const response = await current.fetchWithSupabaseAuth(
          `${url}/rest/v1/rpc/set_thread_context`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              p_thread_id: threadId,
              p_expected_context_version: expectedVersion,
              p_community_id: communityId,
              p_update_community_id: true,
            }),
          },
          session,
        );
        if (!response.ok) throw new Error(await current.readSupabaseError(response));
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
          context_version: Number.isFinite(parsedVersion) ? parsedVersion : expectedVersion + 1,
          updated_at: row.updated_at,
        };
      };

      return current.syncThreadCommunityLensCloud({
        threadId,
        desiredCommunityId: communityId,
        initialExpectedContextVersion: expectedContextVersion,
        fetchLatestContext: loadLatestCloudContext,
        setThreadContext: setCloudContext,
        onObservedContext: applyObservedContext,
      });
    },
    [],
  );

  return {
    createThread,
    updateThreadModel,
    maybeSetThreadTitleFromText,
    setThreadCommunityLens,
  };
}
