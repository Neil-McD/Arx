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
  // Offline, a player that hasn't loaded yet would show the browser's error page, so the poster
  // stays until the connection is back. A player that already loaded stays put through a blip.
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
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
    if (!frame || !hasPlayerRoom || !online || loadedVideoId === embed.id) return;
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
  }, [embed.id, loadedVideoId, hasPlayerRoom, online]);

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
    /> : hasPlayerRoom ? <span className="deferred-youtube-placeholder"
      style={{ backgroundImage: `url(https://i.ytimg.com/vi/${encodeURIComponent(embed.id)}/hqdefault.jpg)` }}>
      <span className="deferred-youtube-glyph" aria-hidden="true" />
      <span className="deferred-youtube-title">{online ? title : "The video plays when you're back online"}</span>
    </span> : null}
    {!hasPlayerRoom ? <a href={watchUrl.href} target="_blank" rel="noopener noreferrer">Watch on YouTube</a> : null}
  </div>;
}
