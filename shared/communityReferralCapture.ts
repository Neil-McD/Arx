import { normalizeCommunityReferralRef } from "./communityClients";

// A community join link can carry ?ref=<code>. The ref is kept in this browser
// per community until the visitor joins, across sign-in and checkout, then sent
// with the join so the owner sees who referred them.
export const COMMUNITY_REFERRAL_STORAGE_KEY = "polynet:community-referral:v1";
const MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;

type Stored = Record<string, { ref: string; capturedAt: number }>;

function read(): Stored {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(COMMUNITY_REFERRAL_STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Keeps the ref from a /c/<slug> link; an earlier ref for the same community is kept (first touch). */
export function captureCommunityReferralFromLocation(): void {
  if (typeof window === "undefined") return;
  const ref = normalizeCommunityReferralRef(new URLSearchParams(window.location.search).get("ref"));
  const segments = window.location.pathname.split("/").filter(Boolean);
  const slug = segments[0] === "c" && segments[1] ? decodeURIComponent(segments[1]).toLowerCase() : null;
  if (!ref || !slug) return;
  const stored = read();
  const existing = stored[slug];
  if (existing && Date.now() - existing.capturedAt < MAX_AGE_MS) return;
  stored[slug] = { ref, capturedAt: Date.now() };
  try {
    window.localStorage.setItem(COMMUNITY_REFERRAL_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // A referral must never block joining.
  }
}

export function readCommunityReferral(communitySlug: string | null | undefined): string | null {
  if (typeof window === "undefined" || !communitySlug) return null;
  const entry = read()[communitySlug.trim().toLowerCase()];
  if (!entry || Date.now() - Number(entry.capturedAt) > MAX_AGE_MS) return null;
  return normalizeCommunityReferralRef(entry.ref);
}
