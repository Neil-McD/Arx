import type { CommunityLifecycleStatus } from "./communityLifecycle";

export type CommunityArchiveOperationState =
  | "requested"
  | "processing"
  | "succeeded"
  | "failed";

export type CommunityArchiveOperationReceipt = {
  operation_id: string;
  kind: "archive";
  state: CommunityArchiveOperationState;
  lifecycle_generation: number;
  attempt_count: number;
  next_attempt_at: number;
  last_attempt_at: number | null;
  completed_at: number | null;
  error_code: string | null;
  created_at: number;
  updated_at: number;
};

export type CommunityLifecycleManagementRow = {
  community_id: string;
  slug: string;
  name: string;
  lifecycle_status: CommunityLifecycleStatus;
  lifecycle_generation: number;
  archive_requested_at: number | null;
  archive_effective_at: number | null;
  updated_at: number;
  operation: CommunityArchiveOperationReceipt | null;
};

export type InactiveCommunityLifecycleSummary = Omit<
  CommunityLifecycleManagementRow,
  "operation"
> & {
  lifecycle_status: "archiving" | "archived";
};

export type InactiveCommunityLifecyclePage = {
  items: InactiveCommunityLifecycleSummary[];
  continue_cursor: string | null;
  is_done: boolean;
};

export type CommunityArchiveCommandResult = {
  ok: true;
  idempotent: boolean;
  community_id: string;
  operation_id: string;
  operation_state: CommunityArchiveOperationState;
  lifecycle_status: "archiving";
  lifecycle_generation: number;
};

export function communityLifecycleIsInactive(
  status: CommunityLifecycleStatus | null | undefined,
): status is "archiving" | "archived" {
  return status === "archiving" || status === "archived";
}
