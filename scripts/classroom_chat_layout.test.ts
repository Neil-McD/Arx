import { expect, test } from "vitest";
import { DEFAULT_COMMUNITY_LAYOUT, layoutForClassroomChat, type CommunityLayoutV1 } from "../shared/communityLayout";

function withPosition(position: "top" | "side", presentation: "messages" | "posts" = "messages"): CommunityLayoutV1 {
  return {
    ...DEFAULT_COMMUNITY_LAYOUT,
    navigation: { ...DEFAULT_COMMUNITY_LAYOUT.navigation, position },
    pages: { ...DEFAULT_COMMUNITY_LAYOUT.pages, chat: { presentation, aside: [] } },
  };
}

// Classroom shows post cards unless the owner picks a chat.
test("Classroom shows post cards with its side blocks, even when the layout says messages", () => {
  const layout = layoutForClassroomChat(withPosition("top"), "posts");
  expect(layout.pages.chat.presentation).toBe("posts");
  expect(layout.pages.chat.aside).toEqual(["community_card", "upcoming_events"]);
});

test("an owner who picks a chat for Classroom gets a chat timeline", () => {
  expect(layoutForClassroomChat(withPosition("top", "posts"), "chat").pages.chat.presentation).toBe("messages");
});

test("Channels keeps its layout as it is", () => {
  const side = withPosition("side");
  expect(layoutForClassroomChat(side, "posts")).toBe(side);
});
