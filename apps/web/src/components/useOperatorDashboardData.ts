import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthSessionLike } from "../../../../shared/authSession";
import {
  approveOperatorPartnerPayoutCycleCanonical,
  holdOperatorPartnerPayoutCycleCanonical,
  loadOperatorAccountSetupSnapshotCanonical,
  loadOperatorAuthAccessDiagnosticsCanonical,
  loadOperatorCommunitiesCanonical,
  loadOperatorEventsCanonical,
  loadOperatorFrontendErrorDiagnosticsCanonical,
  loadOperatorMonetizationCanonical,
  loadOperatorOverviewCanonical,
  loadOperatorPartnerPayoutCyclesCanonical,
  loadOperatorRisksCanonical,
  loadOperatorRuntimeToolDiagnosticsCanonical,
  loadOperatorSecurityAuditDiagnosticsCanonical,
  loadOperatorToolEconomicsCanonical,
  loadOperatorWebDeployDiagnosticsCanonical,
  recordOperatorDashboardAccessCanonical,
  rejectOperatorPartnerPayoutCycleCanonical,
  retryOperatorPartnerPayoutCycleCanonical,
} from "../../../../shared/cloudOperatorDashboardGateway";
import type {
  OperatorAccountSetupSnapshot,
  OperatorAuthAccessDiagnosticsSnapshot,
  OperatorCommunityRecord,
  OperatorEventRecord,
  OperatorFrontendErrorDiagnosticsSnapshot,
  OperatorMonetizationSnapshot,
  OperatorOverviewSnapshot,
  OperatorPartnerPayoutCyclesSnapshot,
  OperatorRiskItem,
  OperatorRuntimeToolDiagnosticsSnapshot,
  OperatorSecurityAuditDiagnosticsSnapshot,
  OperatorToolEconomicsSnapshot,
  OperatorWebDeployDiagnosticsSnapshot,
} from "../../../../shared/operatorTypes";
import type { PartnerPayoutCycleActionName, PartnerPayoutCycleActions } from "./workspaceRightPanelOperatorShared";

export type OperatorDashboardState = {
  overview: OperatorOverviewSnapshot | null;
  monetization: OperatorMonetizationSnapshot | null;
  webDeploy: OperatorWebDeployDiagnosticsSnapshot | null;
  authAccess: OperatorAuthAccessDiagnosticsSnapshot | null;
  securityAudit: OperatorSecurityAuditDiagnosticsSnapshot | null;
  runtimeTools: OperatorRuntimeToolDiagnosticsSnapshot | null;
  toolEconomics: OperatorToolEconomicsSnapshot | null;
  frontendErrors: OperatorFrontendErrorDiagnosticsSnapshot | null;
  accountSetup: OperatorAccountSetupSnapshot | null;
  partnerPayoutCycles: OperatorPartnerPayoutCyclesSnapshot | null;
  communityRows: OperatorCommunityRecord[];
  risks: OperatorRiskItem[];
  events: OperatorEventRecord[];
};

export function createEmptyOperatorDashboardState(): OperatorDashboardState {
  return {
    overview: null,
    monetization: null,
    webDeploy: null,
    authAccess: null,
    securityAudit: null,
    runtimeTools: null,
    toolEconomics: null,
    frontendErrors: null,
    accountSetup: null,
    partnerPayoutCycles: null,
    communityRows: [],
    risks: [],
    events: [],
  };
}

function fulfilledValue<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

function fulfilledList<T>(result: PromiseSettledResult<T[]>): T[] | null {
  return result.status === "fulfilled" ? result.value : null;
}

function logRejectedOperatorSection(label: string, result: PromiseSettledResult<unknown>): void {
  if (result.status !== "rejected") return;
  console.warn("operator_dashboard_section_load_failed", {
    section: label,
    error: result.reason instanceof Error ? result.reason.message : String(result.reason),
  });
}

export function useOperatorDashboardData(params: {
  session: AuthSessionLike | null;
  enabled: boolean;
  surface: string;
}) {
  const [state, setState] = useState<OperatorDashboardState>(() => createEmptyOperatorDashboardState());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cycleActionState, setCycleActionState] = useState<{
    inFlightCycleId: string | null;
    inFlightAction: PartnerPayoutCycleActionName | null;
    error: string | null;
  }>({ inFlightCycleId: null, inFlightAction: null, error: null });

  const refreshPartnerPayoutCycles = useCallback(async (session: AuthSessionLike) => {
    const partnerPayoutCycles = await loadOperatorPartnerPayoutCyclesCanonical({ session, limit: 12 });
    setState((prev) => ({ ...prev, partnerPayoutCycles }));
  }, []);

  const runPartnerPayoutCycleAction = useCallback(
    async (action: PartnerPayoutCycleActionName, cycleId: string) => {
      const session = params.session;
      if (!session) {
        setCycleActionState({ inFlightCycleId: null, inFlightAction: null, error: "Operator session required." });
        return;
      }
      setCycleActionState({ inFlightCycleId: cycleId, inFlightAction: action, error: null });
      try {
        if (action === "approve") {
          await approveOperatorPartnerPayoutCycleCanonical({ session, cycleId });
        } else if (action === "retry") {
          await retryOperatorPartnerPayoutCycleCanonical({ session, cycleId });
        } else if (action === "hold") {
          await holdOperatorPartnerPayoutCycleCanonical({ session, cycleId, reason: "operator_hold" });
        } else {
          await rejectOperatorPartnerPayoutCycleCanonical({ session, cycleId, reason: "operator_rejected" });
        }
        await refreshPartnerPayoutCycles(session);
        setCycleActionState({ inFlightCycleId: null, inFlightAction: null, error: null });
      } catch (nextError) {
        setCycleActionState({
          inFlightCycleId: null,
          inFlightAction: null,
          error: nextError instanceof Error ? nextError.message : "Partner payout cycle action failed.",
        });
      }
    },
    [params.session, refreshPartnerPayoutCycles],
  );

  const partnerPayoutCycleActions = useMemo<PartnerPayoutCycleActions>(
    () => ({
      ...cycleActionState,
      approve: (cycleId: string) => runPartnerPayoutCycleAction("approve", cycleId),
      retry: (cycleId: string) => runPartnerPayoutCycleAction("retry", cycleId),
      hold: (cycleId: string) => runPartnerPayoutCycleAction("hold", cycleId),
      reject: (cycleId: string) => runPartnerPayoutCycleAction("reject", cycleId),
    }),
    [cycleActionState, runPartnerPayoutCycleAction],
  );

  useEffect(() => {
    let isAlive = true;
    if (!params.enabled) {
      setIsLoading(false);
      return;
    }
    if (!params.session) {
      setIsLoading(false);
      setError("Sign in with an operator account to view this surface.");
      return;
    }

    setIsLoading(true);
    setError(null);
    const session = params.session;
    recordOperatorDashboardAccessCanonical({ session, surface: params.surface })
      .then(async () => {
        const results = await Promise.allSettled([
          loadOperatorOverviewCanonical({ session, range: "30d" }),
          loadOperatorMonetizationCanonical({ session, range: "30d" }),
          loadOperatorWebDeployDiagnosticsCanonical({ session, range: "30d" }),
          loadOperatorAuthAccessDiagnosticsCanonical({ session, range: "30d" }),
          loadOperatorSecurityAuditDiagnosticsCanonical({ session, range: "30d" }),
          loadOperatorRuntimeToolDiagnosticsCanonical({ session, range: "30d" }),
          loadOperatorToolEconomicsCanonical({ session, range: "30d" }),
          loadOperatorFrontendErrorDiagnosticsCanonical({ session, range: "30d" }),
          loadOperatorAccountSetupSnapshotCanonical({ session, completed: false, limit: 24 }),
          loadOperatorPartnerPayoutCyclesCanonical({ session, limit: 12 }),
          loadOperatorCommunitiesCanonical({ session, limit: 12 }),
          loadOperatorRisksCanonical({ session, limit: 12 }),
          loadOperatorEventsCanonical({ session, limit: 12 }),
        ] as const);
        const [
          overview,
          monetization,
          webDeploy,
          authAccess,
          securityAudit,
          runtimeTools,
          toolEconomics,
          frontendErrors,
          accountSetup,
          partnerPayoutCycles,
          communityRows,
          risks,
          events,
        ] = results;
        [
          ["overview", overview],
          ["monetization", monetization],
          ["web_deploy", webDeploy],
          ["auth_access", authAccess],
          ["security_audit", securityAudit],
          ["runtime_tools", runtimeTools],
          ["tool_economics", toolEconomics],
          ["frontend_errors", frontendErrors],
          ["account_setup", accountSetup],
          ["partner_payout_cycles", partnerPayoutCycles],
          ["communities", communityRows],
          ["risks", risks],
          ["events", events],
        ].forEach(([label, result]) => logRejectedOperatorSection(String(label), result as PromiseSettledResult<unknown>));
        return {
          overview: fulfilledValue(overview),
          monetization: fulfilledValue(monetization),
          webDeploy: fulfilledValue(webDeploy),
          authAccess: fulfilledValue(authAccess),
          securityAudit: fulfilledValue(securityAudit),
          runtimeTools: fulfilledValue(runtimeTools),
          toolEconomics: fulfilledValue(toolEconomics),
          frontendErrors: fulfilledValue(frontendErrors),
          accountSetup: fulfilledValue(accountSetup),
          partnerPayoutCycles: fulfilledValue(partnerPayoutCycles),
          communityRows: fulfilledList(communityRows),
          risks: fulfilledList(risks),
          events: fulfilledList(events),
        };
      })
      .then(
        (nextState) => {
          if (!isAlive) return;
          setState((prev) => ({
            overview: nextState.overview ?? prev.overview,
            monetization: nextState.monetization ?? prev.monetization,
            webDeploy: nextState.webDeploy ?? prev.webDeploy,
            authAccess: nextState.authAccess ?? prev.authAccess,
            securityAudit: nextState.securityAudit ?? prev.securityAudit,
            runtimeTools: nextState.runtimeTools ?? prev.runtimeTools,
            toolEconomics: nextState.toolEconomics ?? prev.toolEconomics,
            frontendErrors: nextState.frontendErrors ?? prev.frontendErrors,
            accountSetup: nextState.accountSetup ?? prev.accountSetup,
            partnerPayoutCycles: nextState.partnerPayoutCycles ?? prev.partnerPayoutCycles,
            communityRows: nextState.communityRows ?? prev.communityRows,
            risks: nextState.risks ?? prev.risks,
            events: nextState.events ?? prev.events,
          }));
        },
        (nextError) => {
          if (!isAlive) return;
          const message = nextError instanceof Error ? nextError.message : "Operator dashboard unavailable.";
          if (message.includes("operator_access_forbidden")) {
            setState(createEmptyOperatorDashboardState());
          }
          setError(message.includes("operator_access_forbidden") ? "Operator access required." : message);
        },
      )
      .finally(() => {
        if (isAlive) setIsLoading(false);
      });

    return () => {
      isAlive = false;
    };
  }, [params.enabled, params.session, params.surface]);

  const topCommunities = useMemo(
    () =>
      [...state.communityRows].sort(
        (a, b) => (b.money.estimatedMrr?.amountBaseUnits ?? 0) - (a.money.estimatedMrr?.amountBaseUnits ?? 0),
      ),
    [state.communityRows],
  );

  return { state, topCommunities, partnerPayoutCycleActions, isLoading, error };
}
