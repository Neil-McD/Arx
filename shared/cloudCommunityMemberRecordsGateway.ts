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

export type CloudMemberRecords = {
  rows: CloudMemberRecordRow[];
  past: CloudPastMemberRow[];
  prices: Array<{ price_point_id: string; label: string; count: number; current: boolean }>;
  capped: boolean;
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
};

export async function listCloudCommunityMemberRecords<SessionT>(params: { session: SessionT; communityId: string }): Promise<CloudMemberRecords> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.query("communityMemberRecords:listCommunityMemberRecords" as any, { authSubject, communityId: params.communityId }) as CloudMemberRecords;
}

export async function getCloudCommunityMemberRecord<SessionT>(params: { session: SessionT; communityId: string; membershipId: string | null }): Promise<CloudMemberRecord | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  return await client.query("communityMemberRecords:getCommunityMemberRecord" as any, {
    authSubject,
    communityId: params.communityId,
    ...(params.membershipId ? { membershipId: params.membershipId } : {}),
  }) as CloudMemberRecord | null;
}
