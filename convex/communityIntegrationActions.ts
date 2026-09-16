import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { ConnectionAdapter } from "./composioConnectionAdapter";
import { authorizeFounderPaidToolFundingSession, markFounderPaidToolProviderStarted,
  failFounderPaidToolFundingSession } from "./founderPaidToolRuntime";
import { HUBSPOT_PILOT_VERSION } from "./hubspotPilotContract";
import type { AdmitConnectionMetadata } from "./composioConnectionAdapter";
import type { IntegrationReceiptIntent } from "./communityIntegrationReceiptIntent";
import { admittedIntegrationPilot, integrationVerificationPilot } from "./integrationVerificationPilot";

// Intent comes from the authenticated connection snapshot, never callback input.
export function admittedConnectionMetadata(ctx: any, who: {communityId: string; userId: string},
  intent: IntegrationReceiptIntent): AdmitConnectionMetadata {
  return async execute => {
    const session = await authorizeFounderPaidToolFundingSession({ctx,
      communityId: who.communityId, actorUserId: who.userId,
      sourceRunId: `integration_connection:${intent.bindingId}:${intent.generation}`,
      toolCallId: "verify_scopes", toolName: "integration", action: "verify_scopes", integrationIntent: intent});
    try {
      await markFounderPaidToolProviderStarted({ctx, session});
      const metadata = await execute();
      const result = await ctx.runMutation((internal as any).founderPaidTools.finalizeIntegrationVerificationReceiptInternal,
        {...session, outcome: "success", nowMs: Date.now()});
      if (!result?.ok || result.status !== "settled") throw new Error("integration_receipt_not_finalized");
      return metadata;
    } catch {
      await failFounderPaidToolFundingSession({ctx, session, failureCode: "integration_verification_incomplete"});
      throw new Error("integration_metadata_unverified");
    }
  };
}

// Deliberately no env switch: deployment cannot activate external effects in this slice.
const liveAdapter: ConnectionAdapter | null = null;
const refs = (internal as any).communityIntegrationConnections;
// Correlation only: never an authorization credential or an idempotency key.
export async function integrationAttemptAlias(bindingId: string, generation: number): Promise<string> {
  if (!bindingId || !Number.isSafeInteger(generation) || generation < 1)
    throw new Error("integration_invalid_attempt");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(
    JSON.stringify(["polynet-integration-attempt-v1", bindingId, generation]),
  ));
  return `pn_${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}
async function identity(ctx: any, communityId: string) {
  const actor = await ctx.runQuery(
    internal.authActor.resolveAuthenticatedActorInternal,
    {},
  );
  return {
    authSubject: actor.authSubject,
    userId: actor.dbUserId,
    communityId,
  };
}
export async function connectWithAdapter(
  ctx: any,
  communityId: string,
  adapter: ConnectionAdapter | null,
) {
  const who = await identity(ctx, communityId);
  const access = await ctx.runQuery(refs.readPilotBindingInternal, who);
  if (!access.enabled) throw new Error("integration_disabled");
  if (!adapter) return { available: false };
  if (!admittedIntegrationPilot({communityId, actorUserId: who.userId,
    authConfigId: adapter.authConfigId, nowMs: Date.now()}, integrationVerificationPilot()))
    throw new Error("integration_pilot_unavailable");
  const attempt = await ctx.runMutation(refs.beginConnectionInternal, {
    ...who,
    authConfigId: adapter.authConfigId,
    providerUserId: access.binding?.providerUserId || crypto.randomUUID(),
  });
  if (!attempt.initiate)
    return { available: true, authorizationUrl: attempt.authorizationUrl, generation: attempt.generation, expiresAt: attempt.expiresAt };
  let result: Awaited<ReturnType<ConnectionAdapter["initiate"]>>;
  try {
    result = await adapter.initiate(attempt.providerUserId,
      await integrationAttemptAlias(attempt.bindingId, attempt.generation));
  } catch {
    await ctx.runMutation(refs.finishInitiationInternal, {
      ...who, generation: attempt.generation,
    });
    throw new Error("integration_reconciliation_required");
  }
  // Retry only the idempotent local attachment, never remote initiation.
  const attach = () => ctx.runMutation(refs.finishInitiationInternal, {
    ...who,
    generation: attempt.generation,
    ...result,
  });
  let attached: boolean;
  try {
    attached = await attach();
  } catch {
    try { attached = await attach(); }
    catch { throw new Error("integration_reconciliation_required"); }
  }
  if (!attached) {
    await revokeWithAdapter(ctx, communityId, adapter);
    return { available: false };
  }
  return { available: true, authorizationUrl: result.authorizationUrl, generation: attempt.generation, expiresAt: attempt.expiresAt };
}
export async function verifyWithAdapter(
  ctx: any,
  communityId: string,
  sessionUri: string,
  adapter: ConnectionAdapter | null,
  expectedGeneration?: number,
) {
  const who = await identity(ctx, communityId);
  const access = await ctx.runQuery(refs.readPilotBindingInternal, who);
  const b = access.binding;
  if (!adapter || !admittedIntegrationPilot({communityId, actorUserId: who.userId,
    authConfigId: adapter.authConfigId, nowMs: Date.now()}, integrationVerificationPilot()) ||
    b?.authConfigId !== adapter.authConfigId) return false;
  if (
    !adapter ||
    !access.enabled ||
    !b ||
    b.status !== "pending" ||
    !Number.isFinite(b.expiresAt) || b.expiresAt <= Date.now() ||
    !b.connectedAccountId
  )
    return false;
  if (expectedGeneration !== undefined && b.generation !== expectedGeneration) return false;
  if (!await ctx.runMutation(refs.claimCallbackInternal, { ...who, generation: b.generation })) return false;
  try {
    const verified = await adapter.verify(
      b.connectedAccountId,
      b.providerUserId,
      sessionUri,
      admittedConnectionMetadata(ctx, who, {bindingId: b._id,
        connectedAccountId: b.connectedAccountId, providerUserId: b.providerUserId,
        authConfigId: b.authConfigId, generation: b.generation,
        version: HUBSPOT_PILOT_VERSION, tool: "HUBSPOT_LIST_GRANTED_SCOPES"}),
    );
    return await ctx.runMutation(refs.verifyConnectionInternal, {
      ...who,
      generation: b.generation,
      ...verified,
    });
  } catch {
    await ctx.runMutation(refs.failCallbackInternal, { ...who, generation: b.generation });
    return false;
  } // Single-use callback is never automatically retried.
}
export async function revokeWithAdapter(
  ctx: any,
  communityId: string,
  adapter: ConnectionAdapter | null,
) {
  const who = await identity(ctx, communityId);
  await ctx.runMutation(
    refs.disconnectInternal,
    who,
  );
  const b = await ctx.runQuery(refs.ownBindingInternal, who);
  if (!b?.revokePending) return { cleanupPending: false };
  // Never consult pilot expiry or community enablement for cleanup. The query
  // resolves only this authenticated owner's binding; mismatched adapters fail closed.
  if (!adapter || !b.connectedAccountId || b.authConfigId !== adapter.authConfigId ||
    b.provider !== "composio" || b.toolkit !== "hubspot") return { cleanupPending: true };
  try {
    await adapter.revoke(b.connectedAccountId);
    const finished = await ctx.runMutation(refs.finishRevocationInternal, {
      ...who,
      connectedAccountId: b.connectedAccountId,
    });
    return { cleanupPending: !finished };
  } catch {
    return { cleanupPending: true };
  }
}
export const requestConnection = action({
  args: { communityId: v.id("communities") },
  handler: (ctx, args) =>
    connectWithAdapter(ctx, args.communityId, liveAdapter),
});
export const verifyConnection = action({
  args: { communityId: v.id("communities"), sessionUri: v.string(), generation: v.number() },
  handler: (ctx, args) =>
    verifyWithAdapter(ctx, args.communityId, args.sessionUri, liveAdapter, args.generation),
});
export const disconnect = action({
  args: { communityId: v.id("communities") },
  handler: (ctx, args) => revokeWithAdapter(ctx, args.communityId, liveAdapter),
});
