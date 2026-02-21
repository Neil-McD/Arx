import { toCanonicalCommunityVisibility } from "./communityVisibility";

export type CreateCommunityDraft = {
  v: 1;
  id: string;
  created_at: number;
  user_id: string | null;
  name: string;
  slug: string;
  slug_edited: boolean;
  visibility: "published" | "unlisted";
  avatar_url: string | null;
  banner_url: string | null;
  description: string | null;
};

const CREATE_COMMUNITY_DRAFT_STORAGE_KEY = "arx_create_community_draft_v1";
const CREATE_COMMUNITY_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

function isValidCommunityDraftSlug(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > 32) return false;
  return /^(?!-)[a-z0-9-]+(?<!-)$/.test(trimmed);
}

export function createCommunityDraftId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // ignore
  }
  return `draft_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

export function loadCreateCommunityDraft(): CreateCommunityDraft | null {
  try {
    const raw = localStorage.getItem(CREATE_COMMUNITY_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    if (record.v !== 1) return null;
    const createdAt = Number(record.created_at);
    if (!Number.isFinite(createdAt) || createdAt <= 0) return null;
    if (Date.now() - createdAt > CREATE_COMMUNITY_DRAFT_TTL_MS) {
      localStorage.removeItem(CREATE_COMMUNITY_DRAFT_STORAGE_KEY);
      return null;
    }

    const id = typeof record.id === "string" ? record.id : createCommunityDraftId();
    const user_id = typeof record.user_id === "string" ? record.user_id : null;
    const name = typeof record.name === "string" ? record.name : "";
    const slug = typeof record.slug === "string" ? record.slug : "";
    const slug_edited = Boolean(record.slug_edited);
    const visibility = toCanonicalCommunityVisibility(record.visibility, "unlisted");
    const avatar_url = typeof record.avatar_url === "string" ? record.avatar_url : null;
    const banner_url = typeof record.banner_url === "string" ? record.banner_url : null;
    const description = typeof record.description === "string" ? record.description : null;

    if (!name.trim() || !isValidCommunityDraftSlug(slug.trim().toLowerCase())) return null;

    return {
      v: 1,
      id,
      created_at: createdAt,
      user_id,
      name,
      slug,
      slug_edited,
      visibility,
      avatar_url,
      banner_url,
      description,
    };
  } catch {
    return null;
  }
}

export function saveCreateCommunityDraft(draft: CreateCommunityDraft): void {
  try {
    localStorage.setItem(CREATE_COMMUNITY_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // ignore
  }
}

export function clearCreateCommunityDraft(): void {
  try {
    localStorage.removeItem(CREATE_COMMUNITY_DRAFT_STORAGE_KEY);
  } catch {
    // ignore
  }
}
