import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type {
  CommunityAttachedSkill,
  CreateSkillPackageInput,
  SkillPackageSummary,
} from "./communitySkillTypes";

type CloudCommunitySkillGatewayParams<SessionT> = {
  session: SessionT;
};

function coerceObjectRows<TRow>(payload: unknown): TRow[] {
  if (Array.isArray(payload)) return payload as TRow[];
  if (!payload || typeof payload !== "object") return [];
  const payloadObj = payload as Record<string, unknown>;
  for (const key of ["rows", "items", "data"] as const) {
    const value = payloadObj[key];
    if (Array.isArray(value)) return value as TRow[];
  }
  return [payload as TRow];
}

export async function listCloudCommunitySkillAttachments<SessionT>(
  params: CloudCommunitySkillGatewayParams<SessionT> & {
    communityId: string;
  },
): Promise<CommunityAttachedSkill[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = await client.query("community:listCommunitySkillAttachments" as any, {
    authSubject,
    communityId: params.communityId,
  });
  return coerceObjectRows<CommunityAttachedSkill>(payload);
}

export async function listCloudOwnedSkillPackages<SessionT>(
  params: CloudCommunitySkillGatewayParams<SessionT>,
): Promise<SkillPackageSummary[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = await client.query("community:listOwnedSkillPackages" as any, {
    authSubject,
  });
  return coerceObjectRows<SkillPackageSummary>(payload);
}

export async function createCloudSkillPackage<SessionT>(
  params: CloudCommunitySkillGatewayParams<SessionT> & {
    input: CreateSkillPackageInput;
  },
): Promise<SkillPackageSummary | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = (await client.mutation("community:createSkillPackage" as any, {
    authSubject,
    name: params.input.name,
    description: params.input.description,
    instructionsMd: params.input.instructions_md,
  })) as SkillPackageSummary | null;
  return payload ?? null;
}

export async function attachCloudSkillPackageToCommunity<SessionT>(
  params: CloudCommunitySkillGatewayParams<SessionT> & {
    communityId: string;
    skillPackageId: string;
  },
): Promise<CommunityAttachedSkill | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = (await client.mutation(
    "community:attachSkillPackageToCommunity" as any,
    {
      authSubject,
      communityId: params.communityId,
      skillPackageId: params.skillPackageId,
    },
  )) as CommunityAttachedSkill | null;
  return payload ?? null;
}

export async function updateCloudCommunitySkillAttachment<SessionT>(
  params: CloudCommunitySkillGatewayParams<SessionT> & {
    communityId: string;
    communitySkillAttachmentId: string;
    enabled?: boolean;
  },
): Promise<CommunityAttachedSkill | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = (await client.mutation(
    "community:updateCommunitySkillAttachment" as any,
    {
      authSubject,
      communityId: params.communityId,
      communitySkillAttachmentId: params.communitySkillAttachmentId,
      enabled: params.enabled,
    },
  )) as CommunityAttachedSkill | null;
  return payload ?? null;
}

export async function detachCloudCommunitySkill<SessionT>(
  params: CloudCommunitySkillGatewayParams<SessionT> & {
    communityId: string;
    communitySkillAttachmentId: string;
  },
): Promise<boolean> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = (await client.mutation("community:detachCommunitySkill" as any, {
    authSubject,
    communityId: params.communityId,
    communitySkillAttachmentId: params.communitySkillAttachmentId,
  })) as { removed?: unknown } | null;
  return payload?.removed === true;
}
