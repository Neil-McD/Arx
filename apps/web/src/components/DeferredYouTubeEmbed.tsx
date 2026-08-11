import { useState } from "react";
import { Play } from "lucide-react";

import type { ParsedEmbed } from "../../../../shared/linkEmbedUi";

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
}: {
  embed: YouTubeEmbed;
  title?: string;
}) {
  const [isActive, setIsActive] = useState(false);
  const [thumbnailIndex, setThumbnailIndex] = useState(0);
  const thumbnailUrl = embed.thumbnailUrls[thumbnailIndex] ?? null;

  return (
    <div
      className={`deferred-youtube${isActive ? " is-active" : ""}`}
      data-community-youtube-embed={embed.id}
      data-resource-media="true"
      onClick={(event) => event.stopPropagation()}
    >
      {isActive ? (
        <iframe
          src={activatedYouTubeUrl(embed.src)}
          title={title}
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
          aria-label={`Play ${title}`}
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
  );
}
