import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { CommunityMemberAccess } from "./communityAccess";
import type { CommunityClientPropertyType, CommunityClientPropertyValue } from "./communityClients";
import type { CommunityClientBulkActionType, CommunityClientField, CommunityClientView } from "./communityClientViews";

// Who can use what, and until when: the Clients list with its Access column,
// one client's Access panel, the owner's connected services (such as the
// a paid MCP server) and the member's own license key.

export type CloudCommunityAccessGrant = {
  id: string;
  status: "active" | "ended";
  reason: string;
  ends_at: string | null;
  granted_at: string | null;
  granted_by_user_id: string;
  granted_via: "web" | "agent";
  ended_at: string | null;
  ended_reason: string | null;
  /** The offer this access is for (Settings › Offers); the base offer when null. */
  offer_key?: string | null;
};

export type CloudCommunityLicenseKey = { last4: string; created_at: string | null; last_checked_at: string | null };

export type CloudCommunityClientAccess = CommunityMemberAccess & {
  grant: CloudCommunityAccessGrant | null;
  license_key: CloudCommunityLicenseKey | null;
};

export type CloudCommunityClient = {
  membership_id: string;
  user_id: string;
  name: string;
  avatar_url: string | null;
  status: string;
  role: string;
  access_source: string | null;
  joined_at: string | null;
  left_at: string | null;
  stage: { key: string; name: string; color?: string | null; entered_at: string | null; completed_at: string | null } | null;
  lessons_done: number;
  last_active_at: string | null;
  stuck: boolean;
  access: CloudCommunityClientAccess;
  is_test?: boolean;
  email?: string | null;
  subscription?: { status: string; cancel_at_period_end: boolean; current_period_end_at: string | null } | null;
  courses?: Array<{ ref: string; name: string | null; lesson_count: number; done_count: number; percent: number; completed_at: string | null }>;
  forms_submitted?: number;
  last_seen_at?: string | null;
  last_progress_at?: string | null;
  last_lesson_done_at?: string | null;
  last_form_submitted_at?: string | null;
  last_flagged_at?: string | null;
  last_contacted_at?: string | null;
  referred_by?: string | null;
  facts?: Array<{ kind: string; body: string }>;
  properties?: Record<string, CommunityClientPropertyValue | null>;
};

export type CloudCommunityClientProperty = { key: string; name: string; type: CommunityClientPropertyType; options: string[]; position?: number;
  /** Kept by Polynet ("offer": the offers a member has), so it reads but never edits. */
  system?: "offer" };

export type CloudCommunityClientPage = {
  clients: CloudCommunityClient[];
  next_cursor: string | null;
  properties?: CloudCommunityClientProperty[];
  fields?: CommunityClientField[];
  stuck_days?: number;
};

export type CloudCommunityClientViews = { views: CommunityClientView[]; fields: CommunityClientField[] };

export type CloudCommunityClientBulkAction = {
  bulk_action_id: string; type: CommunityClientBulkActionType; status: "running" | "done";
  total: number; done: number; succeeded: number; failed: Array<{ membership_id: string; code: string }>;
};

export type CloudCommunityClientBulkInput =
  | { type: "set_property"; propertyKey: string; value: CommunityClientPropertyValue | null }
  | { type: "message" | "flag" | "note"; body?: string };

export type CloudCommunityClientAccessDetail = {
  membership_id: string;
  access: CommunityMemberAccess;
  is_test_member: boolean;
  grant: CloudCommunityAccessGrant | null;
  grants: CloudCommunityAccessGrant[];
  license_key: CloudCommunityLicenseKey | null;
  integrations: Array<{
    id: string;
    name: string;
    entitled: boolean;
    last_event: { event_id: string; entitled: boolean | null; status: string; created_at: string | null; delivered_at: string | null; last_error_code: string | null } | null;
  }>;
};

export type CloudCommunityTimelineEntry = { at: string | null; type: string; summary: string };

export type CloudCommunityAccessIntegration = {
  id: string;
  name: string;
  webhook_url: string;
  price_point_ids: string[];
  include_owner_grants: boolean;
  status: string;
  api_key_last4: string;
  signing_secret_last4: string;
  created_at: string | null;
  last_delivered_at: string | null;
  last_failed_at: string | null;
  last_error_code: string | null;
  last_lookup_at: string | null;
};

export type CloudCommunityAccessPricePoint = {
  id: string; name: string; billing_period: string; amount_base_units: number; currency: string; currency_decimals: number; is_current: boolean;
};

export type CloudCommunityAccessIntegrations = {
  integrations: CloudCommunityAccessIntegration[];
  price_points: CloudCommunityAccessPricePoint[];
  loopback_webhooks_allowed: boolean;
  lookup_url: string | null;
};

export type CloudCommunityAccessEvent = {
  event_id: string;
  type: string;
  member_id: string | null;
  member_email: string | null;
  entitled: boolean | null;
  status: "pending" | "delivering" | "delivered" | "needs_attention";
  attempt_count: number;
  response_status: number | null;
  last_error_code: string | null;
  created_at: string | null;
  delivered_at: string | null;
  next_attempt_at: string | null;
};

export type CloudCommunityIntegrationInput = { name: string; webhookUrl: string; pricePointIds: string[]; includeOwnerGrants: boolean };

export type CloudMyCommunityAccess = {
  community: { id: string; slug: string; name: string };
  access: CommunityMemberAccess;
  license_key_available: boolean;
  license_key: CloudCommunityLicenseKey | null;
};

const community = (communityId: string) => communityId as Id<"communities">;

export async function listCloudCommunityClients(session: unknown, communityId: string, cursor?: string | null): Promise<CloudCommunityClientPage> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return await client.query(api.communityClients.listClientsForOwner, {
    authSubject, communityId: community(communityId), ...(cursor ? { cursor } : {}),
  }) as unknown as CloudCommunityClientPage;
}

// The Members page: every page of clients at once, so views filter the whole community.
export async function listAllCloudCommunityClients(session: unknown, communityId: string): Promise<CloudCommunityClientPage> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  let cursor: string | null = null;
  let first: CloudCommunityClientPage | null = null;
  const clients: CloudCommunityClient[] = [];
  for (let page = 0; page < 40; page++) {
    const result = await client.query(api.communityClients.listClientsForOwner, {
      authSubject, communityId: community(communityId), ...(cursor ? { cursor } : {}),
    }) as unknown as CloudCommunityClientPage;
    first ??= result;
    clients.push(...result.clients.filter((row) => !clients.some((known) => known.membership_id === row.membership_id)));
    cursor = result.next_cursor;
    if (!cursor) break;
  }
  return { ...first!, clients, next_cursor: cursor };
}

export async function listCloudClientViews(session: unknown, communityId: string): Promise<CloudCommunityClientViews> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return await client.query(api.communityClients.listClientViews, { authSubject, communityId: community(communityId) }) as unknown as CloudCommunityClientViews;
}

export async function saveCloudClientView(session: unknown, communityId: string, input: { key?: string; view: Omit<CommunityClientView, "key">; position?: number }) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return await client.mutation(api.communityClients.saveClientView, { authSubject, communityId: community(communityId), ...input }) as { view: CommunityClientView };
}

export async function deleteCloudClientView(session: unknown, communityId: string, key: string) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return await client.mutation(api.communityClients.deleteClientView, { authSubject, communityId: community(communityId), key });
}

export async function createCloudClientProperty(session: unknown, communityId: string, input: { name: string; type: CommunityClientPropertyType; options?: string[] }) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return await client.mutation(api.communityClients.createClientProperty, { authSubject, communityId: community(communityId), ...input }) as { property: CloudCommunityClientProperty };
}

export async function updateCloudClientProperty(session: unknown, communityId: string, key: string, input: { name?: string; options?: string[]; position?: number }) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return await client.mutation(api.communityClients.updateClientProperty, { authSubject, communityId: community(communityId), key, ...input });
}

export async function archiveCloudClientProperty(session: unknown, communityId: string, key: string) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return await client.mutation(api.communityClients.archiveClientProperty, { authSubject, communityId: community(communityId), key });
}

export async function setCloudClientPropertyValue(session: unknown, communityId: string, membershipId: string, key: string, value: CommunityClientPropertyValue | null) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return await client.mutation(api.communityClients.setClientPropertyValue, { authSubject, communityId: community(communityId), membershipId, key, value });
}

export async function recordCloudClientEvent(session: unknown, communityId: string, membershipId: string, type: "flagged" | "note", body?: string) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return await client.mutation(api.communityClients.recordClientEvent, { authSubject, communityId: community(communityId), membershipId, type, ...(body ? { body } : {}) });
}

export async function setCloudClientStuckDays(session: unknown, communityId: string, stuckDays: number) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return await client.mutation(api.communityClients.setClientSettings, { authSubject, communityId: community(communityId), stuckDays });
}

export async function runCloudClientBulkAction(session: unknown, communityId: string, action: CloudCommunityClientBulkInput, membershipIds: string[]) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return await client.mutation(api.communityClients.runClientBulkAction, { authSubject, communityId: community(communityId), action, membershipIds }) as { bulk_action_id: string };
}

export async function fetchCloudClientBulkAction(session: unknown, communityId: string, bulkActionId: string): Promise<CloudCommunityClientBulkAction> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return await client.query(api.communityClients.getClientBulkAction, { authSubject, communityId: community(communityId), bulkActionId }) as unknown as CloudCommunityClientBulkAction;
}

export async function fetchCloudClientTimeline(session: unknown, communityId: string, membershipId: string): Promise<CloudCommunityTimelineEntry[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  const result = await client.query(api.communityClients.getClientTimeline, { authSubject, communityId: community(communityId), membershipId });
  return (result as any).entries ?? [];
}

export async function fetchCloudClientAccess(session: unknown, communityId: string, membershipId: string): Promise<CloudCommunityClientAccessDetail> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return await client.query(api.communityAccess.getClientAccess, { authSubject, communityId: community(communityId), membershipId }) as unknown as CloudCommunityClientAccessDetail;
}

/** Give access by hand (or change its end date): to a client, or by verified email. */
export async function grantCloudCommunityAccess(session: unknown, communityId: string, input: {
  membershipId?: string; email?: string; endsAt: string | null; reason: string; offerKey?: string | null;
}): Promise<{ membership_id: string; grant: CloudCommunityAccessGrant }> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return await client.mutation(api.communityAccess.grantCommunityAccess, {
    authSubject, communityId: community(communityId), reason: input.reason, endsAt: input.endsAt,
    ...(input.membershipId ? { membershipId: input.membershipId } : {}), ...(input.email ? { email: input.email } : {}),
    ...(input.offerKey ? { offerKey: input.offerKey } : {}),
  }) as any;
}

export async function endCloudCommunityAccess(session: unknown, communityId: string, membershipId: string) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return await client.mutation(api.communityAccess.endCommunityAccess, { authSubject, communityId: community(communityId), membershipId });
}

export async function revokeCloudClientLicenseKey(session: unknown, communityId: string, membershipId: string) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return await client.mutation(api.communityAccess.revokeClientLicenseKeyForOwner, { authSubject, communityId: community(communityId), membershipId });
}

export async function fetchCloudMyCommunityMemberAccess(session: unknown, communityId: string): Promise<CloudMyCommunityAccess> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return await client.query(api.communityAccess.getMyCommunityAccess, { authSubject, communityId: community(communityId) }) as unknown as CloudMyCommunityAccess;
}

/** A new key, shown once; any older key stops working. */
export async function createCloudMyCommunityLicenseKey(session: unknown, communityId: string): Promise<{ key: string; last4: string; rotated: boolean }> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return await client.mutation(api.communityAccess.createMyCommunityLicenseKey, { authSubject, communityId: community(communityId) }) as any;
}

export async function listCloudAccessIntegrations(session: unknown, communityId: string): Promise<CloudCommunityAccessIntegrations> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return await client.query(api.communityAccess.listAccessIntegrations, { authSubject, communityId: community(communityId) }) as unknown as CloudCommunityAccessIntegrations;
}

/** The API key and signing secret come back once, here. */
export async function createCloudAccessIntegration(session: unknown, communityId: string, input: CloudCommunityIntegrationInput): Promise<{
  integration: CloudCommunityAccessIntegration; api_key: string; signing_secret: string;
}> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return await client.mutation(api.communityAccess.createAccessIntegration, { authSubject, communityId: community(communityId), ...input }) as any;
}

export async function updateCloudAccessIntegration(session: unknown, communityId: string, integrationId: string, input: Partial<CloudCommunityIntegrationInput>) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return await client.mutation(api.communityAccess.updateAccessIntegration, { authSubject, communityId: community(communityId), integrationId, ...input });
}

export async function rotateCloudAccessIntegrationSecret(session: unknown, communityId: string, integrationId: string, which: "api_key" | "signing_secret"): Promise<{ api_key?: string; signing_secret?: string }> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return await client.mutation(api.communityAccess.rotateAccessIntegrationSecret, { authSubject, communityId: community(communityId), integrationId, which }) as any;
}

export async function revokeCloudAccessIntegration(session: unknown, communityId: string, integrationId: string) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return await client.mutation(api.communityAccess.revokeAccessIntegration, { authSubject, communityId: community(communityId), integrationId });
}

export async function sendCloudAccessIntegrationTest(session: unknown, communityId: string, integrationId: string) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return await client.mutation(api.communityAccess.sendAccessIntegrationTest, { authSubject, communityId: community(communityId), integrationId });
}

export async function listCloudAccessIntegrationEvents(session: unknown, communityId: string, integrationId: string): Promise<CloudCommunityAccessEvent[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  const result = await client.query(api.communityAccess.listAccessIntegrationEvents, { authSubject, communityId: community(communityId), integrationId });
  return (result as any).events ?? [];
}

export async function retryCloudAccessIntegrationEvent(session: unknown, communityId: string, integrationId: string, eventId: string) {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(session);
  return await client.mutation(api.communityAccess.retryAccessIntegrationEvent, { authSubject, communityId: community(communityId), integrationId, eventId });
}

/** Plain words for the error codes the access functions throw. */
export function communityAccessErrorMessage(error: unknown): string {
  const data = (error as any)?.data;
  const raw = [data?.code, typeof data === "string" ? data : "", (error as any)?.message].filter(Boolean).join(" ");
  const messages: Record<string, string> = {
    access_grant_email_invalid: "That email address doesn't look right.",
    access_grant_user_not_found: "No Polynet account has verified that email yet. Ask them to sign up first.",
    access_grant_email_ambiguous: "More than one account uses that email. Give access from their row in Clients instead.",
    access_grant_owner: "You own this community, so you always have access.",
    access_grant_user_blocked: "This person is banned from the community.",
    access_grant_member_paying: "They're on a paid plan. Change or cancel it in billing first.",
    access_grant_offer_unavailable: "That offer is archived or gone. Pick another in Settings › Offers.",
    access_grant_not_found: "There's no access you gave to end.",
    access_grant_reason_required: "Add a short reason, such as \"Trial\" or \"Comp for a podcast guest\".",
    access_grant_reason_too_long: "Keep the reason under 200 characters.",
    access_grant_end_invalid: "Pick a valid end date.",
    access_grant_end_in_past: "The end date has to be in the future.",
    access_grant_end_too_far: "Pick an end date within ten years, or choose no end date.",
    license_key_requires_access: "You need access to this community to make a key.",
    license_key_not_found: "They don't have a license key.",
    access_integration_limit_reached: "A community can connect up to 5 services.",
    access_integration_plans_invalid: "One of the chosen plans no longer exists.",
    access_integration_name_invalid: "Give the service a name of up to 60 characters.",
    access_webhook_url_invalid: "That webhook address isn't a valid URL.",
    access_webhook_url_not_public: "The webhook has to be a public address.",
    access_webhook_url_https_required: "The webhook address has to start with https://.",
    community_client_not_found: "That client isn't in this community.",
  };
  // The code travels inside the server's error text.
  const code = Object.keys(messages).find((key) => raw.includes(key));
  return code ? messages[code] : "That didn't work. Try again.";
}
