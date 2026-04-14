import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import {
  type DeveloperAppRow,
  isDeveloperAppAuthType,
  normalizeDeveloperAppDescription,
  normalizeDeveloperAppEndpointUrl,
  normalizeDeveloperAppName,
  normalizeDeveloperAppSlug,
} from "./appCore";

async function getDeveloperAppById(ctx: any, developerAppId: any): Promise<DeveloperAppRow | null> {
  return ((await ctx.db.get(developerAppId)) as DeveloperAppRow | null) ?? null;
}

async function assertOwnedDeveloperApp(args: {
  ctx: any;
  developerAppId: any;
  ownerUserId: any;
}): Promise<DeveloperAppRow> {
  const row = await getDeveloperAppById(args.ctx, args.developerAppId);
  if (!row) throw new Error("developer_app_not_found");
  if (String(row.ownerUserId) !== String(args.ownerUserId)) {
    throw new Error("developer_app_not_found");
  }
  return row;
}

async function slugExistsForOwner(args: {
  ctx: any;
  ownerUserId: any;
  slug: string;
  excludeDeveloperAppId?: any;
}): Promise<boolean> {
  const rows = (await args.ctx.db
    .query("developerApps")
    .withIndex("by_owner_slug", (q: any) => q.eq("ownerUserId", args.ownerUserId).eq("slug", args.slug))
    .collect()) as DeveloperAppRow[];
  return rows.some((row) => String(row._id) !== String(args.excludeDeveloperAppId ?? ""));
}

async function resolveUniqueSlugForOwner(args: {
  ctx: any;
  ownerUserId: any;
  slug: string;
  excludeDeveloperAppId?: any;
}): Promise<string> {
  const baseSlug = args.slug || "app";
  if (
    !(await slugExistsForOwner({
      ctx: args.ctx,
      ownerUserId: args.ownerUserId,
      slug: baseSlug,
      excludeDeveloperAppId: args.excludeDeveloperAppId,
    }))
  ) {
    return baseSlug;
  }
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const nextSlug = `${baseSlug}-${suffix}`.slice(0, 80);
    if (
      !(await slugExistsForOwner({
        ctx: args.ctx,
        ownerUserId: args.ownerUserId,
        slug: nextSlug,
        excludeDeveloperAppId: args.excludeDeveloperAppId,
      }))
    ) {
      return nextSlug;
    }
  }
  throw new Error("developer_app_slug_conflict");
}

export const getDeveloperAppForOwnerInternal = internalQuery({
  args: {
    userId: v.id("users"),
    developerAppId: v.id("developerApps"),
  },
  handler: async (ctx, args) => {
    return await assertOwnedDeveloperApp({
      ctx,
      developerAppId: args.developerAppId,
      ownerUserId: args.userId,
    });
  },
});

export const getDeveloperAppByIdInternal = internalQuery({
  args: {
    developerAppId: v.id("developerApps"),
  },
  handler: async (ctx, args) => {
    return await getDeveloperAppById(ctx, args.developerAppId);
  },
});

export const createDeveloperAppInternal = internalMutation({
  args: {
    ownerUserId: v.id("users"),
    name: v.string(),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    endpointUrl: v.string(),
    authType: v.union(v.literal("api_key"), v.literal("bearer"), v.literal("none")),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const name = normalizeDeveloperAppName(args.name);
    if (!name) throw new Error("developer_app_name_required");
    const baseSlug = normalizeDeveloperAppSlug(args.slug, name);
    if (!baseSlug) throw new Error("developer_app_slug_required");
    const slug = await resolveUniqueSlugForOwner({
      ctx,
      ownerUserId: args.ownerUserId,
      slug: baseSlug,
    });
    const description = normalizeDeveloperAppDescription(args.description);
    const endpointUrl = normalizeDeveloperAppEndpointUrl(args.endpointUrl);
    if (!endpointUrl) throw new Error("developer_app_endpoint_url_invalid");
    if (!isDeveloperAppAuthType(args.authType)) {
      throw new Error("developer_app_auth_type_invalid");
    }
    return await ctx.db.insert("developerApps", {
      ownerUserId: args.ownerUserId,
      name,
      slug,
      description: description || undefined,
      endpointUrl,
      authType: args.authType,
      status: "draft",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
  },
});

export const patchDeveloperAppValidationInternal = internalMutation({
  args: {
    developerAppId: v.id("developerApps"),
    status: v.union(
      v.literal("draft"),
      v.literal("valid"),
      v.literal("invalid"),
    ),
    activeSnapshotId: v.optional(v.union(v.id("appToolSnapshots"), v.null())),
    lastValidatedAt: v.optional(v.number()),
    lastValidationError: v.optional(v.union(v.string(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await getDeveloperAppById(ctx, args.developerAppId);
    if (!existing) throw new Error("developer_app_not_found");
    await ctx.db.patch(existing._id, {
      status: args.status,
      activeSnapshotId: args.activeSnapshotId ?? undefined,
      lastValidatedAt: args.lastValidatedAt ?? undefined,
      lastValidationError:
        args.lastValidationError === null
          ? undefined
          : args.lastValidationError ?? existing.lastValidationError,
      updatedAt: args.nowMs ?? Date.now(),
    });
  },
});

export const deleteDeveloperAppCascadeInternal = internalMutation({
  args: {
    developerAppId: v.id("developerApps"),
  },
  handler: async (ctx, args) => {
    const app = await getDeveloperAppById(ctx, args.developerAppId);
    if (!app) return { deleted: false };

    const connectionRows = (await ctx.db
      .query("appConnections")
      .withIndex("by_app", (q: any) => q.eq("developerAppId", args.developerAppId))
      .collect()) as AppConnectionRow[];
    for (const row of connectionRows) {
      await ctx.db.delete(row._id);
    }

    const snapshotRows = (await ctx.db
      .query("appToolSnapshots")
      .withIndex("by_app", (q: any) => q.eq("developerAppId", args.developerAppId))
      .collect()) as Array<{ _id: any }>;
    for (const row of snapshotRows) {
      await ctx.db.delete(row._id);
    }

    const mountRows = (await ctx.db
      .query("communityAppMounts")
      .withIndex("by_app", (q: any) => q.eq("developerAppId", args.developerAppId))
      .collect()) as Array<{ _id: any }>;
    for (const row of mountRows) {
      await ctx.db.delete(row._id);
    }

    await ctx.db.delete(app._id);
    return { deleted: true };
  },
});
