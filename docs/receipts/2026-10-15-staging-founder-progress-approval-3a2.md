# Slice 3A2: evidence-bound founder milestone approval

**Bounded staging acceptance passed October 15, 2026. Production was untouched.**

[Structured evidence](evidence/2026-10-15-staging-founder-progress-approval-3a2.json).
[Approved scope](../archive/polynet-staging-founder-progress-approval-3a2.md).
[Draft PR #176](https://github.com/Neil-McD/Arx/pull/176), stacked on #175.

## Release identity

| Boundary | Verified evidence |
| --- | --- |
| Clean runtime / Git staging / served staging | `ad8c7071d3a8a8db65501ddc6825090de7817374` |
| Backend | Explicit `convex dev --once --typecheck enable --env-file /tmp/polynet-package-1-staging.env`, exit 0; `dev:quick-porcupine-949` |
| Backend source tree | `e1d6553b4039e8a1c300a7e69aa6f325d421104c`; clean local deployment provenance, not remote commit attestation |
| Web | Successful [Git staging deployment](https://polynet-staging-8vlvvs164-neil-mcds-projects.vercel.app), deployment `7102504865` |
| Serving asset | `/assets/index-C6xR9-XZ.js`; SHA-256 `d39d4bdbc8ed9278a669d26dee9c4523297decf2e1bca8742d1ae5885f989f71`; both staging Convex hosts embedded |
| Canonical main | `0a100cfb544851ab06da25f93d8ad549db917ee4`, unchanged |
| Production web | `91d28dc2c986ef88a8a507a269db710d6d28d878`, unchanged |

Staging was pushed before the feature branch. Feature-branch Vercel previews are
separate from the production alias. No production deployment command or provider
setting change was used. Receipt-only commits are separate from the deployed
runtime candidate. [Runtime-source CI passed](https://github.com/Neil-McD/Arx/actions/runs/38795620082).

## Implementation and review

- Kept the five tools, existing stores, private dossier and transition owner.
  Added one human owner/admin capability, `community.workflow.approve_milestone`
  v1, and optional builder-only `workflow.approval` observations.
- A bounded SHA-256 reference binds workflow/revision, subject activation, stage
  visit/sequence, instructions/goal/mode, configured actions and verified evidence,
  including frozen form questions, version and answers. Incomplete, unavailable,
  oversized or truncated evidence supplies no executable observation. The external
  capability requires at least one action; existing zero-action reference RPC
  compatibility remains separately covered.
- Current manager, lifecycle/funding, target access, canonical membership pair and
  activation are checked before completed receipt replay. New execution recomputes
  the reference and calls the existing approval writer. Receipt reservation,
  transition, visit cleanup/scheduling and receipt completion share one transaction.
- No new approval queue, decision store, workflow engine, model judgment, force
  flag, caller-selected actor or external authoring. Blank goals remain supported
  without relaxing the separate AI goal-assessment contract.
- Strengthened existing form-denial tests: correctly mounted community agents,
  explicit expected errors instead of catch-all failure, and changed-version replay.
  Reconciled stale resource terminal-operation claims in the MCP contract.

410 tests across nine affected files passed. The final form/approval regression
run passed 59 tests. Thirty new approval cases cover evidence drift, stale visits,
activation/access/funding changes, duplicate membership pairs, manager loss,
member/moderator/funnel/mounted-agent controls, concurrency, movement/completion
replay and receipt-fault rollback including scheduled work.

The exact clean-candidate gate passed all 15 steps: **1,836 tests / 194 files**,
both typechecks, semantic/MCP/operation/identity checks, web build/bundle and browser
foundation proof, and both dependency audits zero. This is local gate evidence;
remote CI and live staging proof are recorded separately.

## Live proof

Used the preflighted quiet `exact-build-canary-234c2972` fixture. Fresh native OAuth
verified the actual owner and ordinary member, whose roles are reversed from
3A1. The native founder directory and member self-context confirmed current
operational access. Before setup: no workflow, forms, requests or transitions,
and no other active member outside the two actors. Original empty configuration
snapshot SHA-256: `c67ef0afa86756f6b11ea3751266f8376bc0fea6a4d1b8e5f21b51b10655abe7`.

Using the actual founder web session, published one required short-text synthetic
form and saved one terminal stage at revision 2: blank goal, human approval
required, one fresh `member_contributed -> request_form` rule. No timer, inference
prompt or service channel was configured. Normal editor autosave produced form
revision 2 and exactly one immutable published version.

| Step | Observed result |
| --- | --- |
| Before contribution | Native pending directory empty; builder approval observation null |
| Ordinary member composer | One synthetic post without mentions; canonical actor type `human` |
| Assignment | One request, revision 0, pinned published version, zero transitions |
| Member native submit | One frozen synthetic answer at revision 1 |
| Normal reconciliation | Scheduled reconciler finished successfully; all actions complete, workflow still active, zero transitions |
| Founder review | Private dossier and submitted-form evidence contained the exact question/answer/version; eligible approval reference returned |
| Member boundary | Approval capability read and execution denied |
| First approval | Persisted exact envelope before dispatch; discarded first application acknowledgment |
| Independent observation | One terminal `human_approved` transition, actual founder attribution, exact form/run evidence; no forced-move marker |
| Full process restart | Founder PID `11493` exited 0; new PID `25640` recovered through native stored OAuth credentials |
| Exact saved-envelope retry | Original transition returned with `deduped: true` |
| Changed review / same key | `idempotency_key_conflict` |
| New key / old observation | `workflow_approval_unavailable` |
| Canonical records after retries | Entire bounded observer snapshot identical: one transition, one approval receipt and one form-submit receipt |
| Private completion reads | Founder dossier and member self-context agreed; exact frozen submitted form remained readable |
| Founder board | Actual UI displayed “Workflow complete” |

Approval review reference:
`workflow-approval:v1:9fb4621d07dd27fb7f6cf00fe0ff6143cb842f1605dbf2863fd1cd2979e5bbb7`.
Saved envelope SHA-256: `98ea38b52d4d45a8612d6ad1eee235fbd70add0254c4f33d749116df1674ffba`.

| Canonical record | Retained ID |
| --- | --- |
| Workflow | `sh7v5wea1q7z08bjk4fcf5gag98gbqb2` |
| Membership / activation | `ks72c8mdnebazbp5rkjevgftzn8c50t3` / 1 |
| Form / published version | `ts7xzszjm5f955dp6y0sz54kax8gbs78` / `tn7skbss5f55a7pgfmssjrqazn8gbh85` |
| Submitted request | `tx7p7z4bvrak840w8eq57x5z4n8gbnd7` |
| Workflow run | `t57sfax2neqmvknwatpp2h4bgs8gah46` |
| Human contribution | `j97qyh2ehnqgryygvntc1ke09s8gb1yr` |
| Approved transition / sequence | `t97hqqff9ejfrd94km0fthwapn8gbgm8` / 1 |
| Approval receipt | `ps7qrajnsqa3v9gx953kq8pwc98gb8k2` |

The external harness acted under the founder's authenticated identity. This is
not a claim of unaided human authorship, AI-verified business outcomes, a forced
network failure, or general crash recovery. The first acknowledgment was discarded
after transport completion, then recovery used an independently observed commit
and a fresh process. Adversarial stale/access/race/rollback proofs are local tests,
not mutations of the live fixture. No community-agent serve request was created
during the bounded proof.

## Preservation and cleanup

- The entire bounded 3A1 before/after snapshot matched: workflow revision 5,
  two submitted records, no pending forms, and the same one terminal transition
  `t97p51p1ah1dnk3s2gt6d9meq98gaw9s`. Its completed proof was never reset.
- The retained 2A/2C1/2C3/2C4 snapshot also matched exactly. The earlier revoked
  membership stayed inactive, contribution `j97xym1sxb5knx6111a0wksgp18g9ptq`
  stayed intact, and denial `kh7ckcn44eejxaqgn2rsr1jrgd8gbfdt` retained its
  `2026-10-22T17:55:59.047Z` reapplication deadline and prior audit/outbox history.
- Retained all new synthetic records and configuration. No raw data deletion,
  fixture reset, forced movement or private-answer memory promotion.
- Closed native proof processes, removed both isolated local OAuth credentials,
  and verified fresh clients reported `notLoggedIn` and protected reads required
  authentication. All processes exited 0. Permanent Codex configuration SHA-256
  stayed `0041dd6497be4f8aacd06e5a83fed2750713a9e20cb4160cd362b61146abbfc2`.
- Signed out member and founder web sessions, verified the final public Sign in
  surface, and closed only the three owned proof tabs. Local credential cleanup
  does not claim provider-wide grant revocation or old-token invalidation.

This proves one bounded founder-controlled milestone through the shared core
rails. It does not prove full headless workflow authoring or accepted collective
memory. The planned current-source intelligence/accepted-memory proof remains
next; it must not silently promote these private form answers.
