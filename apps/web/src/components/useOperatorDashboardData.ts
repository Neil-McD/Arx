import { useEffect, useMemo, useState } from "react";
import type { AuthSessionLike } from "../../../../shared/authSession";
import {
  loadOperatorAccountSetupSnapshotCanonical,
  loadOperatorAuthAccessDiagnosticsCanonical,
  loadOperatorCommunitiesCanonical,
  loadOperatorEmailAuthDiagnosticCanonical,
  loadOperatorEventsCanonical,
  loadOperatorFrontendErrorDiagnosticsCanonical,
  loadOperatorMonetizationCanonical,
  loadOperatorOverviewCanonical,
  loadOperatorRisksCanonical,
  loadOperatorRuntimeToolDiagnosticsCanonical,
  loadOperatorSecurityAuditDiagnosticsCanonical,
  loadOperatorToolEconomicsCanonical,
  loadOperatorWebDeployDiagnosticsCanonical,
  recordOperatorDashboardAccessCanonical,
} from "../../../../shared/cloudOperatorDashboardGateway";
import type {
  OperatorAccountSetupSnapshot,
  OperatorAuthAccessDiagnosticsSnapshot,
  OperatorCommunityRecord,
  OperatorEmailAuthDiagnosticSnapshot,
  OperatorEventRecord,
  OperatorFrontendErrorDiagnosticsSnapshot,
  OperatorMonetizationSnapshot,
  OperatorOverviewSnapshot,
  OperatorRiskItem,
  OperatorRuntimeToolDiagnosticsSnapshot,
  OperatorSecurityAuditDiagnosticsSnapshot,
  OperatorToolEconomicsSnapshot,
  OperatorWebDeployDiagnosticsSnapshot,
} from "../../../../shared/operatorTypes";

export type OperatorDashboardState = {
  overview: OperatorOverviewSnapshot | null;
  monetization: OperatorMonetizationSnapshot | null;
  webDeploy: OperatorWebDeployDiagnosticsSnapshot | null;
  authAccess: OperatorAuthAccessDiagnosticsSnapshot | null;
  securityAudit: OperatorSecurityAuditDiagnosticsSnapshot | null;
  runtimeTools: OperatorRuntimeToolDiagnosticsSnapshot | null;
  toolEconomics: OperatorToolEconomicsSnapshot | null;
  emailAuth: OperatorEmailAuthDiagnosticSnapshot | null;
  frontendErrors: OperatorFrontendErrorDiagnosticsSnapshot | null;
  accountSetup: OperatorAccountSetupSnapshot | null;
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
    emailAuth: null,
    frontendErrors: null,
    accountSetup: null,
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
          loadOperatorEmailAuthDiagnosticCanonical({ session, includeWorkosUserLookup: true }),
          loadOperatorFrontendErrorDiagnosticsCanonical({ session, range: "30d" }),
          loadOperatorAccountSetupSnapshotCanonical({ session, completed: false, limit: 24 }),
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
          emailAuth,
          frontendErrors,
          accountSetup,
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
          ["email_auth", emailAuth],
          ["frontend_errors", frontendErrors],
          ["account_setup", accountSetup],
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
          emailAuth: fulfilledValue(emailAuth),
          frontendErrors: fulfilledValue(frontendErrors),
          accountSetup: fulfilledValue(accountSetup),
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
            emailAuth: nextState.emailAuth ?? prev.emailAuth,
            frontendErrors: nextState.frontendErrors ?? prev.frontendErrors,
            accountSetup: nextState.accountSetup ?? prev.accountSetup,
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

  return { state, topCommunities, isLoading, error };
}
