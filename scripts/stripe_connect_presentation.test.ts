import { expect, test } from "vitest";
import { buildStripeConnectPresentation } from "../apps/web/src/controllers/buildStripeConnectPresentation";

const status = (stripeConnect: Record<string, unknown>) => ({
  platform_fee_bps: 290,
  stripe_connect: {
    status: "ready", country: "US", service_agreement: "full", can_receive_community_revenue: true,
    requirements_currently_due: [], ...stripeConnect,
  },
}) as any;

test("an owner whose Stripe account is payouts-only is told, in plain words, that members can't pay yet", () => {
  const presentation = buildStripeConnectPresentation({
    accountCommerceStatus: status({ country: "KW", service_agreement: "recipient", can_receive_community_revenue: false }),
    surface: "community",
  });
  expect(presentation.isReady).toBe(false);
  expect(presentation.statusTitle).toBe("Members can't pay to join yet");
  expect(presentation.statusMessage).toMatch(/payouts only, not card payments/);
  expect(presentation.statusMessage).toMatch(/Free joining still works/);
});

test("a fully set-up account is ready for paid joining", () => {
  const presentation = buildStripeConnectPresentation({ accountCommerceStatus: status({}), surface: "community" });
  expect(presentation.isReady).toBe(true);
  expect(presentation.statusTitle).toBe("Ready for paid community subscriptions");
});
