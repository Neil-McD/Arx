import { query } from "./_generated/server";

export const health = query({
  args: {},
  handler: async () => {
    return {
      ok: true,
      nowMs: Date.now(),
      source: "convex",
    };
  },
});
