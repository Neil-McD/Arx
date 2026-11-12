// Pods (convex/communityPods.ts; docs/specs/pods-v0.md).
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

export type CloudCommunityPod = {
  channel_id: string;
  slug: string;
  name: string;
  purpose: string;
  visibility: "listed" | "hidden";
  seats: number | null;
  members: number;
  last_active_at: string | null;
  is_member: boolean;
  is_host: boolean;
  can_manage: boolean;
  waiting: number;
};

export type CloudOutsidePod = {
  channel_id: string;
  name: string;
  purpose: string;
  hosts: string[];
  seats_left: number | null;
  my_request: "pending" | "waitlist" | "declined" | null;
};

export type CloudPodDetail = {
  channel_id: string;
  name: string;
  purpose: string;
  visibility: "listed" | "hidden";
  seats: number | null;
  hosts: string[];
  members: Array<{ user_id: string; name: string; is_host: boolean }>;
  can_manage: boolean;
  can_edit: boolean;
  requests: Array<{ user_id: string; name: string; status: "pending" | "waitlist"; created_at: string }>;
};

async function client(session: unknown) {
  return await bootstrapConvexAuthenticatedClient(session as any);
}

export async function fetchCloudCommunityPods(params: { session: unknown; communityId: string; asMember?: boolean }): Promise<{ can_manage: boolean; pods: CloudCommunityPod[]; outside: CloudOutsidePod[] }> {
  const { client: convex, authSubject } = await client(params.session);
  const payload = await convex.query("communityPods:listCommunityPods" as any, {
    authSubject, communityId: params.communityId, ...(params.asMember ? { asMember: true } : {}),
  });
  return {
    can_manage: Boolean(payload?.can_manage),
    pods: Array.isArray(payload?.pods) ? payload.pods : [],
    outside: Array.isArray(payload?.outside) ? payload.outside : [],
  };
}

export async function fetchCloudPod(params: { session: unknown; communityId: string; channelId: string }): Promise<CloudPodDetail> {
  const { client: convex, authSubject } = await client(params.session);
  return await convex.query("communityPods:getPod" as any, { authSubject, communityId: params.communityId, channelId: params.channelId });
}

export async function saveCloudPodDetails(params: { session: unknown; communityId: string; channelId: string; purpose?: string; visibility?: "listed" | "hidden"; seats?: number }): Promise<void> {
  const { client: convex, authSubject } = await client(params.session);
  const { session: _session, ...rest } = params;
  await convex.mutation("communityPods:savePodDetails" as any, { authSubject, ...rest });
}

export async function requestToJoinCloudPod(params: { session: unknown; communityId: string; channelId: string }): Promise<{ status: string }> {
  const { client: convex, authSubject } = await client(params.session);
  return await convex.mutation("communityPods:requestToJoinPod" as any, { authSubject, communityId: params.communityId, channelId: params.channelId });
}

export async function decideCloudPodRequest(params: { session: unknown; communityId: string; channelId: string; userId: string; approve: boolean }): Promise<void> {
  const { client: convex, authSubject } = await client(params.session);
  await convex.mutation("communityPods:decidePodRequest" as any, { authSubject, communityId: params.communityId, channelId: params.channelId, userId: params.userId, approve: params.approve });
}

export async function setCloudPodHost(params: { session: unknown; communityId: string; channelId: string; userId: string; host: boolean }): Promise<void> {
  const { client: convex, authSubject } = await client(params.session);
  await convex.mutation("communityPods:setPodHost" as any, { authSubject, communityId: params.communityId, channelId: params.channelId, userId: params.userId, host: params.host });
}
