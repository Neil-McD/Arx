# Native Agent Runtime Context Contract v1

Status: Slice 1, canonical Concierge, and canonical Steward context implemented
Scope: canonical native prompt compilation and context receipts
Last updated: 2026-08-13

## 1. Purpose

This contract defines the smallest canonical boundary for model-visible context
in the hosted Polynet runtime.

The immediate problem is simple: final prompt bytes and the context manifest
must never be assembled independently. One deterministic compiler owns both.
The compiler does not grant product authority, choose tools, admit funding, or
replace the runtime loop.

## 2. Irreducible runtime model

A native turn has five independent owners:

1. Server resolution owns identity, community scope, invocation surface,
   entitlements, funding, provider/model selection, and allowed tool names.
2. The prompt compiler owns exact model-visible instruction bytes and section
   metadata.
3. The manifest projects compiled sections and separately records resources,
   tools, runtime state, and exclusions.
4. The native runtime kernel owns provider/tool iteration, cancellation,
   retries, and stop conditions.
5. Domain executors reauthorize every tool call against canonical live state.

No prompt, skill, client selector, manifest, or model output grants authority.

```text
trusted request
  -> server-resolved run
  -> ordered prompt sections
  -> exact system prompt + section receipt
  -> manifest projection
  -> native runtime kernel
  -> server-authorized tools
```

## 3. Canonical prompt section

`RuntimePromptSection` is the only prompt-section metadata model.

```ts
type RuntimePromptSection = {
  id: string;
  layer: "stable" | "scoped" | "volatile";
  slot: "instruction" | "context";
  owner: "platform" | "user" | "community" | "workspace" | "runtime";
  authority:
    | "platform_policy"
    | "role_policy"
    | "community_policy"
    | "user_preference"
    | "runtime_fact"
    | "evidence";
  rendered: boolean;
  chars: number;
  source: string;
  reason: string;
};
```

The compiler retains section text internally. Public receipts contain metadata,
not raw private prompt text.

The dimensions are independent:

- `layer` describes expected byte stability. It is not yet a provider cache
  policy.
- `slot` distinguishes instructions from facts/evidence.
- `owner` identifies whose domain produced the section.
- `authority` classifies instruction precedence or evidence semantics. It is
  never an access grant.
- `source` and `reason` provide human-auditable provenance.

## 4. Compilation invariants

1. `buildPlatformHarnessRuntimePromptBundle` owns the final system-prompt bytes.
2. The final provider system prompt equals `RuntimePromptBundle.text` exactly.
3. Base sections retain their existing normalization and double-newline
   boundaries.
4. Harness overlays enter the compiler as ordered extension sections and
   preserve their legacy bytes exactly, including leading separators.
5. No runtime caller appends an opaque prompt suffix after compilation.
6. Section order is deterministic.
7. Empty optional sections remain in the prompt receipt as `rendered: false`
   but do not appear in the manifest prompt projection.
8. Every rendered section appears exactly once in manifest `prompts`, and every
   manifest prompt corresponds to exactly one rendered section.
9. Client-authored system messages, credentials, unvalidated selectors, and
   unbounded archives never become compiled instruction sections.
10. Section IDs use canonical lower snake case and are unique within a bundle;
    compilation fails before provider execution if an ID is invalid or a base
    or extension section would duplicate an ID.

## 5. Harness overlay sections

The former opaque `systemPromptSuffix` has four explicit ordered components:

| Section                    | Owner     | Slot        | Authority        |
| -------------------------- | --------- | ----------- | ---------------- |
| `platform_skill_overlay`   | platform  | instruction | platform policy  |
| `personal_skill_overlay`   | user      | instruction | user preference  |
| `ambiguous_skill_mentions` | runtime   | context     | runtime fact     |
| `community_skill_overlay`  | community | instruction | community policy |

The aggregate `systemPromptSuffix` is not retained at the resolved-harness
boundary. Overlay builders may keep their local legacy field names while their
outputs are adapted immediately into canonical sections.

Skill selection provenance belongs in the existing skill-resolution events.
Those events record selected state, activation route, and activation reason.
The manifest records the actual compiled overlay section, not a guessed prompt
entry for every selected skill.

## 6. Manifest v2

`buildRuntimeContextManifest` accepts the compiler's section metadata directly.
It must not infer prompt entries from community fields, skills, invocation
surface, project presence, or browser/demo flags.

Manifest v2 changes only the `prompts` authority:

- `prompts` is a direct projection of rendered compiled sections.
- resources, tools, runtime state, exclusions, request metadata, and scope keep
  their existing resolution paths.
- prompt entries include the compiler's layer, slot, owner, authority, chars,
  source, and reason.

Runtime integrity checking uses exact set equality for v2 prompt receipts and
manifests. Historical v1 receipts continue to use the legacy alias mapping so
stored runs remain inspectable.

## 7. Security and authority boundaries

1. The compiler reports context; it does not authorize it.
2. Community scope is server-resolved and fails closed without required access.
3. Current page or section may guide relevance but cannot expand community
   scope or tools.
4. Skills and community prompts cannot add tools.
5. Allowed tools remain server-resolved before provider execution.
6. Every tool executor retains live authentication, authorization, validation,
   and mutation idempotency.
7. External MCP remains a separate principal that shares canonical Polynet
   domain executors; it does not enter this hosted prompt compiler by default.

## 8. Slice 1 boundary

Slice 1 includes only:

1. Evolving the existing prompt-section metadata with `slot`, semantic
   `authority`, `source`, and `reason`.
2. Compiling Member, Funnel Composer, and existing reached hosted-runtime prompt
   bytes from the same bundle path without changing their bytes.
3. Converting the harness suffix into explicit compiler extension sections.
4. Projecting manifest v2 prompt entries from rendered compiler sections.
5. Preserving v1 integrity compatibility.
6. Recording skill activation route/reason in existing resolution receipts.
7. Exact-byte, omitted-section, manifest-equality, integrity, and real-loop
   smoke proofs.

Slice 1 explicitly did not include:

- a new native role union or universal role object
- Concierge or Steward migration
- Workspace migration or deletion
- context-message relocation
- cache-class replacement
- prompt digests
- provider or transport replacement
- token budgeting or compaction
- Pi agent-core adoption
- funding, billing, tool, executor, or UI changes
- selected-channel context
- prompt wording cleanup

## 9. Acceptance criteria

Slice 1 is complete when:

1. Exact system-prompt bytes match the pre-slice assembly for base-only and
   mixed-overlay fixtures.
2. `systemPrompt === runtimePromptBundle.text` in the real runtime.
3. No `buildPromptSuffix()` call or manual `harness_prompt_suffix` receipt
   remains in the runtime loop.
4. `community_lens_authority` is receipted whenever the compiler renders it.
5. The rendered prompt-section ID set equals the manifest prompt ID set.
6. Harness overlays have explicit owner, authority, source, and reason.
7. Skill activation provenance remains auditable in resolution events.
8. Historical v1 integrity fixtures still pass.
9. The native runtime kernel, provider selection, funding, tools, and domain
   executors are behaviorally unchanged.
10. Focused proofs, repository tests, and the release gate pass.

## 10. Canonical Concierge slice

This narrow slice converges only the member-facing community Concierge:

1. `shared/communityAgentServePrompt.ts` owns its exact system and contextual
   user-message bytes.
2. Its system prompt is compiled from three explicit sections:
   `community_agent_identity`, `concierge_operating_policy`, and
   `community_system_prompt`.
3. Participant orientation and the thread transcript remain untrusted evidence
   in the contextual user message; they are not promoted into instructions.
4. `context_snapshot` v2 retains the exact initial messages and adds only
   privacy-safe prompt-section metadata. It never stores section text separately.
5. The snapshot validator accepts historical v1 and current v2. During rolling
   deployment, the same attempt deduplicates v1/v2 snapshots only when their
   message arrays are byte-equivalent under canonical JSON serialization.
   Changed messages still fail closed as a conflict.
6. Prompt metadata has a separate bounded allowance, so adding receipts does
   not reduce the v1 message capacity.
7. Request access, source visibility, funding, provider selection, the five-tool
   allowlist, domain execution, response persistence, and identity attribution
   are unchanged.

This slice does not introduce a role registry, migrate Steward or Workspace,
move thread evidence into the system prompt, or change prompt wording.

## 11. Canonical Steward context slice

This narrow slice converges only the autonomous community Steward's provider
context boundary:

1. `shared/communityAgentStewardPrompt.ts` owns the exact system and contextual
   user-message bytes, including the reached Steward role and the legacy
   no-role fallback.
2. Its system prompt is compiled from four explicit sections:
   `community_agent_identity`, `steward_shared_rules`,
   `steward_role_definition`, and `community_system_prompt`.
3. The claimed compiler digest, directory summary, wake evidence, and run facts
   remain contextual user-message evidence. Their provider-visible rendering is
   unchanged.
4. `community_steward_context_snapshot_v1` stores the exact initial messages,
   their SHA-256 digest, privacy-safe prompt-section metadata, and explicit
   surface/schema identity at sequence zero.
5. The dedicated mutation revalidates the live community, running run identity,
   receipt shape, section character total, and message digest. Identical retries
   deduplicate; changed snapshots fail closed.
6. The snapshot must persist before the native kernel can make its first
   provider request. Pre-provider failure follows the existing funding-failure
   path and cannot mutate community memory.
7. Later reasoning, tool, and final events remain bounded best-effort
   observability beginning at sequence one. Historical `system_prompt` and
   `wake_context` event kinds remain schema-readable but are not emitted for new
   Steward runs.
8. Community resolution, owner-funded admission and settlement, model, exact
   compiler digest identity, `search`/`write` allowlist, one-write settlement,
   native kernel budgets, filesystem authority, and memory mutation semantics
   are unchanged.

This slice does not introduce a universal role registry, a new context budget,
compaction, Pi, Workspace migration/deletion, selected-channel context, prompt
wording changes, or deletion of the protected legacy no-role/cycle compatibility
paths.

## 12. Later slices

Later work must earn its complexity independently:

1. Add one model-aware input budget after provider/model limits and reserved
   output/tool-schema costs have one canonical owner.
2. Add shared compaction only after the budget owner exists; preserve durable
   history and reconstruct canonical policy rather than summarizing it.
3. Delete legacy Workspace composition after reached callers are proven absent.
4. Evaluate Pi agent core only as a loop-mechanics adapter behind the same
   governance, context compiler, tools, funding, memory, and receipts.

Do not build later slices into Slice 1 preemptively.
