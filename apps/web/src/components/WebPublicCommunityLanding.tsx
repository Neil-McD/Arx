import type { CSSProperties } from "react";

import type {
  CommunityFunnelConfig,
  CommunityFunnelHeroMediaKind,
} from "../../../../shared/communityTypes";
import { buildPlatformSwitcherStyle } from "../../../../shared/platformSwitcherUi";

type LandingMode = "join_free" | "request_access" | "checkout" | "invite_only";
type CheckoutStatus = "idle" | "loading" | "pending" | "succeeded" | "error";
type MagicLinkStatus = "idle" | "sending" | "sent";

export type PublicCommunityLandingCommunityLike = {
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
  featured_faces?: Array<{
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
  }> | null;
  funnel?: CommunityFunnelConfig | null;
};

type PublicCommunityPlanLike = {
  billing_period: string;
};

type WebPublicCommunityLandingProps = {
  publicCommunity: PublicCommunityLandingCommunityLike | null;
  publicRouteSlug?: string;
  publicVisibilityLabel: string;
  publicVisibilityHint: string;
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
  onSendLandingMagicLink: () => void;
  onNavigateToClaim: () => void;
  publicCommunityError: string | null;
  publicJoinError: string | null;
  publicRequestAccessError: string | null;
  checkoutError: string | null;
  showSignIn: boolean;
  magicLinkEmail: string;
  onChangeMagicLinkEmail: (value: string) => void;
  magicLinkStatus: MagicLinkStatus;
  magicLinkError: string | null;
  funnelConfigOverride?: CommunityFunnelConfig | null;
  memberCountOverride?: number | null;
  hideHelperActions?: boolean;
};

type LandingCopy = {
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

function buildHeroStyle(community: PublicCommunityLandingCommunityLike | null): CSSProperties | undefined {
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
  community: PublicCommunityLandingCommunityLike | null,
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

function deriveLandingMode(args: {
  canJoinWithCheckout: boolean;
  canRequestAccessForFree: boolean;
  canJoinForFree: boolean;
}): LandingMode {
  if (args.canJoinWithCheckout) return "checkout";
  if (args.canRequestAccessForFree) return "request_access";
  if (args.canJoinForFree) return "join_free";
  return "invite_only";
}

function buildLandingCopy(mode: LandingMode, selectedPlanLabel: string | null): LandingCopy {
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
  mode: LandingMode;
  isJoiningPublicCommunity: boolean;
  isRequestingPublicCommunityAccess: boolean;
  requestPending: boolean;
  requestCooldownActive: boolean;
}): string {
  if (args.mode === "checkout") return "Join now";
  if (args.mode === "request_access") {
    if (args.isRequestingPublicCommunityAccess) return "Requesting…";
    if (args.requestPending) return "Request pending";
    if (args.requestCooldownActive) return "Request denied";
    return "Request access";
  }
  if (args.mode === "join_free") return args.isJoiningPublicCommunity ? "Joining…" : "Join free";
  return "Invite only";
}

function renderAvatar(name: string, imageUrl: string | null | undefined, className: string, fallbackClassName: string) {
  if (imageUrl) {
    return <img className={className} src={imageUrl} alt={`${name} avatar`} />;
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
      <img className="public-funnel-media-image" src={url} alt="" />
    </div>
  );
}

export function WebPublicCommunityLanding(props: WebPublicCommunityLandingProps) {
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
    onSendLandingMagicLink,
    onNavigateToClaim,
    publicCommunityError,
    publicJoinError,
    publicRequestAccessError,
    checkoutError,
    showSignIn,
    magicLinkEmail,
    onChangeMagicLinkEmail,
    magicLinkStatus,
    magicLinkError,
    funnelConfigOverride,
    memberCountOverride,
    hideHelperActions = false,
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
  const featuredFaces =
    publicCommunity?.featured_faces?.filter(Boolean).slice(0, 8) ?? [];
  const communityLink = publicCommunity?.slug ? formatCommunityLink(publicCommunity.slug) : null;

  const landingMode = deriveLandingMode({
    canJoinWithCheckout,
    canRequestAccessForFree,
    canJoinForFree,
  });
  const landingCopy = buildLandingCopy(landingMode, selectedPublicCommunityPlanLabel);
  const cardBlurb = publicCommunity?.description ?? landingCopy.body;
  const primaryActionLabel = buildPrimaryActionLabel({
    mode: landingMode,
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
  const showLandingMagicLink = showSignIn && publicCommunity && (canJoinForFree || canRequestAccessForFree);
  const showClaimRecovery = Boolean(publicCommunity) && !hideHelperActions;
  const landingErrors = [publicCommunityError, publicJoinError, publicRequestAccessError, checkoutError].filter(
    Boolean,
  ) as string[];

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

          {isLoadingPublicCommunity && (
            <section className="public-funnel-state-card">
              <div className="public-funnel-state-kicker">Loading</div>
              <h2 className="public-funnel-state-title">Preparing this community</h2>
              <p className="public-funnel-state-copy">Fetching the latest details and access state.</p>
            </section>
          )}

          {!isLoadingPublicCommunity && landingErrors.length > 0 && (
            <div className="public-funnel-alert-stack">
              {landingErrors.map((message) => (
                <div key={message} className="public-funnel-alert public-funnel-alert-error">
                  {message}
                </div>
              ))}
            </div>
          )}

          {showLandingMagicLink && (
            <section className="public-funnel-support-card">
              <div className="public-funnel-support-copy">
                <div className="public-funnel-support-title">Prefer a magic link?</div>
                <p className="public-funnel-support-body">
                  We&apos;ll email you a sign-in link so you can continue from the same funnel.
                </p>
              </div>
              <div className="public-funnel-support-form">
                <input
                  className="public-funnel-input"
                  type="email"
                  placeholder="you@example.com"
                  value={magicLinkEmail}
                  onChange={(event) => onChangeMagicLinkEmail(event.target.value)}
                />
                <button
                  className="public-funnel-secondary"
                  type="button"
                  disabled={!magicLinkEmail.trim() || magicLinkStatus === "sending"}
                  onClick={onSendLandingMagicLink}
                >
                  {magicLinkStatus === "sending" ? "Sending…" : magicLinkStatus === "sent" ? "Sent" : "Send link"}
                </button>
              </div>
              {magicLinkError ? <div className="public-funnel-status public-funnel-status-error">{magicLinkError}</div> : null}
            </section>
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
                {typeof adminCount === "number" ? (
                  <div className="public-funnel-action-stat">
                    <div className="public-funnel-action-stat-value">{formatCompactStat(adminCount)}</div>
                    <div className="public-funnel-action-stat-label">Admins</div>
                  </div>
                ) : null}
                <div className="public-funnel-action-stat">
                  <div className="public-funnel-action-stat-value">
                    {selectedPublicCommunityPlanLabel ?? "Free"}
                  </div>
                  <div className="public-funnel-action-stat-label">Price</div>
                </div>
              </div>

              {featuredFaces.length > 0 ? (
                <div className="public-funnel-face-strip" aria-label="Community members">
                  {featuredFaces.map((face) =>
                    face.avatar_url ? (
                      <img
                        key={face.user_id}
                        className="public-funnel-face"
                        src={face.avatar_url}
                        alt={face.display_name ?? "Community member"}
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
                className="public-funnel-primary"
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

              {showClaimRecovery && (
                <button
                  className="public-funnel-helper"
                  type="button"
                  onClick={onNavigateToClaim}
                >
                  Already paid? Recover access
                </button>
              )}
            </div>
          </div>
          <div className="public-funnel-powered-by">Powered by Polynet</div>
        </aside>
      </div>
    </div>
  );
}
