import { ConvexHttpClient } from "convex/browser";

function readConvexUrl(): string | null {
  const value = ((import.meta as any)?.env?.VITE_CONVEX_URL as string | undefined) ?? "";
  const url = value.trim();
  return url.length > 0 ? url : null;
}

let bootProbePromise: Promise<void> | null = null;

export function bootConvexProbe(): void {
  if (bootProbePromise) return;
  const convexUrl = readConvexUrl();
  if (!convexUrl) {
    return;
  }

  const client = new ConvexHttpClient(convexUrl);
  bootProbePromise = client
    .query("probe:health" as any, {})
    .then((result) => {
      console.info("[convex] probe:health ok", result);
    })
    .catch((error) => {
      console.warn("[convex] probe:health failed", error);
      bootProbePromise = null;
    });
}
