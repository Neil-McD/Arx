import { expect, test } from "vitest";
import { coerceOverview } from "../shared/cloudFounderBillingGateway";

const row = (mode: unknown) => ({
  community_id: "c1", community_name: "Night Swimmers", community_slug: "night-swimmers",
  lifecycle_status: "archived", lifecycle_generation: 1, builder_access_mode: mode,
  archive_billing_cleanup_status: "complete", funding_mode: "managed", funding_lane: "builder",
  funding_state: "builder_required", allowed_actions: [],
});

test("the billing overview keeps a community's free mode (free communities restore without payment)", () => {
  const modes = ["free", "grandfathered", "subscription_required", "bogus"].map((mode) =>
    coerceOverview({ communities: [row(mode)] }).communities[0]?.builder_access_mode);
  expect(modes).toEqual(["free", "grandfathered", "subscription_required", "invalid"]);
});
