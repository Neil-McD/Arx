export type SocialProfileKind = "youtube" | "x" | "instagram";

export type SocialProfileLinks = {
  youtube: string;
  x: string;
  instagram: string;
};

export const SOCIAL_PROFILE_KINDS: readonly SocialProfileKind[] = ["youtube", "x", "instagram"];

const SOCIAL_PROFILE_HOSTS: Record<SocialProfileKind, readonly string[]> = {
  youtube: ["youtube.com", "m.youtube.com"],
  x: ["x.com", "twitter.com"],
  instagram: ["instagram.com"],
};

const MAX_SOCIAL_PROFILE_URL_LENGTH = 240;

export function emptySocialProfileLinks(): SocialProfileLinks {
  return {
    youtube: "",
    x: "",
    instagram: "",
  };
}

export function normalizeSocialProfileUrl(kind: SocialProfileKind, raw: unknown): string | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_SOCIAL_PROFILE_URL_LENGTH) return null;

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.protocol = "https:";
  url.username = "";
  url.password = "";
  url.hash = "";
  url.search = "";

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!SOCIAL_PROFILE_HOSTS[kind].includes(hostname)) return null;
  url.hostname = kind === "x" && hostname === "twitter.com" ? "x.com" : hostname;

  url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "");
  if (!url.pathname || url.pathname === "/") return null;

  return url.toString().replace(/\/$/, "");
}

export function normalizeSocialProfileLinks(input: Partial<Record<SocialProfileKind, unknown>>): SocialProfileLinks {
  return {
    youtube: normalizeSocialProfileUrl("youtube", input.youtube) ?? "",
    x: normalizeSocialProfileUrl("x", input.x) ?? "",
    instagram: normalizeSocialProfileUrl("instagram", input.instagram) ?? "",
  };
}
