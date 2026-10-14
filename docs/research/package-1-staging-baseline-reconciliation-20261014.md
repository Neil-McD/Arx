# Package 1: staging baseline reconciliation

Scope: reconcile staging with canonical main and correct the stale member
ontology proof. No new product behavior is introduced beyond the existing main
baseline. Real authenticated MCP acceptance belongs to package 2.

Current status: **source reconciliation, ontology correction and focused
dependency remediation verified; awaiting the clean-commit release gate and
staging release**. No deployed layer or remote branch has been changed yet.
Package 1's live-baseline acceptance remains open. The
[initial verification evidence](evidence/package-1-baseline-20261014.json)
records the earlier audit failure before the authorized remediation below.

## Requirements and source

| Requirement | Source | Minimum implementation |
| --- | --- | --- |
| Ground the staging baseline in canonical main | Founder request | Fast-forward the isolated staging candidate; preserve main's existing changes instead of creating a selective fork |
| Identify both deployed layers | Package 1 acceptance | Deploy a clean validated candidate to the explicit staging backend, record the source/deployment receipt, and verify the serving web build |
| Repair the ontology proof | Reproduced assertion failure | Replace the obsolete no-internal-lens claim with the existing human and lease-bound execution boundaries |
| Preserve privacy and source authority | Existing contract/runtime | Reuse current predicates and readers; verify their positive, denied and stale cases |
| Keep the package scoped | Founder request | No framework, runtime, identity, ontology, UI, provider or workflow redesign |

The largest avoidable effort would be a new ontology/identity system or an
invented staging fork. Reusing main and changing one proof is the credible
minimum. Actual engineering costs are unmeasured; no numeric idiot index is
claimed.

## Source reconciliation

- Previous remote staging: `1fc266e1ddaf3880491e7a7d3fdfa1bb32dfcfa4`.
- Reconciled canonical main: `0a100cfb544851ab06da25f93d8ad549db917ee4`.
- Staging had no unique commits and was 16 commits behind. The isolated
  `codex/staging-chunks-1-3` branch was fast-forwarded to main.
- The 52-file main delta includes explicit home admission/default destination,
  operator-funded inference/tool accounting and member allowances, existing
  dependency security patches, release tooling and historical receipts.
- Schema changes in that delta add the operator usage ledger and optional
  receipt references. This package adds no schema or data migration.
- Application/backend/shared runtime source remains identical to main. The
  scoped candidate additionally changes dependency manifests/locks, the
  dependency guard, focused rendering tests and the ontology proof.

The older deployed backend interface was independently captured before release:
`memberEntryDestination:resolveMemberEntryDestinationInternal` was an internal
mutation with a `nowMs` argument. Main makes it an internal query without that
argument. This is interface evidence, not a retroactive exact backend SHA.

## Ontology correction

The failure was reproduced before editing. The proof expected the removed
sentence `There is no community-agent-internal member lens in v1`.

The replacement assertions require:

1. Human founder/admin reads remain scoped to one community and exclude
   unapproved, withdrawn and observed facts.
2. The distinct `workflow_execution` reader requires a running request, current
   attempt/lease, linked run/member/action, membership and target access.
3. Clients cannot select an arbitrary subject, inherit sponsor manager authority,
   or invoke that reader as a member-agent/MCP tool.

The existing runtime and visibility predicate are unchanged. Existing workflow
tests exercise authorized private context and wrong-attempt, expired-lease,
revoked-grant and source-access denial, alongside ordinary-reader isolation.

## Initial verification before dependency remediation

| Check | Result |
| --- | --- |
| Ontology proof | Original failure reproduced; corrected proof passes |
| Main-delta/context/auth tests | 233 tests passed across 18 files |
| Workflow execution/privacy tests | 213 tests passed across 3 files |
| Full repository behavior suite | 1,587 tests passed across 189 files |
| Backend and web typechecks | Passed |
| Build, identity, bundle budget | Passed; 15 JS chunks, 3,175.8 KiB |
| Browser media, theme, loading, runtime and foundation checks | Passed |
| Dependency compatibility interlock | Passed |
| Root dependency audit in release gate | Failed: 4 low findings from the KaTeX chain, 1 high source-map-js finding |
| Independent web dependency audit | Same 5 findings |
| Clean-commit release gate / staging deployment | Not run; release held |

The test subsets overlap the full repository suite and must not be added to its
total. Local gate evidence describes a working-tree candidate, not a clean
release commit. On this host, extensionless TypeScript imports in existing Node
proof scripts needed the temporary ESM resolver used in the preceding assessment;
the ontology proof also passed directly through the installed `tsx` runner.

The locked versions are KaTeX `0.16.44` and source-map-js `1.2.1` in both graphs.
The reviewed advisories identify patched versions
[KaTeX 0.18.2](https://github.com/advisories/GHSA-238p-pmpm-9mq7) and
[source-map-js 1.2.2](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
KaTeX crosses the current version line, and the math plugins retain older KaTeX
dependency ranges. Do not run an indiscriminate `npm audit fix --force`, downgrade
math plugins, lower the gate threshold or add an advisory exception to make this
candidate pass. Dependency remediation and rendering compatibility were scoped
as the next package 1 slice and explicitly authorized by the founder's `go`.

## Authorized dependency remediation

Both root and web manifests pin KaTeX `0.18.2`, override the math plugins to
share that direct dependency, and pin source-map-js `1.2.2`. Lockfile comparison
shows only those two installed package versions changed in each graph. The
existing math plugins and frontend/backend architecture are retained.

The dependency guard examines every top-level and nested locked copy, rather
than checking only the direct dependency. Focused Markdown tests cover inline
fractions, display equations, malformed expressions, unsafe links/images and
the inherited-trust regression in both root and web KaTeX installations. The
positive control still permits links when trust is explicitly supplied.

All 10 Markdown tests, the ontology proof and dependency guard passed. Both
fresh dependency audits report zero findings. A clean-commit full release gate
and the staged frontend/backend receipt remain the final acceptance boundaries.

## Verification and release boundary

Focused suites, the ontology proof, and the canonical release gate provide
candidate evidence. Exact results and deployed source/target observations must
be recorded in a separate final receipt; this document alone certifies no live
deployment.

Staging targets are `dev:quick-porcupine-949` and
`https://polynet-staging.vercel.app`. The historical staging release used an
explicit one-shot Convex development push followed by a fast-forward of remote
`staging`, which triggered its Git-connected Vercel project. Use those explicit
targets after successful verification; no production release command is needed.

The human-supplied production release instruction and main's newer local
production runbook disagree. The human instruction governs. This package does
not change production policy, run production release tooling or push main.
