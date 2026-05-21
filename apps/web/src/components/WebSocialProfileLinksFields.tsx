import {
  SOCIAL_PROFILE_KINDS,
  type SocialProfileKind,
  type SocialProfileLinks,
} from "../../../../shared/socialProfileLinks";
import { SocialProfileIcon } from "./SocialProfileIcon";

type WebSocialProfileLinksFieldsProps = {
  values: SocialProfileLinks;
  disabled?: boolean;
  variant?: "onboarding" | "settings";
  onChange: (kind: SocialProfileKind, value: string) => void;
};

const SOCIAL_PROFILE_LABELS: Record<SocialProfileKind, string> = {
  youtube: "YouTube",
  x: "X",
  instagram: "Instagram",
};

const SOCIAL_PROFILE_PLACEHOLDERS: Record<SocialProfileKind, string> = {
  youtube: "youtube.com/@handle",
  x: "x.com/handle",
  instagram: "instagram.com/handle",
};

export function WebSocialProfileLinksFields({
  values,
  disabled = false,
  variant = "settings",
  onChange,
}: WebSocialProfileLinksFieldsProps) {
  return (
    <div className={`web-social-profile-links ${variant}`} aria-label="Social profile links">
      {SOCIAL_PROFILE_KINDS.map((kind) => (
        <label key={kind} className="web-social-profile-link-field">
          <span className="web-social-profile-link-icon" aria-hidden="true">
            <SocialProfileIcon kind={kind} />
          </span>
          <input
            type="url"
            aria-label={`${SOCIAL_PROFILE_LABELS[kind]} profile URL`}
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={disabled}
            placeholder={SOCIAL_PROFILE_PLACEHOLDERS[kind]}
            value={values[kind]}
            onChange={(event) => onChange(kind, event.target.value)}
          />
        </label>
      ))}
    </div>
  );
}
