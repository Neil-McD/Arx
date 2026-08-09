import { useEffect, useRef } from "react";

import {
  POLYNET_BUILDER_OFFER,
  formatBuilderOfferPrice,
} from "../../../../shared/builderOffer";
import type { PublicBuilderCheckoutStatus } from "../controllers/useWebPublicBuilderCheckoutController";
import { WebBuilderOfferSummary } from "./WebBuilderOfferSummary";

export type WebBuilderPurchaseModalProps = {
  isOpen: boolean;
  accessMode: "purchase" | "operator_included";
  status: PublicBuilderCheckoutStatus;
  error: string | null;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
};

function primaryLabel(props: WebBuilderPurchaseModalProps): string {
  if (props.status === "starting_checkout") return "Opening secure checkout…";
  if (props.accessMode === "operator_included") {
    return "Continue — included with operator access";
  }
  return `Buy Builder — ${formatBuilderOfferPrice()}`;
}

export function WebBuilderPurchaseModal(props: WebBuilderPurchaseModalProps) {
  const primaryActionRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(props.onClose);
  onCloseRef.current = props.onClose;

  useEffect(() => {
    if (!props.isOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || props.status === "starting_checkout") return;
      onCloseRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => primaryActionRef.current?.focus());
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [props.isOpen, props.status]);

  if (!props.isOpen) return null;
  const isSubmitting = props.status === "starting_checkout";

  return (
    <div
      className="modal-overlay builder-offer-overlay"
      onClick={() => {
        if (!isSubmitting) props.onClose();
      }}
    >
      <div
        className="modal builder-offer-modal builder-purchase-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="builder-purchase-title"
        aria-describedby="builder-purchase-note"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="modal-close builder-offer-close"
          onClick={props.onClose}
          title="Close"
          aria-label="Close Builder offer"
          disabled={isSubmitting}
        >
          ×
        </button>
        <div id="builder-purchase-title">
          <WebBuilderOfferSummary compact purpose="purchase" />
        </div>
        {props.error ? (
          <div className="auth-error builder-offer-error" role="alert">
            {props.error}
          </div>
        ) : null}
        <div className="builder-offer-actions">
          <button
            ref={primaryActionRef}
            className="builder-offer-primary"
            type="button"
            disabled={isSubmitting}
            onClick={() => void props.onConfirm()}
          >
            {primaryLabel(props)}
          </button>
        </div>
        <p className="builder-purchase-note" id="builder-purchase-note">
          {props.accessMode === "purchase"
            ? POLYNET_BUILDER_OFFER.purchaseNote
            : "Your access is already available. Community setup comes next."}
        </p>
      </div>
    </div>
  );
}
