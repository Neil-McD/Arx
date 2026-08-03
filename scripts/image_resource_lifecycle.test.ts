import { describe, expect, it } from "vitest";

import {
  ImageResourceCache,
  resolveImageResourcePresentationState,
  type ImageResource,
} from "../shared/useImageResource";

function resource(url: string, width = 1200, height = 800): ImageResource {
  return { url, width, height };
}

describe("canonical image resource lifecycle", () => {
  it("never presents dimensions from a previous URL", async () => {
    const cache = new ImageResourceCache();
    await cache.load("https://example.com/a.png", async (url) => resource(url, 1200, 800));
    const stateA = cache.getState("https://example.com/a.png");
    expect(stateA).toMatchObject({
      url: "https://example.com/a.png",
      status: "ready",
      resource: { width: 1200, height: 800 },
    });

    expect(resolveImageResourcePresentationState(
      stateA,
      "https://example.com/b.png",
      cache,
    )).toEqual({
      url: "https://example.com/b.png",
      status: "loading",
      resource: null,
    });
    expect(resolveImageResourcePresentationState(stateA, null, cache)).toEqual({
      url: null,
      status: "empty",
      resource: null,
    });
  });

  it("backs off transient failures and retries after the TTL", async () => {
    let now = 1_000;
    let calls = 0;
    const cache = new ImageResourceCache({ failureTtlMs: 100, now: () => now });
    const loader = async (url: string) => {
      calls += 1;
      return calls === 1 ? null : resource(url);
    };

    await expect(cache.load("https://example.com/recover.png", loader)).resolves.toBeNull();
    await expect(cache.load("https://example.com/recover.png", loader)).resolves.toBeNull();
    expect(calls).toBe(1);

    now = 1_101;
    await expect(cache.load("https://example.com/recover.png", loader)).resolves.toEqual(
      resource("https://example.com/recover.png"),
    );
    expect(calls).toBe(2);
  });

  it("coalesces concurrent requests for the same URL", async () => {
    const cache = new ImageResourceCache();
    let calls = 0;
    let release: ((value: ImageResource) => void) | null = null;
    const loader = (url: string) => {
      calls += 1;
      return new Promise<ImageResource>((resolve) => {
        release = resolve;
      }).then((loaded) => ({ ...loaded, url }));
    };

    const first = cache.load("https://example.com/shared.png", loader);
    const second = cache.load("https://example.com/shared.png", loader);
    expect(calls).toBe(1);
    release?.(resource("https://example.com/shared.png"));
    await expect(Promise.all([first, second])).resolves.toEqual([
      resource("https://example.com/shared.png"),
      resource("https://example.com/shared.png"),
    ]);
  });

  it("evicts the least-recently-used ready resource", async () => {
    const cache = new ImageResourceCache({ readyLimit: 2 });
    const loader = async (url: string) => resource(url);
    await cache.load("a", loader);
    await cache.load("b", loader);
    expect(cache.getReady("a")).toEqual(resource("a"));
    await cache.load("c", loader);

    expect(cache.getReady("a")).toEqual(resource("a"));
    expect(cache.getReady("b")).toBeNull();
    expect(cache.getReady("c")).toEqual(resource("c"));
  });

  it("bounds failed resources and permits an evicted URL to load again", async () => {
    const cache = new ImageResourceCache({ failedLimit: 2, failureTtlMs: 10_000 });
    let retryCalls = 0;
    await cache.load("a", async () => null);
    await cache.load("b", async () => null);
    await cache.load("c", async () => null);

    await expect(cache.load("b", async () => {
      retryCalls += 1;
      return resource("b");
    })).resolves.toBeNull();
    await expect(cache.load("a", async (url) => {
      retryCalls += 1;
      return resource(url);
    })).resolves.toEqual(resource("a"));
    expect(retryCalls).toBe(1);
  });

  it("rejects invalid or mismatched loader results", async () => {
    const cache = new ImageResourceCache();
    await expect(cache.load("expected", async () => resource("other"))).resolves.toBeNull();
    cache.clearFailure("expected");
    await expect(cache.load("expected", async () => resource("expected", 0, 10))).resolves.toBeNull();
  });
});
