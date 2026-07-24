# 13 — Executable CI Baseline — 2026-07-21

## Outcome

F-043 is technically resolved on the isolated staging lane. Canonical `MVP Guards`
and the staging-only `Staging UI Canary` exercise the shipped web artifact instead
of stopping at structural source proofs:

- Node 22 is explicit in the root, web, preview-proxy, and workflow contracts;
- official checkout and setup-node actions are pinned to immutable release SHAs;
- root, web, and preview-proxy clean installs and low-threshold audits are automatic;
- the current 39-step foundation baseline remains the single canonical source/runtime gate and now executes the critical-audit event, account-deletion quarantine, and community-evidence revocation proofs;
- web typecheck, production build, and bundle budget are automatic;
- the anonymous public funnel is exercised in Chromium only after the canonical
  staging marker equals the exact pushed SHA;
- pushes to `main`, `mvp`, and `codex/semantic-platform-staging-20260719`, all pull
  requests, and manual dispatches invoke `MVP Guards`;
- staging-branch pushes also invoke the exact-build browser canary.

The technical proof boundary is complete. Operational enforcement is not: the
current private-repository account plan does not expose branch protection or
repository rulesets that can make successful checks a merge precondition.

## Failure-driven proof

The first staging run proved that the old CI surface was not executable on the
actual runner:

| Evidence | Result |
| --- | --- |
| Code commit | `ad57681a71c1a01f722b42b9130341913642215f` |
| GitHub Actions run | [`29889658888`](https://github.com/Neil-McD/Arx/actions/runs/29889658888) |
| Convex Cut Guard | passed |
| Dependency Audit | passed for all three package graphs |
| Foundation Baseline | failed at canonical account-entitlement authority |

The failure was not an entitlement regression. GitHub's runner had no native
`rg`, so `scripts/rg_compat.mjs` was active. Its ignored `-l` option emitted
matching lines instead of filenames. A forced-fallback local run then exposed the
adjacent empty-stdin defect: an empty pipe incorrectly became a whole-repository
search.

The smallest shared fix made the existing fallback honor `-l` /
`--files-with-matches`, emit each matching file once, preserve match exit status,
and distinguish an empty pipe from absent stdin. No product, authorization,
database, billing, or deployment logic changed.

The corrected acceptance run is exact:

| Evidence | Result |
| --- | --- |
| Code commit | `4cb5adcb1a9bcf088edda937438381d8a6691c7c` |
| GitHub Actions run | [`29889842574`](https://github.com/Neil-McD/Arx/actions/runs/29889842574) |
| Convex Cut Guard | passed in 30 seconds |
| Dependency Audit | passed in 30 seconds; root, web, and preview proxy all clean |
| Foundation Baseline | passed in 1 minute 54 seconds |
| Shipped-web checks | typecheck, production build, and bundle budget all passed |

The forced-fallback local proof also completed all 36 foundation steps. A
controlled bundle-budget negative test with a one-byte index limit failed as
required, proving that the budget step can reject an invalid artifact rather than
only reporting success.

## Exact-build browser canary

The canary is intentionally one mutation-free journey rather than a broad browser
suite:

1. a staging-branch push starts the workflow;
2. the script accepts only `https://polynet-staging.vercel.app` and a full Git SHA;
3. it polls the public build marker for at most five minutes and launches Chromium
   only after `buildId` equals that SHA;
4. a fresh anonymous context loads `/c/polynet` and asserts the Polynet avatar,
   anonymous composer, `Free to join · instant access` policy, and a visible enabled
   `Join now` action;
5. uncaught page/console errors, Polynet or Convex request failures, and first-party
   HTTP 5xx responses fail the job;
6. the canary never clicks Join, starts OAuth, creates membership, or touches billing;
   failures upload only a public-page screenshot, Playwright trace, and redacted
   report for seven days.

The workflow could not rely on `deployment_status` while remaining staging-only:
[GitHub's event contract](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#deployment_status)
requires that workflow file to exist on the default branch. The push trigger plus
exact-marker wait preserves the same causal boundary without a `main` change.

Exact remote evidence:

| Evidence | Result |
| --- | --- |
| Code commit | `e20052215d32de13d14eda2955a2a29d47faf05b` |
| Browser run | [`29890866877`](https://github.com/Neil-McD/Arx/actions/runs/29890866877) |
| Controlled wrong-SHA step | passed; observed `e2005221...` and rejected forty zeroes before browser launch |
| Exact-build browser step | passed in about five seconds |
| Baseline run | [`29890866904`](https://github.com/Neil-McD/Arx/actions/runs/29890866904); all three jobs passed |
| Failure artifacts | the pre-correction browser-adapter failure produced `report.json`, `failure.png`, and `trace.zip`; the corrected successful run produced none |

## Staging and production boundary

- Worktree: `/Users/neilmcdevitt/code/arx/.worktrees/semantic-platform-staging-20260719`
- Branch: `codex/semantic-platform-staging-20260719`
- Vercel staging project: `polynet-staging`
- Staging marker after the browser-canary commit:
  `e20052215d32de13d14eda2955a2a29d47faf05b`
- Production marker remained:
  `a936dee72a65f91723f332779390210e4cf783f0`
- Convex remained bound to `dev:quick-porcupine-949`; no Convex deployment was
  required because the slice changed workflow/package policy, a test, and the
  local search fallback, not deployed Convex runtime behavior.

The staging guard passed before the portability commit. No production selector,
production Convex deployment, `main` push, Vercel production command, migration,
or product-data mutation occurred.

## Enforcement limit

Read-only GitHub API checks for both repository rulesets and `main` branch
protection returned HTTP 403 with the same account-level requirement: upgrade to
GitHub Pro or make the private repository public. Therefore the workflow is
automatic and executable, but it cannot honestly be called a required merge gate
under the current account plan.

## Remaining F-043 work

1. Enable required-check enforcement when the repository account supports it.
2. Keep the browser boundary singular unless a distinct launch risk justifies
   another journey; do not duplicate the foundation baseline.

## Slice score

| Dimension | Score | Evidence |
| --- | ---: | --- |
| Simplicity | 8/10 | one baseline workflow, one staging canary, one Node policy, and one browser journey |
| Scalability | 8/10 | three parallel jobs; no product-runtime work added |
| Reliability | 8/10 | clean installs, audits, baseline, build checks, exact deployment binding, and browser journey run automatically |
| Robustness | 8/10 | controlled marker mismatch, browser/runtime errors, first-party 5xxs, and bounded artifacts have explicit behavior |
| Security | 8/10 | immutable action SHAs, least workflow permissions, strict staging host, no credentials, and no browser mutation |

These scores apply to the executable staging CI boundary. The whole platform does
not inherit them, and F-043 still lacks required-merge enforcement for the external
account-plan reason above.
