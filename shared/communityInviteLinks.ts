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

function buildDesktopWebInviteLink(args: {
  shareBaseUrl: string | null;
  communityId?: string | null;
  inviteCode: string;
}): string | null {
  if (!args.shareBaseUrl) return null;
  const code = encodeURIComponent(normalizeInviteCode(args.inviteCode));
  const communityPath = args.communityId ? `/c/${encodeURIComponent(args.communityId)}` : "";
  return `${args.shareBaseUrl}${communityPath}?invite=${code}`;
}

function buildDesktopDeepInviteLink(inviteCode: string): string {
  const code = encodeURIComponent(normalizeInviteCode(inviteCode));
  return `arx://join?invite=${code}`;
}

export function buildDesktopBestInviteLink(args: {
  shareBaseUrl: string | null;
  communityId?: string | null;
  inviteCode: string;
}): { kind: "web" | "app"; link: string } {
  const web = buildDesktopWebInviteLink(args);
  if (web) return { kind: "web", link: web };
  return { kind: "app", link: buildDesktopDeepInviteLink(args.inviteCode) };
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
