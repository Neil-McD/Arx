import { describe, expect, it } from "vitest";
import { keepPlaceParams, readPlaceParamFrom, searchWithPlaceParam } from "../shared/placeParams";

// Only Members and Inbox still ride on a tag (?open=); see shared/routeDetails.ts.
describe("the open tag on the address", () => {
  it("reads it and refuses anything that is not a plain word", () => {
    expect(readPlaceParamFrom("?open=members", "open")).toBe("members");
    expect(readPlaceParamFrom("?open=a/b", "open")).toBeNull();
  });

  it("sets and removes it, keeping other query text", () => {
    expect(searchWithPlaceParam("?code=1", "open", "inbox")).toBe("?code=1&open=inbox");
    expect(searchWithPlaceParam("?open=inbox", "open", null)).toBe("");
  });

  it("is kept while the page's address is the same and dropped on another page", () => {
    expect(keepPlaceParams("/c/a/chat/beta", "/c/a/chat/beta", "?open=members")).toBe("/c/a/chat/beta?open=members");
    expect(keepPlaceParams("/c/a/events", "/c/a/chat/beta", "?open=members")).toBe("/c/a/events");
    expect(keepPlaceParams("/c/a/events", "/c/a/events", "?utm=x&thread=t1")).toBe("/c/a/events");
  });
});
