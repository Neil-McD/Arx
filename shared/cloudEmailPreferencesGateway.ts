import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

export type CloudEmailPreferences = {
  weekly_digest_enabled: boolean;
  updated_at: number | null;
};

function normalizeEmailPreferences(value: unknown): CloudEmailPreferences {
  const row = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  return {
    weekly_digest_enabled: row.weekly_digest_enabled !== false,
    updated_at:
      typeof row.updated_at === "number" && Number.isFinite(row.updated_at)
        ? row.updated_at
        : null,
  };
}

export async function loadCloudEmailPreferences<SessionT>(params: {
  session: SessionT;
}): Promise<CloudEmailPreferences> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.query("emailPreferences:getMyEmailPreferences" as any, {
    authSubject,
  });
  return normalizeEmailPreferences(payload);
}

export async function updateCloudWeeklyDigestPreference<SessionT>(params: {
  session: SessionT;
  enabled: boolean;
}): Promise<CloudEmailPreferences> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("emailPreferences:updateMyEmailPreferences" as any, {
    authSubject,
    weeklyDigestEnabled: params.enabled,
  });
  return normalizeEmailPreferences(payload);
}
