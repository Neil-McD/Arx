import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildAppRoutePath,
  buildCommunityFunnelPreviewPath,
  buildCommunityTabPath,
  parseAppRouteFromPathname,
  readPublicRouteFromLocation,
} from "../shared/webAppRouteState";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("community channel routes", () => {
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

  it("builds canonical Agent settings and Funnel community routes", () => {
    expect(buildCommunityTabPath("polynet", "settings", null, "agent")).toBe(
      "/c/polynet/settings/agent",
    );
    expect(buildCommunityTabPath("polynet", "funnel")).toBe(
      "/c/polynet/funnel",
    );
  });

  it.each([
    ["/c/polynet/agent", "agent"],
    ["/c/polynet/ai_agent", "agent"],
  ] as const)("maps legacy Agent route %s into Settings", (path, pane) => {
    expect(parseAppRouteFromPathname(path)).toMatchObject({
      page: "community",
      communitySlug: "polynet",
      communityTab: "settings",
      communitySettingsPane: pane,
    });
  });

  it("round-trips the canonical Funnel route", () => {
    expect(parseAppRouteFromPathname("/c/polynet/funnel")).toMatchObject({
      page: "community",
      communitySlug: "polynet",
      communityTab: "funnel",
      communitySettingsPane: null,
    });
  });

  it("keeps the selected funnel slot in the full-preview route", () => {
    expect(buildCommunityFunnelPreviewPath("polynet", "default")).toBe(
      "/c/polynet/preview?slot=default",
    );
    expect(buildCommunityFunnelPreviewPath("polynet", "custom_2")).toBe(
      "/c/polynet/preview?slot=custom_2",
    );
    vi.stubGlobal("window", {
      location: {
        pathname: "/c/polynet/preview",
        search: "?slot=custom_2",
      },
    });
    expect(readPublicRouteFromLocation()).toEqual({
      kind: "community_funnel_preview",
      slug: "polynet",
      slot: "custom_2",
    });
  });

  it("keeps legacy or malformed preview links on Funnel 1", () => {
    vi.stubGlobal("window", {
      location: {
        pathname: "/c/polynet/preview",
        search: "?slot=not-a-funnel",
      },
    });
    expect(readPublicRouteFromLocation()).toMatchObject({
      kind: "community_funnel_preview",
      slot: "custom_1",
    });
  });

  it("canonicalizes the former Settings Funnel route", () => {
    const parsed = parseAppRouteFromPathname("/c/polynet/settings/funnel");
    expect(parsed).toMatchObject({
      page: "community",
      communitySlug: "polynet",
      communityTab: "funnel",
      communitySettingsPane: null,
    });
    expect(buildAppRoutePath(parsed!)).toBe("/c/polynet/funnel");
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
