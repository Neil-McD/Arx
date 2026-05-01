import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent } from "react";
import type { AuthSessionLike } from "../../../../shared/authSession";
import { buildPlatformSwitcherStyle } from "../../../../shared/platformSwitcherUi";
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

const OPERATOR_INSIGHT_TABS: Array<{ id: OperatorInsightTab; label: string }> = [
  { id: "platform", label: "Platform" },
  { id: "builders", label: "Builders" },
];

const OPERATOR_RIGHT_PANEL_DEFAULT_WIDTH = 560;
const OPERATOR_RIGHT_PANEL_MIN_WIDTH = 380;
const OPERATOR_RIGHT_PANEL_MAX_WIDTH = 860;
const OPERATOR_RIGHT_PANEL_GUTTER = 28;
const OPERATOR_RIGHT_PANEL_KEYBOARD_STEP = 32;

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

function clampOperatorRightPanelWidth(width: number): number {
  if (!Number.isFinite(width)) return OPERATOR_RIGHT_PANEL_DEFAULT_WIDTH;
  return Math.min(OPERATOR_RIGHT_PANEL_MAX_WIDTH, Math.max(OPERATOR_RIGHT_PANEL_MIN_WIDTH, Math.round(width)));
}

export function WebOperatorDashboard(props: WebOperatorDashboardProps) {
  const [state, setState] = useState<OperatorDashboardState>(() => createEmptyOperatorDashboardState());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeInsightTab, setActiveInsightTab] = useState<OperatorInsightTab>("platform");
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [rightPanelWidth, setRightPanelWidth] = useState(OPERATOR_RIGHT_PANEL_DEFAULT_WIDTH);
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
      )
      .finally(() => {
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
  const activeInsightTabIndex = OPERATOR_INSIGHT_TABS.findIndex((tab) => tab.id === activeInsightTab);
  const insightTabSwitcherStyle = buildPlatformSwitcherStyle(OPERATOR_INSIGHT_TABS.length, activeInsightTabIndex);
  const operatorSurfaceStyle = {
    "--operator-right-panel-width": `${rightPanelWidth}px`,
    "--operator-right-panel-gutter": `${OPERATOR_RIGHT_PANEL_GUTTER}px`,
  } as CSSProperties;

  const resizeRightPanelFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    setRightPanelWidth(clampOperatorRightPanelWidth(window.innerWidth - event.clientX));
  };

  const handleRightPanelResizePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRightPanelFromPointer(event);
  };

  return (
    <div
      className={`operator-surface${isRightPanelOpen ? " operator-surface--right-open" : ""}`}
      style={operatorSurfaceStyle}
    >
      <button
        type="button"
        className={`icon-button operator-data-toggle${isRightPanelOpen ? " active" : ""}`}
        onClick={() => setIsRightPanelOpen((value) => !value)}
        aria-expanded={isRightPanelOpen}
        aria-controls="operator-data-panel"
        aria-label={isRightPanelOpen ? "Close operator data panel" : "Open operator data panel"}
        title={isRightPanelOpen ? "Close data panel" : "Open data panel"}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M15 4v16" />
        </svg>
      </button>

      <div className="workspace-body operator-workspace-body">
        <div className="message-list message-list-empty-thread">
          <div className="operator-empty-thread" role="region" aria-label="Ask the operator agent">
            {error ? <div className="operator-surface-notice">{error}</div> : null}
            {isLoading ? <div className="operator-surface-notice">Loading operator data...</div> : null}
            <div className="web-empty-thread-composer operator-empty-thread-composer">
              <div className="ask-bar ask-bar-landing operator-ask-bar">
                <textarea
                  className="ask-input ask-input-landing"
                  rows={1}
                  value={operatorDraft}
                  onChange={(event) => setOperatorDraft(event.currentTarget.value)}
                  placeholder="Ask about revenue, builders, risks, or recent events..."
                />
                <div className="ask-footer ask-footer-landing">
                  <div className="ask-footer-left">
                    <button className="ask-icon-btn ask-plus" type="button" disabled aria-label="Attach files">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </button>
                  </div>
                  <div className="ask-actions ask-actions-landing">
                    <button
                      className="chat-send ask-send-btn ask-send-btn-v2"
                      type="button"
                      disabled
                      aria-label="Send"
                      title="Send"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 17V8M8.5 11.5 12 8l3.5 3.5" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isRightPanelOpen ? (
        <aside id="operator-data-panel" className="operator-data-panel" aria-label="Operator intelligence data">
          <div
            className="operator-data-panel__resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize operator data panel"
            tabIndex={0}
            onPointerDown={handleRightPanelResizePointerDown}
            onPointerMove={(event) => {
              if (event.buttons === 1) resizeRightPanelFromPointer(event);
            }}
            onDoubleClick={() => setRightPanelWidth(OPERATOR_RIGHT_PANEL_DEFAULT_WIDTH)}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                setRightPanelWidth((width) => clampOperatorRightPanelWidth(width + OPERATOR_RIGHT_PANEL_KEYBOARD_STEP));
              }
              if (event.key === "ArrowRight") {
                event.preventDefault();
                setRightPanelWidth((width) => clampOperatorRightPanelWidth(width - OPERATOR_RIGHT_PANEL_KEYBOARD_STEP));
              }
            }}
          />
          <div
            className="platform-switcher platform-switcher-compact operator-data-panel__tabs"
            role="tablist"
            aria-label="Operator data tabs"
            style={insightTabSwitcherStyle}
          >
            {OPERATOR_INSIGHT_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                className={`platform-switcher-btn${activeInsightTab === tab.id ? " is-active" : ""}`}
                aria-selected={activeInsightTab === tab.id}
                onClick={() => setActiveInsightTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="operator-data-panel__content">
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
          </div>
        </aside>
      ) : null}
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
    <div className="operator-data-panel__grid">
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
    <div className="operator-data-panel__grid">
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
