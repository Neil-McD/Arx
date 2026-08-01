import { bootstrapGatewayAuthContext } from "./cloudGateway";
import { COMMUNITY_OWNER_INFERENCE_TERMS_VERSION } from "./founderInference";

export type CloudFounderInferenceStatus = {
  eligible: boolean;
  cohort_key: string | null;
  status: "approved" | "active" | "suspended" | null;
  model_id: string;
  key_connected: boolean;
  key_last_four: string | null;
  activated_at: string | null;
  suspended_at: string | null;
  communities: Array<{ id: string; name: string; slug: string }>;
};

const INELIGIBLE_STATUS: CloudFounderInferenceStatus = {
  eligible: false,
  cohort_key: null,
  status: null,
  model_id: "gpt-5.6-luna",
  key_connected: false,
  key_last_four: null,
  activated_at: null,
  suspended_at: null,
  communities: [],
};

function nullableString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function coerceStatus(payload: unknown): CloudFounderInferenceStatus {
  if (!payload || typeof payload !== "object") return INELIGIBLE_STATUS;
  const row = payload as Record<string, unknown>;
  const rawStatus = nullableString(row.status);
  const status = rawStatus === "approved" || rawStatus === "active" || rawStatus === "suspended"
    ? rawStatus
    : null;
  const communities = Array.isArray(row.communities)
    ? row.communities.flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const community = value as Record<string, unknown>;
        const id = nullableString(community.id);
        if (!id) return [];
        return [{
          id,
          name: nullableString(community.name) ?? "Untitled community",
          slug: nullableString(community.slug) ?? "",
        }];
      })
    : [];
  return {
    eligible: row.eligible === true,
    cohort_key: nullableString(row.cohort_key),
    status,
    model_id: nullableString(row.model_id) ?? "gpt-5.6-luna",
    key_connected: row.key_connected === true,
    key_last_four: nullableString(row.key_last_four),
    activated_at: nullableString(row.activated_at),
    suspended_at: nullableString(row.suspended_at),
    communities,
  };
}

export async function loadCloudFounderInferenceStatus<SessionT>(params: {
  session: SessionT;
}): Promise<CloudFounderInferenceStatus> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  const payload = await client.query("founderInference:getCurrentFounderInferenceStatus" as any, {
    authSubject,
  });
  return coerceStatus(payload);
}

export async function activateCloudFounderInference<SessionT>(params: {
  session: SessionT;
  acceptedTerms: boolean;
}): Promise<void> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  await client.action("founderInference:activateFounderInference" as any, {
    authSubject,
    acceptedTerms: params.acceptedTerms,
    acceptedTermsVersion: COMMUNITY_OWNER_INFERENCE_TERMS_VERSION,
  });
}

export async function suspendCloudFounderInference<SessionT>(params: {
  session: SessionT;
}): Promise<void> {
  const { client, authSubject } = await bootstrapGatewayAuthContext(params.session);
  await client.mutation("founderInference:suspendFounderInference" as any, { authSubject });
}
