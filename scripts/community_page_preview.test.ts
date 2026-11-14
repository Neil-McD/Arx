import { expect, test } from "vitest";
// @ts-expect-error: a plain JavaScript Vercel function
import { isPolynetHost, withCommunityPreview } from "../api/community-page.js";

const INDEX = `<head>
    <title>Polynet · Communities that think</title>
    <meta name="description" content="Default." />
    <meta property="og:title" content="Polynet · Communities that think" />
    <meta property="og:description" content="Default." />
    <meta property="og:url" content="https://www.polynet.ai/" />
    <meta property="og:image" content="https://www.polynet.ai/og-image.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:title" content="Polynet · Communities that think" />
    <meta name="twitter:description" content="Default." />
    <meta name="twitter:image" content="https://www.polynet.ai/og-image.png" />
  </head>`;

test("a shared community link shows its name, one-liner and banner; unlisted ones ask not to be indexed", () => {
  const html = withCommunityPreview(INDEX, {
    listed: false,
    community: { name: "Sunrise <Club>", one_liner: "Early \"sessions\".", banner_url: "https://cdn.example.com/b.jpg", avatar_url: null },
  }, "https://www.polynet.ai/c/sunrise");
  expect(html).toContain("<title>Sunrise &lt;Club&gt; · Polynet</title>");
  expect(html).toContain('<meta property="og:title" content="Sunrise &lt;Club&gt;" />');
  expect(html).toContain('<meta property="og:description" content="Early &quot;sessions&quot;." />');
  expect(html).toContain('<meta property="og:image" content="https://cdn.example.com/b.jpg" />');
  expect(html).toContain('<meta property="og:url" content="https://www.polynet.ai/c/sunrise" />');
  expect(html).not.toContain("og:image:width");
  expect(html).toContain('<meta name="robots" content="noindex" />');
});

test("no https image keeps Polynet's card; a listed community stays indexable; only Polynet hosts", () => {
  const html = withCommunityPreview(INDEX, { listed: true, community: { name: "Bread Club", one_liner: null, banner_url: "http://x/y.jpg" } }, "https://www.polynet.ai/c/bread");
  expect(html).toContain('<meta property="og:image" content="https://www.polynet.ai/og-image.png" />');
  expect(html).toContain('content="Join Bread Club on Polynet."');
  expect(html).not.toContain("noindex");
  expect(isPolynetHost("www.polynet.ai")).toBe(true);
  expect(isPolynetHost("polynet-staging.vercel.app")).toBe(true);
  expect(isPolynetHost("evil.example.com")).toBe(false);
  expect(isPolynetHost("polynet.ai.evil.com")).toBe(false);
});

test("a signed-out checkout's visitor is a keyed hash of their address, never the address", async () => {
  // @ts-expect-error: a plain JavaScript Vercel function
  const { visitorAddress, visitorHash } = await import("../api/community-checkout.js");
  expect(visitorAddress({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" })).toBe("203.0.113.7");
  expect(visitorAddress({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" })).toBe("198.51.100.1");
  const hash = visitorHash("203.0.113.7", "secret-a");
  expect(hash).toMatch(/^[a-f0-9]{64}$/);
  expect(hash).not.toContain("203");
  expect(visitorHash("203.0.113.7", "secret-b")).not.toBe(hash);
});
