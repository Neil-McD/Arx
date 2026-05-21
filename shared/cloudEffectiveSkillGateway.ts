import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { EffectiveSkill } from "./effectiveSkills";

type CloudEffectiveSkillGatewayParams<SessionT> = {
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

export async function listCloudEffectiveSkills<SessionT>(
  params: CloudEffectiveSkillGatewayParams<SessionT> & {
    communityId?: string | null;
  },
): Promise<EffectiveSkill[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = await client.query("harnessSkills:listEffectiveSkills" as any, {
    authSubject,
    communityId: params.communityId ?? undefined,
  });
  return coerceObjectRows<EffectiveSkill>(payload);
}
