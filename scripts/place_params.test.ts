import { describe, expect, it } from "vitest";
import { keepPlaceParams, readPlaceParamFrom, searchWithPlaceParam } from "../shared/placeParams";

describe("place tags on the address", () => {
  it("reads a tag and refuses anything that is not a plain id", () => {
    expect(readPlaceParamFrom("?thread=abc123", "thread")).toBe("abc123");
    expect(readPlaceParamFrom("?thread=a/b", "thread")).toBeNull();
    expect(readPlaceParamFrom("", "lesson")).toBeNull();
  });

  it("sets and removes one tag, keeping the others", () => {
    expect(searchWithPlaceParam("?code=1", "lesson", "l2")).toBe("?code=1&lesson=l2");
    expect(searchWithPlaceParam("?lesson=l2&view=brain", "lesson", null)).toBe("?view=brain");
    expect(searchWithPlaceParam("?lesson=l2", "lesson", null)).toBe("");
  });

  it("keeps the tags while the page's address is the same", () => {
    expect(keepPlaceParams("/c/a/chat/beta", "/c/a/chat/beta", "?thread=t1")).toBe("/c/a/chat/beta?thread=t1");
  });

  it("drops them on another page, and never carries other query text", () => {
    expect(keepPlaceParams("/c/a/chat", "/c/a/chat/beta", "?thread=t1")).toBe("/c/a/chat");
    expect(keepPlaceParams("/c/a/events", "/c/a/events", "?utm=x&view=brain")).toBe("/c/a/events?view=brain");
  });
});
