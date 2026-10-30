import { useEffect, useSyncExternalStore } from "react";
import { downloadCloudCommunityChatAttachment } from "../../../../shared/cloudCommunityChatGateway";

// Images in invite-only channels and pods come through the checked download,
// not a public URL. One download per attachment serves every place that shows
// it (the chat, a pod's Pinned and Files & videos), and every waiting card
// hears when it lands. A stalled download (no bytes for 8s) is retried once. Object URLs live for the page, like the images.

type Entry = { url: string | null; inFlight: Promise<string> | null };

const entries = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();
// A body that stops moving for this long is retried; one that keeps moving
// may take as long as it needs.
const DOWNLOAD_IDLE_MS = 8_000;

function notify(attachmentId: string) {
  listeners.get(attachmentId)?.forEach((listener) => listener());
}

function downloadOnce(session: unknown, attachmentId: string, mime: string | null): Promise<string> {
  return downloadCloudCommunityChatAttachment({ session, attachmentId, idleTimeoutMs: DOWNLOAD_IDLE_MS }).then((bytes) => URL.createObjectURL(mime && !bytes.type.startsWith("image/") ? new Blob([bytes], { type: mime }) : bytes));
}

/** Loads (or joins the load of) one protected image; retries once. */
export function loadProtectedImage(session: unknown, attachmentId: string, mime: string | null = null): Promise<string> {
  const entry = entries.get(attachmentId) ?? { url: null, inFlight: null };
  if (entry.url) return Promise.resolve(entry.url);
  if (entry.inFlight) return entry.inFlight;
  const inFlight = downloadOnce(session, attachmentId, mime)
    .catch((error) => {
      console.warn("[images] protected image stalled, retrying", attachmentId, error);
      return downloadOnce(session, attachmentId, mime);
    })
    .then((url) => {
      entries.set(attachmentId, { url, inFlight: null });
      notify(attachmentId);
      return url;
    }, (error) => {
      entries.set(attachmentId, { url: null, inFlight: null });
      notify(attachmentId);
      throw error;
    });
  entries.set(attachmentId, { url: null, inFlight });
  return inFlight;
}

export function readyProtectedImage(attachmentId: string): string | null {
  return entries.get(attachmentId)?.url ?? null;
}

/** The image's URL once loaded; starts the load while a session is there. */
export function useProtectedImage(session: unknown, attachmentId: string, mime: string | null = null): string | null {
  const url = useSyncExternalStore(
    (listener) => {
      const set = listeners.get(attachmentId) ?? new Set();
      set.add(listener);
      listeners.set(attachmentId, set);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(attachmentId);
      };
    },
    () => readyProtectedImage(attachmentId),
  );
  useEffect(() => {
    if (url || !session) return;
    loadProtectedImage(session, attachmentId, mime).catch((error) => console.warn("[images] protected image failed", attachmentId, error));
  }, [url, session, attachmentId, mime]);
  return url;
}
