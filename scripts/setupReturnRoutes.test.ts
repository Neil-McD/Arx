import { describe, expect, it } from "vitest";
import {
  buildOnboardingUrlForCommunityReturn,
  buildSetupReturnUrl,
  readSetupReturnTargetFromSearch,
  sanitizeOAuthAuthorizeReturnPath,
} from "../shared/webAppRouteState";

describe("setup and OAuth return route helpers", () => {
  const validAppId = "app_0123456789abcdef0123";
  const validOAuthPath = `/oauth/authorize?response_type=code&client_id=${validAppId}&redirect_uri=${encodeURIComponent("https://app.example.com/callback")}&code_challenge=abc123&code_challenge_method=S256`;

  it("preserves community slug, selected plan, period, and appId across onboarding", () => {
    const onboardingUrl = buildOnboardingUrlForCommunityReturn({
      community: "Acme-Club",
      plan: "pro_tier",
      period: "annual",
      app: validAppId,
    });
    expect(onboardingUrl).toBe(`/onboarding?community=acme-club&plan=pro_tier&period=annual&app=${validAppId}`);

    const target = readSetupReturnTargetFromSearch(onboardingUrl.split("?")[1]);
    expect(target).toEqual({
      kind: "community",
      community: "acme-club",
      plan: "pro_tier",
      period: "annual",
      app: validAppId,
    });
    expect(buildSetupReturnUrl(target!)).toBe(
      `/c/acme-club?intent=join&plan=pro_tier&period=annual&app=${validAppId}`,
    );
  });

  it("drops invalid plan, period, and app parameters while keeping valid community return", () => {
    const target = readSetupReturnTargetFromSearch("community=acme&plan=https://evil.com&period=weekly&app=bad");
    expect(target).toEqual({
      kind: "community",
      community: "acme",
      plan: null,
      period: null,
      app: null,
    });
    expect(buildSetupReturnUrl(target!)).toBe("/c/acme?intent=join");
  });

  it("strictly validates OAuth authorize return paths and rejects open redirects", () => {
    expect(sanitizeOAuthAuthorizeReturnPath(validOAuthPath, validAppId)).toBe(validOAuthPath);
    expect(sanitizeOAuthAuthorizeReturnPath(validOAuthPath, "app_ffffffffffffffffffff")).toBeNull();
    expect(buildSetupReturnUrl({ kind: "oauth", path: validOAuthPath })).toBe(validOAuthPath);

    for (const bad of [
      "https://evil.example.com/oauth/authorize?response_type=code&client_id=app_0123456789abcdef0123&redirect_uri=https://a.com",
      "//evil.example.com/oauth/authorize?response_type=code&client_id=app_0123456789abcdef0123&redirect_uri=https://a.com",
      "/oauth/authorize\\@evil.com?response_type=code&client_id=app_0123456789abcdef0123&redirect_uri=https://a.com",
      "/c/acme",
      "/oauth/authorize?response_type=token&client_id=app_0123456789abcdef0123&redirect_uri=https://a.com",
      "/oauth/authorize?response_type=code&client_id=bad&redirect_uri=https://a.com",
      "",
    ]) {
      expect(sanitizeOAuthAuthorizeReturnPath(bad), bad).toBeNull();
    }
  });
});
