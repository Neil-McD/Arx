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

export function CommunityInteractionYouTubeEmbed(props: {
  embed: YouTubeEmbed;
}) {
  const [active, setActive] = useState(false);
  const [thumbnailIndex, setThumbnailIndex] = useState(0);
  const thumbnailUrl = props.embed.thumbnailUrls[thumbnailIndex] ?? null;

  return (
    <div
      className={`community-interaction-youtube${active ? " is-active" : ""}`}
      data-community-youtube-embed={props.embed.id}
      onClick={(event) => event.stopPropagation()}
    >
      {active ? (
        <iframe
          src={activatedYouTubeUrl(props.embed.src)}
          title="YouTube video player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-popups allow-presentation allow-same-origin allow-scripts"
        />
      ) : (
        <button
          type="button"
          className="community-interaction-youtube-play"
          aria-label="Play YouTube video"
          onClick={() => setActive(true)}
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
            <span className="community-interaction-youtube-empty" aria-hidden="true" />
          )}
          <span className="community-interaction-youtube-play-icon" aria-hidden="true">
            <Play size={22} fill="currentColor" />
          </span>
        </button>
      )}
    </div>
  );
}
