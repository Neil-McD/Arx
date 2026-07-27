# C9 Operational Recovery Contract v1

Status: `C9.0 SOURCE CONTRACT`

Baseline: canonical semantic-platform staging commit
`a9d75eece959139cd194c66bca5045b950bff448`

This contract defines what recovery must mean before Polynet creates, imports,
or restores any product-data backup. It authorizes no backup, import, restore,
deployment, environment change, provider effect, production read, production
write, or destructive cleanup.

## 1. Irreducible job

Recovery has four physically necessary responsibilities:

1. preserve irreplaceable product data and file storage inside an accepted loss
   window;
2. reconstruct code and control-plane configuration from separately owned
   authority;
3. reconcile restored projections with current external-provider truth; and
4. reopen reads, writes, and external effects only after their distinct safety
   gates pass.

A Git or Vercel rollback is code recovery, not product-data recovery. A Convex
snapshot is product-data input, not a complete recovered system.

## 2. Current ground truth

The canonical C9 staging lane remains:

- worktree:
  `/Users/neilmcdevitt/code/arx/.worktrees/semantic-platform-staging-20260719`;
- branch: `codex/semantic-platform-staging-20260719`;
- Vercel project and origin: `polynet-staging` and
  `https://polynet-staging.vercel.app`;
- Convex deployment: `dev:quick-porcupine-949`; and
- production authority: `origin/main`, Vercel project `polynet`, and the
  repository's production Convex deployment.

The schema currently declares 123 application tables and seven fields that
reference Convex file storage. Source declares 24 recurring cron registrations
and 46 direct scheduler call sites across 27 modules. The repository contains
no product-data backup workflow, restore executor, periodic-backup
configuration contract, accepted restore receipt, or timed recovery runbook.

The account Settings CSV exports are bounded user-portability projections.
They do not contain all canonical tables or file storage, preserve relational
identity for import, or implement a restore path. The existing Blaxel lifecycle
probe proves cold sandbox recreation from a surviving durable volume; it does
not prove recovery after that volume is lost.

Convex supports consistent table snapshots with optional file-storage content.
Its backup does not include deployed code, environment variables, or pending
scheduled functions. Restoring or replacing deployment data is destructive.
Those provider facts must be reverified against current official documentation
before every drill that depends on them.

The actual staging and production backup configuration is `UNKNOWN`. C9.0 does
not infer plan, cadence, retention, last-success time, or file-storage inclusion
from provider capability. A names-only/metadata-only operator audit must record
that truth before C9.1.

## 3. Recovery state classes

The executable structural contract lives in
`convex/operationalRecoveryPolicy.ts`. It classifies every current table exactly
once:

| Post-restore disposition | Tables | Meaning |
| --- | ---: | --- |
| `restore_and_validate` | 57 | irreplaceable product/governance state remains unavailable until domain invariants pass |
| `restore_then_reconcile_external` | 38 | provider/effect state stays quarantined until current external truth and idempotency reconcile |
| `restore_then_revoke_or_expire` | 12 | sessions, presence, leases, OAuth state, upload claims, and terminal sessions cannot become active from snapshot age alone |
| `rebuild_or_validate_projection` | 12 | derived projections cannot outrank their canonical source |
| `retain_quarantined_evidence` | 4 | audit/lifecycle evidence may explain the incident but cannot grant authority or trigger an effect |

This is a conservative table-level default. A later drill may prove that a
specific field needs a stricter override. It may never weaken a disposition
merely to make a restore pass.

All seven `_storage` references are separately named at table/field granularity.
Six require the referenced blob and ownership lineage to validate together.
The restored upload-ticket claim is instead expired and quarantined; its blob
may be retained or removed only after canonical attachment ownership is
checked.

## 4. Scheduled-work boundary

Pending Convex scheduled functions are not assumed to survive a backup. C9
therefore treats the row or source event—not the pending scheduler record—as
recovery authority.

Every current cron and scheduler-calling module has one of four dispositions:

- `maintenance_restarts_from_source`;
- `reconcile_before_external_effect`;
- `reconstruct_from_durable_rows`; or
- `expire_or_finalize_stale_work`.

The contract proof fails when a cron is added, removed, or renamed; a scheduler
call site or owner module changes; or any registered family lacks recovery
ownership.

Recovery must not manufacture a generic replay queue. A retained domain may
resume work only from its canonical durable intent, idempotency key, current
eligibility, and effect receipt.

## 5. Provider boundaries

| Provider/control plane | Recovery rule |
| --- | --- |
| Convex | restore database and included file storage; recreate source, schema, functions, crons, auth configuration, and environment separately |
| GitHub/Vercel | rebuild exact web delivery from Git authority; never represent a web rollback as data recovery |
| Stripe | re-read subscription, checkout, refund, dispute, settlement, customer, Connect, and payout truth before access or money effects resume |
| identity provider | invalidate or revalidate restored sessions and authorization state before authenticated reads |
| email provider | reconcile delivery receipts and dedupe before any restored outbox item sends |
| source OAuth providers | revalidate credentials or require reconnect; restored tokens do not prove provider authorization |
| Blaxel | compare current volume/sandbox inventory with `cloudProjects`; cold sandbox recreation does not prove lost-volume recovery |
| Daytona | expire or reconcile restored target pointers; pointer presence does not prove provider liveness |
| model providers | resume only sponsored, quota-valid, idempotent durable work |
| Fly preview proxy | recreate the stateless service from source and configuration; it is not a product-data store |

Environment values, deploy credentials, backup archives, and provider secrets
must never enter Git, proof output, browser artifacts, or the execution
contract. C9.0 records required names/owners and external escrow responsibility,
not values.

## 6. Staging-drill objectives

The first measurements use these accepted staging targets:

| Objective | Target | Boundary |
| --- | ---: | --- |
| database and file-storage RPO | no more than 24 hours | snapshot time to the latest state the recovery can truthfully preserve |
| authenticated core-read RTO | no more than 4 hours | incident declaration to validated authenticated reads |
| full write/effect RTO | no more than 8 hours | incident declaration to explicitly reopened writes and external effects |

These targets are measurement hypotheses, not a production SLA. C9.2 must
measure them. If provider-native daily backup cannot meet them, the result is a
failed target and a decision point—not permission to invent continuous
replication silently.

## 7. Recovery state machine

The order is non-negotiable:

1. `detect_and_scope`;
2. `freeze_writes_and_external_effects`;
3. `preserve_forensic_snapshot`;
4. `restore_known_code_and_configuration`;
5. `restore_data_into_isolated_target`;
6. `validate_structural_and_product_invariants`;
7. `reconcile_external_provider_truth`;
8. `enable_authenticated_reads`;
9. `enable_writes`; and
10. `enable_external_effects`.

Each transition needs one named human authority, timestamp, exact target,
evidence receipt, stop condition, and rollback/roll-forward decision. Reads,
writes, and external effects are separate reopen gates.

No current runtime recovery mode implements this state machine. That remains a
candidate C9.3 change only after the isolated restore drill proves which gates
are physically necessary.

## 8. Privacy and destructive-lifecycle boundary

Restoring an older snapshot can reintroduce data that was later revoked,
anonymized, expired, or purged. Backup retention may preserve inaccessible
historical copies for a bounded period, but recovery must not reactivate them.

Account and community destructive execution remains quarantined under C2.
Therefore C9 may prove staging recovery now without implementing a deletion
executor. Before self-service destruction resumes, C2 must define the durable
post-snapshot revocation/privacy-replay authority and backup-expiration
behavior. C9 records that dependency and does not duplicate C2.

## 9. Slice sequence

### C9.0 — Contract and configuration truth

- complete table/storage/scheduled-work/provider coverage;
- accept staging measurement targets;
- record provider backup configuration through a separately authorized
  metadata-only audit;
- own freeze/reopen phases and forbidden actions; and
- add one non-mutating proof to the canonical baseline.

### C9.1 — Staging backup integrity

- create one staging backup including file storage;
- keep the archive only in temporary protected storage;
- record timestamp, size, checksum, table manifest, and storage inclusion;
- expose no data values; and
- remove the local artifact after its receipt.

### C9.2 — Disposable isolated restore

- restore into a disposable, access-controlled non-production deployment;
- provide no outbound provider secrets;
- prove identifiers, references, files, authority invariants, and domain
  integrity;
- measure RPO/RTO components; and
- delete the disposable target only with explicit authorization.

### C9.3 — Recovery-safe boot and reconciliation

Add only drill-proved necessities: freeze/recovery mode, session invalidation,
provider reconciliation, effect replay protection, stale-work expiration,
scheduled-work reconstruction, and privacy/revocation replay boundaries.

### C9.4 — Timed game day and runbook closure

Execute the owned runbook from a clean operator context, measure accepted
targets, reopen reads/writes/effects separately, confirm exact build and
deployment truth, and record any failure honestly.

## 10. C9.0 exit and non-goals

C9.0 is source-complete only when:

- current schema, storage references, crons, and scheduler call sites have
  complete exact coverage;
- the proof is owned by the canonical foundation gate;
- staging targets and recovery order are explicit;
- U-035 is narrowed to external configuration plus behavioral proof; and
- the staging and production boundaries remain unchanged.

C9.0 explicitly does not:

- create, download, upload, import, restore, or delete a backup;
- run `convex import`, target production, or copy production data;
- enable periodic backups or change a provider plan;
- implement a runtime recovery mode;
- expose or escrow environment values;
- test provider effects;
- reopen C2 destructive execution; or
- claim C9 complete.
