# Dependency Security Closure — 2026-07-21

Status: complete on the isolated semantic-platform staging lane. The original
closure landed at `ef2b0db2537defdd453567f8c063d8d4a3ae1217`; the
2026-07-27 advisory refresh is exact-build accepted at
`3449fb98fa3efd6836bf26153cf92393dd31713b`. The canonical staging web origin
and Convex development deployment were verified. Production was not changed.

## Irreducible requirement

Polynet needs the current Daytona and Blaxel provider capabilities, the web telemetry client, and their reachable runtime dependencies. It does not need known-vulnerable transitive versions, a second provider path, an advisory exception, or a provider-SDK replacement merely to obtain patched descendants.

The smallest sufficient change was therefore:

1. keep the two current, first-party-reachable provider SDKs;
2. force their compatible vulnerable descendants to patched releases;
3. update the web DOMPurify resolution;
4. prove imports, types, product contracts, a production build, and both staging providers;
5. add no schema, data, payment, auth, or product-flow change.

## Frozen baseline

Before remediation, the registry reported:

| Package graph | Critical | High | Moderate | Low | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| root, full and production-only | 1 | 12 | 3 | 1 | 17 |
| `apps/web` | 0 | 0 | 0 | 1 | 1 |
| `apps/preview-proxy` | 0 | 0 | 0 | 0 | 0 |

The root advisory paths descended through `@daytona/sdk@0.192.0` and `@blaxel/core@0.2.94`. Both are protected, current runtime dependencies with dynamic first-party import paths in Convex. Deleting either SDK would delete required capability, not debt.

## Reachability and disposition

| Surface | Ground truth | Decision |
| --- | --- | --- |
| Daytona client and `axios` | Called by the Daytona runtime-target actions | `KEEP`; patch descendant |
| Daytona `tar` object-storage path | Not called by the current Polynet Daytona path, but installed under the retained SDK | `KEEP` transitively; patch rather than grant an exception |
| Daytona `shell-quote` image path | Not called by the current Polynet runtime path, but part of the retained SDK import graph | `KEEP` transitively; patch |
| Daytona OpenTelemetry family | Optional and currently disabled in staging, but import-compatible with the retained SDK | `KEEP` transitively; patch the peer family in lockstep |
| Blaxel client and `axios` | Called by workspace operations | `KEEP`; patch descendant |
| Blaxel MCP/Hono and code-generation descendants | Installed by the retained SDK; not first-party runtime call paths today | `KEEP` transitively; patch rather than fork the SDK |
| Web DOMPurify | Installed through the retained PostHog graph | `KEEP`; update resolution |
| Provider SDK replacement or duplicate adapter | No requirement justified it | `DELETE` as a proposed requirement; not implemented |
| Advisory allowlist | No exception was necessary | `DELETE` as a proposed requirement; not implemented |

## Exact compatible resolutions

The provider SDK versions remain unchanged. Root overrides now resolve the affected descendants to:

- `axios@1.18.1`
- `@modelcontextprotocol/sdk@1.29.0`
- `@hono/node-server@2.0.11`
- `body-parser@2.3.0`
- `brace-expansion@5.0.8`
- `fast-uri@4.1.1`
- `js-yaml@5.2.1`
- `protobufjs@8.7.1`
- `shell-quote@1.10.0`
- `tar@7.5.21`
- OpenTelemetry `0.221.0` / `2.10.0` peer families

The web lock resolves `dompurify@3.4.12`.

One structural Daytona proof had encoded a formatter-sensitive single-space expression. Its matcher now accepts equivalent whitespace; the protected runtime invariant and runtime code did not change.

## 2026-07-27 advisory refresh

Canonical CI correctly reopened this boundary when the registry published
`GHSA-mh99-v99m-4gvg` against `brace-expansion<=5.0.7`. The root graph exposed
the advisory through the retained
`@blaxel/core@0.2.94 -> archiver@7.0.1 -> minimatch` lineage. The independent
web graph exposed it through
`@sentry/vite-plugin@5.3.0 -> glob@13.0.6 -> minimatch@10.2.5`.

The smallest compatible correction changes the existing root override from
`brace-expansion@2.1.2` to patched `5.0.8`, adds the same exact override to the
web graph, and refreshes only those two locks. Blaxel, Archiver, Sentry, and
Glob remain unchanged. An `archiver@8.0.0` override was tested and rejected
before commit: Archiver 8 exports ESM classes rather than the callable default
consumed by both the CommonJS and ESM Blaxel builds.

A fresh install and low-threshold audit report zero vulnerabilities for root
and web; the unchanged preview-proxy graph remains clean. The root tree resolves
both Blaxel archive-path matchers,
`minimatch@9.0.9` and `minimatch@5.1.9`, to `brace-expansion@5.0.8`.
A separate web tree resolves `minimatch@10.2.5` to the same patched release.
A direct behavior proof creates a directory fixture and successfully streams
the ZIP through the same `archive.directory(buildDir, false)` operation used by
Blaxel. The Blaxel lifecycle and three-graph package-boundary proofs, web
typecheck, production build, bundle budget, and complete 40-step foundation
baseline also pass. The exact lock-and-behavior proof now runs in the canonical
Dependency Audit job after the root clean install.

The refresh committed through `4f615485c6d56c75fdcf80199b38f088f089d05e`
and the hoist-independent Blaxel-boundary proof correction
`3449fb98fa3efd6836bf26153cf92393dd31713b`. Canonical staging serves the
latter as build ID and Sentry release. Exact-SHA MVP Guards run `30272659669`
passed all three audits, the compatibility interlock, 40-step baseline, Convex
cut guard, web typecheck/build, and bundle budget; staging UI canary run
`30272659581` passed its controlled mismatch and anonymous funnel checks. A
signed-in chat/resources/member-agent reload produced no browser warnings or
errors. This refresh is deployed and accepted on canonical staging.

## Verification receipt

Local verification from fresh `npm ci --ignore-scripts` installs:

- root audit: zero vulnerabilities across every severity;
- web audit: zero vulnerabilities across every severity;
- preview-proxy audit: zero vulnerabilities across every severity;
- Convex TypeScript: pass;
- web TypeScript: pass;
- production web build: pass;
- full 36-step foundation baseline: pass;
- Blaxel workspace lifecycle accounting proof: pass;
- Daytona tool-role, direct-runtime, preview-security, preview-deduplication, computer-use, and screenshot-bridge proofs: pass;
- root `git diff --check`: pass.

Staging release receipt:

- Git branch: `codex/semantic-platform-staging-20260719`;
- code commit: `ef2b0db2537defdd453567f8c063d8d4a3ae1217`;
- Convex: `dev:quick-porcupine-949`, functions ready after the guarded deploy;
- web: `https://polynet-staging.vercel.app`, root `200`, build marker exactly `ef2b0db2537defdd453567f8c063d8d4a3ae1217`;
- deployed Blaxel diagnostic: `ok: true`, SDK import and required exports present, no sandbox created;
- live Daytona bounded smoke: created one temporary sandbox, started/stopped computer use, returned a compressed screenshot, and cleaned the sandbox with no cleanup warning;
- production marker remained `a936dee72a65f91723f332779390210e4cf783f0`.

## Honest residuals

This closes the observed advisory set; it does not make dependency risk permanently zero.

- `npm ci` still emits non-advisory deprecation warnings for `@hey-api/client-fetch@0.10.2` and `glob@10.5.0`. They are upstream transitive hygiene debt, not a reason to replace reachable provider capability inside this slice.
- The legacy Daytona stage-identity proof is hard-coded to obsolete June worktree names. The canonical semantic-platform staging guards pass; the obsolete proof is a deletion/consolidation candidate under F-044.
- Root/web/preview audits, web typecheck, production build, and bundle budget now run automatically in canonical CI. Provider smoke remains a staging/release proof; a critical browser journey and account-supported required-check rules remain open under F-043.
- Existing large web bundles remain F-040/F-043 debt and were not increased or redesigned here.

## Slice score

| Dimension | Score | Evidence |
| --- | ---: | --- |
| Simplicity | 8/10 | retained one provider path per provider; no fork, shim, or advisory exception |
| Scalability | 8/10 | no new runtime path or asymptotic work; existing build remains valid |
| Reliability | 8/10 | clean installs, typechecks, full baseline, build, and provider smokes pass |
| Robustness | 8/10 | optional and currently unused installed paths were patched too; no reachability gamble |
| Security | 8/10 | all three package graphs report zero advisories and exact staging runtime imports pass |

These scores apply to this dependency-security boundary, not to the whole platform. The platform cannot honestly inherit them until CI continuously enforces the real gates and the remaining money, lifecycle, recovery, and security findings close.

## Next causal slice

Finish F-043 with one bounded critical browser/runtime journey and enable required-check enforcement when the repository account supports it. The audit, web typecheck, production build, and bundle budget are already automatic and should not be duplicated. Only after that smallest remaining proof should work return to the remaining U-017 money-event convergence.
