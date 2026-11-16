import { describe, expect, it } from "vitest";
import { pageSession } from "../shared/pageSession";

const session = (id: string, token: string, extra: Record<string, unknown> = {}) => ({ user: { id }, access_token: token, ...extra });

describe("the session pages are given", () => {
  it("is the same object when the same person's token renews, with the new token", () => {
    const first = pageSession(session("u1", "a", { old_only: 1 }));
    const second = pageSession(session("u1", "b"));
    expect(second).toBe(first);
    expect(second?.access_token).toBe("b");
    expect("old_only" in (second as object)).toBe(false);
  });

  it("is another object for another person, and null signed out", () => {
    const first = pageSession(session("u1", "a"));
    const other = pageSession(session("u2", "c"));
    expect(other).not.toBe(first);
    expect(other?.access_token).toBe("c");
    expect(pageSession(null)).toBeNull();
  });

  it("does not hand a past person's object to the next one", () => {
    const first = pageSession(session("u1", "a"));
    pageSession(session("u2", "c"));
    const again = pageSession(session("u1", "d"));
    expect(again).not.toBe(first);
  });
});
