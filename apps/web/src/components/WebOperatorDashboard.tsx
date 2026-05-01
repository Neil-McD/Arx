import { useEffect, useMemo, useState } from "react";
import type { AuthSessionLike } from "../../../../shared/authSession";
import {
  loadOperatorBuildersCanonical,
  loadOperatorEventsCanonical,
  loadOperatorMonetizationCanonical,
  loadOperatorOverviewCanonical,
  loadOperatorRisksCanonical,
  recordOperatorDashboardAccessCanonical,
} from "../../../../shared/cloudOperatorDashboardGateway";
import type {
  OperatorBuilderRecord,
  OperatorEventRecord,
  OperatorMonetizationSnapshot,
  OperatorOverviewSnapshot,
  OperatorRiskItem,
} from "../../../../shared/operatorTypes";

type OperatorInsightTab = "platform" | "builders";
type OperatorRightPanelMode = "closed" | "wide" | "dominant";

type OperatorDashboardState = {
  overview: OperatorOverviewSnapshot | null;
  monetization: OperatorMonetizationSnapshot | null;
  builders: OperatorBuilderRecord[];
  risks: OperatorRiskItem[];
  events: OperatorEventRecord[];
};

type WebOperatorDashboardProps = {
  session: AuthSessionLike | null;
};

function createEmptyOperatorDashboardState(): OperatorDashboardState {
  return {
    overview: null,
    monetization: null,
    builders: [],
    risks: [],
    events: [],
  };
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

export function WebOperatorDashboard(props: WebOperatorDashboardProps) {
  const [state, setState] = useState<OperatorDashboardState>(() => createEmptyOperatorDashboardState());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeInsightTab, setActiveInsightTab] = useState<OperatorInsightTab>("platform");
  const [rightPanelMode, setRightPanelMode] = useState<OperatorRightPanelMode>("wide");
  const [operatorDraft, setOperatorDraft] = useState("");

  useEffect(() => {
    let isAlive = true;
    if (!props.session) {
      setState(createEmptyOperatorDashboardState());
      setIsLoading(false);
      setError("Sign in with an operator account to view this surface.");
      return;
    }
    setState(createEmptyOperatorDashboardState());
    setIsLoading(true);
    setError(null);
    const session = props.session;
    recordOperatorDashboardAccessCanonical({ session })
      .then(() =>
        Promise.all([
          loadOperatorOverviewCanonical({ session, range: "30d" }),
          loadOperatorMonetizationCanonical({ session, range: "30d" }),
          loadOperatorBuildersCanonical({ session, limit: 12 }),
          loadOperatorRisksCanonical({ session, limit: 12 }),
          loadOperatorEventsCanonical({ session, limit: 12 }),
        ]),
      )
      .then(
      ([overview, monetization, builders, risks, events]) => {
        if (!isAlive) return;
        setState({ overview, monetization, builders, risks, events });
      },
      (nextError) => {
        if (!isAlive) return;
        const message = nextError instanceof Error ? nextError.message : "Operator dashboard unavailable.";
        setState(createEmptyOperatorDashboardState());
        setError(message.includes("operator_access_forbidden") ? "Operator access required." : message);
      },
    ).finally(() => {
      if (isAlive) setIsLoading(false);
    });
    return () => {
      isAlive = false;
    };
  }, [props.session]);

  const topBuilders = useMemo(
    () =>
      [...state.builders].sort(
        (a, b) => (b.money.estimatedMrr?.amountBaseUnits ?? 0) - (a.money.estimatedMrr?.amountBaseUnits ?? 0),
      ),
    [state.builders],
  );

  const isRightPanelClosed = rightPanelMode === "closed";

  return (
    <div className={`operator-workbench operator-workbench--${rightPanelMode}`}>
      <section className="operator-agent-panel" aria-label="Operator agent">
        <div className="operator-agent-panel__header">
          <p className="operator-dashboard__eyebrow">Operator Intelligence</p>
          <h1>Ask the platform.</h1>
          <p>Investigate builders, money, risk, and critical events from one operator loop.</p>
        </div>

        {error ? <div className="operator-dashboard__notice">{error}</div> : null}
        {isLoading ? <div className="operator-dashboard__notice">Loading operator data...</div> : null}

        <div className="operator-agent-panel__prompts" aria-label="Suggested operator prompts">
          <button type="button" onClick={() => setOperatorDraft("What changed today?")}>
            What changed today?
          </button>
          <button type="button" onClick={() => setOperatorDraft("Which builders need attention?")}>
            Which builders need attention?
          </button>
          <button type="button" onClick={() => setOperatorDraft("Why is Distribution Engineering at risk?")}>
            Why is Distribution Engineering at risk?
          </button>
        </div>

        <div className="operator-agent-panel__body">
          <div className="operator-agent-panel__empty">
            Use the operator agent to query platform state, compare builders, inspect risks, and decide what to do next.
          </div>
        </div>

        <form className="operator-agent-composer">
          <textarea
            rows={3}
            value={operatorDraft}
            onChange={(event) => setOperatorDraft(event.currentTarget.value)}
            placeholder="Ask about revenue, builders, risks, or recent events..."
          />
          <div className="operator-agent-composer__footer">
            <span>Operator tools attach here next.</span>
            <button type="button" disabled>
              Ask
            </button>
          </div>
        </form>
      </section>

      <aside className="operator-insight-panel" aria-label="Operator intelligence panel">
        <button
          type="button"
          className="operator-insight-panel__collapsed-button"
          onClick={() => setRightPanelMode("wide")}
          aria-label="Open operator intelligence panel"
        >
          Data
        </button>

        {!isRightPanelClosed ? (
          <>
            <div className="operator-insight-panel__topbar">
              <div className="operator-insight-panel__tabs" role="tablist" aria-label="Operator data tabs">
                <button
                  type="button"
                  className={activeInsightTab === "platform" ? "active" : ""}
                  onClick={() => setActiveInsightTab("platform")}
                >
                  Platform
                </button>
                <button
                  type="button"
                  className={activeInsightTab === "builders" ? "active" : ""}
                  onClick={() => setActiveInsightTab("builders")}
                >
                  Builders
                </button>
              </div>
              <div className="operator-insight-panel__controls">
                <button
                  type="button"
                  onClick={() => setRightPanelMode(rightPanelMode === "dominant" ? "wide" : "dominant")}
                >
                  {rightPanelMode === "dominant" ? "Wide" : "Expand"}
                </button>
                <button type="button" onClick={() => setRightPanelMode("closed")}>Close</button>
              </div>
            </div>

            {activeInsightTab === "platform" ? (
              <OperatorPlatformInsights
                overview={state.overview}
                monetization={state.monetization}
                risks={state.risks}
                events={state.events}
              />
            ) : (
              <OperatorBuilderInsights builders={topBuilders} />
            )}
          </>
        ) : null}
      </aside>
    </div>
  );
}

function OperatorPlatformInsights(props: {
  overview: OperatorOverviewSnapshot | null;
  monetization: OperatorMonetizationSnapshot | null;
  risks: OperatorRiskItem[];
  events: OperatorEventRecord[];
}) {
  return (
    <div className="operator-insight-panel__content">
      <section className="operator-dashboard__metrics" aria-label="Operator overview">
        <div>
          <span>Estimated community MRR</span>
          <strong>{formatMoney(props.overview?.totals.estimatedMrr ?? null)}</strong>
        </div>
        <div>
          <span>Builders</span>
          <strong>{props.overview?.totals.builders ?? 0}</strong>
        </div>
        <div>
          <span>Communities</span>
          <strong>{props.overview?.totals.communities ?? 0}</strong>
        </div>
        <div>
          <span>Risk items</span>
          <strong>{props.overview?.totals.riskItems ?? 0}</strong>
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Polynet monetization</h2>
        <div className="operator-dashboard__table">
          <div className="operator-dashboard__row">
            <span>Builder checkout conversion</span>
            <strong>
              {formatPercent(
                props.monetization && props.monetization.builderPlanCheckoutStarts > 0
                  ? props.monetization.builderPlanCheckoutCompletions /
                      props.monetization.builderPlanCheckoutStarts
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
                  <strong>{risk.title}</strong>
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
                <span>{event.status}</span>
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
    <div className="operator-insight-panel__content">
      <section className="operator-dashboard__panel operator-dashboard__panel--full">
        <h2>Builder performance</h2>
        <div className="operator-dashboard__table">
          {props.builders.map((record) => (
            <div className="operator-dashboard__row" key={record.community.communityId}>
              <div>
                <strong>{record.builder.displayName ?? record.builder.email ?? record.builder.userId}</strong>
                <span>{record.community.name}</span>
              </div>
              <div>
                <strong>{formatMoney(record.money.estimatedMrr)}</strong>
                <span>{record.money.activePaidMembers} paid</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
