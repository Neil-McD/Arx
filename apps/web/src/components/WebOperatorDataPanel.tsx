import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import type { AuthSessionLike } from "../../../../shared/authSession";
import { buildPlatformSwitcherStyle } from "../../../../shared/platformSwitcherUi";
import {
  loadOperatorAuthAccessDiagnosticsCanonical,
  loadOperatorBuildersCanonical,
  loadOperatorEventsCanonical,
  loadOperatorMonetizationCanonical,
  loadOperatorOverviewCanonical,
  loadOperatorRisksCanonical,
  loadOperatorRuntimeToolDiagnosticsCanonical,
  loadOperatorSecurityAuditDiagnosticsCanonical,
  recordOperatorDashboardAccessCanonical,
} from "../../../../shared/cloudOperatorDashboardGateway";
import type {
  OperatorAuthAccessDiagnosticsSnapshot,
  OperatorBuilderRecord,
  OperatorEventRecord,
  OperatorMonetizationSnapshot,
  OperatorOverviewSnapshot,
  OperatorRiskItem,
  OperatorRuntimeToolDiagnosticsSnapshot,
  OperatorSecurityAuditDiagnosticsSnapshot,
} from "../../../../shared/operatorTypes";

export type OperatorInsightTab = "platform" | "builders";

export const OPERATOR_RIGHT_PANEL_DEFAULT_WIDTH = 560;
export const OPERATOR_RIGHT_PANEL_MIN_WIDTH = 380;
export const OPERATOR_RIGHT_PANEL_MAX_WIDTH = 860;
export const OPERATOR_RIGHT_PANEL_GUTTER = 28;
export const OPERATOR_RIGHT_PANEL_KEYBOARD_STEP = 32;

const OPERATOR_INSIGHT_TABS: Array<{ id: OperatorInsightTab; label: string }> = [
  { id: "platform", label: "Platform" },
  { id: "builders", label: "Communities" },
];

export type OperatorDashboardState = {
  overview: OperatorOverviewSnapshot | null;
  monetization: OperatorMonetizationSnapshot | null;
  authAccess: OperatorAuthAccessDiagnosticsSnapshot | null;
  securityAudit: OperatorSecurityAuditDiagnosticsSnapshot | null;
  runtimeTools: OperatorRuntimeToolDiagnosticsSnapshot | null;
  builders: OperatorBuilderRecord[];
  risks: OperatorRiskItem[];
  events: OperatorEventRecord[];
};

export function createEmptyOperatorDashboardState(): OperatorDashboardState {
  return {
    overview: null,
    monetization: null,
    authAccess: null,
    securityAudit: null,
    runtimeTools: null,
    builders: [],
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

function fulfilledList<T>(result: PromiseSettledResult<T[]>): T[] {
  return result.status === "fulfilled" ? result.value : [];
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
      setState(createEmptyOperatorDashboardState());
      setIsLoading(false);
      setError(null);
      return;
    }
    if (!params.session) {
      setState(createEmptyOperatorDashboardState());
      setIsLoading(false);
      setError("Sign in with an operator account to view this surface.");
      return;
    }

    setState(createEmptyOperatorDashboardState());
    setIsLoading(true);
    setError(null);
    const session = params.session;
    recordOperatorDashboardAccessCanonical({ session, surface: params.surface })
      .then(async () => {
        const results = await Promise.allSettled([
          loadOperatorOverviewCanonical({ session, range: "30d" }),
          loadOperatorMonetizationCanonical({ session, range: "30d" }),
          loadOperatorAuthAccessDiagnosticsCanonical({ session, range: "30d" }),
          loadOperatorSecurityAuditDiagnosticsCanonical({ session, range: "30d" }),
          loadOperatorRuntimeToolDiagnosticsCanonical({ session, range: "30d" }),
          loadOperatorBuildersCanonical({ session, limit: 12 }),
          loadOperatorRisksCanonical({ session, limit: 12 }),
          loadOperatorEventsCanonical({ session, limit: 12 }),
        ] as const);
        const [overview, monetization, authAccess, securityAudit, runtimeTools, builders, risks, events] = results;
        [
          ["overview", overview],
          ["monetization", monetization],
          ["auth_access", authAccess],
          ["security_audit", securityAudit],
          ["runtime_tools", runtimeTools],
          ["builders", builders],
          ["risks", risks],
          ["events", events],
        ].forEach(([label, result]) => logRejectedOperatorSection(String(label), result as PromiseSettledResult<unknown>));
        return {
          overview: fulfilledValue(overview),
          monetization: fulfilledValue(monetization),
          authAccess: fulfilledValue(authAccess),
          securityAudit: fulfilledValue(securityAudit),
          runtimeTools: fulfilledValue(runtimeTools),
          builders: fulfilledList(builders),
          risks: fulfilledList(risks),
          events: fulfilledList(events),
        };
      })
      .then(
        (nextState) => {
          if (!isAlive) return;
          setState(nextState);
        },
        (nextError) => {
          if (!isAlive) return;
          const message = nextError instanceof Error ? nextError.message : "Operator dashboard unavailable.";
          setState(createEmptyOperatorDashboardState());
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

  const topBuilders = useMemo(
    () =>
      [...state.builders].sort(
        (a, b) => (b.money.estimatedMrr?.amountBaseUnits ?? 0) - (a.money.estimatedMrr?.amountBaseUnits ?? 0),
      ),
    [state.builders],
  );

  return { state, topBuilders, isLoading, error };
}

export function WebOperatorDataPanel(props: {
  state: OperatorDashboardState;
  topBuilders: OperatorBuilderRecord[];
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
            overview={props.state.overview}
            monetization={props.state.monetization}
            authAccess={props.state.authAccess}
            securityAudit={props.state.securityAudit}
            runtimeTools={props.state.runtimeTools}
            risks={props.state.risks}
            events={props.state.events}
          />
        ) : (
          <OperatorBuilderInsights builders={props.topBuilders} />
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

function formatVisibility(value: OperatorBuilderRecord["community"]["visibility"]): string {
  switch (value) {
    case "published":
      return "Published";
    case "unlisted":
      return "Unlisted";
    default:
      return "Unknown";
  }
}

function formatEntryPolicy(value: OperatorBuilderRecord["community"]["entryPolicy"]): string {
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

function formatPayoutStatus(value: OperatorBuilderRecord["builder"]["payoutStatus"]): string {
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
    case "builder_entitlement_granted":
      return "Builder entitlement granted";
    case "builder_entitlement_revoked":
      return "Builder entitlement revoked";
    case "builder_subscription_synced":
      return "Builder subscription synced";
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

function OperatorPlatformInsights(props: {
  overview: OperatorOverviewSnapshot | null;
  monetization: OperatorMonetizationSnapshot | null;
  authAccess: OperatorAuthAccessDiagnosticsSnapshot | null;
  securityAudit: OperatorSecurityAuditDiagnosticsSnapshot | null;
  runtimeTools: OperatorRuntimeToolDiagnosticsSnapshot | null;
  risks: OperatorRiskItem[];
  events: OperatorEventRecord[];
}) {
  return (
    <div className="operator-data-panel__grid">
      <section className="operator-dashboard__metrics" aria-label="Operator overview">
        <div>
          <span>Community subscription MRR</span>
          <strong>{formatMoney(props.overview?.totals.estimatedMrr ?? null)}</strong>
          <span className="operator-dashboard__metric-note">Current run-rate from active community subscriptions.</span>
        </div>
        <div>
          <span>Builders</span>
          <strong>{props.overview?.totals.builders ?? 0}</strong>
          <span className="operator-dashboard__metric-note">Unique community owners.</span>
        </div>
        <div>
          <span>Communities</span>
          <strong>{props.overview?.totals.communities ?? 0}</strong>
          <span className="operator-dashboard__metric-note">All community records.</span>
        </div>
        <div>
          <span>Risk items</span>
          <strong>{props.overview?.totals.riskItems ?? 0}</strong>
          <span className="operator-dashboard__metric-note">Open operator warnings and errors.</span>
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

      <section className="operator-dashboard__panel">
        <h2>Revenue health</h2>
        <div className="operator-dashboard__table">
          <div className="operator-dashboard__row">
            <span>Community subscription MRR</span>
            <strong>{formatMoney(props.monetization?.estimatedCommunityMrr ?? null)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Credit top-up conversion</span>
            <strong>
              {formatPercent(
                props.monetization && props.monetization.creditTopupCheckoutStarts > 0
                  ? props.monetization.creditTopupCheckoutCompletions /
                      props.monetization.creditTopupCheckoutStarts
                  : null,
              )}
            </strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Community checkout conversion</span>
            <strong>
              {formatPercent(
                props.monetization && props.monetization.communityCheckoutStarts > 0
                  ? props.monetization.communityCheckoutCompletions /
                      props.monetization.communityCheckoutStarts
                  : null,
              )}
            </strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Active community subscriptions</span>
            <strong>{props.monetization?.activeCommunitySubscriptions ?? 0}</strong>
          </div>
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Risk</h2>
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
        <h2>Events</h2>
        <div className="operator-dashboard__table">
          {props.events.map((event) => (
            <div className="operator-dashboard__row" key={event.id}>
              <div>
                <strong>{event.eventType}</strong>
                <span>{[event.status, formatEventTime(event.createdAt)].filter(Boolean).join(" · ")}</span>
              </div>
              <span>{event.severity}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function OperatorBuilderInsights(props: { builders: OperatorBuilderRecord[] }) {
  return (
    <div className="operator-data-panel__grid">
      <section className="operator-dashboard__panel operator-dashboard__panel--full">
        <h2>Communities by builder</h2>
        <div className="operator-dashboard__table">
          {props.builders.map((record) => (
            <div className="operator-dashboard__row operator-dashboard__community-row" key={record.community.communityId}>
              <div className="operator-dashboard__community-main">
                <strong>{record.community.name}</strong>
                <span>{record.builder.displayName ?? record.builder.email ?? record.builder.userId}</span>
                <div className="operator-dashboard__chips" aria-label={`${record.community.name} state`}>
                  <span className="operator-dashboard__chip">{formatVisibility(record.community.visibility)}</span>
                  <span className="operator-dashboard__chip">{formatEntryPolicy(record.community.entryPolicy)}</span>
                  <span className="operator-dashboard__chip">{formatPayoutStatus(record.builder.payoutStatus)}</span>
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
