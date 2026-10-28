import type {
  OperatorAccountSetupSnapshot,
  OperatorEventRecord,
  OperatorMonetizationSnapshot,
  OperatorOverviewSnapshot,
  OperatorRiskItem,
  OperatorToolEconomicsSnapshot,
} from "../../../../shared/operatorTypes";
import {
  formatAccountSetupMissing,
  formatAccountSetupStep,
  formatCredits,
  formatEventTime,
  formatMoney,
  formatOptionalCount,
  formatPercent,
  formatRiskFlag,
  formatUsdAmount,
} from "./workspaceRightPanelOperatorShared";

const OPERATOR_ACCOUNT_SETUP_STEP_ORDER = ["identity", "complete"] as const;
const OPERATOR_ACCOUNT_SETUP_MISSING_ORDER = [
  "display_name",
  "handle",
  "avatar",
  "platform_legal",
] as const;

export function OperatorBusinessPanelView(props: {
  overview: OperatorOverviewSnapshot | null;
  monetization: OperatorMonetizationSnapshot | null;
  accountSetup: OperatorAccountSetupSnapshot | null;
  toolEconomics: OperatorToolEconomicsSnapshot | null;
  risks: OperatorRiskItem[];
  events: OperatorEventRecord[];
}) {
  const businessKpis = props.monetization?.businessKpis ?? null;
  const accountSetupOverview = props.accountSetup?.overview ?? null;
  const accountSetupCompletionRate =
    accountSetupOverview && accountSetupOverview.totals.users > 0
      ? accountSetupOverview.totals.completed / accountSetupOverview.totals.users
      : null;
  const communityCheckoutConversion =
    props.monetization && props.monetization.communityCheckoutStarts > 0
      ? props.monetization.communityCheckoutCompletions / props.monetization.communityCheckoutStarts
      : null;
  const runtimeUsage = props.toolEconomics?.usageIntegrity ?? null;
  const toolEconomics = props.toolEconomics?.paidToolEconomics ?? null;
  const accountingIntegrity = props.toolEconomics?.accountingIntegrity ?? null;
  const platformRevenueMetric =
    businessKpis?.revenue.platformNetRevenueAvailability === "available"
      ? businessKpis.revenue.platformNetRevenueInRange
      : null;
  const platformRevenueNote =
    businessKpis?.revenue.platformNetRevenueAvailability === "available"
      ? "Net platform revenue in the selected window."
      : "Current platform net revenue is not instrumented; retired tool-credit sales are excluded.";
  const communityRevShareNote =
    businessKpis?.revenue.communityPlatformRevShareAvailability === "estimated_from_current_fee_policy"
      ? "Estimated Polynet share of completed community checkouts."
      : "Community fee attribution pending.";

  return (
    <div className="operator-dashboard__grid">
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
          <span>Ready users</span>
          <strong>{accountSetupOverview?.totals.completed ?? 0}</strong>
          <span className="operator-dashboard__metric-note">{formatPercent(accountSetupCompletionRate)} of real accounts ready.</span>
        </div>
        <div>
          <span>Community rev share</span>
          <strong>{formatMoney(businessKpis?.revenue.communityPlatformRevShareInRange ?? null)}</strong>
          <span className="operator-dashboard__metric-note">{communityRevShareNote}</span>
        </div>
        <div>
          <span>Historical provider cost</span>
          <strong>{formatUsdAmount(toolEconomics?.totals.vendorCostUsd)}</strong>
          <span className="operator-dashboard__metric-note">Provider cost reconstructed from the retired tool-credit ledger.</span>
        </div>
        <div>
          <span>Platform revenue</span>
          <strong>{formatMoney(platformRevenueMetric)}</strong>
          <span className="operator-dashboard__metric-note">{platformRevenueNote}</span>
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
            <span>Ready users</span>
            <strong>{accountSetupOverview?.totals.completed ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Readiness</span>
            <strong>{formatPercent(accountSetupCompletionRate)}</strong>
          </div>
          {businessKpis?.visitors.availability !== "available" ? (
            <div className="operator-dashboard__empty">Visitor analytics need first-party ingestion before conversion is available.</div>
          ) : (
            <div className="operator-dashboard__empty">Visitor count is deduped by anonymous visitor key across first-party business surfaces.</div>
          )}
        </div>
      </section>

      <OperatorAccountSetupInsights snapshot={props.accountSetup} />

      <section className="operator-dashboard__panel">
        <h2>Platform revenue</h2>
        <div className="operator-dashboard__table">
          <div className="operator-dashboard__row">
            <span>Net platform revenue</span>
            <strong>{formatMoney(platformRevenueMetric)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Active paying users</span>
            <strong>{businessKpis?.users.activePayingCustomers ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Community fee estimate</span>
            <strong>{formatMoney(businessKpis?.revenue.communityPlatformRevShareInRange ?? null)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Checkout purchasers</span>
            <strong>{businessKpis?.users.checkoutPurchasersInRange ?? 0}</strong>
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
            <div className="operator-dashboard__empty">Community subscription revenue stays in Communities until platform fee/revenue-share attribution is instrumented.</div>
          ) : null}
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Historical tool-credit liabilities</h2>
        <div className="operator-dashboard__table">
          <div className="operator-dashboard__row">
            <span>Archived top-up starts</span>
            <strong>{props.monetization?.creditTopupCheckoutStarts ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Archived top-up completions</span>
            <strong>{props.monetization?.creditTopupCheckoutCompletions ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Credits settled</span>
            <strong>{formatCredits(props.toolEconomics?.paidTools.totals.settledCredits)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Credits released</span>
            <strong>{formatCredits(props.toolEconomics?.paidTools.totals.releasedCredits)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Still reserved</span>
            <strong>{props.toolEconomics?.paidTools.totals.stillReserved ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Credit failures</span>
            <strong>{runtimeUsage?.workspaceCreditFailures ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Paid-tool failures</span>
            <strong>{runtimeUsage?.paidToolLedgerFailures ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Unbilled compute</span>
            <strong>{runtimeUsage?.unbilledComputeCharges ?? 0}</strong>
          </div>
          {props.toolEconomics?.paidTools.lanes.some((lane) => lane.reservations > 0) ? (
            props.toolEconomics.paidTools.lanes
              .filter((lane) => lane.reservations > 0)
              .slice(0, 3)
              .map((lane) => (
                <div className="operator-dashboard__row" key={lane.toolName}>
                  <div>
                    <strong>{lane.label}</strong>
                    <span>
                      {[
                        `${lane.succeeded} settled`,
                        `${lane.released} released`,
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
            <div className="operator-dashboard__empty">No historical tool-credit activity returned.</div>
          )}
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Historical tool-credit reconciliation</h2>
        <div className="operator-dashboard__table">
          <div className="operator-dashboard__row">
            <span>Health</span>
            <strong>{accountingIntegrity?.health ?? "unknown"}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Score</span>
            <strong>{accountingIntegrity?.score ?? "--"}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Balance mismatches</span>
            <strong>{accountingIntegrity?.totals.balanceMismatchUsers ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Stale reservations</span>
            <strong>{accountingIntegrity?.totals.staleReservations ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Settlement retries due</span>
            <strong>{accountingIntegrity?.totals.pendingSettlementsDue ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Coverage gaps</span>
            <strong>{accountingIntegrity?.totals.reconciliationCoverageGaps ?? 0}</strong>
          </div>
          {accountingIntegrity?.issues.length ? (
            accountingIntegrity.issues.slice(0, 4).map((issue, index) => (
              <div className="operator-dashboard__row" key={`${issue.kind}:${issue.creditKey ?? issue.userId ?? index}`}>
                <div>
                  <strong>{issue.label}</strong>
                  <span>
                    {[
                      issue.kind.replaceAll("_", " "),
                      issue.userId ? `user ${issue.userId.slice(0, 8)}` : null,
                      issue.creditKey ? issue.creditKey.slice(0, 18) : null,
                      issue.latestAt ? formatEventTime(issue.latestAt) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <span>{issue.severity}</span>
              </div>
            ))
          ) : (
            <div className="operator-dashboard__empty">No sampled historical credit-liability issues returned.</div>
          )}
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Historical tool-credit cost evidence</h2>
        <div className="operator-dashboard__table">
          <div className="operator-dashboard__row">
            <span>Archived ledger price</span>
            <strong>{formatUsdAmount(toolEconomics?.totals.revenueUsd)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Vendor cost</span>
            <strong>{formatUsdAmount(toolEconomics?.totals.vendorCostUsd)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Historical gross margin</span>
            <strong>{formatPercent(toolEconomics?.totals.grossMarginRate ?? null)}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Cost evidence</span>
            <strong>{formatPercent(toolEconomics?.totals.costEvidenceCoverage ?? null)}</strong>
          </div>
          {props.toolEconomics?.evidence.isTruncated ? (
            <div className="operator-dashboard__empty">Tool economics are sampled for this window.</div>
          ) : null}
          {toolEconomics?.lanes.some((lane) => lane.settledRows > 0) ? (
            toolEconomics.lanes
              .filter((lane) => lane.settledRows > 0)
              .slice(0, 3)
              .map((lane) => (
                <div className="operator-dashboard__row" key={lane.toolName}>
                  <div>
                    <strong>{lane.label}</strong>
                    <span>
                      {[
                        `${lane.settledRows} settled`,
                        formatUsdAmount(lane.revenueUsd),
                        `${formatPercent(lane.grossMarginRate)} margin`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  <span>{lane.missingCostRows > 0 ? `${lane.missingCostRows} missing cost` : "ok"}</span>
                </div>
              ))
          ) : (
            <div className="operator-dashboard__empty">No settled historical tool-credit rows returned.</div>
          )}
          <div className="operator-dashboard__empty">Audit evidence only; this product is retired.</div>
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
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Creator activation</h2>
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
            <span>Communities created</span>
            <strong>{businessKpis?.communities.createdInRange ?? 0}</strong>
          </div>
          <div className="operator-dashboard__row">
            <span>User to community creation</span>
            <strong>{formatPercent(businessKpis?.communities.creationRateFromNewUsers ?? null)}</strong>
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
            <span>Paid community activation</span>
            <strong>{formatPercent(businessKpis?.communities.paidCommunityMemberActivationRate ?? null)}</strong>
          </div>
          <div className="operator-dashboard__empty">Community revenue details live in Communities; activation here is only the business funnel checkpoint.</div>
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
  const users = (userList?.rows ?? []).slice(0, 5);
  const returnedUserCount = userList?.rows.length ?? 0;
  const isLocallyTrimmed = returnedUserCount > users.length;
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
    <>
      <div className="operator-dashboard__section-heading" aria-label="User readiness">
        <h2>User readiness</h2>
        <p>Profile and provider readiness across real users.</p>
      </div>

      <section className="operator-dashboard__metrics" aria-label="User readiness overview">
        <div>
          <span>Total users</span>
          <strong>{overview?.totals.users ?? 0}</strong>
          <span className="operator-dashboard__metric-note">Real account records.</span>
        </div>
        <div>
          <span>Ready</span>
          <strong>{overview?.totals.completed ?? 0}</strong>
          <span className="operator-dashboard__metric-note">{formatPercent(setupCompletionRate)} ready.</span>
        </div>
        <div>
          <span>Need setup</span>
          <strong>{overview?.totals.incomplete ?? 0}</strong>
          <span className="operator-dashboard__metric-note">Users missing readiness fields.</span>
        </div>
        <div>
          <span>Average readiness</span>
          <strong>{overview?.totals.averagePercent ?? 0}%</strong>
          <span className="operator-dashboard__metric-note">Mean readiness across users.</span>
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Current blocker</h2>
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
            <div className="operator-dashboard__empty">No missing readiness fields returned.</div>
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

      <section className="operator-dashboard__panel">
        <h2>Readiness queue</h2>
        <div className="operator-dashboard__table">
          {userList && userList.totalMatching > 0 ? (
            <div className="operator-dashboard__empty">
              {showingLabel}
              {isLocallyTrimmed ? " in this compact view." : "."}
            </div>
          ) : null}
          {users.length === 0 ? (
            <div className="operator-dashboard__empty">No users needing readiness work returned.</div>
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
                    <div className="operator-dashboard__chips" aria-label="Missing readiness fields">
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
    </>
  );
}
