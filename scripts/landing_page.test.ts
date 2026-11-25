import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
vi.mock("../apps/web/src/posthogAnalytics", () => ({ captureProductAnalyticsEvent: () => undefined }));
vi.mock("../shared/cloudDiscoverGateway", () => ({ listCloudDiscoverCommunities: async () => [] }));
const { ConversionLanding, LANDING_OFFER_LINE, LANDING_PLANS, movedToPricing } = await import("../apps/web/src/components/polynetLanding/ConversionLanding");
const { PricingPage, COMPARE } = await import("../apps/web/src/components/polynetLanding/PricingPage");
const { resolvePublicEntryRoute } = await import("../shared/publicEntryRoute");
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
  const html = renderToStaticMarkup(React.createElement(ConversionLanding, { onJoin: () => undefined })).replace(/&#x27;/g, "'");
  expect(html).toContain("A normal community forgets.");
  expect(html).toContain("Yours will think.");
  for (const heading of ["Stop answering the same question twice.", "Your best answers stop disappearing.",
    "Know who's slipping before they cancel.", "Free to build. Add an AI when you're ready.", "Compare plans"]) {
    expect(html).toContain(heading);
  }
  expect(html).toContain("Recommended");
  // A founder can look around a real community before signing up.
  expect(html).toContain('href="/c/polynet"');
  expect(html).toContain("See it live");
  // Retired or untrue things never appear.
  expect(html.replace(/Polynet/g, "")).not.toMatch(/Coming soon|\bCLI\b|\bSDK\b|RSVP|\bMCP\b|zero-AI|trained on|Most popular|Get started/);
  // Every button into the product is the same door.
  expect(html.match(/Start a community/g)?.length).toBeGreaterThanOrEqual(4);
});

const pricingHtml = () =>
  renderToStaticMarkup(React.createElement(PricingPage, { onJoin: () => undefined })).replace(/&#x27;/g, "'");
const pricingIds = new Set([...pricingHtml().matchAll(/ id="([^"]+)"/g)].map((match) => match[1]));

test("every link on the page goes somewhere that exists", () => {
  const html = renderToStaticMarkup(React.createElement(ConversionLanding, { onJoin: () => undefined }));
  const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]));
  const hrefs = [...new Set([...html.matchAll(/ href="([^"]+)"/g)].map((match) => match[1]))];
  const pages = new Set(["/", "/ai", "/discover", "/pricing", "/login", "/terms", "/privacy", "/c/polynet"]);
  for (const href of hrefs) {
    if (href.startsWith("mailto:")) continue;
    if (href.startsWith("/#")) expect(ids.has(href.slice(2)), href).toBe(true);
    else if (href.startsWith("/pricing#")) expect(pricingIds.has(href.slice("/pricing#".length)), href).toBe(true);
    else expect(pages.has(href), href).toBe(true);
  }
  // The three things the AI does each have a place to land on.
  for (const id of ["guide", "brain", "chief-of-staff"]) expect(ids.has(id), id).toBe(true);
  // The site's frame: Product and Resources menus, the statement with its figures, a full footer.
  expect(html).toContain('aria-controls="product-menu"');
  expect(html).toContain('aria-controls="resources-menu"');
  expect(html).toContain("Communities that think.");
  for (const label of ["FIG 0.1", "FIG 0.2", "FIG 0.3", "It learns", "It acts", "You decide"]) expect(html).toContain(label);
  expect(html).toContain("Operated by EXECUTIVEINTELLIGENCE LLC.");
});

test("the pricing page has the plans, what every plan includes, a full comparison and the questions", () => {
  const html = pricingHtml();
  for (const label of ["Start free", "Start with Guide", "Start with Chief of Staff", "Recommended"]) expect(html).toContain(label);
  for (const id of ["pricing-title", "included", "compare", "questions"]) expect(pricingIds.has(id), id).toBe(true);
  expect(html).toContain('<h1 id="pricing-title">Pricing</h1>');
  // Every row of the table has one cell per plan.
  for (const group of COMPARE) for (const row of group.rows) expect(row.cells, row.name).toHaveLength(LANDING_PLANS.length);
  const guide = POLYNET_FOUNDER_TIER_CATALOG.guide;
  const chief = POLYNET_FOUNDER_TIER_CATALOG.chief_of_staff;
  const rows = COMPARE.flatMap((group) => group.rows);
  expect(rows.find((row) => row.name === "AI included each month")!.cells)
    .toEqual([false, `$${guide.includedCostMicros / 1_000_000}`, `$${chief.includedCostMicros / 1_000_000}`]);
  // Only Chief of Staff has the proactive work.
  expect(rows.find((row) => row.name === "Morning brief for you")!.cells).toEqual([false, false, true]);
  expect(html.replace(/Polynet/g, "")).not.toMatch(/Coming soon|RSVP|trained on|Most popular|unlimited AI/i);
});

test("old home page links to pricing and questions open the pricing page", () => {
  expect(movedToPricing("#pricing")).toBe("/pricing");
  expect(movedToPricing("#pricing-title")).toBe("/pricing");
  expect(movedToPricing("#questions")).toBe("/pricing#questions");
  expect(movedToPricing("#included")).toBe("/pricing#included");
  expect(movedToPricing("#guide")).toBeNull();
  expect(movedToPricing("")).toBeNull();
  expect(resolvePublicEntryRoute({ pathname: "/pricing" })).toEqual({ kind: "pricing" });
  expect(resolvePublicEntryRoute({ pathname: "/pricing/" })).toEqual({ kind: "pricing" });
  expect(resolvePublicEntryRoute({ pathname: "/pricing/extra" })).toBeNull();
});

test("on a phone one Menu button holds every top-bar link", () => {
  const html = renderToStaticMarkup(React.createElement(ConversionLanding, { onJoin: () => undefined }));
  expect(html).toContain('aria-controls="phone-menu"');
  expect(html).toContain('aria-label="Open menu"');
});
