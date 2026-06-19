# Skill Harness Contract

Status: active contract

This contract defines how Polynet skills should route context into the runtime harness without turning the system prompt into a dumping ground.

## First Principle

Skills separate availability from activation.

A skill can be available to a user, community, or platform lane without its full instructions entering every turn. The harness should expose compact skill inventory by default, then inject full skill instructions only when a backend-validated activation route selects that skill for the current turn.

## What A Skill Is

A skill is a reusable workflow package that can shape how an agent behaves for a task, domain, lifecycle event, or community workflow.

Skills may define:

- compact metadata used for routing
- instructions used after activation
- trigger policy used by backend selection
- required runtime capabilities
- optional references, scripts, assets, or templates
- safety limits and failure behavior

## What A Skill Is Not

A skill is not:

- a new authority layer above platform policy
- a way to bypass community access, entitlements, billing, or tool policy
- a second MCP/app runtime path
- a replacement for resources, memory, or project context
- an always-on prompt blob
- a human-visible context receipt

## Authority Order

Skill instructions sit below the platform and runtime authority layers.

The compact authority order is:

1. platform doctrine and security rules
2. access, entitlement, and billing checks
3. runtime and tool policy
4. backend-validated community lens
5. selected platform skills
6. selected community skills
7. selected personal skills
8. bounded resources, memory, and runtime evidence
9. user request

Skills can guide workflow choices, but they cannot grant access, expand tool permissions by themselves, or weaken platform constraints.

## Scopes

### Platform Skills

Platform skills are built into the harness and selected by platform-owned capability rules.

Current example:

- `platform:resources-architect`
- requires `community_resources_manage`
- exposes resource-builder tool names only after platform skill selection

Current lifecycle example:

- `platform:onboarding-guide`
- globally visible as a locked platform skill
- selected by explicit `$onboarding-guide` mention or backend lifecycle trigger evidence
- grants no tools by itself

### Community Skills

Community skills are attached to the active community lens. They should be preferred for community-specific work when the active lens validates access.

Community skills must fail closed when the user is not entitled to the community.

### Personal Skills

Personal skills are installed by the user and remain available across community lenses.

When a community skill and personal skill overlap, the community-scoped skill wins for that community lens.

### Project Skills

Project skills are deferred. If added, they should be project/workspace-scoped workflow packages, not a second implementation of community or personal skills.

## Activation Routes

Activation must be explicit enough to debug and narrow enough to avoid context bloat.

Allowed activation routes:

- `explicit_mention`: the user typed a `$skill-token`.
- `ui_selected`: the UI submitted a structured skill selection.
- `platform_required`: backend platform lane requires the skill, such as a builder resource-management lane.
- `lifecycle_trigger`: backend lifecycle event selects a skill, such as onboarding completion or first workspace thread.
- `task_match`: backend selector matches request intent against skill metadata with confidence and ambiguity controls.

Current behavior supports `explicit_mention`, `platform_required`, and a backend
resolver path for onboarding `lifecycle_trigger` selections. The onboarding
platform skill is also an explicit-mention canary for platform-owned skills that
are globally visible but not auto-injected. `ui_selected`,
automatic product event sources for lifecycle triggers, and `task_match` are
contract targets, not assumed current behavior.

If activation is ambiguous, the harness should not inject competing skill bodies. It should either select the higher-authority unambiguous skill or record the ambiguity and proceed without the ambiguous skill body.

Selected skill records should carry backend-only activation evidence:

- `activation_route`: the route that selected the skill
- `activation_reason`: a compact diagnostic reason for the selection

If selected skill evidence is missing or malformed in a normalized runtime
payload, the manifest should preserve that as missing evidence rather than
inventing a route.

## Package Shape

The mature package shape should be:

```ts
type SkillPackageContract = {
  id: string;
  catalogSkillId?: string;
  name: string;
  mentionToken: string;
  description: string;
  scope: "platform" | "community" | "personal" | "project";
  instructionsMd: string;
  triggerPolicy?: {
    allowedRoutes: Array<
      | "explicit_mention"
      | "ui_selected"
      | "platform_required"
      | "lifecycle_trigger"
      | "task_match"
    >;
    allowImplicitActivation?: boolean;
    lifecycleEvents?: string[];
    taskMatchHints?: string[];
  };
  requiredCapabilities?: string[];
  requiredTools?: string[];
  references?: Array<{
    id: string;
    title: string;
    kind: "doc" | "resource" | "template" | "script" | "asset";
    loadPolicy: "only_when_needed" | "never_in_prompt" | "selected_with_skill";
  }>;
  safetyLimits?: {
    maxInstructionChars?: number;
    maxReferenceChars?: number;
    requiresConfirmationBeforeWrite?: boolean;
  };
};
```

The current implementation is intentionally smaller. Add fields only when they remove ambiguity or prevent context waste.

## Current Ground Truth

Current database tables:

- `skillPackages`: owner, catalog id, name, mention token, description, active instructions, active revision pointer
- `skillPackageRevisions`: revisioned instruction bodies
- `userPlatformSkillInstalls`: user-owned personal skill installs
- `communitySkillAttachments`: community-attached skill records
- `agentLifecycleActivations`: backend-only lifecycle activation ledger for
  idempotent proactive runs

Current runtime seams:

- `convex/runtimeSkillResolution.ts`: resolves skill inventory and selected skills
- `convex/runtimeHarnessComposition.ts`: composes skill/app prompt suffixes
- `convex/runtimeAgentLoop.ts`: assembles skill resolution, context manifest, prompt, tools, and execution
- `shared/runtimeSkillInventoryPrompt.ts`: bounds the inventory prompt
- `shared/platformSkillOverlayRuntime.ts`: renders platform skill inventory and selected platform instructions
- `shared/communityOverlayRuntime.ts`: renders community skill inventory and selected community instructions
- `shared/personalSkillOverlayRuntime.ts`: renders personal skill inventory and selected personal instructions
- `shared/runtimeContextManifest.ts`: records selected skill prompt evidence for backend audit

Current behavior:

- globally available platform skill inventory is visible through bounded routing metadata
- builder-lane platform skill inventory can be backend-selected by lane
- personal and community skill inventory is visible through bounded routing metadata
- personal and community skill bodies load only after explicit `$skill` activation
- globally available platform skill bodies load only after explicit `$skill` activation or lifecycle selection
- platform skills shadow lower-authority duplicates
- community skills shadow personal duplicates inside a community lens
- selected skills are recorded in backend context manifests
- selected skill records include backend-only activation route and reason
- the onboarding platform skill can be selected by explicit mention or backend lifecycle trigger
- explicit onboarding completion writes one pending `onboarding_completed`
  lifecycle activation per user
- no cron, email, notification, or runtime dispatcher is wired in this slice

## Keep

- bounded skill inventory
- selected-body injection
- platform, community, and personal scope separation
- duplicate shadowing by higher-authority scope
- backend-only context evidence
- resource-builder platform skill as a platform skill, not a generic prompt

## Add Later

- first-class trigger policy fields
- first workspace thread lifecycle trigger
- `ui_selected` activation
- runtime dispatcher wiring for pending `lifecycle_trigger` activations
- skill references/assets/dependencies
- task matching with ambiguity controls

## Do Not Add

- a separate onboarding prompt stack
- human-inspectable context receipts
- all-skill injection
- user-configurable skill authority
- community-owned MCP runtime tools hidden inside skills
- broad implicit activation without evidence and ambiguity controls

## Onboarding Skill Target

Onboarding should become a lifecycle-triggered skill, not a special-case prompt.

The backend should select it when an eligible lifecycle event occurs. The current wired event is account onboarding completion; first workspace thread creation remains deferred. Its instructions should be injected only for that turn or run. The skill should not become permanent always-on context.

Irreducible onboarding flow:

1. backend observes a lifecycle event
2. backend selects the onboarding skill with `lifecycle_trigger`
3. runtime injects the onboarding skill body for that run
4. agent introduces itself and gives the first useful action
5. backend records activation evidence and completion state

## Definition Of Done For Skill Harness Maturity

The skill harness is mature when:

- skill inventory is compact and bounded
- full instructions load only when selected
- activation routes are explicit and auditable
- ambiguity fails closed
- package references load only when needed
- tools are granted by platform/runtime policy, not by skill text
- lifecycle skills reuse the same harness path as explicit skills
