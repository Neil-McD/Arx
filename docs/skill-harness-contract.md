# Skill Harness Contract

Status: active contract

This contract defines how Polynet skills route bounded workflow context into the runtime harness.

## First Principle

Skills separate availability from activation.

A skill may be available without its full instructions entering every turn. The
harness exposes compact inventory by default and injects a selected body only
after a backend-validated activation route chooses it.

## Authority

Skill instructions sit below:

1. platform doctrine and security
2. access, entitlement, and billing checks
3. runtime and tool policy
4. server-validated community scope

Skills cannot grant access, expand tool permissions by text, or weaken platform
constraints.

## Scopes

- Platform skills are built into the harness and selected by platform-owned capability rules.
- Community skills are attached to an authorized community lens.
- Personal skills are installed by the member and remain private to that member.
- Project skills are deferred.

Higher-authority scopes shadow duplicate lower-authority skills. Platform wins
over community and personal; community wins over personal inside that lens.

## Activation Routes

Current routes:

- `explicit_mention`: the member typed a `$skill-token`.
- `platform_required`: a backend capability lane requires the platform skill.

Deferred routes:

- `ui_selected`
- `lifecycle_trigger`
- `task_match`

Selected skill records carry backend-only `activation_route` and
`activation_reason` evidence. Missing evidence remains missing; the runtime must
not invent it.

## Current Platform Skill

`platform:resources-architect` is available only to the authorized community
resource-builder lane. Its builder tools are exposed only after the platform
skill is selected.

There is no global platform skill and no bridge-triggered skill activation.

## Current Ground Truth

Database tables:

- `skillPackages`
- `skillPackageRevisions`
- `userPlatformSkillInstalls`
- `communitySkillAttachments`

Runtime seams:

- `convex/runtimeSkillResolution.ts` resolves inventory and selected skills.
- `convex/runtimeHarnessComposition.ts` emits bounded, explicit prompt overlay sections.
- `convex/runtimeAgentLoop.ts` assembles prompt, manifest, tools, and execution.
- `shared/runtimeSkillInventoryPrompt.ts` bounds inventory text.
- `shared/runtimeContextManifest.ts` projects rendered skill-overlay prompt
  sections into the context manifest.

Current behavior:

- platform, personal, and community inventory is compact and bounded
- personal and community bodies load only after explicit mention
- the resource-builder platform skill is selected by its backend lane
- duplicate mention tokens are shadowed by higher authority
- ambiguity fails closed without injecting competing bodies
- rendered skill-overlay sections appear in context manifests; activation route
  and reason appear in backend skill-resolution events
- tools are granted by runtime policy and selected capability, never by prompt text alone

## Dormant Profile Primitive

`member_profile_confirm_facts` remains a permissioned runtime primitive for a
future profile-building workflow. It is not granted by default and no current
global platform skill exposes it. The tool requires an authenticated member,
an active community scope, an explicit confirmation marker, and bounded
`stated_interview` or `form_answer` facts.

## Keep

- bounded skill inventory
- selected-body injection
- scope separation and duplicate shadowing
- backend activation evidence
- resource-builder platform skill
- human-inspectable context receipts

## Add Later

- first-class trigger policy fields
- `ui_selected` activation
- generic lifecycle activation only when a concrete visible product flow needs it
- task matching with confidence and ambiguity controls
- skill references, assets, scripts, and templates

## Do Not Add

- an invisible bridge-triggered agent turn
- a separate lifecycle prompt stack
- all-skill injection
- user-configurable platform authority
- broad implicit activation without evidence
- community-owned MCP capabilities hidden inside skills

## Definition Of Done

The skill harness is mature when inventory is bounded, full instructions load
only when selected, activation is explicit and auditable, ambiguity fails
closed, references load only when needed, and tools remain governed by runtime
policy rather than skill prose.
