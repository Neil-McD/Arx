import type { CloudFounderBillingCommunity } from "../../../../shared/cloudFounderBillingGateway";

type WebFounderFundingPromptProps = {
  isOpen: boolean;
  communities: CloudFounderBillingCommunity[];
  actionCommunityId: string | null;
  error: string | null;
  onCheckout: (communityId: string) => Promise<unknown> | void;
  onManage: (communityId: string) => Promise<unknown> | void;
  onClose: () => void;
};

function actionLabel(community: CloudFounderBillingCommunity, acting: boolean): string {
  if (acting) return "Opening…";
  if (community.status === "past_due") return "Fix payment";
  if (community.status === "managed_checkout_pending") return "Resume checkout";
  return "Fund for $79/month";
}

export function WebFounderFundingPrompt(props: WebFounderFundingPromptProps) {
  if (!props.isOpen || props.communities.length === 0) return null;

  return (
    <div className="modal-overlay" onClick={props.onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Fund your community</div>
            <div className="create-community-subtitle">
              Each community is $79/month.
            </div>
          </div>
          <button className="modal-close" onClick={props.onClose} title="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="model-list">
            {props.communities.map((community) => {
              const acting = props.actionCommunityId === community.community_id;
              const manageExisting = community.status === "past_due";
              return (
                <div className="account-row" key={community.community_id}>
                  <div className="account-identity">
                    <span>{community.community_name}</span>
                    <small>$79/month · one subscription for this community</small>
                  </div>
                  <div className="auth-actions">
                    <button
                      type="button"
                      disabled={acting}
                      onClick={() => void (manageExisting
                        ? props.onManage(community.community_id)
                        : props.onCheckout(community.community_id))}
                    >
                      {actionLabel(community, acting)}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {props.error ? <div className="billing-settings-error">{props.error}</div> : null}
        </div>
        <div className="modal-footer">
          <button className="create-community-secondary" type="button" onClick={props.onClose}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
