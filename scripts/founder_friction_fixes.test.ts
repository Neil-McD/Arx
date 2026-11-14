import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

import { formatPlanPrice } from "../shared/accountCommerce";
import { communityPageAddress } from "../shared/communitySlug";

test("prices read like prices: thousands separated, cents only when there are any", () => {
  const plan = (amount: number, period = "monthly") => ({ amount_base_units: amount, currency: "usd", currency_decimals: 2, billing_period: period }) as any;
  expect(formatPlanPrice(plan(350_000))).toBe("$3,500/month");
  expect(formatPlanPrice(plan(2_900))).toBe("$29/month");
  expect(formatPlanPrice(plan(2_999))).toBe("$29.99/month");
  expect(formatPlanPrice(plan(120_000, "annual"))).toBe("$1,200/year");
});

test("a community's address is its landing page in the app", () => {
  expect(communityPageAddress("dawn-club", "www.polynet.ai")).toBe("www.polynet.ai/c/dawn-club");
  expect(communityPageAddress("", "www.polynet.ai")).toBe("www.polynet.ai/c/your-community");
});

test("a community's link opens its landing page in the app: visitors join there, a member opens the community", () => {
  const page = readFileSync(new URL("../apps/web/src/components/WebCommunityLandingPage.tsx", import.meta.url), "utf8");
  // Nov 13: no site hand-off; the page itself sells the community and lets people in.
  expect(page).not.toMatch(/site_url|polynet\.page/);
  expect(page).toMatch(/viewer\?\.state === "member"[\s\S]*Open community/);
  expect(page).toMatch(/d\.gate === "checkout"[\s\S]*startCommunityLandingCheckout|checkout = useCallback[\s\S]*startCommunityLandingCheckout/);
});
