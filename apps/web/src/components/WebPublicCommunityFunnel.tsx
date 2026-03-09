import type { CSSProperties } from "react";

import type {
  CommunityFunnelConfig,
  CommunityFunnelHeroMediaKind,
} from "../../../../shared/communityTypes";
import { buildPlatformSwitcherStyle } from "../../../../shared/platformSwitcherUi";

type FunnelMode = "join_free" | "request_access" | "checkout" | "private";
type CheckoutStatus = "idle" | "loading" | "pending" | "succeeded" | "error";
type MagicLinkStatus = "idle" | "sending" | "sent";

export type PublicCommunityFunnelCommunityLike = {
  slug?: string;
  name: string;
  description: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  banner_focus_x?: number | null;
  banner_focus_y?: number | null;
  banner_zoom?: number | null;
  member_count?: number | null;
  admin_count?: number | null;
  online_count?: number | null;
  online_faces?: Array<{
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
  }> | null;
  funnel?: CommunityFunnelConfig | null;
};

type PublicCommunityPlanLike = {
  billing_period: string;
};

type WebPublicCommunityFunnelProps = {
  publicCommunity: PublicCommunityFunnelCommunityLike | null;
  publicRouteSlug?: string;
  publicVisibilityLabel: string;
  selectedPublicCommunityPlanLabel: string | null;
  publicCommunityPlans: PublicCommunityPlanLike[];
  selectedPublicCommunityBillingPeriod: string | null;
  selectedPublicCommunityPlanBillingPeriod: string | null;
  onSelectPublicCommunityBillingPeriod: (period: string) => void;
  hasSelectedPublicCommunityPlan: boolean;
  isLoadingPublicCommunity: boolean;
  canJoinForFree: boolean;
  canRequestAccessForFree: boolean;
  canJoinWithCheckout: boolean;
  checkoutStatus: CheckoutStatus;
  isJoiningPublicCommunity: boolean;
  isRequestingPublicCommunityAccess: boolean;
  isLoadingMyPublicCommunityJoinRequest: boolean;
  requestPending: boolean;
  requestCooldownActive: boolean;
  requestDeniedDateLabel: string;
  onPrimaryJoinAction: () => void;
  publicCommunityError: string | null;
  publicJoinError: string | null;
  publicRequestAccessError: string | null;
  checkoutError: string | null;
  showSignIn: boolean;
  funnelConfigOverride?: CommunityFunnelConfig | null;
  memberCountOverride?: number | null;
};

type FunnelCopy = {
  eyebrow: string;
  body: string;
};

function getCommunityInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "PN"
  );
}

function formatMemberCount(value: number): string {
  return `${new Intl.NumberFormat().format(value)} members`;
}

function formatCompactStat(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

function formatCommunityLink(slug: string): string {
  return `polynet.com/c/${slug}`;
}

function buildHeroStyle(community: PublicCommunityFunnelCommunityLike | null): CSSProperties | undefined {
  if (!community?.banner_url) return undefined;
  const x = typeof community.banner_focus_x === "number" ? community.banner_focus_x : 50;
  const y = typeof community.banner_focus_y === "number" ? community.banner_focus_y : 50;
  const zoom = typeof community.banner_zoom === "number" ? community.banner_zoom : 1;
  return {
    backgroundImage: `url(${community.banner_url})`,
    backgroundPosition: `${x}% ${y}%`,
    backgroundSize: `${Math.max(100, zoom * 100)}%`,
  };
}

function buildActionCardArtStyle(
  community: PublicCommunityFunnelCommunityLike | null,
  funnel: CommunityFunnelConfig | null,
): CSSProperties | undefined {
  if (funnel?.hero_media_kind === "image" && funnel.hero_media_url) {
    return {
      backgroundImage: `url(${funnel.hero_media_url})`,
      backgroundPosition: "center",
      backgroundSize: "cover",
    };
  }
  return buildHeroStyle(community);
}

function deriveFunnelMode(args: {
  canJoinWithCheckout: boolean;
  canRequestAccessForFree: boolean;
  canJoinForFree: boolean;
}): FunnelMode {
  if (args.canJoinWithCheckout) return "checkout";
  if (args.canRequestAccessForFree) return "request_access";
  if (args.canJoinForFree) return "join_free";
  return "private";
}

function buildFunnelCopy(mode: FunnelMode, selectedPlanLabel: string | null): FunnelCopy {
  switch (mode) {
    case "checkout":
      return {
        eyebrow: "Paid access",
        body: "Unlock access and continue into the community.",
      };
    case "request_access":
      return {
        eyebrow: "Approval required",
        body: "Request access to enter the community.",
      };
    case "join_free":
      return {
        eyebrow: "Open access",
        body: "Enter immediately and start participating.",
      };
    default:
      return {
        eyebrow: "Private community",
        body: "Reach out to the owner for access.",
      };
  }
}

function buildPrimaryActionLabel(args: {
  mode: FunnelMode;
  isJoiningPublicCommunity: boolean;
  isRequestingPublicCommunityAccess: boolean;
  requestPending: boolean;
  requestCooldownActive: boolean;
}): string {
  if (args.mode === "checkout") return "Join now";
  if (args.mode === "request_access") {
    if (args.isRequestingPublicCommunityAccess) return "Joining…";
    if (args.requestPending) return "Pending";
    if (args.requestCooldownActive) return "Denied";
    return "Join now";
  }
  if (args.mode === "join_free") return args.isJoiningPublicCommunity ? "Joining…" : "Join now";
  return "Private community";
}

function renderAvatar(name: string, imageUrl: string | null | undefined, className: string, fallbackClassName: string) {
  if (imageUrl) {
    return <img className={className} src={imageUrl} alt={`${name} avatar`} draggable={false} />;
  }
  return <span className={fallbackClassName}>{getCommunityInitials(name)}</span>;
}

function renderHeroMedia(kind: CommunityFunnelHeroMediaKind, url: string | null) {
  if (!url) {
    return (
      <div className="public-funnel-media-placeholder">
        <div className="public-funnel-media-placeholder-text">Upload images / videos</div>
      </div>
    );
  }
  if (kind === "video") {
    return (
      <div className="public-funnel-media-shell">
        <video className="public-funnel-media-video" src={url} controls playsInline preload="metadata" />
      </div>
    );
  }
  return (
    <div className="public-funnel-media-shell">
      <img className="public-funnel-media-image" src={url} alt="" draggable={false} />
    </div>
  );
}

export function WebPublicCommunityFunnel(props: WebPublicCommunityFunnelProps) {
  const {
    publicCommunity,
    publicRouteSlug,
    publicVisibilityLabel,
    selectedPublicCommunityPlanLabel,
    publicCommunityPlans,
    selectedPublicCommunityBillingPeriod,
    selectedPublicCommunityPlanBillingPeriod,
    onSelectPublicCommunityBillingPeriod,
    hasSelectedPublicCommunityPlan,
    isLoadingPublicCommunity,
    canJoinForFree,
    canRequestAccessForFree,
    canJoinWithCheckout,
    checkoutStatus,
    isJoiningPublicCommunity,
    isRequestingPublicCommunityAccess,
    isLoadingMyPublicCommunityJoinRequest,
    requestPending,
    requestCooldownActive,
    requestDeniedDateLabel,
    onPrimaryJoinAction,
    publicCommunityError,
    publicJoinError,
    publicRequestAccessError,
    checkoutError,
    showSignIn,
    funnelConfigOverride,
    memberCountOverride,
  } = props;

  const billingPeriodOptions = [
    ...publicCommunityPlans.slice().sort((a, b) => {
      const ar = a.billing_period === "monthly" ? 0 : 1;
      const br = b.billing_period === "monthly" ? 0 : 1;
      return ar - br;
    }),
  ];
  const selectedBillingPeriod =
    selectedPublicCommunityBillingPeriod ?? selectedPublicCommunityPlanBillingPeriod;
  const billingPeriodSwitcherStyle = buildPlatformSwitcherStyle(
    billingPeriodOptions.length,
    billingPeriodOptions.findIndex((plan) => plan.billing_period === selectedBillingPeriod),
  );

  const communityName = publicCommunity?.name ?? publicRouteSlug ?? "Community";
  const funnel = funnelConfigOverride ?? publicCommunity?.funnel ?? null;
  const aboutText = funnel?.about?.trim() ?? "";
  const memberCount =
    typeof memberCountOverride === "number"
      ? memberCountOverride
      : typeof publicCommunity?.member_count === "number"
        ? publicCommunity.member_count
        : null;
  const adminCount =
    typeof publicCommunity?.admin_count === "number" ? publicCommunity.admin_count : null;
  const onlineCount =
    typeof publicCommunity?.online_count === "number" ? publicCommunity.online_count : null;
  const onlineFaces =
    publicCommunity?.online_faces?.filter(Boolean).slice(0, 8) ?? [];
  const communityLink = publicCommunity?.slug ? formatCommunityLink(publicCommunity.slug) : null;

  const funnelMode = deriveFunnelMode({
    canJoinWithCheckout,
    canRequestAccessForFree,
    canJoinForFree,
  });
  const funnelCopy = buildFunnelCopy(funnelMode, selectedPublicCommunityPlanLabel);
  const cardBlurb = publicCommunity?.description ?? funnelCopy.body;
  const primaryActionLabel = buildPrimaryActionLabel({
    mode: funnelMode,
    isJoiningPublicCommunity,
    isRequestingPublicCommunityAccess,
    requestPending,
    requestCooldownActive,
  });
  const isPrimaryActionDisabled =
    isLoadingPublicCommunity ||
    !publicCommunity ||
    checkoutStatus === "loading" ||
    isJoiningPublicCommunity ||
    isRequestingPublicCommunityAccess ||
    isLoadingMyPublicCommunityJoinRequest ||
    (canJoinWithCheckout && !hasSelectedPublicCommunityPlan) ||
    (!canJoinWithCheckout && !canJoinForFree && !canRequestAccessForFree) ||
    (canRequestAccessForFree && (requestPending || requestCooldownActive));
  const heroStyle = buildHeroStyle(publicCommunity);
  const actionCardArtStyle = buildActionCardArtStyle(publicCommunity, funnel);
  const funnelErrors = [publicCommunityError, publicJoinError, publicRequestAccessError, checkoutError].filter(
    Boolean,
  ) as string[];

  if (isLoadingPublicCommunity && !publicCommunity) {
    return (
      <div className="public-funnel-page">
        <div className="public-funnel-shell public-funnel-shell-split public-funnel-shell-loading" aria-busy="true">
          <article className="public-funnel-main-column public-funnel-main-column-loading">
            <div className="public-funnel-loading-title web-skeleton-block" aria-hidden="true" />
            <div className="public-funnel-media-shell public-funnel-media-shell-skeleton web-skeleton-block" aria-hidden="true" />
            <div className="public-funnel-loading-metadata" aria-hidden="true">
              <div className="public-funnel-loading-chip web-skeleton-pill" />
              <div className="public-funnel-loading-chip web-skeleton-pill" />
              <div className="public-funnel-loading-chip web-skeleton-pill" />
            </div>
            <div className="public-funnel-loading-copy" aria-hidden="true">
              <div className="web-skeleton-row public-funnel-loading-row" />
              <div className="web-skeleton-row public-funnel-loading-row" />
              <div className="web-skeleton-row public-funnel-loading-row public-funnel-loading-row-short" />
            </div>
          </article>

          <aside className="public-funnel-sidebar">
            <div className="public-funnel-action-card public-funnel-action-card-skeleton" aria-hidden="true">
              <div className="public-funnel-hero-art public-funnel-hero-art-skeleton web-skeleton-block" />
              <div className="public-funnel-action-content">
                <div className="public-funnel-avatar public-funnel-avatar-skeleton web-skeleton-block" />
                <div className="public-funnel-loading-copy">
                  <div className="web-skeleton-row public-funnel-loading-row public-funnel-loading-row-medium" />
                  <div className="web-skeleton-row public-funnel-loading-row public-funnel-loading-row-short" />
                  <div className="web-skeleton-row public-funnel-loading-row" />
                </div>
                <div className="public-funnel-action-stats public-funnel-action-stats-skeleton">
                  <div className="public-funnel-action-stat">
                    <div className="web-skeleton-row public-funnel-loading-stat-value" />
                    <div className="web-skeleton-row public-funnel-loading-stat-label" />
                  </div>
                  <div className="public-funnel-action-stat">
                    <div className="web-skeleton-row public-funnel-loading-stat-value" />
                    <div className="web-skeleton-row public-funnel-loading-stat-label" />
                  </div>
                  <div className="public-funnel-action-stat">
                    <div className="web-skeleton-row public-funnel-loading-stat-value" />
                    <div className="web-skeleton-row public-funnel-loading-stat-label" />
                  </div>
                </div>
                <div className="public-funnel-loading-button web-skeleton-block" />
              </div>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="public-funnel-page">
      <div className="public-funnel-shell public-funnel-shell-split">
        <article className="public-funnel-main-column">
          <h1 className="public-funnel-title">{communityName}</h1>

          {renderHeroMedia(funnel?.hero_media_kind ?? "image", funnel?.hero_media_url ?? null)}

          <div className="public-funnel-metadata-row">
            <div className="public-funnel-metadata-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              {publicVisibilityLabel}
            </div>
            {typeof memberCount === "number" ? (
              <div className="public-funnel-metadata-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                {formatMemberCount(memberCount)}
              </div>
            ) : null}
            <div className="public-funnel-metadata-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
              {selectedPublicCommunityPlanLabel ?? "Free"}
            </div>
          </div>

          {aboutText ? <div className="public-funnel-about">{aboutText}</div> : null}

          {isLoadingPublicCommunity && publicCommunity && (
            <section className="public-funnel-state-card">
              <div className="public-funnel-state-kicker">Loading</div>
              <h2 className="public-funnel-state-title">Preparing this community</h2>
              <p className="public-funnel-state-copy">Fetching the latest details and access state.</p>
            </section>
          )}

          {!isLoadingPublicCommunity && funnelErrors.length > 0 && (
            <div className="public-funnel-alert-stack">
              {funnelErrors.map((message) => (
                <div key={message} className="public-funnel-alert public-funnel-alert-error">
                  {message}
                </div>
              ))}
            </div>
          )}

        </article>

        <aside className="public-funnel-sidebar">
          <div className="public-funnel-action-card">
            <div className="public-funnel-hero-art" style={actionCardArtStyle ?? heroStyle} aria-hidden="true" />

            <div className="public-funnel-action-content">
              <div className="public-funnel-avatar">
                {renderAvatar(
                  communityName,
                  publicCommunity?.avatar_url ?? null,
                  "public-funnel-avatar-image",
                  "public-funnel-avatar-fallback",
                )}
              </div>

              <div className="public-funnel-action-header">
                <div className="public-funnel-action-name">{communityName}</div>
                {communityLink ? (
                  <a className="public-funnel-action-link" href={`/c/${publicCommunity?.slug ?? publicRouteSlug ?? ""}`}>
                    {communityLink}
                  </a>
                ) : null}
              </div>
              <p className="public-funnel-action-copy">{cardBlurb}</p>

              <div className="public-funnel-action-stats">
                {typeof memberCount === "number" ? (
                  <div className="public-funnel-action-stat">
                    <div className="public-funnel-action-stat-value">{formatCompactStat(memberCount)}</div>
                    <div className="public-funnel-action-stat-label">Members</div>
                  </div>
                ) : null}
                {typeof onlineCount === "number" ? (
                  <div className="public-funnel-action-stat">
                    <div className="public-funnel-action-stat-value">{formatCompactStat(onlineCount)}</div>
                    <div className="public-funnel-action-stat-label">Online</div>
                  </div>
                ) : null}
                {typeof adminCount === "number" ? (
                  <div className="public-funnel-action-stat">
                    <div className="public-funnel-action-stat-value">{formatCompactStat(adminCount)}</div>
                    <div className="public-funnel-action-stat-label">Admins</div>
                  </div>
                ) : null}
              </div>

              {onlineFaces.length > 0 ? (
                <div className="public-funnel-face-strip" aria-label="Community members">
                  {onlineFaces.map((face) =>
                    face.avatar_url ? (
                      <img
                        key={face.user_id}
                        className="public-funnel-face"
                        src={face.avatar_url}
                        alt={face.display_name ?? "Community member"}
                        draggable={false}
                      />
                    ) : (
                      <span key={face.user_id} className="public-funnel-face public-funnel-face-fallback">
                        {getCommunityInitials(face.display_name ?? "Member")}
                      </span>
                    ),
                  )}
                </div>
              ) : null}

              {publicCommunityPlans.length > 1 && canJoinWithCheckout && (
                <div
                  className="platform-switcher platform-switcher-compact public-funnel-switcher"
                  role="tablist"
                  aria-label="Billing period"
                  style={billingPeriodSwitcherStyle}
                >
                  {billingPeriodOptions.map((plan) => (
                    <button
                      key={plan.billing_period}
                      type="button"
                      className={
                        plan.billing_period === selectedBillingPeriod
                          ? "platform-switcher-btn active"
                          : "platform-switcher-btn"
                      }
                      aria-pressed={plan.billing_period === selectedBillingPeriod}
                      onClick={() => onSelectPublicCommunityBillingPeriod(plan.billing_period)}
                    >
                      {plan.billing_period === "monthly" ? "Monthly" : "Annual"}
                    </button>
                  ))}
                </div>
              )}

              <button
                className="public-funnel-primary platform-save-button"
                type="button"
                disabled={isPrimaryActionDisabled}
                onClick={onPrimaryJoinAction}
              >
                {primaryActionLabel}
              </button>

              {canRequestAccessForFree && !showSignIn && requestPending && (
                <div className="public-funnel-status">Awaiting approval by the community admins.</div>
              )}
              {canRequestAccessForFree && !showSignIn && requestCooldownActive && (
                <div className="public-funnel-status public-funnel-status-error">
                  Request denied. Try again on {requestDeniedDateLabel}.
                </div>
              )}
            </div>
          </div>
          <div className="public-funnel-powered-by">
            Powered by{" "}
            <a className="public-funnel-powered-by-link" href="/">
              Polynet
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}
