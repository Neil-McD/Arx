import { query } from "./_generated/server";
import { v } from "convex/values";
import { getModelRegistryRows } from "../shared/modelCatalog";

export const listEnabledModelRegistry = query({
  args: {
    enabled: v.optional(v.boolean()),
  },
  handler: async (_ctx, args) => {
    const wantEnabled = args.enabled ?? true;
    return getModelRegistryRows("web")
      .filter((row) => (wantEnabled ? row.enabled : true))
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  },
});
