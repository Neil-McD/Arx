import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

import { formatPlanPrice } from "../shared/accountCommerce";
import { communitySiteAddress } from "../shared/communitySlug";

test("prices read like prices: thousands separated, cents only when there are any", () => {
  const plan = (amount: number, period = "monthly") => ({ amount_base_units: amount, currency: "usd", currency_decimals: 2, billing_period: period }) as any;
  expect(formatPlanPrice(plan(350_000))).toBe("$3,500/month");
  expect(formatPlanPrice(plan(2_900))).toBe("$29/month");
  expect(formatPlanPrice(plan(2_999))).toBe("$29.99/month");
  expect(formatPlanPrice(plan(120_000, "annual"))).toBe("$1,200/year");
});

test("a community's address is its own site, on this environment's suffix once it has one", () => {
  expect(communitySiteAddress("dawn-club")).toBe("dawn-club.polynet.page");
  expect(communitySiteAddress("")).toBe("your-community.polynet.page");
  expect(communitySiteAddress("new-name", { slug: "old-name", site_url: "https://old-name-staging.polynet.page" })).toBe("new-name-staging.polynet.page");
  expect(communitySiteAddress("same", { slug: "same", site_url: "https://same.polynet.page/" })).toBe("same.polynet.page");
});

test("a visitor reaching a community through Studio (its link, Discover) lands on its doorstep; a member lands in the app", () => {
  const handoff = readFileSync(new URL("../apps/web/src/components/WebCommunityHandoff.tsx", import.meta.url), "utf8");
  // Members always use the app (Nov 13); only visitors are sent to the site's doorstep.
  expect(handoff).toMatch(/props\.membership === "member"\) \{\s*return window\.location\.replace\(`\/c\/\$\{encodeURIComponent\(community\.slug\)\}\/home`\)/);
  expect(handoff).toMatch(/window\.location\.replace\(`\$\{new URL\(target\)\.origin\}\/join`\)/);
});
