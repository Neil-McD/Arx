# Member Ontology Contract v1

Companion to `community-agent-cognition-contract-v1.md`. That contract declares
the boundary this one formalizes: *personal memory is private by default and
must not silently become community memory*; members *control private context
and sharing scope*; personal agents *emit permissioned traces*. The member
ontology is the structured half of those permissioned traces — the typed,
consented record of who a member is, kept queryable so any person or agent can
be oriented about a member without ever reading past what that member allowed.

## Purpose

The irreducible system: **ask a question about a member and get an orientation
of that individual — per consent.**

Three consumers, one substrate:

1. A community founder (or founder agent) making decisions about members —
   segmentation, at-risk detection, matchmaking, win-backs.
2. An agent helping a member — injecting who they are and what they want into
   the interaction context.
3. A member understanding another member — the orientation card behind
   "who is @handle?".

Every future feature against member identity is a **new read model over this
ledger, never a new store**.

## Position in the Existing Ontology

- Extends the Member / Personal Agent entities in the cognition contract.
- Lives beside — not inside — the community intelligence graph
  (`communityIntelligenceNodes`/`Edges`). Community knowledge may cite members
  through the graph's existing `person` reference edges; per-member facts stay
  in this ledger. Rationale: the platform layer of a member's ontology must
  travel across communities; the intelligence graph is community-scoped.
- Replaces nothing: `personalMemoryItems` (freeform personal memory) and
  `userProfileDetails` (display profile) remain. The ledger is the structured,
  scoped, consented layer between them.

## The Fact Record

One row = one fact about one member.

| Field | Contract |
| --- | --- |
| `userId` | The subject. Always a member. |
| `communityId` | `null` = platform-wide fact. Set = scoped to that community. This column IS the isolation mechanism. |
| `kind` | One of the kind vocabulary below. Read models filter by it; keep it small. |
| `body` | The fact, plain text, bounded. |
| `provenance` | One of the provenance vocabulary below. Immutable after write. |
| `confidence` | 0–1. Stated facts default 1; inferred facts carry the agent's estimate. |
| `evidenceRefs` | Optional pointers to source traces (interview turn, form submission, enrichment run). |
| `stalenessScore` | Same freshness pattern as intelligence nodes; drives re-confirmation, never silent deletion. |
| `consentState` | Derived at birth from provenance (state machine below); transitions are member-driven. |
| `createdByActorType` | `member \| admin \| agent \| compiler \| system` — same actor vocabulary as the cognition contract. |
| `version`, `createdAt`, `updatedAt` | Standard. |

## Vocabularies

**Kind** (v1, closed set):

```txt
situation      what they're working on / their context
goal           what a win looks like for them
skill          what they can do
interest       what they care about
availability   when/how they can engage (calls, timezone-derived)
preference     how they like to work / be addressed
link           social or external profile URLs
```

**Provenance** (immutable, closed set):

```txt
stated_bridge       semantic facts typed into the bridge (v1: normalized social links only)
stated_interview    said to the guide during onboarding conversation
form_answer         creator-defined form field, filled via interview
social_enrichment   derived by the member's own agent from their public links
inferred_agent      inferred by an agent from conversation or activity
observed_behavior   behavioral signal (posting cadence, engagement, quiet spells)
```

## Consent State Machine

Consent is **derived from provenance, mechanically** — never a judgment call
at read time.

Born states:

```txt
stated_bridge      → approved (platform scope: the member typed it into the platform's own form)
stated_interview   → approved-in-scope (the confirm card is the batch approval event)
form_answer        → approved-in-scope (same confirm card)
social_enrichment  → pending
inferred_agent     → pending
observed_behavior  → agent_internal (terminal; remains private/internal)
```

Transitions:

```txt
pending        → approved      (member approves — e.g. the enrichment draft review)
pending        → rejected      (member declines; row retained as tombstone so agents don't re-propose)
approved       → retracted     (member withdraws a fact at any time)
any            → superseded    (a newer fact of the same kind replaces it; old row keeps history)
```

Who may transition: **members approve, retract, reject. Agents may only
propose** (create `pending` rows) and supersede with newer `pending`/derived
rows. Admins transition nothing and read only approved community facts; they do
not consent on a member's behalf. This is the contract's single most
load-bearing rule: **founders act only on approved member facts, members approve
facts, and human/admin reads never double as an internal agent lens.**

The onboarding confirm card ("here's what I'll tell {creator} — right?") is
formally: batch-approve all `stated_interview` + `form_answer` rows created in
that session, scoped to that community.

## Scoping and Isolation Invariants

1. A community-scoped fact is readable **only** through lenses of that
   community. What a member told community A can never appear in a query
   scoped to community B. Enforced structurally by `communityId`, and
   procedurally by the single shared visibility predicate (below).
2. `observed_behavior` facts never render on founder/admin or member-to-member
   surfaces, regardless of consent state. The member's private self lens retains
   the complete ledger.
3. **Platform spine visibility (decided 2026-07-08):** the spine is visible by
   default to every community the member joins — it is an enriched profile
   card. A per-community hide toggle is the escape hatch.
4. **Retention on leave/removal (decided 2026-07-08):** when membership ends,
   that community's scoped facts drop from member-to-member surfaces
   immediately, but the founder/admin lens retains approved facts — a CRM-like
   record of a past member (win-backs, rejoin context). Retraction removes a
   fact from every non-self read model while preserving the ledger tombstone;
   account deletion erases the row.
5. Account deletion erases the member's ledger rows and spine entirely.

## The Platform Spine

A compact per-user projection — role, goals, interests, links — recomputed on
ledger writes. The ledger is truth; the spine is the fast read for profile
cards. Only `approved` platform-scoped facts project into it. No consumer may
write the spine directly.

## Read Models

Each consumer is a lens with an exact visibility predicate. All three MUST go
through one shared predicate function; no reader hand-rolls visibility.

| Lens | Scope | May see |
| --- | --- | --- |
| Founder/admin | one community | spine + `approved` facts scoped to that community; nothing pending, rejected, retracted, superseded, or observed; retains approved facts after member leaves (invariant 4) |
| Member-help (self lens) | the member's own agent | everything of their own — the richest view; consent trivially satisfied |
| Member-to-member (orientation card) | shared community | spine + `approved` facts scoped to the community both share; nothing pending, nothing observed, nothing from other communities |

There is no community-agent-internal member lens in v1. If one is introduced,
it must be a distinct read model with explicit actor and provenance rules. It
must not widen `founder_admin`, and rejected, retracted, or superseded facts
must never become actionable context merely because an agent is reading.

## Write Paths

1. **Bridge completion** → normalized social profile URLs become
   `stated_bridge` `link` facts, platform scope, born approved. This happens
   inside the server-side profile completion mutation so profile state and
   ontology seed facts share one deterministic write path. Bridge identity
   fields, legal acceptance, inference provider, tier, memberships, and browser
   timezone remain account/profile context for `member.md`; they are not
   duplicated as ledger facts.
2. **Interview confirmation** → batch of `stated_interview` / `form_answer`
   facts, community scope, born approved-in-scope. The onboarding guide reaches
   this through the selected platform-skill runtime tool
   `member_profile_confirm_facts`, which delegates to the same confirmation
   mutation; one mutation, one approval marker.
3. **Enrichment** → the member's own agent drafts `social_enrichment` facts,
   born pending; the member's review approves/rejects each.
4. **Ongoing observation** → agents/compiler write `inferred_agent` (pending)
   and `observed_behavior` (agent_internal) facts over time; the capture-loop
   surfaces pending ones for approval at natural moments. Neither state reaches
   the human founder/admin lens. A future community-agent-internal consumer must
   use its own explicitly designed lens.

### Bridge Social-Link Repair

The bridge link seed is deterministic for new account completions. Existing
completed profiles from before this contract slice are repaired only through the
explicit operator backfill `profiles:backfillCompletedProfileBridgeSocialLinkFacts`
or its staging-guarded wrapper `scripts/backfill_bridge_social_link_facts.sh`.

Repair rules:

- dry-run by default; `--write` is required to insert rows
- bounded and cursorable through Convex pagination; continue with the previous
  result's `next_cursor`
- completed profiles only (`onboardingCompletedAt` present)
- stored social profile URLs are normalized again before use
- only missing non-superseded platform `link` facts are inserted
- bridge identity, legal, inference, tier, membership, and timezone fields are
  never backfilled as ledger facts

## Proof Obligations

The contract proof script (`member_ontology_contract_proof.ts`) must
demonstrate, at minimum:

1. Born consent state matches provenance for all six provenance values.
2. Illegal transitions are rejected (e.g. agent-actor approving; admin-actor
   retracting; `agent_internal` escaping to any non-agent lens).
3. Cross-community isolation: community A facts never returned by a
   community-B-scoped read.
4. `observed_behavior` never appears in the member-to-member read model.
5. The spine contains only approved platform-scoped projections.
6. Retention-on-leave: after membership ends, member-to-member reads return
   nothing; the founder lens still returns the scoped facts.

## Open Questions (v2)

- Member↔member relationship facts ("collaborated with", "mentored by") —
  needs a two-subject record and mutual-consent rules.
- Decay/re-confirmation policy: how stale a `situation` fact may get before
  the guide re-asks (capture-loop cadence).
- Export: member-initiated takeout of their full ledger.
