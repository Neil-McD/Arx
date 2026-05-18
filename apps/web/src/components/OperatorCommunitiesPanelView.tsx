import type { OperatorCommunityRecord, OperatorOverviewSnapshot } from "../../../../shared/operatorTypes";
import {
  formatEntryPolicy,
  formatMoney,
  formatOptionalCount,
  formatPayoutStatus,
  formatPercent,
  formatRiskFlag,
  formatVisibility,
} from "./workspaceRightPanelOperatorShared";

export function OperatorCommunitiesPanelView(props: {
  overview: OperatorOverviewSnapshot | null;
  communities: OperatorCommunityRecord[];
}) {
  const totals = props.overview?.totals;
  return (
    <div className="workspace-right-panel__grid">
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
