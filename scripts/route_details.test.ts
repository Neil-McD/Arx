import { describe, expect, it } from "vitest";
import { buildAppRoutePath, eventAddressKey, eventIdFromAddressKey, parseAppRouteFromPathname } from "../shared/webAppRouteState";
import { carryRouteDetails, pathWithRouteDetail, readRouteDetailAt } from "../shared/routeDetails";

const roundTrip = (path: string) => buildAppRoutePath(parseAppRouteFromPathname(path)!);

describe("every community address survives a refresh", () => {
  const addresses = [
    "/c/a/chat",
    "/c/a/chat/beta",
    "/c/a/chat/general/t1",
    "/c/a/chat/beta/t1",
    "/c/a/chat/setters/t9",
    "/c/a/knowledge",
    "/c/a/knowledge/course1",
    "/c/a/knowledge/course1/lesson2",
    "/c/a/knowledge/guide",
    "/c/a/knowledge/brain",
    "/c/a/events",
    "/c/a/discover",
    "/c/a/pods",
    "/c/a/pods/setters",
    "/c/a/home",
    "/c/a/home/talk",
    "/c/a/browse",
    "/c/a/settings/community",
    "/c/a/analytics",
    "/c/a/events",
    "/c/a/events/e1",
    "/c/a/events/e1_1794000000000",
    "/c/a/members",
    "/c/a/members/board",
    "/c/a/members/board/m1",
    "/c/a/members/m1",
    "/c/a/members/requests",
    "/c/a/inbox",
    "/c/a/inbox/conv1",
  ];
  for (const address of addresses) {
    it(address, () => expect(roundTrip(address)).toBe(address));
  }

  it("turns the old words into the new ones", () => {
    expect(roundTrip("/c/a/agent")).toBe("/c/a/home");
    expect(roundTrip("/c/a/resources/course1/lesson2")).toBe("/c/a/knowledge/course1/lesson2");
    expect(roundTrip("/c/a/resources/guide")).toBe("/c/a/knowledge/guide");
  });

  it("refuses a detail that is not a plain id", () => {
    expect(parseAppRouteFromPathname("/c/a/chat/beta/a.b")?.communityThreadId).toBeUndefined();
    expect(roundTrip("/c/a/chat/beta/a.b")).toBe("/c/a/chat/beta");
  });
});

describe("details inside a page", () => {
  it("reads them from the path, and from old ?tags", () => {
    expect(readRouteDetailAt("/c/a/chat/beta/t1", "thread")).toBe("t1");
    expect(readRouteDetailAt("/c/a/chat/beta?thread=t1", "thread")).toBe("t1");
    expect(readRouteDetailAt("/m/c/a/resources/c1/l2", "lesson")).toBe("l2");
    expect(readRouteDetailAt("/c/a/resources?view=brain", "view")).toBe("brain");
    expect(readRouteDetailAt("/c/a/events?thread=t1", "thread")).toBeNull();
  });

  it("sets and clears one, on the phone too, and drops old tags", () => {
    expect(pathWithRouteDetail("/c/a/chat", "thread", "t1")).toBe("/c/a/chat/general/t1");
    expect(pathWithRouteDetail("/m/c/a/chat/beta/t1", "thread", null)).toBe("/m/c/a/chat/beta");
    expect(pathWithRouteDetail("/c/a/resources?view=guide&utm=x", "view", "brain")).toBe("/c/a/knowledge/brain?utm=x");
    expect(pathWithRouteDetail("/c/a/events", "thread", "t1")).toBe("/c/a/events");
  });

  it("are kept when the app rewrites the same page, and dropped on another", () => {
    expect(carryRouteDetails("/c/a/chat/beta", "/c/a/chat/beta/t1")).toBe("/c/a/chat/beta/t1");
    expect(carryRouteDetails("/m/c/a/chat/beta", "/m/c/a/chat/beta/t1")).toBe("/m/c/a/chat/beta/t1");
    expect(carryRouteDetails("/c/a/chat", "/c/a/chat/beta/t1")).toBe("/c/a/chat");
    expect(carryRouteDetails("/c/a/events", "/c/a/resources/brain")).toBe("/c/a/events");
  });

  it("turn an old tag link into the path", () => {
    expect(carryRouteDetails("/c/a/chat/beta", "/c/a/chat/beta?thread=t1")).toBe("/c/a/chat/beta/t1");
    expect(carryRouteDetails("/c/a/resources/c1", "/c/a/resources/c1?lesson=l2")).toBe("/c/a/knowledge/c1/l2");
  });
});

describe("a picked event is part of the Events address", () => {
  it("reads and writes the event on Events only", () => {
    expect(readRouteDetailAt("/c/a/events/e1", "event")).toBe("e1");
    expect(pathWithRouteDetail("/c/a/events", "event", "e1")).toBe("/c/a/events/e1");
    expect(pathWithRouteDetail("/m/c/a/events/e1", "event", null)).toBe("/m/c/a/events");
    expect(readRouteDetailAt("/c/a/members/e1", "event")).toBeNull();
  });

  it("keeps the picked event when the app rewrites the same page's address", () => {
    expect(carryRouteDetails("/c/a/events", "/c/a/events/e1")).toBe("/c/a/events/e1");
    expect(carryRouteDetails("/c/a/knowledge", "/c/a/events/e1")).toBe("/c/a/knowledge");
  });

  it("writes one time of a repeating event without a colon, and reads it back", () => {
    expect(eventAddressKey("e1:1794000000000")).toBe("e1_1794000000000");
    expect(eventIdFromAddressKey("e1_1794000000000")).toBe("e1:1794000000000");
    expect(eventIdFromAddressKey("e1")).toBe("e1");
    expect(eventIdFromAddressKey("../x")).toBeNull();
  });
});

describe("the conversation with the guide is part of Home's address", () => {
  it("reads and writes it on Home only, on the phone too", () => {
    expect(readRouteDetailAt("/c/a/home/talk", "homeView")).toBe("talk");
    expect(readRouteDetailAt("/m/c/a/home/talk", "homeView")).toBe("talk");
    expect(readRouteDetailAt("/c/a/home", "homeView")).toBeNull();
    expect(readRouteDetailAt("/c/a/home/other", "homeView")).toBeNull();
    expect(pathWithRouteDetail("/c/a/home", "homeView", "talk")).toBe("/c/a/home/talk");
    expect(pathWithRouteDetail("/m/c/a/home/talk", "homeView", null)).toBe("/m/c/a/home");
    expect(pathWithRouteDetail("/c/a/events", "homeView", "talk")).toBe("/c/a/events");
  });

  it("is kept when the app rewrites Home's address, and dropped on another page", () => {
    expect(carryRouteDetails("/c/a/home", "/c/a/home/talk")).toBe("/c/a/home/talk");
    expect(carryRouteDetails("/m/c/a/home", "/m/c/a/home/talk")).toBe("/m/c/a/home/talk");
    expect(carryRouteDetails("/c/a/chat", "/c/a/home/talk")).toBe("/c/a/chat");
  });
});

it("the brain map's \"Open the lesson\" goes to that lesson in its course", async () => {
  const { goToCourseLesson } = await import("../shared/routeDetails");
  const { parseAppRouteFromPathname } = await import("../shared/webAppRouteState");
  const pushed: string[] = [];
  const popped: string[] = [];
  const previous = (globalThis as any).window;
  (globalThis as any).window = {
    location: { pathname: "/c/kiln/knowledge/brain" },
    history: { pushState: (_state: unknown, _title: string, path: string) => pushed.push(path) },
    dispatchEvent: (event: Event) => popped.push(event.type),
  };
  (globalThis as any).PopStateEvent ??= class extends Event {};
  try {
    goToCourseLesson("mod1", "les2");
  } finally {
    (globalThis as any).window = previous;
  }
  expect(pushed).toEqual(["/c/kiln/knowledge/mod1/les2"]);
  expect(popped).toEqual(["popstate"]);
  const route: any = parseAppRouteFromPathname(pushed[0]);
  expect(JSON.stringify(route)).toContain("mod1");
  expect(JSON.stringify(route)).toContain("les2");
});

describe("Board is part of Members' address", () => {
  it("reads and writes Board view independently of an open member record, on phone too", () => {
    expect(readRouteDetailAt("/c/a/members/board", "membersView")).toBe("board");
    expect(readRouteDetailAt("/c/a/members/board", "member")).toBeNull();
    expect(readRouteDetailAt("/c/a/members/board/m1", "membersView")).toBe("board");
    expect(readRouteDetailAt("/c/a/members/board/m1", "member")).toBe("m1");
    expect(readRouteDetailAt("/m/c/a/members/board", "membersView")).toBe("board");
    expect(readRouteDetailAt("/c/a/members/m1", "membersView")).toBeNull();
    expect(pathWithRouteDetail("/c/a/members", "membersView", "board")).toBe("/c/a/members/board");
    expect(pathWithRouteDetail("/c/a/members/board", "member", "m1")).toBe("/c/a/members/board/m1");
    expect(pathWithRouteDetail("/c/a/members/board/m1", "member", null)).toBe("/c/a/members/board");
    expect(pathWithRouteDetail("/c/a/members/board/m1", "membersView", null)).toBe("/c/a/members/m1");
    expect(pathWithRouteDetail("/m/c/a/members/board", "membersView", null)).toBe("/m/c/a/members");
  });

  it("is kept when the app rewrites Members' address, and dropped on another page", () => {
    expect(carryRouteDetails("/c/a/members", "/c/a/members/board")).toBe("/c/a/members/board");
    expect(carryRouteDetails("/c/a/members", "/c/a/members/board/m1")).toBe("/c/a/members/board/m1");
    expect(carryRouteDetails("/m/c/a/members", "/c/a/members/board")).toBe("/m/c/a/members/board");
    expect(carryRouteDetails("/c/a/events", "/c/a/members/board")).toBe("/c/a/events");
  });
});
