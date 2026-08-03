import type { KeyboardEvent } from "react";
import { CommunityAvatar } from "./CommunityAvatar";
import { StableFramedMedia } from "./StableFramedMedia";
import type { CommunityVisualIdentity } from "./communityVisualIdentity";
import { useCommunityVisualIdentity } from "./CommunityVisualIdentityRegistry";

type DiscoverCommunityCardProps = {
  communityId?: string | null;
  visualIdentity?: CommunityVisualIdentity | null;
  name: string;
  slug?: string | null;
  oneLiner: string;
  avatarUrl?: string | null;
  avatarFocusX?: number | null;
  avatarFocusY?: number | null;
  avatarZoom?: number | null;
  bannerUrl?: string | null;
  bannerFocusX?: number | null;
  bannerFocusY?: number | null;
  bannerZoom?: number | null;
  priceLabel: string;
  clickable?: boolean;
  ariaLabel?: string;
  onActivate?: () => void;
};

function renderDiscoverPriceLabel(priceLabel: string) {
  const trimmed = priceLabel.trim();
  const paidPriceMatch = trimmed.match(/^(.+?)\/(month|monthly|mo|year|annual|yr)$/i);
  if (paidPriceMatch) {
    const amount = paidPriceMatch[1]?.trim() ?? trimmed;
    const rawPeriod = paidPriceMatch[2]?.toLowerCase() ?? "";
    const period = rawPeriod === "year" || rawPeriod === "annual" || rawPeriod === "yr" ? "/yr" : "/mo";
    return (
      <>
        <span className="discover-price-amount">{amount}</span>
        <span className="discover-price-period">{period}</span>
      </>
    );
  }
  return <span className="discover-price-free">{trimmed}</span>;
}

export function DiscoverCommunityCard({
  name,
  communityId,
  visualIdentity,
  slug,
  oneLiner,
  avatarUrl,
  avatarFocusX,
  avatarFocusY,
  avatarZoom,
  bannerUrl,
  bannerFocusX,
  bannerFocusY,
  bannerZoom,
  priceLabel,
  clickable = false,
  ariaLabel,
  onActivate,
}: DiscoverCommunityCardProps) {
  const canonicalVisualIdentity = useCommunityVisualIdentity(
    communityId,
    visualIdentity,
  );
  const resolvedName = canonicalVisualIdentity?.name ?? name;
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
      <StableFramedMedia
        className="discover-card-banner"
        imageClassName="discover-card-banner-img"
        imageUrl={canonicalVisualIdentity?.banner.url ?? bannerUrl}
        frame={{
          focusX: canonicalVisualIdentity?.banner.focus_x ?? bannerFocusX,
          focusY: canonicalVisualIdentity?.banner.focus_y ?? bannerFocusY,
          zoom: canonicalVisualIdentity?.banner.zoom ?? bannerZoom,
        }}
        alt=""
        loading="lazy"
        fetchPriority="low"
        aria-hidden
      />
      <div className="discover-card-body">
        <div className="discover-card-header">
          <CommunityAvatar
            communityId={communityId}
            visualIdentity={canonicalVisualIdentity}
            className="discover-card-avatar"
            imageUrl={avatarUrl}
            focusX={avatarFocusX}
            focusY={avatarFocusY}
            zoom={avatarZoom}
            name={resolvedName}
            loading="lazy"
            fetchPriority="low"
          />
          <div className="discover-card-meta">
            <div className="discover-card-name-row">
              <div className="discover-card-name">{resolvedName}</div>
              <span className="discover-tag price">{renderDiscoverPriceLabel(priceLabel)}</span>
            </div>
            {slug ? <div className="discover-card-slug">/{slug}</div> : null}
          </div>
        </div>
        <div className="discover-card-desc">{oneLiner}</div>
      </div>
    </div>
  );
}
