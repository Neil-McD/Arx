import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import type { AuthSessionLike } from "../../../../shared/authSession";
import { buildPlatformSwitcherStyle } from "../../../../shared/platformSwitcherUi";
import { buildOperatorPlatformHealthCards } from "../../../../shared/operatorPlatformHealth";
import {
  loadOperatorAccountSetupSnapshotCanonical,
  loadOperatorAuthAccessDiagnosticsCanonical,
  loadOperatorCommunitiesCanonical,
  loadOperatorEventsCanonical,
  loadOperatorFrontendErrorDiagnosticsCanonical,
  loadOperatorMonetizationCanonical,
  loadOperatorOverviewCanonical,
  loadOperatorRisksCanonical,
  loadOperatorRuntimeToolDiagnosticsCanonical,
  loadOperatorSecurityAuditDiagnosticsCanonical,
  loadOperatorWebDeployDiagnosticsCanonical,
  recordOperatorDashboardAccessCanonical,
} from "../../../../shared/cloudOperatorDashboardGateway";
import type {
  OperatorAccountSetupSnapshot,
  OperatorAccountSetupUserRecord,
  OperatorAuthAccessDiagnosticsSnapshot,
  OperatorCommunityRecord,
  OperatorEventRecord,
  OperatorFrontendErrorDiagnosticsSnapshot,
  OperatorMonetizationSnapshot,
  OperatorOverviewSnapshot,
  OperatorRiskItem,
  OperatorRuntimeToolDiagnosticsSnapshot,
  OperatorSecurityAuditDiagnosticsSnapshot,
  OperatorWebDeployDiagnosticsSnapshot,
} from "../../../../shared/operatorTypes";

export type OperatorInsightTab = "platform" | "business" | "accounts" | "communities";

export const OPERATOR_RIGHT_PANEL_DEFAULT_WIDTH = 560;
export const OPERATOR_RIGHT_PANEL_MIN_WIDTH = 380;
export const OPERATOR_RIGHT_PANEL_MAX_WIDTH = 860;
export const OPERATOR_RIGHT_PANEL_GUTTER = 28;
export const OPERATOR_RIGHT_PANEL_KEYBOARD_STEP = 32;

const OPERATOR_INSIGHT_TABS: Array<{ id: OperatorInsightTab; label: string }> = [
  { id: "platform", label: "Platform" },
  { id: "business", label: "Business" },
  { id: "accounts", label: "Accounts" },
  { id: "communities", label: "Communities" },
];
const OPERATOR_ACCOUNT_SETUP_STEP_ORDER = ["identity", "inference", "agent", "complete"] as const;
const OPERATOR_ACCOUNT_SETUP_MISSING_ORDER = [
  "display_name",
  "avatar",
  "inference_provider",
  "agent_name",
] as const;

export type OperatorDashboardState = {
  overview: OperatorOverviewSnapshot | null;
  monetization: OperatorMonetizationSnapshot | null;
  webDeploy: OperatorWebDeployDiagnosticsSnapshot | null;
  authAccess: OperatorAuthAccessDiagnosticsSnapshot | null;
  securityAudit: OperatorSecurityAuditDiagnosticsSnapshot | null;
  runtimeTools: OperatorRuntimeToolDiagnosticsSnapshot | null;
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
    frontendErrors: null,
    accountSetup: null,
    communityRows: [],
    risks: [],
    events: [],
  };
}

export function clampOperatorRightPanelWidth(width: number): number {
  if (!Number.isFinite(width)) return OPERATOR_RIGHT_PANEL_DEFAULT_WIDTH;
  return Math.min(OPERATOR_RIGHT_PANEL_MAX_WIDTH, Math.max(OPERATOR_RIGHT_PANEL_MIN_WIDTH, Math.round(width)));
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

export function WebOperatorDataPanel(props: {
  state: OperatorDashboardState;
  topCommunities: OperatorCommunityRecord[];
  isLoading: boolean;
  error: string | null;
  activeInsightTab: OperatorInsightTab;
  onActiveInsightTabChange: (tab: OperatorInsightTab) => void;
  onResizePointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onResizePointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onResizeDoubleClick: () => void;
  onResizeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}) {
  const activeInsightTabIndex = OPERATOR_INSIGHT_TABS.findIndex((tab) => tab.id === props.activeInsightTab);
  const insightTabSwitcherStyle = buildPlatformSwitcherStyle(OPERATOR_INSIGHT_TABS.length, activeInsightTabIndex);

  return (
    <>
      <div
        className="operator-data-panel__resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize operator data panel"
        tabIndex={0}
        onPointerDown={props.onResizePointerDown}
        onPointerMove={props.onResizePointerMove}
        onDoubleClick={props.onResizeDoubleClick}
        onKeyDown={props.onResizeKeyDown}
      />
      <div
        className="platform-switcher platform-switcher-compact operator-data-panel__tabs"
        role="tablist"
        aria-label="Operator data tabs"
        style={insightTabSwitcherStyle as CSSProperties}
      >
        {OPERATOR_INSIGHT_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className={`platform-switcher-btn${props.activeInsightTab === tab.id ? " is-active" : ""}`}
            aria-selected={props.activeInsightTab === tab.id}
            onClick={() => props.onActiveInsightTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="operator-data-panel__content">
        {props.error ? <div className="operator-surface-notice">{props.error}</div> : null}
        {props.isLoading ? <div className="operator-surface-notice">Loading operator data...</div> : null}
        {props.activeInsightTab === "platform" ? (
          <OperatorPlatformInsights
            webDeploy={props.state.webDeploy}
            authAccess={props.state.authAccess}
            securityAudit={props.state.securityAudit}
            runtimeTools={props.state.runtimeTools}
            frontendErrors={props.state.frontendErrors}
          />
        ) : props.activeInsightTab === "business" ? (
          <OperatorBusinessInsights
            overview={props.state.overview}
            monetization={props.state.monetization}
            runtimeTools={props.state.runtimeTools}
            risks={props.state.risks}
            events={props.state.events}
          />
        ) : props.activeInsightTab === "accounts" ? (
          <OperatorAccountSetupInsights snapshot={props.state.accountSetup} />
        ) : (
          <OperatorCommunityInsights overview={props.state.overview} communities={props.topCommunities} />
        )}
      </div>
    </>
  );
}

function formatMoney(metric: { currency: string; amountBaseUnits: number; currencyDecimals: number } | null): string {
  if (!metric) return "$0";
  const amount = Number(metric.amountBaseUnits ?? 0) / 10 ** Number(metric.currencyDecimals ?? 2);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: metric.currency || "usd",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${Math.round(value * 100)}%`;
}

function formatVisibility(value: OperatorCommunityRecord["community"]["visibility"]): string {
  switch (value) {
    case "published":
      return "Published";
    case "unlisted":
      return "Unlisted";
    default:
      return "Unknown";
  }
}

function formatEntryPolicy(value: OperatorCommunityRecord["community"]["entryPolicy"]): string {
  switch (value) {
    case "paid_subscription":
      return "Paid";
    case "approval":
      return "Approval";
    case "open":
      return "Free";
    default:
      return "Unknown";
  }
}

function formatAccountSetupStep(value: OperatorAccountSetupUserRecord["setup"]["current_step"]): string {
  switch (value) {
    case "identity":
      return "Profile";
    case "inference":
      return "Inference";
    case "agent":
      return "Agent";
    case "direction":
      return "Direction";
    case "complete":
      return "Complete";
    default:
      return "Unknown";
  }
}

function formatAccountSetupMissing(value: OperatorAccountSetupUserRecord["setup"]["missing"][number]): string {
  switch (value) {
    case "display_name":
      return "Name";
    case "avatar":
      return "Avatar";
    case "inference_provider":
      return "Inference";
    case "agent_name":
      return "Agent name";
    default:
      return value;
  }
}

function formatPayoutStatus(value: OperatorCommunityRecord["creator"]["payoutStatus"]): string {
  switch (value) {
    case "ready":
      return "Payout ready";
    case "onboarding_required":
      return "Payout setup";
    case "pending_requirements":
      return "Payout pending";
    case "restricted":
      return "Payout restricted";
    case "not_connected":
    default:
      return "No payout";
  }
}

function formatRiskFlag(value: string): string {
  switch (value) {
    case "paid_enabled_no_sales":
      return "Paid community has no sales";
    case "payout_not_ready":
      return "Payout not ready";
    case "checkout_abandonment":
      return "Checkout abandonment";
    case "no_members":
      return "No members";
    case "paid_missing_price":
      return "Missing price";
    case "stale_member_activity":
      return "No recent member activity";
    default:
      return value
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

function formatHealth(
  value:
    | OperatorAuthAccessDiagnosticsSnapshot["health"]
    | OperatorSecurityAuditDiagnosticsSnapshot["health"]
    | OperatorRuntimeToolDiagnosticsSnapshot["health"]
    | OperatorWebDeployDiagnosticsSnapshot["health"]
    | OperatorFrontendErrorDiagnosticsSnapshot["health"]
    | null
    | undefined,
): string {
  switch (value) {
    case "healthy":
      return "Healthy";
    case "degraded":
      return "Degraded";
    case "incident":
      return "Incident";
    case "unknown":
    default:
      return "Unknown";
  }
}

function formatDiagnosticEventType(value: string): string {
  switch (value) {
    case "auth.session_established":
      return "Session established";
    case "auth.session_refreshed":
      return "Session refreshed";
    case "auth.bootstrap_failed":
      return "Auth bootstrap failed";
    case "auth.session_refresh_failed":
      return "Session refresh failed";
    case "access.operator_access_granted":
      return "Operator access granted";
    case "access.operator_access_denied":
      return "Operator access denied";
    case "access.community_denied":
      return "Community access denied";
    default:
      return value
        .split(/[._:-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

function formatAuditEventType(value: string): string {
  switch (value) {
    case "account_delete_blocked":
      return "Account deletion blocked";
    case "account_delete_completed":
      return "Account deleted";
    case "operator_dashboard_accessed":
      return "Operator dashboard access";
    case "operator_role_deactivated":
      return "Operator role deactivated";
    case "operator_role_upserted":
      return "Operator role changed";
    case "stripe_webhook_failed":
      return "Stripe webhook failed";
    case "stripe_webhook_processed":
      return "Stripe webhook processed";
    case "stripe_webhook_received":
      return "Stripe webhook received";
    case "stripe_connect_account_synced":
      return "Stripe Connect synced";
    case "community_subscription_synced":
      return "Community subscription synced";
    default:
      return value
        .split(/[._:-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

function formatEventTime(createdAt: number): string {
  if (!Number.isFinite(createdAt)) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(createdAt));
}

function formatIsoEventTime(value: string | null): string {
  if (!value) return "";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  return formatEventTime(timestamp);
}

function formatBoundedCount(value: number | null | undefined, isTruncated: boolean | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return isTruncated ? `${value}+` : String(value);
}

function formatCredits(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0";
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatOptionalCount(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toLocaleString("en-US");
}

function formatPlatformScore(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return String(value);
}

function OperatorPlatformInsights(props: {
  webDeploy: OperatorWebDeployDiagnosticsSnapshot | null;
  authAccess: OperatorAuthAccessDiagnosticsSnapshot | null;
  securityAudit: OperatorSecurityAuditDiagnosticsSnapshot | null;
  runtimeTools: OperatorRuntimeToolDiagnosticsSnapshot | null;
  frontendErrors: OperatorFrontendErrorDiagnosticsSnapshot | null;
}) {
  const healthCards = buildOperatorPlatformHealthCards(props);
  return (
    <div className="operator-data-panel__grid">
      <section className="operator-dashboard__metrics" aria-label="Platform health overview">
        {healthCards.map((card) => (
          <div className={`operator-platform-health-card is-${card.status}`} key={card.id}>
            <span className="operator-platform-health-card__label">{card.label}</span>
            <div className="operator-platform-health-card__score-row">
              <strong>{formatPlatformScore(card.score)}</strong>
              <span>{formatHealth(card.status)}</span>
            </div>
            <span className="operator-platform-health-card__primary">{card.primaryMetric}</span>
            <ul className="operator-platform-health-card__drivers" aria-label={`${card.label} health drivers`}>
              {card.drivers.map((driver) => (
                <li key={driver}>{driver}</li>
              ))}
            </ul>
            <span className="operator-dashboard__metric-note">{card.evidenceNote}</span>
          </div>
        ))}
      </section>

      <section className="operator-dashboard__panel">
        <h2>Web &amp; deploy</h2>
        <div className="operator-dashboard__table">
          <div className="operator-dashboard__row">
            <span>Health</span>
            <strong>{formatHealth(props.webDeploy?.health)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Current build</span>
            <strong>{props.webDeploy?.currentBuild.buildId?.slice(0, 12) ?? "Unknown"}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Route checks</span>
            <strong>
              {props.webDeploy
                ? `${Math.max(0, props.webDeploy.totals.routeChecks - props.webDeploy.totals.routeFailures)}/${props.webDeploy.totals.routeChecks}`
                : "0/0"}
            </strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Deploy events</span>
            <strong>{props.webDeploy?.totals.deployEvents ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>First-party crash events</span>
            <strong>{props.webDeploy?.totals.frontendCrashEvents ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>First-party recovery events</span>
            <strong>{props.webDeploy?.totals.moduleLoadRecoveries ?? 0}</strong>
          </div>
          {props.webDeploy?.routeChecks.length ? (
            props.webDeploy.routeChecks.map((check) => (
              <div className="operator-dashboard__row" key={check.path}>
                <div>
                  <strong>{check.label}</strong>
                  <span>
                    {[check.path, check.httpStatus ? `HTTP ${check.httpStatus}` : check.errorCode, check.latencyMs != null ? `${check.latencyMs} ms` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <span>{check.status}</span>
              </div>
            ))
          ) : (
            <div className="operator-dashboard__empty">No web route probes returned.</div>
          )}
          {props.webDeploy?.evidence.versionJsonReachable === false ? (
            <div className="operator-dashboard__empty">Build version evidence is unavailable.</div>
          ) : null}
          {props.webDeploy && !props.webDeploy.evidence.sentryBacked ? (
            <div className="operator-dashboard__empty">
              Crash counts here are first-party deploy diagnostics only. Sentry-backed issue totals are shown in Frontend errors.
            </div>
          ) : null}
          {props.webDeploy?.evidence.isTruncated ? (
            <div className="operator-dashboard__empty">Web and deploy diagnostics are sampled for this window.</div>
          ) : null}
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Frontend errors</h2>
        <div className="operator-dashboard__table">
          <div className="operator-dashboard__row">
            <span>Health</span>
            <strong>{formatHealth(props.frontendErrors?.health)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Open issues shown</span>
            <strong>
              {formatBoundedCount(
                props.frontendErrors?.totals.unresolvedIssues,
                props.frontendErrors?.evidence.isTruncated,
              )}
            </strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Top issue events</span>
            <strong>
              {formatBoundedCount(props.frontendErrors?.totals.events, props.frontendErrors?.evidence.isTruncated)}
            </strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Affected users shown</span>
            <strong>
              {formatBoundedCount(
                props.frontendErrors?.totals.affectedUsers,
                props.frontendErrors?.evidence.isTruncated,
              )}
            </strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Sentry release</span>
            <strong>{props.frontendErrors?.release.sentryRelease?.slice(0, 12) ?? "Unknown"}</strong>
          </div>
          {props.frontendErrors?.evidence.unavailableReason ? (
            <div className="operator-dashboard__empty">
              Sentry frontend diagnostics unavailable: {props.frontendErrors.evidence.unavailableReason}.
            </div>
          ) : props.frontendErrors?.topIssues.length ? (
            props.frontendErrors.topIssues.slice(0, 3).map((issue) => (
              <div className="operator-dashboard__row" key={issue.id}>
                <div>
                  <strong>{issue.shortId ? `${issue.shortId}: ${issue.title}` : issue.title}</strong>
                  <span>
                    {[issue.level, `${issue.count} events`, formatIsoEventTime(issue.lastSeen), issue.culprit]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <span>{issue.status}</span>
              </div>
            ))
          ) : (
            <div className="operator-dashboard__empty">No unresolved frontend Sentry issues returned.</div>
          )}
          {props.frontendErrors?.release.matchesCurrentBuild === false ? (
            <div className="operator-dashboard__empty">Sentry release evidence does not match the current build id.</div>
          ) : null}
          {props.frontendErrors?.evidence.sampled ? (
            <div className="operator-dashboard__empty">
              Frontend error diagnostics show the top {props.frontendErrors.evidence.issueLimit} Sentry issues.
            </div>
          ) : null}
          {props.frontendErrors?.evidence.isTruncated ? (
            <div className="operator-dashboard__empty">Sentry returned more issues than the operator panel displays.</div>
          ) : null}
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Auth &amp; access</h2>
        <div className="operator-dashboard__table">
          <div className="operator-dashboard__row">
            <span>Health</span>
            <strong>{formatHealth(props.authAccess?.health)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Sessions established</span>
            <strong>{props.authAccess?.totals.sessionEstablished ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Auth failures</span>
            <strong>{props.authAccess?.totals.authFailures ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Refresh failures</span>
            <strong>{props.authAccess?.totals.sessionRefreshFailures ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Entitlement findings</span>
            <strong>{props.authAccess?.totals.entitlementFindings ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Unknown auth errors</span>
            <strong>{props.authAccess?.totals.unknownAuthErrors ?? 0}</strong>
          </div>
          {props.authAccess?.latestEvents.length ? (
            props.authAccess.latestEvents.slice(0, 3).map((event) => (
              <div className="operator-dashboard__row" key={event.id}>
                <div>
                  <strong>{formatDiagnosticEventType(event.eventType)}</strong>
                  <span>{[event.status, event.errorCode, formatEventTime(event.createdAt)].filter(Boolean).join(" · ")}</span>
                </div>
                <span>{event.severity}</span>
              </div>
            ))
          ) : (
            <div className="operator-dashboard__empty">No auth or access diagnostics returned.</div>
          )}
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Security &amp; audit</h2>
        <div className="operator-dashboard__table">
          <div className="operator-dashboard__row">
            <span>Health</span>
            <strong>{formatHealth(props.securityAudit?.health)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Webhook failures</span>
            <strong>{props.securityAudit?.totals.webhookFailures ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Blocked actions</span>
            <strong>{props.securityAudit?.totals.blockedActions ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Destructive actions</span>
            <strong>{props.securityAudit?.totals.destructiveActions ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Operator role changes</span>
            <strong>{props.securityAudit?.totals.operatorRoleChanges ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Unknown security events</span>
            <strong>{props.securityAudit?.totals.unknownSecurityEvents ?? 0}</strong>
          </div>
          {props.securityAudit?.attentionItems.length ? (
            props.securityAudit.attentionItems.slice(0, 3).map((item) => (
              <div className="operator-dashboard__row" key={item.id}>
                <div>
                  <strong>{item.title || formatAuditEventType(item.eventType)}</strong>
                  <span>{[item.status, formatEventTime(item.createdAt)].filter(Boolean).join(" · ")}</span>
                </div>
                <span>{item.severity}</span>
              </div>
            ))
          ) : (
            <div className="operator-dashboard__empty">No security audit attention items returned.</div>
          )}
          {props.securityAudit?.evidence.isTruncated ? (
            <div className="operator-dashboard__empty">Security audit diagnostics are sampled for this window.</div>
          ) : null}
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Runtime &amp; tools</h2>
        <div className="operator-dashboard__table">
          <div className="operator-dashboard__row">
            <span>Health</span>
            <strong>{formatHealth(props.runtimeTools?.health)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Turn success</span>
            <strong>{formatPercent(props.runtimeTools?.rates.turnSuccessRate)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Failed turns</span>
            <strong>{props.runtimeTools?.totals.turnsFailed ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Tool failure rate</span>
            <strong>{formatPercent(props.runtimeTools?.rates.toolFailureRate)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Paid-tool failures</span>
            <strong>{props.runtimeTools?.totals.paidToolLedgerFailures ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Unbilled compute</span>
            <strong>{props.runtimeTools?.totals.unbilledComputeCharges ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Sandbox create failures</span>
            <strong>{props.runtimeTools?.totals.sandboxCreateFailures ?? 0}</strong>
          </div>
          {props.runtimeTools?.topFailureCodes.length ? (
            props.runtimeTools.topFailureCodes.slice(0, 3).map((bucket) => (
              <div className="operator-dashboard__row" key={bucket.key}>
                <div>
                  <strong>{bucket.label}</strong>
                  <span>{bucket.latestAt ? formatEventTime(bucket.latestAt) : bucket.key}</span>
                </div>
                <span>{bucket.count}</span>
              </div>
            ))
          ) : (
            <div className="operator-dashboard__empty">No runtime or tool failures returned.</div>
          )}
          {props.runtimeTools?.evidence.isTruncated ? (
            <div className="operator-dashboard__empty">Runtime diagnostics are sampled for this window.</div>
          ) : null}
        </div>
      </section>

    </div>
  );
}

function OperatorBusinessInsights(props: {
  overview: OperatorOverviewSnapshot | null;
  monetization: OperatorMonetizationSnapshot | null;
  runtimeTools: OperatorRuntimeToolDiagnosticsSnapshot | null;
  risks: OperatorRiskItem[];
  events: OperatorEventRecord[];
}) {
  const businessKpis = props.monetization?.businessKpis ?? null;
  const creditTopupConversion =
    props.monetization && props.monetization.creditTopupCheckoutStarts > 0
      ? props.monetization.creditTopupCheckoutCompletions / props.monetization.creditTopupCheckoutStarts
      : null;
  const communityCheckoutConversion =
    props.monetization && props.monetization.communityCheckoutStarts > 0
      ? props.monetization.communityCheckoutCompletions / props.monetization.communityCheckoutStarts
      : null;

  return (
    <div className="operator-data-panel__grid">
      <section className="operator-dashboard__metrics" aria-label="Business overview">
        <div>
          <span>Visitors</span>
          <strong>{formatOptionalCount(businessKpis?.visitors.total)}</strong>
          <span className="operator-dashboard__metric-note">
            {businessKpis?.visitors.availability === "available" ? "First-party unique visitors in the selected window." : "Visitor source not connected yet."}
          </span>
        </div>
        <div>
          <span>New users</span>
          <strong>{businessKpis?.users.newInRange ?? 0}</strong>
          <span className="operator-dashboard__metric-note">Accounts created in the selected operator window.</span>
        </div>
        <div>
          <span>Activated creators</span>
          <strong>{businessKpis?.communities.activatedCommunityCreators ?? 0}</strong>
          <span className="operator-dashboard__metric-note">Community creators with at least one non-owner member.</span>
        </div>
        <div>
          <span>Community MRR</span>
          <strong>{formatMoney(businessKpis?.revenue.communitySubscriptionMrr ?? props.monetization?.estimatedCommunityMrr ?? null)}</strong>
          <span className="operator-dashboard__metric-note">Current gross run-rate from paid community subscriptions.</span>
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Acquisition funnel</h2>
        <div className="operator-dashboard__table">
          <div className="operator-dashboard__row">
            <span>Visitors</span>
            <strong>{formatOptionalCount(businessKpis?.visitors.total)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Identified visitors</span>
            <strong>{businessKpis?.visitors.identified ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Total users</span>
            <strong>{businessKpis?.users.total ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>New users</span>
            <strong>{businessKpis?.users.newInRange ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Tracked visitor to account</span>
            <strong>{formatPercent(businessKpis?.users.visitorToUserConversionRate ?? null)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Accounts completed</span>
            <strong>{businessKpis?.users.accountSetupCompleted ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Account completion</span>
            <strong>{formatPercent(businessKpis?.users.accountSetupCompletionRate ?? null)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Communities created</span>
            <strong>{businessKpis?.communities.createdInRange ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>User to community creation</span>
            <strong>{formatPercent(businessKpis?.communities.creationRateFromNewUsers ?? null)}</strong>
          </div>
          {businessKpis?.visitors.availability !== "available" ? (
            <div className="operator-dashboard__empty">Visitor analytics need first-party ingestion before conversion is available.</div>
          ) : (
            <div className="operator-dashboard__empty">Visitor count is deduped by anonymous visitor key across first-party business surfaces.</div>
          )}
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Activation</h2>
        <div className="operator-dashboard__table">
          <div className="operator-dashboard__row">
            <span>Community creators</span>
            <strong>{businessKpis?.communities.totalCommunityCreators ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Activated creators</span>
            <strong>{businessKpis?.communities.activatedCommunityCreators ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Creator activation</span>
            <strong>{formatPercent(businessKpis?.communities.communityCreatorActivationRate ?? null)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Communities with first member</span>
            <strong>{businessKpis?.communities.communitiesWithFirstMember ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Community activation</span>
            <strong>{formatPercent(businessKpis?.communities.communityActivationRate ?? null)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Paid communities with members</span>
            <strong>{businessKpis?.communities.paidCommunitiesWithMembers ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Paid community activation</span>
            <strong>{formatPercent(businessKpis?.communities.paidCommunityMemberActivationRate ?? null)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>New communities activated</span>
            <strong>{businessKpis?.communities.createdInRangeWithFirstMember ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>New community activation</span>
            <strong>{formatPercent(businessKpis?.communities.createdInRangeActivationRate ?? null)}</strong>
          </div>
          <div className="operator-dashboard__empty">Activation requires at least one active member who is not the community owner.</div>
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Revenue</h2>
        <div className="operator-dashboard__table">
          <div className="operator-dashboard__row">
            <span>Community subscription MRR</span>
            <strong>{formatMoney(businessKpis?.revenue.communitySubscriptionMrr ?? props.monetization?.estimatedCommunityMrr ?? null)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Active paying users</span>
            <strong>{businessKpis?.users.activePayingCustomers ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Usage buyers</span>
            <strong>{businessKpis?.users.usageBuyersInRange ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Checkout purchasers</span>
            <strong>{businessKpis?.users.checkoutPurchasersInRange ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Community checkout revenue</span>
            <strong>{formatMoney(businessKpis?.revenue.communityCheckoutRevenueInRange ?? null)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Credit revenue</span>
            <strong>{formatMoney(businessKpis?.revenue.creditTopupRevenueInRange ?? null)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Gross revenue</span>
            <strong>{formatMoney(businessKpis?.revenue.grossRevenueInRange ?? null)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Recorded LTV</span>
            <strong>{formatMoney(businessKpis?.revenue.averageRecordedLifetimeValue ?? null)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Platform net revenue</span>
            <strong>{businessKpis?.revenue.platformNetRevenueAvailability === "available" ? formatMoney(businessKpis.revenue.platformNetRevenueInRange) : "--"}</strong>
          </div>
          {businessKpis?.revenue.platformNetRevenueAvailability !== "available" ? (
            <div className="operator-dashboard__empty">Platform net revenue needs explicit fee/revenue-share attribution before it is reported. Recorded LTV uses first-party checkout records only.</div>
          ) : null}
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Checkout funnel</h2>
        <div className="operator-dashboard__table">
          <div className="operator-dashboard__row">
            <span>Total checkout starts</span>
            <strong>{businessKpis?.checkouts.totalStarts ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Total checkout completions</span>
            <strong>{businessKpis?.checkouts.totalCompletions ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Checkout conversion</span>
            <strong>{formatPercent(businessKpis?.checkouts.totalConversionRate ?? null)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Failed or abandoned</span>
            <strong>{businessKpis?.checkouts.failedOrAbandoned ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Community checkout conversion</span>
            <strong>{formatPercent(communityCheckoutConversion)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Credit top-up conversion</span>
            <strong>{formatPercent(creditTopupConversion)}</strong>
          </div>
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Tool balance revenue</h2>
        <div className="operator-dashboard__table">
          <div className="operator-dashboard__row">
            <span>Credit top-up starts</span>
            <strong>{props.monetization?.creditTopupCheckoutStarts ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Credit top-up completions</span>
            <strong>{props.monetization?.creditTopupCheckoutCompletions ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Credits settled</span>
            <strong>{formatCredits(props.runtimeTools?.paidTools.totals.settledCredits)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Credits refunded</span>
            <strong>{formatCredits(props.runtimeTools?.paidTools.totals.refundedCredits)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Still reserved</span>
            <strong>{props.runtimeTools?.paidTools.totals.stillReserved ?? 0}</strong>
          </div>
          {props.runtimeTools?.paidTools.lanes.some((lane) => lane.reservations > 0) ? (
            props.runtimeTools.paidTools.lanes
              .filter((lane) => lane.reservations > 0)
              .slice(0, 3)
              .map((lane) => (
                <div className="operator-dashboard__row" key={lane.toolName}>
                  <div>
                    <strong>{lane.label}</strong>
                    <span>
                      {[
                        `${lane.succeeded} settled`,
                        `${lane.refunded} refunded`,
                        `${formatCredits(lane.settledCredits)} credits`,
                        lane.latestAt ? formatEventTime(lane.latestAt) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  <span>{lane.failures > 0 ? `${lane.failures} failures` : "ok"}</span>
                </div>
              ))
          ) : (
            <div className="operator-dashboard__empty">No paid-tool credit activity returned.</div>
          )}
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Email conversion</h2>
        <div className="operator-dashboard__table">
          <div className="operator-dashboard__row">
            <span>Sent</span>
            <strong>{businessKpis?.email.sent ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Delivered</span>
            <strong>{businessKpis?.email.delivered ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Opened</span>
            <strong>{businessKpis?.email.opened ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Clicked</span>
            <strong>{businessKpis?.email.clicked ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Email click rate</span>
            <strong>{formatPercent(businessKpis?.email.clickRate ?? null)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Email to conversion</span>
            <strong>{formatPercent(businessKpis?.email.conversionRate ?? null)}</strong>
          </div>
          {businessKpis?.email.conversionAvailability !== "available" ? (
            <div className="operator-dashboard__empty">Resend delivery events exist, but checkout/signup attribution is not wired yet.</div>
          ) : null}
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Friction &amp; risks</h2>
        <div className="operator-dashboard__table">
          {props.risks.length === 0 ? (
            <div className="operator-dashboard__empty">No risk items returned.</div>
          ) : (
            props.risks.map((risk) => (
              <div className="operator-dashboard__row" key={risk.id}>
                <div>
                  <strong>{formatRiskFlag(risk.kind)}</strong>
                  <span>{risk.kind}</span>
                </div>
                <span>{risk.severity}</span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Recent operator events</h2>
        <div className="operator-dashboard__table">
          {props.events.length === 0 ? (
            <div className="operator-dashboard__empty">No operator events returned.</div>
          ) : (
            props.events.map((event) => (
              <div className="operator-dashboard__row" key={event.id}>
                <div>
                  <strong>{event.eventType}</strong>
                  <span>{[event.status, formatEventTime(event.createdAt)].filter(Boolean).join(" · ")}</span>
                </div>
                <span>{event.severity}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function OperatorAccountSetupInsights(props: { snapshot: OperatorAccountSetupSnapshot | null }) {
  const overview = props.snapshot?.overview ?? null;
  const userList = props.snapshot?.users ?? null;
  const users = userList?.rows ?? [];
  const setupCompletionRate =
    overview && overview.totals.users > 0
      ? overview.totals.completed / overview.totals.users
      : null;
  const missingRows = OPERATOR_ACCOUNT_SETUP_MISSING_ORDER
    .map((field) => ({
      field,
      count: overview?.byMissing[field] ?? 0,
    }))
    .filter((row) => row.count > 0);
  const showingLabel = userList
    ? `Showing ${users.length} of ${userList.totalMatching} matching users`
    : "Showing 0 of 0 matching users";

  return (
    <div className="operator-data-panel__grid">
      <section className="operator-dashboard__metrics" aria-label="Account setup overview">
        <div>
          <span>Total users</span>
          <strong>{overview?.totals.users ?? 0}</strong>
          <span className="operator-dashboard__metric-note">Canonical account records.</span>
        </div>
        <div>
          <span>Complete</span>
          <strong>{overview?.totals.completed ?? 0}</strong>
          <span className="operator-dashboard__metric-note">{formatPercent(setupCompletionRate)} setup completion.</span>
        </div>
        <div>
          <span>Need setup</span>
          <strong>{overview?.totals.incomplete ?? 0}</strong>
          <span className="operator-dashboard__metric-note">Users missing required setup fields.</span>
        </div>
        <div>
          <span>Average</span>
          <strong>{overview?.totals.averagePercent ?? 0}%</strong>
          <span className="operator-dashboard__metric-note">Mean setup completion.</span>
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Current step</h2>
        <div className="operator-dashboard__table">
          {OPERATOR_ACCOUNT_SETUP_STEP_ORDER.map((step) => (
            <div className="operator-dashboard__row" key={step}>
              <span>{formatAccountSetupStep(step)}</span>
              <strong>{overview?.byStep[step] ?? 0}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Missing fields</h2>
        <div className="operator-dashboard__table">
          {missingRows.length === 0 ? (
            <div className="operator-dashboard__empty">No missing setup fields returned.</div>
          ) : (
            missingRows.map((row) => (
              <div className="operator-dashboard__row" key={row.field}>
                <span>{formatAccountSetupMissing(row.field)}</span>
                <strong>{row.count}</strong>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="operator-dashboard__panel operator-dashboard__panel--full">
        <h2>People needing setup</h2>
        <div className="operator-dashboard__table">
          {userList && userList.totalMatching > 0 ? (
            <div className="operator-dashboard__empty">{showingLabel}</div>
          ) : null}
          {users.length === 0 ? (
            <div className="operator-dashboard__empty">No incomplete account setup records returned.</div>
          ) : (
            users.map((record) => {
              const missing = record.setup.missing.slice(0, 4);
              const extraMissingCount = Math.max(0, record.setup.missing.length - missing.length);
              return (
                <div className="operator-dashboard__row operator-dashboard__community-row" key={record.user.dbUserId}>
                  <div className="operator-dashboard__community-main">
                    <strong>{record.user.displayName ?? record.user.email ?? record.user.userId}</strong>
                    <span>
                      {[
                        record.user.email,
                        record.user.handle ? `@${record.user.handle}` : null,
                        formatAccountSetupStep(record.setup.current_step),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <div className="operator-dashboard__chips" aria-label="Missing setup fields">
                      {missing.map((field) => (
                        <span className="operator-dashboard__chip operator-dashboard__chip--warning" key={field}>
                          {formatAccountSetupMissing(field)}
                        </span>
                      ))}
                      {extraMissingCount > 0 ? (
                        <span className="operator-dashboard__chip">+{extraMissingCount}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="operator-dashboard__community-stats">
                    <strong>{record.setup.percent}%</strong>
                    <span>{record.communities.owned} owned</span>
                    <span>{record.communities.joined} joined</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

function OperatorCommunityInsights(props: {
  overview: OperatorOverviewSnapshot | null;
  communities: OperatorCommunityRecord[];
}) {
  const totals = props.overview?.totals;
  return (
    <div className="operator-data-panel__grid">
      <section className="operator-dashboard__metrics" aria-label="Community performance overview">
        <div>
          <span>Communities</span>
          <strong>{totals?.communities ?? 0}</strong>
          <span className="operator-dashboard__metric-note">
            {totals?.communityCreators ?? 0} unique community creators.
          </span>
        </div>
        <div>
          <span>Active communities</span>
          <strong>{totals?.activeCommunities ?? 0}</strong>
          <span className="operator-dashboard__metric-note">At least one active member.</span>
        </div>
        <div>
          <span>Active members</span>
          <strong>{formatOptionalCount(totals?.totalCommunityMembers)}</strong>
          <span className="operator-dashboard__metric-note">{formatOptionalCount(totals?.averageMembersPerCommunity)} average active per community.</span>
        </div>
        <div>
          <span>Community MRR</span>
          <strong>{formatMoney(totals?.estimatedMrr ?? null)}</strong>
          <span className="operator-dashboard__metric-note">{formatMoney(totals?.averageMrrPerCommunity ?? null)} average per community.</span>
        </div>
        <div>
          <span>Paid conversion</span>
          <strong>{formatPercent(totals?.paidCommunityConversionRate)}</strong>
          <span className="operator-dashboard__metric-note">{totals?.paidCommunities ?? 0} communities have active paid subscribers.</span>
        </div>
        <div>
          <span>Setup risk</span>
          <strong>{totals?.setupRiskCommunities ?? 0}</strong>
          <span className="operator-dashboard__metric-note">{totals?.staleCommunities ?? 0} stale communities.</span>
        </div>
      </section>

      <section className="operator-dashboard__panel operator-dashboard__panel--full">
        <h2>Top communities</h2>
        <div className="operator-dashboard__table">
          {props.communities.map((record) => (
            <div className="operator-dashboard__row operator-dashboard__community-row" key={record.community.communityId}>
              <div className="operator-dashboard__community-main">
                <strong>{record.community.name}</strong>
                <span>{record.creator.displayName ?? record.creator.email ?? record.creator.userId}</span>
                <div className="operator-dashboard__chips" aria-label={`${record.community.name} state`}>
                  <span className="operator-dashboard__chip">{formatVisibility(record.community.visibility)}</span>
                  <span className="operator-dashboard__chip">{formatEntryPolicy(record.community.entryPolicy)}</span>
                  <span className="operator-dashboard__chip">{formatPayoutStatus(record.creator.payoutStatus)}</span>
                  {record.risk.flags.map((flag) => (
                    <span className="operator-dashboard__chip operator-dashboard__chip--warning" key={flag}>
                      {formatRiskFlag(flag)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="operator-dashboard__community-stats">
                <strong>{formatMoney(record.money.estimatedMrr)}</strong>
                <span>{record.members.activeMemberships} members</span>
                <span>{record.money.activePaidMembers} paid</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
