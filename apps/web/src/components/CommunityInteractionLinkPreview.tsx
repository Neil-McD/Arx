import { useState } from "react";
import { ExternalLink, Play } from "lucide-react";
import type { CommunityInteractionEmbed } from "../../../../shared/cloudCommunityInteractionsGateway";

function hostnameOf(raw: string | null): string {
  try {
    return new URL(String(raw ?? "")).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function providerLabel(embed: CommunityInteractionEmbed): string {
  const provider = String(embed.provider || hostnameOf(embed.source_url)).toLowerCase();
  if (provider === "loom.com") return "Loom";
  if (provider === "youtube.com" || provider === "youtu.be" || provider === "youtube-nocookie.com") {
    return "YouTube";
  }
  if (provider === "x.com" || provider === "twitter.com") return "X";
  return provider;
}

function approvedHttpsUrl(raw: string | null): string | null {
  try {
    const url = new URL(String(raw ?? ""));
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function approvedVideoUrl(raw: string, sourceRaw: string): string | null {
  try {
    const approvedVideo = approvedHttpsUrl(raw);
    const approvedSource = approvedHttpsUrl(sourceRaw);
    if (!approvedVideo || !approvedSource) return null;
    const videoUrl = new URL(approvedVideo);
    const sourceUrl = new URL(approvedSource);
    const videoHost = videoUrl.hostname.toLowerCase().replace(/^www\./, "");
    const sourceHost = sourceUrl.hostname.toLowerCase().replace(/^www\./, "");
    const isLoom =
      sourceHost === "loom.com" &&
      videoHost === "loom.com" &&
      /^\/embed\/[A-Za-z0-9_-]{8,160}\/?$/.test(videoUrl.pathname);
    const isYouTube =
      (sourceHost === "youtube.com" || sourceHost === "youtube-nocookie.com" || sourceHost === "youtu.be") &&
      (videoHost === "youtube.com" || videoHost === "youtube-nocookie.com") &&
      (
        /^\/embed\/[A-Za-z0-9_-]{6,80}\/?$/.test(videoUrl.pathname) ||
        (videoUrl.pathname === "/embed" && Boolean(videoUrl.searchParams.get("list")))
      );
    return isLoom || isYouTube ? videoUrl.toString() : null;
  } catch {
    return null;
  }
}

function activatedVideoUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "loom.com") url.searchParams.set("autoplay", "1");
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      url.searchParams.set("autoplay", "1");
      url.searchParams.set("playsinline", "1");
      url.searchParams.set("rel", "0");
    }
    return url.toString();
  } catch {
    return raw;
  }
}

function VideoPreviewMetadata(props: { href: string; provider: string; title: string }) {
  return (
    <a
      className="community-interaction-embed-text community-interaction-embed-video-link"
      href={props.href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`Open ${props.title} on ${props.provider} in a new tab`}
      onClick={(event) => event.stopPropagation()}
    >
      <span className="community-interaction-embed-provider-row">
        <span className="community-interaction-embed-provider">{props.provider}</span>
        <ExternalLink size={12} aria-hidden="true" />
      </span>
      <span className="community-interaction-embed-title">{props.title}</span>
    </a>
  );
}

function VideoLinkPreview(props: {
  embed: CommunityInteractionEmbed;
  href: string;
  mediaUrl: string | null;
  videoUrl: string;
}) {
  const [active, setActive] = useState(false);
  const title = props.embed.title || "Shared video";
  const provider = providerLabel(props.embed);
  return (
    <div
      className={`community-interaction-embed is-video${active ? " is-active" : ""}`}
      data-preview-kind="video"
      onClick={(event) => event.stopPropagation()}
    >
      {active ? (
        <>
          <div className="community-interaction-embed-player">
            <iframe
              src={activatedVideoUrl(props.videoUrl)}
              title={`${title} player`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              sandbox="allow-popups allow-presentation allow-same-origin allow-scripts"
            />
          </div>
          <VideoPreviewMetadata href={props.href} provider={provider} title={title} />
        </>
      ) : (
        <div className="community-interaction-embed-summary">
          <VideoPreviewMetadata href={props.href} provider={provider} title={title} />
          <button
            type="button"
            className="community-interaction-embed-play"
            aria-label={`Play ${title}`}
            onClick={() => setActive(true)}
          >
            {props.mediaUrl ? (
              <img
                className="community-interaction-embed-media"
                src={props.mediaUrl}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="community-interaction-embed-media is-empty" aria-hidden="true" />
            )}
            <span className="community-interaction-embed-play-icon" aria-hidden="true">
              <Play size={15} fill="currentColor" />
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

function SocialPostLinkPreview(props: {
  embed: CommunityInteractionEmbed;
  href: string;
}) {
  const author = props.embed.author_name || props.embed.title || "X post";
  const body = props.embed.description || "View this post on X";
  return (
    <a
      className="community-interaction-embed is-social-post"
      data-preview-kind="social_post"
      href={props.href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`View ${author}'s post on X in a new tab`}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="community-interaction-embed-social-header">
        <span className="community-interaction-embed-social-author">{author}</span>
        <span className="community-interaction-embed-provider">X</span>
      </div>
      <span className="community-interaction-embed-social-body">{body}</span>
    </a>
  );
}

function GenericLinkPreview(props: {
  embed: CommunityInteractionEmbed;
  href: string;
  mediaUrl: string | null;
}) {
  const provider = providerLabel(props.embed);
  return (
    <a
      className={`community-interaction-embed is-link${props.mediaUrl ? " has-media" : ""}`}
      data-preview-kind="link"
      href={props.href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`${props.embed.title || provider || "Open link"} (opens in a new tab)`}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="community-interaction-embed-text">
        {provider ? <span className="community-interaction-embed-provider">{provider}</span> : null}
        {props.embed.title ? <span className="community-interaction-embed-title">{props.embed.title}</span> : null}
        {props.embed.description ? (
          <span className="community-interaction-embed-desc">{props.embed.description}</span>
        ) : null}
      </div>
      {props.mediaUrl ? (
        <img
          className="community-interaction-embed-media"
          src={props.mediaUrl}
          alt={props.embed.image_alt || ""}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : null}
    </a>
  );
}

export function CommunityInteractionLinkPreview(props: { embed: CommunityInteractionEmbed }) {
  const href = approvedHttpsUrl(props.embed.source_url || props.embed.normalized_source_url);
  if (!href) return null;
  const mediaUrl = approvedHttpsUrl(props.embed.image_url);
  const videoUrl = props.embed.video_url ? approvedVideoUrl(props.embed.video_url, href) : null;
  if (props.embed.preview_kind === "video" && videoUrl) {
    return <VideoLinkPreview embed={props.embed} href={href} mediaUrl={mediaUrl} videoUrl={videoUrl} />;
  }
  if (props.embed.preview_kind === "social_post" && props.embed.author_name && props.embed.description) {
    return <SocialPostLinkPreview embed={props.embed} href={href} />;
  }
  return <GenericLinkPreview embed={props.embed} href={href} mediaUrl={mediaUrl} />;
}
