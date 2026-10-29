// Where a community's site is served: https://<slug>.polynet.page unless
// VITE_POLYNET_SITE_ORIGIN_TEMPLATE says otherwise (local previews use
// something like http://localhost:8790/sites/{slug}).
const DEFAULT_TEMPLATE = "https://{slug}.polynet.page";

export function communitySiteOrigin(slug: string | null | undefined): string | null {
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) return null;
  const template = String(import.meta.env.VITE_POLYNET_SITE_ORIGIN_TEMPLATE ?? "").trim() || DEFAULT_TEMPLATE;
  return template.replace("{slug}", slug).replace(/\/+$/, "");
}
