import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";

import type { ParsedEmbed } from "../../../../shared/linkEmbedUi";
import { loadYouTubeMetadata, type YouTubeMetadata } from "../../../../shared/youtubeMetadata";

type YouTubeEmbed = Extract<ParsedEmbed, { provider: "youtube" }>;

function activatedYouTubeUrl(raw: string): string {
  const url = new URL(raw);
  url.searchParams.set("autoplay", "1");
  url.searchParams.set("playsinline", "1");
  url.searchParams.set("rel", "0");
  return url.toString();
}

export function DeferredYouTubeEmbed({
  embed,
  title = "YouTube video",
  showMetadata = false,
}: {
  embed: YouTubeEmbed;
  title?: string;
  showMetadata?: boolean;
}) {
  const [isActive, setIsActive] = useState(false);
  const [thumbnailIndex, setThumbnailIndex] = useState(0);
  const thumbnailUrl = embed.thumbnailUrls[thumbnailIndex] ?? null;
  const cardRef = useRef<HTMLDivElement>(null);
  const [metadata, setMetadata] = useState<YouTubeMetadata | null>(null);
  useEffect(() => {
    setMetadata(null);
    setIsActive(false);
    setThumbnailIndex(0);
    if (!showMetadata || !cardRef.current) return;
    let disposed = false;
    const load = () => { void loadYouTubeMetadata(embed.id).then((value) => { if (!disposed) setMetadata(value); }); };
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); load(); }
    }, { rootMargin: "200px" });
    observer.observe(cardRef.current);
    return () => { disposed = true; observer.disconnect(); };
  }, [embed.id, showMetadata]);
  const displayTitle = metadata?.title || title;

  return (
    <div ref={cardRef} className={showMetadata ? "message-video-card" : undefined}>
    <div
      className={`deferred-youtube${isActive ? " is-active" : ""}`}
      data-community-youtube-embed={embed.id}
      data-resource-media="true"
      onClick={(event) => event.stopPropagation()}
    >
      {isActive ? (
        <iframe
          src={activatedYouTubeUrl(embed.src)}
          title={displayTitle}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-popups allow-presentation allow-same-origin allow-scripts"
        />
      ) : (
        <button
          type="button"
          className="deferred-youtube-play"
          aria-label={`Play ${displayTitle}`}
          onClick={() => setIsActive(true)}
        >
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setThumbnailIndex((current) => current + 1)}
            />
          ) : (
            <span className="deferred-youtube-empty" aria-hidden="true" />
          )}
          <span className="deferred-youtube-play-icon" aria-hidden="true">
            <Play size={22} fill="currentColor" />
          </span>
        </button>
      )}
    </div>
    {showMetadata ? (
      <a className="message-video-caption" href={`https://www.youtube.com/watch?v=${embed.id}`} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>
        <strong>{displayTitle}</strong>
        <span>{metadata?.author || "YouTube"} · Open video</span>
      </a>
    ) : null}
    </div>
  );
}
