import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { buildConnectedAppSetupPrompt } from "../shared/connectedAppSetupPrompt";

const guide = readFileSync(join(__dirname, "..", "docs", "product", "guides", "connect-your-app.md"), "utf8");

test("the setup prompt is self-contained: the whole guide plus this community's values, and no secret", () => {
  const prompt = buildConnectedAppSetupPrompt({
    communityName: "Distribution Engineer", appName: "DE", appId: "app_abc123", apiOrigin: "https://example.convex.site",
    hasWebhook: true, guide,
    tiers: [
      { key: "member", name: "Connect", grants: ["de:connect"] },
      { key: "setter", name: "Setter", grants: ["de:setter"] },
    ],
  });
  // The values the agent needs.
  expect(prompt).toContain("POLYNET_API_ORIGIN = https://example.convex.site");
  expect(prompt).toContain("DE (app_abc123)");
  expect(prompt).toContain("Connect: tier key `member` (the base membership: leave `tier` out); grants `community`, `de:connect`");
  expect(prompt).toContain("Setter: tier key `setter`; grants `community`, `de:setter`");
  expect(prompt).toContain("POLYNET_WEBHOOK_SECRET");
  // The guide itself, every step, without its front matter.
  for (const heading of ["## 1. Report Your Own Sales", "## 2. Ask What Someone Has", "## 3. Hear When It Changes (Optional)", "## 4. Link Both Ways", "## Rules", "## Check It Works"]) {
    expect(prompt).toContain(heading);
  }
  expect(prompt).not.toMatch(/^---\nid: product\.guide/m);
  // Never a secret: the builder sets those in their own environment.
  expect(prompt).not.toMatch(/psk_[a-f0-9]{48}/);
  expect(prompt).not.toMatch(/whsec_[A-Za-z0-9+/=]{20,}/);
  expect(prompt).toContain("never hard-code, log or commit it");
});

test("the prompt carries the community link and has the agent propose placements, not pick them", () => {
  const prompt = buildConnectedAppSetupPrompt({
    communityName: "X", appName: "App", appId: "app_1", apiOrigin: "https://o", hasWebhook: false, guide, tiers: [],
    communityUrl: "https://staging.example/c/x", hasAppLink: true,
  });
  expect(prompt).toContain("- Community link: https://staging.example/c/x");
  expect(prompt).toContain("Polynet already links members to this app");
  expect(prompt).toContain("Ask me which to add before adding any");
  const without = buildConnectedAppSetupPrompt({ communityName: "X", appName: "App", appId: "app_1", apiOrigin: "https://o", hasWebhook: false, guide, tiers: [] });
  expect(without).toContain("I'll set its address under Your app");
});

test("without a webhook the webhook step is optional and no webhook secret is asked for", () => {
  const prompt = buildConnectedAppSetupPrompt({ communityName: "X", appName: "App", appId: "app_1", apiOrigin: "https://o", hasWebhook: false, guide, tiers: [] });
  expect(prompt).toContain("(Optional) If you add a webhook address in Polynet later");
  expect(prompt).not.toContain("POLYNET_WEBHOOK_SECRET: same");
  expect(prompt).toContain("No plans named yet");
});

test("the guide's code uses the routes Polynet serves", () => {
  const routes = readFileSync(join(__dirname, "..", "convex", "httpConnectedApps.ts"), "utf8");
  expect(routes).toContain('"/apps/v1/access"');
  expect(routes).toContain('"/apps/v1/sales"');
  expect(guide).toContain("/apps/v1/sales");
  expect(guide).toContain("/apps/v1/access?email=");
});

test("the guide's webhook check accepts Polynet's real signature and rejects a tampered body", async () => {
  const { createHmac } = await import("node:crypto");
  const { signStandardWebhook } = await import("../convex/connectedApps");
  const secret = `whsec_${Buffer.from("polynet-test-signing-key-123456").toString("base64")}`;
  const id = "evt_123";
  const timestamp = 1_800_000_000;
  const body = JSON.stringify({ type: "access.changed", data: { email: "a@b.co" }, occurred_at: "2026-11-12T00:00:00.000Z" });
  const sent = await signStandardWebhook(secret, id, timestamp, body);
  // Exactly as the guide computes it.
  const verify = (rawBody: string) => `v1,${createHmac("sha256", Buffer.from(secret.replace(/^whsec_/, ""), "base64")).update(`${id}.${timestamp}.${rawBody}`).digest("base64")}`;
  expect(verify(body)).toBe(sent);
  expect(verify(body.replace("a@b.co", "x@b.co"))).not.toBe(sent);
});
