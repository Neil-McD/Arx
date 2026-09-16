import { useEffect, useRef, useState } from "react";
import type { ParsedEmbed } from "../../../../shared/linkEmbedUi";

type YouTubeEmbed = Extract<ParsedEmbed, { provider: "youtube" }>;

/** YouTube owns the presentation; Polynet only reserves space and defers loading. */
export function DeferredYouTubeEmbed({ embed, title = "YouTube video" }: {
  embed: YouTubeEmbed;
  title?: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [loadedVideoId, setLoadedVideoId] = useState<string | null>(null);
  const [hasPlayerRoom, setHasPlayerRoom] = useState(false);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => setHasPlayerRoom(frame.clientWidth >= 200);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !hasPlayerRoom || loadedVideoId === embed.id) return;
    if (typeof IntersectionObserver === "undefined") {
      setLoadedVideoId(embed.id);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        setLoadedVideoId(embed.id);
      }
    }, { rootMargin: "200px" });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [embed.id, loadedVideoId, hasPlayerRoom]);

  const source = new URL(embed.src);
  source.searchParams.set("playsinline", "1");
  const watchUrl = new URL("https://www.youtube.com/watch");
  watchUrl.searchParams.set("v", embed.id);
  if (source.searchParams.has("start")) watchUrl.searchParams.set("t", source.searchParams.get("start")!);
  return <div ref={frameRef} className={`deferred-youtube${hasPlayerRoom ? "" : " is-too-narrow"}`}
    data-community-youtube-embed={embed.id} data-resource-media="true"
    onClick={(event) => event.stopPropagation()}>
    {hasPlayerRoom && loadedVideoId === embed.id ? <iframe
      src={source.href}
      title={title}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
      allowFullScreen
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
      sandbox="allow-popups allow-presentation allow-same-origin allow-scripts"
    /> : hasPlayerRoom ? <span className="deferred-youtube-placeholder">{title}</span> : null}
    {!hasPlayerRoom ? <a href={watchUrl.href} target="_blank" rel="noopener noreferrer">Watch on YouTube</a> : null}
  </div>;
}
