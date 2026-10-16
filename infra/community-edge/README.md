# Polynet community edge (spike)

Step 1 of [community front-end hosting](../../docs/research/community-frontend-hosting-20261016.md):
one edge Worker in front of every community front end.

```text
<community address> → dispatch Worker (Polynet edge)
                         ├─ /__polynet/api  → Polynet backend /runtime/app (server-side, same origin for the browser)
                         └─ everything else → that community's user Worker (static assets)
```

## Run locally

```bash
cd infra/community-edge && npm install && npm run dev
curl -H 'Host: hello.localhost' http://localhost:8787/
```

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
| API proxy to staging without a session | 401 `community_app_session_required` from staging |
| API GET | 405 at the edge |
| Body over 64 KB | 413 at the edge |

## Not yet

- Cloudflare resources (account, Workers for Platforms plan, namespace, KV, a
  test hostname): needs approval and a paid plan.
- Sign-in (step 2), realtime JWTs (step 3), CLI (step 4).
- Backend: `normalizeCommunityAppOrigin` accepts plain `localhost` only; local
  `*.localhost` community addresses need allowing for dev.
