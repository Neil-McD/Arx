# Hosting community front ends: research and decision

October 16, 2026. Research note, not yet a contract. Builds on
[invariant-core.md](../core-contract.md) (#182; now the core contract).

## Decision (October 16, 2026)

- **Convex stays** the one shared backend.
- **Cloudflare (Workers for Platforms) hosts every community front end,** including
  Polynet's home once it becomes a community. Chosen over Vercel's multi-project
  model to avoid building the hosting layer twice; Vercel could serve v1, but its
  per-project and domain rate limits and the eventual need for isolated founder
  code favour Cloudflare long term.
- **Vercel retires naturally** when Polynet home moves onto community hosting;
  no separate migration.
- Sign-in through the edge is built and verified end to end against staging
  (branch `claude/community-edge-signin-20261016`).

## The question

Every community, including Polynet's home, becomes a vibe-coded front end.
How should Polynet host thousands of them, and does that mean rebuilding
Convex and Vercel?

## Answer in one line

**No. Keep one shared Convex backend for the community world, add a
multi-tenant edge host (Cloudflare Workers for Platforms) for community front
ends, and build only the thin Polynet layer between them: sign-in, the API
edge, deploys.**

## What others do

| Platform | Front ends | Backend | Why it fits them |
| --- | --- | --- | --- |
| **Shopify** Oxygen | Gateway Worker plus per-store workers, on Cloudflare's runtime | One shared commerce backend | Shared, trusted core (orders, money) + custom storefronts. **Closest to us** |
| **Lovable** | Hosted per app (reported on Cloudflare Workers) | One managed Postgres project per app | Apps share nothing |
| **Bolt** | Netlify or `.bolt.host` | A managed Postgres database per project | Apps share nothing |
| **Convex Chef** | Dev deploy per app | One Convex project per app | Apps share nothing |
| **Vercel for Platforms** | One codebase for many tenants, or a project per tenant (100 creations an hour) | Bring your own | Built for one app with many domains |

**Takeaway:** builders that host independent apps give each one its own
backend. Platforms with a shared core (Shopify) keep one backend and host
custom front ends at the edge. Polynet has a shared core: one identity,
memberships, money, cross-community DMs, Discover and memory.

## Options

| | A. Shared backend + edge-hosted front ends | B. Backend per community | C. Build our own hosting and database |
| --- | --- | --- | --- |
| Invariants | Enforced once | Fragmented across thousands of backends | Enforced once |
| Cross-community features | Native | Need a federation layer | Native |
| Founder power | Front end, configuration; extensions later | Full backend | Same as A |
| Operations | One backend, one edge | Thousands of projects to migrate and secure | Huge |
| **Verdict** | **Choose** | Reject | Reject |

## The architecture (A)

```text
member's browser ── slug.polynet.app or a custom domain
        │
Cloudflare dispatch Worker (Polynet edge, per request)
   ├─ /__polynet/auth/*   sign-in; HttpOnly session cookie on this domain
   ├─ /__polynet/api      same-origin proxy → Convex, acting as the member
   ├─ /__polynet/token    short-lived Polynet JWT for Convex realtime
   └─ everything else     → that community's static build (Worker static assets)
        │
Convex (one shared deployment): canonical executor, domain owners, invariants
```

| Piece | Decision | Evidence |
| --- | --- | --- |
| Host | Workers for Platforms: dispatch namespace, a user Worker per community, static assets attached | Built for untrusted per-tenant code; static assets supported |
| Routing | Hostname → community build, via KV | The documented dispatch-Worker pattern |
| Addresses | `slug.polynet.app`; custom domains through Cloudflare for SaaS | 100 hostnames free, then $0.10 per month each |
| Cookie isolation | Put `polynet.app` on the Public Suffix List (private section) | Stops one community setting cookies for another; how Heroku isolates `herokuapp.com` |
| Sign-in | One central Polynet login (WorkOS, a single redirect URI) → one-time code → the community domain's `/__polynet/auth/callback` sets its own session | WorkOS recommends one redirect URI per multi-tenant app, with the tenant in `state` |
| Session | Existing `communityAppSessions` (hashed, bound to member + community + origin), refreshed by the edge | Already built in #181; reuse |
| API authority | `community_app` principal: member lane, one community, re-checked per request | Already built in #181; invariant 10 |
| Realtime | The edge mints a short-lived JWT; Convex accepts it as a `customJwt` provider (issuer, JWKS, audience) | Supported by Convex auth config |
| Deploy | `polynet deploy` uploads a build → immutable version → KV pointer flip; `polynet rollback` | Workers synchronous first deploy; versions kept |
| Local dev | `polynet dev` runs the app plus a local edge on localhost, against staging | No iframe, so Chrome's localhost blocking does not apply |
| Polynet's own web | Stays on Vercel `polynet` until Polynet home itself moves onto this edge | No forced migration |

## Cost

- **Workers for Platforms:** $25 per month, including 20M requests and 1,000
  scripts; then $0.30 per million requests and $0.02 per extra script.
- **Custom domains:** 100 free, then $0.10 per domain per month.
- **Convex:** unchanged; one Pro deployment (256 concurrent queries and mutations,
  case-by-case increases).

## Risks and limits

- **Convex hot spots:** 32k documents scanned per transaction; unbounded scans
  in `communityResources`, `communityIntelligenceDirectory` and `threads` must
  be bounded before front ends call them directly.
- **Vendor coupling:** front ends are plain static builds, portable to any host.
  Only the edge is Cloudflare-specific.
- **Founder backend logic:** not in v1. Later: per-community custom data inside
  Convex, plus small edge functions calling the API.
- **PSL listing** takes review time; until listed, sessions stay host-only
  cookies (no `Domain=` attribute), which still isolates communities.
- **Founder admin** from custom front ends needs separate management
  operations (invariant 10).

## Build order

1. **Spike:** one Cloudflare dispatch Worker + one user Worker serving the hello
   app at a test subdomain, with `/__polynet/api` proxying to staging.
2. **Sign-in:** central login → code → per-domain session.
3. **Realtime:** Polynet JWT + Convex `customJwt`.
4. **CLI:** `polynet dev`, `polynet deploy`, `polynet rollback`.
5. **Template:** extract today's community UI onto the public API.
6. **Polynet home** moves onto it.

## Sources

- Cloudflare: [how Workers for Platforms works](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/how-workers-for-platforms-works/),
  [static assets](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/configuration/static-assets/),
  [pricing](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/reference/pricing/),
  [SaaS custom hostnames pricing](https://blog.cloudflare.com/waf-for-saas/),
  [a Lovable deployment write-up](https://www.staticbot.dev/blog/lovable-tanstack-cloudflare-workers-deep-dive)
- Shopify: [how we built Oxygen](https://shopify.engineering/how-we-built-oxygen),
  [Hydrogen and Oxygen fundamentals](https://shopify.dev/docs/storefronts/headless/hydrogen/fundamentals)
- Vercel: [multi-project platform limits](https://vercel.com/docs/platforms/multi-project-platforms/reference),
  [multi-tenant limits](https://vercel.com/docs/platforms/multi-tenant-platforms/limits)
- Builders: [Lovable Cloud](https://lovable.dev/blog), [Bolt Cloud](https://bolt.new/blog/bolt-cloud), [Convex Chef](https://docs.convex.dev/chef)
- Convex: [custom JWT providers](https://docs.convex.dev/auth/advanced/custom-jwt),
  [limits](https://docs.convex.dev/production/state/limits)
- Auth and isolation: [WorkOS redirect URIs](https://workos.com/docs/sso/redirect-uris/wildcard-characters),
  [Heroku on cookies and the PSL](https://devcenter.heroku.com/articles/cookies-and-herokuapp-com)
