import {
  POLYNET_BUILDER_OFFER,
  formatBuilderOfferPrice,
} from "../../../../shared/builderOffer";

type WebBuilderOfferSummaryProps = {
  communityName?: string | null;
  compact?: boolean;
  purpose?: "activate" | "purchase" | "restore";
};

export function WebBuilderOfferSummary(props: WebBuilderOfferSummaryProps) {
  return (
    <section className={`builder-offer-summary${props.compact ? " is-compact" : ""}`}>
      <div className="builder-offer-kicker">
        <span>{POLYNET_BUILDER_OFFER.name}</span>
        <span>One community</span>
      </div>
      <h2>
        {props.purpose === "purchase"
          ? POLYNET_BUILDER_OFFER.purchaseHeadline
          : props.communityName && props.purpose === "restore"
          ? `Restore ${props.communityName}`
          : props.communityName
          ? `Activate Builder for ${props.communityName}`
          : POLYNET_BUILDER_OFFER.headline}
      </h2>
      <p>
        {props.purpose === "purchase"
          ? POLYNET_BUILDER_OFFER.purchaseDescription
          : props.purpose === "restore"
          ? "Builder restores this community, its member experience, and its preserved content."
          : POLYNET_BUILDER_OFFER.description}
      </p>
      <div className="builder-offer-benefits">
        {POLYNET_BUILDER_OFFER.benefits.map((benefit) => (
          <div className="builder-offer-benefit" key={benefit.title}>
            <span aria-hidden="true">✓</span>
            <div>
              <strong>{benefit.title}</strong>
              {props.compact ? null : <small>{benefit.description}</small>}
            </div>
          </div>
        ))}
      </div>
      <div className="builder-offer-price">
        <strong>{formatBuilderOfferPrice()}</strong>
        <span>{POLYNET_BUILDER_OFFER.scopeLabel}</span>
      </div>
      {props.compact ? null : (
        <small className="builder-offer-disclosure">
          Paid memberships carry a {POLYNET_BUILDER_OFFER.platformFeeBps / 100}% Polynet platform fee.
          Stripe processing fees are separate.
        </small>
      )}
    </section>
  );
}
