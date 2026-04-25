import { query } from "./_generated/server";
import { DISCOVER_APP_CATALOG } from "../shared/discoverCatalog";
import { DISCOVER_SKILL_CATALOG } from "../shared/discoverSkillCatalog";

export const listDiscoverMarketplaceCatalog = query({
  args: {},
  handler: async () => {
    return {
      ok: true,
      apps: DISCOVER_APP_CATALOG,
      skills: DISCOVER_SKILL_CATALOG,
    };
  },
});
