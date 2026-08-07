# Production founder inference cutover receipt — 2026-08-07

This privacy-bounded receipt records the terminal production transition from
the retired existing-founder BYOK cohort to hosted-only community inference.
It is operational evidence, not a product source of truth.

## Authority and backup

- Production web build: `8cf5c7e0c71e6457c927f7518ab5bb159bacfb8b`.
- Deployed mutation: `founderInferenceMigration:transitionExistingFounderToManagedInternal`.
- Full pre-transition Convex export:
  `/Users/neilmcdevitt/polynet-backups/polynet-prod-pre-byok-transition-20260807T0408Z.zip`.
- Full export SHA-256:
  `bb32920f9658815ac35bac24061fda4139a53081a941e0a13a064c062b1d59a9`.
- Bounded affected-table backup:
  `/Users/neilmcdevitt/polynet-backups/polynet-prod-pre-byok-transition-bounded-20260807T0416Z.zip`.
- Bounded backup SHA-256:
  `390b8af4c31de60ebcf714f9516bc79d077f888e6524e50fe602728329c66f6d`.
- Privacy-bounded cohort manifest SHA-256:
  `e225caa5b451b489f053867ab719d12ea9cf1e94d04f35ae22dbbdcda6567493`.

## Pre-transition proof

- Seven pristine `existing_founder_cutover_v1` grants across seven founders.
- Ten owned communities distributed `1/1/1/1/1/2/3` across the cohort.
- Seven `legacy_byok_allowed` communities and six `managed_required`
  communities platform-wide.
- Zero founder subscriptions.
- Zero authorized or indeterminate inference receipts.
- Zero `owner_api_key` inference receipts.
- Every affected community retained grandfathered Builder access.
- Four historical `builder_partner_v1` legacy-program grants existed and were
  explicitly outside the mutation boundary.

All seven exact-identity and exact-community-set dry runs passed before any
write was attempted.

## Transition and post-transition proof

The seven founder transitions were executed one at a time. Every mutation
returned `ok: true`, `dry_run: false`, and the expected community count.

The production re-census at `2026-08-07T04:19:09Z` proved:

- zero `founderInferenceGrants`;
- thirteen `managed_required` communities;
- zero `legacy_byok_allowed` communities;
- thirteen communities retaining grandfathered ordinary platform operation;
- zero `owner_api_key` receipts;
- zero founder subscriptions;
- four unchanged historical `legacyProgramGrants`; and
- unchanged community ownership, slug, visibility, lifecycle status,
  lifecycle generation, and Builder-access projection.

The focused founder-inference, Builder offer, operator-access,
community-builder-access, and cold-archive access suites passed after the
transition. No provider connection, Stripe subscription, membership, content,
visibility, lifecycle, archive, or historical-program record was changed.
