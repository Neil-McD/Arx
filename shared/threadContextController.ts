export type ThreadContextLike = {
  id: string;
  community_id: string | null;
  context_version?: number | null;
};

type TracePayloadBuilder<TThread extends ThreadContextLike> = (thread: TThread) => Record<string, unknown>;

type ThreadContextControllerDeps<TThread extends ThreadContextLike> = {
  surface: string;
  getActivePage: () => string;
  getDesiredCommunityId: () => string | null;
  getActiveThreadId?: () => string | null;
  getActiveCommunityId?: () => string | null;
  findThreadById: (threadId: string) => TThread | null;
  getLatestThreadRecord: (threadId: string) => Promise<TThread | null>;
  syncThreadCommunityLens: (thread: TThread, desiredCommunityId: string | null) => Promise<void>;
  onSelectThread: (thread: TThread) => void;
  trace?: (event: string, payload: Record<string, unknown>) => void;
  buildThreadSelectedTrace?: TracePayloadBuilder<TThread>;
};

export function createThreadContextController<TThread extends ThreadContextLike>(
  deps: ThreadContextControllerDeps<TThread>,
) {
  const selectThread = (thread: TThread): void => {
    deps.trace?.("thread_selected", {
      surface: deps.surface,
      from_thread_id: deps.getActiveThreadId?.() ?? null,
      to_thread_id: thread.id,
      from_community_id: deps.getActiveCommunityId?.() ?? null,
      to_community_id: thread.community_id ?? null,
      ...(deps.buildThreadSelectedTrace?.(thread) ?? {}),
    });
    deps.onSelectThread(thread);
  };

  const ensureLensBeforeSend = async (threadId: string): Promise<void> => {
    if (deps.getActivePage() !== "workspace") return;
    const desiredCommunityId = deps.getDesiredCommunityId();
    deps.trace?.("send_preflight_lens_read", {
      surface: deps.surface,
      thread_id: threadId,
      desired_community_id: desiredCommunityId,
    });
    const fromState = deps.findThreadById(threadId);
    if (fromState && (fromState.community_id ?? null) === desiredCommunityId) {
      deps.trace?.("send_preflight_lens_noop", {
        surface: deps.surface,
        thread_id: threadId,
        current_community_id: fromState.community_id ?? null,
      });
      return;
    }

    const latestThread = await deps.getLatestThreadRecord(threadId).catch(() => null);
    const thread = latestThread ?? fromState;
    if (!thread) {
      deps.trace?.("send_preflight_lens_missing_thread", {
        surface: deps.surface,
        thread_id: threadId,
      });
      return;
    }

    const currentLens = thread.community_id ?? null;
    if (currentLens === desiredCommunityId) {
      deps.trace?.("send_preflight_lens_noop", {
        surface: deps.surface,
        thread_id: threadId,
        current_community_id: currentLens,
      });
      return;
    }

    deps.trace?.("send_preflight_lens_apply", {
      surface: deps.surface,
      thread_id: threadId,
      current_community_id: currentLens,
      desired_community_id: desiredCommunityId,
      context_version:
        typeof thread.context_version === "number" ? thread.context_version : null,
    });
    await deps.syncThreadCommunityLens(thread, desiredCommunityId);
  };

  return {
    selectThread,
    ensureLensBeforeSend,
  };
}
