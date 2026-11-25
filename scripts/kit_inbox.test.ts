import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
(globalThis as any).document ??= { documentElement: { dataset: { design: "v1" } } };
const { renderToStaticMarkup } = await import("react-dom/server");
const {
  WebDirectMessageInboxPanel,
  inboxLeadFor,
  inboxTimeFor,
  initialInboxFilterFor,
  isInboxConversationUnread,
} = await import("../apps/web/src/components/WebDirectMessageInboxPanel");
const { WebDirectMessagePanel } = await import("../apps/web/src/components/WebDirectMessagePanel");

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

test("the guide's line counts what needs a reply and names the newest", () => {
  expect(inboxLeadFor(0)).toBe("Nothing here needs a reply.");
  expect(inboxLeadFor(1, "Priya Nair")).toBe("Priya is waiting on a reply.");
  expect(inboxLeadFor(3, "Priya Nair")).toBe("3 of these need a reply. The newest is from Priya.");
  expect(inboxLeadFor(2)).toBe("2 of these need a reply.");
});

test("times read like the mock's", () => {
  const now = new Date(2026, 10, 11, 15, 0);
  expect(inboxTimeFor(new Date(2026, 10, 11, 14, 59, 30).toISOString(), now)).toBe("now");
  expect(inboxTimeFor(new Date(2026, 10, 11, 14, 40).toISOString(), now)).toBe("20 min");
  expect(inboxTimeFor(new Date(2026, 10, 11, 12, 0).toISOString(), now)).toBe("3 h");
  expect(inboxTimeFor(new Date(2026, 10, 10, 20, 0).toISOString(), now)).toBe("Yesterday");
  expect(inboxTimeFor(new Date(2026, 9, 3, 9, 0).toISOString(), now)).toBe("Oct 3");
});

test("the Inbox page is the mock's: the line, the chips, and rows with a badge from elsewhere", () => {
  const html = render([
    conversation("a", "Jon", true, { id: "polynet", name: "Polynet" }),
    conversation("b", "Ray", false, { id: "de", name: "Distribution Engineer" }),
  ]);
  expect(html).toContain("Jon is waiting on a reply.");
  // "Needs a reply" opens first when something does: only Jon shows.
  expect(html).toContain("Needs a reply · 1");
  expect(html).toContain("<b>Jon</b>");
  expect(html).not.toContain("<b>Ray</b>");
  expect(html).toContain("Only Polynet");
  // A row is two lines, each cut at the end of its line.
  expect(has(html, "mrow", "one")).toBe(true);
  expect(has(html, "dot")).toBe(true);
  expect(html).not.toContain("community-dm-inbox-row");
});

test("a row says where a conversation began only when that is somewhere else", () => {
  const html = render([
    conversation("a", "Jon", false, { id: "polynet", name: "Polynet" }),
    conversation("b", "Ray", false, { id: "de", name: "Distribution Engineer" }),
  ]);
  // Everything in the Inbox is a direct message, so no row says so.
  expect(html).not.toContain("Direct message");
  expect(html).toContain("<b>Jon</b><time>");
  expect(html).toContain("<b>Ray</b><span>Distribution Engineer</span>");
});

test("Inbox header renders the message notifications toggle when available", () => {
  const html = renderToStaticMarkup(React.createElement(WebDirectMessageInboxPanel, {
    conversations: [], isLoading: false, error: null, searchValue: "", people: [], isLoadingPeople: false, peopleError: null,
    sourceCommunityCount: 1, canBrowsePeople: true, sessionUserId: "me",
    notificationsState: "on", onToggleNotifications: () => {},
    getInitials: (value: string) => value.slice(0, 1), getAvatarColor: () => "#555",
    onSearchValueChange: () => {}, onSelectConversation: () => {}, onSelectPerson: () => {},
    kitPage: { activeCommunityId: "polynet" },
  } as any));
  expect(html).toContain('aria-label="Turn off message notifications"');
  expect(html).toContain('aria-pressed="true"');
});

test("WebDirectMessagePanel uses the unified Kit conversation view on phones with presence dot, via AI badge, and visible back button", () => {
  const conv = conversation("a", "Jon", false, { id: "polynet", name: "Polynet" });
  const nowIso = new Date().toISOString();
  const html = renderToStaticMarkup(React.createElement(WebDirectMessagePanel, {
    besideInbox: false,
    conversation: conv,
    messages: [
      {
        id: "m1", conversation_id: "a", seq: 1, sender_type: "user", sender_user_id: "u-a",
        content_json: { text: "Hey there!\nSecond line" }, via_ai: true, created_at: nowIso, updated_at: nowIso,
      },
      {
        id: "m2", conversation_id: "a", seq: 2, sender_type: "user", sender_user_id: "me",
        content_json: { text: "Hello back!" }, via_ai: false, created_at: nowIso, updated_at: nowIso,
      },
    ],
    input: "", isLoading: false, isSending: false, error: null, attachments: [],
    typingPresence: { users: [], total_count: 0 },
    peerLastActiveAt: nowIso,
    sessionUserId: "me",
    getInitials: (value: string) => value.slice(0, 1), getAvatarColor: () => "#555",
    renderTextWithLinks: (text: string) => text,
    onInputChange: () => {}, onSend: () => {}, onBackToInbox: () => {},
  } as any));
  expect(html).toContain("community-dm-panel is-kit");
  expect(html).toContain('aria-label="Back to Inbox"');
  expect(html).not.toContain("is-layered-only");
  expect(html).toContain("community-dm-inbox-presence-dot is-active-now");
  expect(html).toContain("Active now · Polynet");
  expect(html).toContain("via AI");
  expect(html).toContain('<div class="community-dm-panel-message-text">Hey there!\nSecond line</div>');
  expect(html).toContain('<div class="community-dm-panel-message-text">Hello back!</div>');
});

test("the person's face and name in a conversation open their profile, when there is a community to read it in", () => {
  const base = {
    besideInbox: true, messages: [], input: "", isLoading: false, isSending: false, error: null, attachments: [],
    typingPresence: { users: [], total_count: 0 }, sessionUserId: "me",
    getInitials: (value: string) => value.slice(0, 1), getAvatarColor: () => "#555",
    renderTextWithLinks: (text: string) => text, onInputChange: () => {}, onSend: () => {},
  };
  const withCommunity = renderToStaticMarkup(React.createElement(WebDirectMessagePanel, {
    ...base, conversation: conversation("a", "Jon", false, { id: "polynet", name: "Polynet" }), session: { token: "t" },
  } as any));
  expect(withCommunity).toContain('class="community-dm-kit-peer"');
  expect(withCommunity).toContain('aria-label="Jon&#x27;s profile"');
  // Not signed in here, or no community the conversation came from: just the name.
  for (const props of [
    { conversation: conversation("a", "Jon", false, { id: "polynet", name: "Polynet" }) },
    { conversation: { ...conversation("a", "Jon", false, { id: "polynet", name: "Polynet" }), created_from_community: null }, session: { token: "t" } },
  ]) {
    const html = renderToStaticMarkup(React.createElement(WebDirectMessagePanel, { ...base, ...props } as any));
    expect(html).not.toContain("community-dm-kit-peer");
    expect(html).toContain("Jon");
  }
});

test("actively reading an open conversation suppresses unread flicker while other unread chats still count", () => {
  const rashid = conversation("rashid", "Rashid", true, { id: "polynet", name: "Polynet" });
  const ray = conversation("ray", "Ray", true, { id: "polynet", name: "Polynet" });

  // While actively chatting with Rashid, incoming messages from Rashid don't flash as unread.
  expect(isInboxConversationUnread(rashid as any, "rashid")).toBe(false);
  // Another person's unread message still counts as needing a reply.
  expect(isInboxConversationUnread(ray as any, "rashid")).toBe(true);
  // Before touching an auto-opened conversation (deferRead), it still counts as unread.
  expect(isInboxConversationUnread(rashid as any, null)).toBe(true);

  const html = renderToStaticMarkup(React.createElement(WebDirectMessageInboxPanel, {
    conversations: [rashid, conversation("ray", "Ray", false, { id: "polynet", name: "Polynet" })],
    isLoading: false, error: null, searchValue: "", people: [], isLoadingPeople: false, peopleError: null,
    sourceCommunityCount: 1, canBrowsePeople: true, sessionUserId: "me",
    getInitials: (value: string) => value.slice(0, 1), getAvatarColor: () => "#555",
    onSearchValueChange: () => {}, onSelectConversation: () => {}, onSelectPerson: () => {},
    activeConversationId: "rashid",
    activelyReadingConversationId: "rashid",
    kitPage: { activeCommunityId: "polynet" },
  } as any));
  expect(html).toContain("Nothing here needs a reply.");
  expect(html).toContain("<b>Rashid</b>");
  expect(html).toContain("<b>Ray</b>");
  expect(html).not.toContain("Needs a reply · 1");
});

test("initialInboxFilterFor waits for inbox data, then latches once so live replies never flip tabs", () => {
  expect(initialInboxFilterFor({ conversationsCount: 0, isLoading: true, needsReply: 0 })).toBeNull();
  expect(initialInboxFilterFor({ conversationsCount: 0, isLoading: false, needsReply: 0 })).toBeNull();
  expect(initialInboxFilterFor({ conversationsCount: 5, isLoading: false, needsReply: 0 })).toBe("all");
  expect(initialInboxFilterFor({ conversationsCount: 5, isLoading: false, needsReply: 2 })).toBe("reply");
});
