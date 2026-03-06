import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { ensureDefaultCloudProjectId } from "./daytonaCloudProjects";
import {
  getConvexCloudThreadRowByThreadKey,
  isConvexCloudThreadsEnabled,
} from "./daytonaCloudThreadsRead";
import {
  ensureCloudThreadRecord,
  updateCloudThreadRecord,
} from "./cloudThreadsGateway";

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
    const hasConvex = isConvexCloudThreadsEnabled();
    if (!hasConvex) {
      console.warn("Convex is required for cloud thread creation in this build.");
      return null;
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const id = crypto.randomUUID();
    const communityId = current.activeCommunityId;
    const enabled = current.modelToggles.filter((toggle) => toggle.enabled);
    const preferredModelId =
      (current.activeModelId ?? "").trim() ||
      enabled.find((toggle) => toggle.id === current.defaultActiveModelId)?.id ||
      enabled[0]?.id ||
      current.defaultActiveModelId;
    const preferredProjectId = (current.activeProjectId ?? "").trim() || null;
    const projectId = preferredProjectId
      ?? (await ensureDefaultCloudProjectId({
        session,
      }));
    try {
      await ensureCloudThreadRecord({
        session: session as any,
        thread: {
          threadId: id,
          title: null,
          engineId: "arx_harness",
          modelId: preferredModelId,
          projectId: projectId || null,
          communityId,
          contextVersion: 0,
        },
      });
      const convexRow = await getConvexCloudThreadRowByThreadKey({
        session: session as any,
        threadKey: id,
      });
      const record: ThreadRecord = {
        id: convexRow?.id ?? id,
        title: convexRow?.title ?? null,
        engine_id: convexRow?.engine_id ?? "arx_harness",
        model_id: convexRow?.model_id ?? preferredModelId,
        project_id: convexRow?.project_id ?? projectId,
        community_id: convexRow?.community_id ?? communityId,
        context_version: Number.isFinite(convexRow?.context_version) ? convexRow!.context_version : 0,
        last_seq: Number.isFinite(convexRow?.last_seq) ? convexRow!.last_seq : 0,
        created_at: convexRow ? current.toEpochSeconds(convexRow.created_at) : nowSec,
        updated_at: convexRow ? current.toEpochSeconds(convexRow.updated_at) : nowSec,
      };
      current.setThreads((prev) => [record, ...prev]);
      current.setWorkspaceWantsNewChatMode(false);
      current.setActiveThreadId(record.id);
      return record;
    } catch (error) {
      console.warn("Failed to create cloud thread in Convex:", error);
      return null;
    }
  }, []);

  const updateThreadModel = useCallback(async (threadId: string, modelId: string, session: SessionT): Promise<void> => {
    const current = argsRef.current;
    const hasConvex = isConvexCloudThreadsEnabled();
    if (!hasConvex) {
      console.warn("Convex is required for cloud thread model updates in this build.");
      return;
    }
    try {
      await updateCloudThreadRecord({
        session: session as any,
        thread: {
          threadId,
          modelId,
        },
      });
      current.setThreads((prev) => prev.map((thread) => (thread.id === threadId ? { ...thread, model_id: modelId } : thread)));
    } catch (error) {
      console.warn("Failed to update Convex thread model:", error);
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

      const hasConvex = isConvexCloudThreadsEnabled();
      if (!hasConvex) {
        console.warn("Convex is required for cloud thread title updates in this build.");
        return;
      }
      try {
        await updateCloudThreadRecord({
          session: session as any,
          thread: {
            threadId,
            title: nextTitle,
          },
        });
      } catch (error) {
        console.warn("Failed to set Convex thread title:", error);
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
      const hasConvex = isConvexCloudThreadsEnabled();
      if (!hasConvex) {
        console.warn("Convex is required for cloud thread context updates in this build.");
        return null;
      }
      const nowIso = new Date().toISOString();
      let nextContextVersion = 1;
      current.setThreads((prev) =>
        prev.map((thread) => {
          if (thread.id !== threadId) return thread;
          const baseVersion =
            typeof thread.context_version === "number" && Number.isFinite(thread.context_version)
              ? thread.context_version
              : 0;
          nextContextVersion = baseVersion + 1;
          return {
            ...thread,
            community_id: communityId,
            context_version: nextContextVersion,
            updated_at: Math.floor(Date.now() / 1000),
          };
        }),
      );
      try {
        await updateCloudThreadRecord({
          session: session as any,
          thread: {
            threadId,
            communityId,
            contextVersion: nextContextVersion,
          },
        });
      } catch (error) {
        console.warn("Failed to update Convex thread community lens:", error);
      }
      return {
        thread_id: threadId,
        community_id: communityId,
        context_version: nextContextVersion,
        updated_at: nowIso,
      };
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
