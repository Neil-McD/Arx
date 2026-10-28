import { useEffect, useState } from "react";

export type ImageResource = { url: string; width: number; height: number };
export type ImageResourceState =
  | { url: null; status: "empty"; resource: null }
  | { url: string; status: "loading"; resource: null }
  | { url: string; status: "ready"; resource: ImageResource }
  | { url: string; status: "error"; resource: null };

type ImageResourceLoader = (url: string) => Promise<ImageResource | null>;

export type ImageFetchPriority = "high" | "low" | "auto";

const DEFAULT_READY_RESOURCE_LIMIT = 256;
const DEFAULT_FAILED_RESOURCE_LIMIT = 128;
const DEFAULT_FAILED_RESOURCE_TTL_MS = 10_000;

export function normalizeImageResourceUrl(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function normalizeCacheLimit(raw: number | undefined, fallback: number): number {
  const parsed = Math.floor(Number(raw));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function validImageResource(resource: ImageResource | null, url: string): ImageResource | null {
  if (!resource || resource.url !== url) return null;
  const width = Number(resource.width);
  const height = Number(resource.height);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return null;
  return { url, width, height };
}

/** One bounded owner for decoded image dimensions and transient failure backoff. */
export class ImageResourceCache {
  private readonly ready = new Map<string, ImageResource>();
  private readonly failed = new Map<string, { retryAt: number }>();
  private readonly inflight = new Map<string, Promise<ImageResource | null>>();
  private readonly readyLimit: number;
  private readonly failedLimit: number;
  private readonly failureTtlMs: number;
  private readonly now: () => number;

  constructor(options?: {
    readyLimit?: number;
    failedLimit?: number;
    failureTtlMs?: number;
    now?: () => number;
  }) {
    this.readyLimit = normalizeCacheLimit(options?.readyLimit, DEFAULT_READY_RESOURCE_LIMIT);
    this.failedLimit = normalizeCacheLimit(options?.failedLimit, DEFAULT_FAILED_RESOURCE_LIMIT);
    this.failureTtlMs = normalizeCacheLimit(options?.failureTtlMs, DEFAULT_FAILED_RESOURCE_TTL_MS);
    this.now = options?.now ?? Date.now;
  }

  private trimOldest<T>(cache: Map<string, T>, limit: number): void {
    while (cache.size > limit) {
      const oldestKey = cache.keys().next().value as string | undefined;
      if (!oldestKey) return;
      cache.delete(oldestKey);
    }
  }

  getReady(url: string): ImageResource | null {
    const resource = this.ready.get(url) ?? null;
    if (!resource) return null;
    this.ready.delete(url);
    this.ready.set(url, resource);
    return resource;
  }

  getReadySnapshot(url: string): ImageResource | null {
    return this.ready.get(url) ?? null;
  }

  getFailureRetryAt(url: string): number | null {
    const failure = this.failed.get(url);
    if (!failure) return null;
    if (failure.retryAt <= this.now()) {
      this.failed.delete(url);
      return null;
    }
    return failure.retryAt;
  }

  getFailureRetryAtSnapshot(url: string): number | null {
    const retryAt = this.failed.get(url)?.retryAt ?? null;
    return retryAt !== null && retryAt > this.now() ? retryAt : null;
  }

  clearFailure(url: string): void {
    this.failed.delete(url);
  }

  getState(url: string | null): ImageResourceState {
    if (!url) return { url: null, status: "empty", resource: null };
    const ready = this.getReadySnapshot(url);
    if (ready) return { url, status: "ready", resource: ready };
    if (this.getFailureRetryAtSnapshot(url) !== null) {
      return { url, status: "error", resource: null };
    }
    return { url, status: "loading", resource: null };
  }

  async load(url: string, loader: ImageResourceLoader): Promise<ImageResource | null> {
    const ready = this.getReady(url);
    if (ready) return ready;
    if (this.getFailureRetryAt(url) !== null) return null;
    const inflight = this.inflight.get(url);
    if (inflight) return inflight;

    const promise = loader(url)
      .then((candidate) => {
        const resource = validImageResource(candidate, url);
        if (resource) {
          this.failed.delete(url);
          this.ready.delete(url);
          this.ready.set(url, resource);
          this.trimOldest(this.ready, this.readyLimit);
          return resource;
        }
        this.failed.delete(url);
        this.failed.set(url, { retryAt: this.now() + this.failureTtlMs });
        this.trimOldest(this.failed, this.failedLimit);
        return null;
      })
      .catch(() => {
        this.failed.delete(url);
        this.failed.set(url, { retryAt: this.now() + this.failureTtlMs });
        this.trimOldest(this.failed, this.failedLimit);
        return null;
      })
      .finally(() => {
        if (this.inflight.get(url) === promise) this.inflight.delete(url);
      });
    this.inflight.set(url, promise);
    return promise;
  }
}

const imageResourceCache = new ImageResourceCache();

function loadBrowserImage(
  url: string,
  fetchPriority: ImageFetchPriority = "auto",
): Promise<ImageResource | null> {
  if (typeof window === "undefined" || typeof Image === "undefined") return Promise.resolve(null);
  return new Promise<ImageResource | null>((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (resource: ImageResource | null) => {
      if (settled) return;
      settled = true;
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
      void image.decode().then(() => finish(resource)).catch(() => finish(null));
    };
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.fetchPriority = fetchPriority;
    image.onload = finishLoaded;
    image.onerror = () => finish(null);
    image.src = url;
    if (image.complete) {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) finishLoaded();
      else finish(null);
    }
  });
}

export function ensureImageResource(
  value: string | null | undefined,
  options?: { fetchPriority?: ImageFetchPriority },
): Promise<ImageResource | null> {
  const url = normalizeImageResourceUrl(value);
  return url
    ? imageResourceCache.load(
        url,
        (resourceUrl) => loadBrowserImage(resourceUrl, options?.fetchPriority),
      )
    : Promise.resolve(null);
}

export function resolveImageResourcePresentationState(
  current: ImageResourceState,
  url: string | null,
  cache: ImageResourceCache = imageResourceCache,
): ImageResourceState {
  const ready = url ? cache.getReadySnapshot(url) : null;
  if (url && ready) return { url, status: "ready", resource: ready };
  return current.url === url ? current : cache.getState(url);
}

export function useImageResource(
  value: string | null | undefined,
  options?: { enabled?: boolean; fetchPriority?: ImageFetchPriority },
): ImageResourceState {
  const url = normalizeImageResourceUrl(value);
  const enabled = options?.enabled ?? true;
  const fetchPriority = options?.fetchPriority;
  const [state, setState] = useState<ImageResourceState>(() => imageResourceCache.getState(url));

  useEffect(() => {
    setState(imageResourceCache.getState(url));
    if (!url || !enabled || imageResourceCache.getReady(url)) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let automaticRetryAvailable = true;

    const clearRetryTimer = () => {
      if (retryTimer === null) return;
      clearTimeout(retryTimer);
      retryTimer = null;
    };
    const load = async (forceRetry = false) => {
      if (forceRetry) imageResourceCache.clearFailure(url);
      const resource = await ensureImageResource(url, { fetchPriority });
      if (cancelled) return;
      if (resource) {
        clearRetryTimer();
        setState({ url, status: "ready", resource });
        return;
      }

      setState({ url, status: "error", resource: null });
      const retryAt = imageResourceCache.getFailureRetryAt(url);
      if (!automaticRetryAvailable || retryAt === null) return;
      automaticRetryAvailable = false;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void load(true);
      }, Math.max(1, retryAt - Date.now()));
    };
    const handleOnline = () => {
      clearRetryTimer();
      automaticRetryAvailable = true;
      void load(true);
    };

    if (typeof window !== "undefined") window.addEventListener("online", handleOnline);
    void load();
    return () => {
      cancelled = true;
      clearRetryTimer();
      if (typeof window !== "undefined") window.removeEventListener("online", handleOnline);
    };
  }, [enabled, fetchPriority, url]);

  return resolveImageResourcePresentationState(state, url);
}
