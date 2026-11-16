import { expect, test } from "vitest";

import { phoneTabForRoute } from "../apps/web/src/components/webShellChromeShared";
import { parseAppRouteFromPathname } from "../shared/webAppRouteState";

// Design v1: the phone's bottom tab is read from the address, so Back,
// Forward and a refresh always agree with it.
function tabAt(pathname: string) {
  const route = parseAppRouteFromPathname(pathname);
  if (!route) throw new Error(`no route for ${pathname}`);
  return phoneTabForRoute(route.page, route.communityTab ?? "chat");
}

test("Home's address selects Home", () => {
  expect(tabAt("/c/sunrise/home")).toBe("agent");
});

test("Inbox's address selects Inbox, with or without a conversation", () => {
  expect(tabAt("/c/sunrise/inbox")).toBe("messages");
  expect(tabAt("/c/sunrise/inbox/abc123")).toBe("messages");
});

test("every other address selects the community", () => {
  for (const path of ["/c/sunrise/browse", "/c/sunrise/chat", "/c/sunrise/knowledge", "/c/sunrise/members", "/c/sunrise/pods", "/settings"]) {
    expect(tabAt(path)).toBe("community");
  }
});
