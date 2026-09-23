# Luna 6 paid-run staging acceptance

Date: 2026-09-22. Staging backend: `quick-porcupine-949`, candidate commit `792691fca`. Existing synthetic paid community: `founder-e2e-783091` (`jx7ds4a2wp2tzt20wjfbhjhw958cgxj0`). No subscription or payment was created during this check.

- Before the probes, the current paid cycle had `reservedCostMicros=0`, `settledCostMicros=0`, and `maxRunReservationCostMicros=1000000`.
- The browser's simple member-agent turn visibly returned `paid canary received.` Its `gpt-6-luna` subscription receipt settled one Standard provider request for 777 microdollars.
- The browser's read-only tool turn visibly returned top-level directory entries. Runtime events recorded a Luna 6 input-budget model reference, Luna 6 provider attestation, and successful `polynet_list`. Its `gpt-6-luna` subscription receipt settled two distinct Standard provider requests for 953 microdollars.
- The current cycle then had `reservedCostMicros=0` and `settledCostMicros=1730`, matching the two receipts. The canary selector was removed. A fresh model-resolution readback returned 5.6; the existing tool-turn receipt retained 6.
- Local tests cover stopping before an unaffordable next request and settling known prior cost without consuming the whole reservation. The live turns exercised positive headroom, not an intentionally forced budget stop.
- Production and `origin/main` were not changed. Candidate branch: `codex/luna6-accounting-20260922`.

Validation: 1,612 tests across 180 files, Convex project typecheck, and founder inference, member-agent dock, and community serve-worker contract proofs passed. The staging CLI's broader optional typecheck reports 51 errors in unrelated existing tests/integration files; the staging push completed with that extra check disabled after the focused Convex project typecheck passed.
