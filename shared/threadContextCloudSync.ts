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
