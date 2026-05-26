# Community Source Crawler

Deployable Crawl4AI-backed crawler for Polynet community source ingestion.

The service exposes the stable contract used by Convex:

- `GET /health`
- `POST /crawl`
- `Authorization: Bearer <token>`

It uses Crawl4AI's `BFSDeepCrawlStrategy` under the hood, but keeps the public
API owned by Polynet so Convex does not depend on Crawl4AI server auth details.

## Deploy

The crawler is intended to run as a separate Fly app.

```bash
flyctl auth login
cd services/community-source-crawler

flyctl apps create polynet-community-source-crawler

CRAWLER_TOKEN="$(openssl rand -hex 32)"
flyctl secrets set ARX_CRAWLER_TOKEN="$CRAWLER_TOKEN"

flyctl deploy
flyctl scale count 3

curl -fsS https://polynet-community-source-crawler.fly.dev/health

npx convex env set --prod ARX_SOURCE_CRAWLER_PROVIDER crawl4ai
npx convex env set --prod ARX_CRAWL4AI_ENDPOINT https://polynet-community-source-crawler.fly.dev
npx convex env set --prod ARX_CRAWL4AI_TOKEN "$CRAWLER_TOKEN"
npm run convex:deploy
```

After Convex deploy, the community source crawler status should report:

```json
{
  "provider": "crawl4ai",
  "configured": true,
  "full_site_crawl_available": true
}
```

## Cost and scale

The default deployment is a three-machine stopped pool:

- `shared-cpu-2x`
- `4096MB` RAM
- zero warm machines
- one active crawl request per machine

Fly starts machines on demand and stops them after idle periods. This keeps idle
cost near root filesystem storage only while preserving up to three concurrent
crawls during onboarding bursts.

If queue wait becomes a product issue, increase the pool:

```bash
flyctl scale count 5
```

Do not increase concurrency per machine until crawl memory has been tested under
real wiki workloads.

## Security

- Do not commit `ARX_CRAWLER_TOKEN`.
- The public Fly service rejects unauthenticated requests.
- The service only accepts HTTPS input URLs.
- Local/private/reserved literal IPs and local-only host suffixes are rejected.
- Convex still preflights source URLs through the source URL fetch broker before
  starting the crawler.
