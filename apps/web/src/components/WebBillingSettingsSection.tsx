import type {
  CloudFounderBillingCommunity,
  CloudFounderBillingOverview,
} from "../../../../shared/cloudFounderBillingGateway";
import type { PendingPurchaseClaim } from "../../../../shared/pay_first";

function formatUsdBaseUnits(value: number): string {
  return `$${(Math.max(0, value) / 100).toFixed(0)}`;
}

function founderBillingStatusLabel(community: CloudFounderBillingCommunity): string {
  switch (community.status) {
    case "operator_comped":
      return "Operator access included";
    case "legacy_active":
      return "Legacy API key active";
    case "legacy_ready":
      return "Legacy API key available";
    case "legacy_suspended":
      return "Legacy API key suspended";
    case "managed_checkout_pending":
      return "Payment processing";
    case "managed_required":
      return "Managed plan required";
    case "cancel_at_period_end":
      return "Active · cancels at period end";
    case "past_due":
      return "Payment past due";
    case "canceled":
    case "ended":
      return "Subscription ended";
    case "active":
      return "Managed plan active";
  }
}

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
  startFounderSubscriptionCheckout: (communityId: string) => Promise<void> | void;
  openFounderBillingPortal: (communityId: string) => Promise<void> | void;
  refreshFounderBilling: () => Promise<unknown> | void;
  pendingPurchaseClaims: PendingPurchaseClaim[];
  isLoadingPendingPurchases: boolean;
  isRedeemingPendingPurchases: boolean;
  redeemPendingPurchases: () => Promise<void> | void;
  refreshPendingPurchases: () => Promise<void> | void;
  pendingPurchasesError: string | null;
  pendingPurchasesSuccess: string | null;
};

export function WebBillingSettingsSection(
  props: WebBillingSettingsSectionProps,
) {
  return (
    <>
      <div className="panel-title">Billing</div>
      <div className="memory-panel">
        <div className="settings-section">
          <div className="settings-section-title">Community funding</div>
          <div className="settings-section-desc">
            Each managed community is {formatUsdBaseUnits(props.founderBillingOverview.monthly_price_base_units)}/month,
            includes Polynet-hosted inference, and uses a 2.9% Polynet platform fee.
            Legacy communities may keep owner-funded API access with the same 2.9% fee.
          </div>
          {props.isLoadingFounderBilling && props.founderBillingOverview.communities.length === 0 ? (
            <div className="chat-loading">
              <div className="loading-spinner" />
              <span>Loading community billing…</span>
            </div>
          ) : props.founderBillingOverview.communities.length === 0 ? (
            <div className="auth-status">No communities owned by this account.</div>
          ) : (
            <div className="model-list">
              {props.founderBillingOverview.communities.map((community) => {
                const isActing =
                  props.founderBillingActionCommunityId === community.community_id;
                const isOperatorComped = community.funding_mode === "operator_comp";
                const canManage =
                  Boolean(community.subscription_id) &&
                  community.status !== "canceled" &&
                  community.status !== "ended";
                const isPending = community.status === "managed_checkout_pending";
                return (
                  <div className="account-row" key={community.community_id}>
                    <div className="account-identity">
                      <span>{community.community_name}</span>
                      <strong>{founderBillingStatusLabel(community)}</strong>
                      <small>
                        {isOperatorComped
                          ? `Included · Polynet-hosted inference · ${community.platform_fee_bps / 100}% fee`
                          : community.funding_mode === "managed"
                          ? `${formatUsdBaseUnits(community.monthly_price_base_units)}/month · Polynet-hosted inference · ${community.platform_fee_bps / 100}% fee`
                          : `Owner API key · ${community.platform_fee_bps / 100}% fee`}
                      </small>
                    </div>
                    <div className="auth-actions">
                      {canManage ? (
                        <button
                          type="button"
                          className="secondary"
                          disabled={isActing}
                          onClick={() => void props.openFounderBillingPortal(community.community_id)}
                        >
                          {isActing ? "Opening…" : "Manage in Stripe"}
                        </button>
                      ) : isOperatorComped ? null : (
                        <button
                          type="button"
                          disabled={isActing}
                          onClick={() => void props.startFounderSubscriptionCheckout(community.community_id)}
                        >
                          {isPending
                            ? "Resume checkout"
                            : isActing
                              ? "Opening…"
                              : community.funding_mode === "legacy_byok"
                                ? "Switch to managed · $79/month"
                                : "Fund community · $79/month"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="auth-actions">
            <button
              type="button"
              className="secondary"
              disabled={props.isLoadingFounderBilling}
              onClick={() => void props.refreshFounderBilling()}
            >
              {props.isLoadingFounderBilling ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          {props.founderBillingError ? (
            <div className="billing-settings-error">{props.founderBillingError}</div>
          ) : null}
        </div>

        {props.session &&
        (props.isLoadingPendingPurchases ||
          props.pendingPurchaseClaims.length > 0 ||
          props.pendingPurchasesError ||
          props.pendingPurchasesSuccess) ? (
          <div className="settings-section">
            <div className="settings-section-title">Pending purchases</div>
            <div className="settings-section-desc">
              Recover access if payment completed before the join flow.
            </div>
            {props.isLoadingPendingPurchases ? (
              <div className="chat-loading">
                <div className="loading-spinner" />
                <span>Checking…</span>
              </div>
            ) : null}
            {!props.isLoadingPendingPurchases &&
            props.pendingPurchaseClaims.length > 0 ? (
              <div className="model-list">
                {props.pendingPurchaseClaims.map((claim) => (
                  <div
                    key={`${claim.community_id}:${claim.expires_at}`}
                    className="model-toggle"
                  >
                    <span>
                      {claim.community_name ||
                        claim.community_slug ||
                        claim.community_id}
                    </span>
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
                {props.isRedeemingPendingPurchases
                  ? "Claiming…"
                  : "Claim access"}
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => void props.refreshPendingPurchases()}
                disabled={
                  props.isRedeemingPendingPurchases ||
                  props.isLoadingPendingPurchases
                }
              >
                Refresh
              </button>
            </div>
            {props.pendingPurchasesError ? (
              <div className="auth-error">{props.pendingPurchasesError}</div>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
