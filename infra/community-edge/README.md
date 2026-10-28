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
                         ├─ /__polynet/sdk.js, /__polynet/live.js, /__polynet/llms.txt → the builder kit (SDK, its live client, its doc)
                         ├─ /__polynet/ui.js  → the shell (<polynet-account>), injected into every page; loads blocks on demand
                         ├─ /__polynet/ui.css → linked first in every page: hides Polynet's tags until they're defined
                         ├─ /__polynet/blocks/<name>.js → Polynet's blocks: channels (<polynet-channels>), chat (<polynet-chat>),
                         │                      members (<polynet-members>), composer (the chat's message boxes, imported
                         │                      by chat), profile (the profile panel: opened by blocks, ?member=<handle>
                         │                      links and the "polynet:profile" event), page (<polynet-page>, the
                         │                      standard page inside the site's frame), events (<polynet-events>),
                         │                      learn (<polynet-learn>), knowledge (<polynet-knowledge>), ask
                         │                      (<polynet-ask>) and kit (what they share); any other name is 404
                         ├─ /chat, /people[/<handle>], /events[/<event>], /learn[/<course>[/<lesson>]],
                         │  /knowledge, /ask (GET/HEAD) → the standard pages (below)
                         └─ everything else   → that community's user Worker, without Polynet's cookies
```

### Standard pages (the site's frame)

Every site has Polynet's standard pages, inside its own frame (`/frame.html`:
the site's header, navigation and footer around one `<polynet-page>`). The
route table is `STANDARD_PAGES` in `packages/polynet-cli/checks.mjs`, with
the addresses under each page:

| Page | Block | Under it |
| --- | --- | --- |
| `/chat` | channels + chat | none |
| `/people` | members | `/<handle>`: 1-32 of `A-Z a-z 0-9 _ -` (that profile open) |
| `/events` | events | `/<id>~<start ms>`: Polynet's event ref `event:<id>:<start ms>` (one event; each occurrence of a recurring one has its own) |
| `/learn` | learn | `/<course>`, `/<course>/<lesson>`: Polynet's resource path segments, `<a-z 0-9 ->~<id>` (the id decides, so renamed courses keep their links) |
| `/knowledge` | knowledge | none |
| `/ask` | ask | none |

None of these patterns has a dot, so no file under them is taken for a page.
For a GET or HEAD there, in order:

1. The edge asks the site for the path as a plain fetch (`Sec-Fetch-Mode` and
   `Sec-Fetch-Dest` removed), so a single-page app's `index.html` fallback,
   which Cloudflare gives only to navigations, doesn't count. Anything but 404
   (the site's own `chat.html` or `people/index.html`, or Cloudflare's own
   trailing-slash redirect) is the answer, with the shell as usual.
2. 404 on a trailing-slash path (`/chat/`): 307 to the path without it.
3. 404: the edge fetches `/frame` (where `auto-trailing-slash` serves
   `frame.html`, never conditionally) and serves it with status 200, the
   shell, `<title>` "<Page> · <community name>", and no `ETag`/`Last-Modified`.
   `<polynet-page>` renders the page.
4. No frame (not 2xx HTML): Polynet's own page saying the site needs its
   frame, status 404, never blank.

Other paths (`/people/a.b`, `/people/x/y`, `/chat/app.js`, `/events/123`,
`/learn/intro`, `/ask/x`), other methods and `/__polynet/*` go where they
always did. A site's own `/events` page doesn't cover `/events/<event>`: the
frame shows those (with `<polynet-events>` reading the address), unless the
site ships a file there too.

`packages/polynet-cli/checks.mjs` fails `polynet check`, CLI deploys and MCP
deploys without a root `index.html`, without `/frame.html` holding exactly
one `<polynet-page>`, when the frame uses relative paths, and when the site's
own version of a standard page lacks that page's blocks (a tag in the page, or
the name in a script for framework builds; not in a comment). The shell needs
no check: the edge injects it.
A site to try the blocks and the frame on staging: `dispatch/examples/blocks-demo/`
(deploy it with the CLI like any site; its standard pages come from its `frame.html`).

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

- Publish `@polynet/cli` 0.4.0 (production by default, `--staging` for staging; npm account `polynet` needs 2FA on).
- Founders' own domains (Cloudflare for SaaS custom hostnames, `*/*` route).
- `polynet.page` on the Public Suffix List (after renewing the domain: the list needs two years left).
