import { describe, expect, it } from "vitest";
import { liveQueryKey } from "../shared/liveQuery";

describe("one live subscription per request", () => {
  it("is the same request whatever order the arguments were written in", () => {
    expect(liveQueryKey("u1", "m:f", { a: 1, b: "x" })).toBe(liveQueryKey("u1", "m:f", { b: "x", a: 1 }));
    expect(liveQueryKey("u1", "m:f", { a: 1, b: undefined })).toBe(liveQueryKey("u1", "m:f", { a: 1 }));
  });

  it("keeps people, queries and arguments apart", () => {
    expect(liveQueryKey("u1", "m:f", { a: 1 })).not.toBe(liveQueryKey("u2", "m:f", { a: 1 }));
    expect(liveQueryKey("u1", "m:f", { a: 1 })).not.toBe(liveQueryKey("u1", "m:g", { a: 1 }));
    expect(liveQueryKey("u1", "m:f", { a: 1 })).not.toBe(liveQueryKey("u1", "m:f", { a: 2 }));
  });
});
