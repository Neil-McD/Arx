import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { acquireAuthenticatedConvexRealtimeClient, type ConvexRealtimeEnsureSession } from "./convexRealtimeAuth";
import { requireConvexUrl } from "./convexAuthenticatedClient";
import type { WorkflowRunHistoryItem } from "./workflowRunHistory";

export type CloudWorkflowRunHistoryFilter = "all" | "failed" | "tests";
export type CloudWorkflowRun = WorkflowRunHistoryItem & { member_name: string; is_test: boolean };
export type CloudWorkflowRunHistory = { runs: CloudWorkflowRun[]; truncated: boolean };

/** Workflows → Run history, live: the latest automation runs with their steps. */
export function subscribeCloudWorkflowRunHistory<S>(params: {
  session: S; ensureSession: ConvexRealtimeEnsureSession<S>; communityId: string;
  filter: CloudWorkflowRunHistoryFilter; membershipId?: string | null;
  update: (history: CloudWorkflowRunHistory) => void; error: () => void;
}): () => void {
  const lease = acquireAuthenticatedConvexRealtimeClient({ session: params.session, convexUrl: requireConvexUrl(), ensureSession: params.ensureSession });
  const watch = lease.client.watchQuery(api.communityWorkflowRunHistory.listBuilderWorkflowRunHistory, {
    authSubject: lease.authSubject, communityId: params.communityId as Id<"communities">, filter: params.filter,
    ...(params.membershipId ? { membershipId: params.membershipId as Id<"communityMemberships"> } : {}),
  });
  let closed = false;
  const publish = () => {
    if (closed) return;
    try {
      const value = watch.localQueryResult() as CloudWorkflowRunHistory | undefined;
      if (value !== undefined) params.update(value);
    } catch { params.error(); }
  };
  const stop = watch.onUpdate(publish);
  publish();
  return () => { closed = true; stop(); lease.close(); };
}
