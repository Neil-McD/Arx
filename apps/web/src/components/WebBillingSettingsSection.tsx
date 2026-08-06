import type { BuilderFundingAction } from "../../../../shared/builderFunding";
import {
  POLYNET_BUILDER_OFFER,
  builderFundingActionLabel,
  builderFundingStateLabel,
  formatBuilderOfferPrice,
  resolveBuilderOfferPrimaryAction,
  resolveBuilderOfferSecondaryAction,
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
  retryCommunityArchive: (communityId: string) => Promise<void> | void;
  restoreOperatorCommunity: (
    communityId: string,
    lifecycleGeneration: number,
  ) => Promise<void> | void;
  onOpenBuilderOffer: (community: CloudFounderBillingCommunity) => void;
  onOpenLegacyFunding: () => void;
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
  onOpenLegacyFunding: () => void;
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
  params.onOpenLegacyFunding();
}

function communityFundingStateLabel(community: CloudFounderBillingCommunity): string {
  if (community.lifecycle_status === "archived") {
    if (community.archive_billing_cleanup_status === "blocked") {
      return "Archive cleanup needs attention";
    }
    if (community.archive_billing_cleanup_status !== "complete") {
      return "Finishing archive";
    }
    return "Community archived";
  }
  if (community.funding_mode === "operator_comp") {
    return "Operator access included";
  }
  if (
    community.funding_state === "builder_canceling" &&
    community.current_period_end_at
  ) {
    return `Builder active until ${new Date(community.current_period_end_at).toLocaleDateString()}`;
  }
  return builderFundingStateLabel(community.funding_state);
}

export function WebBillingSettingsSection(props: WebBillingSettingsSectionProps) {
  return (
    <>
      <div className="panel-title">Billing</div>
      <div className="memory-panel">
        <div className="settings-section builder-settings-section">
          <div className="builder-settings-heading">
            <div>
              <div className="settings-section-title">Builder</div>
              <div className="settings-section-desc">
                {formatBuilderOfferPrice()} for each community. Builder activates Polynet-hosted community AI.
              </div>
            </div>
            <div className="builder-settings-price">
              <strong>{formatBuilderOfferPrice()}</strong>
              <span>{POLYNET_BUILDER_OFFER.scopeLabel}</span>
            </div>
          </div>

          {props.isLoadingFounderBilling && props.founderBillingOverview.communities.length === 0 ? (
            <div className="chat-loading">
              <div className="loading-spinner" />
              <span>Loading Builder…</span>
            </div>
          ) : props.founderBillingOverview.communities.length === 0 ? (
            <div className="builder-empty-state">
              <span>No communities yet.</span>
              <button type="button" onClick={props.onOpenCreateCommunity}>Create community</button>
            </div>
          ) : (
            <div className="builder-community-list">
              {props.founderBillingOverview.communities.map((community) => {
                const primaryAction = resolveBuilderOfferPrimaryAction({
                  state: community.funding_state,
                  allowedActions: community.allowed_actions,
                });
                const secondaryAction = resolveBuilderOfferSecondaryAction({
                  primaryAction,
                  allowedActions: community.allowed_actions,
                });
                const isActing = props.founderBillingActionCommunityId === community.community_id;
                const isOperatorComped = community.funding_mode === "operator_comp";
                const isArchived = community.lifecycle_status === "archived";
                const archiveCleanupStatus = community.archive_billing_cleanup_status;
                return (
                  <div className="builder-community-row" key={community.community_id}>
                    <div className="builder-community-copy">
                      <span>{community.community_name}</span>
                      <strong>{communityFundingStateLabel(community)}</strong>
                      <small>
                        {isArchived
                          ? archiveCleanupStatus === "complete"
                            ? "Content and settings are preserved while this community is frozen."
                            : archiveCleanupStatus === "blocked"
                              ? "Payments remain stopped. Retry the cleanup before restoring."
                              : "Stopping payments and freezing community access."
                          : community.funding_lane === "builder_included"
                          ? "Polynet-hosted community AI is included."
                          : community.funding_lane === "legacy_choice" && community.funding_state === "legacy_api_active"
                            ? "Community AI is funded by your connected API key."
                            : `${formatBuilderOfferPrice(community.monthly_price_base_units)} · Polynet-hosted community AI`}
                      </small>
                    </div>
                    <div className="builder-community-actions">
                      {isArchived ? (
                        archiveCleanupStatus === "blocked" ? (
                          <button
                            className="secondary"
                            type="button"
                            disabled={isActing}
                            onClick={() => void props.retryCommunityArchive(community.community_id)}
                          >
                            {isActing ? "Retrying…" : "Retry cleanup"}
                          </button>
                        ) : archiveCleanupStatus === "complete" ? (
                          isOperatorComped ? (
                            <button
                              type="button"
                              disabled={isActing}
                              onClick={() => void props.restoreOperatorCommunity(
                                community.community_id,
                                community.lifecycle_generation,
                              )}
                            >
                              {isActing ? "Restoring…" : "Restore community"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={isActing}
                              onClick={() => props.onOpenBuilderOffer(community)}
                            >
                              {isActing
                                ? "Opening…"
                                : `Restore community — ${formatBuilderOfferPrice(community.monthly_price_base_units)}`}
                            </button>
                          )
                        ) : (
                          <button className="secondary" type="button" disabled>
                            Finishing archive…
                          </button>
                        )
                      ) : isOperatorComped ? null : secondaryAction ? (
                        <button
                          className="secondary"
                          type="button"
                          onClick={() => runFundingAction({
                            action: secondaryAction,
                            community,
                            onOpenBuilderOffer: props.onOpenBuilderOffer,
                            onOpenLegacyFunding: props.onOpenLegacyFunding,
                            openFounderBillingPortal: props.openFounderBillingPortal,
                          })}
                        >
                          {builderFundingActionLabel({
                            action: secondaryAction,
                            state: community.funding_state,
                          })}
                        </button>
                      ) : null}
                      {isArchived || isOperatorComped ? null : primaryAction ? (
                        <button
                          type="button"
                          className={primaryAction === "manage_builder" ? "secondary" : undefined}
                          disabled={isActing}
                          onClick={() => runFundingAction({
                            action: primaryAction,
                            community,
                            onOpenBuilderOffer: props.onOpenBuilderOffer,
                            onOpenLegacyFunding: props.onOpenLegacyFunding,
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
