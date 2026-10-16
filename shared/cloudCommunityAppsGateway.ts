import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { CommunityAppTool } from "./communityAppSession";

export type CloudCommunityAppSummary = { slug: string; name: string; origin: string };
export type CloudCommunityAppDetail = CloudCommunityAppSummary & {
  id: string;
  allowed_tools: CommunityAppTool[];
  status: "active" | "disabled";
  updated_at: string;
};
export type CloudCommunityAppSession = { token: string; expires_at: string; origin: string; app_slug: string };

export async function listCloudCommunityAppsForMember(session: unknown, communityId: string): Promise<CloudCommunityAppSummary[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return client.query(api.communityApps.listCommunityAppsForMember, { authSubject, communityId: communityId as Id<"communities"> });
}

export async function mintCloudCommunityAppSession(session: unknown, communityId: string, appSlug: string): Promise<CloudCommunityAppSession> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return client.action(api.communityApps.mintCommunityAppSession, { authSubject, communityId: communityId as Id<"communities">, appSlug });
}

export async function listCloudCommunityAppsForManager(session: unknown, communityId: string): Promise<CloudCommunityAppDetail[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return client.query(api.communityApps.listCommunityApps, { authSubject, communityId: communityId as Id<"communities"> }) as Promise<CloudCommunityAppDetail[]>;
}

export async function registerCloudCommunityApp(
  session: unknown,
  communityId: string,
  app: { slug: string; name: string; origin: string; allowedTools: CommunityAppTool[] },
): Promise<CloudCommunityAppDetail> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return client.mutation(api.communityApps.registerCommunityApp, {
    authSubject, communityId: communityId as Id<"communities">, ...app,
  }) as Promise<CloudCommunityAppDetail>;
}

export async function setCloudCommunityAppStatus(
  session: unknown,
  communityId: string,
  slug: string,
  status: "active" | "disabled",
): Promise<CloudCommunityAppDetail> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return client.mutation(api.communityApps.setCommunityAppStatus, {
    authSubject, communityId: communityId as Id<"communities">, slug, status,
  }) as Promise<CloudCommunityAppDetail>;
}
