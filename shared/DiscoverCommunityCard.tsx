import type { KeyboardEvent } from "react";
import { communityInitials } from "./messageMetadataUi";

type DiscoverCommunityCardProps = {
  name: string;
  slug?: string | null;
  description: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  priceLabel: string;
  visibilityClass?: string | null;
  visibilityLabel: string;
  isPublishedVisibility: boolean;
  clickable?: boolean;
  ariaLabel?: string;
  onActivate?: () => void;
};

export function DiscoverCommunityCard({
  name,
  slug,
  description,
  avatarUrl,
  bannerUrl,
  priceLabel,
  visibilityClass,
  visibilityLabel,
  isPublishedVisibility,
  clickable = false,
  ariaLabel,
  onActivate,
}: DiscoverCommunityCardProps) {
  const handleActivate = () => {
    if (!clickable || !onActivate) return;
    onActivate();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!clickable || !onActivate) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onActivate();
  };

  return (
    <div
      className={`discover-card${clickable ? " clickable" : ""}`}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : -1}
      aria-label={clickable ? ariaLabel : undefined}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
    >
      <div className="discover-card-banner">
        {bannerUrl ? (
          <img className="discover-card-banner-img" src={bannerUrl} alt="" loading="lazy" decoding="async" />
        ) : null}
      </div>
      <div className="discover-card-body">
        <div className="discover-card-header">
          {avatarUrl ? (
            <img className="discover-card-avatar" src={avatarUrl} alt={name} loading="lazy" />
          ) : (
            <div className="discover-card-avatar fallback">{communityInitials(name)}</div>
          )}
          <div className="discover-card-meta">
            <div className="discover-card-name-row">
              <div className="discover-card-name">{name}</div>
              <span className="discover-tag price">{priceLabel}</span>
              <span className={`discover-visibility-icon ${visibilityClass ?? "unlisted"}`} title={visibilityLabel}>
                {isPublishedVisibility ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                )}
              </span>
            </div>
            {slug ? <div className="discover-card-slug">/{slug}</div> : null}
          </div>
        </div>
        <div className="discover-card-desc">{description}</div>
      </div>
    </div>
  );
}
