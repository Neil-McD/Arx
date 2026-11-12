// Pods (convex/communityPods.ts, convex/communityPodPayments.ts; docs/specs/pods-v0.md).
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

// A paid pod's monthly price, charged on top of membership. Null: not paid.
export type CloudPodPrice = { amount_base_units: number; currency: string } | null;

export function formatPodPrice(price: CloudPodPrice): string {
  if (!price) return "";
  const amount = price.amount_base_units / 100;
  return "$" + (Number.isInteger(amount) ? String(amount) : amount.toFixed(2)) + "/month";
}

export type CloudPodPaymentState = "paying" | "leaving" | "payment_problem";

// A pod's own page (/c/:slug/pods/:podSlug), as this viewer may see it.
export type CloudPodPage =
  | { kind: "not_found" }
  | { kind: "inside"; slug: string }
  | {
    kind: "outside";
    channel_id: string;
    slug: string;
    name: string;
    purpose: string;
    what_you_get: string[];
    hosts: string[];
    visibility: "listed" | "hidden";
    price: CloudPodPrice;
    seats_left: number | null;
    my_request: "pending" | "waitlist" | "declined" | null;
    checkout_open: boolean;
    // When it meets: never the link or who is going.
    rhythm: { recurrence_frequency: string; next_starts_at: string } | null;
    can_edit: boolean;
    can_enter: boolean;
  };

export type CloudCommunityPod = {
  channel_id: string;
  slug: string;
  name: string;
  purpose: string;
  visibility: "listed" | "hidden";
  seats: number | null;
  price: CloudPodPrice;
  members: number;
  last_active_at: string | null;
  is_member: boolean;
  is_host: boolean;
  can_manage: boolean;
  waiting: number;
};

export type CloudOutsidePod = {
  channel_id: string;
  slug: string;
  name: string;
  purpose: string;
  hosts: string[];
  seats_left: number | null;
  price: CloudPodPrice;
  my_request: "pending" | "waitlist" | "declined" | null;
};

export type CloudPodDetail = {
  channel_id: string;
  name: string;
  purpose: string;
  visibility: "listed" | "hidden";
  seats: number | null;
  price: CloudPodPrice;
  what_you_get: string[];
  // The pod's next call, with its link.
  next_call: { event_id: string; title: string; starts_at: string; url: string | null; recurrence_frequency: string } | null;
  slug: string;
  hosts: string[];
  // payment: how each member is in, for the people who manage the pod only.
  members: Array<{ user_id: string; name: string; is_host: boolean; payment?: { state: CloudPodPaymentState | "added"; until: string | null } }>;
  // The viewer's own place in it, when they are in it.
  my_membership: { state: CloudPodPaymentState | "added"; until: string | null; amount_base_units: number; currency: string } | null;
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

export async function saveCloudPodDetails(params: { session: unknown; communityId: string; channelId: string; purpose?: string; visibility?: "listed" | "hidden"; seats?: number; whatYouGet?: string[] }): Promise<void> {
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

// Builders: the pod's monthly price in base units; 0 makes it not paid.
export async function saveCloudPodPrice(params: { session: unknown; communityId: string; channelId: string; amountBaseUnits: number }): Promise<void> {
  const { client: convex, authSubject } = await client(params.session);
  await convex.mutation("communityPodPayments:savePodPrice" as any, { authSubject, communityId: params.communityId, channelId: params.channelId, amountBaseUnits: params.amountBaseUnits });
}

// Join a paid pod: Stripe's checkout page to send the member to.
export async function startCloudPodCheckout(params: { session: unknown; communityId: string; channelId: string; successUrl: string; cancelUrl: string }): Promise<{ checkout_url: string; payment_id: string }> {
  const { client: convex, authSubject } = await client(params.session);
  return await convex.action("communityPodPayments:startPodCheckout" as any, {
    authSubject, communityId: params.communityId, channelId: params.channelId, successUrl: params.successUrl, cancelUrl: params.cancelUrl,
  });
}

// Back from Stripe: asks Polynet to check with Stripe now.
export async function confirmCloudPodCheckout(params: { session: unknown; paymentId: string }): Promise<{ status: string }> {
  const { client: convex, authSubject } = await client(params.session);
  return await convex.action("communityPodPayments:confirmPodCheckout" as any, { authSubject, paymentId: params.paymentId });
}

export async function fetchCloudPodPage(params: { session: unknown; communityId: string; podSlug: string; asMember?: boolean; preview?: boolean }): Promise<CloudPodPage> {
  const { client: convex, authSubject } = await client(params.session);
  return await convex.query("communityPods:getPodPage" as any, {
    authSubject, communityId: params.communityId, podSlug: params.podSlug, ...(params.asMember ? { asMember: true } : {}), ...(params.preview ? { preview: true } : {}),
  });
}

// Leave a pod: paying members keep access to the end of the period.
export async function leaveCloudPod(params: { session: unknown; communityId: string; channelId: string }): Promise<{ left: "now" | "at_period_end" }> {
  const { client: convex, authSubject } = await client(params.session);
  return await convex.action("communityPodPayments:leavePod" as any, { authSubject, communityId: params.communityId, channelId: params.channelId });
}

export function formatPodDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
