import type { CSSProperties } from "react";

import type {
  CommunityFunnelConfig,
  CommunityFunnelHeroMediaKind,
} from "../../../../shared/communityTypes";
import {
  buildCommunityFunnelActionCardArtStyle,
  buildCommunityFunnelCopy,
  buildCommunityHeroStyle,
  filterOnlineAvatarFaces,
  formatCompactStat,
  formatCommunityLink,
  formatMemberCount,
  getCommunityInitials,
} from "../../../../shared/communityFunnelUi";
import { parseEmbedUrl } from "../../../../shared/linkEmbedUi";

type FunnelMode = "join_free" | "request_access" | "checkout" | "private";
type CheckoutStatus = "idle" | "loading" | "pending" | "succeeded" | "error";
type MagicLinkStatus = "idle" | "sending" | "sent";

export type PublicCommunityFunnelCommunityLike = {
  slug?: string;
  name: string;
  one_liner: string | null;
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

type WebPublicCommunityFunnelProps = {
  publicCommunity: PublicCommunityFunnelCommunityLike | null;
  publicRouteSlug?: string;
  isPreviewMode?: boolean;
  publicVisibilityLabel: string;
  selectedPublicCommunityPlanLabel: string | null;
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

function normalizeHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function splitTrailingPunctuation(url: string): { core: string; trailing: string } {
  const match = url.match(/^(.*?)([),.!?:;]+)?$/);
  if (!match) return { core: url, trailing: "" };
  return {
    core: match[1] || url,
    trailing: match[2] || "",
  };
}

function renderTextWithLinks(text: string): JSX.Element[] {
  const lines = text.split(/\r?\n/);
  const urlPattern = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

  return lines.map((line, lineIndex) => {
    const parts: Array<string | JSX.Element> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    urlPattern.lastIndex = 0;
    while ((match = urlPattern.exec(line)) !== null) {
      const rawUrl = match[0];
      const start = match.index;
      if (start > lastIndex) {
        parts.push(line.slice(lastIndex, start));
      }
      const { core, trailing } = splitTrailingPunctuation(rawUrl);
      parts.push(
        <a
          key={`link-${lineIndex}-${start}`}
          href={normalizeHref(core)}
          target="_blank"
          rel="noreferrer noopener"
        >
          {core}
        </a>,
      );
      if (trailing) parts.push(trailing);
      lastIndex = start + rawUrl.length;
    }
    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }

    return (
      <span key={`line-${lineIndex}`}>
        {parts}
        {lineIndex < lines.length - 1 ? <br /> : null}
      </span>
    );
  });
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
        <div className="public-funnel-media-placeholder-text">Paste a video link</div>
      </div>
    );
  }
  if (kind === "video") {
    const embed = parseEmbedUrl(url);
    return (
      <div className="public-funnel-media-shell">
        {embed ? (
          <iframe
            className="public-funnel-media-embed"
            src={embed.src}
            title="Community funnel video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <video className="public-funnel-media-video" src={url} controls playsInline preload="metadata" />
        )}
      </div>
    );
  }
  return (
    <div className="public-funnel-media-shell">
      <img className="public-funnel-media-image" src={url} alt="" draggable={false} />
    </div>
  );
}

type ActionModuleProps = {
  communityName: string;
  communityLink: string | null;
  avatarUrl: string | null | undefined;
  cardBlurb: string;
  memberCount: number | null;
  onlineCount: number | null;
  adminCount: number | null;
  onlineFaces: Array<{
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
  }>;
  primaryActionLabel: string;
  isPrimaryActionDisabled: boolean;
  onPrimaryJoinAction: () => void;
  canRequestAccessForFree: boolean;
  showSignIn: boolean;
  requestPending: boolean;
  requestCooldownActive: boolean;
  requestDeniedDateLabel: string;
  isPreviewMode: boolean;
  className?: string;
  includeHeroArt?: boolean;
  heroStyle?: CSSProperties | null;
};

function renderActionModule(props: ActionModuleProps) {
  const {
    communityName,
    communityLink,
    avatarUrl,
    cardBlurb,
    memberCount,
    onlineCount,
    adminCount,
    onlineFaces,
    primaryActionLabel,
    isPrimaryActionDisabled,
    onPrimaryJoinAction,
    canRequestAccessForFree,
    showSignIn,
    requestPending,
    requestCooldownActive,
    requestDeniedDateLabel,
    isPreviewMode,
    className,
    includeHeroArt = false,
    heroStyle = null,
  } = props;

  return (
    <div className={className}>
      {includeHeroArt ? (
        <div className="public-funnel-hero-art" style={heroStyle ?? undefined} aria-hidden="true" />
      ) : null}

      <div className="public-funnel-action-content">
        <div className="public-funnel-avatar">
          {renderAvatar(
            communityName,
            avatarUrl,
            "public-funnel-avatar-image",
            "public-funnel-avatar-fallback",
          )}
        </div>

        <div className="public-funnel-action-header">
          <div className="public-funnel-action-name">{communityName}</div>
          {communityLink ? (
            <a className="public-funnel-action-link" href={communityLink}>
              {communityLink.replace(/^\//, "")}
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
          <div className="public-funnel-face-strip" aria-label="People online now">
            {onlineFaces.map((face) => (
              <img
                key={face.user_id}
                className="public-funnel-face"
                src={face.avatar_url ?? ""}
                alt=""
                aria-hidden="true"
                draggable={false}
              />
            ))}
          </div>
        ) : null}

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
        {isPreviewMode && (
          <div className="public-funnel-status">Preview mode. Actions are disabled.</div>
        )}
      </div>
    </div>
  );
}

export function WebPublicCommunityFunnel(props: WebPublicCommunityFunnelProps) {
  const {
    publicCommunity,
    publicRouteSlug,
    isPreviewMode = false,
    publicVisibilityLabel,
    selectedPublicCommunityPlanLabel,
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
  const onlineFaces = filterOnlineAvatarFaces(publicCommunity?.online_faces, 4);
  const communityLink = publicCommunity?.slug ? formatCommunityLink(publicCommunity.slug) : null;
  const isPublishedVisibility = publicVisibilityLabel === "Published";
  const isFreePricing = !selectedPublicCommunityPlanLabel || selectedPublicCommunityPlanLabel.trim().toLowerCase() === "free";
  const pricingLabel = isFreePricing ? "FREE" : selectedPublicCommunityPlanLabel;

  const funnelMode = deriveFunnelMode({
    canJoinWithCheckout,
    canRequestAccessForFree,
    canJoinForFree,
  });
  const funnelCopy = buildCommunityFunnelCopy(funnelMode);
  const cardBlurb = publicCommunity?.one_liner ?? funnelCopy.body;
  const primaryActionLabel = buildPrimaryActionLabel({
    mode: funnelMode,
    isJoiningPublicCommunity,
    isRequestingPublicCommunityAccess,
    requestPending,
    requestCooldownActive,
  });
  const isPrimaryActionDisabled =
    isPreviewMode ||
    isLoadingPublicCommunity ||
    !publicCommunity ||
    checkoutStatus === "loading" ||
    isJoiningPublicCommunity ||
    isRequestingPublicCommunityAccess ||
    isLoadingMyPublicCommunityJoinRequest ||
    (canJoinWithCheckout && !hasSelectedPublicCommunityPlan) ||
    (!canJoinWithCheckout && !canJoinForFree && !canRequestAccessForFree) ||
    (canRequestAccessForFree && (requestPending || requestCooldownActive));
  const heroStyle = buildCommunityHeroStyle(publicCommunity);
  const actionCardArtStyle = buildCommunityFunnelActionCardArtStyle({
    community: publicCommunity,
    funnel,
  });
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
              {isPublishedVisibility ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              )}
              {publicVisibilityLabel}
            </div>
            {typeof memberCount === "number" ? (
              <div className="public-funnel-metadata-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                {formatMemberCount(memberCount)}
              </div>
            ) : null}
            <div className={`public-funnel-metadata-item public-funnel-metadata-price${isFreePricing ? " is-free" : ""}`}>
              {pricingLabel}
            </div>
          </div>

          {renderActionModule({
            className: "public-funnel-inline-cta",
            communityName,
            communityLink: publicCommunity?.slug ? `/c/${publicCommunity.slug}` : null,
            avatarUrl: publicCommunity?.avatar_url ?? null,
            cardBlurb,
            memberCount,
            onlineCount,
            adminCount,
            onlineFaces,
            primaryActionLabel,
            isPrimaryActionDisabled,
            onPrimaryJoinAction,
            canRequestAccessForFree,
            showSignIn,
            requestPending,
            requestCooldownActive,
            requestDeniedDateLabel,
            isPreviewMode,
          })}

          {aboutText ? <div className="public-funnel-about">{renderTextWithLinks(aboutText)}</div> : null}

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

        <aside className="public-funnel-sidebar public-funnel-sidebar-desktop">
          {renderActionModule({
            className: "public-funnel-action-card",
            communityName,
            communityLink: publicCommunity?.slug ? `/c/${publicCommunity.slug}` : null,
            avatarUrl: publicCommunity?.avatar_url ?? null,
            cardBlurb,
            memberCount,
            onlineCount,
            adminCount,
            onlineFaces,
            primaryActionLabel,
            isPrimaryActionDisabled,
            onPrimaryJoinAction,
            canRequestAccessForFree,
            showSignIn,
            requestPending,
            requestCooldownActive,
            requestDeniedDateLabel,
            isPreviewMode,
            includeHeroArt: true,
            heroStyle: actionCardArtStyle ?? heroStyle,
          })}
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
