import { useEffect, useState } from "react";

import type { CommunityFunnelHeroMediaKind } from "../../../../shared/communityTypes";
import { parseEmbedUrl, type ParsedEmbed } from "../../../../shared/linkEmbedUi";

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
    case "wistia":
      url.searchParams.set("autoplay", "1");
      break;
  }
  return url.toString();
}

const preconnectedOrigins = new Set<string>();

function preconnectEmbedOrigin(embed: ParsedEmbed) {
  try {
    const origin = new URL(embed.src).origin;
    if (preconnectedOrigins.has(origin)) return;
    preconnectedOrigins.add(origin);
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = origin;
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  } catch {
    // Invalid player origins simply skip the optional connection warm-up.
  }
}

type DeferredCommunityHeroMediaOptions = {
  eager?: boolean;
  onActivate?: () => void;
  playHint?: string | null;
};

function DeferredEmbedHero(
  props: { embed: ParsedEmbed } & DeferredCommunityHeroMediaOptions,
) {
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

  const warmConnection = () => preconnectEmbedOrigin(props.embed);

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

export function renderDeferredCommunityHeroMedia(
  kind: CommunityFunnelHeroMediaKind,
  url: string | null,
  options?: DeferredCommunityHeroMediaOptions,
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
