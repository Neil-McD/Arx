# Native Agent Runtime Context Contract v1

Status: context architecture through Slice 7A released and production-proven; Slice 7B implemented with release proof pending
Scope: canonical prompt compilation, context projection, governed loop migration, and legacy deletion
Last updated: 2026-08-15

Program position:

- Architecture boundary: complete.
- Production context foundation: complete for Member, Funnel Composer,
  Concierge, and Steward.
- Runtime convergence: Slices 5A through 7A are released and production-proven;
  Slice 7B is implemented and awaiting release proof; Slices 8 through 10
  remain.
- Pi agent-core adoption in Polynet: not started.

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

## 12. Current position

The context architecture is done. The complete runtime program is not.

The released base plus the locally verified Slice 7B candidate has:

1. One deterministic prompt-section model and compiler boundary.
2. Exact prompt-to-manifest projection.
3. Server-resolved community, identity, funding, model, and tool authority.
4. Live executor reauthorization independent from prompt text.
5. One native loop kernel used by Member, Funnel Composer, Concierge, and
   Steward.
6. Mandatory exact pre-provider context snapshots for Concierge and Steward.
7. Mandatory bounded provider-context attestations for Member and Funnel,
   persisted before the native kernel and provider-start transition.
8. Provider context-overflow classification and a one-retry tool-result
   compaction path for Member and Funnel Composer.
9. Removal of the former fixed 250,000-character request transport ceiling.
10. First-party Workspace UI quarantine.
11. Budget-guided newest-first persisted-history pagination for Member and
    Funnel Composer, with complete-episode selection and mandatory bounded
    lineage in the existing runtime event store.

The remaining gaps are:

1. Slice 7B has not yet received exact-main release and production runtime
   evidence.
2. Pi agent core has not been admitted, parity-tested, or used by a production
   Polynet turn.
3. Pi agent core has not yet proved that it removes more runtime complexity
   than its adapter and hosted-runtime requirements add.

Program status:

| Slice | Outcome | Status |
| --- | --- | --- |
| 1 | Canonical hosted-runtime prompt and manifest | Complete |
| 2 | Canonical Concierge context and receipt | Complete |
| 3 | Canonical Steward context and receipt | Complete |
| 4 | Mandatory initial-provider-context evidence parity | Complete |
| 5 | Workspace and Codex runtime deletion | Complete and production-proven |
| 6 | Canonical model-aware input budget | Complete and production-proven |
| 7 | Shared deterministic model-visible projection and persisted-history pagination | 7A complete and production-proven; 7B implemented, release proof pending |
| 8 | Pi value/feasibility adapter and deterministic parity | Not started |
| 9 | Reversible role-by-role Pi cutover if earned | Not started |
| 10 | Losing-kernel deletion and final production acceptance | Not started |

## 13. Irreducible end state

Polynet needs five planes and no sixth framework:

1. **Governance plane**: authenticates the principal and resolves community,
   role/surface, funding, provider/model, entitlements, and admitted tool names.
2. **Context plane**: compiles exact instructions, builds the model-visible
   conversation projection, budgets it, and records what was sent.
3. **Loop plane**: streams model output, executes admitted tool calls, handles
   cancellation, and applies bounded stop conditions. Pi agent core may own
   this plane only if the value and parity gate proves that it reduces net
   runtime complexity without weakening the other planes.
4. **Execution plane**: maps an admitted tool name to a canonical Polynet
   executor that reauthorizes against live state and preserves idempotency.
5. **State and evidence plane**: stores durable history, community memory,
   funding state, leases, traces, and receipts in canonical cloud records.

```text
trusted trigger
  -> Polynet governance resolution
  -> canonical prompt + context projection + budget
  -> mandatory pre-provider evidence
  -> one governed loop implementation
  -> canonical live-authorized tool executor
  -> durable Polynet history, memory, funding, and evidence
```

Native roles remain explicit adapters, not entries in a speculative universal
role framework:

| Role/surface | Principal | Trigger | Required scope |
| --- | --- | --- | --- |
| Member Agent | authenticated member | user turn | one joined community |
| Funnel Composer | authorized manager | user turn | one managed community and funnel slot |
| Concierge | community-owned agent | authorized mention/request | one accessible community interaction root |
| Steward | community-owned agent | claimed autonomous run | one live owner-funded community |

External MCP remains a separate authenticated principal and protocol. It uses
the same domain authority and executors but does not enter the native agent
loop merely for architectural uniformity.

## 14. Reference-system learnings

The local reference snapshots used for this contract are:

- Hermes Agent `461c4939725b8c85aebb78abeda92993a9f53efd` from 2026-08-09.
- Codex `b9a2e400018c219e3010a5a5b8ded8645184da0b` from 2026-03-07.
- Installed adjacent Pi core package `@earendil-works/pi-agent-core@0.82.1`.

These references inform mechanics. They do not become Polynet authority.

Evidence anchors:

- Hermes: `agent/system_prompt.py`, `agent/conversation_compression.py`,
  `agent/memory_manager.py`, and `agent/tool_guardrails.py`.
- Codex: `codex-rs/core/src/codex.rs`, `compact.rs`,
  `context_manager/history.rs`, and `tools/router.rs`.
- Pi: the installed core `agent.d.ts`, `types.d.ts`, and
  [official core README](https://github.com/earendil-works/pi/blob/main/packages/agent/README.md).
- Hosted compatibility:
  [Convex runtimes](https://docs.convex.dev/functions/runtimes) and
  [Convex actions](https://docs.convex.dev/functions/actions).

### 14.1 Hermes: adopt the ordering, not the framework

Adopt:

1. Stable instructions first, scoped/session context second, volatile context
   last so byte-stable prefixes remain cacheable.
2. Tool guidance conditioned on the actual admitted tool surface.
3. Explicit separation between memory instructions, recalled memory evidence,
   and user input.
4. Model-capacity-aware compaction thresholds.
5. Anti-thrash behavior: bounded attempts, minimum useful savings, visible
   terminal failure, and no concurrent compaction of the same session.
6. Preservation of original durable history across compression.

Do not adopt:

1. Session-local SQLite or local files as product truth.
2. A session-wide cached whole prompt that can hide changed community policy.
   Polynet must re-resolve community authority and recompile every turn.
3. Dynamic memory providers that can independently inject tools or prompt
   authority.
4. Hermes' coding, gateway, platform, plugin, or self-modification framework.
5. Its full compression subsystem before Polynet's smaller budget and
   projection contract proves the need for equivalent complexity.

### 14.2 Codex: adopt reconstruction and projection

Adopt:

1. Base policy and current environment/context are canonical inputs separate
   from conversational history.
2. Durable history and model-visible history are different objects.
3. Compaction replaces only the model-visible projection.
4. Canonical policy is reconstructed after compaction; it is never summarized
   into lower-authority prose.
5. Structured context changes can be diffed rather than blindly duplicating
   unchanged text.
6. Provider/model capacity drives token accounting and compaction decisions.
7. Tool schemas and the runtime executor are generated from policy, not trusted
   because they appeared in a prompt.

Do not adopt:

1. The coding sandbox, filesystem, approval, app/plugin, or shell architecture.
2. Codex rollout storage as a replacement for Polynet's canonical cloud state.
3. A generic environment-context vocabulary where Polynet already has explicit
   community, member, surface, funding, and resource contracts.

### 14.3 Pi: adopt only the loop engine if it earns adoption

If adopted, the target is Pi agent core, not the Pi coding agent and not a
Python harness.

Pi may own:

1. Model streaming and assistant-message lifecycle.
2. Tool-call scheduling and lifecycle events.
3. Cancellation and bounded continuation.
4. A hook that asks Polynet for the next model-visible context projection.

Pi must not own:

1. System-prompt construction or instruction precedence.
2. Community/member identity or access decisions.
3. Tool admission, executor lookup, or mutation authority.
4. Funding admission, settlement, leases, or idempotency.
5. Durable conversation history or community memory.
6. Context-budget or compaction policy.
7. Public receipts, release state, or external MCP authority.

The Pi adapter must resolve admitted tool names internally to canonical Polynet
executors. It must not accept an arbitrary `execute` callback. Pi agent state is
ephemeral turn state and can always be reconstructed from Polynet records.

The first Pi adapter must preserve the existing Polynet OpenAI, ChatGPT, and
OpenRouter transport semantics behind a Pi-compatible stream function. Pi's
transitive `pi-ai` dependency does not authorize a simultaneous provider,
credential, funding, or error-mapping migration.

Pi's context-transform hook is a projection seam, not an enforcement boundary.
The final Polynet-owned stream function must reject any provider request that
lacks a valid current model, admitted tool surface, and model-aware projection
budget. A hook failure cannot fall back to sending the unbudgeted transcript.

The core package currently declares Node `>=22.19`. Convex supports configurable
Node 20, 22, and 24 actions, while its default runtime is not Node. Slice 8 must
prove the actual bundle/runtime boundary. If Pi cannot run in the current action
files, isolate only the probabilistic action adapter in a `"use node"` module;
queries and mutations remain in the default Convex runtime. Do not restructure
the backend merely to satisfy Pi without first re-evaluating its benefit.

## 15. End-state invariants

1. Exactly one production native loop implementation serves all four native
   roles after convergence. Pi is the preferred candidate, not an authority or
   unconditional completion requirement.
2. Every native run has mandatory pre-first-provider context evidence. Bounded
   Concierge and Steward inputs retain exact snapshots; potentially long
   Member and Funnel inputs retain exact cryptographic attestations over the
   in-memory provider request without duplicating the transcript into one
   database document. Subsequent contexts are reconstructable from durable
   history plus provider-call and projection deltas.
3. Community scope is server-resolved from canonical state. Page, tab, channel,
   and client selectors may guide relevance but never grant access.
4. The selected community is the primary native authorization scope. Selected
   channel is optional evidence, not a second authority boundary.
5. Every tool call is constrained by both the admitted name set and live domain
   authorization at execution time.
6. Prompt instructions, skills, memory, and model output cannot add tools.
7. Durable history is never destructively shortened to fit a model window.
8. Compaction cannot summarize or replace platform, role, community, funding,
   or tool policy.
9. No provider-independent artificial character ceiling rejects a valid model
   request. Bounded tool/resource responses remain allowed for safety and
   pagination.
10. Unknown models, surfaces, roles, tools, and receipt versions fail closed.
11. Engine selection and canary routing are server-owned. Clients cannot select
    a less-governed runtime.
12. External MCP keeps explicit server-validated community selection and does
    not inherit native-agent authority.
13. Every cutover is reversible without changing durable history or replay
    semantics.

## 16. Slice discipline

Each remaining slice must:

1. Have one behavioral objective and one named authority owner.
2. Preserve prompt bytes, tool authority, funding, and persistence unless that
   exact dimension is the stated slice objective.
3. Include deterministic positive and negative proofs before live canaries.
4. Avoid new database tables when existing run, event, snapshot, or thread
   records can carry the required state safely.
5. Delete obsolete paths in the same slice once replacement truth is proven.
6. Stop if production reachability, runtime compatibility, or authority parity
   cannot be demonstrated.
7. Land and verify independently before the next slice begins.

No slice may combine Workspace deletion, compaction behavior, and Pi cutover.

## 17. Remaining implementation roadmap

### 17.1 Slice 4: mandatory initial-provider-context evidence parity

Status: complete.

Implemented evidence:

- `shared/runtimeProviderContextAttestation.ts` owns the bounded canonical
  attestation and strict privacy-safe validator.
- `threads.recordRuntimeProviderContextAttestationInternal` owns authority
  revalidation, idempotency, and conflict detection in `runtimeRunEvents`.
- `executeRetrievalAgentLoop` persists the attestation before entering the
  native kernel for Member and Funnel surfaces.
- `npm run check:runtime-provider-context-attestation-proof` covers the pure
  contract, both surface identities, large transcripts, persistence conflict,
  provider-start ordering, failure, canonical manifest-digest verification,
  and corrupted-digest rejection.

Objective: every Member and Funnel turn records verifiable evidence of the
exact initial model-visible context before the first provider request, without
introducing a second transcript or a new request-size ceiling. Concierge and
Steward retain their existing exact-snapshot evidence contracts.

First-principles constraints:

1. The provider boundary needs a cryptographic commitment to the exact
   canonical request values, tool schemas, model, and scope; it does not need
   another copy of durable conversation history.
2. A Member/Funnel transcript may legitimately exceed the
   [Convex 1 MiB document limit](https://docs.convex.dev/production/state/limits),
   so storing the entire provider request in one receipt would recreate an
   artificial transport limit. The attestation must remain bounded while its
   hashes cover the unbounded in-memory inputs.
3. The receipt is evidence, not authority. Server resolution and live tool
   executors remain the authority owners.
4. The first provider call, provider-start transition, settlement, and tool
   execution must be unreachable until mandatory evidence persistence succeeds.

Work:

1. Add one small pure Member/Funnel attestation builder and validator. Its v1
   payload contains schema/canonicalization version, surface/run/scope/model
   identity, an initial-attempt fence, prompt-section metadata, selected
   provider tool names/schema format, one SHA-256 digest over the complete
   canonical provider request envelope, and one SHA-256 digest over the context
   manifest. Do not add component hashes that duplicate those two commitments.
   The canonical request envelope contains only model identity, messages,
   selected provider tool schema, maximum output tokens, tool choice, and the
   parallel-tool flag; it excludes credentials and transport request metadata.
2. Never include raw message text, prompt text, tool descriptions, tool JSON
   schema, credentials, or retrieved community content in this receipt.
3. Build the attestation in `executeRetrievalAgentLoop` from the same in-memory
   `nativeTranscript`, prompt bundle, manifest, resolved model, and provider
   tool definitions that will be sent. Persist it exactly once after those
   values are final and before `runNativeRuntimeKernel` can call
   `beforeProviderRequest`.
4. Add one dedicated internal writer using the existing `runtimeRunEvents`
   table and event type `runtime_provider_context_attested`. Revalidate the
   running run's owner, thread, community/version, invocation surface, and
   model, plus the Funnel slot derived from the canonical thread when that
   surface is active. Do not add a table or expose a general receipt writer.
5. Fence the record by run plus initial attempt. An identical retry returns the
   existing receipt; any changed digest, scope, model, or surface returns a
   deterministic conflict.
6. Return `runtime_provider_context_attestation_unavailable` with a safe,
   human-readable retry message when validation or persistence fails. The
   provider-start hook and runtime kernel remain uncalled; any already claimed
   community-funding receipt is finalized as a known pre-spend failure.
7. Keep existing prompt, manifest, and later timeline events as best-effort UI
   observability. The new attestation is the mandatory audit boundary, and the
   integrity checker requires it for Member and Funnel surfaces.
8. Retain Concierge and Steward's bounded exact-message snapshot formats,
   mutations, and storage layouts. Prove shared semantic invariants in tests
   rather than migrating them into a universal schema.

Implementation order:

1. Land the pure attestation type, canonical serializer/digest builder, strict
   validator, and mutation-level idempotency/conflict tests.
2. Land the dedicated internal writer against `runtimeRunEvents` and prove
   scope/model/run revalidation.
3. Add the single required loop callback and prove failure occurs before
   `beforeProviderRequest`.
4. Wire the same callback from the shared streaming/non-streaming turn handler;
   do not duplicate surface-specific branches.
5. Extend the runtime-context integrity proof and the existing real-loop smoke,
   then rerun Member, Funnel, Concierge, Steward, funding, and prompt/manifest
   regression gates.

Stop if the receipt contains raw provider context, grows with transcript size,
requires a new table, changes provider/funding/tool behavior on success, or
cannot prove that persistence failure precedes provider start.

Acceptance:

1. Member and Funnel fixtures persist one valid attestation before the first
   provider-start hook.
2. A forced write failure produces no provider call, tool call, provider-start
   transition, or settlement; a prior funding claim closes as `failed` with
   zero usage rather than `indeterminate`.
3. Identical retries deduplicate; changed messages, prompt, tool schema, model,
   surface, or scope conflict deterministically.
4. A large-transcript fixture changes only the fixed-size digests and proves
   receipt size does not scale with transcript size.
5. Public/runtime event inspection reveals metadata and hashes only, never raw
   private provider context.
6. All four roles prove pre-provider context evidence and prompt-section
   metadata; existing Concierge and Steward exact-snapshot proofs remain green.
7. Streaming and non-streaming Member/Funnel paths use the same callback and
   error code.

Non-goals: budget changes, compaction, Workspace deletion, Pi, prompt wording,
full-transcript archival, a new table, or a universal receipt storage schema.

### 17.2 Slice 5: delete Workspace and Codex runtime compatibility

Status: Slices 5A through 5D are landed on `origin/main`, deployed, and proven
in production.

Release evidence:

1. The converged runtime implementation landed through merge commit
   `63a414bab3963c04db3b41256cb2c1689029b36f`; the canonical GitHub Release
   Gate, Vercel deployment, production accounting smoke, and Convex production
   deployment passed.
2. The first live Member Agent canary exposed one real compatibility defect:
   provider-context attestation persistence still required the retired
   per-community thread key while the canonical private agent uses
   `member-agent:global:episode:*` and binds community scope per run. The narrow
   validator and regression fix landed in runtime code commit
   `8e021bce7` and merge commit
   `9e300ed12b21276e35f6b5bf9303b5106304010e`.
3. Production Vercel reported build and Sentry release
   `9e300ed12b21276e35f6b5bf9303b5106304010e`; the matching Convex functions
   were deployed with no index deletion or schema change.
4. The post-fix production canary run
   `member_agent_dock:3e7d7c11-9c99-46dd-9221-dd8714db17b4` completed `ok` on
   the canonical global episode. It stored one
   `runtime_provider_context_attested` event before provider work, completed 19
   `polynet_list`/`polynet_read` calls with `ok` status, passed
   `runtime_context_integrity_checked` with no failures, and returned a
   source-grounded summary that separately covered community identity, all
   four authorized channels, Resources, Events, members, and memory.
5. Post-deploy production reachability remained closed: direct Convex requests
   to `/runtime/public_turn` and all three retired internal Codex-worker routes
   returned `404 No matching routes found`, while authenticated
   `/runtime/runtime_turn` remained registered and failed closed without a
   bearer token. Production contained 13 released and zero active Codex
   capacity leases, plus 18 historical Daytona Codex targets with zero live
   targets.
6. Slice 5D landed through PR #100 at merge commit
   `d1235501ba791d9c9eb6ce770a63963370caea68`. The exact merged SHA passed the
   local release gate with 107 test files and 677 tests, then passed the
   canonical main-branch GitHub Release Gate. Production Vercel reported the
   same build and Sentry release before the matching Convex functions were
   deployed with no index deletion.
7. The production Convex function specification contained none of the eight
   retired Workspace, Daytona, session, terminal, inspector, or project-ZIP
   identifiers. `/runtime/runtime_turn` remained registered and failed closed
   with `401` without authentication, while `/runtime/public_turn` returned
   `404`.
8. The post-deploy production pointer audit scanned all 72 cloud-project rows.
   It found zero legacy, unknown, non-Blaxel, or Daytona-hinted resource
   pointers. The three remaining volume pointers and two remaining sandbox
   pointers are explicitly Blaxel-owned migration records.
9. The authenticated Member Agent production canary run
   `member_agent_dock:f2bd459f-0f29-4691-8c48-2f083ce503d9` finished `ok` under
   community `jh7ayd0xt55nens0nhegyz6phx852shk`. It persisted a valid
   provider-context attestation, completed all 16 `polynet_list`/`polynet_read`
   calls successfully under that same community scope, passed every runtime
   context-integrity check with zero failures or warnings, and returned a
   source-grounded summary covering all authorized channels, identity,
   Resources, Events, members, and memory.
10. The post-deploy production accounting smoke passed with zero recent
    provider-cost mirror gaps, zero recent unbilled compute charges, and zero
    recent compute charges missing provider-cost mirrors. Only the previously
    identified historical backlog older than 31 days remains.

Slice 5A extinguishes active ingress without deleting historical persistence:

1. A read-only production audit on 2026-08-14 found 94 native turns in the
   preceding 30 days: every turn resolved to Polynet, every recorded context
   used `member_agent_dock`, every run was agentic, and none used Codex, chat
   mode, or a missing invocation surface.
2. The 90-day audit found 13 historical Codex bridge runs between 2026-06-26
   and 2026-06-30. Their capacity leases were released and their Daytona
   targets were released or errored; production had zero active leases and
   zero live Daytona Codex targets at audit time. No matching public-turn,
   runtime-turn, or Codex-worker endpoint appeared in the latest 10,000
   production log records.
3. The browser runner now requires one explicit canonical surface, explicit
   Polynet engine selection, and governed agent tools. Only Member Agent and
   Funnel Composer are first-party callers.
4. Missing, unknown, retired, or thread-mismatched surfaces fail with
   `invalid_invocation_surface`. Explicit Codex or unknown engines fail with
   `unsupported_runtime_engine`. Missing agentic intent or an empty governed
   tool grant fails before provider execution.
5. `/runtime/public_turn`, its browser client, all three Codex-worker HTTP
   routes, and the Daytona Codex target sweeper are unregistered. New thread
   writes accept only `polynet`; historical schema unions remain readable.
6. `check:native-runtime-ingress-extinction-proof` proves the two callers,
   fail-closed surface/engine behavior, agentic-only resolution, route and cron
   extinction, historical readability, and preservation of external Codex MCP
   setup through the official `/runtime/mcp` boundary.

Slice 5B is released and production-proven. It was the smallest safe deletion
boundary: extinguish the internal Codex worker without mixing in the then-reached
native Daytona Workspace/session substrate or the separate legacy chat branch.

Slice 5B changes:

1. Native engine resolution is owned by `shared/runtimeEngine.ts`; explicit
   `codex` still fails with `unsupported_runtime_engine` before provider or tool
   execution.
2. The unreachable Codex branch, worker lease/cost/token plumbing, worker
   streaming, and Codex harness projection are deleted from the authenticated
   runtime handler.
3. All `polynetCodexWorker*` Convex modules, the
   `services/polynet-codex-worker` service, worker prompt projection/limits,
   worker startup/deployment/smoke scripts, and worker-only package commands are
   deleted.
4. Native Daytona Workspace tools now provision only the sandbox they use;
   sandbox creation no longer starts a hidden Codex HTTP worker, requests a
   worker preview URL, or requires a worker auth token.
5. The shared Daytona policy now contains only the still-reached sandbox
   lifecycle/resource policy. Dead native-Codex policy and Codex harness-tool
   policy are deleted.
6. Historical Codex engine values, capacity leases, Daytona target records,
   model attribution, and timeline rendering remain readable. External Codex
   clients still connect through official Polynet MCP.

Slice 5B acceptance:

1. Repository search finds no executable internal Codex worker module,
   service, route, cron, startup/deployment script, handler branch, or package
   command.
2. `check:native-runtime-ingress-extinction-proof` proves the deleted file set,
   fail-closed engine selection, preservation of historical reads, and external
   MCP compatibility.
3. TypeScript plus Member, Funnel, Concierge, Steward, funding, context,
   resources, history, MCP, native Workspace security, and preview proofs stay
   green.
4. No schema migration or historical record deletion is introduced.

Slice 5C is released and production-proven. It deletes the unreachable legacy
chat-mode provider branch without changing the governed agent loop, community
chat, historical runtime records, or external MCP.

Slice 5C changes:

1. Runtime admission still requires explicit governed agent tools, while
   runtime resolution no longer returns a redundant execution-mode selector.
2. The authenticated runtime handler now has one structural execution path:
   the existing governed agent loop. New run receipts persist `agentic` and
   `capability_composed_tools_v1` directly.
3. The duplicate streaming and non-streaming direct-provider chat branches,
   chat-only message projection, chat prompt composer, and unused cloud
   community-context envelope are deleted.
4. New runtime-run creation rejects an explicit non-agentic execution mode and
   defaults missing input to `agentic`. Historical schema fields, legacy
   `chat` values, and missing-value trace rendering remain readable.
5. Community channel/chat storage, adapters, access checks, provider
   connections, the adaptive failure finalizer, native roles, and external MCP
   are unchanged.

Slice 5C local acceptance:

1. Repository search finds exactly the two canonical browser callers and no
   executable chat-mode branch or chat-only prompt composer.
2. Convex and web typechecks pass, together with native ingress extinction,
   runtime router/loop, runtime persistence, prompt layout, Member, Funnel,
   Concierge, community-agent, funding, context integrity, provider-context
   attestation, Resources, Events, history, legacy community-chat adapter, and
   external MCP proofs.
3. The full local release gate passes, including the production web build, the
   complete repository behavior suite, dependency interlock, and
   zero-vulnerability root, web, and preview-proxy audits.
4. The stale community-lens proof now reads its canonical owner,
   `WebMemberAgentDock`, instead of the decomposed `App.tsx` shell.
5. No schema migration or historical record deletion is introduced.

Slice 5D is released and production-proven. It removes the legacy general
Workspace execution/session/tool substrate while preserving native product
roles, canonical community context, historical reads, and migration-only
provider cleanup.

Slice 5D changes:

1. The native agent loop no longer exposes filesystem, shell, terminal,
   computer-use, preview, Workspace-session, or Daytona tools or capability
   families. Prompt composition and failure handling no longer inject their
   state or instructions.
2. Public/internal Workspace session, terminal, computer-use, Daytona preview,
   target-allocation, and project-ZIP-import entry points are deleted. The
   refreshed current-production client manifest requires none of their names.
3. Daytona source modules, browser viewers, command policy, smoke/probe scripts,
   and the direct SDK dependency are deleted. Daytona-only transitive dependency
   overrides are deleted with them.
4. The surviving provider pointer module is migration-only: it can update or
   clear existing Blaxel resource pointers for inventory and cleanup, but it is
   not reachable from the agent loop and cannot allocate or execute a runtime.
5. Historical schema fields, records, tool receipts, and cached-production-client
   compatibility remain readable. No historical data migration or destructive
   provider deletion is introduced.
6. The quarantine proof is now a focused extinction contract over the actual
   product boundary instead of a broad legacy implementation inventory.

Slice 5D acceptance:

1. Repository search finds no active Daytona dependency or import and no
   reference to the deleted runtime/session/tool modules outside deliberately
   retained historical schema and compatibility contracts.
2. Convex code generation, web typecheck, runtime loop/scheduler/prompt/context/
   receipt proofs, role ingress proofs, provider-context attestation, external
   MCP isolation, cached-client compatibility, and the dependency security
   interlock pass.
3. The full local release gate passes, including the production web build, the
   complete repository behavior suite, dependency interlock, and
   zero-vulnerability root, web, and preview-proxy audits.
4. The exact merged SHA passes the canonical GitHub Release Gate, production
   web reports that SHA, and matching Convex functions are deployed.
5. Production proves the retired function and route surface is absent while an
   authenticated Member Agent can still inspect every authorized community
   surface with one auditable community scope.

Human product direction remains explicit: there is no standalone general
coding Workspace agent in the target product. Preserve the community harness,
community compiler, community resources/memory, references, native product
roles, historical thread/message data, and external MCP.

### 17.3 Slice 6: canonical model-aware input budget

Status: complete and production-proven on 2026-08-14.

Objective: decide whether a complete provider request fits before sending it.

Work:

1. Give the canonical runtime model-capacity registry an explicit
   context-window capacity for every admitted resolved transport/model
   reference. Product/UI aliases are not capacity authority. Unknown capacity
   rejects admission.
2. Build one `RuntimeInputBudgetPlan` from:
   context-window capacity, reserved output tokens, serialized tool-schema
   estimate, compiled system prompt, conversation/tool projection, provider
   overhead, and a conservative safety margin.
3. Use one estimator contract across all roles. Provider-specific exact token
   counters may refine the estimate but cannot create separate policy paths.
4. Record the initial plan in the mandatory run evidence and record later
   changed plans as projection deltas.
5. Replace raw character ceilings with model-aware decisions. Preserve bounded
   resource/tool response limits and pagination.
6. Keep provider context-overflow classification as a final safety signal.

Acceptance:

1. Boundary fixtures for every active model prove fit, near-limit, and overflow
   behavior deterministically.
2. Tool-schema and reserved-output costs cannot silently consume user-history
   capacity.
3. Every role uses the same budget owner.
4. Missing model capacity fails before funding/provider execution.

Non-goals: summarization, semantic compaction, Pi, or provider cache tuning.

Implemented shape:

1. `shared/runtimeInputBudget.ts` is the only capacity registry, estimator,
   plan, and privacy-safe evidence contract.
2. Capacity keys are exact `(transport, resolved model reference)` pairs. The
   current reviewed windows are 1,050,000 for OpenAI GPT-5.6 Sol/Luna and
   GPT-5.5, 131,072 for OpenRouter GPT OSS 120B Free, 1,000,000 for OpenRouter
   Claude Sonnet 4.6, Claude Opus 4.6, and Grok 4.3, and 1,048,576 for
   OpenRouter Gemini 2.5 Flash/Pro.
3. Estimator v1 counts serialized messages and active tool schemas at one token
   per two UTF-8 bytes, reserves 8,192 tokens per image, reserves 4,096 provider
   envelope tokens, and withholds five percent of the context window with a
   4,096-token minimum safety margin. Provider-reported usage remains the
   calibration signal; it does not split policy ownership.
4. `runNativeRuntimeKernel` plans every provider attempt, including the single
   provider-overflow retry. Initial evidence is mandatory and changed plans are
   recorded as deltas without prompt content.
5. Member, Funnel Composer, Concierge, and Steward claim hosted funding only
   after the shared plan admits the request. Unknown capacity, invalid budget,
   missing evidence, and estimated overflow stop before funding/provider work.
6. Active OpenRouter aliases resolve to currently advertised exact references:
   Claude Sonnet 4.6, Claude Opus 4.6, Gemini 2.5 Flash/Pro, and Grok 4.3. The
   persisted `grok-4.1` product alias remains stable while its provider target
   advances independently.
7. Tool/resource response bounds and pagination remain unchanged. The deleted
   request-wide transport character ceiling remains absent, and Member history
   no longer applies separate 60,000-total or 20,000-per-message truncation.
   The existing bounded 60-row storage read shared by Member and Funnel
   Composer remains until Slice 7 owns paginated model-visible history
   projection.
8. Each role resolves one provider tool surface per run. The same immutable
   schema value is used for initial context evidence, input budgeting,
   provider transmission, and returned-tool validation; the budget seam cannot
   rebuild a second schema through a callback.
9. A failed preflight budget does not trigger the legacy provider-overflow
   compaction retry. Only an attempted provider request can activate that
   existing recovery path; deterministic projection remains Slice 7.
10. Member and Funnel pre-provider lifecycle failures escape the provider-only
   crash classifier unchanged so the turn handler retains its existing
   funding, rate-limit, and conflict mappings. Steward separately preserves a
   failed pre-provider funding claim's bounded error code. These failures
   produce no provider-result observation or provider request.
11. Member Agent text is not clipped by the browser composer or message
    persistence path before the canonical runtime input budget evaluates the
    complete provider projection. Attachment count, type, and byte limits stay
    independently bounded.

Production evidence:

1. Runtime budget release merge `1cacbde83677ddcdf1cc90e544396c9d821899a7`
   passed the exact-main GitHub Release Gate, was reported by production web,
   and was deployed to production Convex.
2. The authenticated normal community-inspection canary completed `ok` as run
   `member_agent_dock:fbe96adc-a62e-476e-aa5f-b57570e4e2d1`. Its initial
   plan and every later delta fit; the final projection estimated 97,247 input
   tokens, and its context-integrity receipt passed with no failures or
   warnings. Four malformed directory reads failed argument validation before
   the agent recovered through returned exact paths. The pre-Slice-7 repair
   makes the directory/document routing rule explicit in the canonical prompt,
   provider-facing path schemas, and fail-closed recovery error without changing
   the five-tool ABI, executor semantics, authority, or runtime kernel. Its
   verification is deterministic and must not write synthetic payloads into a
   user-visible thread.
3. That canary exposed a remaining legacy 8,000-character browser and
   persistence ceiling. Hotfix merge
   `24c3f5d2ad94536e41d4776c16655a6ac99a27bf` deleted only those two caps,
   preserved attachment bounds, passed the exact-main GitHub Release Gate, was
   reported by production web, and was deployed to production Convex.
4. The resumed authenticated oversized canary persisted exactly 300,000 text
   characters and returned `OVERSIZED_CANARY_OK` as run
   `member_agent_dock:787c46cd-1d81-4c1c-addd-c0ce4975f4ad`. Its canonical
   initial plan estimated 168,037 input tokens against the 1,050,000-token Luna
   context window, admitted the request with 823,319 input tokens remaining,
   and passed context integrity with no failures or warnings.

### 17.4 Slice 7: shared deterministic model-visible projection

Objective: fit long sessions without mutating durable history or weakening
policy.

Projection order:

1. Preserve the exact canonical system instructions compiled for this run.
   Canonical state changes affect subsequent turns only; projection never
   reloads policy or mutates the current turn's authority.
2. Preserve the latest user request and every message in its current episode
   byte-for-byte, including unresolved tool-call/result pairs.
3. Preserve recent conversational turns within the budget.
4. Deterministically compact older large tool results and media references.
5. Use existing episodic recall or authorized community retrieval for omitted
   history where the role already supports it.
6. If the safe deterministic projection still cannot fit, fail clearly or
   require a new episode before provider execution; do not invoke a semantic
   summarizer.

Work:

1. Replace the optional Member/Funnel-only projection hook with one shared
   context projector used by all native roles.
2. Keep durable messages, tool results, and community memory unchanged.
3. Store projection lineage: included ranges, omitted ranges, projection
   digest, estimated tokens before/after, trigger, and attempt.
4. Reconstruct all policy and role instructions from canonical sources after
   every compaction.
5. Permit at most one compaction/retry decision per provider request and require
   measurable savings to prevent thrash.
6. Keep stable/scoped/volatile ordering as the only cache-ready seam; provider
   cache-control behavior is outside this program.

Acceptance:

1. Long-session fixtures fit every admitted model or fail deterministically.
2. Original stored history remains byte-identical.
3. No omitted or compacted evidence can be promoted into an instruction slot
   or grant tools/authority.
4. Concierge and Steward receive the same overflow recovery semantics as
   Member and Funnel Composer.
5. Repeated ineffective compaction terminates rather than loops.

Non-goals: semantic/LLM summarization, provider cache-control abstraction,
background self-improvement, a new memory backend, a general context engine
plugin system, or Hermes-scale compression infrastructure.

Slice 7A implemented shape:

1. `shared/providerContextWindow.ts` is the single deterministic projector. It
   preserves current-run system instructions and every message in the latest
   user episode byte-for-byte, compacts retained older tool/media evidence, and
   omits only complete older conversation segments.
2. `runNativeRuntimeKernel` owns projection for every native role. An estimated
   overflow projects and re-plans before provider/funding execution; a provider
   overflow receives at most one retry and only after measurable savings.
3. Projection operates on a provider-only copy. Durable messages, tool results,
   memory, and the kernel result transcript remain unchanged.
4. Existing role event stores record mandatory versioned lineage: trigger,
   attempt sequence, exact projected-context digest, included/omitted ranges,
   compacted indexes, and before/after estimates. No projection database or
   second event model was added.
5. Member and Funnel initial provider-context attestation now occurs after the
   final projection and before their existing funding hook, so it attests the
   bytes actually offered to the provider.
6. The optional Member/Funnel-owned compaction callbacks and their
   tool-result-only retry path are deleted. Concierge and Steward inherit the
   same kernel behavior without role-specific projection code.
7. Slice 7B separately owns budget-guided pagination beyond the former newest
   60 persisted-message ceiling shared by Member and Funnel Composer. Pi
   remains excluded until all of Slice 7 is production-proven.

Slice 7B implemented shape:

1. The existing authorized persisted-history query now treats 60 rows as a
   newest-first page size with lookahead and a strict sequence cursor. Every
   page revalidates owner, thread, exact initiating user message, and role.
2. Member and Funnel Composer share one persisted-history seed and one runtime
   pagination path. No role-specific selector or second history transport was
   added.
3. After the exact system prompt, model identity, and provider tool schemas are
   known, the runtime pages older rows only while the canonical input-budget
   planner admits every loaded complete episode in strict recency order.
4. The current user episode is never dropped. An orphan assistant split across
   a page boundary is not sent to the provider, and an older episode is omitted
   atomically when it does not fit.
5. Database work is bounded to 32 pages per turn. Exhaustion, budget stop,
   unknown capacity, and the operational page stop are explicit evidence—not
   silent claims that all history was loaded.
6. `runtime_persisted_history_selected` records bounded sequence lineage,
   counts, pages read, stop reason, and budget profile in the existing run event
   store before provider execution. Raw message content is not duplicated.
7. The same provider tool-schema projection is used for history admission and
   the native kernel's final budget plan. The kernel remains the final
   projection owner; no second budget policy or compaction system exists.

Slice 7A production evidence:

1. Runtime context projection release `bd228822a6acc79631d64fdca512f52523aaaa4d`
   passed the exact-main GitHub Release Gate, was reported by production web,
   and was deployed to production Convex.
2. The required read-only production accounting smoke reported `health: pass`
   with zero duplicate balances, negative balances, stale reservations, due
   pending settlements, price drift, recent provider-cost mirror gaps, recent
   unbilled compute charges, or recent compute rows missing provider-cost
   mirrors.
3. No synthetic user-visible agent turn or UI canary was executed. Exact
   current-episode preservation, bounded projection recovery, evidence failure,
   and no-retry terminal behavior are covered by the deterministic release
   suite.

### 17.5 Slice 8: Pi value/feasibility adapter and deterministic parity

Objective: determine whether Pi core can replace loop mechanics with a net
reduction in complexity without acquiring Polynet authority.

Work:

1. Pin one reviewed `@earendil-works/pi-agent-core` version. Accept its locked
   transitive `pi-ai` dependency, but add no direct provider migration or Pi
   storage/coding packages.
2. Prove bundle and execution compatibility in the actual Convex environment.
   Prefer the existing runtime; use an isolated Node 22 action adapter only if
   required and proportionate.
3. Implement Pi behind the existing governed-loop interface. The caller still
   supplies only resolved model transport backed by the existing
   OpenAI/ChatGPT/OpenRouter transports, compiled/projected context, admitted
   tool definitions, budgets, cancellation, and receipt hooks.
4. Resolve tool names internally to canonical executors. No arbitrary executor
   callback, direct `tool.execute()`, or Pi-discovered tool is allowed.
5. Map Pi lifecycle events into the existing Polynet event vocabulary without
   creating a second durable event model.
6. Pi's context-transform hook may request the canonical projection, but it is
   not an enforcement boundary. The final Polynet-owned stream function must
   revalidate the current model, admitted tool surface, and budgeted projection
   and fail closed before any network request.
7. Build a scripted, model-free parity harness that drives the current kernel
   and Pi through identical assistant/tool sequences.
8. Measure adapter code, dependencies, deleted loop code, build/cold-start
   impact, and maintenance surface. Require an explicit adopt/reject decision
   based on net deletion and operational value.

Parity must cover:

1. Exact initial system and contextual message bytes.
2. Provider-visible tool schemas and admitted names.
3. Serial and permitted parallel tool execution.
4. Unknown tool, invalid arguments, repeated failure, no-progress, and tool
   budget stops.
5. Cancellation before provider, during stream, and during tool execution.
6. Funding start/settlement/failure disposition.
7. Context projection and overflow retry behavior.
8. Tool-result envelopes, hashes, receipts, and idempotent replay.

Acceptance:

1. Pi passes deterministic parity without production routing, and the value
   gate records an explicit adopt/reject decision.
2. Pi cannot call a tool absent from the resolved admitted set.
3. Removing or bypassing the Polynet executor makes Pi tool execution
   impossible by construction.
4. No Pi storage, coding-agent, prompt loader, extension system, or session
   database is installed.
5. Runtime compatibility and cold-start/build impact are measured and accepted.
6. Reject Pi and delete the spike if it requires a disproportionate Node split,
   duplicates provider transports, weakens final enforcement, or adds as much
   maintained complexity as it removes without a material reliability gain.

### 17.6 Slice 9: reversible role-by-role Pi cutover if earned

Objective: if Pi wins Slice 8's value and parity gate, move production roles
gradually with a server-owned rollback path. If Pi loses, skip this slice.

Order:

1. Member Agent.
2. Funnel Composer.
3. Concierge.
4. Steward.

For each role:

1. Run deterministic parity and negative authority tests.
2. Run a staging provider canary with read-only tools first.
3. Run the smallest authorized mutation canary when the role can mutate.
4. Enable a bounded server-side production canary. Clients cannot select the
   engine.
5. Compare completion, tool, funding, latency, context, stop, and receipt
   evidence against the native baseline.
6. Promote only after the role's acceptance gate is independently green.
7. Keep one server-side rollback switch until the next role is stable.

Do not execute the old and Pi loops concurrently against mutating tools. Shadow
parity uses scripted/model-free execution or read-only calls so exactly-once
semantics remain intact.

Acceptance for each role:

1. Authority-denial behavior is unchanged.
2. Prompt/context and tool-surface receipts are complete.
3. Funding and idempotency transitions are unchanged.
4. Context overflow recovers or fails under the shared policy.
5. Cancellation leaves no unfenced mutation or unclosed funding claim.
6. Server rollback is proven before promotion.

### 17.7 Slice 10: delete the losing kernel and prove 100%

Objective: finish convergence rather than retaining two permanent runtimes.

Work:

1. If Pi wins and all four roles meet their stability window, delete
   `runNativeRuntimeKernel` and its duplicate provider/tool-loop adapters. If
   Pi loses, delete the Pi adapter/spike and retain the native kernel as the
   sole governed loop.
2. Remove migration flags, parity-only production branches, legacy engine
   selection, and obsolete receipts/proofs.
3. Retain deterministic tests for the selected kernel as the canonical loop
   contract.
4. Update all architecture, cognition, MCP, release, and operational docs to
   name the final owners.
5. Run the complete release gate, deploy Convex intentionally, release through
   GitHub `main`, and prove the exact production build marker and live role
   canaries.

Acceptance:

1. One production loop implementation remains.
2. All four native roles and external MCP satisfy the final verification
   matrix.
3. No Workspace/Codex runtime or client-selectable engine remains.
4. No alternate prompt compiler, context budget, compaction policy, or tool
   executor remains.
5. Production evidence resolves to the exact released SHA.

## 18. Verification matrix

Every remaining slice runs the applicable cells:

| Boundary | Required proof |
| --- | --- |
| Prompt | exact bytes, deterministic order, no duplicate IDs, privacy-safe receipt |
| Scope | unauthenticated, non-member, wrong community, stale page/lens mismatch |
| Tools | unknown tool, prompt-requested tool escalation, invalid args, live reauthorization |
| Funding | no admission, pre-spend failure, indeterminate provider failure, exact settlement |
| Persistence | retry dedupe, digest conflict, durable history unchanged, attempt fencing |
| Budget | every model boundary, tool-schema reserve, output reserve, unknown capacity |
| Projection | policy reconstruction, deterministic omission/compaction, lineage, anti-thrash, terminal overflow |
| Loop | stream, cancellation, parallel-safe reads, mutation serialization, stop reasons |
| Roles | Member, Funnel, Concierge, Steward fixtures and live canaries |
| External | MCP explicit community scope and domain-executor parity |
| Release | clean final tree, release gate, Convex deployment, production SHA and browser/live canary |

Local green tests are not production proof. Provider canaries do not prove
deployment. A production build marker does not prove role behavior. Each claim
requires its own evidence layer.

## 19. Definition of 100% for this program

This architecture program is 100% only when all of the following are true:

1. The only native product roles are Member Agent, Funnel Composer, Concierge,
   and Steward, all using the single governed loop selected by Slice 8's
   evidence-backed gate.
2. Polynet exclusively owns prompts, context projection, authority, tools,
   funding, memory, persistence, and receipts.
3. Every provider request is model-budgeted; every run has mandatory initial
   context evidence and every later provider context is reconstructable from
   durable deltas.
4. Long conversations use one shared deterministic projection/compaction
   policy without mutating durable history or requiring semantic summarization.
5. Community content remains primarily tool-retrieved; prompts contain bounded
   orientation and authorized policy rather than unbounded archives.
6. Selected community is authoritative and selected page/channel is relevance
   evidence only.
7. Workspace, Codex worker, chat-mode, artificial request character limits,
   alternate prompt composers, and the losing loop implementation are deleted
   or retained only as explicitly historical schema readability.
8. External MCP remains explicit, server-authorized, and executor-equivalent.
9. Negative authority, funding, replay, cancellation, and context-overflow
   behavior is proven for every role.
10. The exact final SHA is deployed and live-canary evidence exists for every
    role.

"Pi is installed" is not completion. "The adapter compiles" is not
completion. "Tests pass locally" is not completion. An evidence-backed Pi
rejection does not block completion; permanent dual runtimes do.

## 20. Decisions and deliberate non-requirements

Closed decisions:

1. Pi is the preferred candidate, not an unconditional requirement. If it earns
   adoption, use Pi agent core only; never adopt the Pi coding agent.
2. Preserve Polynet governance and canonical cloud state.
3. Keep external MCP outside the native loop.
4. Use one selected community authority boundary; channel/page state is a
   relevance hint.
5. Delete Workspace/Codex compatibility before any production loop migration.
6. Preserve bounded resource/tool pagination while removing request-wide
   character ceilings.
7. End with one runtime, not permanent native/Pi dual execution.
8. Model capacity authority is the resolved runtime transport/model registry,
   not the UI alias catalog or live provider metadata.

Questions that must be answered by proof, not architectural speculation:

1. Can the pinned Pi core bundle run in Convex's default action runtime, or is
   an isolated Node 22 action adapter required?
2. Do production records show any caller of Workspace, chat-mode, or Codex
   runtime compatibility that source reachability does not reveal?
3. What is the smallest server-owned canary/rollback mechanism that reuses
   current runtime configuration?

Do not build:

1. A universal role registry.
2. A second prompt compiler or tool executor.
3. A generic memory-provider/plugin framework.
4. A separate compaction database when current durable records suffice.
5. A selected-channel authorization system.
6. A client runtime picker.
7. Hermes-style local session truth or Pi session persistence.
8. A provider cache abstraction before an admitted provider needs one.

## 21. Immediate next gate

Land Slice 7B on exact `origin/main`, deploy through the canonical GitHub and
Convex paths, and prove one Member or Funnel turn whose persisted-history
selection event and provider-context attestation agree. Only after that proof
may Slice 8 begin as a reversible Pi agent-core feasibility adapter. Do not mix
the Slice 7B release with Pi adoption, semantic summarization, a second prompt
compiler, a second event store, or a second runtime.
