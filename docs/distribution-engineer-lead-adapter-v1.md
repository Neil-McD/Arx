# Distribution Engineer Lead Adapter V1

## Purpose

Preserve a Distribution Engineer tracked click across a Polynet signup and
send one native `identify` observation when Polynet creates the authenticated
user. Distribution Engineer remains the authority for identity resolution,
Lead admission, customer journeys, and attribution. Polynet owns only its user
and the delivery attempt.

## Irreducible Flow

```text
Distribution Engineer redirect
  -> Polynet receives opaque de_aid / de_cid UUIDs
    -> browser stores only those opaque IDs
      -> authenticated bootstrap creates a genuinely new Polynet user
        -> one operational delivery row and opaque source event are admitted
          -> verified canonical user email is read server-side
            -> server POSTs to Distribution Engineer /api/integrations/polynet/identify
              -> Distribution Engineer writes canonical viewer and Lead evidence
                -> Polynet persists their typed public receipt IDs
```

Existing users, missing or malformed IDs, anonymous sessions, and unverified
emails do not create a new native Lead observation. The browser never receives
the server credential and never calls the identify endpoint directly.
Stored browser context expires after two years, matching Distribution
Engineer's owned-click cookie horizon.

## Authority And Data Contract

- `users` is Polynet's canonical user and email authority.
- `distributionAttributionDeliveries` is an operational outbox and receipt, not
  a second customer, lead, journey, or attribution ledger.
- The outbox stores `userId`, opaque correlation IDs, attempt state, bounded
  errors, downstream public receipt IDs, and timestamps. It does not copy the
  user's email.
- One deterministic delivery key, `polynet_user_created:{userId}`, prevents
  duplicate delivery admission.
- One random `polynet.user_created.v1:<uuid>` source event survives retries and
  is the cross-system idempotency identity. It never exposes the internal user
  ID.
- Distribution Engineer authenticates the request and owns all downstream
  identity resolution and Lead admission.

The strict success response is:

```json
{
  "ok": true,
  "source_event_id": "polynet.user_created.v1:<uuid>",
  "viewer_id": "<public viewer uuid>",
  "lead_event_id": "<public Lead event uuid>",
  "lead_created": true,
  "replayed": false
}
```

A replay returns the same viewer and Lead event IDs with `lead_created: false`
and `replayed: true`.
An HTTP 2xx without this exact typed receipt is not delivery success.

## Reliability Contract

The adapter uses a lease, five bounded automatic attempts, transient-only
retry, and a five-minute repair cron for pending work or expired leases. HTTP
408, 429, 5xx, and network failures retry. Authentication, configuration,
semantic, and malformed-receipt failures enter resumable `needs_attention`
state. An internal authorized resume starts a new bounded attempt cycle on the
same outbox row and source event. External delivery never runs inside or blocks
the Polynet user transaction.

## Required Production Configuration

```text
DISTRIBUTION_ENGINEER_IDENTIFY_URL=https://www.distribution.engineer/api/integrations/polynet/identify
DISTRIBUTION_ENGINEER_ACCOUNT_ID=<workspace account UUID>
DISTRIBUTION_ENGINEER_FUNNEL_WEBHOOK_KEY=<rotated bearer credential>
```

The bearer credential is server-only. Distribution Engineer stores only its
one-way verifier and returns the raw credential once at creation or rotation.

## Proof Contract

A production canary is complete only when one genuinely new Polynet account,
created after a tracked Distribution Engineer click, produces all of:

1. a delivered Polynet outbox receipt with the exact opaque IDs, source event,
   public viewer ID, and public Lead event ID;
2. a native Distribution Engineer identify/capture/Lead event rather than a
   migration or legacy-backfill event;
3. a resolved Audience journey whose upstream click lineage matches those IDs;
4. no duplicate delivery or Lead event after session replay or page reload.

Local tests, a successful HTTP response, or an outbox row alone are not
production attribution proof.
