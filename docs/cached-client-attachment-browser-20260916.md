# Cached production attachment recovery — September 16, 2026

Passed local rendered recovery acceptance using Chromium and production source commit 496e06f42b6b4117b56c544fff75fc52e70c4716.

The fixture renders the unchanged WebCommunityChatPanel and useWebCommunityChatController, real file ingestion/removal controls, and both production upload/send gateways. It verifies the supplied production source checkout has no tracked frontend/shared differences from that commit. The message-list host and authenticated transport are isolated fixture replacements; all external browser requests are blocked. No live auth credentials or production records are used.

## Passed

- At 1000px and 390px widths, a pre-receipt storage ID is rejected with the candidate's reattach message. The text and attachment remain visible. The real Remove control works; selecting the file again and sending succeeds.
- HTTP upload failure preserves draft text and the original browser File, allowing retry.
- Send rejection after upload preserves draft text and the original File; retry performs a fresh upload and succeeds.
- Four successful simulated sends, five successful fixture uploads, zero uncaught page errors. An intentional HTTP 503 is expected in the upload-failure case.
- Desktop and narrow recovery screenshots were visually inspected. The fixture uses a bounded message-list host, so this does not establish whole-shell layout or mobile-shell acceptance.

The backend adapter's actual authorization, storage-claim, expiry, revocation and idempotency behavior is covered separately by communityAttachmentUploads.test.ts. These browser tests use controlled transport responses. They are NOT a test of a cached deployed JavaScript bundle against a deployed candidate Convex backend. They do not establish refresh/reload draft persistence, session renewal, or handling of edits made during an in-flight send.

## Reproduce

Run from the candidate worktree:

```sh
ARX_PRODUCTION_SOURCE=/Users/neilmcdevitt/code/arx-channel-name-production-bridge-20260916 node scripts/cached_client_attachment_browser_qa.mjs
```

Default evidence directory: /tmp/arx-cached-client-browser. Set ARX_QA_OUTPUT to retain elsewhere. The script starts a localhost-only Vite fixture, runs headless Chromium, then closes both.

Durable receipt and screenshots: panel-layout-audit-20260916/cached-client-attachment-recovery in the task visualization artifacts.

## Remaining release gate

Reconcile the production bridge into the final candidate, freeze the resulting SHA, then validate the production client with the deployed test backend in an approved test community. Only after that and the production migration preflight/authorization should deployment begin. Production remains unchanged.

## Deployed staging attempt

Candidate backend 4593eabe9f65111673e300943d0522134631ab24 (product changes through 7fb9df022) deployed successfully to quick-porcupine-949 using `convex dev --once --typecheck enable --codegen disable`. Before deployment, all 727 deployed staging function identifiers were present in candidate source. Deployment completed with typechecking and added the Events end-time index.

Hosted staging frontend remains a7a26dfe827e2b868bd65babf2f66895ae0e0ab2. After deployment, Chrome rendered the authenticated Forms Release Acceptance Sep15 General channel, existing messages, composer, and online/offline roster successfully. No attachment or message was submitted during this attempt. This is a hosted staging smoke check, not production-client compatibility acceptance.

The unchanged production frontend was started locally at 127.0.0.1:5201 with staging Convex endpoints. It could not bootstrap a session: `/api/auth/session` returned HTTP 200 text/html because Vite does not run the repository's same-origin auth server handlers. Neither test checkout has ARX_AUTH_BRIDGE_SECRET configured. No auth bypass, session extraction, or cookie copying was attempted.

The deployed production-client attachment test remains BLOCKED on a properly configured same-origin auth runtime for the production frontend against staging. Next: provide that runtime through the normal preview/auth setup, sign in normally, and run the attachment recovery scenarios in the dedicated test community. Do not count the local fixture or hosted staging smoke check as this gate passing.

Production web was rechecked at 496e06f42b6b4117b56c544fff75fc52e70c4716. No production deployment, migration, merge, or push was performed.

## Isolated hosted preview prepared

Temporary branch `codex/cached-client-acceptance-20260916`, commit `e480d05ed8343cd458814d036cdd6bad2a67ed3b`, starts at production 496e06f42. Git diff verified no changes to apps/web, shared, api, or convex. Changes are only vercel.json, a preview deployment guard, and a test-scope document. Git push triggered Vercel staging-project preview dpl_5NVbCxazaoR3yKNcabypsy9qyCGB; READY.

URL: https://polynet-staging-fh934we4u-neil-mcds-projects.vercel.app

Build guard requires preview environment, exact branch, staging project URL prefix, quick-porcupine-949 cloud/site endpoints, and an auth bridge secret. The ignore-command guard was checked for accepted preview and rejection of production, other project, and other branch. Configuration override follows https://vercel.com/docs/project-configuration/vercel-json#ignorecommand. No project-level configuration or environment variables were changed.

Preview version reports e480d05ed8343cd458814d036cdd6bad2a67ed3b, environment preview. Anonymous /api/auth/session returns JSON ok=true, session=null, trace missing_cookie. Browser rendered production landing page and Sign in reached WorkOS. WorkOS rejected the exact deployment callback as unregistered.

WorkOS Staging application redirects were inspected in the authenticated dashboard. The existing seven callbacks include production, staging, localhost, and green hosts. Exact proposed addition (no wildcard): https://polynet-staging-fh934we4u-neil-mcds-projects.vercel.app/api/auth/google/callback . This URL is entered in the Add field but NOT added or saved. Saving a new OAuth callback requires confirmation under the browser security-sensitive access rule. Default and existing callbacks must remain untouched.

No attachment/message was sent. Live compatibility acceptance remains pending normal sign-in after callback approval. This temporary preview branch must not be merged into main/staging.

## Existing staging URL: live production-client check

The extra preview was not used. No WorkOS configuration was saved. On user authorization, staging advanced by normal Git push to temporary commit b08eb5d2519269ad411d0050442324f49533b2ad. Its entire source tree exactly equals production 496e06f42 (tree 85170a8007a57056dd43dad33616e47130e7f980). Only the staging web was deployed; candidate backend remained on quick-porcupine-949. Staging version endpoint confirmed b08eb5d25 before browser reload. Existing normal Chrome session opened the dedicated Forms Release Acceptance Sep15 General channel.

Passed live:
- Production client uploaded a synthetic 126-byte text file and sent one message successfully.
- Invalid image bytes were rejected by the client before upload; draft text remained. This was not counted as backend rejection.
- An empty text file reached the backend and was rejected. The real UI showed Failed to upload attachment and restored both draft text and attached file.
- Remove and reattach of the valid synthetic text file preserved the draft without retyping. Sending then succeeded.
- Read-only staging inspection found exactly two labeled message roots, each with one uploaded legacy attachment, matching owner/community/channel/root, storage ID, content hash, and size 126. No duplicate or rejected-upload message existed. The empty attempt left a zero-byte pending ticket with no storage/root; its existing 30-minute cleanup was scheduled, not waited for.

Evidence: production-client-live-attachment-20260916.json. Root IDs: j97z3s1myzm05sqd8vxj3q25h18ehrfc and j97hdg3t0n2gb8jk1wm6601mmn8eg87b. Both labeled synthetic messages remain in the test community.

Restoration commit 00a405ab968f9cbccc92662ff7fdeb27dbf19c9b was pushed normally to staging. Its entire tree equals the initial staging a7a26dfe8 (aad8cac3ff457529f7c7c7a8cb8fdfff7ccca416). No production ref, deployment, or auth configuration was changed.

Scope: live builder small-file success and upload-rejection/remove/reattach recovery passed. Old pre-receipt upload rejection, post-upload send failure, response-loss replay/idempotency, narrow viewport, member revocation, large media, and session renewal were not exercised live here; prior local tests are separate evidence. Final candidate reconciliation and release review remain required.

Restoration verified: staging version returned 00a405ab968f9cbccc92662ff7fdeb27dbf19c9b. Chrome reload rendered Agent, Knowledge, Workflows, restored online/offline roster, and both persisted test attachments. origin/main and production version remained 496e06f42. Unused preview and unsaved WorkOS tabs were closed.
