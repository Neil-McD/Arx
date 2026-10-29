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

  // Laid out like the rest of Settings (Substack's admin): one card per
  // subject, a row per community with its action on the right.
  return (
    <>
      <section className="settings-section pn-settings-card pn-billing-card" aria-label="Builder">
        <header className="pn-settings-card-header is-row">
          <div>
            <h2 className="settings-section-title">Builder</h2>
            <p className="settings-section-desc">Community platform and Polynet-hosted AI.</p>
          </div>
          <div className="pn-billing-price">
            <strong>{formatBuilderOfferPrice()}</strong>
            <span>{POLYNET_BUILDER_OFFER.scopeLabel}</span>
          </div>
        </header>

        <div className="pn-settings-card-body">
          {props.isLoadingFounderBilling && activeCommunities.length === 0 ? (
            <div className="pn-settings-loading" role="status">
              <span className="pn-settings-spinner" aria-hidden="true" />
              Loading your Agent plan…
            </div>
          ) : activeCommunities.length === 0 ? (
            <div className="pn-settings-row">
              <div className="pn-settings-row-head">
                <div className="pn-settings-row-text">
                  <span className="pn-settings-label">No active communities</span>
                  <span className="pn-settings-help">Builder is billed per community. Create one to start.</span>
                </div>
                <div className="pn-settings-row-control">
                  <button className="pn-settings-button is-primary" type="button" onClick={props.onOpenCreateCommunity}>Create community</button>
                </div>
              </div>
            </div>
          ) : (
            activeCommunities.map((community) => {
              const primaryAction = resolveBuilderOfferPrimaryAction({
                state: community.funding_state,
                allowedActions: community.allowed_actions,
              });
              const isActing = props.founderBillingActionCommunityId === community.community_id;
              const isOperatorComped = community.funding_mode === "operator_comp";
              return (
                <div className="pn-settings-row pn-billing-community" key={community.community_id}>
                  <div className="pn-settings-row-head">
                    <span className="pn-billing-avatar" aria-hidden="true">
                      {community.community_name.trim().charAt(0).toUpperCase() || "·"}
                    </span>
                    <div className="pn-settings-row-text">
                      <span className="pn-settings-label">
                        {community.community_name}
                        <span className="pn-settings-badge">{communityFundingStateLabel(community)}</span>
                      </span>
                      <span className="pn-settings-help">
                        {community.funding_lane === "builder_included"
                          ? "Polynet-hosted community AI is included."
                          : `${formatBuilderOfferPrice(community.monthly_price_base_units)} · Polynet-hosted community AI`}
                      </span>
                    </div>
                    <div className="pn-settings-row-control">
                      {isOperatorComped ? null : primaryAction ? (
                        <button
                          type="button"
                          className={`pn-settings-button${primaryAction === "manage_builder" ? "" : " is-primary"}`}
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
                </div>
              );
            })
          )}

          {props.founderBillingError ? (
            <div className="pn-settings-row">
              <div className="pn-settings-row-head">
                <p className="pn-settings-inline-error" role="alert">{props.founderBillingError}</p>
                <div className="pn-settings-row-control">
                  <button
                    type="button"
                    className="pn-settings-button"
                    disabled={props.isLoadingFounderBilling}
                    onClick={() => void props.refreshFounderBilling()}
                  >
                    {props.isLoadingFounderBilling ? "Retrying…" : "Retry"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <p className="pn-settings-note pn-billing-disclosure">
          Paid memberships carry a {POLYNET_BUILDER_OFFER.platformFeeBps / 100}% Polynet platform fee.
          Stripe processing fees are separate.
        </p>
      </section>

      {props.session &&
      (props.isLoadingPendingPurchases ||
        props.pendingPurchaseClaims.length > 0 ||
        props.pendingPurchasesError ||
        props.pendingPurchasesSuccess) ? (
        <section className="settings-section pn-settings-card pn-billing-card" aria-label="Member purchase recovery">
          <header className="pn-settings-card-header">
            <h2 className="settings-section-title">Member purchase recovery</h2>
            <p className="settings-section-desc">
              Recover community access if member payment completed before the join flow.
            </p>
          </header>
          <div className="pn-settings-card-body">
            {props.isLoadingPendingPurchases ? (
              <div className="pn-settings-loading" role="status">
                <span className="pn-settings-spinner" aria-hidden="true" />
                Checking…
              </div>
            ) : null}
            {!props.isLoadingPendingPurchases
              ? props.pendingPurchaseClaims.map((claim) => (
                  <div key={`${claim.community_id}:${claim.expires_at}`} className="pn-settings-row">
                    <span className="pn-settings-label">{claim.community_name || claim.community_slug || claim.community_id}</span>
                  </div>
                ))
              : null}
            {!props.isLoadingPendingPurchases &&
            props.pendingPurchaseClaims.length === 0 &&
            props.pendingPurchasesSuccess ? (
              <p className="pn-settings-note" role="status">{props.pendingPurchasesSuccess}</p>
            ) : null}
            {props.pendingPurchasesError ? (
              <p className="pn-settings-inline-error pn-billing-recovery-error" role="alert">{props.pendingPurchasesError}</p>
            ) : null}
          </div>
          <div className="pn-settings-card-footer pn-billing-actions">
            <button
              className="pn-settings-button"
              type="button"
              onClick={() => void props.refreshPendingPurchases()}
              disabled={props.isRedeemingPendingPurchases || props.isLoadingPendingPurchases}
            >
              Refresh
            </button>
            <button
              className="pn-settings-button is-primary"
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
          </div>
        </section>
      ) : null}
    </>
  );
}
