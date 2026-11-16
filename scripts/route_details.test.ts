import { describe, expect, it } from "vitest";
import { buildAppRoutePath, parseAppRouteFromPathname } from "../shared/webAppRouteState";
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
    "/c/a/pods",
    "/c/a/pods/setters",
    "/c/a/home",
    "/c/a/browse",
    "/c/a/settings/community",
    "/c/a/analytics",
    "/c/a/members",
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
