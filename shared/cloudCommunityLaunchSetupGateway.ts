import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { CommunityLaunchSetupStatus } from "./communityLaunchSetup";

type CloudCommunityLaunchSetupGatewayParams<SessionT> = {
  session: SessionT;
};

export type CloudCommunityLaunchProfileSaveInput = {
  name?: string;
  slug?: string;
  oneLiner?: string | null;
  about?: string | null;
  avatarUrl?: string | null;
  avatarStorageId?: string | null;
  avatarFocusX?: number | null;
  avatarFocusY?: number | null;
  avatarZoom?: number | null;
  bannerUrl?: string | null;
  bannerStorageId?: string | null;
  bannerFocusX?: number | null;
  bannerFocusY?: number | null;
  bannerZoom?: number | null;
  visibility?: string;
};

export type CloudCommunityLaunchProfileSaveResult = {
  id: string;
  slug: string;
  name: string;
  owner_id: string;
  one_liner: string | null;
  about: string | null;
  avatar_url: string | null;
  avatar_storage_id?: string | null;
  avatar_focus_x?: number | null;
  avatar_focus_y?: number | null;
  avatar_zoom?: number | null;
  banner_url: string | null;
  banner_storage_id?: string | null;
  banner_focus_x?: number | null;
  banner_focus_y?: number | null;
  banner_zoom?: number | null;
  visibility: string;
  entry_policy?: "open" | "approval" | "paid_subscription" | null;
  created_at: string;
  updated_at: string;
};

export async function loadCloudCommunityLaunchSetupStatus<SessionT>(
  params: CloudCommunityLaunchSetupGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<CommunityLaunchSetupStatus | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = await client.query("community:getCommunityLaunchSetupStatus" as any, {
    authSubject,
    communityId: params.communityId,
  });
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  return payload as CommunityLaunchSetupStatus;
}

export async function saveCloudCommunityLaunchProfile<SessionT>(
  params: CloudCommunityLaunchSetupGatewayParams<SessionT> & {
    communityId: string;
    input: CloudCommunityLaunchProfileSaveInput;
  },
): Promise<CloudCommunityLaunchProfileSaveResult | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = await client.mutation("community:saveCommunityLaunchProfile" as any, {
    authSubject,
    communityId: params.communityId,
    ...params.input,
  });
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  return payload as CloudCommunityLaunchProfileSaveResult;
}
