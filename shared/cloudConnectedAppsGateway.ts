// Connected apps (convex/connectedApps.ts; one door, docs/specs/builder-modalities-v0.md).
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

export type CloudConnectedApp = {
  app_id: string;
  name: string;
  webhook_url: string | null;
  app_url: string | null;
  redirect_urls: string[];
  secret_hint: string;
  created_at: string;
};
export type CloudCommunityAppLink = { name: string; url: string };
export type ConnectedAppAuthorizeContext =
  | {
      ok: true;
      redirect_uri: string;
      app: { app_id: string; name: string; app_url: string | null };
      community: { slug: string; name: string };
      user: { email: string | null; email_verified: boolean; display_name: string | null; is_blocked: boolean };
      access: { allowed: boolean; tier: { key: string; name: string } | null; grants: string[] };
    }
  | { ok: false; error: "invalid_client" | "invalid_redirect_uri" | "invalid_pkce" };
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
export async function registerCloudConnectedApp(params: AppsCall & { name: string; webhookUrl?: string; appUrl?: string; redirectUrls?: string[] }): Promise<{ app_id: string; secret: string; webhook_signing_secret: string }> {
  const { client: convex, authSubject } = await client(params.session);
  return await convex.mutation("connectedApps:registerConnectedApp" as any, {
    authSubject, communityId: params.communityId, name: params.name,
    ...(params.webhookUrl ? { webhookUrl: params.webhookUrl } : {}),
    ...(params.appUrl ? { appUrl: params.appUrl } : {}),
    ...(params.redirectUrls?.length ? { redirectUrls: params.redirectUrls } : {}),
  });
}

// Members: the community's apps to open from its left column.
export async function fetchCloudCommunityAppLinks(params: AppsCall): Promise<CloudCommunityAppLink[]> {
  const { client: convex, authSubject } = await client(params.session);
  const result = await convex.query("connectedApps:listCommunityAppLinks" as any, { authSubject, communityId: params.communityId });
  return Array.isArray(result?.apps) ? result.apps : [];
}

export async function updateCloudConnectedApp(params: AppsCall & { appId: string; webhookUrl?: string; appUrl?: string; redirectUrls?: string[] }): Promise<void> {
  const { client: convex, authSubject } = await client(params.session);
  await convex.mutation("connectedApps:updateConnectedApp" as any, {
    authSubject, communityId: params.communityId, appId: params.appId,
    ...(params.webhookUrl !== undefined ? { webhookUrl: params.webhookUrl } : {}),
    ...(params.appUrl !== undefined ? { appUrl: params.appUrl } : {}),
    ...(params.redirectUrls !== undefined ? { redirectUrls: params.redirectUrls } : {}),
  });
}

export async function rotateCloudConnectedAppSecret(params: AppsCall & { appId: string }): Promise<{ secret: string }> {
  const { client: convex, authSubject } = await client(params.session);
  return await convex.mutation("connectedApps:rotateConnectedAppSecret" as any, { authSubject, communityId: params.communityId, appId: params.appId });
}

export async function revokeCloudConnectedApp(params: AppsCall & { appId: string }): Promise<void> {
  const { client: convex, authSubject } = await client(params.session);
  await convex.mutation("connectedApps:revokeConnectedApp" as any, { authSubject, communityId: params.communityId, appId: params.appId });
}

export async function fetchConnectedAppAuthorizeContext(params: {
  session: unknown;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
}): Promise<ConnectedAppAuthorizeContext> {
  const { client: convex, authSubject } = await client(params.session);
  return await convex.query("connectedApps:getConnectedAppAuthorizeContext" as any, {
    authSubject,
    clientId: params.clientId,
    redirectUri: params.redirectUri,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: params.codeChallengeMethod,
  });
}

export async function approveConnectedAppAuthorization(params: {
  session: unknown;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
}): Promise<{ code: string; redirect_uri: string }> {
  const { client: convex, authSubject } = await client(params.session);
  return await convex.mutation("connectedApps:approveConnectedAppAuthorization" as any, {
    authSubject,
    clientId: params.clientId,
    redirectUri: params.redirectUri,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: params.codeChallengeMethod,
  });
}
