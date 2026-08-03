import { useEffect, useState } from "react";

export type ImageResource = { url: string; width: number; height: number };
type ImageResourceState =
  | { status: "empty"; resource: null }
  | { status: "loading"; resource: null }
  | { status: "ready"; resource: ImageResource }
  | { status: "error"; resource: null };

const readyResources = new Map<string, ImageResource>();
const failedResources = new Set<string>();
const inflightLoads = new Map<string, Promise<ImageResource | null>>();

export function normalizeImageResourceUrl(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

export function getReadyImageResource(value: string | null | undefined): ImageResource | null {
  const url = normalizeImageResourceUrl(value);
  return url ? readyResources.get(url) ?? null : null;
}

export function ensureImageResource(value: string | null | undefined): Promise<ImageResource | null> {
  const url = normalizeImageResourceUrl(value);
  if (!url) return Promise.resolve(null);
  const ready = readyResources.get(url);
  if (ready) return Promise.resolve(ready);
  if (failedResources.has(url)) return Promise.resolve(null);
  if (typeof window === "undefined" || typeof Image === "undefined") return Promise.resolve(null);
  const inflight = inflightLoads.get(url);
  if (inflight) return inflight;

  const promise = new Promise<ImageResource | null>((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (resource: ImageResource | null) => {
      if (settled) return;
      settled = true;
      inflightLoads.delete(url);
      if (resource) readyResources.set(url, resource);
      else failedResources.add(url);
      resolve(resource);
    };
    const finishLoaded = () => {
      const resource = image.naturalWidth > 0 && image.naturalHeight > 0
        ? { url, width: image.naturalWidth, height: image.naturalHeight }
        : null;
      if (!resource || typeof image.decode !== "function") {
        finish(resource);
        return;
      }
      void image.decode().then(() => finish(resource)).catch(() => finish(resource));
    };
    image.decoding = "async";
    image.onload = finishLoaded;
    image.onerror = () => finish(null);
    image.src = url;
    if (image.complete) {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) finishLoaded();
      else finish(null);
    }
  });
  inflightLoads.set(url, promise);
  return promise;
}

function initialState(url: string | null): ImageResourceState {
  if (!url) return { status: "empty", resource: null };
  const ready = readyResources.get(url);
  if (ready) return { status: "ready", resource: ready };
  if (failedResources.has(url)) return { status: "error", resource: null };
  return { status: "loading", resource: null };
}

export function useImageResource(value: string | null | undefined): ImageResourceState {
  const url = normalizeImageResourceUrl(value);
  const [state, setState] = useState<ImageResourceState>(() => initialState(url));
  useEffect(() => {
    setState(initialState(url));
    if (!url || readyResources.has(url) || failedResources.has(url)) return;
    let cancelled = false;
    void ensureImageResource(url).then((resource) => {
      if (cancelled) return;
      setState(resource ? { status: "ready", resource } : { status: "error", resource: null });
    });
    return () => { cancelled = true; };
  }, [url]);
  const currentReady = url ? readyResources.get(url) ?? null : null;
  return currentReady ? { status: "ready", resource: currentReady } : state;
}
