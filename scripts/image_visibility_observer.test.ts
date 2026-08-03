import { describe, expect, it } from "vitest";

import {
  ImageVisibilityRegistry,
  isImageLoadAllowed,
} from "../shared/imageVisibilityObserver";

describe("canonical deferred image visibility", () => {
  it("never lets permission for a previous URL or mode start a deferred request", () => {
    const eagerPermission = {
      url: "https://example.com/a.png",
      loading: "eager" as const,
      allowed: true,
    };
    expect(isImageLoadAllowed(eagerPermission.url, "eager", eagerPermission)).toBe(true);
    expect(isImageLoadAllowed(eagerPermission.url, "lazy", eagerPermission)).toBe(false);

    const lazyPermission = { ...eagerPermission, loading: "lazy" as const };
    expect(isImageLoadAllowed(lazyPermission.url, "lazy", lazyPermission)).toBe(true);
    expect(isImageLoadAllowed("https://example.com/b.png", "lazy", lazyPermission)).toBe(false);
  });

  it("does not release a deferred image before its frame is near the viewport", () => {
    const observed: Element[] = [];
    const unobserved: Element[] = [];
    let disconnected = 0;
    const registry = new ImageVisibilityRegistry(() => ({
      observe: (target) => observed.push(target),
      unobserve: (target) => unobserved.push(target),
      disconnect: () => { disconnected += 1; },
    }));
    const target = {} as Element;
    let releases = 0;
    registry.observe(target, () => { releases += 1; });

    expect(observed).toEqual([target]);
    expect(releases).toBe(0);
    registry.notify([{ target, isIntersecting: false, intersectionRatio: 0 }]);
    expect(releases).toBe(0);

    registry.notify([{ target, isIntersecting: true, intersectionRatio: 0.1 }]);
    expect(releases).toBe(1);
    expect(unobserved).toEqual([target]);
    expect(disconnected).toBe(1);
  });

  it("coalesces callbacks for the same frame and cleans up without releasing them", () => {
    let observeCalls = 0;
    let unobserveCalls = 0;
    let disconnected = 0;
    const registry = new ImageVisibilityRegistry(() => ({
      observe: () => { observeCalls += 1; },
      unobserve: () => { unobserveCalls += 1; },
      disconnect: () => { disconnected += 1; },
    }));
    const target = {} as Element;
    let releases = 0;
    const stopFirst = registry.observe(target, () => { releases += 1; });
    const stopSecond = registry.observe(target, () => { releases += 1; });

    expect(observeCalls).toBe(1);
    stopFirst();
    expect(unobserveCalls).toBe(0);
    stopSecond();
    expect(unobserveCalls).toBe(1);
    expect(disconnected).toBe(1);
    expect(releases).toBe(0);
  });
});
