/* Guest-pass lobby — the public community funnel is the community in visitor mode.
   Design locked in polynet-landing-mocks/10-guest-pass-funnel.html.
   The join-action contract (CommunityFunnelSurfaceAction) is unchanged; the gate,
   the rope, and the rail are three renderings of the same action object. */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { UserAvatar } from "../../../../shared/UserAvatar";
import type { CommunityFunnelHeroMediaKind } from "../../../../shared/communityTypes";
import { formatCompactStat } from "../../../../shared/communityFunnelUi";
import { parseEmbedUrl, type ParsedEmbed } from "../../../../shared/linkEmbedUi";
import "./CommunityFunnelSurface.css";

export type CommunityFunnelSurfaceFace = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
};

export type CommunityFunnelSurfaceHost = {
  display_name: string | null;
  avatar_url: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
};

export type CommunityFunnelSurfaceAction = {
  communityName: string;
  communityLinkLabel?: string | null;
  communityLinkHref?: string | null;
  avatarUrl?: string | null;
  avatarFocusX?: number | null;
  avatarFocusY?: number | null;
  avatarZoom?: number | null;
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
  canCancelPendingRequest?: boolean;
  cancelPendingRequestLabel?: string | null;
  isCancelPendingRequestDisabled?: boolean;
  onCancelPendingRequest?: (() => void) | null;
  isPreviewMode: boolean;
};

type CommunityFunnelSurfaceProps = {
  isMobile?: boolean;
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
  heroArtImageUrl?: string | null;
  heroArtImageStyle?: CSSProperties | null;
  aboutText: string;
  aboutContent?: ReactNode;
  emptyAboutContent?: ReactNode;
  alertMessages?: string[];
  inlineActionClassName?: string;
  sidebarActionClassName?: string;
  showPoweredBy?: boolean;
  /** Public host identity (owner) — rendered in the rail when present. */
  host?: CommunityFunnelSurfaceHost | null;
  /** When set (and not preview mode), the arrival gate shows on first visit, keyed per community. */
  gateSlugKey?: string | null;
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

function buildActivatedEmbedSrc(embed: ParsedEmbed): string {
  const url = new URL(embed.src);
  switch (embed.provider) {
    case "youtube":
      url.searchParams.set("autoplay", "1");
      url.searchParams.set("playsinline", "1");
      url.searchParams.set("rel", "0");
      break;
    case "vimeo":
      url.searchParams.set("autoplay", "1");
      url.searchParams.set("autopause", "0");
      break;
    case "loom":
      url.searchParams.set("autoplay", "1");
      break;
    case "wistia":
      url.searchParams.set("autoplay", "1");
      break;
  }
  return url.toString();
}

function DeferredEmbedHero(props: { embed: ParsedEmbed }) {
  const [isActive, setIsActive] = useState(false);
  const thumbnailUrls =
    "thumbnailUrls" in props.embed && props.embed.thumbnailUrls.length > 0
      ? props.embed.thumbnailUrls
      : "thumbnailUrl" in props.embed
        ? [props.embed.thumbnailUrl]
        : [];
  const [thumbnailIndex, setThumbnailIndex] = useState(0);
  const thumbnailUrl = thumbnailUrls[thumbnailIndex] ?? null;

  useEffect(() => {
    setThumbnailIndex(0);
  }, [props.embed.src]);

  if (isActive) {
    return (
      <div className="public-funnel-media-shell">
        <iframe
          className="public-funnel-media-embed"
          src={buildActivatedEmbedSrc(props.embed)}
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
      {thumbnailUrl ? (
        <img
          className="public-funnel-media-image"
          src={thumbnailUrl}
          alt=""
          draggable={false}
          loading="lazy"
          onError={() => {
            setThumbnailIndex((current) => Math.min(current + 1, thumbnailUrls.length));
          }}
        />
      ) : (
        <div className="public-funnel-media-placeholder public-funnel-media-placeholder-rich">
          <div className="public-funnel-media-placeholder-text">Play video</div>
        </div>
      )}
      <span className="public-funnel-media-play" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M9 7.5v9l7-4.5-7-4.5z" />
        </svg>
      </span>
    </button>
  );
}

function renderHeroMediaDefault(kind: CommunityFunnelHeroMediaKind, url: string | null) {
  if (!url) return null;
  if (kind === "video") {
    const embed = parseEmbedUrl(url);
    if (embed) {
      return <DeferredEmbedHero embed={embed} />;
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

const GATE_STORAGE_PREFIX = "pf2-gate-seen:";

function hasSeenGate(slugKey: string): boolean {
  try {
    return window.localStorage.getItem(`${GATE_STORAGE_PREFIX}${slugKey}`) === "1";
  } catch {
    return true;
  }
}

function markGateSeen(slugKey: string) {
  try {
    window.localStorage.setItem(`${GATE_STORAGE_PREFIX}${slugKey}`, "1");
  } catch {
    /* ignore */
  }
}

function ActionStatusCards(props: { action: CommunityFunnelSurfaceAction }) {
  const { action } = props;
  return (
    <>
      {action.canJoinWithApproval && !action.showSignIn && action.approvalPending ? (
        <div className="pf2-status-card" role="status" aria-live="polite">
          {action.canCancelPendingRequest && action.onCancelPendingRequest ? (
            <button
              className="pf2-sc-dismiss"
              type="button"
              onClick={action.onCancelPendingRequest}
              disabled={action.isCancelPendingRequestDisabled}
            >
              {action.cancelPendingRequestLabel ?? "Cancel"}
            </button>
          ) : null}
          <div className="pf2-sc-title">Request pending</div>
          <div className="pf2-sc-body">
            You&apos;re waiting for approval to join {action.communityName}.
          </div>
        </div>
      ) : null}
      {action.canJoinWithApproval &&
      !action.showSignIn &&
      action.approvalDenied &&
      !action.canRequestAgain ? (
        <div className="pf2-status-card is-error" role="status" aria-live="polite">
          <div className="pf2-sc-title">Request denied</div>
          <div className="pf2-sc-body">
            {action.approvalReapplyLabel
              ? `Your join request for ${action.communityName} was denied. You can request access again on ${action.approvalReapplyLabel}.`
              : `Your join request for ${action.communityName} was denied.`}
          </div>
        </div>
      ) : null}
      {action.isPreviewMode ? (
        <div className="pf2-preview-note">Preview mode. Actions are disabled.</div>
      ) : null}
    </>
  );
}

function CommunityAvatarBlock(props: {
  className: string;
  action: CommunityFunnelSurfaceAction;
}) {
  return (
    <div className={props.className}>
      <CommunityAvatar
        className="pf2-fill"
        imageUrl={props.action.avatarUrl}
        focusX={props.action.avatarFocusX}
        focusY={props.action.avatarFocusY}
        zoom={props.action.avatarZoom}
        name={props.action.communityName}
        alt={`${props.action.communityName} avatar`}
      />
    </div>
  );
}

function GateCard(props: {
  action: CommunityFunnelSurfaceAction;
  pricingLabel: string;
  isFreePricing: boolean;
  heroArtImageUrl: string | null;
  heroArtImageStyle: CSSProperties | null;
  onLookAround: () => void;
}) {
  const { action } = props;
  return (
    <div className="pf2-gatecard">
      <div className="pf2-gbanner" aria-hidden="true">
        {props.heroArtImageUrl ? (
          <img src={props.heroArtImageUrl} alt="" draggable={false} style={props.heroArtImageStyle ?? undefined} />
        ) : null}
      </div>
      <CommunityAvatarBlock className="pf2-gav" action={action} />
      <div className="pf2-gname">{action.communityName}</div>
      {action.communityLinkLabel ? (
        <div className="pf2-ghandle">{action.communityLinkLabel}</div>
      ) : null}
      <p className="pf2-gpromise">{action.cardBlurb}</p>
      <div className="pf2-gstats">
        {typeof action.memberCount === "number" ? (
          <span>
            <b>{formatCompactStat(action.memberCount)}</b> members
          </span>
        ) : null}
        {typeof action.onlineCount === "number" && action.onlineCount > 0 ? (
          <span>
            <span className="pf2-od" aria-hidden="true" />
            <b>{formatCompactStat(action.onlineCount)}</b> online now
          </span>
        ) : null}
        {!props.isFreePricing ? <span>{props.pricingLabel}</span> : <span>Free to join</span>}
      </div>
      <button
        className="pf2-join"
        type="button"
        disabled={action.isPrimaryActionDisabled}
        onClick={action.onPrimaryAction}
      >
        {action.primaryActionLabel}
      </button>
      <div className="pf2-gmicro">Instant access · Cancel anytime</div>
      <ActionStatusCards action={action} />
      <br />
      <button className="pf2-glook" type="button" onClick={props.onLookAround}>
        Look around first ↓
      </button>
    </div>
  );
}

export function CommunityFunnelSurface(props: CommunityFunnelSurfaceProps) {
  const {
    isMobile = false,
    title,
    heroMediaKind,
    heroMediaUrl,
    renderHeroMedia,
    visibilityLabel,
    visibilityVariant,
    pricingLabel,
    isFreePricing,
    inlineAction,
    sidebarAction = inlineAction,
    heroArtImageUrl = null,
    heroArtImageStyle = null,
    aboutText,
    aboutContent,
    emptyAboutContent = null,
    alertMessages = [],
    showPoweredBy = false,
    host = null,
    gateSlugKey = null,
  } = props;

  const action = sidebarAction;
  const gateEligible = Boolean(gateSlugKey) && !action.isPreviewMode;
  const [gateOpen, setGateOpen] = useState(false);
  const [gateMounted, setGateMounted] = useState(false);

  useEffect(() => {
    if (!gateEligible || !gateSlugKey) return;
    if (hasSeenGate(gateSlugKey)) return;
    setGateMounted(true);
    setGateOpen(true);
  }, [gateEligible, gateSlugKey]);

  const dismissGate = () => {
    if (gateSlugKey) markGateSeen(gateSlugKey);
    setGateOpen(false);
    window.setTimeout(() => setGateMounted(false), 500);
  };

  const hostName = host?.display_name?.trim() || null;
  const mediaNode = renderHeroMedia
    ? renderHeroMedia()
    : renderHeroMediaDefault(heroMediaKind, heroMediaUrl);
  const noteBody =
    aboutContent ?? (aboutText ? renderTextWithLinks(aboutText) : emptyAboutContent);
  const faceTail =
    typeof action.memberCount === "number"
      ? Math.max(action.memberCount - action.onlineFaces.length, 0)
      : null;
  const priceParts = isFreePricing ? { amt: "Free", per: "to join" } : splitPrice(pricingLabel);

  return (
    <div className={`pf2-page${isMobile ? " is-mobile" : ""}`}>
      <div className="pf2-guestbar">
        <span className="pf2-tag">
          <i aria-hidden="true" /> Viewing {title} as a guest
        </span>
        <span className="pf2-brand">
          {visibilityVariant === "unlisted" ? `${visibilityLabel} · ` : ""}Powered by Polynet
        </span>
      </div>

      <div className="pf2-shell">
        <div className="pf2-mobile-ident">
          <CommunityAvatarBlock className="pf2-cav" action={action} />
          <span>
            <b>{title}</b>
            <em>{action.cardBlurb}</em>
          </span>
        </div>

        {/* LEFT — the room */}
        <div className="pf2-left">
          <div className="pf2-banner" aria-hidden="true">
            {heroArtImageUrl ? (
              <img src={heroArtImageUrl} alt="" draggable={false} style={heroArtImageStyle ?? undefined} />
            ) : null}
          </div>
          <div className="pf2-ident">
            <CommunityAvatarBlock className="pf2-cav" action={action} />
            <div className="pf2-cname">{title}</div>
            <div className="pf2-promise">{action.cardBlurb}</div>
          </div>
          <div className="pf2-nav">
            <div className="pf2-nit on">
              <span className="pf2-d" /> Chat <span className="pf2-ct">public preview</span>
            </div>
            <div className="pf2-nit locked">
              <span className="pf2-d" /> AI Feed <span className="pf2-ct">🔒</span>
            </div>
            <div className="pf2-nit locked">
              <span className="pf2-d" /> Resources <span className="pf2-ct">🔒</span>
            </div>
            <div className="pf2-nit locked">
              <span className="pf2-d" /> Events <span className="pf2-ct">🔒</span>
            </div>
            <div className="pf2-nit locked">
              <span className="pf2-d" /> Members <span className="pf2-ct">🔒</span>
            </div>
          </div>
          <div className="pf2-leftfoot">
            Most rooms are members-only. <b>Join to enter.</b>
          </div>
        </div>

        {/* CENTER — life + the rope */}
        <div className="pf2-center">
          <div className="pf2-topic">
            <span className="pf2-h"># chat</span>
            <span className="pf2-t">the main room · public preview</span>
            {typeof action.onlineCount === "number" && action.onlineCount > 0 ? (
              <span className="pf2-live">
                <i aria-hidden="true" /> {formatCompactStat(action.onlineCount)} online now
              </span>
            ) : null}
          </div>
          <div className="pf2-feed">
            {alertMessages.length > 0 ? (
              <div className="pf2-alerts">
                {alertMessages.map((message) => (
                  <div key={message} className="pf2-alert">
                    {message}
                  </div>
                ))}
              </div>
            ) : null}

            {noteBody ? (
              <>
                <div className="pf2-curated">From the host</div>
                <div className="pf2-msg">
                  <div className={`pf2-av${host?.avatar_url ? "" : " host"}`}>
                    {host ? (
                      <UserAvatar
                        className="pf2-fill"
                        name={hostName ?? title}
                        imageUrl={host.avatar_url}
                        focusX={host.avatar_focus_x ?? 0.5}
                        focusY={host.avatar_focus_y ?? 0.5}
                        zoom={host.avatar_zoom ?? 1}
                        alt=""
                        fallback={null}
                      />
                    ) : null}
                  </div>
                  <div className="pf2-bd">
                    <div className="pf2-pin">📌 Pinned by the host</div>
                    <div className="pf2-nm">
                      {hostName ?? title}
                      <span className="pf2-role">Host</span>
                    </div>
                    <div className="pf2-tx">{noteBody}</div>
                  </div>
                </div>
              </>
            ) : null}

            {mediaNode ? <div className="pf2-media-item">{mediaNode}</div> : null}
          </div>

          <div className="pf2-rope">
            <div className="pf2-fakebox">
              <span className="pf2-ph">
                This is where you&apos;d talk — and where the community answers you, any hour…
              </span>
              <button
                className="pf2-join"
                type="button"
                disabled={action.isPrimaryActionDisabled}
                onClick={action.onPrimaryAction}
              >
                {action.primaryActionLabel}
              </button>
            </div>
            <div className="pf2-terms">
              <b>{isFreePricing ? "Free to join" : pricingLabel}</b>
              {!isFreePricing ? " · cancel anytime" : ""} · instant access
            </div>
          </div>
        </div>

        {/* RIGHT — host + people + the rope again */}
        <div className="pf2-right">
          {hostName ? (
            <div>
              <div className="pf2-rh">Host</div>
              <div className="pf2-hostcard">
                <div className="pf2-hav">
                  <UserAvatar
                    className="pf2-fill"
                    name={hostName}
                    imageUrl={host?.avatar_url ?? null}
                    focusX={host?.avatar_focus_x ?? 0.5}
                    focusY={host?.avatar_focus_y ?? 0.5}
                    zoom={host?.avatar_zoom ?? 1}
                    alt=""
                    fallback={null}
                  />
                </div>
                <span>
                  <b>{hostName}</b>
                  <em>Community host</em>
                </span>
              </div>
            </div>
          ) : null}

          <div>
            <div className="pf2-rh">Memory</div>
            <div className="pf2-memline">
              <i aria-hidden="true" /> Shared memory grows as the room learns
            </div>
          </div>

          <div>
            <div className="pf2-rh">Community</div>
            <div className="pf2-stats">
              {typeof action.memberCount === "number" ? (
                <div className="pf2-stat">
                  <div className="pf2-v">{formatCompactStat(action.memberCount)}</div>
                  <div className="pf2-k">Members</div>
                </div>
              ) : null}
              {typeof action.onlineCount === "number" ? (
                <div className="pf2-stat">
                  <div className="pf2-v">
                    <span className="pf2-od" aria-hidden="true" />
                    {formatCompactStat(action.onlineCount)}
                  </div>
                  <div className="pf2-k">Online</div>
                </div>
              ) : null}
              {typeof action.adminCount === "number" ? (
                <div className="pf2-stat">
                  <div className="pf2-v">{formatCompactStat(action.adminCount)}</div>
                  <div className="pf2-k">Admins</div>
                </div>
              ) : null}
            </div>
          </div>

          {action.onlineFaces.length > 0 ? (
            <div>
              <div className="pf2-rh">Online now</div>
              {action.onlineFaces.slice(0, 4).map((face) => (
                <div className="pf2-mrow" key={face.user_id}>
                  <div className="pf2-fav">
                    <UserAvatar
                      className="pf2-fill"
                      name={face.display_name ?? face.user_id}
                      imageUrl={face.avatar_url}
                      focusX={face.avatar_focus_x ?? 0.5}
                      focusY={face.avatar_focus_y ?? 0.5}
                      zoom={face.avatar_zoom ?? 1}
                      alt=""
                      fallback={null}
                    />
                  </div>
                  {face.display_name ?? "Member"}
                </div>
              ))}
              <div className="pf2-blurlist" aria-hidden="true">
                <div className="pf2-mrow">
                  <span className="pf2-fav" /> ████████
                </div>
                <div className="pf2-mrow">
                  <span className="pf2-fav" /> ██████
                </div>
              </div>
              {faceTail !== null && faceTail > 0 ? (
                <div className="pf2-morebehind">+ {formatCompactStat(faceTail)} more inside</div>
              ) : null}
            </div>
          ) : null}

          <div className="pf2-rjoin">
            <div className="pf2-offer">
              <span className={`pf2-amt${isFreePricing ? " is-free" : ""}`}>{priceParts.amt}</span>
              <span className="pf2-per">{priceParts.per}</span>
            </div>
            <button
              className="pf2-join pf2-wide"
              type="button"
              disabled={action.isPrimaryActionDisabled}
              onClick={action.onPrimaryAction}
            >
              {action.primaryActionLabel}
            </button>
            <ActionStatusCards action={action} />
            {showPoweredBy ? (
              <div className="pf2-powered">
                Powered by Polynet ·{" "}
                <a href="/">start your own →</a>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {gateMounted ? (
        <div
          className={`pf2-gate${gateOpen ? "" : " off"}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) dismissGate();
          }}
        >
          <GateCard
            action={action}
            pricingLabel={pricingLabel}
            isFreePricing={isFreePricing}
            heroArtImageUrl={heroArtImageUrl}
            heroArtImageStyle={heroArtImageStyle}
            onLookAround={dismissGate}
          />
        </div>
      ) : null}
    </div>
  );
}

function splitPrice(pricingLabel: string): { amt: string; per: string } {
  const match = pricingLabel.match(/^([^/]+)(\/.*)?$/);
  if (!match) return { amt: pricingLabel, per: "" };
  return { amt: match[1].trim(), per: (match[2] ?? "").trim() };
}
