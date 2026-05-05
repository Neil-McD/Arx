import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";
import type { EffectiveMcpApp } from "./effectiveMcpApps";

type CloudEffectiveMcpAppGatewayParams<SessionT> = {
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

export async function listCloudEffectiveMcpApps<SessionT>(
  params: CloudEffectiveMcpAppGatewayParams<SessionT> & {
    communityId?: string | null;
  },
): Promise<EffectiveMcpApp[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(
    params.session,
  );
  const payload = await client.query(
    "harnessMounts:listEffectiveMcpApps" as any,
    {
      authSubject,
      communityId: params.communityId ?? undefined,
    },
  );
  return coerceObjectRows<EffectiveMcpApp>(payload);
}
