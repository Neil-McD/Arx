import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
// Design v1 is on (the switch is read from <html data-design>).
(globalThis as any).document ??= { documentElement: { dataset: { design: "v1" } } };
const { renderToStaticMarkup } = await import("react-dom/server");
// Kit classes are hashed CSS Module names: match on the mock's name inside.
const has = (html: string, ...names: string[]) =>
  new RegExp(`class="${names.map((name) => `_${name}_[^ "]*`).join(" ")}"`).test(html);
const { KitChannelFeed } = await import("../apps/web/src/v1/KitChannelFeed");

const now = Date.now();
function bundle(id: string, who: string, minutesAgo: number, text: string, extra: Record<string, unknown> = {}) {
  return {
    deduped: false,
    root: {
      id, kind: "discussion", title: null, content_summary: text, created_at: new Date(now - minutesAgo * 60_000).toISOString(), edited_at: null,
      actor_type: who === "guide" ? "community_agent" : "human",
      actor_user_id: who === "guide" ? null : who, actor_agent_key: who === "guide" ? "community_agent" : null,
      reply_count: 0, last_reply_at: null, last_reply_actor_user_id: null, reaction_summary: [], viewer_emojis: [], idempotency_key: id,
      ...extra,
    },
    content_blocks: [{ kind: "text", position: 0, text }],
    embeds: [], mentions: [], attachments: [],
  };
}

function render(roots: unknown[], overrides: Record<string, unknown> = {}) {
  const noop = () => {};
  return renderToStaticMarkup(React.createElement(KitChannelFeed, {
    roots, activityEvents: [], selectedRootId: null, chatLastSeenAt: null, error: null, isLoadingRoots: false,
    currentUserId: "neil", communityOwnerId: "neil", activeCommunityName: "Polynet",
    profilesByUserId: {}, displayName: (id: string) => ({ jon: "Jon", neil: "Neil" } as Record<string, string>)[id] ?? id,
    getAvatarColor: () => "#555", getInitials: (name: string) => name.slice(0, 1),
    formatChatTime: () => "8:40 am", renderTextWithLinks: (text: string) => text,
    onSelectRoot: noop, onRetryRoots: noop, onToggleReaction: noop,
    editing: null, editText: "", onStartEdit: noop, onEditTextChange: noop, onSaveEdit: noop, onCancelEdit: noop,
    ...overrides,
  } as any));
}

test("a message is the mock's row: author, time, text, reactions, thread link and tools", () => {
  const html = render([
    bundle("r1", "jon", 30, "We passed 100 members.", {
      reaction_summary: [{ emoji: "🎉", count: 12 }], viewer_emojis: ["🎉"], reply_count: 4,
      last_reply_at: new Date(now - 600_000).toISOString(), last_reply_actor_user_id: "neil",
    }),
  ]);
  for (const name of ["feed", "msg", "h", "rx", "tools"]) expect(has(html, name), name).toBe(true);
  expect(has(html, "re", "mine")).toBe(true);
  for (const part of ["<b>Jon</b>", "8:40 am", "We passed 100 members.", 'aria-pressed="true"', "4 replies"]) {
    expect(html).toContain(part);
  }
  // None of the old feed's group markup is drawn.
  expect(html).not.toContain("community-interaction-group");
});

test("a run by one author shows the name once, and the guide wears its spark", () => {
  const html = render([
    bundle("a", "jon", 10, "First."),
    bundle("b", "jon", 9, "Second."),
    bundle("g", "guide", 8, "Saved to Knowledge."),
  ]);
  expect(html.match(/<b>Jon<\/b>/g)?.length).toBe(1);
  expect(has(html, "msg", "cont")).toBe(true);
  expect(has(html, "msg", "g")).toBe(true);
  expect(has(html, "av", "guide")).toBe(true);
  expect(html).toContain(">guide<");
});

test("the host's own post carries the host tag, and an empty channel keeps its empty state", () => {
  expect(render([bundle("n", "neil", 5, "This is the play.")])).toContain(">host<");
  expect(render([])).toContain("No threads yet");
});
