// Server-owned authority, never supplied by the browser or model. Deliberately
// unconfigured: local implementation does not activate a provider connection.
export type IntegrationVerificationPilot = {
  id: string;
  communityId: string;
  actorUserId: string;
  authConfigId: string;
  expiresAt: number;
};

export function integrationVerificationPilot(): IntegrationVerificationPilot | null {
  return null;
}

export const INTEGRATION_PILOT_TARGET = Object.freeze({
  deploymentUrl: "https://quick-porcupine-949.convex.cloud",
  communityId: "jx7f4fcw4x3hjsvy2t02j669xx8cvj6s",
  actorUserId: "jn7ckswapk976rra6egsxydm0x82a7nc",
  authConfigId: "ac_uxRir8eo8Vma",
  expectedPortalId: "247370940",
  returnUrl: "https://polynet-staging.vercel.app/integrations/callback",
});

// Deployment identity is supplied by the server runtime, never action arguments.
export function admittedIntegrationPilot(args: {
  communityId: unknown; actorUserId: unknown; authConfigId: string; nowMs: number;
}, pilot = integrationVerificationPilot()): IntegrationVerificationPilot | null {
  return process.env.CONVEX_CLOUD_URL === INTEGRATION_PILOT_TARGET.deploymentUrl &&
    pilot && pilot.id.trim() && Number.isFinite(args.nowMs) &&
    Number.isFinite(pilot.expiresAt) && pilot.expiresAt > args.nowMs &&
    pilot.communityId === args.communityId && pilot.actorUserId === args.actorUserId &&
    pilot.authConfigId === args.authConfigId ? pilot : null;
}
