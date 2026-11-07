import { type StoredInteractionActorType } from "./communityAgentIdentity.ts";

export const COMMUNITY_EVIDENCE_SURFACES = [
  "member_agent_dock",
  "coding_harness",
  "external_mcp",
  "community_concierge",
  "community_funnel_builder",
] as const;

export type CommunityEvidenceSurface =
  (typeof COMMUNITY_EVIDENCE_SURFACES)[number];
export type CommunityInteractionEvidenceObjectType = "root" | "reply";

export type CommunityResourceEvidenceRef = `resource:${string}`;

export type CommunityResourceLineageEnvelope = {
  authority: { type: "community"; community_id: string };
  recorded_by: { type: "user"; user_id: string } | null;
  credit: null;
  attribution_mode: "unattributed";
  origin: "community_resource";
  evidence: { ref: CommunityResourceEvidenceRef };
  profile_projection: "none";
};

export type CommunityInteractionEvidenceRef =
  `interaction:${CommunityInteractionEvidenceObjectType}:${string}`;

export type CommunityInteractionLineageActorType =
  | StoredInteractionActorType;

export type CommunityLineagePrincipal =
  | { type: "user"; user_id: string }
  | { type: "agent"; agent_key: string }
  | { type: "community"; community_id: string }
  | { type: "system" };

export type CommunityInteractionLineageEnvelope = {
  actor: {
    type: CommunityInteractionLineageActorType;
    user_id: string | null;
    agent_key: string | null;
  };
  authority: CommunityLineagePrincipal;
  credit: CommunityLineagePrincipal | null;
  attribution_mode:
    | "direct"
    | "on_behalf_of"
    | "autonomous"
    | "unattributed"
    | "system";
  origin: "community_chat";
  channel: {
    id: string | null;
    slug: string;
  };
  evidence: {
    ref: CommunityInteractionEvidenceRef;
  };
  episode: {
    type: "conversation";
    ref: CommunityInteractionEvidenceRef;
  };
  relation: {
    type: "replies_to";
    ref: CommunityInteractionEvidenceRef;
  } | null;
  profile_projection: "source_only";
};

export function buildCommunityInteractionEvidenceRef(args: {
  objectType: CommunityInteractionEvidenceObjectType;
  objectId: string;
}): CommunityInteractionEvidenceRef {
  const objectId = String(args.objectId ?? "").trim();
  if (!objectId) throw new Error("community_interaction_evidence_id_required");
  return `interaction:${args.objectType}:${objectId}`;
}
export function parseCommunityInteractionEvidenceRef(
  raw: unknown,
): { objectType: CommunityInteractionEvidenceObjectType; objectId: string } | null {
  const value = String(raw ?? "").trim();
  const match = /^interaction:(root|reply):([^\s:]+)$/.exec(value);
  if (!match) return null;
  return {
    objectType: match[1] as CommunityInteractionEvidenceObjectType,
    objectId: match[2],
  };
}

export function buildCommunityResourceEvidenceRef(
  resourceId: string,
): CommunityResourceEvidenceRef {
  const normalized = String(resourceId ?? "").trim();
  if (!normalized) throw new Error("community_resource_evidence_id_required");
  return `resource:${normalized}`;
}

export function parseCommunityResourceEvidenceRef(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  const match = /^resource:([^\s:]+)$/.exec(value);
  return match?.[1] ?? null;
}

/**
 * Resource publication proves community authority, not authorship. The
 * persisted creator is retained only as the accountable recorder; automated
 * and changeset-backed creation means it must never imply human credit.
 */
export function deriveCommunityResourceLineageEnvelope(args: {
  communityId: string;
  resourceId: string;
  recordedByUserId?: string | null;
}): CommunityResourceLineageEnvelope {
  const communityId = String(args.communityId ?? "").trim();
  if (!communityId) throw new Error("community_resource_lineage_community_id_required");
  const recordedByUserId = String(args.recordedByUserId ?? "").trim() || null;
  return {
    authority: { type: "community", community_id: communityId },
    recorded_by: recordedByUserId
      ? { type: "user", user_id: recordedByUserId }
      : null,
    credit: null,
    attribution_mode: "unattributed",
    origin: "community_resource",
    evidence: { ref: buildCommunityResourceEvidenceRef(args.resourceId) },
    profile_projection: "none",
  };
}

export function normalizeCommunityEvidenceSearchLimit(raw: unknown): number {
  const parsed = Math.floor(Number(raw ?? 10));
  if (!Number.isFinite(parsed)) return 10;
  return Math.max(1, Math.min(20, parsed));
}

/**
 * Current interaction writes are intentionally limited to attribution cases
 * that can be derived without guessing. Agent-written evidence receives no
 * human credit: a future publishing mutation must persist an explicit credit
 * decision before a human profile may claim that contribution.
 */
export function deriveCommunityInteractionLineageEnvelope(args: {
  actorType: CommunityInteractionLineageActorType;
  actorUserId?: string | null;
  actorAgentKey?: string | null;
  communityId: string;
  channelId?: string | null;
  channelSlug?: string | null;
  objectType: CommunityInteractionEvidenceObjectType;
  objectId: string;
  rootId: string;
  targetReplyId?: string | null;
}): CommunityInteractionLineageEnvelope {
  const actorUserId = String(args.actorUserId ?? "").trim() || null;
  const actorAgentKey = String(args.actorAgentKey ?? "").trim() || null;
  const communityId = String(args.communityId ?? "").trim();
  if (!communityId) throw new Error("community_lineage_community_id_required");
  const channelId = String(args.channelId ?? "").trim() || null;
  const channelSlug = String(args.channelSlug ?? "").trim() || "general";

  const actor = {
    type: args.actorType,
    user_id: actorUserId,
    agent_key: actorAgentKey,
  };

  let authority: CommunityLineagePrincipal;
  let credit: CommunityLineagePrincipal | null = null;
  let attributionMode: CommunityInteractionLineageEnvelope["attribution_mode"];

  if (args.actorType === "human") {
    if (actorUserId) {
      authority = { type: "user", user_id: actorUserId };
      credit = { type: "user", user_id: actorUserId };
      attributionMode = "direct";
    } else {
      authority = { type: "system" };
      attributionMode = "unattributed";
    }
  } else if (args.actorType === "community_agent") {
    authority = { type: "community", community_id: communityId };
    if (actorAgentKey) {
      credit = { type: "agent", agent_key: actorAgentKey };
      attributionMode = "autonomous";
    } else {
      attributionMode = "unattributed";
    }
  } else {
    authority = { type: "system" };
    attributionMode = "system";
  }

  const episodeRef = buildCommunityInteractionEvidenceRef({
    objectType: "root",
    objectId: args.rootId,
  });
  const evidenceRef = buildCommunityInteractionEvidenceRef({
    objectType: args.objectType,
    objectId: args.objectId,
  });
  const relation = args.objectType === "reply"
    ? {
        type: "replies_to" as const,
        ref: args.targetReplyId
          ? buildCommunityInteractionEvidenceRef({
              objectType: "reply",
              objectId: args.targetReplyId,
            })
          : episodeRef,
      }
    : null;

  return {
    actor,
    authority,
    credit,
    attribution_mode: attributionMode,
    origin: "community_chat",
    channel: {
      id: channelId,
      slug: channelSlug,
    },
    evidence: {
      ref: evidenceRef,
    },
    episode: {
      type: "conversation",
      ref: episodeRef,
    },
    relation,
    profile_projection: "source_only",
  };
}

export function communityInteractionVisibilityIsEvidenceReadable(
  raw: unknown,
): raw is "community" | "public" {
  return raw === "community" || raw === "public";
}
