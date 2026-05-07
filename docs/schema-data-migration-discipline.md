# Schema + Data Migration Discipline

Status: active
Scope: Convex schema tightening, field deletions, and runtime-surface cleanup

## 1) Irreducible Rule

Schema cleanup without data cleanup is fake cleanup.

If stored documents still carry a field, deleting that field from the Convex schema can break:

1. `convex dev`
2. codegen
3. watcher health
4. local confidence in whether a route/runtime bug is real

That is exactly the failure mode this worktree already hit.

## 2) Canonical Sequence

Always do schema-field removal in this order:

1. Identify the field(s) to delete.
2. Audit live data to confirm whether those fields still exist in stored docs.
3. Scrub or migrate the live data first.
4. Tighten the schema only after the data is clean.
5. Restart or verify `convex dev` health immediately.
6. Run the relevant checks.

Never invert steps 3 and 4.

## 3) Required Pre-Deletion Questions

Before removing any schema field, answer these:

1. Is this field still present in live Convex documents?
2. Is this field still written anywhere in the runtime or UI?
3. Is this field still read anywhere in the runtime, UI, exports, or docs?
4. If the field disappears from the schema today, will `convex dev` still boot cleanly against the current deployment state?

If any answer is uncertain, audit first. Do not guess.

## 4) Minimum Execution Checklist

For each schema deletion:

1. Search writes:
   - `rg` for the field name across `convex/`, `shared/`, and `apps/web/`
2. Search reads:
   - `rg` for the field name across the same surfaces
3. Inspect live data:
   - sample the relevant table(s)
   - confirm whether legacy rows still carry the field
4. Scrub data:
   - run a one-off internal query/mutation/action or maintenance script
   - remove or normalize the old field values
5. Tighten schema:
   - remove the field from `convex/schema.ts`
   - remove related dead indexes if they exist
6. Verify runtime health:
   - `npm run convex:codegen`
   - confirm `convex dev` becomes healthy
7. Verify behavior:
   - run the relevant contract/build checks

## 5) Failure Signals

If any of these happen immediately after schema cleanup, suspect data drift first:

1. `convex dev` stops becoming healthy
2. routes appear to ignore fresh code changes
3. runtime errors look stale or inconsistent with the current source
4. local debugging starts pointing at the wrong boundary

Do not assume the route is broken until schema/data compatibility is ruled out.

## 6) Deletion Standard

A field is truly deletable only when all three are true:

1. No active code path writes it.
2. No active code path relies on it.
3. Live stored documents have been scrubbed or migrated.

Until then, removing it from the schema is not simplification. It is premature breakage.

## 7) Current Canonical Verification Set

After runtime-surface schema cleanup, use:

1. `npm run convex:codegen`
2. `npm run check:gate-parity`
3. `npm run check:runtime-turn-contract-guard`
4. `npm run build` from `/Users/neilmcdevitt/code/arx`

## 8) Practical Rule

Do not delete fields because the code looks clean.

Delete fields only when:

1. the code is clean
2. the data is clean
3. the watcher is healthy
4. the runtime truth still verifies
