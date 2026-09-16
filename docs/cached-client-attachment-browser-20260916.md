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
