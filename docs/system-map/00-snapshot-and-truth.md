# 00 — Snapshot and Truth Boundary

## Frozen lane

Verified 2026-07-19 in the isolated staging worktree:

| Concern | Verified value | Truth class |
| --- | --- | --- |
| Worktree | `/Users/neilmcdevitt/code/arx/.worktrees/semantic-platform-staging-20260719` | implementation |
| Branch | `codex/semantic-platform-staging-20260719` | implementation |
| Staging `HEAD` | `67c89903add41ff9b8de20929e07429a8d98f3bc` | implementation |
| Staging upstream | same exact commit | implementation |
| Staging Vercel project | `polynet-staging` | runtime/config identity |
| Staging Convex selector | `dev:quick-porcupine-949` | runtime/config identity |
| Deployment kind | `staging` | runtime/config identity |
| Production Git authority | `origin/main` | normative/release |
| Production commit at verification | `a936dee72a65f91723f332779390210e4cf783f0` | runtime/release marker |
| Local `main` | `e3386…`, 23 commits behind `origin/main`, no unique commits | implementation |

The public staging version marker reported `67c89903…`; the public production version marker reported `a936dee7…`. They were recorded separately. No deployment command, Convex mutation/action, environment change, or production data query was run.

Before the map was created, the only unexplained worktree content was the untracked, user-requested planning contract `docs/comprehensive-system-mapping-contract-v1.md`. All other files under `docs/system-map/` were created by this authorized mapping slice.

## Safety gate result

`scripts/semantic_platform_staging_guard.sh` and its behavioral proof passed against `.env.staging.local`. The staging project/selector and production project/ref remained distinct. No authenticated staging session was available, so source analysis can proceed but signed-in runtime claims remain unknown.

## Mechanical inventory

The generated inventory records:

| Surface | Count |
| --- | ---: |
| Tracked files | 1,292 |
| Primary source files | 797 |
| Primary source lines | 324,480 |
| Convex schema tables | 125 |
| Direct registered Convex functions | 789: 415 internal, 374 public/wrapped |
| Export alias candidates | 238: 227 resolve to registered functions |
| Convex HTTP routes | 36 |
| API route files | 13 |
| Scheduled jobs | 23 |
| Package manifests / lockfiles | 3 / 3 |
| Root / all package scripts | 280 / 289 |
| `check:*` scripts | 247 |
| Environment-variable names | 159 |
| Documentation files | 91 |

Inventory SHA-256: `c348ff2dac19abcbb7f7cd742a1fa65fac21bb5672df694586c2f75a5cfe7c6d`.
Generator SHA-256: `cc6315d64971cd460d6a6bf8f1686bd58949ca1f1c0c80b516680291a3206f1f`.
Domain-assignment SHA-256: `51610359812fc8ce1a42a2b6c1985b48d3e573e5e4c5cb5baad92be76ff36d1a`.
TypeScript parser version: `5.9.3`.

The generator uses tracked files only, TypeScript AST extraction where useful, and bounded text detectors for dynamic registrations and explicit debt markers. It records environment names, never values. Inventory membership is not proof of liveness, ownership, deadness, or MVP relevance.

## Scoped proof results

The following passed without external side effects:

- structural guards: auth environment continuity, verified Convex identity, browser-facing auth/billing public identity, auth bootstrap identity, and community public identity;
- deterministic contract proofs: community access lifecycle, community access role policy, community access state audit, gate parity, account community limit, and legacy onboarding retirement.

The role-policy package script initially hit the restricted runner's `tsx` IPC `listen EPERM`. Running the same TypeScript entrypoint as `node --import tsx scripts/community_access_role_policy_proof.ts` passed. This is runner evidence, not a product failure.

On 2026-07-20 UTC, five bounded Convex inline queries read redacted aggregate staging distributions from explicit selector `quick-porcupine-949`. The staging guard and rejection proof passed first. The queries exposed no identifiers/content and had no write, provider, or network capability. Results are recorded in [`04-staging-shape-audit-20260720.md`](04-staging-shape-audit-20260720.md).

## Evidence limits

1. No signed-in staging journey was exercised.
2. Only selected bounded aggregate staging distributions were queried; capped session/diagnostic/runtime-event scans provide lower bounds, not totals.
3. No production data was read.
4. No provider outage, concurrent mutation, token-revocation, or destructive behavior was exercised.
5. The call graph is static and may miss string-dispatched, generated, or externally invoked paths.
6. Passing regex guards establish regression shape, not runtime security or recovery.
7. Static reference counts can overcount generated/proof consumers and undercount externally invoked consumers.
8. CSS liveness analysis is lexical and cannot prove dynamically assembled class names; it is only a candidate generator.

## Coverage gate

The generated domain assignment has no fallback schema tables. All tables, registered functions, alias candidates, HTTP routes, API routes, scheduled jobs, docs, and tracked files have an assigned domain. Assignment proves coverage, not necessity or correct ownership. Semantic conclusions live in the dossiers and findings register.

## Later authenticated identity/session checkpoint

The frozen inventory remains historical truth for the mapping snapshot. A later authorized staging-only implementation slice closed F-001 and F-003 through F-005 without selecting production:

- verified provider subject is the sole account-binding authority;
- one raw browser credential maps to one stored SHA-256 hash and one absolutely expiring server row;
- provider refresh is an in-place, single-owner, revision-checked transition;
- local revocation is authoritative and terminal retention is internal, indexed, scheduled, and capped at 500 rows;
- the staging legacy session index was drained to a separately verified zero state before its schema and compatibility code were deleted.

Current implementation and live acceptance evidence belongs in the later completion receipt, not in the original inventory hashes above.
