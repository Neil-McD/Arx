# Polynet community edge (spike)

Step 1 of [community front-end hosting](../../docs/research/community-frontend-hosting-20261016.md):
one edge Worker in front of every community front end.

```text
<community address> → dispatch Worker (Polynet edge)
                         ├─ /__polynet/auth/* → "Sign in with Polynet" (start, callback, session, logout, signout);
                         │                      session also returns the live URL and watch-only token
                         ├─ /__polynet/api    → Polynet backend /runtime/app (server-side, edge secret + session cookie)
                         ├─ /__polynet/upload, /__polynet/files/<id> → /runtime/app/upload, /runtime/app/file
                         ├─ /__polynet/agent, /__polynet/agent/messages → /runtime/app/agent, /runtime/app/agent_messages (streamed)
                         ├─ /__polynet/discover → published communities' public cards (GET, anyone, no session): the backend's
                         │                      /runtime/community_edge/discover (edge secret), cached 60s per isolate
                         ├─ /__polynet/sdk.js, /__polynet/live.js, /__polynet/llms.txt → the builder kit (SDK, its live client, its doc)
                         ├─ /__polynet/ui.js  → the shell (<polynet-account>), injected into every page; loads blocks on demand
                         ├─ /__polynet/ui.css → linked first in every page: hides Polynet's tags until they're defined
                         ├─ /__polynet/blocks/<name>.js → Polynet's blocks: channels (<polynet-channels>), chat (<polynet-chat>),
                         │                      members (<polynet-members>), composer (the chat's message boxes, imported
                         │                      by chat), profile (the profile panel: opened by blocks, ?member=<handle>
                         │                      links and the "polynet:profile" event), page (<polynet-page>, the
                         │                      standard page inside the site's frame), events (<polynet-events>),
                         │                      learn (<polynet-learn>), knowledge (<polynet-knowledge>), ask
                         │                      (<polynet-ask>), discover (<polynet-discover>) and kit (what they
                         │                      share); any other name is 404
                         ├─ /chat, /people[/<handle>], /events[/<event>], /learn[/<course>[/<lesson>]],
                         │  /knowledge, /ask, /discover (GET/HEAD) → the standard pages (below)
                         ├─ /communities, /messages, /settings, /join (GET/HEAD) → 302 to the private twin
                         │                      (unless the site has its own file there)
                         ├─ /__polynet/me/*, /__polynet/blocks/personal.js → 404 (personal: the twin's only)
                         └─ everything else   → that community's user Worker, without Polynet's cookies

<slug>--me<suffix>.<sites domain> (the site's private twin: the member's own pages)
                         ├─ found through the site's route (no KV entry of its own); unknown site → 404
                         ├─ /__polynet/* as on the site (its own sign-in, session cookie, API, blocks, shell),
                         │  plus /__polynet/blocks/personal.js, settings.js and /__polynet/me/*
                         │                    → /runtime/app/me/* (private session only)
                         ├─ /communities, /messages, /settings, /join → the site's frame, stripped (below)
                         ├─ other GET/HEAD    → 302 to the same path on the site (never for a script)
                         └─ anything else     → 404
```

### The private twin (members' own pages)

Each site `<slug><suffix>.<sites domain>` has a twin one label over,
`<slug>--me<suffix>.<sites domain>` (`sunrise-climbing-club--me-staging.polynet.page`),
covered by the same wildcard routes and certificate. The mapping is
`privateTwinHost` / `siteHostOfTwin` in `packages/polynet-cli/checks.mjs`, the one
helper the edge, the backend and the CLI use. Community slugs may contain `--`,
so the ending is reserved instead: no site name ends in `--me` (or `-staging`),
so no site address is ever another community's twin.

On a personal page (`PERSONAL_PAGES` in `checks.mjs`) the edge:

1. With no session cookie yet (and a page that needs one: not `/join`), 302s
   to `/__polynet/auth/start?return=<page>`: the same Polynet hop as the site,
   to the twin's own callback, so a member signed in to Polynet passes through
   silently and gets the twin's own `__Host-polynet_session`. The backend
   records that session as `kind: "private"` (the twin's origin is registered
   with `kind: "private"`). A session the backend later refuses shows the
   page's own Sign in (no loop).
2. Fetches the site's `/frame` (plain fetch, no Polynet cookies) and strips
   it with HTMLRewriter (`twin.ts`): removes `script`, `noscript`, `iframe`,
   `frame(set)`, `object`, `embed`, `applet`, `base`, `portal`,
   `fencedframe`, `xmp`, `noembed`, `noframes`, `plaintext`,
   `meta[http-equiv]`, SVG `set`/`animate*`/`discard`, comments, and every
   `<link>` but stylesheet, icons and preconnect/dns-prefetch; unwraps
   `<form>` (fields stay as markup); drops every `on*` attribute and `srcdoc`,
   `action`, `formaction` (and the other `form*`), `ping`, `nonce`,
   `background`, `codebase`, `archive`, `classid`, `longdesc`, `manifest`, and
   `name` on images (document clobbering). URLs in `href`, `xlink:href`,
   `src`, `poster`, `cite`, `data`, `srcset`, `imagesrcset` are decoded and
   parsed as a browser would: only http(s) survive (and `mailto:`/`tel:` on
   links); links to the site go to the site's origin, links to a personal
   page and `/__polynet/*` stay on the twin, other origins stay as they are.
   Markup, classes, `<style>` blocks, `style` attributes, stylesheets and
   fonts stay, so it looks like the site. `<title>` is "<Page> · <community>".
3. Adds the shell (`ui.css`, `ui.js`) as on every page. `<polynet-page>`
   renders the page heading and `<polynet-personal page="<name>">`, which
   keeps the member's data in its shadow root.
4. Serves it with `Content-Security-Policy: default-src 'none'; script-src 'self';
   style-src 'self' <site> https://fonts.googleapis.com <sha256 of each inline
   style> ['unsafe-hashes' when style attributes exist]; font-src <site>
   https://fonts.gstatic.com data:; img-src 'self' data: <site> <storage>;
   media-src <site>; connect-src 'self' <storage>; form-action 'self'; frame-ancestors
   'none'; base-uri 'none'; object-src 'none'`, plus `X-Frame-Options: DENY`,
   `Referrer-Policy: same-origin`, `Cache-Control: no-store`,
   `Cross-Origin-Opener-Policy: same-origin`. Every twin response also has
   `Cross-Origin-Resource-Policy: same-origin`, `Origin-Agent-Cluster: ?1` and
   `nosniff`.

No frame, or none it can draw (no HTMLRewriter, over 1 MB): Polynet's plain
page with a "Back to <community>" bar, under the same policy. Never the
unstripped frame.

`GET /__polynet/me/communities` (twin only, same-origin only) returns `{ ok,
communities: [{ slug, name, role, avatar_url, url, has_site, here }] }`: every
community the member owns or is entitled to (as Studio lists them), each linking
to its own site on this sites domain, else to `<POLYNET_AUTH_URL>/c/<slug>`;
avatars only from Polynet's storage (`POLYNET_LIVE_URL`'s origin). The backend
answers only a private-kind session (`private_session_required` otherwise);
the site's `/__polynet/account` still never names other communities.

Settings (`/settings`, `blocks/settings.ts`), twin only, same-origin only;
each forwarded with the twin's session to the backend, which also requires
current membership (`not_a_member`) and runs Studio's own cores:

| Edge | Backend | Core |
| --- | --- | --- |
| `GET /__polynet/me/settings` | `/runtime/app/me/settings` | profile read, email preferences, community member settings, role |
| `GET /__polynet/me/handle?handle=` | `/runtime/app/me/handle` | Studio's handle availability |
| `POST /__polynet/me/profile` (≤ 8 KB) | `/runtime/app/me/profile` | Studio's profile write (name, handle, bio, links) |
| `POST /__polynet/me/avatar/upload` (≤ 1 KB) | `/runtime/app/me/avatar_upload` | Studio's avatar upload URL |
| `POST /__polynet/me/avatar` (≤ 1 KB) | `/runtime/app/me/avatar` | Studio's profile write with the uploaded file (or `null`) |
| `POST /__polynet/me/notifications` (≤ 1 KB) | `/runtime/app/me/notifications` | mute this community; weekly digest |
| `POST /__polynet/me/leave` (≤ 1 KB) | `/runtime/app/me/leave` | Studio's leave (owners can't) |

Writes must be `application/json` (no plain form reaches them). Only the
fields the page shows leave the edge; an upload URL only if it is Polynet's
storage (`POLYNET_LIVE_URL`'s origin, which the twin's `connect-src` allows so
the photo goes straight there). `account_url` is
`<POLYNET_AUTH_URL>/settings/account`.

Sign-out: `POST /__polynet/auth/logout` on either origin revokes its session
and answers `then`, the other origin's `GET /__polynet/auth/signout?ticket=&return=`
(the backend's two-minute ticket for this member and community). That visit
revokes its own session only if the backend accepts the ticket for the same
member, clears its cookie, and returns to the site (`return` is a path). The
shell and the settings page follow `then`; site code's `polynet.signOut()`
ends only the site's session.

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
| `/discover` | discover (public; `network`: listed apart from "In this club") | none |

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

### Discover

`GET /__polynet/discover` answers anyone (no session, no same-site rule: the
data is public) with `{ ok, communities: [{ slug, name, one_liner,
avatar_url, member_count, url, has_site, here }] }`, `Cache-Control: public,
max-age=60`. The edge asks the backend (`POST
/runtime/community_edge/discover`, edge secret, `{ sites_domain,
host_suffix }`) at most once a minute per isolate; a failed read (502
`discover_unavailable`) isn't cached. The backend lists published, active,
operational communities only (`listSiteDiscoverCommunitiesInternal`, the
same list as Studio's Discover) and gives `site_url` only when that
community's own origin on this sites domain is registered to it. The edge
passes on only the card fields, links a card to its site only when
`site_url` is exactly `https://<slug><suffix>.<domain>`, and otherwise to
`<POLYNET_AUTH_URL>/c/<slug>`.

Other paths (`/people/a.b`, `/people/x/y`, `/chat/app.js`, `/events/123`,
`/learn/intro`, `/ask/x`), other methods and `/__polynet/*` go where they
always did. A site's own `/events` page doesn't cover `/events/<event>`: the
frame shows those (with `<polynet-events>` reading the address), unless the
site ships a file there too.

`packages/polynet-cli/checks.mjs` fails `polynet check`, CLI deploys and MCP
deploys without a root `index.html`, without `/frame.html` holding exactly
one `<polynet-page>`, when the frame uses relative paths, and when the site's
own version of a standard page lacks that page's blocks (a tag in the page, or
the name in a script for framework builds; not in a comment). It warns when the
frame runs its own scripts and has an empty `<header>` or `<nav>` (the chrome
is probably drawn by a script, which the twin removes). The shell needs no
check: the edge injects it.
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
`<slug>.polynet.page` and registers the origin and its private twin's
(`kind: "private"`). Sites deployed before twins existed get theirs with a one-off
backfill, a page at a time until `isDone`:

```bash
npx convex run communitySites:registerSitePrivateTwinsInternal '{"sitesDomain":"polynet.page","hostSuffix":"-staging"}'
# then again with '"cursor":"<continueCursor>"' while isDone is false; '"dryRun":true' lists without writing
``` It needs `CLOUDFLARE_API_TOKEN`
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
