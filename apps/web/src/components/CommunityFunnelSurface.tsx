import { useState, type CSSProperties, type ReactNode } from "react";

import type { CommunityFunnelHeroMediaKind } from "../../../../shared/communityTypes";
import {
  formatCompactStat,
  formatMemberCount,
  getCommunityInitials,
} from "../../../../shared/communityFunnelUi";
import { parseEmbedUrl } from "../../../../shared/linkEmbedUi";

export type CommunityFunnelSurfaceFace = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type CommunityFunnelSurfaceAction = {
  communityName: string;
  communityLinkLabel?: string | null;
  communityLinkHref?: string | null;
  avatarUrl?: string | null;
  cardBlurb: string;
  memberCount: number | null;
  onlineCount: number | null;
  adminCount: number | null;
  onlineFaces: CommunityFunnelSurfaceFace[];
  primaryActionLabel: string;
  isPrimaryActionDisabled: boolean;
  onPrimaryAction: () => void;
  canJoinWithApproval: boolean;
  showSignIn: boolean;
  approvalPending: boolean;
  approvalDenied: boolean;
  canRequestAgain: boolean;
  approvalReapplyLabel?: string | null;
  isPreviewMode: boolean;
};

type CommunityFunnelSurfaceProps = {
  title: string;
  heroMediaKind: CommunityFunnelHeroMediaKind;
  heroMediaUrl: string | null;
  renderHeroMedia?: () => ReactNode;
  visibilityLabel: string;
  visibilityVariant: "published" | "unlisted";
  memberCount: number | null;
  pricingLabel: string;
  isFreePricing: boolean;
  inlineAction: CommunityFunnelSurfaceAction;
  sidebarAction?: CommunityFunnelSurfaceAction;
  heroArtStyle?: CSSProperties | null;
  aboutText: string;
  emptyAboutContent?: ReactNode;
  alertMessages?: string[];
  inlineActionClassName?: string;
  sidebarActionClassName?: string;
  showPoweredBy?: boolean;
  debugPanel?: ReactNode;
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

function renderAvatar(name: string, imageUrl: string | null | undefined, className: string, fallbackClassName: string) {
  if (imageUrl) {
    return <img className={className} src={imageUrl} alt={`${name} avatar`} draggable={false} />;
  }
  return <span className={fallbackClassName}>{getCommunityInitials(name)}</span>;
}

function DeferredEmbedHero(props: { embedSrc: string; thumbnailUrl?: string | null }) {
  const [isActive, setIsActive] = useState(false);

  if (isActive) {
    return (
      <div className="public-funnel-media-shell">
        <iframe
          className="public-funnel-media-embed"
          src={props.embedSrc}
          title="Community funnel video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <button
      className="public-funnel-media-shell public-funnel-media-deferred"
      type="button"
      onClick={() => setIsActive(true)}
      aria-label="Play community funnel video"
    >
      {props.thumbnailUrl ? (
        <img className="public-funnel-media-image" src={props.thumbnailUrl} alt="" draggable={false} loading="lazy" />
      ) : (
        <div className="public-funnel-media-placeholder public-funnel-media-placeholder-rich">
          <div className="public-funnel-media-placeholder-text">Play video</div>
        </div>
      )}
      <span className="public-funnel-media-play-badge" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5.14v13.72a1 1 0 0 0 1.53.85l10.28-6.86a1 1 0 0 0 0-1.66L9.53 4.29A1 1 0 0 0 8 5.14Z" />
        </svg>
      </span>
    </button>
  );
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
    if (embed) {
      return (
        <DeferredEmbedHero
          embedSrc={embed.src}
          thumbnailUrl={"thumbnailUrl" in embed ? embed.thumbnailUrl : null}
        />
      );
    }
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

function CommunityFunnelActionModule(props: {
  className?: string;
  includeHeroArt?: boolean;
  heroStyle?: CSSProperties | null;
  action: CommunityFunnelSurfaceAction;
}) {
  const {
    className,
    includeHeroArt = false,
    heroStyle = null,
    action,
  } = props;

  return (
    <div className={className}>
      {includeHeroArt ? (
        <div className="public-funnel-hero-art" style={heroStyle ?? undefined} aria-hidden="true" />
      ) : null}

      <div className="public-funnel-action-content">
        <div className="public-funnel-avatar">
          {renderAvatar(
            action.communityName,
            action.avatarUrl,
            "public-funnel-avatar-image",
            "public-funnel-avatar-fallback",
          )}
        </div>

        <div className="public-funnel-action-header">
          <div className="public-funnel-action-name">{action.communityName}</div>
          {action.communityLinkLabel ? (
            action.communityLinkHref ? (
              <a className="public-funnel-action-link" href={action.communityLinkHref}>
                {action.communityLinkLabel}
              </a>
            ) : (
              <div className="public-funnel-action-link">{action.communityLinkLabel}</div>
            )
          ) : null}
        </div>
        <p className="public-funnel-action-copy">{action.cardBlurb}</p>

        <div className="public-funnel-action-stats">
          {typeof action.memberCount === "number" ? (
            <div className="public-funnel-action-stat">
              <div className="public-funnel-action-stat-value">{formatCompactStat(action.memberCount)}</div>
              <div className="public-funnel-action-stat-label">Members</div>
            </div>
          ) : null}
          {typeof action.onlineCount === "number" ? (
            <div className="public-funnel-action-stat">
              <div className="public-funnel-action-stat-value">{formatCompactStat(action.onlineCount)}</div>
              <div className="public-funnel-action-stat-label">Online</div>
            </div>
          ) : null}
          {typeof action.adminCount === "number" ? (
            <div className="public-funnel-action-stat">
              <div className="public-funnel-action-stat-value">{formatCompactStat(action.adminCount)}</div>
              <div className="public-funnel-action-stat-label">Admins</div>
            </div>
          ) : null}
        </div>

        {action.onlineFaces.length > 0 ? (
          <div className="public-funnel-face-strip" aria-label="People online now">
            {action.onlineFaces.map((face) => (
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
          disabled={action.isPrimaryActionDisabled}
          onClick={action.onPrimaryAction}
        >
          {action.primaryActionLabel}
        </button>

        {action.canJoinWithApproval && !action.showSignIn && action.approvalPending ? (
          <div className="public-funnel-status-card" role="status" aria-live="polite">
            <div className="public-funnel-status-card-title">Request pending</div>
            <div className="public-funnel-status-card-body">
              You&apos;re waiting for approval to join {action.communityName}.
            </div>
          </div>
        ) : null}
        {action.canJoinWithApproval && !action.showSignIn && action.approvalDenied && !action.canRequestAgain ? (
          <div className="public-funnel-status-card public-funnel-status-card-error" role="status" aria-live="polite">
            <div className="public-funnel-status-card-title">Request denied</div>
            <div className="public-funnel-status-card-body">
              {action.approvalReapplyLabel
                ? `Your join request for ${action.communityName} was denied. You can request access again on ${action.approvalReapplyLabel}.`
                : `Your join request for ${action.communityName} was denied.`}
            </div>
          </div>
        ) : null}
        {action.isPreviewMode ? (
          <div className="public-funnel-status">Preview mode. Actions are disabled.</div>
        ) : null}
      </div>
    </div>
  );
}

export function CommunityFunnelSurface(props: CommunityFunnelSurfaceProps) {
  const {
    title,
    heroMediaKind,
    heroMediaUrl,
    renderHeroMedia,
    visibilityLabel,
    visibilityVariant,
    memberCount,
    pricingLabel,
    isFreePricing,
    inlineAction,
    sidebarAction = inlineAction,
    heroArtStyle = null,
    aboutText,
    emptyAboutContent = null,
    alertMessages = [],
    inlineActionClassName = "public-funnel-inline-cta",
    sidebarActionClassName = "public-funnel-action-card",
    showPoweredBy = false,
    debugPanel = null,
  } = props;

  return (
    <div className="public-funnel-page">
      <div className="public-funnel-shell public-funnel-shell-split">
        <article className="public-funnel-main-column">
          <h1 className="public-funnel-title">{title}</h1>

          {renderHeroMedia ? renderHeroMedia() : renderHeroMediaDefault(heroMediaKind, heroMediaUrl)}

          <div className="public-funnel-metadata-row">
            <div className="public-funnel-metadata-item">
              {visibilityVariant === "published" ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              )}
              {visibilityLabel}
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

          <CommunityFunnelActionModule
            className={inlineActionClassName}
            action={inlineAction}
          />

          {aboutText ? (
            <div className="public-funnel-about">{renderTextWithLinks(aboutText)}</div>
          ) : (
            emptyAboutContent
          )}

          {alertMessages.length > 0 ? (
            <div className="public-funnel-alert-stack">
              {alertMessages.map((message) => (
                <div key={message} className="public-funnel-alert public-funnel-alert-error">
                  {message}
                </div>
              ))}
            </div>
          ) : null}
        </article>

        <aside className="public-funnel-sidebar public-funnel-sidebar-desktop">
          <CommunityFunnelActionModule
            className={sidebarActionClassName}
            action={sidebarAction}
            includeHeroArt
            heroStyle={heroArtStyle}
          />
          {showPoweredBy ? (
            <div className="public-funnel-powered-by">
              Powered by{" "}
              <a className="public-funnel-powered-by-link" href="/">
                Polynet
              </a>
            </div>
          ) : null}
        </aside>
      </div>
      {debugPanel ? <div className="public-funnel-debug-wrap">{debugPanel}</div> : null}
    </div>
  );
}

function renderHeroMediaDefault(kind: CommunityFunnelHeroMediaKind, url: string | null) {
  return renderHeroMedia(kind, url);
}
