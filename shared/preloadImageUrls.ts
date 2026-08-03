import { ensureImageResource, type ImageFetchPriority } from "./useImageResource";

type PreloadImageUrlsOptions = {
  maxUrls?: number;
  timeoutMs?: number;
  fetchPriority?: ImageFetchPriority;
};

export async function preloadImageUrls(
  urls: Array<string | null | undefined>,
  options?: PreloadImageUrlsOptions,
): Promise<void> {
  if (typeof window === "undefined" || typeof Image === "undefined") return;

  const maxUrls = Math.max(1, options?.maxUrls ?? 8);
  const timeoutMs = Math.max(200, options?.timeoutMs ?? 1200);
  const uniqueUrls = Array.from(
    new Set(
      urls
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  ).slice(0, maxUrls);

  if (uniqueUrls.length === 0) return;

  await Promise.all(
    uniqueUrls.map(
      async (url) => {
        await Promise.race([
          ensureImageResource(url, { fetchPriority: options?.fetchPriority }),
          new Promise<void>((resolve) => {
            window.setTimeout(resolve, timeoutMs);
          }),
        ]);
      },
    ),
  );
}
