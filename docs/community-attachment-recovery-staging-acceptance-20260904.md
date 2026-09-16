# Attachment recovery staging acceptance — 2026-09-04

Status: **partial live acceptance; not a completed recovery gate.**

## Deployed scope

- Candidate: `0e0cbae7139037af65ac2ebb214c3aae753633bd`.
- Web: `https://polynet-staging.vercel.app`; `/version.json` reports that exact
  candidate and `environment: staging`.
- Vercel staging deployment: `dpl_4JSty7YB3rYqkDTvbT3E9FU3HKfw`, READY.
- Backend: `dev:quick-porcupine-949`; explicit `convex dev --once` using
  `.env.staging.local.example`, with inherited deploy keys unset. Backend
  typechecking and schema/index deployment completed successfully.
- GitHub `staging` advanced normally from `ae6b42f25` to the candidate, containing
  the five previously local channel-authority/recovery commits. No force push.
- `origin/main` was `d37d8db65fc028669045d52f393d949fa811d15f` both before and
  after this run. No production backend or production web release was performed.

## Live browser and durable evidence

Chrome, signed in as Neil McDevitt (builder), in the existing community
`concierge-welcome-canary-2026-08-20-b`:

- Community: `jx7f4fcw4x3hjsvy2t02j669xx8cvj6s`.
- General: `qh7m043v451sncwpnfpvf8hjed8cvm59`.
- Fixture: synthetic 155-byte `recovery-canary.txt`, containing only a canary
  label and candidate SHA, not member/customer data.
- Root: `j97y0qax8c12fp04zhyspf908x8dva5w`.
- Root attachment: `h57n4ya77c9bfvgj60snt7ppe18dtfva`.
- Reply: `j57qpq9vh6wa6842d81rkjz4en8dvg1m`.
- Reply attachment: `h57tpy4srn9rkg0rzgcnmebmas8dvb1e`.

The root and reply both appeared in the real browser with their file buttons.
Read-only backend inspection confirmed one live root, one live reply, root
replyCount 1, nonempty composer fingerprints, and two distinct uploaded claims
with storage IDs, content hashes, and size 155. The reply upload retained its
correct uploadRootId. This proves the builder's small-file root/reply path, not
ordinary-member revocation or private-room isolation.

## Fault-test result and limitations

Full-tab Offline simulation failed query/session refresh before the composer
mutation. Restoring connectivity and subsequently sending produced one
`Offline retry canary` root (`j97qvwns1tfbvmcdxcd776k5fd8dvvsz`). This is not
evidence of post-commit response loss or use of the failed-message Retry button.

A separately marked `Exact request replay canary` root
(`j97kk7bxs9zaezhtgrjym0wgc98dv4ga`) was committed once, but its exact request was
not replayed. Its label must not be treated as proof that replay occurred.

No targeted blocking rule was installed. Temporary request blocking was disabled,
Network was restored to No throttling, the Network filter was cleared, and
DevTools was closed. All three synthetic root messages and the one reply remain
in the staging canary community as visible test evidence. No member roles,
memberships, or room policies were changed.

## Acceptance ledger

| Check | Evidence |
| --- | --- |
| Exact staging web candidate and backend push | Passed live |
| Small attachment in root and reply | Passed live, builder account |
| Uploaded ownership, parent binding, payload fingerprints | Passed live readback |
| Exact retry after committed response loss | Passed local regression tests; live pending |
| Failed-message retry without restoring a competing draft | Passed callback tests; live pending |
| Late provider completion cleanup | Passed local HTTP/fixture tests; live pending |
| Large media provider upload | Live pending |
| Access revoked during upload/send | Passed local fixtures; live member test pending |

Prior local validation: 921 tests across 128 files, backend/web typechecks,
web build, and eight relevant contract proofs passed on the candidate.

Next: run a mutation-specific fault test without disconnecting session
verification, verify exact replay and unchanged message count, then test a
real large-media fixture and ordinary-member revocation. Do not replace live
member authorization evidence with an operator-impersonated mutation. Protected
downloads remain the next engineering slice; private rooms remain disabled.
