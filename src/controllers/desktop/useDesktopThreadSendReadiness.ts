import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { ThreadService } from "../../../shared/threadService";
import { resolveCloudInferenceLane } from "../../../shared/inferenceLaneResolver";
import { isModelAvailableOnSurface } from "../../../shared/modelCatalog";

type ThreadSendReadinessThread = {
  id: string;
  engine_id: string;
  model_id: string | null;
};

type UseDesktopThreadSendReadinessArgs<ThreadT extends ThreadSendReadinessThread> = {
  threads: ThreadT[];
  getThreadRecord: (threadId: string) => Promise<ThreadT | null>;
  activeModelId: string | null;
  defaultModelId: string;
  freeModelAllowlist: ReadonlySet<string>;
  providerIdForModelId: (modelId: string) => string | null;
  onMissingModel: () => void;
  onInvalidModel: () => void;
  getThreadServiceById: (threadId: string) => ThreadService;
  setThreads: Dispatch<SetStateAction<ThreadT[]>>;
};

export function useDesktopThreadSendReadiness<ThreadT extends ThreadSendReadinessThread>(
  args: UseDesktopThreadSendReadinessArgs<ThreadT>,
) {
  const normalizeModelForDesktopSurface = useCallback((requestedIds: Array<string | null | undefined>): string => {
    for (const raw of requestedIds) {
      const candidate = String(raw ?? "").trim();
      if (!candidate) continue;
      if (isModelAvailableOnSurface(candidate, "desktop")) return candidate;
    }
    const fallback = String(args.defaultModelId ?? "").trim();
    return fallback;
  }, [args.defaultModelId]);

  const ensureThreadReadyForSend = useCallback(
    async (sessionId: string, _session: unknown): Promise<boolean> => {
      const service = args.getThreadServiceById(sessionId);
      const fromState = args.threads.find((thread) => thread.id === sessionId) ?? null;
      const fromDb = fromState ?? (await args.getThreadRecord(sessionId));
      const currentModel = (fromDb?.model_id ?? "").trim();
      const desiredModel = (args.activeModelId ?? "").trim();
      const modelToUse = normalizeModelForDesktopSurface([
        desiredModel,
        currentModel,
        args.defaultModelId,
      ]);
      const isFreeModel =
        resolveCloudInferenceLane({
          modelId: modelToUse,
          freeModelAllowlist: args.freeModelAllowlist,
        }) === "public";
      if (!modelToUse) {
        args.onMissingModel();
        return false;
      }

      // Cloud chat runs server-side model policy checks; desktop should not block
      // sends based on local key presence or local entitlement inference.
      if (service.storageMode === "cloud") {
        if (
          fromDb &&
          (fromDb.engine_id === "messages_agent" || fromDb.engine_id === "openrouter_messages_agent") &&
          (fromDb.model_id ?? "").trim() === modelToUse
        ) {
          return true;
        }
        try {
          const updated = service.setThreadEngine
            ? await service.setThreadEngine({
                threadId: sessionId,
                engineId: "messages_agent",
                modelId: modelToUse,
              })
            : null;
          if (!updated) return true;
          args.setThreads((prev) => {
            const existingIndex = prev.findIndex((thread) => thread.id === updated.id);
            if (existingIndex === -1) return [updated as ThreadT, ...prev];
            const next = [...prev];
            next[existingIndex] = updated as ThreadT;
            return next;
          });
          return true;
        } catch (error) {
          console.error("Failed to set cloud thread model:", error);
          // Best-effort for cloud threads: do not block sending if model-sync patch fails.
          // The cloud turn endpoint will still enforce server-side model/policy checks.
          return true;
        }
      }

      const providerId = args.providerIdForModelId(modelToUse);
      if (!providerId && !isFreeModel) {
        args.onInvalidModel();
        return false;
      }

      // Keep desktop pre-send policy simple and deterministic:
      // do not block on local entitlement/key inference. Runtime/server
      // lane resolution is authoritative and returns explicit errors.

      if (
        fromDb &&
        (fromDb.engine_id === "messages_agent" || fromDb.engine_id === "openrouter_messages_agent") &&
        (fromDb.model_id ?? "").trim() === modelToUse
      ) {
        return true;
      }

      try {
        const updated = service.setThreadEngine
          ? await service.setThreadEngine({
              threadId: sessionId,
              engineId: "messages_agent",
              modelId: modelToUse,
            })
          : null;
        if (!updated) return true;
        args.setThreads((prev) => {
          const existingIndex = prev.findIndex((thread) => thread.id === updated.id);
          if (existingIndex === -1) return [updated as ThreadT, ...prev];
          const next = [...prev];
          next[existingIndex] = updated as ThreadT;
          return next;
        });
        return true;
      } catch (error) {
        console.error("Failed to set thread model:", error);
        return false;
      }
    },
    [args, normalizeModelForDesktopSurface],
  );

  return { ensureThreadReadyForSend };
}
