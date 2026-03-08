export function normalizeInviteCode(inviteKey: string): string {
  return inviteKey.trim().replace(/\s+/g, "").toUpperCase();
}

export function formatInviteLabel(inviteKey: string, communityName?: string | null): string {
  const cleaned = (communityName ?? "").trim();
  return cleaned ? cleaned : inviteKey;
}

export function generateInviteCode(length = 10): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

function buildCommunityShareLink(origin: string, communitySlug: string): string {
  const slug = (communitySlug ?? "").trim().toLowerCase();
  const normalizedOrigin = (origin ?? "").trim().replace(/\/+$/, "");
  if (!slug) return normalizedOrigin;
  return `${normalizedOrigin}/c/${encodeURIComponent(slug)}`;
}

export function buildCommunityInstantAccessLink(origin: string, communitySlug: string, inviteCode: string): string {
  const base = buildCommunityShareLink(origin, communitySlug);
  const code = (inviteCode ?? "").trim();
  if (!code) return base;
  const url = new URL(base, origin);
  url.searchParams.set("invite", code);
  return url.toString();
}
