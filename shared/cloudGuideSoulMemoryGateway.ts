import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { PersonalMemoryCategory } from "./personalMemory";

export type MyGuideSoulMemoryView = {
  soul_md: string;
  soul_is_default: boolean;
  soul_updated_at: number | null;
  soul_updated_by: "guide" | "member" | null;
  soul_max_chars: number;
  entries: Array<{ text: string; category: PersonalMemoryCategory; at: number }>;
  memory_chars: number;
  memory_max_chars: number;
  memory_updated_at: number | null;
};

export type CommunityGuideSoulMemoryView = {
  soul_md: string;
  soul_is_default: boolean;
  soul_updated_at: number | null;
  soul_updated_by: "guide" | "founder" | null;
  soul_max_chars: number;
  memory_summary_md: string;
  memory_note_count: number;
  memory_updated_at: number | null;
};

type BaseParams = { session: unknown; communityId: string };

export async function getCloudMyGuideSoulAndMemory(params: BaseParams): Promise<MyGuideSoulMemoryView> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  return await client.query("memberMemory:getMyGuideSoulAndMemory" as any, {
    authSubject,
    communityId: params.communityId,
  });
}

export async function saveCloudMyGuideSoul(
  params: BaseParams & { soulMd: string | null },
): Promise<MyGuideSoulMemoryView> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  return await client.mutation("memberMemory:saveMyGuideSoul" as any, {
    authSubject,
    communityId: params.communityId,
    soulMd: params.soulMd,
  });
}

export type MyGuideMemoryOperation =
  | { action: "add"; text: string; category: PersonalMemoryCategory }
  | { action: "remove"; text: string }
  | { action: "clear" };

export async function saveCloudMyGuideMemory(
  params: BaseParams & { operation: MyGuideMemoryOperation },
): Promise<MyGuideSoulMemoryView> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  return await client.mutation("memberMemory:saveMyGuideMemory" as any, {
    authSubject,
    communityId: params.communityId,
    operation: params.operation,
  });
}

export async function getCloudCommunityGuideSoulAndMemory(
  params: BaseParams,
): Promise<CommunityGuideSoulMemoryView> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  return await client.query("communityAgent:getCommunityGuideSoulAndMemory" as any, {
    authSubject,
    communityId: params.communityId,
  });
}

export async function saveCloudCommunityGuideSoul(
  params: BaseParams & { soulMd: string | null },
): Promise<CommunityGuideSoulMemoryView> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session as any);
  return await client.mutation("communityAgent:saveCommunityGuideSoul" as any, {
    authSubject,
    communityId: params.communityId,
    soulMd: params.soulMd,
  });
}
