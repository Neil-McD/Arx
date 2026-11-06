import { expect, test } from "vitest";

import { siteMessagesUrl, siteNewMessageUrl } from "../apps/web/src/controllers/useWebSiteMessagesController";

const A = { id: "a", messages_url: "https://a--me.polynet.page/messages" };
const B = { id: "b", messages_url: "https://b--me.polynet.page/messages" };
const NONE = { id: "c", messages_url: null };

test("Studio's Messages opens the active community's site, else another of theirs; none without a site", () => {
  expect(siteMessagesUrl([A, B], "b")).toBe(B.messages_url);
  expect(siteMessagesUrl([NONE, A, B], "c")).toBe(A.messages_url);
  expect(siteMessagesUrl([NONE], "c")).toBeNull();
  expect(siteMessagesUrl([], null)).toBeNull();
  expect(siteMessagesUrl([{ id: "x", messages_url: "http://x--me.polynet.page/messages" }], "x")).toBeNull();
  expect(siteMessagesUrl([{ id: "x", messages_url: "javascript:alert(1)" }], "x")).toBeNull();
});

test("Message @handle opens the site's new conversation; their inbox without a handle", () => {
  expect(siteNewMessageUrl(A.messages_url, "sam")).toBe("https://a--me.polynet.page/messages/new?to=sam");
  expect(siteNewMessageUrl(A.messages_url, "@sam")).toBe("https://a--me.polynet.page/messages/new?to=sam");
  expect(siteNewMessageUrl(A.messages_url, "a b")).toBe("https://a--me.polynet.page/messages/new?to=a%20b");
  expect(siteNewMessageUrl(A.messages_url, null)).toBe(A.messages_url);
});
