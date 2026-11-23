import { describe, expect, it } from "vitest";
import {
  VIRTUAL_DM_CONVERSATION_ID_PREFIX,
  buildLocalEchoContentJson,
  buildVirtualConversationForPerson,
  collectIncomingDirectMessageEvents,
  countDirectInboxUnread,
  findConversationPeerUserId,
  friendlyDirectMessageReadError,
  friendlyDirectMessageSendError,
  getDirectAttachmentUploadStatus,
  hasUnreadyDirectAttachments,
  isVirtualDirectConversationId,
  mergeDirectPanelMessages,
  virtualPeerUserIdFromConversationId,
  type DirectMessageLocalEcho,
} from "../apps/web/src/controllers/directMessages/directMessageHostHelpers";
import type { DirectMessage, DirectMessageConversation, DirectMessageNetworkPerson } from "../shared/communityTypes";

function makeConversation(overrides: Partial<DirectMessageConversation> = {}): DirectMessageConversation {
  return {
    id: "conv_1",
    kind: "direct",
    created_from_community: { id: "comm_1", slug: "alpha", name: "Alpha" },
    last_seq: 3,
    viewer_last_read_seq: 1,
    unread_count: 2,
    has_unread: true,
    last_message_preview: "Hey there",
    last_message_at: "2026-11-23T10:00:00.000Z",
    created_at: "2026-11-23T09:00:00.000Z",
    updated_at: "2026-11-23T10:00:00.000Z",
    participants: [
      { id: "p1", participant_type: "user", user_id: "user_me", display_name: "Me", avatar_url: null, status: "active", last_read_seq: 1 },
      { id: "p2", participant_type: "user", user_id: "user_peer", display_name: "Alex", avatar_url: "https://example.com/a.png", status: "active", last_read_seq: 3 },
    ],
    ...overrides,
  };
}

describe("directMessageHostHelpers", () => {
  it("maps raw send and read errors to friendly user messages", () => {
    expect(friendlyDirectMessageSendError(new Error("dm_rate_limited"), "fallback")).toContain("too quickly");
    expect(friendlyDirectMessageSendError(new Error("dm_conversation_access_required"), "fallback")).toContain("can't message");
    expect(friendlyDirectMessageSendError(new Error("convex_internal_boom"), "fallback")).toBe("fallback");
    expect(friendlyDirectMessageReadError(new Error("verified_identity_required"), "fallback")).toContain("Reconnecting");
    expect(friendlyDirectMessageReadError(new Error("Custom error"), "fallback")).toBe("Custom error");
  });

  it("builds virtual conversations and resolves active human peers", () => {
    const person: DirectMessageNetworkPerson = {
      user_id: "user_peer",
      display_name: "Alex",
      avatar_url: null,
      community_id: "comm_1",
      community_name: "Alpha",
      last_active_at: null,
      existing_conversation_id: null,
    };
    const virtual = buildVirtualConversationForPerson(person, "user_me");
    expect(virtual.id).toBe(`${VIRTUAL_DM_CONVERSATION_ID_PREFIX}user_peer`);
    expect(isVirtualDirectConversationId(virtual.id)).toBe(true);
    expect(virtualPeerUserIdFromConversationId(virtual.id)).toBe("user_peer");
    expect(findConversationPeerUserId(virtual, "user_me")).toBe("user_peer");
  });

  it("evaluates attachment readiness and echo content serialization", () => {
    expect(getDirectAttachmentUploadStatus({ id: "a1", name: "f.png", type: "image", attachment_id: "att_1" })).toBe("ready");
    expect(getDirectAttachmentUploadStatus({ id: "a2", name: "f.png", type: "image", uploadStatus: "uploading" })).toBe("uploading");
    expect(getDirectAttachmentUploadStatus({ id: "a3", name: "f.png", type: "image" })).toBe("failed");
    expect(hasUnreadyDirectAttachments([{ id: "a1", name: "f.png", type: "image", attachment_id: "att_1" }])).toBe(false);
    expect(hasUnreadyDirectAttachments([{ id: "a2", name: "f.png", type: "image", uploadStatus: "queued" }])).toBe(true);
    expect(buildLocalEchoContentJson("hi", [])).toEqual({ text: "hi" });
  });

  it("counts unread conversations in v1 mode and unread messages in classic mode while skipping muted threads", () => {
    const rows = [
      makeConversation({ id: "c1", unread_count: 3, has_unread: true, viewer_muted: false }),
      makeConversation({ id: "c2", unread_count: 5, has_unread: true, viewer_muted: true }),
      makeConversation({ id: "c3", unread_count: 1, has_unread: true, viewer_muted: false }),
    ];
    expect(countDirectInboxUnread(rows, true)).toBe(2);
    expect(countDirectInboxUnread(rows, false)).toBe(4);
  });

  it("deduplicates confirmed local echoes when merging panel messages", () => {
    const serverMsg: DirectMessage = {
      id: "msg_1",
      conversation_id: "conv_1",
      seq: 1,
      sender_type: "user",
      sender_user_id: "user_me",
      content_json: { text: "Hello" },
      client_message_id: "local-1",
      created_at: "2026-11-23T10:00:00.000Z",
      updated_at: "2026-11-23T10:00:00.000Z",
    };
    const echoes: DirectMessageLocalEcho[] = [
      {
        ...serverMsg,
        id: "local-1",
        local_id: "local-1",
        local_status: "sent",
        local_payload: { text: "Hello", attachments: [] },
      },
      {
        ...serverMsg,
        id: "local-2",
        local_id: "local-2",
        local_status: "sending",
        local_payload: { text: "Still sending", attachments: [] },
      },
    ];
    const merged = mergeDirectPanelMessages([serverMsg], echoes);
    expect(merged.map((m) => m.id)).toEqual(["msg_1", "local-2"]);
  });

  it("collects incoming message notifications only for unmuted unread non-viewer updates outside the focused thread", () => {
    const rows = [
      makeConversation({ id: "c1", last_seq: 4, last_message_from_viewer: false, viewer_muted: false }),
      makeConversation({ id: "c2", last_seq: 4, last_message_from_viewer: true, viewer_muted: false }),
      makeConversation({ id: "c3", last_seq: 4, last_message_from_viewer: false, viewer_muted: true }),
      makeConversation({ id: "c4", last_seq: 4, last_message_from_viewer: false, viewer_muted: false }),
    ];
    const result = collectIncomingDirectMessageEvents({
      rows,
      previousSeqByConversation: { c1: 3, c2: 3, c3: 3, c4: 3 },
      sessionUserId: "user_me",
      isReadingConversation: (id) => id === "c4",
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.conversationId).toBe("c1");
    expect(result.events[0]?.peerDisplayName).toBe("Alex");
  });
});
