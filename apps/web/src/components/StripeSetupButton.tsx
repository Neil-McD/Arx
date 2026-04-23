import { StripeWordmark } from "./StripeWordmark";

type StripeSetupButtonProps = {
  label: string;
  disabled?: boolean;
  onClick: () => void;
};

export function StripeSetupButton({ label, disabled = false, onClick }: StripeSetupButtonProps) {
  return (
    <button
      type="button"
      className="stripe-setup-button"
      onClick={onClick}
      disabled={disabled}
    >
      <StripeWordmark className="stripe-setup-button-wordmark" />
      <span>{label}</span>
    </button>
  );
}
