import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import {
  type AppConnectionRow,
  type DeveloperAppRow,
} from "./appCore";
import { decryptStoredSecret } from "./providerConnections";

async function getDeveloperAppConnectionByAppId(ctx: any, developerAppId: any): Promise<AppConnectionRow | null> {
  return ((await ctx.db
    .query("appConnections")
    .withIndex("by_app", (q: any) => q.eq("developerAppId", developerAppId))
    .first()) as AppConnectionRow | null) ?? null;
}

async function getDeveloperAppById(
  ctx: any,
  developerAppId: any,
): Promise<DeveloperAppRow | null> {
  return ((await ctx.db.get(developerAppId)) as DeveloperAppRow | null) ?? null;
}

export const getDecryptedDeveloperAppConnectionBundleInternal = internalQuery({
  args: {
    developerAppId: v.id("developerApps"),
  },
  handler: async (ctx, args) => {
    const app = await getDeveloperAppById(ctx, args.developerAppId);
    if (!app) return null;
    const row = await getDeveloperAppConnectionByAppId(ctx, args.developerAppId);
    if (!row) {
      return {
        app,
        connection: null,
        secret: null,
      };
    }
    const secret =
      row.encryptedSecretHex && row.secretIvHex
        ? await decryptStoredSecret({
            encryptedSecretHex: row.encryptedSecretHex,
            secretIvHex: row.secretIvHex,
          })
        : null;
    return {
      app,
      connection: row,
      secret,
    };
  },
});

export const upsertAppConnectionInternal = internalMutation({
  args: {
    developerAppId: v.id("developerApps"),
    connectionStatus: v.union(v.literal("connected"), v.literal("error")),
    authKind: v.optional(v.union(v.literal("secret"), v.literal("oauth_tokens"))),
    encryptedSecretHex: v.optional(v.string()),
    secretIvHex: v.optional(v.string()),
    secretVersion: v.optional(v.number()),
    lastValidatedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const existing = await getDeveloperAppConnectionByAppId(ctx, args.developerAppId);
    const patch = {
      authKind: args.authKind ?? existing?.authKind,
      connectionStatus: args.connectionStatus,
      encryptedSecretHex: args.encryptedSecretHex ?? existing?.encryptedSecretHex,
      secretIvHex: args.secretIvHex ?? existing?.secretIvHex,
      secretVersion: args.secretVersion ?? existing?.secretVersion,
      lastValidatedAt: args.lastValidatedAt ?? existing?.lastValidatedAt,
      lastError: args.lastError ?? undefined,
      updatedAt: nowMs,
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert("appConnections", {
      developerAppId: args.developerAppId,
      createdAt: nowMs,
      ...patch,
    });
  },
});

export const patchAppConnectionValidationStateInternal = internalMutation({
  args: {
    developerAppId: v.id("developerApps"),
    connectionStatus: v.union(v.literal("connected"), v.literal("error")),
    lastValidatedAt: v.optional(v.number()),
    lastError: v.optional(v.union(v.string(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await getDeveloperAppConnectionByAppId(ctx, args.developerAppId);
    if (!existing) return null;
    await ctx.db.patch(existing._id, {
      connectionStatus: args.connectionStatus,
      lastValidatedAt: args.lastValidatedAt ?? existing.lastValidatedAt,
      lastError: args.lastError === null ? undefined : args.lastError ?? existing.lastError,
      updatedAt: args.nowMs ?? Date.now(),
    });
    return existing._id;
  },
});

export const deleteAppConnectionInternal = internalMutation({
  args: {
    developerAppId: v.id("developerApps"),
  },
  handler: async (ctx, args) => {
    const existing = await getDeveloperAppConnectionByAppId(ctx, args.developerAppId);
    if (!existing) return { deleted: false };
    await ctx.db.delete(existing._id);
    return { deleted: true };
  },
});
