import {
  internalQuery,
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import { v } from "convex/values";
import {
  resolveAuthenticatedActor,
  resolveAuthenticatedActorByTrustedSubject,
} from "./authActor";
import {
  requireCommunityChatAccess,
  requireCommunityOwner,
} from "./communityCore";
import { integrationStatus } from "../shared/communityIntegrationStatus";
import { canActivateIntegrationBinding } from "./communityIntegrationReadCore";

async function findBinding(ctx: any, communityId: any, ownerUserId: any) {
  return ctx.db
    .query("communityIntegrationConnections")
    .withIndex("by_community_owner_toolkit", (q: any) =>
      q
        .eq("communityId", communityId)
        .eq("ownerUserId", ownerUserId)
        .eq("toolkit", "hubspot"),
    )
    .unique();
}

export const setPilotEnabled = mutation({
  args: { communityId: v.id("communities"), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await resolveAuthenticatedActor({ ctx });
    await requireCommunityOwner({
      ctx,
      communityId: args.communityId,
      userId: actor.dbUserId,
    });
    await ctx.db.patch(args.communityId, {
      integrationReadPilotEnabled: args.enabled,
    });
  },
});

export const connectionStatus = query({
  args: { communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const actor = await resolveAuthenticatedActor({ ctx });
    const binding = await findBinding(ctx, args.communityId, actor.dbUserId);
    try {
      await requireCommunityChatAccess({
        ctx,
        communityId: args.communityId,
        userId: actor.dbUserId,
      });
    } catch (error) {
      // Preserve access to one's own disconnect control, but disclose no community settings.
      if (binding) return integrationStatus(binding, false, false, Date.now());
      throw error;
    }
    const community = await ctx.db.get(args.communityId);
    return integrationStatus(binding, community?.integrationReadPilotEnabled === true, community?.ownerId === actor.dbUserId, Date.now());
  },
});

export const disconnectInternal = internalMutation({
  args: { authSubject: v.string(), userId: v.id("users"), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const actor = await resolveAuthenticatedActorByTrustedSubject({ ctx, ...args });
    const binding = await findBinding(ctx, args.communityId, actor.dbUserId);
    if (binding && binding.status !== "disconnected") {
      await ctx.db.patch(binding._id, {
        status: "disconnected",
        generation: binding.generation + 1,
        scopes: [],
        authorizationUrl: undefined,
        revokePending:
          Boolean(binding.connectedAccountId) ||
          binding.initiationState === "awaiting" ||
          binding.initiationState === "unknown",
        expiresAt: undefined,
        updatedAt: Date.now(),
      });
    }
    // No remote adapter installed. Local denial is authoritative even if revocation fails.
    return { status: "disconnected" as const };
  },
});

// Mock-only initiation seam: provider identifiers are trusted server outputs,
// never public mutation arguments. A future live adapter must perform admission first.
export const beginConnectionInternal = internalMutation({
  args: {
    authSubject: v.string(),
    userId: v.id("users"),
    communityId: v.id("communities"),
    providerUserId: v.string(),
    authConfigId: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await resolveAuthenticatedActorByTrustedSubject({
      ctx,
      ...args,
    });
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId: actor.dbUserId,
    });
    const community = await ctx.db.get(args.communityId);
    if (!community?.integrationReadPilotEnabled)
      throw new Error("integration_disabled");
    const existing = await findBinding(ctx, args.communityId, actor.dbUserId);
    const now = Date.now();
    if (existing?.revokePending || existing?.initiationState === "unknown")
      throw new Error("integration_reconciliation_required");
    if (
      existing?.status === "active" ||
      (existing?.status === "pending" && existing.expiresAt > now)
    )
      return {
        bindingId: existing._id,
        generation: existing.generation,
        expiresAt: existing.expiresAt,
        providerUserId: existing.providerUserId,
        initiate: false,
        authorizationUrl: existing.callbackClaimed ? null : existing.authorizationUrl ?? null,
      };
    if (
      existing?.connectedAccountId ||
      existing?.initiationState === "awaiting"
    )
      throw new Error("integration_disconnect_required");
    if (
      ![args.providerUserId, args.authConfigId].every(
        (s) => s.trim().length > 0 && s.length <= 256,
      )
    )
      throw new Error("integration_invalid_binding");
    const data = {
      communityId: args.communityId,
      ownerUserId: actor.dbUserId,
      provider: "composio" as const,
      toolkit: "hubspot" as const,
      providerUserId: args.providerUserId,
      authConfigId: args.authConfigId,
      connectedAccountId: "",
      initiationState: "awaiting" as const,
      callbackClaimed: false,
      authorizationUrl: undefined,
      generation: (existing?.generation ?? 0) + 1,
      status: "pending" as const,
      scopes: [],
      expiresAt: now + 10 * 60_000,
      updatedAt: now,
    };
    const bindingId = existing
      ? (await ctx.db.patch(existing._id, data), existing._id)
      : await ctx.db.insert("communityIntegrationConnections", {
          ...data,
          createdAt: now,
        });
    return {
      bindingId,
      generation: data.generation,
      expiresAt: data.expiresAt,
      providerUserId: data.providerUserId,
      initiate: true,
      authorizationUrl: null,
    };
  },
});

export const verifyConnectionInternal = internalMutation({
  args: {
    authSubject: v.string(),
    userId: v.id("users"),
    communityId: v.id("communities"),
    generation: v.number(),
    connectedAccountId: v.string(),
    providerUserId: v.string(),
    authConfigId: v.string(),
    toolkit: v.string(),
    active: v.boolean(),
    scopes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await resolveAuthenticatedActorByTrustedSubject({
      ctx,
      ...args,
    });
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId: actor.dbUserId,
    });
    if (!(await ctx.db.get(args.communityId))?.integrationReadPilotEnabled)
      return false;
    const binding = await findBinding(ctx, args.communityId, actor.dbUserId);
    if (
      !binding ||
      binding.generation !== args.generation ||
      binding.status !== "pending"
    )
      return false;
    const valid = canActivateIntegrationBinding(binding, args, Date.now());
    await ctx.db.patch(binding._id, {
      status: valid ? "active" : "error",
      scopes: valid ? [...new Set(args.scopes)] : [],
      expiresAt: undefined,
      updatedAt: Date.now(),
    });
    return valid;
  },
});

export const failCallbackInternal = internalMutation({
  args: { authSubject: v.string(), userId: v.id("users"), communityId: v.id("communities"), generation: v.number() },
  handler: async (ctx, args) => {
    const actor = await resolveAuthenticatedActorByTrustedSubject({ctx, ...args});
    const b = await findBinding(ctx, args.communityId, actor.dbUserId);
    if (b?.status === "pending" && b.generation === args.generation && b.callbackClaimed)
      await ctx.db.patch(b._id, {status: "error", authorizationUrl: undefined, updatedAt: Date.now()});
  },
});

export const claimCallbackInternal = internalMutation({
  args: { authSubject: v.string(), userId: v.id("users"), communityId: v.id("communities"), generation: v.number() },
  handler: async (ctx, args) => {
    const actor = await resolveAuthenticatedActorByTrustedSubject({ ctx, ...args });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId: actor.dbUserId });
    const b = await findBinding(ctx, args.communityId, actor.dbUserId);
    if (!(await ctx.db.get(args.communityId))?.integrationReadPilotEnabled || !b || b.generation !== args.generation || b.status !== "pending" ||
      !Number.isFinite(b.expiresAt) || b.expiresAt <= Date.now() || !b.connectedAccountId || b.callbackClaimed) return false;
    await ctx.db.patch(b._id, { callbackClaimed: true, updatedAt: Date.now() });
    return true;
  },
});

// Commit remote results even after disconnect so cleanup never loses the remote id.
export const finishInitiationInternal = internalMutation({
  args: {
    authSubject: v.string(),
    userId: v.id("users"),
    communityId: v.id("communities"),
    generation: v.number(),
    connectedAccountId: v.optional(v.string()),
    authorizationUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await resolveAuthenticatedActorByTrustedSubject({
      ctx,
      ...args,
    });
    const b = await findBinding(ctx, args.communityId, actor.dbUserId);
    // A committed attachment may be retried after its response was lost.
    if (b?.initiationState === "ready" && b.generation === args.generation &&
      args.connectedAccountId && b.connectedAccountId === args.connectedAccountId) {
      return b.status === "pending" && Number.isFinite(b.expiresAt) && b.expiresAt > Date.now();
    }
    if (
      !b ||
      b.initiationState !== "awaiting" ||
      !(
        b.generation === args.generation ||
        (b.status === "disconnected" && b.generation === args.generation + 1)
      )
    )
      return false;
    if (!args.connectedAccountId) {
      await ctx.db.patch(b._id, {
        initiationState: "unknown",
        updatedAt: Date.now(),
      });
      return false;
    }
    const usable = b.status === "pending" && b.expiresAt > Date.now();
    await ctx.db.patch(b._id, {
      connectedAccountId: args.connectedAccountId,
      initiationState: "ready",
      authorizationUrl: usable ? args.authorizationUrl : undefined,
      revokePending: !usable,
      updatedAt: Date.now(),
    });
    return usable;
  },
});

export const ownBindingInternal = internalQuery({
  args: {
    authSubject: v.string(),
    userId: v.id("users"),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const actor = await resolveAuthenticatedActorByTrustedSubject({
      ctx,
      ...args,
    });
    return findBinding(ctx, args.communityId, actor.dbUserId);
  },
});

export const finishRevocationInternal = internalMutation({
  args: {
    authSubject: v.string(),
    userId: v.id("users"),
    communityId: v.id("communities"),
    connectedAccountId: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await resolveAuthenticatedActorByTrustedSubject({
      ctx,
      ...args,
    });
    const b = await findBinding(ctx, args.communityId, actor.dbUserId);
    if (!b?.revokePending || b.connectedAccountId !== args.connectedAccountId)
      return false;
    await ctx.db.patch(b._id, {
      connectedAccountId: "",
      revokePending: false,
      initiationState: undefined,
      authorizationUrl: undefined,
      updatedAt: Date.now(),
    });
    return true;
  },
});

// Internal only: no client can choose an account or enable the pilot through this API.
export const readPilotBindingInternal = internalQuery({
  args: {
    authSubject: v.string(),
    userId: v.id("users"),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const actor = await resolveAuthenticatedActorByTrustedSubject({
      ctx,
      ...args,
    });
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId: actor.dbUserId,
    });
    const community = await ctx.db.get(args.communityId);
    const binding = await findBinding(ctx, args.communityId, actor.dbUserId);
    return {
      enabled: community?.integrationReadPilotEnabled === true,
      memberAuthorized: true,
      binding,
    };
  },
});
