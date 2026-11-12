// Connected apps (convex/connectedApps.ts; one door, docs/specs/builder-modalities-v0.md).
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

export type CloudConnectedApp = { app_id: string; name: string; webhook_url: string | null; secret_hint: string; created_at: string };
type AppsCall = { session: unknown; communityId: string };

async function client(session: unknown) {
  return await bootstrapConvexAuthenticatedClient(session as any);
}

export async function fetchCloudConnectedApps(params: AppsCall): Promise<CloudConnectedApp[]> {
  const { client: convex, authSubject } = await client(params.session);
  const result = await convex.query("connectedApps:listConnectedApps" as any, { authSubject, communityId: params.communityId });
  return Array.isArray(result?.apps) ? result.apps : [];
}

// The secret and signing secret come back this once.
export async function registerCloudConnectedApp(params: AppsCall & { name: string; webhookUrl?: string }): Promise<{ app_id: string; secret: string; webhook_signing_secret: string }> {
  const { client: convex, authSubject } = await client(params.session);
  return await convex.mutation("connectedApps:registerConnectedApp" as any, {
    authSubject, communityId: params.communityId, name: params.name, ...(params.webhookUrl ? { webhookUrl: params.webhookUrl } : {}),
  });
}

export async function updateCloudConnectedApp(params: AppsCall & { appId: string; webhookUrl: string }): Promise<void> {
  const { client: convex, authSubject } = await client(params.session);
  await convex.mutation("connectedApps:updateConnectedApp" as any, { authSubject, communityId: params.communityId, appId: params.appId, webhookUrl: params.webhookUrl });
}

export async function rotateCloudConnectedAppSecret(params: AppsCall & { appId: string }): Promise<{ secret: string }> {
  const { client: convex, authSubject } = await client(params.session);
  return await convex.mutation("connectedApps:rotateConnectedAppSecret" as any, { authSubject, communityId: params.communityId, appId: params.appId });
}

export async function revokeCloudConnectedApp(params: AppsCall & { appId: string }): Promise<void> {
  const { client: convex, authSubject } = await client(params.session);
  await convex.mutation("connectedApps:revokeConnectedApp" as any, { authSubject, communityId: params.communityId, appId: params.appId });
}
