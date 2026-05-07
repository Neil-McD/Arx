import {
  DISCOVER_APP_CATALOG,
  type DiscoverAppCatalogEntry,
} from "./discoverCatalog";

type DiscoverCatalogAppIdentity = {
  catalog_app_id?: string | null;
  endpoint_url?: string | null;
  auth_type?: string | null;
  slug?: string | null;
  name?: string | null;
};

function normalizeIdentityPart(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTextIdentity(value: string | null | undefined): string {
  return normalizeIdentityPart(value).toLowerCase();
}

export function findDiscoverCatalogEntryForAppIdentity(
  app: DiscoverCatalogAppIdentity,
): DiscoverAppCatalogEntry | null {
  const catalogAppId = normalizeTextIdentity(app.catalog_app_id);
  if (catalogAppId) {
    const byCatalogId =
      DISCOVER_APP_CATALOG.find((entry) => entry.id === catalogAppId) ?? null;
    if (byCatalogId) return byCatalogId;
  }

  const endpointUrl = normalizeIdentityPart(app.endpoint_url);
  const authType = normalizeIdentityPart(app.auth_type);
  if (endpointUrl && authType) {
    const byEndpoint =
      DISCOVER_APP_CATALOG.find((entry) => {
        if (entry.personalConnect.connectionKind !== "known") return false;
        return (
          entry.personalConnect.endpointUrl === endpointUrl &&
          entry.personalConnect.authType === authType
        );
      }) ?? null;
    if (byEndpoint) return byEndpoint;
  }

  const slug = normalizeTextIdentity(app.slug);
  if (slug) {
    const bySlug = DISCOVER_APP_CATALOG.find((entry) => entry.id === slug) ?? null;
    if (bySlug) return bySlug;
  }

  const name = normalizeTextIdentity(app.name);
  if (!name) return null;
  return (
    DISCOVER_APP_CATALOG.find(
      (entry) => entry.name.trim().toLowerCase() === name,
    ) ?? null
  );
}
