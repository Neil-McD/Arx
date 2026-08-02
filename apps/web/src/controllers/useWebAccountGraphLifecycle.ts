import { useCallback, useRef } from "react";

import type { AuthSession } from "../auth";
import {
  emitWorkspaceEvent,
  formatWorkspaceInstrumentationError,
} from "../lib/workspaceInstrumentation";

type SignedOutReason = "session_lost" | "session_missing_after_bootstrap";

type AccountGraphActions = {
  loadBilling: (session: AuthSession) => Promise<unknown>;
  loadCommunities: (session: AuthSession) => Promise<unknown>;
  loadSelfProfile: (session: AuthSession) => Promise<unknown>;
  onSignedOut: (reason: SignedOutReason) => Promise<void> | void;
  resetSessionState: () => Promise<void>;
  resumePendingAuthIntent: () => void;
  shouldTreatCommunitiesAsCritical: () => boolean;
};

const NOOP_ACTIONS: AccountGraphActions = {
  loadBilling: async () => {},
  loadCommunities: async () => {},
  loadSelfProfile: async () => {},
  onSignedOut: async () => {},
  resetSessionState: async () => {},
  resumePendingAuthIntent: () => {},
  shouldTreatCommunitiesAsCritical: () => false,
};

function firstRejectedReason(results: PromiseSettledResult<void>[]): unknown {
  return results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  )?.reason;
}

export function useWebAccountGraphLifecycle() {
  const actionsRef = useRef<AccountGraphActions>(NOOP_ACTIONS);

  const runInstrumentedLoad = useCallback(async (
    name: "billing_status_load" | "communities_load" | "self_profile_load",
    session: AuthSession,
    loadPhase: string,
    load: (session: AuthSession) => Promise<unknown>,
  ) => {
    emitWorkspaceEvent({
      scope: "lifecycle",
      name,
      status: "start",
      detail: { phase: loadPhase },
    });
    try {
      await load(session);
      emitWorkspaceEvent({
        scope: "lifecycle",
        name,
        status: "success",
        detail: { phase: loadPhase },
      });
    } catch (error) {
      emitWorkspaceEvent({
        scope: "lifecycle",
        name,
        status: "failure",
        detail: { phase: loadPhase },
        error: formatWorkspaceInstrumentationError(error),
      });
      throw error;
    }
  }, []);

  const onSignedOut = useCallback(async (reason: SignedOutReason) => {
    emitWorkspaceEvent({
      scope: "lifecycle",
      name: "auth_full_signed_out_reset",
      status: "start",
      detail: { reason },
    });
    await actionsRef.current.resetSessionState();
    await actionsRef.current.onSignedOut(reason);
    emitWorkspaceEvent({
      scope: "lifecycle",
      name: "auth_full_signed_out_reset",
      status: "success",
      detail: { reason },
    });
  }, []);

  const onSessionReady = useCallback(async (session: AuthSession) => {
    const userId = String(session.user?.id ?? "").trim() || null;
    const actions = actionsRef.current;
    const communitiesAreCritical =
      actions.shouldTreatCommunitiesAsCritical();
    const criticalStartedAt = Date.now();
    emitWorkspaceEvent({
      scope: "lifecycle",
      name: "account_graph_hydrate",
      status: "start",
      detail: { phase: "session_ready", userId },
    });

    const criticalTasks: Array<Promise<void>> = [];
    if (communitiesAreCritical) {
      criticalTasks.push(runInstrumentedLoad(
        "communities_load",
        session,
        "session_ready_critical",
        actions.loadCommunities,
      ));
    }
    const criticalResults = await Promise.allSettled(criticalTasks);
    const criticalFailureCount = criticalResults.filter(
      (result) => result.status === "rejected",
    ).length;
    emitWorkspaceEvent({
      scope: "lifecycle",
      name: "account_graph_hydrate",
      status: criticalFailureCount > 0 ? "failure" : "success",
      detail: {
        phase: "session_ready",
        stage: "critical_ready",
        userId,
        failureCount: criticalFailureCount,
        durationMs: Date.now() - criticalStartedAt,
      },
      error:
        criticalFailureCount > 0
          ? formatWorkspaceInstrumentationError(
              firstRejectedReason(criticalResults),
            )
          : undefined,
    });

    const secondaryTasks: Array<Promise<void>> = [
      runInstrumentedLoad(
        "billing_status_load",
        session,
        "session_ready_secondary",
        actions.loadBilling,
      ),
      runInstrumentedLoad(
        "self_profile_load",
        session,
        "session_ready_secondary",
        actions.loadSelfProfile,
      ),
    ];
    if (!communitiesAreCritical) {
      secondaryTasks.unshift(runInstrumentedLoad(
        "communities_load",
        session,
        "session_ready_secondary",
        actions.loadCommunities,
      ));
    }
    const secondaryStartedAt = Date.now();
    emitWorkspaceEvent({
      scope: "lifecycle",
      name: "account_graph_secondary_hydrate",
      status: "start",
      detail: { phase: "session_ready", userId },
    });
    void Promise.allSettled(secondaryTasks).then((results) => {
      const failureCount = results.filter(
        (result) => result.status === "rejected",
      ).length;
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "account_graph_secondary_hydrate",
        status: failureCount > 0 ? "failure" : "success",
        detail: {
          phase: "session_ready",
          userId,
          failureCount,
          durationMs: Date.now() - secondaryStartedAt,
        },
        error:
          failureCount > 0
            ? formatWorkspaceInstrumentationError(firstRejectedReason(results))
            : undefined,
      });
    });
  }, [runInstrumentedLoad]);

  const onSessionFocusReady = useCallback(async (session: AuthSession) => {
    const userId = String(session.user?.id ?? "").trim() || null;
    const actions = actionsRef.current;
    emitWorkspaceEvent({
      scope: "lifecycle",
      name: "account_graph_refresh",
      status: "start",
      detail: { phase: "session_focus_ready", userId },
    });
    const startedAt = Date.now();
    void Promise.allSettled([
      runInstrumentedLoad(
        "billing_status_load",
        session,
        "session_focus_ready_secondary",
        actions.loadBilling,
      ),
      runInstrumentedLoad(
        "communities_load",
        session,
        "session_focus_ready_secondary",
        actions.loadCommunities,
      ),
    ]).then((results) => {
      const failureCount = results.filter(
        (result) => result.status === "rejected",
      ).length;
      emitWorkspaceEvent({
        scope: "lifecycle",
        name: "account_graph_refresh",
        status: failureCount > 0 ? "failure" : "success",
        detail: {
          phase: "session_focus_ready",
          userId,
          failureCount,
          durationMs: Date.now() - startedAt,
        },
        error:
          failureCount > 0
            ? formatWorkspaceInstrumentationError(firstRejectedReason(results))
            : undefined,
      });
    });
  }, [runInstrumentedLoad]);

  const onDidJustSignIn = useCallback(() => {
    actionsRef.current.resumePendingAuthIntent();
  }, []);

  const onSessionLost = useCallback(
    () => onSignedOut("session_lost"),
    [onSignedOut],
  );
  const onSessionMissingAfterBootstrap = useCallback(
    () => onSignedOut("session_missing_after_bootstrap"),
    [onSignedOut],
  );

  const onAfterSignOut = useCallback(() => {
    if (window.location.pathname !== "/") window.location.assign("/");
  }, []);

  return {
    actionsRef,
    onSessionLost,
    onSessionMissingAfterBootstrap,
    onSessionReady,
    onSessionFocusReady,
    onDidJustSignIn,
    onAfterSignOut,
  };
}
