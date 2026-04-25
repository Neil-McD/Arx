import { createConvexClient } from "./convexAuthenticatedClient";
import {
  DISCOVER_APP_CATALOG,
  type DiscoverAppCatalogEntry,
} from "./discoverCatalog";
import {
  DISCOVER_SKILL_CATALOG,
  type DiscoverSkillCatalogEntry,
} from "./discoverSkillCatalog";

type DiscoverMarketplaceCatalogPayload = {
  ok?: boolean;
  apps?: DiscoverAppCatalogEntry[];
  skills?: DiscoverSkillCatalogEntry[];
};

export type DiscoverMarketplaceCatalog = {
  apps: DiscoverAppCatalogEntry[];
  skills: DiscoverSkillCatalogEntry[];
};

export async function listCloudDiscoverMarketplaceCatalog(): Promise<DiscoverMarketplaceCatalog> {
  let payload: DiscoverMarketplaceCatalogPayload | null = null;
  try {
    const client = createConvexClient();
    payload = (await client.query(
      "discoverMarketplace:listDiscoverMarketplaceCatalog" as any,
      {},
    )) as DiscoverMarketplaceCatalogPayload | null;
  } catch (error) {
    console.warn("Failed to load server Discover marketplace catalog:", error);
  }
  return {
    apps: Array.isArray(payload?.apps) ? payload.apps : DISCOVER_APP_CATALOG,
    skills: Array.isArray(payload?.skills) ? payload.skills : DISCOVER_SKILL_CATALOG,
  };
}
