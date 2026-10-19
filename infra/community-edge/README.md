# Polynet community edge (spike)

Step 1 of [community front-end hosting](../../docs/research/community-frontend-hosting-20261016.md):
one edge Worker in front of every community front end.

```text
<community address> → dispatch Worker (Polynet edge)
                         ├─ /__polynet/auth/* → "Sign in with Polynet" (start, callback, session, logout);
                         │                      session also returns the live URL and watch-only token
                         ├─ /__polynet/api    → Polynet backend /runtime/app (server-side, edge secret + session cookie)
                         ├─ /__polynet/upload, /__polynet/files/<id> → /runtime/app/upload, /runtime/app/file
                         ├─ /__polynet/agent, /__polynet/agent/messages → /runtime/app/agent, /runtime/app/agent_messages (streamed)
                         └─ everything else   → that community's user Worker, without Polynet's cookies
```

## Run locally

```bash
cd infra/community-edge && npm install && npm run dev
```

Then open `http://hello.localhost:8787/`. Sign-in needs:

- `dispatch/.dev.vars` (gitignored) with `POLYNET_EDGE_SECRET`, equal to the
  backend's `POLYNET_COMMUNITY_EDGE_SECRET`;
- the domain registered to its community with
  `communityApps:registerCommunityDomainInternal` (`communityId`, `origin`).

Locally, the edge reaches the hello Worker through a service binding, because
wrangler cannot run dispatch-namespace user Workers locally. In production the
same code uses the `DISPATCHER` dispatch namespace and the `ROUTES` KV
hostname map.

## Verified locally (October 16, 2026)

| Check | Result |
| --- | --- |
| Known community host serves its front end | 200 |
| Deep link falls back to the app (single-page app) | 200 |
| Unknown host | 404 |
| API call without a session | 401 `sign_in_required` at the edge |
| API GET | 405 at the edge |
| Body over 64 KB | 413 at the edge |

## Not yet

- Cloudflare resources (account, Workers for Platforms plan, namespace, KV, a
  test hostname): needs approval and a paid plan.
- Live updates beyond channels (presence, typing, events, resources), then the CLI.
