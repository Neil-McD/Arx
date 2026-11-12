import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { MemberMoney, MemberOutReason, MemberPlan } from "./communityMemberRecords";

// Members, the host's side: the table and one member's record. Only people who
// manage members may read either (the server refuses everyone else).

export type CloudMemberRecordRow = {
  membership_id: string | null;
  user_id: string;
  name: string;
  handle: string | null;
  avatar_url: string | null;
  role: "owner" | "admin" | "moderator" | "member";
  plan: MemberPlan;
  money: MemberMoney;
  joined_at: string | null;
  last_active_at: string | null;
  working_on: string | null;
};

export type CloudPastMemberRow = {
  membership_id: string | null;
  user_id: string;
  name: string;
  avatar_url: string | null;
  reason: MemberOutReason;
  reason_text: string;
  was_on: string | null;
  at: string | null;
  rejoined: boolean;
};

export type CloudMemberSummary = {
  counts: { everyone: number; on_hold: number; cancelling: number; comped: number; know_little: number; past: number };
  // Everyone in, less those whose card is on hold (the left column's number).
  with_access: number;
  prices: Array<{ price_point_id: string; label: string; count: number; current: boolean }>;
  capped: boolean;
};

export type CloudMemberRecordsPage = {
  rows: CloudMemberRecordRow[];
  past: CloudPastMemberRow[];
  isDone: boolean;
  continueCursor: string;
};

export type CloudMemberRecord = {
  membership_id: string | null;
  user_id: string;
  name: string;
  handle: string | null;
  avatar_url: string | null;
  role: string;
  joined_at: string | null;
  last_active_at: string | null;
  out: { reason: MemberOutReason; text: string } | null;
  plan: MemberPlan;
  money: MemberMoney;
  facts: Array<{ kind: string; label: string; body: string; source: string; at: string | null }>;
  events: Array<{ kind: string; text: string; at: string | null }>;
  notes: Array<{ id: string; body: string; author: string; at: string; can_delete: boolean }>;
};

export async function getCloudCommunityMemberSummary<SessionT>(params: { session: SessionT; communityId: string }): Promise<CloudMemberSummary> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.query("communityMemberRecords:getCommunityMemberSummary" as any, { authSubject, communityId: params.communityId }) as CloudMemberSummary;
}

export async function listCloudCommunityMemberRecordsPage<SessionT>(params: { session: SessionT; communityId: string; view: string; cursor: string | null; numItems?: number }): Promise<CloudMemberRecordsPage> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.query("communityMemberRecords:listCommunityMemberRecordsPage" as any, {
    authSubject, communityId: params.communityId, view: params.view,
    paginationOpts: { numItems: params.numItems ?? 100, cursor: params.cursor },
  }) as CloudMemberRecordsPage;
}

export async function compCloudCommunityMember<SessionT>(params: { session: SessionT; communityId: string; membershipId: string }): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("communityMemberRecords:compCommunityMember" as any, { authSubject, communityId: params.communityId, membershipId: params.membershipId });
}

export async function getCloudCommunityMemberRecord<SessionT>(params: { session: SessionT; communityId: string; membershipId: string | null }): Promise<CloudMemberRecord | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.query("communityMemberRecords:getCommunityMemberRecord" as any, {
    authSubject,
    communityId: params.communityId,
    ...(params.membershipId ? { membershipId: params.membershipId } : {}),
  }) as CloudMemberRecord | null;
}

export async function addCloudCommunityMemberNote<SessionT>(params: { session: SessionT; communityId: string; membershipId: string | null; body: string }): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("communityMemberRecords:addCommunityMemberNote" as any, {
    authSubject, communityId: params.communityId, body: params.body,
    ...(params.membershipId ? { membershipId: params.membershipId } : {}),
  });
}

export async function deleteCloudCommunityMemberNote<SessionT>(params: { session: SessionT; communityId: string; noteId: string }): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("communityMemberRecords:deleteCommunityMemberNote" as any, { authSubject, communityId: params.communityId, noteId: params.noteId });
}

// The member's side: who is here and what each person shared.
export type CloudMemberDirectoryRow = {
  membership_id: string | null;
  user_id: string;
  name: string;
  avatar_url: string | null;
  role: "owner" | "admin" | "moderator" | "member";
  working_on: string | null;
  here_now: boolean;
  you: boolean;
};

export type CloudMemberProfile = {
  membership_id: string | null;
  user_id: string;
  name: string;
  avatar_url: string | null;
  role: string;
  here_now: boolean;
  you: boolean;
  facts: Array<{ kind: string; label: string; body: string }>;
  in_common: string[];
};

export async function listCloudCommunityMemberDirectory<SessionT>(params: { session: SessionT; communityId: string }): Promise<CloudMemberDirectoryRow[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const result = await client.query("communityMemberProfiles:listCommunityMemberDirectory" as any, { authSubject, communityId: params.communityId }) as { rows: CloudMemberDirectoryRow[] };
  return result.rows;
}

export async function getCloudCommunityMemberProfile<SessionT>(params: { session: SessionT; communityId: string; membershipId: string | null }): Promise<CloudMemberProfile | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.query("communityMemberProfiles:getCommunityMemberProfile" as any, {
    authSubject, communityId: params.communityId,
    ...(params.membershipId ? { membershipId: params.membershipId } : {}),
  }) as CloudMemberProfile | null;
}
