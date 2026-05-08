import { bootstrapConvexAuthenticatedClient, type ConvexClient } from "./convexAuthenticatedClient";
import { coerceGatewayRows, firstGatewayRow } from "./cloudGateway";
import type { AccountSetupStatus } from "./accountSetup";

type CloudProfilesGatewayParams<SessionT> = {
  session: SessionT;
};

type CloudProfileBase = {
  user_id: string;
  display_name: string | null;
  handle?: string | null;
  normalized_handle?: string | null;
  avatar_url: string | null;
};

export type CloudProfileDetailRow = CloudProfileBase & {
  bio: string | null;
  onboarding_direction?: "build_community" | "discover_community" | "learn_about_polynet" | null;
  onboarding_completed_at?: string | null;
  account_setup?: AccountSetupStatus | null;
};

export type CloudProfileHandleAvailability = {
  available: boolean;
  status: "empty" | "too_short" | "too_long" | "invalid_format" | "reserved" | "available" | "taken";
  handle: string | null;
  normalized_handle: string | null;
};

async function bootstrapConvexUser(sessionRaw: unknown): Promise<{
  client: ConvexClient;
  authSubject: string;
}> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(sessionRaw);
  return { client, authSubject };
}

export async function listCloudProfileRowsByUserIds<SessionT, TProfile extends CloudProfileBase = CloudProfileBase>(
  params: CloudProfilesGatewayParams<SessionT> & {
    userIds: string[];
  },
): Promise<TProfile[]> {
  const uniqueIds = Array.from(new Set(params.userIds.map((id) => id.trim()).filter(Boolean)));
  if (uniqueIds.length === 0) return [];
  const { client } = await bootstrapConvexUser(params.session);
  const payload = await client.query("profiles:listProfilesByUserIds" as any, {
    userIds: uniqueIds,
  });
  return coerceGatewayRows<TProfile>(payload);
}

export async function fetchCloudProfileDetailByUserId<SessionT, TProfile extends CloudProfileDetailRow = CloudProfileDetailRow>(
  params: CloudProfilesGatewayParams<SessionT> & {
    userId: string;
  },
): Promise<TProfile | null> {
  const { client } = await bootstrapConvexUser(params.session);
  const payload = await client.query("profiles:getProfileDetailByUserId" as any, {
    userId: params.userId,
  });
  return firstGatewayRow<TProfile>(payload);
}

export async function resolveCloudOnboardingProfileDetail<SessionT, TProfile extends CloudProfileDetailRow = CloudProfileDetailRow>(
  params: CloudProfilesGatewayParams<SessionT> & {
    userId: string;
  },
): Promise<TProfile | null> {
  const { client, authSubject } = await bootstrapConvexUser(params.session);
  const payload = await client.mutation("profiles:resolveOnboardingProfileDetail" as any, {
    authSubject,
    userId: params.userId,
  });
  return firstGatewayRow<TProfile>(payload);
}

export async function loadCloudAccountSetupStatus<SessionT>(
  params: CloudProfilesGatewayParams<SessionT>,
): Promise<AccountSetupStatus | null> {
  const { client, authSubject } = await bootstrapConvexUser(params.session);
  return (await client.query("profiles:getMyAccountSetupStatus" as any, {
    authSubject,
  })) as AccountSetupStatus | null;
}

export async function checkCloudProfileHandleAvailability<SessionT>(
  params: CloudProfilesGatewayParams<SessionT> & {
    handle: string;
  },
): Promise<CloudProfileHandleAvailability> {
  const { client, authSubject } = await bootstrapConvexUser(params.session);
  return (await client.query("profiles:checkHandleAvailability" as any, {
    authSubject,
    handle: params.handle,
  })) as CloudProfileHandleAvailability;
}

export async function upsertCloudProfileDetail<SessionT, TProfile extends CloudProfileDetailRow = CloudProfileDetailRow>(
  params: CloudProfilesGatewayParams<SessionT> & {
    userId: string;
    displayName: string | null;
    handle?: string | null;
    avatarUrl: string | null;
    bio: string | null;
    onboardingDirection?: "build_community" | "discover_community" | "learn_about_polynet" | null;
    completeOnboarding?: boolean;
  },
): Promise<TProfile | null> {
  const { client, authSubject } = await bootstrapConvexUser(params.session);
  const payload = await client.mutation("profiles:upsertProfileDetail" as any, {
    authSubject,
    userId: params.userId,
    displayName: params.displayName,
    handle: params.handle,
    avatarUrl: params.avatarUrl,
    bio: params.bio,
    onboardingDirection: params.onboardingDirection,
    completeOnboarding: params.completeOnboarding,
  });
  return firstGatewayRow<TProfile>(payload);
}
