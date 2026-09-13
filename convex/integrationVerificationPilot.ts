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
