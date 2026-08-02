import { useEffect, useState } from "react";

const readyImageUrls = new Set<string>();
const inflightImageLoads = new Map<string, Promise<boolean>>();

function normalizeImageUrl(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

export function isImageUrlReady(url: string | null | undefined): boolean {
  const normalized = normalizeImageUrl(url);
  if (!normalized) return false;
  return readyImageUrls.has(normalized);
}

export function ensureImageUrlReady(
  url: string | null | undefined,
): Promise<boolean> {
  const normalized = normalizeImageUrl(url);
  if (!normalized) return Promise.resolve(false);
  if (readyImageUrls.has(normalized)) return Promise.resolve(true);
  if (typeof window === "undefined" || typeof Image === "undefined") return Promise.resolve(false);

  const existing = inflightImageLoads.get(normalized);
  if (existing) return existing;

  const promise = new Promise<boolean>((resolve) => {
    let settled = false;
    const image = new Image();
    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      inflightImageLoads.delete(normalized);
      if (ready) readyImageUrls.add(normalized);
      resolve(ready);
    };
    const settleReady = () => {
      if (typeof image.decode === "function") {
        void image.decode()
          .then(() => finish(image.naturalWidth > 0))
          .catch(() => finish(false));
        return;
      }
      finish(image.naturalWidth > 0);
    };
    image.decoding = "async";
    image.onload = settleReady;
    image.onerror = () => finish(false);
    image.src = normalized;
    if (image.complete) {
      if (image.naturalWidth > 0) settleReady();
      else finish(false);
    }
  });

  inflightImageLoads.set(normalized, promise);
  return promise;
}

export function useImageUrlReady(url: string | null | undefined): boolean {
  const normalized = normalizeImageUrl(url);
  const [isReady, setIsReady] = useState(() => isImageUrlReady(normalized));

  useEffect(() => {
    if (!normalized) {
      setIsReady(false);
      return;
    }
    if (isImageUrlReady(normalized)) {
      setIsReady(true);
      return;
    }
    let cancelled = false;
    setIsReady(false);
    void ensureImageUrlReady(normalized).then((ready) => {
      if (cancelled) return;
      setIsReady(ready);
    });
    return () => {
      cancelled = true;
    };
  }, [normalized]);

  return isReady;
}
