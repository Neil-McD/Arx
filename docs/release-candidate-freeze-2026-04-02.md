# Release Candidate Freeze 2026-04-02

## Intent

Freeze scope for the current release candidate so we can finish validation on the exact thing we intend to ship.

Canonical release-candidate surface:

- `https://polynet-green.vercel.app`

Production promotion rule:

- deploy to production only from a candidate that has passed on `green`

## Current Truth

- `green` is the stable auth-capable staging surface
- workspace and community changes have already been exercised there
- the production release path now blocks on web typecheck via:
  - `npm run check:web-typecheck`
  - `scripts/release_prod.sh`

## Scope Freeze Rules

Allowed changes:

- release blockers found on `green`
- web typecheck fixes required to unblock production
- small QA fixes tied directly to an observed staging issue
- tiny naming or guard-rail fixes that reduce release risk

Not allowed during the freeze:

- broad `App.tsx` refactors
- new architecture tranches
- net-new features
- opportunistic cleanup unrelated to a staging failure or typecheck blocker
- large visual redesigns unrelated to release quality

## Validation Rule

Every change made during freeze must satisfy at least one of these:

1. fixes a real bug observed on `green`
2. fixes a real `check:web-typecheck` production blocker
3. reduces clear release risk without widening scope

If not, it waits until after production.

## Release Criteria

Promote to production only when all of this is true:

1. `green` is stable on the critical user flows
2. `npm run check:web-typecheck` passes
3. the existing required guards pass
4. no known release-blocking regressions remain

## Critical Flows

Workspace:

- open project
- open thread
- send / stop / retry
- refresh / resume

Community:

- chat
- AI Feed
- Resources
- Members
- switch tabs
- switch communities

Auth:

- sign in
- sign out
- member account
- owner account

Platform:

- mobile smoke
- billing / provider connection paths if touched by the candidate

## After Production

After this candidate ships, the next major tranche should target community and shell centralization in `App.tsx`, not more pre-prod workspace reshaping.
