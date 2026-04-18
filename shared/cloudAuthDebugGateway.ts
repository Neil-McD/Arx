import {
  bootstrapConvexAuthenticatedClient,
  type ConvexAuthenticatedBootstrapResult,
} from "./convexAuthenticatedClient";
import { firstGatewayObjectRow } from "./cloudGateway";

export type CloudAuthActorDebugRow = {
  identity: Record<string, unknown> | null;
  continuity: Record<string, unknown> | null;
  actor: Record<string, unknown> | null;
  canonicalTier: string | null;
  effectiveTier: string | null;
  snapshot: Record<string, unknown> | null;
};

export async function fetchCloudAuthActorDebug<SessionT>(params: {
  session: SessionT;
}): Promise<{
  bootstrap: ConvexAuthenticatedBootstrapResult | null;
  actorDebug: CloudAuthActorDebugRow | null;
}> {
  const { client, authSubject, bootstrap } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("auth:getActorDebug" as any, {
    authSubject,
  });
  const row = firstGatewayObjectRow(payload);
  return {
    bootstrap,
    actorDebug: row
      ? {
          identity:
            row.identity && typeof row.identity === "object" && !Array.isArray(row.identity)
              ? (row.identity as Record<string, unknown>)
              : null,
          continuity:
            row.continuity && typeof row.continuity === "object" && !Array.isArray(row.continuity)
              ? (row.continuity as Record<string, unknown>)
              : null,
          actor:
            row.actor && typeof row.actor === "object" && !Array.isArray(row.actor)
              ? (row.actor as Record<string, unknown>)
              : null,
          canonicalTier: typeof row.canonicalTier === "string" ? row.canonicalTier : null,
          effectiveTier: typeof row.effectiveTier === "string" ? row.effectiveTier : null,
          snapshot:
            row.snapshot && typeof row.snapshot === "object" && !Array.isArray(row.snapshot)
              ? (row.snapshot as Record<string, unknown>)
              : null,
        }
      : null,
  };
}
