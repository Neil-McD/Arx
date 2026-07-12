import type { AuthSessionLike } from "../../../../shared/authSession";
import { OPERATOR_TABS, type OperatorTab } from "../../../../shared/appShellNavigation";
import { OperatorBusinessPanelView } from "./OperatorBusinessPanelView";
import { OperatorCommunitiesPanelView } from "./OperatorCommunitiesPanelView";
import { OperatorEmailPanelView } from "./OperatorEmailPanelView";
import { OperatorPlatformPanelView } from "./OperatorPlatformPanelView";
import { useOperatorDashboardData } from "./useOperatorDashboardData";

const OPERATOR_TAB_LABELS: Record<OperatorTab, string> = {
  platform: "Platform",
  business: "Business",
  email: "Email",
  communities: "Communities",
};

export type WebOperatorDashboardHostProps = {
  session: AuthSessionLike;
  activeTab: OperatorTab;
  onSelectTab: (tab: OperatorTab) => void;
};

export function WebOperatorDashboardHost(props: WebOperatorDashboardHostProps) {
  const operator = useOperatorDashboardData({
    session: props.session,
    enabled: true,
    surface: "operator_console",
  });

  return (
    <section className="operator-dashboard operator-console" aria-labelledby="operator-console-title">
      <header className="operator-console__header">
        <div>
          <p className="operator-dashboard__eyebrow">Polynet operations</p>
          <h1 id="operator-console-title">Operator Console</h1>
        </div>
        <nav className="operator-console__tabs" aria-label="Operator console views">
          {OPERATOR_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              className={props.activeTab === tab ? "is-active" : ""}
              aria-current={props.activeTab === tab ? "page" : undefined}
              onClick={() => props.onSelectTab(tab)}
            >
              {OPERATOR_TAB_LABELS[tab]}
            </button>
          ))}
        </nav>
      </header>

      <div className="operator-console__status" aria-live="polite">
        {operator.error ? (
          <div className="operator-dashboard__notice is-error">{operator.error}</div>
        ) : operator.isLoading ? (
          <div className="operator-dashboard__notice">Loading operator data...</div>
        ) : null}
      </div>

      <div className="operator-console__content">
        {props.activeTab === "platform" ? (
          <OperatorPlatformPanelView
            webDeploy={operator.state.webDeploy}
            authAccess={operator.state.authAccess}
            securityAudit={operator.state.securityAudit}
            runtimeTools={operator.state.runtimeTools}
            frontendErrors={operator.state.frontendErrors}
          />
        ) : props.activeTab === "business" ? (
          <OperatorBusinessPanelView
            overview={operator.state.overview}
            monetization={operator.state.monetization}
            accountSetup={operator.state.accountSetup}
            toolEconomics={operator.state.toolEconomics}
            partnerPerformance={operator.state.partnerPerformance}
            partnerPayoutCycles={operator.state.partnerPayoutCycles}
            partnerPayoutCycleActions={operator.partnerPayoutCycleActions}
            risks={operator.state.risks}
            events={operator.state.events}
          />
        ) : props.activeTab === "email" ? (
          <OperatorEmailPanelView
            monetization={operator.state.monetization}
            emailAuth={operator.state.emailAuth}
          />
        ) : (
          <OperatorCommunitiesPanelView
            overview={operator.state.overview}
            communities={operator.topCommunities}
          />
        )}
      </div>
    </section>
  );
}
