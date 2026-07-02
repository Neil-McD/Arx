/* Guest-pass funnel — the community rendered in visitor mode, built from the REAL
   product shell components (CommunityNav, CommunityChatMessageRow) plus funnel-only
   conversion chrome (gate, rope, guest rail) in product theme tokens.
   Design: polynet-landing-mocks/11-guest-shell-product-skin.html.
   The join-action contract (CommunityFunnelSurfaceAction) is unchanged. */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { CommunityAvatar } from "../../../../shared/CommunityAvatar";
import { CommunityChatMessageRow } from "../../../../shared/CommunityChatMessageRow";
import { CommunityNav } from "../../../../shared/CommunityNav";
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

export type CommunityFunnelSurfaceFeaturedMessage = {
  id: string;
  body: string;
  created_at?: string | null;
  sender?: {
    display_name?: string | null;
    avatar_url?: string | null;
    avatar_focus_x?: number | null;
    avatar_focus_y?: number | null;
    avatar_zoom?: number | null;
  } | null;
  reactions?: Array<{ emoji: string; count: number }> | null;
};

export type CommunityFunnelSurfaceBanner = {
  url: string | null;
  focusX?: number | null;
  focusY?: number | null;
  zoom?: number | null;
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
  /** Public host identity (owner) — pinned-note sender + rail host card. */
  host?: CommunityFunnelSurfaceHost | null;
  /** Community banner (raw fields) for the real CommunityNav header. */
  banner?: CommunityFunnelSurfaceBanner | null;
  /** When set (and not preview mode), the arrival gate shows on first visit, keyed per community. */
  gateSlugKey?: string | null;
  /** Host-featured messages (public-safe projection) rendered through the real message row. */
  featuredMessages?: CommunityFunnelSurfaceFeaturedMessage[] | null;
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

const GATE_STORAGE_PREFIX = "cfg-gate-seen:";

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

const NOOP = () => {};

function formatFeaturedTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatFeaturedTimeLong(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function getInitialsFromLabel(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** The real product message row, configured as an inert guest rendering. */
function GuestInertRow(props: {
  id: string;
  body: string;
  senderLabel: string;
  avatarUrl: string | null;
  avatarFocusX?: number | null;
  avatarFocusY?: number | null;
  avatarZoom?: number | null;
  shortTime: string;
  formattedTime: string;
  reactions?: Array<{ emoji: string; count: number }> | null;
}) {
  const senderLabel = props.senderLabel;
  const reactionRecords = (props.reactions ?? []).flatMap((entry) =>
    Array.from({ length: Math.max(entry.count, 0) }, (_, index) => ({
      message_id: props.id,
      user_id: `guest-reaction-${entry.emoji}-${index}`,
      emoji: entry.emoji,
    })),
  );
  return (
    <CommunityChatMessageRow
      message={{
        id: props.id,
        sender_id: "guest-inert-sender",
        body: props.body,
        attachments: [],
        reply_to_id: null,
        created_at: "",
      }}
      copied={false}
      dateSeparator={null}
      isPending={false}
      showMeta={true}
      isOwn={false}
      canModerateContent={false}
      senderLabel={senderLabel}
      senderHandle={null}
      senderBio={null}
      avatarUrl={props.avatarUrl}
      avatarFocusX={props.avatarFocusX ?? null}
      avatarFocusY={props.avatarFocusY ?? null}
      avatarZoom={props.avatarZoom ?? null}
      avatarColor="var(--accent-gold, #d66a8a)"
      shortTime={props.shortTime}
      formattedTime={props.formattedTime}
      isEditing={false}
      editingMessageText=""
      isReactionPickerOpen={false}
      messageReactions={reactionRecords}
      sessionUserId={null}
      replyToId={null}
      replyTarget={null}
      reactionEmojis={[]}
      getInitials={getInitialsFromLabel}
      displayName={() => senderLabel}
      parseReplyPrefix={() => null}
      truncateReplyPreview={(value: string) => value}
      renderTextWithLinks={renderTextWithLinks}
      onScrollToReplyMessage={NOOP}
      onOpenCommunityChatLightbox={NOOP}
      onToggleReaction={NOOP}
      onSetReactionPickerMessageId={NOOP}
      onStartReply={NOOP}
      onCopyMessage={NOOP}
      onStartEdit={NOOP}
      onDeleteMessage={NOOP}
      onEditingMessageTextChange={NOOP}
      onSaveEdit={NOOP}
      onCancelEdit={NOOP}
    />
  );
}

function ActionStatusCards(props: { action: CommunityFunnelSurfaceAction }) {
  const { action } = props;
  return (
    <>
      {action.canJoinWithApproval && !action.showSignIn && action.approvalPending ? (
        <div className="cfg-status-card" role="status" aria-live="polite">
          {action.canCancelPendingRequest && action.onCancelPendingRequest ? (
            <button
              className="cfg-sc-dismiss"
              type="button"
              onClick={action.onCancelPendingRequest}
              disabled={action.isCancelPendingRequestDisabled}
            >
              {action.cancelPendingRequestLabel ?? "Cancel"}
            </button>
          ) : null}
          <div className="cfg-sc-title">Request pending</div>
          <div className="cfg-sc-body">
            You&apos;re waiting for approval to join {action.communityName}.
          </div>
        </div>
      ) : null}
      {action.canJoinWithApproval &&
      !action.showSignIn &&
      action.approvalDenied &&
      !action.canRequestAgain ? (
        <div className="cfg-status-card is-error" role="status" aria-live="polite">
          <div className="cfg-sc-title">Request denied</div>
          <div className="cfg-sc-body">
            {action.approvalReapplyLabel
              ? `Your join request for ${action.communityName} was denied. You can request access again on ${action.approvalReapplyLabel}.`
              : `Your join request for ${action.communityName} was denied.`}
          </div>
        </div>
      ) : null}
      {action.isPreviewMode ? (
        <div className="cfg-preview-note">Preview mode. Actions are disabled.</div>
      ) : null}
    </>
  );
}

function GateCard(props: {
  action: CommunityFunnelSurfaceAction;
  hostName: string | null;
  pricingLabel: string;
  isFreePricing: boolean;
  bannerUrl: string | null;
  bannerStyle: CSSProperties | null;
  onLookAround: () => void;
}) {
  const { action } = props;
  return (
    <div className="cfg-gatecard">
      <div className="cfg-gbanner" aria-hidden="true">
        {props.bannerUrl ? (
          <img src={props.bannerUrl} alt="" draggable={false} style={props.bannerStyle ?? undefined} />
        ) : null}
      </div>
      <div className="cfg-gav">
        <CommunityAvatar
          className="cfg-fill"
          imageUrl={action.avatarUrl}
          focusX={action.avatarFocusX}
          focusY={action.avatarFocusY}
          zoom={action.avatarZoom}
          name={action.communityName}
          alt={`${action.communityName} avatar`}
        />
      </div>
      <div className="cfg-gname">{action.communityName}</div>
      <div className="cfg-ghandle">
        {action.communityLinkLabel ?? ""}
        {props.hostName ? `${action.communityLinkLabel ? " · " : ""}hosted by ${props.hostName}` : ""}
      </div>
      <p className="cfg-gpromise">{action.cardBlurb}</p>
      <div className="cfg-gstats">
        {typeof action.memberCount === "number" ? (
          <span>
            <b>{formatCompactStat(action.memberCount)}</b> members
          </span>
        ) : null}
        {typeof action.onlineCount === "number" && action.onlineCount > 0 ? (
          <span>
            <span className="cfg-od" aria-hidden="true" />
            <b>{formatCompactStat(action.onlineCount)}</b> online now
          </span>
        ) : null}
        <span>{props.isFreePricing ? "Free to join" : props.pricingLabel}</span>
      </div>
      <button
        className="cfg-join"
        type="button"
        disabled={action.isPrimaryActionDisabled}
        onClick={action.onPrimaryAction}
      >
        {action.primaryActionLabel}
      </button>
      <div className="cfg-gmicro">Instant access{props.isFreePricing ? "" : " · Cancel anytime"}</div>
      <ActionStatusCards action={action} />
      <br />
      <button className="cfg-glook" type="button" onClick={props.onLookAround}>
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
    banner = null,
    gateSlugKey = null,
    featuredMessages = null,
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
    window.setTimeout(() => setGateMounted(false), 450);
  };

  const reopenGate = () => {
    if (action.isPreviewMode) return;
    setGateMounted(true);
    window.setTimeout(() => setGateOpen(true), 20);
  };

  const hostName = host?.display_name?.trim() || null;
  const bannerUrl = banner?.url ?? heroArtImageUrl;
  const mediaNode = renderHeroMedia
    ? renderHeroMedia()
    : renderHeroMediaDefault(heroMediaKind, heroMediaUrl);
  const hasNote = Boolean(aboutContent) || Boolean(aboutText) || Boolean(emptyAboutContent);

  return (
    <div className={`cfg-page${isMobile ? " is-mobile" : ""}`}>
      <div className="cfg-guestbar">
        <span className="cfg-tag">
          <i aria-hidden="true" /> Viewing {title} as a guest
        </span>
        <span className="cfg-brand">
          {visibilityVariant === "unlisted" ? `${visibilityLabel} · ` : ""}
          {showPoweredBy ? (
            <>
              Powered by Polynet · <a href="/">start your own →</a>
            </>
          ) : (
            "Powered by Polynet"
          )}
        </span>
      </div>

      <div className="cfg-shell">
        <div className="cfg-mobile-ident">
          <div className="cfg-mav">
            <CommunityAvatar
              className="cfg-fill"
              imageUrl={action.avatarUrl}
              focusX={action.avatarFocusX}
              focusY={action.avatarFocusY}
              zoom={action.avatarZoom}
              name={action.communityName}
              alt=""
            />
          </div>
          <span>
            <b>{title}</b>
            <em>{action.cardBlurb}</em>
          </span>
        </div>

        {/* LEFT — the real product nav in guest mode */}
        <div className="cfg-nav">
          <CommunityNav
            activeCommunity={{
              slug: null,
              name: title,
              banner_url: bannerUrl,
              banner_focus_x: banner?.focusX ?? null,
              banner_focus_y: banner?.focusY ?? null,
              banner_zoom: banner?.zoom ?? null,
            }}
            communityTab="chat"
            canViewMembersActiveCommunity={false}
            canViewActiveCommunitySettings={false}
            canViewActiveCommunityPolynet={false}
            canManageMembersActiveCommunity={false}
            canViewActiveCommunityAnalytics={false}
            onSelectTab={(tab) => {
              if (tab !== "chat") reopenGate();
            }}
            buttonType="button"
            subtitle={action.cardBlurb}
            lockedTabs={{ ai_feed: true, resources: true, events: true }}
          />
          <div className="cfg-navfoot">
            Most rooms are members-only. <b>Join to enter.</b>
          </div>
        </div>

        {/* CENTER — the real chat surface, guest view */}
        <div className="cfg-center">
          <div className="cfg-topic">
            <b># chat</b>
            <span>the main room · public preview</span>
            {typeof action.onlineCount === "number" && action.onlineCount > 0 ? (
              <span className="cfg-live">
                <i aria-hidden="true" /> {formatCompactStat(action.onlineCount)} online now
              </span>
            ) : null}
          </div>
          <div className="chat-messages cfg-feed">
            {alertMessages.length > 0 ? (
              <div className="cfg-alerts">
                {alertMessages.map((message) => (
                  <div key={message} className="cfg-alert">
                    {message}
                  </div>
                ))}
              </div>
            ) : null}

            {hasNote ? (
              <>
                <div className="chat-date-separator cfg-daysep">
                  <span>Pinned by the host</span>
                </div>
                {aboutContent || (!aboutText && emptyAboutContent) ? (
                  <div className="chat-message cfg-custom-note">
                    <div className="cfg-note-av">
                      {host ? (
                        <UserAvatar
                          className="cfg-fill"
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
                    <div className="cfg-note-bd">
                      <div className="cfg-note-nm">
                        {hostName ?? title}
                        <span>Host</span>
                      </div>
                      <div className="cfg-note-tx">{aboutContent ?? emptyAboutContent}</div>
                    </div>
                  </div>
                ) : (
                  <GuestInertRow
                    id="guest-pinned-note"
                    body={aboutText}
                    senderLabel={hostName ?? title}
                    avatarUrl={host?.avatar_url ?? null}
                    avatarFocusX={host?.avatar_focus_x}
                    avatarFocusY={host?.avatar_focus_y}
                    avatarZoom={host?.avatar_zoom}
                    shortTime="pinned"
                    formattedTime="Pinned by the host"
                  />
                )}
              </>
            ) : null}

            {mediaNode ? <div className="cfg-media">{mediaNode}</div> : null}

            {featuredMessages && featuredMessages.length > 0 ? (
              <>
                <div className="chat-date-separator cfg-daysep">
                  <span>Featured from inside · picked by the host</span>
                </div>
                {featuredMessages.map((entry) => (
                  <GuestInertRow
                    key={entry.id}
                    id={entry.id}
                    body={entry.body}
                    senderLabel={entry.sender?.display_name?.trim() || "Member"}
                    avatarUrl={entry.sender?.avatar_url ?? null}
                    avatarFocusX={entry.sender?.avatar_focus_x}
                    avatarFocusY={entry.sender?.avatar_focus_y}
                    avatarZoom={entry.sender?.avatar_zoom}
                    shortTime={formatFeaturedTime(entry.created_at)}
                    formattedTime={formatFeaturedTimeLong(entry.created_at)}
                    reactions={entry.reactions}
                  />
                ))}
              </>
            ) : null}
          </div>

          <div className="cfg-rope">
            <div className="cfg-ropebox">
              <span className="cfg-roph">
                This is where you&apos;d talk — and where the community answers you, any hour…
              </span>
              <button
                className="cfg-join"
                type="button"
                disabled={action.isPrimaryActionDisabled}
                onClick={action.onPrimaryAction}
              >
                {action.primaryActionLabel}
              </button>
            </div>
            <div className="cfg-terms">
              <b>{isFreePricing ? "Free to join" : pricingLabel}</b>
              {!isFreePricing ? " · cancel anytime" : ""} · instant access
            </div>
            <ActionStatusCards action={action} />
          </div>
        </div>
      </div>

      {gateMounted ? (
        <div
          className={`cfg-gate${gateOpen ? "" : " off"}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) dismissGate();
          }}
        >
          <GateCard
            action={action}
            hostName={hostName}
            pricingLabel={pricingLabel}
            isFreePricing={isFreePricing}
            bannerUrl={bannerUrl}
            bannerStyle={banner?.url ? null : heroArtImageStyle}
            onLookAround={dismissGate}
          />
        </div>
      ) : null}
    </div>
  );
}
