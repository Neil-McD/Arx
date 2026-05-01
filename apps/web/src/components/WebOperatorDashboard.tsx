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

  return (
    <div className="operator-dashboard">
      <div className="operator-dashboard__header">
        <p className="operator-dashboard__eyebrow">Operator Intelligence</p>
        <h1>PolyNet operating model</h1>
        <p>
          Read-only ground truth for builders, Polynet monetization, risk, and critical events.
        </p>
      </div>

      {error ? <div className="operator-dashboard__notice">{error}</div> : null}
      {isLoading ? <div className="operator-dashboard__notice">Loading operator data...</div> : null}

      <section className="operator-dashboard__metrics" aria-label="Operator overview">
        <div>
          <span>Estimated community MRR</span>
          <strong>{formatMoney(state.overview?.totals.estimatedMrr ?? null)}</strong>
        </div>
        <div>
          <span>Builders</span>
          <strong>{state.overview?.totals.builders ?? 0}</strong>
        </div>
        <div>
          <span>Communities</span>
          <strong>{state.overview?.totals.communities ?? 0}</strong>
        </div>
        <div>
          <span>Risk items</span>
          <strong>{state.overview?.totals.riskItems ?? 0}</strong>
        </div>
      </section>

      <div className="operator-dashboard__grid">
        <section className="operator-dashboard__panel">
          <h2>Builders</h2>
          <div className="operator-dashboard__table">
            {topBuilders.map((record) => (
              <div className="operator-dashboard__row" key={record.community.communityId}>
                <div>
                  <strong>{record.community.name}</strong>
                  <span>{record.builder.email ?? record.builder.displayName ?? record.builder.userId}</span>
                </div>
                <div>
                  <strong>{formatMoney(record.money.estimatedMrr)}</strong>
                  <span>{record.money.activePaidMembers} paid</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="operator-dashboard__panel">
          <h2>Polynet monetization</h2>
          <div className="operator-dashboard__table">
            <div className="operator-dashboard__row">
              <span>Builder checkout conversion</span>
              <strong>
                {formatPercent(
                  state.monetization && state.monetization.builderPlanCheckoutStarts > 0
                    ? state.monetization.builderPlanCheckoutCompletions /
                        state.monetization.builderPlanCheckoutStarts
                    : null,
                )}
              </strong>
            </div>
            <div className="operator-dashboard__row">
              <span>Community checkout conversion</span>
              <strong>
                {formatPercent(
                  state.monetization && state.monetization.communityCheckoutStarts > 0
                    ? state.monetization.communityCheckoutCompletions /
                        state.monetization.communityCheckoutStarts
                    : null,
                )}
              </strong>
            </div>
            <div className="operator-dashboard__row">
              <span>Active community subscriptions</span>
              <strong>{state.monetization?.activeCommunitySubscriptions ?? 0}</strong>
            </div>
          </div>
        </section>

        <section className="operator-dashboard__panel">
          <h2>Risk</h2>
          <div className="operator-dashboard__table">
            {state.risks.length === 0 ? (
              <div className="operator-dashboard__empty">No risk items returned.</div>
            ) : (
              state.risks.map((risk) => (
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
            {state.events.map((event) => (
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
    </div>
  );
}
