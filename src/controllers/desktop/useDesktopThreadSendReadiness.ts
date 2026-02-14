import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { SupabaseSession } from "../../../shared/supabaseAuthCore";
import type { ThreadService } from "../../../shared/threadService";

type ThreadSendReadinessThread = {
  id: string;
  engine_id: string;
  model_id: string | null;
};

type BuilderBillingStatusLike = {
  builder_tier: string;
};

type UseDesktopThreadSendReadinessArgs<ThreadT extends ThreadSendReadinessThread> = {
  threads: ThreadT[];
  getThreadRecord: (threadId: string) => Promise<ThreadT | null>;
  activeModelId: string | null;
  providerIdForModelId: (modelId: string) => string | null;
  hasKeyForProvider: (providerId: string) => boolean;
  userAllowPlatformInference: boolean;
  userTier: string;
  builderBillingStatus: BuilderBillingStatusLike | null;
  getSupabaseUrl: () => string | null;
  getSupabaseAnonKey: () => string | null;
  loadBuilderBillingStatus: (session: SupabaseSession) => Promise<BuilderBillingStatusLike | null>;
  resolveAllowPlatformInferenceForBuilderTier: (builderTier: string) => boolean;
  onMissingModel: () => void;
  onInvalidModel: () => void;
  onRequirePaidAccess: (ctx: {
    providerId: string;
    hasSession: boolean;
    planStateResolved: boolean;
  }) => void;
  ensureFreshSessionForRequest: (session: SupabaseSession) => Promise<SupabaseSession | null>;
  getThreadServiceById: (threadId: string) => ThreadService;
  setThreads: Dispatch<SetStateAction<ThreadT[]>>;
};

export function useDesktopThreadSendReadiness<ThreadT extends ThreadSendReadinessThread>(
  args: UseDesktopThreadSendReadinessArgs<ThreadT>,
) {
  const ensureThreadReadyForSend = useCallback(
    async (sessionId: string, session: SupabaseSession | null): Promise<boolean> => {
      const fromState = args.threads.find((thread) => thread.id === sessionId) ?? null;
      const fromDb = fromState ?? (await args.getThreadRecord(sessionId));
      const currentModel = (fromDb?.model_id ?? "").trim();
      const desiredModel = (args.activeModelId ?? "").trim();
      const modelToUse = desiredModel || currentModel;
      if (!modelToUse) {
        args.onMissingModel();
        return false;
      }

      const providerId = args.providerIdForModelId(modelToUse);
      if (!providerId) {
        args.onInvalidModel();
        return false;
      }
      const hasKey = args.hasKeyForProvider(providerId);

      let canUseArxPlatform = args.userAllowPlatformInference;
      let planStateResolved = args.userTier !== "unknown";
      if (!hasKey && session && !planStateResolved) {
        const url = args.getSupabaseUrl();
        const anon = args.getSupabaseAnonKey();
        if (url && anon) {
          let status = args.builderBillingStatus;
          if (!status) {
            try {
              status = await args.loadBuilderBillingStatus(session);
            } catch {
              status = null;
            }
          }
          if (status) {
            canUseArxPlatform = args.resolveAllowPlatformInferenceForBuilderTier(status.builder_tier);
            planStateResolved = true;
          }
        }
      }

      if (!hasKey && !canUseArxPlatform) {
        args.onRequirePaidAccess({
          providerId,
          hasSession: Boolean(session),
          planStateResolved,
        });
        return false;
      }

      if (!hasKey && canUseArxPlatform && session) {
        const fresh = await args.ensureFreshSessionForRequest(session);
        if (!fresh) return false;
      }

      if (
        fromDb &&
        (fromDb.engine_id === "messages_agent" || fromDb.engine_id === "openrouter_messages_agent") &&
        (fromDb.model_id ?? "").trim() === modelToUse
      ) {
        return true;
      }

      try {
        const service = args.getThreadServiceById(sessionId);
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
    [args],
  );

  return { ensureThreadReadyForSend };
}
