// Which named tools a person's own AI is shown (shared/actionTools.ts): a
// member's for everyone; a moderator's or a builder's too for someone who
// moderates or builds at least one community. This only decides what is
// listed. Every call is still checked for the community it names.
import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { communityMembershipRowIsActive } from "./communityCore";
import type { ActionToolRole } from "../shared/actionTools";

const LOOK_AT = 200;

export const highestRoleInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<ActionToolRole> => {
    // Owning a community, or being an admin of one, is building it.
    const BUILDS: ActionToolRole = "builder";
    const owns = await ctx.db.query("communities").withIndex("by_owner", (q) => q.eq("ownerId", args.userId)).first();
    if (owns) return BUILDS;
    const memberships = await ctx.db.query("communityMemberships").withIndex("by_user", (q) => q.eq("userId", args.userId)).take(LOOK_AT);
    const roles = memberships.filter((row) => communityMembershipRowIsActive(row as any)).map((row) => row.role);
    return roles.includes("admin") ? BUILDS : roles.includes("moderator") ? "moderator" : "member";
  },
});
