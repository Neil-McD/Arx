import { expect, test } from "vitest";
import { selectInitialLandingPlanIndex } from "../apps/web/src/components/WebCommunityLandingPage";
import {
  buildOAuthRedirectUrl,
  isConnectedAppAuthorizePathname,
} from "../apps/web/src/components/WebConnectedAppAuthorizePage";

test("selectInitialLandingPlanIndex pre-selects requested tier or billing period cleanly", () => {
  const plans = [
    { plan: null, billing_period: "monthly" },
    { plan: null, billing_period: "annual" },
    { plan: "setter", billing_period: "monthly" },
    { plan: "cris", billing_period: "monthly" },
  ];
  expect(selectInitialLandingPlanIndex(plans, null)).toBe(0);
  expect(selectInitialLandingPlanIndex(plans, "member")).toBe(0);
  expect(selectInitialLandingPlanIndex(plans, "member", "annual")).toBe(1);
  expect(selectInitialLandingPlanIndex(plans, null, "annual")).toBe(1);
  expect(selectInitialLandingPlanIndex(plans, "setter")).toBe(2);
  expect(selectInitialLandingPlanIndex(plans, "CRIS")).toBe(3);
  expect(selectInitialLandingPlanIndex(plans, "unknown")).toBe(0);
});

test("OAuth authorize pathname matcher and redirect URL builder preserve query state cleanly", () => {
  expect(isConnectedAppAuthorizePathname("/oauth/authorize")).toBe(true);
  expect(isConnectedAppAuthorizePathname("/oauth/authorize/")).toBe(true);
  expect(isConnectedAppAuthorizePathname("/m/oauth/authorize")).toBe(true);
  expect(isConnectedAppAuthorizePathname("/oauth/other")).toBe(false);
  expect(isConnectedAppAuthorizePathname("/login")).toBe(false);

  expect(
    buildOAuthRedirectUrl("https://app.example.com/api/auth/callback?existing=1", {
      code: "pcode_123",
      state: "xyz",
    }),
  ).toBe("https://app.example.com/api/auth/callback?existing=1&code=pcode_123&state=xyz");
  expect(
    buildOAuthRedirectUrl("http://localhost:3000/callback", {
      error: "access_denied",
      state: "abc",
    }),
  ).toBe("http://localhost:3000/callback?error=access_denied&state=abc");
});
