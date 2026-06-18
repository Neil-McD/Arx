import { internal } from "./_generated/api";
import { releaseBlaxelWorkspaceComputerIfIdle } from "./blaxelWorkspaceComputerProvider.ts";
import {
  releaseRuntimeWorkspaceSessionAccountingIfCurrent,
  settleRuntimeWorkspaceSession,
  type RuntimeWorkspaceSession,
} from "./workspaceRuntimeSession.ts";

const WORKSPACE_SESSION_STATE_PERSIST_MAX_ATTEMPTS = 3;

type RuntimeWorkspaceSessionRunEvent = {
  eventType: string;
  eventKey?: string;
  payload: Record<string, unknown>;
};

export type RuntimeWorkspaceSessionDisposalOutcome =
  | "kept_alive"
  | "provider_release_failed"
  | "settled"
  | "settlement_failed"
  | "settlement_skipped";

type RuntimeWorkspaceSessionReleaseDecision = {
  ok: boolean;
  shouldRelease: boolean;
  reason: string;
  activeTerminalCount?: number;
  checkedTerminalCount?: number;
  refreshedTerminalCount?: number;
  errorMessage?: string | null;
};

async function appendRunEventBestEffort(params: {
  appendRunEvent: (event: RuntimeWorkspaceSessionRunEvent) => Promise<unknown>;
  eventType: string;
  eventKey?: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    await params.appendRunEvent({
      eventType: params.eventType,
      eventKey: params.eventKey,
      payload: params.payload,
    });
  } catch {
    // Best-effort runtime evidence only.
  }
}

function withSource(
  payload: Record<string, unknown>,
  source?: string | null,
): Record<string, unknown> {
  const normalized = String(source ?? "").trim();
  return normalized ? { ...payload, source: normalized } : payload;
}

export async function persistRuntimeWorkspaceSessionState(params: {
  ctx: any;
  userId: any;
  runId: string;
  state: "active" | "released" | "failed";
  session: RuntimeWorkspaceSession;
  projectId: string;
  phase: "create" | "dispose";
  appendRunEvent: (event: RuntimeWorkspaceSessionRunEvent) => Promise<unknown>;
  source?: string | null;
}): Promise<{ ok: true } | { ok: false; attemptCount: number }> {
  let attemptCount = 0;
  for (
    let attempt = 1;
    attempt <= WORKSPACE_SESSION_STATE_PERSIST_MAX_ATTEMPTS;
    attempt += 1
  ) {
    attemptCount = attempt;
    try {
      await params.ctx.runMutation(
        internal.threads.setCloudRuntimeRunWorkspaceSessionInternal as any,
        {
          ownerId: params.userId,
          runId: params.runId,
          state: params.state,
          providerSandboxId: params.session.providerSandboxId,
          toolboxProxyUrl: undefined,
          region: undefined,
        },
      );
      return { ok: true };
    } catch (error) {
      if (attempt >= WORKSPACE_SESSION_STATE_PERSIST_MAX_ATTEMPTS) {
        const message =
          error instanceof Error ? error.message : String(error ?? "");
        await appendRunEventBestEffort({
          appendRunEvent: params.appendRunEvent,
          eventType: "workspace_session_state_persist_failed",
          eventKey: `${params.runId}:workspace_session_state_persist_failed:${params.phase}:${params.state}`,
          payload: withSource(
            {
              run_id: params.runId,
              sandbox_id: params.session.providerSandboxId,
              project_id: params.projectId,
              target_state: params.state,
              phase: params.phase,
              attempt_count: attemptCount,
              error_message: message || null,
            },
            params.source,
          ),
        });
        return {
          ok: false,
          attemptCount,
        };
      }
    }
  }
  return {
    ok: false,
    attemptCount,
  };
}

export async function resolveWorkspaceSessionAccountingReleaseDecision(params: {
  ctx: any;
  userId: any;
  session: RuntimeWorkspaceSession;
}): Promise<RuntimeWorkspaceSessionReleaseDecision> {
  try {
    const activeTerminalStatus = (await params.ctx.runAction(
      internal.workspaceTerminals.refreshProjectSandboxActiveTerminalStatusInternal as any,
      {
        ownerId: params.userId,
        projectId: params.session.projectId,
        providerSandboxId: params.session.providerSandboxId,
      },
    )) as {
      hasActiveTerminal?: boolean;
      activeCount?: number;
      checkedCount?: number;
      refreshedCount?: number;
    } | null;
    const activeTerminalCount = Math.max(
      0,
      Number(activeTerminalStatus?.activeCount ?? 0) || 0,
    );
    const hasActiveTerminal =
      activeTerminalStatus?.hasActiveTerminal === true ||
      activeTerminalCount > 0;
    return {
      ok: true,
      shouldRelease: !hasActiveTerminal,
      reason: hasActiveTerminal
        ? "active_terminal_still_running"
        : "no_active_terminal_remaining",
      activeTerminalCount,
      checkedTerminalCount: Math.max(
        0,
        Number(activeTerminalStatus?.checkedCount ?? 0) || 0,
      ),
      refreshedTerminalCount: Math.max(
        0,
        Number(activeTerminalStatus?.refreshedCount ?? 0) || 0,
      ),
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error ?? "");
    return {
      ok: false,
      shouldRelease: false,
      reason: "active_terminal_refresh_failed",
      errorMessage,
    };
  }
}

export async function disposeRuntimeWorkspaceSession(params: {
  ctx: any;
  userId: any;
  runId: string;
  session: RuntimeWorkspaceSession;
  appendRunEvent: (event: RuntimeWorkspaceSessionRunEvent) => Promise<unknown>;
  finalState?: "released" | "failed" | null;
  projectId?: string | null;
  source?: string | null;
}): Promise<{
  ok: boolean;
  outcome: RuntimeWorkspaceSessionDisposalOutcome;
  creditReservationKey?: string | null;
  released?: boolean;
  reason?: string;
  error?: string;
}> {
  const projectId =
    String(params.projectId ?? "").trim() ||
    String(params.session.projectId ?? "").trim();
  if (params.finalState) {
    await persistRuntimeWorkspaceSessionState({
      ctx: params.ctx,
      userId: params.userId,
      runId: params.runId,
      state: params.finalState,
      session: params.session,
      projectId,
      phase: "dispose",
      appendRunEvent: params.appendRunEvent,
      source: params.source,
    });
  }

  const releaseDecision = await resolveWorkspaceSessionAccountingReleaseDecision({
    ctx: params.ctx,
    userId: params.userId,
    session: params.session,
  });
  if (!releaseDecision.shouldRelease) {
    await appendRunEventBestEffort({
      appendRunEvent: params.appendRunEvent,
      eventType: "workspace_session_accounting_kept_alive",
      eventKey: `${params.runId}:workspace_session_accounting_kept_alive:${params.session.creditReservationKey ?? "none"}`,
      payload: withSource(
        {
          run_id: params.runId,
          sandbox_id: params.session.providerSandboxId,
          project_id: params.session.projectId,
          credit_reservation_key: params.session.creditReservationKey ?? null,
          reason: releaseDecision.reason,
          active_terminal_count: releaseDecision.activeTerminalCount ?? null,
          checked_terminal_count: releaseDecision.checkedTerminalCount ?? null,
          refreshed_terminal_count: releaseDecision.refreshedTerminalCount ?? null,
          error_message: releaseDecision.errorMessage ?? null,
        },
        params.source,
      ),
    });
    return {
      ok: true,
      outcome: "kept_alive",
      creditReservationKey: params.session.creditReservationKey ?? null,
      reason: releaseDecision.reason,
    };
  }

  const providerRelease = await releaseBlaxelWorkspaceComputerIfIdle({
    sandboxName: params.session.providerSandboxId,
  });
  if (providerRelease.ok !== true) {
    const releaseFailure = providerRelease as {
      code?: unknown;
      message?: unknown;
    };
    const releaseCode = String(
      releaseFailure.code ?? "workspace_session_provider_release_failed",
    );
    const releaseMessage =
      String(releaseFailure.message ?? "").trim() || "Workspace provider release failed.";
    await appendRunEventBestEffort({
      appendRunEvent: params.appendRunEvent,
      eventType: "workspace_session_provider_release_failed",
      eventKey: `${params.runId}:workspace_session_provider_release_failed:${params.session.creditReservationKey ?? "none"}`,
      payload: withSource(
        {
          run_id: params.runId,
          sandbox_id: params.session.providerSandboxId,
          project_id: params.session.projectId,
          credit_reservation_key: params.session.creditReservationKey ?? null,
          code: releaseCode,
          message: releaseMessage,
        },
        params.source,
      ),
    });
    return {
      ok: false,
      outcome: "provider_release_failed",
      creditReservationKey: params.session.creditReservationKey ?? null,
      error: releaseMessage,
    };
  }

  const settlement = await settleRuntimeWorkspaceSession({
    ctx: params.ctx,
    userId: params.userId,
    runId: params.runId,
    session: params.session,
    providerStandbyGraceSeconds: providerRelease.billableGraceSeconds,
    providerReleaseReason: providerRelease.reason,
    providerReleaseConfirmed: providerRelease.releaseConfirmed,
  });
  if (settlement.ok && !settlement.skipped) {
    await appendRunEventBestEffort({
      appendRunEvent: params.appendRunEvent,
      eventType: "workspace_compute_charge_settled",
      eventKey: `${params.runId}:workspace_compute_charge_settled:${settlement.creditReservationKey ?? "none"}`,
      payload: withSource(
        {
          run_id: params.runId,
          sandbox_id: params.session.providerSandboxId,
          project_id: params.session.projectId,
          credit_reservation_key: settlement.creditReservationKey ?? null,
          credits_debited: settlement.creditsDebited ?? null,
          compute_cost_usd: settlement.computeCostUsd ?? null,
          duration_seconds: settlement.durationSeconds ?? null,
          measured_duration_seconds: settlement.measuredDurationSeconds ?? null,
          provider_standby_grace_seconds:
            settlement.providerStandbyGraceSeconds ?? null,
          provider_release_reason: providerRelease.reason,
          provider_release_confirmed: providerRelease.releaseConfirmed,
        },
        params.source,
      ),
    });
    const released = await releaseRuntimeWorkspaceSessionAccountingIfCurrent({
      ctx: params.ctx,
      session: params.session,
    });
    if (released.ok === true) {
      await appendRunEventBestEffort({
        appendRunEvent: params.appendRunEvent,
        eventType: "workspace_session_accounting_release_checked",
        eventKey: `${params.runId}:workspace_session_accounting_release:${settlement.creditReservationKey ?? "none"}`,
        payload: withSource(
          {
            run_id: params.runId,
            sandbox_id: params.session.providerSandboxId,
            project_id: params.session.projectId,
            credit_reservation_key: settlement.creditReservationKey ?? null,
            released: released.released,
            reason: released.reason,
            release_decision_reason: releaseDecision.reason,
            active_terminal_count: releaseDecision.activeTerminalCount ?? null,
            checked_terminal_count: releaseDecision.checkedTerminalCount ?? null,
            refreshed_terminal_count: releaseDecision.refreshedTerminalCount ?? null,
          },
          params.source,
        ),
      });
      return {
        ok: true,
        outcome: "settled",
        creditReservationKey: settlement.creditReservationKey ?? null,
        released: released.released,
        reason: released.reason,
      };
    }
    const releaseAccountingFailure = released as { error?: unknown };
    const releaseAccountingError =
      String(releaseAccountingFailure.error ?? "").trim() ||
      "workspace_session_accounting_release_failed";
    await appendRunEventBestEffort({
      appendRunEvent: params.appendRunEvent,
      eventType: "workspace_session_accounting_release_failed",
      eventKey: `${params.runId}:workspace_session_accounting_release:${settlement.creditReservationKey ?? "none"}`,
      payload: withSource(
        {
          run_id: params.runId,
          sandbox_id: params.session.providerSandboxId,
          project_id: params.session.projectId,
          credit_reservation_key: settlement.creditReservationKey ?? null,
          error_message: releaseAccountingError,
        },
        params.source,
      ),
    });
    return {
      ok: false,
      outcome: "settled",
      creditReservationKey: settlement.creditReservationKey ?? null,
      released: false,
      error: releaseAccountingError,
    };
  }

  if (settlement.ok !== true) {
    const settlementFailure = settlement as {
      creditReservationKey?: unknown;
      creditsDebited?: unknown;
      computeCostUsd?: unknown;
      durationSeconds?: unknown;
      error?: unknown;
    };
    const settlementCreditReservationKey = String(
      settlementFailure.creditReservationKey ?? "",
    ).trim();
    const settlementError =
      String(settlementFailure.error ?? "").trim() ||
      "workspace_compute_charge_settlement_failed";
    await appendRunEventBestEffort({
      appendRunEvent: params.appendRunEvent,
      eventType: "workspace_compute_charge_settlement_failed",
      eventKey: `${params.runId}:workspace_compute_charge_settlement_failed:${settlementCreditReservationKey || "none"}`,
      payload: withSource(
        {
          run_id: params.runId,
          sandbox_id: params.session.providerSandboxId,
          project_id: params.session.projectId,
          credit_reservation_key: settlementCreditReservationKey || null,
          credits_debited: settlementFailure.creditsDebited ?? null,
          compute_cost_usd: settlementFailure.computeCostUsd ?? null,
          duration_seconds: settlementFailure.durationSeconds ?? null,
          error_message: settlementError,
        },
        params.source,
      ),
    });
    return {
      ok: false,
      outcome: "settlement_failed",
      creditReservationKey: settlementCreditReservationKey || null,
      error: settlementError,
    };
  }

  return {
    ok: true,
    outcome: "settlement_skipped",
    creditReservationKey: settlement.creditReservationKey ?? null,
  };
}
