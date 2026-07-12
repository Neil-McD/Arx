/* Member ontology pure core — the contract's state machine and lenses with no
   database attached. See docs/member-ontology-contract-v1.md. The Convex glue
   (convex/memberOntologyCore.ts) must route every consent transition and every
   read through these functions; the contract proof exercises them directly. */

export const MEMBER_FACT_KINDS = [
  "situation",
  "goal",
  "skill",
  "interest",
  "availability",
  "preference",
  "link",
] as const;

export type MemberFactKind = (typeof MEMBER_FACT_KINDS)[number];

export const MEMBER_FACT_PROVENANCES = [
  "stated_bridge",
  "stated_interview",
  "form_answer",
  "social_enrichment",
  "inferred_agent",
  "observed_behavior",
] as const;

export type MemberFactProvenance = (typeof MEMBER_FACT_PROVENANCES)[number];

export const MEMBER_FACT_CONSENT_STATES = [
  "approved",
  "pending",
  "rejected",
  "retracted",
  "superseded",
  "agent_internal",
] as const;

export type MemberFactConsentState = (typeof MEMBER_FACT_CONSENT_STATES)[number];

export type MemberFactActorType = "member" | "admin" | "agent" | "compiler" | "system";

export const MAX_MEMBER_FACT_BODY_LENGTH = 500;

export function isMemberFactKind(value: unknown): value is MemberFactKind {
  return MEMBER_FACT_KINDS.includes(value as MemberFactKind);
}

export function isMemberFactProvenance(value: unknown): value is MemberFactProvenance {
  return MEMBER_FACT_PROVENANCES.includes(value as MemberFactProvenance);
}

export function normalizeMemberFactBody(raw: unknown): string | null {
  const text = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!text) return null;
  return text.slice(0, MAX_MEMBER_FACT_BODY_LENGTH);
}

/* Consent is derived from provenance, mechanically — never a judgment call. */
export function deriveBornConsentState(provenance: MemberFactProvenance): MemberFactConsentState {
  switch (provenance) {
    case "stated_bridge":
    case "stated_interview":
    case "form_answer":
      return "approved";
    case "social_enrichment":
    case "inferred_agent":
      return "pending";
    case "observed_behavior":
      return "agent_internal";
  }
}

/* Members approve, retract, reject. Agents may only propose and supersede.
   Admins transition nothing. agent_internal is terminal. */
export function canTransitionMemberFactConsent(args: {
  from: MemberFactConsentState;
  to: MemberFactConsentState;
  actorType: MemberFactActorType;
}): boolean {
  if (args.from === "agent_internal") return false;
  if (args.to === "superseded") {
    return args.from === "approved" || args.from === "pending" || args.from === "rejected";
  }
  if (args.actorType !== "member") return false;
  if (args.to === "approved" || args.to === "rejected") return args.from === "pending";
  if (args.to === "retracted") return args.from === "approved";
  return false;
}

export type MemberFactLike = {
  communityId: string | null;
  kind: MemberFactKind;
  body: string;
  provenance: MemberFactProvenance;
  consentState: MemberFactConsentState;
};

export type MemberOntologyLens =
  | { kind: "self" }
  | { kind: "founder_admin"; communityId: string }
  | { kind: "member_orientation"; communityId: string };

/* THE visibility predicate. Every reader goes through this — no exceptions,
   no hand-rolled consent checks at query sites. */
export function memberFactVisibleToLens(fact: MemberFactLike, lens: MemberOntologyLens): boolean {
  if (lens.kind === "self") return true;
  if (lens.kind === "founder_admin") {
    /* Human founder/admin reads fail closed: only member-approved facts from
       this exact community. Any future community-agent internal context needs
       a distinct lens rather than widening this one. */
    if (fact.consentState !== "approved") return false;
    if (fact.provenance === "observed_behavior") return false;
    return fact.communityId === lens.communityId;
  }
  /* member_orientation: approved facts of the shared community only. Never
     observed behavior, never pending, never another community's facts. */
  if (fact.provenance === "observed_behavior") return false;
  if (fact.consentState !== "approved") return false;
  return fact.communityId === lens.communityId;
}

export type MemberSpine = {
  situation: string | null;
  goals: string[];
  interests: string[];
  links: string[];
};

const MAX_SPINE_ITEMS = 8;

/* The spine is a projection of approved, platform-scoped facts — nothing else
   may reach it, and no consumer writes it directly. */
export function buildMemberSpine(facts: MemberFactLike[]): MemberSpine {
  const eligible = facts.filter(
    (fact) =>
      fact.communityId === null &&
      fact.consentState === "approved" &&
      fact.provenance !== "observed_behavior",
  );
  const bodies = (kind: MemberFactKind) =>
    eligible
      .filter((fact) => fact.kind === kind)
      .map((fact) => fact.body)
      .slice(0, MAX_SPINE_ITEMS);
  return {
    situation: bodies("situation")[0] ?? null,
    goals: bodies("goal"),
    interests: bodies("interest"),
    links: bodies("link"),
  };
}
