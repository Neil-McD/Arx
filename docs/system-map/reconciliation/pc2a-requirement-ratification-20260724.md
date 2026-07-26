# PC2A Requirement Ratification — 2026-07-24

- Status: `COMPLETE`
- Scope: six decisions from the PC1A decision gate
- Staging source: `9331f446b47285b1b14ddd6d04998e683f0184de`
- Branch: `codex/semantic-platform-staging-20260719`
- Upstream relation at execution: `0 ahead / 0 behind`
- Production documents or rows read: none
- Product code, schema, data, provider, deployment, and production changes:
  none

## 1. Purpose

PC2A removes requirement ambiguity before compatibility engineering. It decides
which product outcomes survive, not which staging commits should be merged.

The classifications below apply to the named semantic job only:

- `KEEP` retains a product outcome;
- `DROP FROM PORT` excludes staged implementation from production integration;
- `REWORK` retains the requirement but reduces or redesigns its release shape;
- `ALREADY PRESENT` protects current production behavior.

No classification authorizes physical deletion or release.

## 2. Ratified decisions

| ID | Ratified requirement | Integration classification | Required consequence |
| --- | --- | --- | --- |
| P14 | Keep destructive account/community quarantine and the declarative ownership/privacy policy. Do not treat the unused account request/preflight/receipt substrate as an MVP requirement. | `DROP FROM PORT` for the two unused lifecycle tables and internal mutations; park them on staging pending a real user/legal owner. | Do not expand a generic workflow engine. Authored-content purge remains interaction-specific. Any later staging deletion needs a separate clean proof. |
| P01/P02 | Production does not need semantic-staging deployment machinery, frozen inventories, or one-off audit tooling. It does need compact current contracts and receipts. | P01 `DROP FROM PORT`; P02 `REWORK`. | Keep staging guards on the staging lane. Port only the minimum durable contracts/receipts needed to explain a retained release unit. |
| P04 | Builder Partner remains a secondary capability under prospective 4% community-revenue-only economics. Historical obligations keep their original policy and rate basis. | `REWORK`; sequence `PLANNED_LAST`. | Do not make Builder Partner a primary MVP journey, restore paid-tool commission, or rewrite historical ledgers. |
| P17 | Keep the weekly community digest as an MVP return loop, including short current canonical excerpts. | `REWORK`. | Delete legacy/featured readers and durable content copies. Queue only canonical lookup coordinates, reauthorize and render at send, then minimize the terminal receipt. |
| P23 | No permanent malformed-trace cleanup runtime is required. | `DROP FROM PORT`. | Ask only the bounded PC4 production-data question. If production has no affected rows, do nothing; if rows exist, use a separately authorized disposable cleanup. |
| M01 | Current production CRIS theme, community-event, chrome, and embed behavior must survive reconciliation. | `ALREADY PRESENT`. | Every candidate must preserve or intentionally reimplement this behavior. The long-lived staging branch must never overwrite it wholesale. |

## 3. Elon reduction result

| Challenged requirement | Idiot index | Result |
| --- | ---: | --- |
| Ship staging deployment machinery to production. | 9 | Delete from the port. |
| Ship frozen snapshots and one-off audit machinery with product code. | 9 | Delete; keep compact durable truth only. |
| Build a generic lifecycle engine before a concrete owned flow exists. | 8 | Delete the requirement. |
| Make Builder Partner a primary launch gate or restore old economics. | 9 | Delete the requirement. |
| Delete the weekly digest because legacy readers are stale. | 8 | Delete the coupling, not the retention job. |
| Persist chat text in email to prove the digest still exists. | 9 | Delete the content-copy requirement; counts and links retain the job. |
| Port a temporary cleanup function permanently. | 10 | Delete the code requirement; retain only the later data question. |
| Allow staging to replace current production-only UX behavior. | 10 | Forbidden. |

## 4. Downstream gates

1. P14 does not authorize deleting the staged lifecycle substrate. PC2B may
   classify it as a staging cleanup candidate, but physical deletion requires
   an isolated proof that no retained test, external client, or planned release
   unit owns it.
2. P17 retains email as an MVP capability but does not pre-authorize the
   C2.3B2 future-copy prevention code candidate.
3. P23 authorizes no production query. PC4 will derive the smallest bounded,
   redacted probe from the final schema delta.
4. P04 remains last and cannot block earlier core MVP compatibility work.
5. M01 is a preservation constraint on every future release unit, not a request
   to copy production code into staging.

## 5. Acceptance and limitations

PC2A is complete because:

- all six PC1A questions now have one explicit requirement result;
- product outcomes are separated from staged implementations;
- every retained outcome has a downstream owner or gate;
- no protected core was classified for deletion;
- no compatibility, production-data, or release claim was inferred;
- the historical PC1A ledger remains unchanged.

This receipt does not complete PC2. The remaining PC1A preliminary results still
need one final requirement/deletion matrix.

## 6. Next bounded slice

`PC2B` should ratify the remaining P03-P13, P15-P22, and P24-P27 preliminary
results into one complete matrix with:

1. exact MVP owner;
2. requirement disposition;
3. primary compatibility classification;
4. production-data dependency;
5. protected-core constraint;
6. next proof phase.

PC2B remains documentation-only. It must not begin PC3 source/schema
compatibility, PC4 production queries, or C2 implementation.
