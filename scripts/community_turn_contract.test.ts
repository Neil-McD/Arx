import { expect, test } from "vitest";
import { buildCommunityTurnContract, checkCommunityTurnToolCall, summarizeCommunityTurnContract, toolOutputSawPrivateSource } from "../shared/communityTurnContract";

// Who speaks, who sees the answer, and what that allows.
test("a private Ask: the member asks and sees the answer; their profile and the shared layers are in", () => {
  const ask = buildCommunityTurnContract({ surface: "ask", communityId: "c1", speakerUserId: "u1" });
  expect(ask).toMatchObject({ speaker: { kind: "member", userId: "u1" }, audience: { kind: "asker" }, uses: { communityCard: true, handbook: true, askerProfile: true }, cacheKey: "pn:c1:ask", historyTurns: 20 });
});

test("an Ask inside a community conversation keeps the shared layers but never the asker's global profile", () => {
  const ask = buildCommunityTurnContract({ surface: "ask_in_conversation", communityId: "c1", speakerUserId: "u1" });
  expect(ask.uses).toEqual({ communityCard: true, handbook: true, askerProfile: false });
  expect(ask.cacheKey).toBe("pn:c1:ask");
});

test("a public tag answers to the channel: shared layers only, no one's private context", () => {
  const tag = buildCommunityTurnContract({ surface: "tag", communityId: "c1", speakerUserId: "u1", channelId: "ch1" });
  expect(tag.audience).toEqual({ kind: "channel", channelId: "ch1" });
  expect(tag.uses.askerProfile).toBe(false);
  expect(tag.cacheKey).toBe("pn:c1:tag");
});

test("the steward runs on a schedule for the founder", () => {
  const steward = buildCommunityTurnContract({ surface: "steward", communityId: "c1", speakerUserId: "u1" });
  expect(steward.speaker).toEqual({ kind: "schedule" });
  expect(steward.audience).toEqual({ kind: "founder" });
  expect(steward.uses.askerProfile).toBe(false);
});

test("an Ask needs a member and every turn needs a community; the receipt summary has no ids", () => {
  expect(() => buildCommunityTurnContract({ surface: "ask", communityId: "c1" })).toThrow("community_turn_contract_ask_requires_member");
  expect(() => buildCommunityTurnContract({ surface: "tag", communityId: " " })).toThrow("community_turn_contract_requires_community");
  const summary = summarizeCommunityTurnContract(buildCommunityTurnContract({ surface: "ask", communityId: "c1", speakerUserId: "u1" }));
  expect(JSON.stringify(summary)).not.toMatch(/u1|c1/);
});

// Governed actions: a member's Ask or tag never becomes a post.
test("Asks and tags only draft channel posts; the steward speaks in its own voice", () => {
  const surfaces = { ask: "u1", ask_in_conversation: "u1", tag: "u1", steward: null } as const;
  const writes = Object.fromEntries(Object.entries(surfaces).map(([surface, speakerUserId]) => [
    surface, buildCommunityTurnContract({ surface: surface as keyof typeof surfaces, communityId: "c1", speakerUserId }).channelWrites,
  ]));
  expect(writes).toEqual({ ask: "draft_only", ask_in_conversation: "draft_only", tag: "draft_only", steward: "own_voice" });
  expect(summarizeCommunityTurnContract(buildCommunityTurnContract({ surface: "tag", communityId: "c1", speakerUserId: "u1" })).channel_writes).toBe("draft_only");
});

test("the tool-call check refuses every channel write on a draft-only turn and nothing else", () => {
  const ask = buildCommunityTurnContract({ surface: "ask", communityId: "c1", speakerUserId: "u1" });
  const steward = buildCommunityTurnContract({ surface: "steward", communityId: "c1" });
  for (const path of [
    "/communities/sunrise/channels/general/",
    "/communities/sunrise/channels/general/interaction:root:abc/",
    "/communities/sunrise/channels/general/interaction:reply:abc.md",
    "//communities/sunrise//channels/general/",
    "  /communities/sunrise/channels",
  ]) {
    expect(checkCommunityTurnToolCall(ask, "polynet_write", { path, mode: "create" })).toMatchObject({ ok: false, errorCode: "draft_only" });
  }
  expect(checkCommunityTurnToolCall(ask, "polynet_write", { path: "/communities/sunrise/builder/resources/", mode: "create" })).toEqual({ ok: true });
  expect(checkCommunityTurnToolCall(ask, "polynet_read", { path: "/communities/sunrise/channels/general/" })).toEqual({ ok: true });
  expect(checkCommunityTurnToolCall(steward, "polynet_write", { path: "/communities/sunrise/channels/general/" })).toEqual({ ok: true });
  expect(checkCommunityTurnToolCall(null, "polynet_write", { path: "/communities/sunrise/channels/general/" })).toEqual({ ok: true });
});

// Community notes: Asks and tags may save them, never after seeing a private source.
test("notes writes are open on Asks and tags, closed after a private source, and closed for the steward", () => {
  const ask = buildCommunityTurnContract({ surface: "ask", communityId: "c1", speakerUserId: "u1" });
  const tag = buildCommunityTurnContract({ surface: "tag", communityId: "c1", speakerUserId: "u1" });
  const steward = buildCommunityTurnContract({ surface: "steward", communityId: "c1" });
  const write = { path: "/communities/sunrise/memory/", mode: "create" };
  expect(checkCommunityTurnToolCall(ask, "polynet_write", write)).toEqual({ ok: true });
  expect(checkCommunityTurnToolCall(tag, "polynet_write", { path: "/communities/sunrise/memory/chalk.md", mode: "append" })).toEqual({ ok: true });
  expect(checkCommunityTurnToolCall(ask, "polynet_write", write, { sawPrivateSource: true })).toMatchObject({ ok: false, errorCode: "private_source_read" });
  expect(checkCommunityTurnToolCall(null, "polynet_write", write, { sawPrivateSource: true })).toMatchObject({ ok: false, errorCode: "private_source_read" });
  expect(checkCommunityTurnToolCall(steward, "polynet_write", write)).toMatchObject({ ok: false, errorCode: "notes_not_allowed" });
  // Reading stays open after a private source; only saving a note is locked.
  expect(checkCommunityTurnToolCall(ask, "polynet_read", { path: "/communities/sunrise/memory/chalk.md" }, { sawPrivateSource: true })).toEqual({ ok: true });
  expect(summarizeCommunityTurnContract(ask).notes_writes).toBe("agent");
});

test("a tool result marked private_room counts as a private source", () => {
  expect(toolOutputSawPrivateSource(JSON.stringify({ entries: [], private_room: true }))).toBe(true);
  expect(toolOutputSawPrivateSource(JSON.stringify({ results: [{ title: "x", private_room: true }] }))).toBe(true);
  expect(toolOutputSawPrivateSource(JSON.stringify({ results: [{ title: "private_room" }] }))).toBe(false);
});
