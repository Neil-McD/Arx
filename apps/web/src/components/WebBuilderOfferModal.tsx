import type { BuilderFundingAction } from "../../../../shared/builderFunding";
import {
  builderFundingActionLabel,
  formatBuilderOfferPrice,
  resolveBuilderOfferPrimaryAction,
} from "../../../../shared/builderOffer";
import type { CloudFounderBillingCommunity } from "../../../../shared/cloudFounderBillingGateway";
import { WebBuilderOfferSummary } from "./WebBuilderOfferSummary";

export type WebBuilderOfferModalProps = {
  community: CloudFounderBillingCommunity | null;
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (action: BuilderFundingAction) => Promise<void> | void;
};

export function WebBuilderOfferModal(props: WebBuilderOfferModalProps) {
  if (!props.community) return null;
  const primaryAction = resolveBuilderOfferPrimaryAction({
    state: props.community.funding_state,
    allowedActions: props.community.allowed_actions,
  });
  if (!primaryAction) return null;

  return (
    <div className="modal-overlay builder-offer-overlay" onClick={props.onClose}>
      <div
        className="modal builder-offer-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="builder-offer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="modal-close builder-offer-close" onClick={props.onClose} title="Close">
          ×
        </button>
        <div id="builder-offer-title">
          <WebBuilderOfferSummary
            communityName={props.community.community_name}
            purpose={props.community.lifecycle_status === "archived" ? "restore" : "activate"}
          />
        </div>
        {props.error ? <div className="auth-error builder-offer-error">{props.error}</div> : null}
        <div className="builder-offer-actions">
          <button
            className="builder-offer-primary"
            type="button"
            disabled={props.isSubmitting}
            onClick={() => void props.onConfirm(primaryAction)}
          >
            {props.isSubmitting
              ? "Opening…"
              : props.community.lifecycle_status === "archived"
                ? primaryAction === "resume_checkout"
                  ? "Resume checkout"
                  : `Restore community — ${formatBuilderOfferPrice(props.community.monthly_price_base_units)}`
              : builderFundingActionLabel({
                  action: primaryAction,
                  state: props.community.funding_state,
                  includePrice: primaryAction === "buy_builder",
                })}
          </button>
        </div>
      </div>
    </div>
  );
}
