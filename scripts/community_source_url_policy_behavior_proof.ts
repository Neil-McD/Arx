import assert from "node:assert/strict";

import {
  isDeniedCommunitySourceHostname,
  maybeSafeCommunitySourceUrl,
  requireSafeCommunitySourceFetcherEndpoint,
  requireSafeCommunitySourceUrl,
} from "../convex/communitySourceUrlPolicy.ts";

assert.equal(
  requireSafeCommunitySourceUrl("https://Example.com/path?q=1#section"),
  "https://example.com/path?q=1",
  "safe source URLs should normalize host case and strip fragments",
);
assert.equal(
  requireSafeCommunitySourceFetcherEndpoint("https://polynet-staging.vercel.app/api/source-url-fetch"),
  "https://polynet-staging.vercel.app/api/source-url-fetch",
  "safe fetcher endpoints should pass through normalized",
);

[
  "",
  "not-a-url",
  "http://example.com",
  "https://user:pass@example.com",
  "https://example.com:8443",
  "https://localhost/source",
  "https://app.localhost/source",
  "https://metadata.google.internal/source",
  "https://10.0.0.1/source",
  "https://127.0.0.1/source",
  "https://169.254.1.1/source",
  "https://172.16.0.5/source",
  "https://192.168.1.10/source",
  "https://198.18.0.1/source",
  "https://224.0.0.1/source",
  "https://10-0-0-1.attacker.com/source",
  "https://example.internal/source",
  "https://[::1]/source",
].forEach((url) => {
  assert.equal(maybeSafeCommunitySourceUrl(url), null, `unsafe source URL should be rejected: ${url}`);
});

[
  "localhost",
  "app.localhost",
  "metadata.google.internal",
  "10.0.0.1",
  "10-0-0-1.attacker.com",
  "[::1]",
  "::1",
  "example.internal",
].forEach((hostname) => {
  assert.equal(isDeniedCommunitySourceHostname(hostname), true, `unsafe hostname should be denied: ${hostname}`);
});

[
  "http://polynet-staging.vercel.app/api/source-url-fetch",
  "https://localhost/api/source-url-fetch",
  "https://user:pass@polynet-staging.vercel.app/api/source-url-fetch",
  "https://polynet-staging.vercel.app:8443/api/source-url-fetch",
  "https://polynet-staging.vercel.app/api/source-url-fetch#fragment",
].forEach((endpoint) => {
  assert.throws(
    () => requireSafeCommunitySourceFetcherEndpoint(endpoint),
    /community_source_url_fetcher_invalid|community_source_url_fetcher_not_configured/,
    `unsafe fetcher endpoint should be rejected: ${endpoint}`,
  );
});

console.log("community_source_url_policy_behavior_proof: ok");
