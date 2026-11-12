// Pods (convex/communityPods.ts; docs/specs/pods-v0.md).
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

export type CloudCommunityPod = {
  channel_id: string;
  slug: string;
  name: string;
  purpose: string;
  members: number;
  last_active_at: string | null;
  is_member: boolean;
};

export async function fetchCloudCommunityPods(params: { session: unknown; communityId: string; asMember?: boolean }): Promise<{ can_manage: boolean; pods: CloudCommunityPod[] }> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  const payload = await client.query("communityPods:listCommunityPods" as any, {
    authSubject, communityId: params.communityId, ...(params.asMember ? { asMember: true } : {}),
  });
  return { can_manage: Boolean(payload?.can_manage), pods: Array.isArray(payload?.pods) ? payload.pods : [] };
}

export async function saveCloudPodPurpose(params: { session: unknown; communityId: string; channelId: string; purpose: string }): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  await client.mutation("communityPods:savePodPurpose" as any, { authSubject, communityId: params.communityId, channelId: params.channelId, purpose: params.purpose });
}
