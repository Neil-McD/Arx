import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
vi.mock("../apps/web/src/posthogAnalytics", () => ({ captureProductAnalyticsEvent: () => undefined }));
vi.mock("../shared/cloudDiscoverGateway", () => ({ listCloudDiscoverCommunities: async () => [] }));
const { ConversionLanding, LANDING_OFFER_LINE, LANDING_PLANS } = await import("../apps/web/src/components/polynetLanding/ConversionLanding");
const { POLYNET_FOUNDER_TIER_CATALOG } = await import("../shared/founderPlan");

test("the landing page's prices are the ones checkout charges", () => {
  const guide = POLYNET_FOUNDER_TIER_CATALOG.guide;
  const chief = POLYNET_FOUNDER_TIER_CATALOG.chief_of_staff;
  expect(LANDING_PLANS.map((plan) => [plan.name, plan.price])).toEqual([
    ["Free", "$0"],
    ["Guide", `$${guide.monthlyPriceBaseUnits / 100}`],
    ["Chief of Staff", `$${chief.monthlyPriceBaseUnits / 100}`],
  ]);
  expect(LANDING_PLANS[1].ai).toContain(`$${guide.includedCostMicros / 1_000_000} of AI`);
  expect(LANDING_PLANS[2].ai).toContain(`$${chief.includedCostMicros / 1_000_000} of AI`);
  expect(LANDING_OFFER_LINE).toBe("Free to build · Guide $20/mo · Chief of Staff $100/mo");
  // Chief of Staff is the one plan lit up.
  expect(LANDING_PLANS.filter((plan) => plan.lit).map((plan) => plan.name)).toEqual(["Chief of Staff"]);
});

test("the page sells the product in plain words, with one door in", () => {
  const html = renderToStaticMarkup(React.createElement(ConversionLanding, { onJoin: () => undefined }));
  expect(html).toContain("A normal community forgets.");
  expect(html).toContain("Yours will think.");
  for (const heading of ["Communities take more work than they should.", "It answers members any hour of the day.",
    "It remembers what your community learns.", "It helps you run the community every day.", "Pricing", "Questions"]) {
    expect(html).toContain(heading);
  }
  expect(html).toContain("Recommended");
  // Retired or untrue things never appear.
  expect(html).not.toMatch(/Coming soon|CLI|SDK|RSVP|MCP|zero-AI|trained on|Most popular/);
  // Every button into the product is the same door.
  expect(html.match(/Start a community|Get started/g)?.length).toBeGreaterThanOrEqual(6);
});
