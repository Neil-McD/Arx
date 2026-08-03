type ImageVisibilityEntry = Pick<
  IntersectionObserverEntry,
  "target" | "isIntersecting" | "intersectionRatio"
>;

type ImageVisibilityObserver = Pick<
  IntersectionObserver,
  "observe" | "unobserve" | "disconnect"
>;

type ImageVisibilityObserverFactory = (
  callback: (entries: ImageVisibilityEntry[]) => void,
) => ImageVisibilityObserver;

export type ImageLoadingMode = "eager" | "lazy";

export type ImageLoadPermission = {
  url: string | null;
  loading: ImageLoadingMode;
  allowed: boolean;
};

/** A prior URL or prior loading mode can never authorize a new deferred request. */
export function isImageLoadAllowed(
  url: string | null,
  loading: ImageLoadingMode,
  permission: ImageLoadPermission,
): boolean {
  return loading === "eager" || (
    permission.url === url &&
    permission.loading === loading &&
    permission.allowed
  );
}

/** One observer for every deferred image frame, rather than one observer per image. */
export class ImageVisibilityRegistry {
  private observer: ImageVisibilityObserver | null = null;
  private readonly callbacks = new Map<Element, Set<() => void>>();

  constructor(private readonly createObserver: ImageVisibilityObserverFactory) {}

  private handleEntries = (entries: ImageVisibilityEntry[]) => {
    for (const entry of entries) {
      if (!entry.isIntersecting && entry.intersectionRatio <= 0) continue;
      const callbacks = this.callbacks.get(entry.target);
      if (!callbacks) continue;
      this.callbacks.delete(entry.target);
      this.observer?.unobserve(entry.target);
      for (const callback of callbacks) callback();
    }
    this.releaseObserverWhenIdle();
  };

  private requireObserver(): ImageVisibilityObserver {
    if (!this.observer) this.observer = this.createObserver(this.handleEntries);
    return this.observer;
  }

  private releaseObserverWhenIdle() {
    if (this.callbacks.size > 0 || !this.observer) return;
    this.observer.disconnect();
    this.observer = null;
  }

  observe(target: Element, onVisible: () => void): () => void {
    const existing = this.callbacks.get(target);
    if (existing) {
      existing.add(onVisible);
    } else {
      this.callbacks.set(target, new Set([onVisible]));
      this.requireObserver().observe(target);
    }

    return () => {
      const callbacks = this.callbacks.get(target);
      if (!callbacks) return;
      callbacks.delete(onVisible);
      if (callbacks.size === 0) {
        this.callbacks.delete(target);
        this.observer?.unobserve(target);
      }
      this.releaseObserverWhenIdle();
    };
  }

  /** Exposed for deterministic behavior tests; browsers call the same path. */
  notify(entries: ImageVisibilityEntry[]) {
    this.handleEntries(entries);
  }
}

let sharedRegistry: ImageVisibilityRegistry | null = null;

function getSharedRegistry(): ImageVisibilityRegistry | null {
  if (typeof window === "undefined" || typeof window.IntersectionObserver === "undefined") {
    return null;
  }
  if (!sharedRegistry) {
    sharedRegistry = new ImageVisibilityRegistry(
      (callback) => new window.IntersectionObserver(
        (entries) => callback(entries),
        { rootMargin: "400px 0px" },
      ),
    );
  }
  return sharedRegistry;
}

export function observeImageNearViewport(target: Element, onVisible: () => void): () => void {
  const registry = getSharedRegistry();
  if (!registry) {
    onVisible();
    return () => {};
  }
  return registry.observe(target, onVisible);
}
