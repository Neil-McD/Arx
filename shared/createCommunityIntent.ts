import { isValidCommunitySlug } from "./communitySlug";
import { toCanonicalCommunityVisibility } from "./communityVisibility";

export type CreateCommunityIntentDraft = {
  name: string;
  slug: string;
  slug_edited: boolean;
  visibility: "published" | "unlisted";
  one_liner: string | null;
};

export function normalizeCreateCommunityIntentDraft(input: unknown): CreateCommunityIntentDraft | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const slug = typeof record.slug === "string" ? record.slug.trim().toLowerCase() : "";
  const slug_edited = Boolean(record.slug_edited);
  const visibility = toCanonicalCommunityVisibility(record.visibility, "unlisted");
  const one_liner = typeof record.one_liner === "string" ? record.one_liner.trim() || null : null;

  if (!name) return null;
  if (!isValidCommunitySlug(slug)) return null;

  return {
    name,
    slug,
    slug_edited,
    visibility,
    one_liner,
  };
}
