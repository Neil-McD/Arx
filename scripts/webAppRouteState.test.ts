import { describe, expect, it } from "vitest";

import {
  buildAppRoutePath,
  buildCommunityTabPath,
  parseAppRouteFromPathname,
} from "../shared/webAppRouteState";

describe("community channel routes", () => {
  it("keeps General on the backward-compatible chat route", () => {
    expect(buildCommunityTabPath("polynet", "chat")).toBe("/c/polynet/chat");
    expect(buildCommunityTabPath("polynet", "chat", null, null, "general")).toBe(
      "/c/polynet/chat",
    );
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

  it("does not let channel state bleed into another community surface", () => {
    expect(buildAppRoutePath({
      page: "community",
      view: "home",
      settingsPage: "profile",
      communitySlug: "polynet",
      communityTab: "resources",
      communityChannelSlug: "product-feedback",
      communityResourceModuleId: "module-1",
    })).toBe("/c/polynet/resources/module-1");
  });
});
