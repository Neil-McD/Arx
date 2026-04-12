# Production Baseline Fingerprint Worksheet

## Purpose

This worksheet exists to answer one question cleanly:

- What is the exact current production baseline we need `origin/main` to match?

It is not a feature plan.
It is not a cleanup list.
It is a proof artifact.

## First Principles

Production truth has only four layers:

1. Web artifact truth
2. Backend truth
3. Config truth
4. Behavior truth

If those four layers agree, the baseline is known.
If they diverge, reconciliation is required before normal Git-based releases are trustworthy.

## Rules

- Do not assume current Daytona equals current production.
- Do not assume `origin/main` equals current production.
- Env presence is supporting evidence only. It is not proof that a feature is live.
- One signal is never enough. Use provenance + artifact + behavior together.
- Treat web and Convex as separate production layers.

## Comparison Targets

Every signal should be checked against three states:

- `Prod`: the currently promoted production system
- `Daytona`: the current `/Users/neilmcdevitt/code/arx/.worktrees/daytona` state
- `origin/main`: a clean build from GitHub truth

## Current Known Facts

These are already established:

- Recent Vercel `polynet` production deployments were `source: "cli"`, not GitHub-triggered.
- `origin/main` is stale relative to current live web.
- Current Daytona is Daytona-lineage for the live app, but it is not byte-identical to current live production.
- Sentry web is live in production.
- Convex structured backend logging is live in production.
- PostHog is not live in current production web.
- PostHog Vercel env vars exist, but env presence alone does not make the feature live.

## Decision Output

At the end of this worksheet, every row should fall into one of three buckets:

- `Definitely live`
- `Definitely not live`
- `Ambiguous`

The reconciliation target is:

- the smallest Daytona-backed baseline that matches `Definitely live`
- without dragging in `Definitely not live`

---

## 1. Web Provenance Fingerprint

These rows establish where the live web artifact came from.

| Signal | Prod | Daytona | origin/main | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| Deployment source | `cli` | n/a | Git | Known | Recent `polynet` prod deploys were CLI-sourced |
| Deployment timestamp | `2026-04-11T17:37:10.688-04:00` | n/a | build-time only | Known | Latest promoted prod deploy `dpl_GRufKgcVHsFTEkurWGuNsJZ4FpJk` |
| Deployment id / URL | `dpl_GRufKgcVHsFTEkurWGuNsJZ4FpJk` / `polynet-gn3rpiuzt-neil-mcds-projects.vercel.app` | n/a | n/a | Known | Current promoted web artifact |
| Git ref in deploy metadata | not exposed on latest promoted deploy; older prod deploys show `codex/daytona-deploy-prep-20260319` | `codex/daytona-deploy-prep-20260319` | `main` | Partial | Latest prod metadata is thinner, but prior promoted CLI deploys tie prod lineage to Daytona branch |
| Git SHA in deploy metadata | not exposed on latest promoted deploy; older prod deploys show `79364488bf305355ea037c05bef45e74e6fa9879` | `79364488bf305355ea037c05bef45e74e6fa9879` | `3b8aafa0a33663c394a07454b3f09dd7cd408aa7` | Partial | Current prod is clearly not `origin/main` lineage |
| `gitDirty` flag | not exposed on latest promoted deploy; older promoted CLI deploys show `gitDirty: 1` | current tree dirty | clean worktree possible | Partial | Strong evidence that recent prod lineage came from dirty local state |

### Notes

- If prod provenance points to CLI + dirty state, `origin/main` cannot be assumed authoritative.
- If prod provenance points to Daytona branch lineage, Daytona is the likely reconciliation source, but not automatically the exact baseline.

---

## 2. Web Artifact Fingerprint

These rows establish whether the built web outputs actually match.

| Signal | Prod | Daytona | origin/main | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| Entry JS chunk name | `index-DwHX63cJ.js` | `index-BFor_jF8.js` | `index-C7Ni_x-O.js` | Known | All three differ |
| Entry CSS chunk name | `index-C1bKnXh9.css` | `index-C1bKnXh9.css` | `index-B7fMDFBC.css` | Known | Prod and Daytona share CSS entry; `origin/main` does not |
| Shared vendor JS chunk names | `convex-vendor-3zStZIj6.js`, `highlight-vendor-CX2P6ZWC.js`, `react-vendor-Dj0NeY5T.js`, `ui-vendor-Bk0NFgte.js`, `vendor-DTG-Oh3V.js` | `convex-vendor-9O7LCoDF.js`, `highlight-vendor-pPVeYRQR.js`, `react-vendor-D4yGots9.js`, `ui-vendor-BWFEBrnI.js`, `vendor-B7wLLZEI.js` | `highlight-vendor-DAJG2eeT.js`, `react-vendor-_SHCnkGO.js`, `vendor-YswLjPnY.js` | Known | Daytona is close in shape to prod; `origin/main` is materially older |
| Shared vendor CSS chunk names | `highlight-vendor-BEHUn5zE.css`, `vendor-CIHdCL6t.css` | `highlight-vendor-BEHUn5zE.css`, `vendor-CIHdCL6t.css` | `highlight-vendor-BEHUn5zE.css` only | Known | Daytona is closer to prod than `origin/main` |
| Asset manifest parity | `prod vs Daytona = close but different`; `prod vs origin/main = different` | `close but different` | `different` | Known | Prod shares 3 CSS/assets with Daytona and only 1 with `origin/main` |
| Build contains Sentry strings | `yes` | `yes` | likely `no` | Partial | Sentry is definitely live |
| Build contains PostHog strings | `no` | `yes` | `no` | Known | Strong proof that current Daytona is ahead of prod |
| Build contains canary event `builder checkout started` | `no` | `yes` | `no` | Known | PostHog canary |
| Build contains canary event `workspace credit topup started` | `no` | `yes` | `no` | Known | PostHog canary |
| Build contains canary event `community join request sent` | `no` | `yes` | `no` | Known | PostHog canary |

### Web Canary Strings

Use these strings as quick proof points:

- `posthog`
- `builder checkout started`
- `workspace credit topup started`
- `community join request sent`
- Sentry init strings if needed

### Notes

- Matching CSS alone is not enough.
- Matching JS chunk names alone is not enough.
- Presence or absence of a few targeted canaries is often the fastest truth test.

---

## 3. Backend Provenance Fingerprint

These rows establish what is live in Convex production.

| Signal | Prod | Daytona | origin/main | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| Latest Convex production deploy timestamp | Fill | n/a | n/a | Open | Record actual deploy time |
| Structured error logging live | `yes` | `yes` | likely `no` | Partial | Explicitly deployed to Convex prod |
| Join request cancel fix live | Fill | yes in Daytona | Fill | Open | Verify by code and production behavior |
| Remove member id-contract fix live | Fill | yes in Daytona | Fill | Open | Verify by production behavior |
| Stripe live key config active | `yes` | env-backed | n/a | Partial | Backend config truth only |

### Notes

- Web truth and Convex truth can be on different baselines.
- Reconciliation should not collapse them into one undifferentiated “prod state.”

---

## 4. Config Fingerprint

These rows are supporting evidence only.

| Signal | Prod | Daytona | origin/main | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| Vercel Sentry envs present | `yes` | n/a | n/a | Known | Supports live Sentry |
| Vercel PostHog envs present | `yes` | n/a | n/a | Known | Does not prove PostHog is live |
| Convex Stripe live envs present | `yes` | n/a | n/a | Known | Supports live billing path |
| PostHog host/key reflected in live bundle | `no` | `yes` | `no` | Known | Env exists, feature not deployed |

### Notes

- Config can prove possibility.
- Only built artifacts and behavior can prove actuality.

---

## 5. Behavior Fingerprint

This is the human-facing parity checklist.

Mark each row with:

- `Prod works`
- `Prod absent`
- `Prod broken`
- `Unknown`

Then compare Daytona and `origin/main` against that known production outcome.

| Behavior canary | Prod | Daytona | origin/main | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| Auth/session bootstrap | `Prod works (guest shell + sign-in gate visible)` | expected yes | Fill | Partial | Clean browser shows guest thread shell and sign-in CTA without errors |
| Join request send | `Prod reaches correct auth boundary` | expected yes | Fill | Partial | `/c/eoncity` loads and `Join now` opens sign-in gate in clean browser |
| Join request cancel | `Unknown` | Fill | Fill | Open | Requires authenticated pending-request state |
| Remove member | `Unknown` | Fill | Fill | Open | Requires authenticated admin state |
| Workspace send/run | `Prod works for guest public chat surface` | expected yes | Fill | Partial | Guest prompt send returned a model response without console errors |
| Preview load | `Unknown` | Fill | Fill | Open | Requires authenticated workspace/preview context |
| Builder checkout opens live Stripe | `Unknown from clean guest browser; auth gate works` | expected yes | Fill | Partial | Guest flow reaches sign-in gate cleanly; authenticated Stripe handoff still unverified |
| Workspace top-up opens live Stripe | `Unknown` | expected yes | Fill | Open | Requires authenticated workspace state |
| Sentry captures frontend smoke error | `yes` | expected yes | `no` unless reconciled | Known | Strong live canary |
| PostHog events appear in PostHog | `no` | local only until deploy | `no` | Known | Strong not-live canary |

### Notes

- Behavior canaries matter because provenance and assets can still miss runtime/config interactions.
- Use only high-signal flows that distinguish meaningful baselines.

---

## 6. Bucketed Classification

Use this section only after the tables above are filled.

### Definitely live

- Sentry web
- Convex structured backend logging
- Latest promoted web deploy is Daytona-lineage, not `origin/main`
- Add rows as proven

### Definitely not live

- PostHog web analytics
- Git-based web release workflow cleanup as release truth
- Add rows as proven

### Ambiguous

- Any Daytona-backed changes that cannot yet be proven by provenance, artifacts, or behavior

---

## 7. Reconciliation Decision Rules

### Rule 1

If prod matches Daytona on nearly all high-value web rows, Daytona is the right reconciliation source.

### Rule 2

If Daytona contains canaries prod clearly lacks, Daytona is ahead of prod and cannot be pushed wholesale without review.

### Rule 3

If `origin/main` lacks canaries prod clearly has, `origin/main` is stale and cannot be used as the baseline directly.

### Rule 4

If a row is ambiguous, do not let it silently hitch a ride into reconciliation. Either prove it or exclude it.

---

## 8. Expected Outcome

The most likely result is:

- `Prod web` = older Daytona-derived snapshot
- `Prod Convex` = newer explicit backend deploys
- `origin/main` = stale
- `Current Daytona` = closest source, but ahead of prod in at least PostHog and possibly more

If that remains true after the worksheet is filled, the correct move is:

1. Reconcile the proven live baseline to `origin/main`
2. Restore Git-based web deploy truth
3. Layer PostHog and any other not-yet-live Daytona changes on top afterward

---

## 9. Evidence Log

Record raw evidence here as it is gathered.

### Vercel production deploy evidence

- Latest promoted prod deploy:
  - id: `dpl_GRufKgcVHsFTEkurWGuNsJZ4FpJk`
  - source: `cli`
  - target: `production`
  - promoted: `READY`
  - created: `2026-04-11T17:37:10.688-04:00`
  - url: `polynet-gn3rpiuzt-neil-mcds-projects.vercel.app`
- Recent prior promoted prod deploys were also `source: "cli"`.
- Older promoted prod deploys include:
  - `gitCommitRef: codex/daytona-deploy-prep-20260319`
  - `gitCommitSha: 79364488bf305355ea037c05bef45e74e6fa9879`
  - `gitDirty: 1`

### Live production asset evidence

- Live assets from `https://www.polynet.ai`:
  - `convex-vendor-3zStZIj6.js`
  - `highlight-vendor-BEHUn5zE.css`
  - `highlight-vendor-CX2P6ZWC.js`
  - `index-C1bKnXh9.css`
  - `index-DwHX63cJ.js`
  - `react-vendor-Dj0NeY5T.js`
  - `ui-vendor-Bk0NFgte.js`
  - `vendor-CIHdCL6t.css`
  - `vendor-DTG-Oh3V.js`
- Live main bundle string checks:
  - `posthog`: `False`
  - `builder checkout started`: `False`
  - `workspace credit topup started`: `False`
  - `community join request sent`: `False`

### Daytona local build evidence

- Daytona `HEAD`: `79364488bf305355ea037c05bef45e74e6fa9879`
- Daytona local build assets:
  - `CommunityFunnelSurface-DAv8Ehgm.js`
  - `WebChatgptConnectModal-B5n9CNUF.js`
  - `WebCommunitySecondaryPanels-BhbiH-zq.js`
  - `WebCreateCommunityModal-8Rar7BX4.js`
  - `WebCreateProjectModal-D-12MRcj.js`
  - `WebDeleteCommunityModal-B-FkusvF.js`
  - `WebDeleteProjectModal-BTUVptV_.js`
  - `WebInferenceIssueModal-6CoOYpzs.js`
  - `WebMemoryImportModal-Ccs36can.js`
  - `WebPublicCommunityFunnel-i5dXVtsu.js`
  - `WebSettingsPanels-C2Qq7gNM.js`
  - `WebStandalonePublicRouteView-CueUzNYv.js`
  - `convex-vendor-9O7LCoDF.js`
  - `highlight-vendor-BEHUn5zE.css`
  - `highlight-vendor-pPVeYRQR.js`
  - `index-BFor_jF8.js`
  - `index-C1bKnXh9.css`
  - `react-vendor-D4yGots9.js`
  - `ui-vendor-BWFEBrnI.js`
  - `vendor-B7wLLZEI.js`
  - `vendor-CIHdCL6t.css`
- Daytona main bundle string checks:
  - `posthog`: `True`
  - `builder checkout started`: `True`
  - `workspace credit topup started`: `True`
  - `community join request sent`: `True`

### Clean `origin/main` build evidence

- `origin/main`: `3b8aafa0a33663c394a07454b3f09dd7cd408aa7`
- Clean `origin/main` build assets:
  - `highlight-vendor-BEHUn5zE.css`
  - `highlight-vendor-DAJG2eeT.js`
  - `index-B7fMDFBC.css`
  - `index-C7Ni_x-O.js`
  - `react-vendor-_SHCnkGO.js`
  - `vendor-YswLjPnY.js`
- `origin/main` main bundle string checks:
  - `posthog`: `False`
  - `builder checkout started`: `False`
  - `workspace credit topup started`: `False`
  - `community join request sent`: `False`

### Convex production evidence

- Structured backend logging was explicitly deployed to Convex production after validation.
- Web and Convex remain on separate release histories until Git truth is restored.

### Manual behavior checks

- Sentry frontend smoke test was captured successfully in production.
- PostHog is absent from the current live production web bundle.
- Clean guest browser at `https://www.polynet.ai` shows:
  - `Guest thread`
  - sign-in CTA
  - no console errors
- Guest prompt send on production succeeded:
  - prompt: `Say hello in one word.`
  - response rendered: `Hello`
  - no console errors
- `https://www.polynet.ai/discover` loads and shows at least one live community:
  - `Eon City`
  - slug text `/eoncity`
- Community route `https://www.polynet.ai/c/eoncity` loads successfully in clean browser.
- Clicking `Join now` on `/c/eoncity` in clean guest state opens the expected sign-in gate:
  - `Save chats and continue across devices`
  - `Continue with Google`
  - no console errors
- Clicking `Become a Builder` then `Upgrade to Builder` in clean guest state opens the expected sign-in gate instead of failing.
- Remaining behavior rows still require explicit authenticated/admin parity confirmation:
  - join request cancel
  - remove member
  - preview load
  - live Stripe checkout completion path
  - workspace top-up path
