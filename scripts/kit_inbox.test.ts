import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
(globalThis as any).document ??= { documentElement: { dataset: { design: "v1" } } };
const { renderToStaticMarkup } = await import("react-dom/server");
const { WebDirectMessageInboxPanel, inboxLeadFor } = await import("../apps/web/src/components/WebDirectMessageInboxPanel");

const has = (html: string, ...names: string[]) =>
  new RegExp(`class="${names.map((name) => `_${name}_[^ "]*`).join(" ")}"`).test(html);

function conversation(id: string, name: string, unread: boolean, community: { id: string; name: string }) {
  return {
    id, kind: "direct", created_from_community: { ...community, slug: community.id }, last_seq: 2, viewer_last_read_seq: unread ? 1 : 2,
    unread_count: unread ? 1 : 0, has_unread: unread, last_message_preview: `Hi from ${name}`, last_message_at: new Date().toISOString(),
    created_at: "", updated_at: "",
    participants: [
      { user_id: "me", participant_type: "user", status: "active", display_name: "Neil" },
      { user_id: `u-${id}`, participant_type: "user", status: "active", display_name: name },
    ],
  };
}

function render(conversations: unknown[]) {
  return renderToStaticMarkup(React.createElement(WebDirectMessageInboxPanel, {
    conversations, isLoading: false, error: null, searchValue: "", people: [], isLoadingPeople: false, peopleError: null,
    sourceCommunityCount: 2, canBrowsePeople: true, sessionUserId: "me",
    getInitials: (value: string) => value.slice(0, 1), getAvatarColor: () => "#555",
    onSearchValueChange: () => {}, onSelectConversation: () => {}, onSelectPerson: () => {},
    kitPage: { activeCommunityId: "polynet" },
  } as any));
}

test("the guide's line counts what needs a reply", () => {
  expect(inboxLeadFor(0)).toBe("Nothing here needs a reply.");
  expect(inboxLeadFor(1)).toBe("1 of these needs a reply.");
  expect(inboxLeadFor(2)).toBe("2 of these need a reply.");
});

test("the Inbox page is the mock's: the line, the chips, and rows with a badge from elsewhere", () => {
  const html = render([
    conversation("a", "Jon", true, { id: "polynet", name: "Polynet" }),
    conversation("b", "Ray", false, { id: "de", name: "Distribution Engineer" }),
  ]);
  expect(html).toContain("1 of these needs a reply.");
  // "Needs a reply" opens first when something does: only Jon shows.
  expect(html).toContain("Needs a reply · 1");
  expect(html).toContain("<b>Jon</b>");
  expect(html).not.toContain("<b>Ray</b>");
  expect(html).toContain("Only Polynet");
  expect(has(html, "mrow")).toBe(true);
  expect(has(html, "dot")).toBe(true);
  expect(html).not.toContain("community-dm-inbox-row");
});
