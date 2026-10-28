/* Shared public-funnel primitives: the authoritative join-action contract,
   deferred video hero, and admission status. Layout belongs to the one public
   renderer; this file does not own a second funnel surface. */
import { useEffect, useState } from "react";

import type { CommunityFunnelHeroMediaKind } from "../../../../shared/communityTypes";
import { parseEmbedUrl, type ParsedEmbed } from "../../../../shared/linkEmbedUi";
import "./CommunityFunnelSurface.css";

export type CommunityFunnelSurfaceAction = {
  communityName: string;
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
};

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

const preconnectedOrigins = new Set<string>();

/* Warm the player's connection before the click so play feels instant. */
function preconnectEmbedOrigins(embed: ParsedEmbed) {
  try {
    const origins = [new URL(embed.src).origin];
    for (const origin of origins) {
      if (preconnectedOrigins.has(origin)) continue;
      preconnectedOrigins.add(origin);
      const link = document.createElement("link");
      link.rel = "preconnect";
      link.href = origin;
      link.crossOrigin = "anonymous";
      document.head.appendChild(link);
    }
  } catch {
    /* ignore */
  }
}

export type DeferredEmbedHeroOptions = {
  /** The embed is the visible hero (e.g. inside the join gate): load the
      thumbnail eagerly and warm the player connection on hover. */
  eager?: boolean;
  /** Called when the visitor starts playback. */
  onActivate?: () => void;
  /** Honest hint under the play button ("Watch the intro"). */
  playHint?: string | null;
};

function DeferredEmbedHero(props: { embed: ParsedEmbed } & DeferredEmbedHeroOptions) {
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

  const warmConnection = () => preconnectEmbedOrigins(props.embed);

  return (
    <button
      className="public-funnel-media-shell public-funnel-media-deferred"
      type="button"
      onClick={() => {
        setIsActive(true);
        props.onActivate?.();
      }}
      onPointerEnter={props.eager ? warmConnection : undefined}
      onFocus={props.eager ? warmConnection : undefined}
      aria-label="Play community funnel video"
    >
      {thumbnailUrl ? (
        <img
          className="public-funnel-media-image"
          src={thumbnailUrl}
          alt=""
          draggable={false}
          loading={props.eager ? "eager" : "lazy"}
          {...(props.eager ? ({ fetchpriority: "high" } as Record<string, string>) : null)}
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
      {props.playHint ? <span className="public-funnel-media-hint">{props.playHint}</span> : null}
    </button>
  );
}

export function renderHeroMediaDefault(
  kind: CommunityFunnelHeroMediaKind,
  url: string | null,
  options?: DeferredEmbedHeroOptions,
) {
  if (!url) return null;
  if (kind === "video") {
    const embed = parseEmbedUrl(url);
    if (embed) {
      return <DeferredEmbedHero embed={embed} {...options} />;
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


export function ActionStatusCards(props: { action: CommunityFunnelSurfaceAction }) {
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
    </>
  );
}
