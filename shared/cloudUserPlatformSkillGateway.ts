import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { CreateSkillPackageInput } from "./skillPackageTypes";
import type { UserPlatformInstalledSkill } from "./userPlatformSkillTypes";

type CloudUserPlatformSkillGatewayParams<SessionT> = {
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

export async function listCloudUserPlatformSkills<SessionT>(
  params: CloudUserPlatformSkillGatewayParams<SessionT>,
): Promise<UserPlatformInstalledSkill[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = await client.query("userPlatformSkills:listUserPlatformSkills" as any, {
    authSubject,
  });
  return coerceObjectRows<UserPlatformInstalledSkill>(payload);
}

export async function createCloudUserPlatformSkill<SessionT>(
  params: CloudUserPlatformSkillGatewayParams<SessionT> & {
    input: CreateSkillPackageInput;
  },
): Promise<UserPlatformInstalledSkill | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = (await client.mutation(
    "userPlatformSkills:createUserPlatformSkill" as any,
    {
      authSubject,
      catalogSkillId: params.input.catalog_skill_id,
      name: params.input.name,
      description: params.input.description,
      instructionsMd: params.input.instructions_md,
    },
  )) as UserPlatformInstalledSkill | null;
  return payload ?? null;
}

export async function updateCloudUserPlatformSkillInstall<SessionT>(
  params: CloudUserPlatformSkillGatewayParams<SessionT> & {
    userPlatformSkillInstallId: string;
    enabled?: boolean;
  },
): Promise<UserPlatformInstalledSkill | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = (await client.mutation(
    "userPlatformSkills:updateUserPlatformSkillInstall" as any,
    {
      authSubject,
      userPlatformSkillInstallId: params.userPlatformSkillInstallId,
      enabled: params.enabled,
    },
  )) as UserPlatformInstalledSkill | null;
  return payload ?? null;
}

export async function updateCloudUserPlatformSkillPackage<SessionT>(
  params: CloudUserPlatformSkillGatewayParams<SessionT> & {
    userPlatformSkillInstallId: string;
    name?: string;
    description?: string;
    instructionsMd?: string;
  },
): Promise<UserPlatformInstalledSkill | null> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = (await client.mutation(
    "userPlatformSkills:updateUserPlatformSkillPackage" as any,
    {
      authSubject,
      userPlatformSkillInstallId: params.userPlatformSkillInstallId,
      name: params.name,
      description: params.description,
      instructionsMd: params.instructionsMd,
    },
  )) as UserPlatformInstalledSkill | null;
  return payload ?? null;
}

export async function deleteCloudUserPlatformSkill<SessionT>(
  params: CloudUserPlatformSkillGatewayParams<SessionT> & {
    userPlatformSkillInstallId: string;
  },
): Promise<boolean> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = (await client.mutation(
    "userPlatformSkills:deleteUserPlatformSkill" as any,
    {
      authSubject,
      userPlatformSkillInstallId: params.userPlatformSkillInstallId,
    },
  )) as { removed?: unknown } | null;
  return payload?.removed === true;
}
