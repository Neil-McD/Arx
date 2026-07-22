# 13 — Executable CI Baseline — 2026-07-21

## Outcome

F-043 is partially resolved on the isolated staging lane. Canonical `MVP Guards`
now exercises the shipped web artifact instead of stopping at structural source
proofs:

- Node 22 is explicit in the root, web, preview-proxy, and workflow contracts;
- official checkout and setup-node actions are pinned to immutable release SHAs;
- root, web, and preview-proxy clean installs and low-threshold audits are automatic;
- the 36-step foundation baseline remains the single canonical source/runtime gate;
- web typecheck, production build, and bundle budget are automatic;
- pushes to `main`, `mvp`, and `codex/semantic-platform-staging-20260719`, all pull
  requests, and manual dispatches invoke the workflow.

This is not a full F-043 closure. The smallest critical browser/runtime journey is
not yet in CI, and the current private-repository account plan does not expose
branch protection or repository rulesets that can make successful checks a merge
precondition.

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

## Staging and production boundary

- Worktree: `/Users/neilmcdevitt/code/arx/.worktrees/semantic-platform-staging-20260719`
- Branch: `codex/semantic-platform-staging-20260719`
- Vercel staging project: `polynet-staging`
- Staging marker after the corrected code commit:
  `4cb5adcb1a9bcf088edda937438381d8a6691c7c`
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

1. Add one deterministic critical browser/runtime journey with bounded fixtures
   and useful failure artifacts.
2. Enable required-check enforcement when the repository account supports it.
3. Reassess whether the browser journey belongs in every push or in a smaller
   protected release job; do not duplicate the foundation baseline.

## Slice score

| Dimension | Score | Evidence |
| --- | ---: | --- |
| Simplicity | 8/10 | one workflow, one Node policy, one canonical foundation gate |
| Scalability | 8/10 | three parallel jobs; no product-runtime work added |
| Reliability | 8/10 | clean installs, audits, baseline, typecheck, build, and budget run automatically |
| Robustness | 8/10 | native and no-`rg` environments now share the required search semantics |
| Security | 8/10 | immutable action SHAs, least workflow permissions, and low-threshold audits |

These scores apply to the executable non-browser CI boundary. F-043 and the whole
platform do not inherit a complete 8/10 until the browser journey and required
merge enforcement are real.
