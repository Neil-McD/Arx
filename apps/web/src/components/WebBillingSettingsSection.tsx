import type { BuilderFundingAction } from "../../../../shared/builderFunding";
import {
  POLYNET_BUILDER_OFFER,
  builderFundingActionLabel,
  builderFundingStateLabel,
  formatBuilderOfferPrice,
  resolveBuilderOfferPrimaryAction,
} from "../../../../shared/builderOffer";
import type {
  CloudFounderBillingCommunity,
  CloudFounderBillingOverview,
} from "../../../../shared/cloudFounderBillingGateway";
import type { PendingPurchaseClaim } from "../../../../shared/pay_first";

type SessionLike = {
  user: {
    id: string;
    email?: string | null;
  };
} | null;

export type WebBillingSettingsSectionProps = {
  session: SessionLike;
  founderBillingOverview: CloudFounderBillingOverview;
  isLoadingFounderBilling: boolean;
  founderBillingActionCommunityId: string | null;
  founderBillingError: string | null;
  openFounderBillingPortal: (communityId: string) => Promise<void> | void;
  refreshFounderBilling: () => Promise<unknown> | void;
  onOpenBuilderOffer: (community: CloudFounderBillingCommunity) => void;
  onOpenCreateCommunity: () => void;
  pendingPurchaseClaims: PendingPurchaseClaim[];
  isLoadingPendingPurchases: boolean;
  isRedeemingPendingPurchases: boolean;
  redeemPendingPurchases: () => Promise<void> | void;
  refreshPendingPurchases: () => Promise<void> | void;
  pendingPurchasesError: string | null;
  pendingPurchasesSuccess: string | null;
};

function runFundingAction(params: {
  action: BuilderFundingAction;
  community: CloudFounderBillingCommunity;
  onOpenBuilderOffer: (community: CloudFounderBillingCommunity) => void;
  openFounderBillingPortal: (communityId: string) => Promise<void> | void;
}) {
  if (params.action === "buy_builder" || params.action === "resume_checkout") {
    params.onOpenBuilderOffer(params.community);
    return;
  }
  if (params.action === "manage_builder") {
    void params.openFounderBillingPortal(params.community.community_id);
    return;
  }
}

function communityFundingStateLabel(community: CloudFounderBillingCommunity): string {
  if (community.funding_mode === "operator_comp") {
    return "Operator access included";
  }
  if (
    community.funding_state === "builder_canceling" &&
    community.current_period_end_at
  ) {
    return `Agent plan active until ${new Date(community.current_period_end_at).toLocaleDateString()}`;
  }
  return builderFundingStateLabel(community.funding_state);
}

export function WebBillingSettingsSection(props: WebBillingSettingsSectionProps) {
  const activeCommunities = props.founderBillingOverview.communities.filter(
    (community) => community.lifecycle_status === "active",
  );

  return (
    <>
      <div className="panel-title">Billing</div>
      <div className="memory-panel">
        <div className="settings-section builder-settings-section">
          <div className="builder-settings-heading">
            <div>
              <div className="settings-section-title">Builder</div>
              <div className="settings-section-desc">
                Community platform and Polynet-hosted AI.
              </div>
            </div>
            <div className="builder-settings-price">
              <strong>{formatBuilderOfferPrice()}</strong>
              <span>{POLYNET_BUILDER_OFFER.scopeLabel}</span>
            </div>
          </div>

          {props.isLoadingFounderBilling && activeCommunities.length === 0 ? (
            <div className="chat-loading">
              <div className="loading-spinner" />
              <span>Loading your Agent plan…</span>
            </div>
          ) : activeCommunities.length === 0 ? (
            <div className="builder-empty-state">
              <span>No active communities.</span>
              <button className="settings-primary-action" type="button" onClick={props.onOpenCreateCommunity}>Create community</button>
            </div>
          ) : (
            <div className="builder-community-list">
              {activeCommunities.map((community) => {
                const primaryAction = resolveBuilderOfferPrimaryAction({
                  state: community.funding_state,
                  allowedActions: community.allowed_actions,
                });
                const isActing = props.founderBillingActionCommunityId === community.community_id;
                const isOperatorComped = community.funding_mode === "operator_comp";
                return (
                  <div className="builder-community-row" key={community.community_id}>
                    <div className="builder-community-copy">
                      <span>{community.community_name}</span>
                      <strong>{communityFundingStateLabel(community)}</strong>
                      <small>
                        {community.funding_lane === "builder_included"
                          ? "Polynet-hosted community AI is included."
                          : `${formatBuilderOfferPrice(community.monthly_price_base_units)} · Polynet-hosted community AI`}
                      </small>
                    </div>
                    <div className="builder-community-actions">
                      {isOperatorComped ? null : primaryAction ? (
                        <button
                          type="button"
                          className="settings-primary-action"
                          disabled={isActing}
                          onClick={() => runFundingAction({
                            action: primaryAction,
                            community,
                            onOpenBuilderOffer: props.onOpenBuilderOffer,
                            openFounderBillingPortal: props.openFounderBillingPortal,
                          })}
                        >
                          {isActing
                            ? "Opening…"
                            : builderFundingActionLabel({
                                action: primaryAction,
                                state: community.funding_state,
                                includePrice: primaryAction === "buy_builder",
                              })}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <small className="builder-settings-disclosure">
            Paid memberships carry a {POLYNET_BUILDER_OFFER.platformFeeBps / 100}% Polynet platform fee.
            Stripe processing fees are separate.
          </small>

          {props.founderBillingError ? (
            <div className="builder-settings-retry">
              <div className="billing-settings-error">{props.founderBillingError}</div>
              <button
                type="button"
                className="secondary"
                disabled={props.isLoadingFounderBilling}
                onClick={() => void props.refreshFounderBilling()}
              >
                {props.isLoadingFounderBilling ? "Retrying…" : "Retry"}
              </button>
            </div>
          ) : null}
        </div>

        {props.session &&
        (props.isLoadingPendingPurchases ||
          props.pendingPurchaseClaims.length > 0 ||
          props.pendingPurchasesError ||
          props.pendingPurchasesSuccess) ? (
          <div className="settings-section">
            <div className="settings-section-title">Member purchase recovery</div>
            <div className="settings-section-desc">
              Recover community access if member payment completed before the join flow.
            </div>
            {props.isLoadingPendingPurchases ? (
              <div className="chat-loading">
                <div className="loading-spinner" />
                <span>Checking…</span>
              </div>
            ) : null}
            {!props.isLoadingPendingPurchases && props.pendingPurchaseClaims.length > 0 ? (
              <div className="model-list">
                {props.pendingPurchaseClaims.map((claim) => (
                  <div key={`${claim.community_id}:${claim.expires_at}`} className="model-toggle">
                    <span>{claim.community_name || claim.community_slug || claim.community_id}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {!props.isLoadingPendingPurchases &&
            props.pendingPurchaseClaims.length === 0 &&
            props.pendingPurchasesSuccess ? (
              <div className="auth-status">{props.pendingPurchasesSuccess}</div>
            ) : null}
            <div className="auth-actions">
              <button
                className="settings-primary-action"
                type="button"
                onClick={() => void props.redeemPendingPurchases()}
                disabled={
                  props.isRedeemingPendingPurchases ||
                  props.isLoadingPendingPurchases ||
                  props.pendingPurchaseClaims.length === 0
                }
              >
                {props.isRedeemingPendingPurchases ? "Claiming…" : "Claim access"}
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => void props.refreshPendingPurchases()}
                disabled={props.isRedeemingPendingPurchases || props.isLoadingPendingPurchases}
              >
                Refresh
              </button>
            </div>
            {props.pendingPurchasesError ? <div className="auth-error">{props.pendingPurchasesError}</div> : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
