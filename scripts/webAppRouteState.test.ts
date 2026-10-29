import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildAppRoutePath,
  buildCommunityHomePath,
  buildCommunityTabPath,
  deriveWebDestinationFromAppRoute,
  deriveWebDestinationFromPath,
  parseAppRouteFromPathname,
  readPublicRouteFromLocation,
  resolveInitialAppShellVariant,
  resolvePhoneShellRedirect,
  webDestinationHasCommunityNavSelection,
} from "../shared/webAppRouteState";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("installed app shell selection", () => {
  it("opens new standalone installs in the mobile shell", () => {
    expect(resolveInitialAppShellVariant({
      pathname: "/m",
      search: "?launch=app",
      standalone: true,
    })).toBe("mobile");
  });

  it("keeps already-installed legacy launch URLs in the mobile shell", () => {
    expect(resolveInitialAppShellVariant({
      pathname: "/workspace",
      search: "?launch=app",
      standalone: true,
    })).toBe("mobile");
  });

  it("does not turn an ordinary browser workspace route into mobile", () => {
    expect(resolveInitialAppShellVariant({
      pathname: "/workspace",
      search: "?launch=app",
      standalone: false,
    })).toBe("standard");
  });

  it("preserves the OAuth callback shell authority", () => {
    expect(resolveInitialAppShellVariant({
      pathname: "/m",
      search: "?launch=app",
      oauthShellVariant: "standard",
      standalone: true,
    })).toBe("standard");
  });
});

describe("community channel routes", () => {
  it("round-trips the mobile community directory route", () => {
    const path = buildCommunityHomePath("polynet");
    expect(path).toBe("/c/polynet/home");
    expect(parseAppRouteFromPathname(path ?? "")).toMatchObject({
      page: "community",
      view: "community_home",
      communitySlug: "polynet",
      communityTab: "chat",
      communityChannelSlug: null,
    });
  });

  it("keeps the Members route for layouts that show a Members page", () => {
    const parsed = parseAppRouteFromPathname("/c/polynet/members");
    expect(parsed).toMatchObject({
      page: "community",
      view: "home",
      communitySlug: "polynet",
      communityTab: "members",
      communityChannelSlug: null,
    });
    expect(buildAppRoutePath(parsed!)).toBe("/c/polynet/members");
  });

  it("keeps General on the backward-compatible chat route", () => {
    expect(buildCommunityTabPath("polynet", "chat")).toBe("/c/polynet/chat");
    expect(
      buildCommunityTabPath("polynet", "chat", null, null, "general"),
    ).toBe("/c/polynet/chat");
  });

  it("round-trips a custom channel slug", () => {
    const path = buildCommunityTabPath(
      "polynet",
      "chat",
      null,
      null,
      "product-feedback",
    );
    expect(path).toBe("/c/polynet/chat/product-feedback");
    expect(parseAppRouteFromPathname(path ?? "")).toMatchObject({
      page: "community",
      communitySlug: "polynet",
      communityTab: "chat",
      communityChannelSlug: "product-feedback",
    });
  });

  it("normalizes the retired standalone memory route back to community chat", () => {
    expect(parseAppRouteFromPathname("/c/polynet/polynet")).toMatchObject({
      page: "community",
      communitySlug: "polynet",
      communityTab: "chat",
      communityChannelSlug: null,
    });
  });

  it("builds canonical Agent settings, Workflows, and Funnel community routes", () => {
    expect(buildCommunityTabPath("polynet", "settings", null, "agent")).toBe(
      "/c/polynet/settings/agent",
    );
    expect(buildCommunityTabPath("polynet", "funnel")).toBe(
      "/c/polynet/funnel",
    );
    expect(buildCommunityTabPath("polynet", "workflows")).toBe(
      "/c/polynet/workflows",
    );
  });

  it.each([
    ["/c/polynet/ai_agent", "agent"],
  ] as const)("maps legacy Agent route %s into Settings", (path, pane) => {
    expect(parseAppRouteFromPathname(path)).toMatchObject({
      page: "community",
      communitySlug: "polynet",
      communityTab: "settings",
      communitySettingsPane: pane,
    });
  });

  it("routes retired Funnel links to community Settings", () => {
    expect(parseAppRouteFromPathname("/c/polynet/funnel")).toMatchObject({
      page: "community",
      communitySlug: "polynet",
      communityTab: "settings",
      communitySettingsPane: "community",
    });
  });

  it("routes retired draft previews to the public landing page", () => {
    vi.stubGlobal("window", {
      location: {
        pathname: "/c/polynet/preview",
        search: "?slot=custom_2",
      },
    });
    expect(readPublicRouteFromLocation()).toEqual({
      kind: "community_funnel",
      slug: "polynet",
    });
  });

  it("routes the former Settings Funnel route to community Settings", () => {
    const parsed = parseAppRouteFromPathname("/c/polynet/settings/funnel");
    expect(parsed).toMatchObject({
      page: "community",
      communitySlug: "polynet",
      communityTab: "settings",
      communitySettingsPane: "community",
    });
    expect(buildAppRoutePath(parsed!)).toBe("/c/polynet/settings/community");
  });

  it("does not let channel state bleed into another community surface", () => {
    expect(
      buildAppRoutePath({
      page: "community",
      view: "home",
      settingsPage: "profile",
      communitySlug: "polynet",
      communityTab: "resources",
      communityChannelSlug: "product-feedback",
      communityResourceModuleId: "module-1",
      }),
    ).toBe("/c/polynet/resources/module-1");
  });
});

describe("canonical web destinations", () => {
  it.each([
    ["/", { kind: "platform_entry" }],
    ["/m", { kind: "platform_entry" }],
    ["/onboarding", { kind: "onboarding" }],
    ["/m/onboarding", { kind: "onboarding" }],
    ["/discover", { kind: "discover" }],
    ["/m/discover", { kind: "discover" }],
    ["/docs", { kind: "docs", slug: null }],
    ["/m/docs/getting-started/intro", { kind: "docs", slug: "getting-started/intro" }],
    ["/operator", { kind: "operator", tab: "platform" }],
    ["/m/operator/business", { kind: "operator", tab: "business" }],
    ["/settings", { kind: "global_settings", index: true }],
    ["/m/settings/profile", { kind: "global_settings", page: "profile", index: false }],
    ["/c/polynet", { kind: "community_funnel", slug: "polynet" }],
    ["/m/c/polynet", { kind: "community_funnel", slug: "polynet" }],
    ["/c/polynet/preview", { kind: "community_funnel", slug: "polynet" }],
    ["/m/c/polynet/onboarding/preview", { kind: "community_chat", slug: "polynet", channelSlug: null }],
    ["/m/c/polynet/home", { kind: "community_home", slug: "polynet" }],
    ["/m/c/polynet/members", { kind: "community_members", slug: "polynet" }],
    ["/m/c/polynet/people", { kind: "community_people", slug: "polynet" }],
    ["/m/c/polynet/chat", { kind: "community_chat", slug: "polynet", channelSlug: null }],
    ["/m/c/polynet/chat/wins", { kind: "community_chat", slug: "polynet", channelSlug: "wins" }],
    ["/m/c/polynet/resources/module-1", { kind: "community_resources", slug: "polynet", moduleId: "module-1" }],
    ["/m/c/polynet/events", { kind: "community_events", slug: "polynet" }],
    ["/m/c/polynet/settings/agent", { kind: "community_settings", slug: "polynet", pane: "agent" }],
    ["/m/c/polynet/workflows", { kind: "community_workflows", slug: "polynet" }],
    ["/m/c/polynet/funnel", { kind: "community_settings", slug: "polynet", pane: "community" }],
    ["/m/c/polynet/analytics", { kind: "community_analytics", slug: "polynet" }],
  ] as const)("derives %s without changing desktop/mobile semantics", (path, expected) => {
    expect(deriveWebDestinationFromPath(path)).toMatchObject(expected);
  });

  it.each([
    ["/", "/m"],
    ["/onboarding", "/m/onboarding"],
    ["/discover", "/m/discover"],
    ["/docs/getting-started", "/m/docs/getting-started"],
    ["/operator/communities", "/m/operator/communities"],
    ["/settings/appearance", "/m/settings/appearance"],
    ["/c/polynet", "/m/c/polynet"],
    ["/c/polynet/preview", "/m/c/polynet/preview"],
    ["/c/polynet/onboarding/preview", "/m/c/polynet/onboarding/preview"],
    ["/c/polynet/home", "/m/c/polynet/home"],
    ["/c/polynet/members", "/m/c/polynet/members"],
    ["/c/polynet/chat/wins", "/m/c/polynet/chat/wins"],
    ["/c/polynet/resources/module-1", "/m/c/polynet/resources/module-1"],
    ["/c/polynet/events", "/m/c/polynet/events"],
    ["/c/polynet/settings/agent", "/m/c/polynet/settings/agent"],
    ["/c/polynet/workflows", "/m/c/polynet/workflows"],
    ["/c/polynet/funnel", "/m/c/polynet/funnel"],
    ["/c/polynet/analytics", "/m/c/polynet/analytics"],
  ] as const)("keeps %s and %s semantically identical", (desktopPath, mobilePath) => {
    expect(deriveWebDestinationFromPath(mobilePath)).toEqual(
      deriveWebDestinationFromPath(desktopPath),
    );
  });

  it.each(["/unknown", "/m/unknown", "/operator/platform/extra", "/c"])(
    "rejects unknown route %s",
    (path) => {
      expect(deriveWebDestinationFromPath(path)).toBeNull();
    },
  );


  it("selects navigation only for an actual community destination", () => {
    expect(webDestinationHasCommunityNavSelection({
      kind: "community_home",
      slug: "polynet",
    })).toBe(false);
    expect(webDestinationHasCommunityNavSelection({
      kind: "community_chat",
      slug: "polynet",
      channelSlug: null,
    })).toBe(true);
    expect(webDestinationHasCommunityNavSelection({
      kind: "community_resources",
      slug: "polynet",
      moduleId: null,
    })).toBe(true);
    expect(webDestinationHasCommunityNavSelection({
      kind: "community_events",
      slug: "polynet",
    })).toBe(true);
    expect(webDestinationHasCommunityNavSelection({
      kind: "community_workflows",
      slug: "polynet",
    })).toBe(true);
  });

  it("keeps public completion tokens in the semantic destination", () => {
    expect(
      deriveWebDestinationFromPath("/m/checkout/success?session_id=cs_123"),
    ).toEqual({ kind: "checkout_success", sessionId: "cs_123" });
    expect(deriveWebDestinationFromPath("/m/claim?token=claim_123")).toEqual({
      kind: "claim",
      token: "claim_123",
    });
  });
});

describe("phone layout redirect", () => {
  const phone = { narrowViewport: true, embedded: false };

  it("sends phones on community and settings links to the phone layout", () => {
    expect(resolvePhoneShellRedirect({ ...phone, path: "/c/aieb/chat" })).toBe("/m/c/aieb/chat");
    expect(resolvePhoneShellRedirect({ ...phone, path: "/c/aieb/workflows?section=forms#x" })).toBe("/m/c/aieb/workflows?section=forms#x");
    expect(resolvePhoneShellRedirect({ ...phone, path: "/settings/profile" })).toBe("/m/settings/profile");
    expect(resolvePhoneShellRedirect({ ...phone, path: "/c/aieb" })).toBe("/m/c/aieb");
  });

  it("leaves wide screens, embedded previews and phone links alone", () => {
    expect(resolvePhoneShellRedirect({ narrowViewport: false, embedded: false, path: "/c/aieb/chat" })).toBeNull();
    expect(resolvePhoneShellRedirect({ narrowViewport: true, embedded: true, path: "/c/aieb/chat" })).toBeNull();
    expect(resolvePhoneShellRedirect({ ...phone, path: "/c/aieb/preview?slot=default&embed=1" })).toBeNull();
    expect(resolvePhoneShellRedirect({ ...phone, path: "/m/c/aieb/chat" })).toBeNull();
    expect(resolvePhoneShellRedirect({ ...phone, path: "/" })).toBeNull();
    expect(resolvePhoneShellRedirect({ ...phone, path: "/login" })).toBeNull();
  });
});
