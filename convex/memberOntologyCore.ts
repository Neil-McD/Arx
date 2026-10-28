/* Member ontology db glue. All consent transitions and all reads route
   through the pure core in shared/memberOntology.ts — no consent logic or
   visibility filtering may be hand-rolled here or at query sites.
   Contract: docs/member-ontology-contract-v1.md. */
import {
  buildMemberSpine,
  canTransitionMemberFactConsent,
  deriveBornConsentState,
  isMemberFactKind,
  isMemberFactProvenance,
  memberFactVisibleToLens,
  normalizeMemberFactBody,
  type MemberFactActorType,
  type MemberFactKind,
  type MemberFactLike,
  type MemberFactProvenance,
  type MemberOntologyLens,
} from "../shared/memberOntology";
import type { MemberAccountContextLike } from "../shared/memberContextMarkdown";
import { communityMembershipRowIsActive } from "./communityCore";
import { getUniqueUserProfileDetailByUserId } from "./profileCore";
import { communityIsActive } from "../shared/communityLifecycle";

export type MemberFactRow = MemberFactLike & {
  _id: any;
  userId: any;
  confidence: number;
  evidenceRefs: string[];
  stalenessScore: number;
  createdByActorType: MemberFactActorType;
  createdByUserId?: any;
  version: number;
  createdAt: number;
  updatedAt: number;
};

export type MemberFactDraft = {
  kind: MemberFactKind;
  body: string;
  provenance: MemberFactProvenance;
  confidence?: number;
  evidenceRef?: string | null;
};

export type MissingBridgeSocialLinkFactInsertResult = {
  requested: number;
  existing: number;
  missing: string[];
  inserted: number;
};

function toFactLike(row: any): MemberFactLike {
  return {
    contextKind: row.contextKind,
    communityId: row.communityId ? String(row.communityId) : null,
    kind: row.kind,
    body: row.body,
    provenance: row.provenance,
    consentState: row.consentState,
  };
}

export function normalizeMemberFactDraft(draft: MemberFactDraft): {
  kind: MemberFactKind;
  body: string;
  provenance: MemberFactProvenance;
  confidence: number;
  evidenceRefs: string[];
} {
  if (!isMemberFactKind(draft.kind)) throw new Error("member_fact_kind_invalid");
  if (!isMemberFactProvenance(draft.provenance)) throw new Error("member_fact_provenance_invalid");
  const body = normalizeMemberFactBody(draft.body);
  if (!body) throw new Error("member_fact_body_required");
  const confidence = Math.max(0, Math.min(1, Number(draft.confidence ?? 1)));
  const evidenceRef = String(draft.evidenceRef ?? "").trim();
  return {
    kind: draft.kind,
    body,
    provenance: draft.provenance,
    confidence,
    evidenceRefs: evidenceRef ? [evidenceRef] : [],
  };
}

export async function insertMemberFacts(ctx: any, args: {
  userId: any;
  communityId: any | null;
  drafts: MemberFactDraft[];
  createdByActorType: MemberFactActorType;
  createdByUserId?: any;
  confirmMarker?: string | null;
  nowMs: number;
}): Promise<string[]> {
  const marker = String(args.confirmMarker ?? "").trim();
  const insertedIds: string[] = [];
  /* One collect for the whole batch; duplicates match in memory. */
  const existingRows = (await ctx.db
    .query("memberFacts")
    .withIndex("by_user_community", (q: any) =>
      q.eq("userId", args.userId).eq("communityId", args.communityId ?? undefined),
    )
    .collect()) as any[];
  const supersededIds = new Set<string>();
  for (const draft of args.drafts) {
    const normalized = normalizeMemberFactDraft(draft);
    /* Same-kind same-body duplicates supersede the older row instead of
       accumulating — idempotent writes for replayed bridges/interviews. */
    for (const existing of existingRows) {
      if (existing.contextKind === "workflow") continue;
      if (existing.kind !== normalized.kind || existing.body !== normalized.body) continue;
      if (supersededIds.has(String(existing._id))) continue;
      if (
        canTransitionMemberFactConsent({
          from: existing.consentState,
          to: "superseded",
          actorType: args.createdByActorType,
        })
      ) {
        supersededIds.add(String(existing._id));
        await ctx.db.patch(existing._id, { consentState: "superseded", updatedAt: args.nowMs });
      }
    }
    const id = await ctx.db.insert("memberFacts", {
      userId: args.userId,
      communityId: args.communityId ?? undefined,
      kind: normalized.kind,
      body: normalized.body,
      provenance: normalized.provenance,
      confidence: normalized.confidence,
      evidenceRefs: marker ? [...normalized.evidenceRefs, marker] : normalized.evidenceRefs,
      stalenessScore: 0,
      consentState: deriveBornConsentState(normalized.provenance),
      createdByActorType: args.createdByActorType,
      createdByUserId: args.createdByUserId ?? undefined,
      version: 1,
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    insertedIds.push(String(id));
  }
  await recomputeMemberSpine(ctx, args.userId, args.nowMs);
  return insertedIds;
}

export async function insertMissingBridgeSocialLinkFacts(ctx: any, args: {
  userId: any;
  links: string[];
  createdByUserId?: any;
  confirmMarker?: string | null;
  nowMs: number;
  dryRun?: boolean;
}): Promise<MissingBridgeSocialLinkFactInsertResult> {
  const marker = String(args.confirmMarker ?? "").trim();
  const requestedLinks = Array.from(
    new Set(
      args.links
        .map((link) => normalizeMemberFactBody(link))
        .filter((link): link is string => Boolean(link)),
    ),
  );
  if (requestedLinks.length === 0) {
    return { requested: 0, existing: 0, missing: [], inserted: 0 };
  }

  const existingRows = (await ctx.db
    .query("memberFacts")
    .withIndex("by_user_community", (q: any) =>
      q.eq("userId", args.userId).eq("communityId", undefined),
    )
    .collect()) as any[];
  const existingLinkBodies = new Set(
    existingRows
      .filter((row) => row.kind === "link" && row.consentState !== "superseded")
      .map((row) => String(row.body ?? "").trim())
      .filter(Boolean),
  );
  const missing = requestedLinks.filter((link) => !existingLinkBodies.has(link));
  if (args.dryRun || missing.length === 0) {
    return {
      requested: requestedLinks.length,
      existing: requestedLinks.length - missing.length,
      missing,
      inserted: 0,
    };
  }

  for (const link of missing) {
    await ctx.db.insert("memberFacts", {
      userId: args.userId,
      communityId: undefined,
      kind: "link",
      body: link,
      provenance: "stated_bridge",
      confidence: 1,
      evidenceRefs: marker ? ["bridge:social_link", marker] : ["bridge:social_link"],
      stalenessScore: 0,
      consentState: deriveBornConsentState("stated_bridge"),
      createdByActorType: "member",
      createdByUserId: args.createdByUserId ?? undefined,
      version: 1,
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });
  }
  await recomputeMemberSpine(ctx, args.userId, args.nowMs);
  return {
    requested: requestedLinks.length,
    existing: requestedLinks.length - missing.length,
    missing,
    inserted: missing.length,
  };
}

export async function recomputeMemberSpine(ctx: any, userId: any, nowMs: number): Promise<void> {
  const rows = (await ctx.db
    .query("memberFacts")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect()) as any[];
  const spine = buildMemberSpine(rows.map(toFactLike));
  const existing = await ctx.db
    .query("memberProfileSpines")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .first();
  const next = {
    userId,
    situation: spine.situation ?? undefined,
    goals: spine.goals,
    interests: spine.interests,
    links: spine.links,
    factCount: rows.length,
    updatedAt: nowMs,
  };
  if (existing) {
    await ctx.db.patch(existing._id, next);
  } else {
    await ctx.db.insert("memberProfileSpines", next);
  }
}

export async function readMemberFactsForLens(ctx: any, args: {
  subjectUserId: any;
  lens: MemberOntologyLens;
  scope?: { communityId: any | null };
}): Promise<MemberFactRow[]> {
  const rows = args.scope
    ? ((await ctx.db
        .query("memberFacts")
        .withIndex("by_user_community", (q: any) =>
          q
            .eq("userId", args.subjectUserId)
            .eq("communityId", args.scope?.communityId ?? undefined),
        )
        .collect()) as any[])
    : ((await ctx.db
        .query("memberFacts")
        .withIndex("by_user", (q: any) => q.eq("userId", args.subjectUserId))
        .collect()) as any[]);
  return rows.filter((row) => memberFactVisibleToLens(toFactLike(row), args.lens)) as MemberFactRow[];
}

// Bounded semantic projection, not an exhaustive fact export. Filtering remains
// owned by the same visibility predicate as all other fact readers.
export async function readBoundedMemberOrientationFacts(ctx: any, args: {
  subjectUserId: any;
  communityId: any;
}) {
  const scanLimit = 120;
  const rows = await ctx.db.query("memberFacts")
    .withIndex("by_user_community", (q: any) =>
      q.eq("userId", args.subjectUserId).eq("communityId", args.communityId))
    .order("desc").take(scanLimit + 1) as MemberFactRow[];
  const visible = rows.slice(0, scanLimit).filter((row) => memberFactVisibleToLens(toFactLike(row), {
    kind: "member_orientation", communityId: String(args.communityId),
  })).sort((a, b) => b.updatedAt - a.updatedAt || String(a._id).localeCompare(String(b._id)));
  return { facts: visible.slice(0, 12), truncated: rows.length > scanLimit || visible.length > 12 };
}

/* The deterministic account block for member.md — assembled from data the
   platform already holds; nothing here is asked of the member. */
export async function loadMemberAccountContext(
  ctx: any,
  userId: any,
  nowMs: number,
): Promise<MemberAccountContextLike> {
  const [user, detail, membershipRows, ownedRows] =
    await Promise.all([
      ctx.db.get(userId),
      getUniqueUserProfileDetailByUserId(ctx, userId),
      ctx.db
        .query("communityMemberships")
        .withIndex("by_user", (q: any) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("communities")
        .withIndex("by_owner", (q: any) => q.eq("ownerId", userId))
        .collect(),
    ]);

  const activeMemberships = (membershipRows as any[]).filter((row) =>
    communityMembershipRowIsActive(row),
  );
  const memberships = (await Promise.all(
    activeMemberships.map(async (row) => {
      const community = await ctx.db.get(row.communityId);
      if (!community || !communityIsActive(community)) return null;
      return {
        communityName: String(community?.name ?? "Community"),
        role: String(row.role ?? "member"),
        accessSource: String(row.accessSource ?? "unknown"),
      };
    }),
  )).filter((row): row is {
    communityName: string;
    role: string;
    accessSource: string;
  } => row !== null);

  const socialLinks = Object.values((detail?.socialLinks ?? {}) as Record<string, unknown>)
    .map((link) => String(link ?? "").trim())
    .filter(Boolean);

  return {
    displayName: detail?.displayName ?? null,
    handle: user?.handle ?? null,
    timezone: detail?.timezone ?? null,
    socialLinks,
    memberships,
    ownedCommunities: (ownedRows as any[])
      .filter((row) => communityIsActive(row))
      .map((row) => ({ name: String(row.name ?? "Community") })),
  };
}

export async function readMemberSpine(ctx: any, userId: any): Promise<{
  situation: string | null;
  goals: string[];
  interests: string[];
  links: string[];
} | null> {
  const row = await ctx.db
    .query("memberProfileSpines")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .first();
  if (!row) return null;
  return {
    situation: row.situation ?? null,
    goals: row.goals ?? [],
    interests: row.interests ?? [],
    links: row.links ?? [],
  };
}
