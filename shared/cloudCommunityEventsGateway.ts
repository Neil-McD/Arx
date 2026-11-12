import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import { coerceGatewayRows } from "./cloudGateway";

type CloudCommunityEventsGatewayParams<SessionT> = {
  session: SessionT;
};

export type CloudCommunityEventLocationType = "online" | "physical" | "tbd";
export type CloudCommunityEventVisibility = "members" | "public";
export type CloudCommunityEventStatus = "live" | "cancelled";
export type CloudCommunityEventRecurrenceFrequency = "none" | "daily" | "weekly" | "monthly";

export type CloudCommunityEvent = {
  id: string;
  community_id: string;
  title: string;
  description_md: string | null;
  starts_at: string;
  ends_at: string | null;
  starts_at_zoned: string;
  ends_at_zoned: string | null;
  series_starts_at: string;
  series_ends_at: string | null;
  timezone: string;
  location_type: CloudCommunityEventLocationType;
  location_label: string | null;
  url: string | null;
  visibility: CloudCommunityEventVisibility;
  status: CloudCommunityEventStatus;
  recurrence_frequency: CloudCommunityEventRecurrenceFrequency;
  recurrence_interval: number;
  recurrence_until: string | null;
  parent_event_id: string;
  is_recurring_instance: boolean;
  created_at: string;
  updated_at: string;
  // A pod's call: only people who can enter that pod get it.
  pod_channel_id?: string | null;
  pod_name?: string | null;
  pod_slug?: string | null;
};

export type CloudCommunityEventSavePayload = {
  community_id?: string;
  // Schedules a pod's call (its hosts may).
  pod_channel_id?: string;
  title: string;
  description_md?: string | null;
  starts_at: string;
  ends_at?: string | null;
  timezone?: string;
  location_type?: CloudCommunityEventLocationType;
  location_label?: string | null;
  url?: string | null;
  visibility?: CloudCommunityEventVisibility;
  status?: CloudCommunityEventStatus;
  recurrence_frequency?: CloudCommunityEventRecurrenceFrequency;
  recurrence_interval?: number;
  recurrence_until?: string | null;
};

export async function listCloudCommunityEvents<SessionT>(
  params: CloudCommunityEventsGatewayParams<SessionT> & {
    communityId: string;
    startIso: string;
    endIso: string;
    includeCancelled?: boolean;
    overlap?: boolean;
    limit?: number;
  },
): Promise<CloudCommunityEvent[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("communityEvents:listCommunityEvents" as any, {
    authSubject,
    communityId: params.communityId,
    startIso: params.startIso,
    endIso: params.endIso,
    includeCancelled: params.includeCancelled ?? false,
    ...(params.overlap === undefined ? {} : { overlap: params.overlap }),
    limit:
      typeof params.limit === "number" && Number.isFinite(params.limit)
        ? Math.max(1, Math.floor(params.limit))
        : 200,
  });
  return coerceGatewayRows<CloudCommunityEvent>(payload);
}

export async function saveCloudCommunityEvent<SessionT>(
  params: CloudCommunityEventsGatewayParams<SessionT> & {
    eventId: string | null;
    payload: CloudCommunityEventSavePayload;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("communityEvents:saveCommunityEvent" as any, {
    authSubject,
    eventId: params.eventId,
    payload: params.payload,
  });
}

export async function cancelCloudCommunityEvent<SessionT>(
  params: CloudCommunityEventsGatewayParams<SessionT> & {
    eventId: string;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("communityEvents:cancelCommunityEvent" as any, {
    authSubject,
    eventId: params.eventId,
  });
}

// "Going" (design v1 Events): per date of an event.
export type CloudCommunityEventGoing = {
  event_id: string;
  occurrence_starts_at: number;
  count: number;
  count_capped: boolean;
  mine: boolean;
  host_name: string | null;
  faces: Array<{ user_id: string; name: string; avatar_url: string | null }>;
};

export async function listCloudCommunityEventGoing<SessionT>(params: {
  session: SessionT;
  communityId: string;
  items: Array<{ eventId: string; occurrenceStartsAt: number }>;
}): Promise<CloudCommunityEventGoing[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.query("communityEventGoing:listCommunityEventGoing" as any, { authSubject, communityId: params.communityId, items: params.items }) as CloudCommunityEventGoing[];
}

export async function setCloudCommunityEventGoing<SessionT>(params: {
  session: SessionT;
  communityId: string;
  eventId: string;
  occurrenceStartsAt: number;
  going: boolean;
}): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("communityEventGoing:setCommunityEventGoing" as any, {
    authSubject, communityId: params.communityId, eventId: params.eventId, occurrenceStartsAt: params.occurrenceStartsAt, going: params.going,
  });
}
