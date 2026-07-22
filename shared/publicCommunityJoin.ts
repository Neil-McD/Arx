import { bootstrapConvexAuthenticatedClient, type ConvexClient } from "./convexAuthenticatedClient";
import { normalizeCommunitySlugIdentity } from "./communitySlug";

export type SessionLike = {
  access_token: string;
};

async function bootstrapConvexUserForPublicJoin(sessionRaw: unknown): Promise<{
  client: ConvexClient;
  authSubject: string;
}> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(sessionRaw);
  return { client, authSubject };
}

function normalizeErrorToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function collectStructuredErrorFields(error: unknown, collect: (value: unknown) => void): void {
  if (!error || typeof error !== "object") return;
  const record = error as Record<string, unknown>;
  collect(record.code);
  collect(record.message);
  collect(record.details);
  collect(record.hint);
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export type PublicCommunityJoinErrorKind =
  | "paid_plan_required"
  | "approval_pending"
  | "approval_denied"
  | "authentication_required"
  | "community_not_found"
  | "forbidden"
  | null;

export type PublicCommunityJoinResult = {
  outcome: "joined" | "approval_pending" | "approval_denied" | "paid_plan_required";
  community_id: string;
  reapply_at?: string | null;
};

export function requirePublicCommunityJoinResult(value: unknown): PublicCommunityJoinResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("community_join_contract_invalid");
  }
  const record = value as Record<string, unknown>;
  const outcome = record.outcome;
  if (
    outcome !== "joined" &&
    outcome !== "approval_pending" &&
    outcome !== "approval_denied" &&
    outcome !== "paid_plan_required"
  ) {
    throw new Error("community_join_contract_invalid");
  }
  const communityId = typeof record.community_id === "string" ? record.community_id.trim() : "";
  if (!communityId) throw new Error("community_join_contract_invalid");
  const rawReapplyAt = record.reapply_at;
  if (rawReapplyAt !== undefined && rawReapplyAt !== null && typeof rawReapplyAt !== "string") {
    throw new Error("community_join_contract_invalid");
  }
  const reapplyAt = typeof rawReapplyAt === "string" ? rawReapplyAt.trim() || null : null;
  if (outcome === "approval_denied" && !reapplyAt) {
    throw new Error("community_join_contract_invalid");
  }
  return {
    outcome,
    community_id: communityId,
    ...(rawReapplyAt !== undefined ? { reapply_at: reapplyAt } : null),
  };
}

export function classifyPublicCommunityJoinError(error: unknown): PublicCommunityJoinErrorKind {
  const values: string[] = [];
  const collect = (value: unknown) => {
    const normalized = normalizeErrorToken(value);
    if (normalized) values.push(normalized);
  };

  collectStructuredErrorFields(error, collect);
  if (error instanceof Error) {
    collect(error.message);
  } else if (!error || typeof error !== "object") {
    collect(error);
  }

  const has = (token: string): boolean =>
    values.some((value) => value === token || value.includes(token));

  if (has("paid_plan_required")) return "paid_plan_required";
  if (has("approval_pending")) return "approval_pending";
  if (has("approval_denied")) return "approval_denied";
  if (has("approval_required")) return "approval_pending";
  if (has("community_not_found") || has("community not found")) return "community_not_found";
  if (has("forbidden") || has("42501")) return "forbidden";
  if (has("authentication required") || has("28000")) return "authentication_required";

  return null;
}

export async function joinPublicCommunityRpc<S extends SessionLike>(opts: {
  session: S;
  communitySlug: string;
}): Promise<PublicCommunityJoinResult> {
  const { client } = await bootstrapConvexUserForPublicJoin(opts.session);
  const slug = normalizeCommunitySlugIdentity(opts.communitySlug);
  if (!slug) throw new Error("community_slug_required");
  const result = await client.mutation("community:joinPublicCommunityBySlug" as any, {
    communitySlug: slug,
  });
  return requirePublicCommunityJoinResult(result);
}
