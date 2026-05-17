import type { CSSProperties } from "react";
import { STRIPE_CONNECT_COUNTRIES } from "../../../../shared/stripeConnectCountries";

type StripeConnectCountrySelectProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  style?: CSSProperties;
  hint?: string;
};

export function StripeConnectCountrySelect(props: StripeConnectCountrySelectProps) {
  return (
    <label className="create-community-field" style={props.style}>
      <span>Payout country</span>
      <select
        className="select-styled"
        value={props.value}
        disabled={props.disabled === true}
        onChange={(event) => props.onChange(event.target.value)}
      >
        <option value="">Select country</option>
        {STRIPE_CONNECT_COUNTRIES.map((country) => (
          <option key={country.code} value={country.code}>
            {country.name}
          </option>
        ))}
      </select>
      <span className="create-community-hint">
        {props.hint ?? "Where your business is legally based."}
      </span>
    </label>
  );
}
