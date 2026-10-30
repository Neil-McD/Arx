import { useEffect, useRef, useState } from "react";
import {
  clampCommunityEmbedHeight,
  COMMUNITY_EMBED_MAX_VALUE_LENGTH,
  COMMUNITY_EMBED_THEME_VARIABLES,
  readCommunityEmbedChildMessage,
  type CommunityEmbedBlock,
  type CommunityEmbedParentMessage,
  type CommunityEmbedStorage,
} from "./communityEmbed";

export type CommunityEmbedContext = {
  /** The community site's origin, like https://the-2-hour-club.polynet.page. */
  siteOrigin: string;
  storage: CommunityEmbedStorage;
};

function readThemeVariables(element: Element): Record<string, string> {
  const style = getComputedStyle(element);
  const variables: Record<string, string> = {};
  for (const name of COMMUNITY_EMBED_THEME_VARIABLES) {
    const value = style.getPropertyValue(name).trim();
    if (value) variables[name] = value;
  }
  return variables;
}

/**
 * One widget from the community site in a sandboxed frame. Without
 * allow-same-origin the frame gets an opaque origin, so messages are trusted by
 * the window they come from, never by their origin.
 */
export function CommunityEmbedFrame({ block, context }: { block: CommunityEmbedBlock; context: CommunityEmbedContext }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(block.height);
  const src = `${context.siteOrigin}/${block.src}`;

  useEffect(() => {
    setHeight(block.height);
  }, [block.height, src]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const reply = (message: CommunityEmbedParentMessage) => {
      frame.contentWindow?.postMessage(message, "*");
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) return;
      const message = readCommunityEmbedChildMessage(event.data);
      if (!message) return;
      switch (message.type) {
        case "ready":
          reply({ polynetEmbed: 1, type: "theme", variables: readThemeVariables(frame) });
          return;
        case "resize":
          setHeight(clampCommunityEmbedHeight(message.height));
          return;
        case "load":
          context.storage
            .load(message.key)
            .catch(() => null)
            .then((value) => reply({ polynetEmbed: 1, type: "loaded", id: message.id, value }));
          return;
        case "save":
          if (message.value.length > COMMUNITY_EMBED_MAX_VALUE_LENGTH) {
            reply({ polynetEmbed: 1, type: "saved", id: message.id, ok: false });
            return;
          }
          context.storage
            .save(message.key, message.value)
            .catch(() => false)
            .then((ok) => reply({ polynetEmbed: 1, type: "saved", id: message.id, ok }));
          return;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [context, src]);

  return (
    <figure className="md-community-embed" data-resource-media="true">
      <iframe
        ref={frameRef}
        className="md-community-embed-frame"
        src={src}
        title={block.title}
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        loading="lazy"
        style={{ height }}
      />
      <figcaption className="md-community-embed-caption">
        <span>{block.title}</span>
        <a href={src} target="_blank" rel="noreferrer">Open full screen</a>
      </figcaption>
    </figure>
  );
}

/** Where a widget can't run (no community site, or an invalid block). */
export function CommunityEmbedPlaceholder({ title, message, fallbackSrc }: { title: string; message: string; fallbackSrc?: string | null }) {
  return (
    <figure className="md-community-embed md-community-embed--placeholder">
      {fallbackSrc ? <img src={fallbackSrc} alt={title} /> : null}
      <figcaption className="md-community-embed-caption">
        <span>{title}</span>
        <span>{message}</span>
      </figcaption>
    </figure>
  );
}

/** Keeps a member's widget answers in this browser, per community and widget. */
export function createBrowserCommunityEmbedStorage(scope: string): CommunityEmbedStorage {
  const storageKey = (key: string) => `polynet-embed:${scope}:${key}`;
  return {
    async load(key) {
      try {
        return window.localStorage.getItem(storageKey(key));
      } catch {
        return null;
      }
    },
    async save(key, value) {
      try {
        window.localStorage.setItem(storageKey(key), value);
        return true;
      } catch {
        return false;
      }
    },
  };
}
