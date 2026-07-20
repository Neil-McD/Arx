import { mutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { resolveAuthenticatedActor } from "./authActor";

const ACCOUNT_DELETION_QUARANTINE_CODE = "account_delete_lifecycle_migration_blocked" as const;

export const deleteOwnAccount = mutation({
  args: {
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await resolveAuthenticatedActor({
      ctx,
      authSubject: args.authSubject ?? null,
    });

    throw new ConvexError({
      code: ACCOUNT_DELETION_QUARANTINE_CODE,
      reason: ACCOUNT_DELETION_QUARANTINE_CODE,
    });
  },
});
