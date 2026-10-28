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

## Tests

The root test suite (`npm test`, `npm run release:gate`) runs `dispatch/src/*.test.ts`,
which import this package's own locked `convex` browser bundle. Install this
package's dependencies first: `npm --prefix infra/community-edge ci`. CI does this
in the Release Gate job.

## Verified locally (October 16, 2026)

| Check | Result |
| --- | --- |
| Known community host serves its front end | 200 |
| Deep link falls back to the app (single-page app) | 200 |
| Unknown host | 404 |
| API call without a session | 401 `sign_in_required` at the edge |
| API GET | 405 at the edge |
| Body over 64 KB | 413 at the edge |

## Staging on polynet.page

Staging shares `polynet.page` with production (Oct 28, POL-34, no second domain):
staging sites live at `https://<community>-staging.polynet.page` against the staging
backend, and the staging front door is `https://staging.polynet.page`. Production
owns `https://<community>.polynet.page` and the front door `https://polynet.page`
(a page, and the builder guide at `/llms.txt`), where a founder's AI starts.
Production refuses site names ending in `-staging`. Sign-in cookies are
`__Host-` (host-only), so staging and production sites never share a session.

| Piece | Value |
| --- | --- |
| Zone | `polynet.page` (registered at Namecheap, nameservers on Cloudflare) |
| DNS | `*` A `192.0.2.0`, proxied (the edge answers; the address is a placeholder) |
| Edge Worker | `polynet-edge-staging`, routes `*-staging.polynet.page/*` and `staging.polynet.page/*` (more specific than production's `*.polynet.page/*`; `wrangler deploy --env staging` in `dispatch/`) |
| Sites | Workers for Platforms namespace `polynet-sites-staging`, one user Worker per community (`site-<community>`) |
| Hostname map | KV `polynet-routes-staging`: `host:<hostname>` → `{"script","community"}` |
| Settings | `POLYNET_SITES_HOST_SUFFIX=-staging` and `POLYNET_SITES_FRONT_DOOR=staging.polynet.page` on the edge; `POLYNET_SITES_HOST_SUFFIX=-staging` on the staging backend |
| Secret | `POLYNET_EDGE_SECRET` (`wrangler secret put --env staging`), equal to the backend's `POLYNET_COMMUNITY_EDGE_SECRET` |
| Backend | origin registered with `communityApps:registerCommunityDomainInternal` |

Production uses the same zone:

| Piece | Value |
| --- | --- |
| Edge Worker | `polynet-edge-production`, routes `*.polynet.page/*` and `polynet.page/*` (`wrangler deploy --env production`) |
| Sites | namespace `polynet-sites-production` |
| Hostname map | KV `polynet-routes-production` |
| Secret | `POLYNET_EDGE_SECRET` (`wrangler secret put --env production`), equal to production's `POLYNET_COMMUNITY_EDGE_SECRET` |

Deploy a community site (owner or admin; signs in through the browser once):

```bash
cd my-site && node <repo>/packages/polynet-cli/bin/polynet.mjs deploy --community <slug> --staging
```

The backend (`convex/httpCommunitySites.ts`) checks builder authority, gets a
Cloudflare upload pass for only the changed files, publishes `site-<slug>`, maps
`<slug>.polynet.page` and registers the origin. It needs `CLOUDFLARE_API_TOKEN`
(Workers Scripts Edit + Workers KV Storage Edit), `CLOUDFLARE_ACCOUNT_ID`,
`POLYNET_SITES_NAMESPACE`, `POLYNET_SITES_ROUTES_KV_ID` and `POLYNET_SITES_DOMAIN`.

By hand, the same three steps:

```bash
npx wrangler deploy -c user-hello/wrangler.jsonc --name site-<community> --dispatch-namespace polynet-sites-staging   # deploys a minimal sample site
npx wrangler kv key put "host:<community>.polynet.page" '{"script":"site-<community>","community":"<slug>"}' --namespace-id 1f354dc000c34b919cc2c69249363f9e --remote
npx convex run communityApps:registerCommunityDomainInternal '{"communityId":"<id>","origin":"https://<community>.polynet.page"}'
```

Verified on `https://polynet.polynet.page`: sign-in in one redirect, HttpOnly
session (page JavaScript reads no cookies), live feed, post and delete
updating live, the community agent streaming, and only `/__polynet/sdk.js` and
`/__polynet/live.js` loaded (HTML is `no-transform`, so Cloudflare injects nothing).

## Not yet

- Publish `@polynet/cli` 0.3.0 (production by default, `--staging` for staging; npm account `polynet` needs 2FA on).
- Founders' own domains (Cloudflare for SaaS custom hostnames, `*/*` route).
- `polynet.page` on the Public Suffix List (after renewing the domain: the list needs two years left).
