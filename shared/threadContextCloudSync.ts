export type ThreadContextCloudState = {
  thread_id: string;
  community_id: string | null;
  context_version: number;
  updated_at: string;
};

type ThreadContextConflictMatcher = (message: string) => boolean;

type SyncThreadCommunityLensCloudParams = {
  threadId: string;
  desiredCommunityId: string | null;
  initialExpectedContextVersion?: number | null;
  fetchLatestContext: () => Promise<ThreadContextCloudState | null>;
  setThreadContext: (expectedContextVersion: number) => Promise<ThreadContextCloudState | null>;
  onObservedContext?: (context: ThreadContextCloudState) => void;
  isConflictError?: ThreadContextConflictMatcher;
};

function defaultIsConflictError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("thread context version conflict")
    || normalized.includes("thread_context_version_conflict")
  );
}

function toErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "";
}

function normalizeExpectedContextVersion(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.floor(value));
}

export async function syncThreadCommunityLensCloud(
  params: SyncThreadCommunityLensCloudParams,
): Promise<ThreadContextCloudState | null> {
  const isConflictError = params.isConflictError ?? defaultIsConflictError;
  let expectedContextVersion = normalizeExpectedContextVersion(params.initialExpectedContextVersion);

  if (expectedContextVersion === null) {
    const latest = await params.fetchLatestContext();
    if (!latest) return null;
    params.onObservedContext?.(latest);
    expectedContextVersion = normalizeExpectedContextVersion(latest.context_version) ?? 0;
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const updated = await params.setThreadContext(expectedContextVersion);
      if (updated) {
        params.onObservedContext?.(updated);
      }
      return updated;
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      const conflict = isConflictError(errorMessage);
      if (!conflict || attempt > 0) {
        throw error;
      }

      const latest = await params.fetchLatestContext();
      if (!latest) throw error;
      params.onObservedContext?.(latest);
      if (latest.thread_id === params.threadId && latest.community_id === params.desiredCommunityId) {
        return latest;
      }
      expectedContextVersion = normalizeExpectedContextVersion(latest.context_version) ?? 0;
    }
  }

  return null;
}
