import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isLikelyModuleLoadFailure,
  resilientImport,
  shouldIdlePrefetch,
} from "../apps/web/src/lib/resilientLazy";
import {
  attemptModuleLoadRecovery,
  canAttemptModuleReload,
  checkForAppUpdate,
  configureAppUpdateRecovery,
  isAppUpdateAvailable,
  resetAppUpdateRecoveryForTests,
} from "../apps/web/src/lib/appUpdateRecovery";

const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) {
  vi.doMock(web.resolve("react"), () => ({ ...React, default: React }));
}

vi.mock("../apps/web/src/instrument", () => ({
  captureAppException: vi.fn(),
}));

const { SurfaceErrorBoundary } = await import("../apps/web/src/components/SurfaceErrorBoundary");

describe("resilient tab switching & lazy module recovery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries a transient dynamic-import failure once and resolves cleanly", async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const result = await resilientImport(
      async () => {
        calls += 1;
        if (calls === 1) throw new TypeError("Failed to fetch dynamically imported module: /assets/Pods-abc.js");
        return { ok: true };
      },
      {
        retries: 1,
        retryDelayMs: 100,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      },
    );
    expect(result).toEqual({ ok: true });
    expect(calls).toBe(2);
    expect(sleeps).toEqual([100]);
  });

  it("does not retry ordinary code errors during import", async () => {
    let calls = 0;
    await expect(
      resilientImport(
        async () => {
          calls += 1;
          throw new Error("Syntax bug in module init");
        },
        { retries: 2, sleep: async () => {} },
      ),
    ).rejects.toThrow("Syntax bug in module init");
    expect(calls).toBe(1);
  });

  it("distinguishes strict module load failures from generic API network errors", () => {
    expect(
      isLikelyModuleLoadFailure(new Error("Failed to fetch dynamically imported module"), { strict: true }),
    ).toBe(true);
    expect(isLikelyModuleLoadFailure(new Error("ChunkLoadError: Loading chunk 42 failed"), { strict: true })).toBe(
      true,
    );
    // Generic API fetch network error should NOT trigger a full-page reload on unhandledrejection.
    expect(isLikelyModuleLoadFailure(new Error("Network error"), { strict: true })).toBe(false);
    expect(isLikelyModuleLoadFailure(new Error("Load failed"), { strict: true })).toBe(false);
  });

  it("skips idle prefetch on save-data or 2g connections and allows normal connections", () => {
    expect(shouldIdlePrefetch(null)).toBe(true);
    expect(shouldIdlePrefetch({ connection: { saveData: false, effectiveType: "4g" } })).toBe(true);
    expect(shouldIdlePrefetch({ connection: { saveData: true, effectiveType: "4g" } })).toBe(false);
    expect(shouldIdlePrefetch({ connection: { saveData: false, effectiveType: "2g" } })).toBe(false);
    expect(shouldIdlePrefetch({ connection: { saveData: false, effectiveType: "slow-2g" } })).toBe(false);
  });

  it("isolates a tab render error, recovers on Try again, and auto-resets when resetKey changes", () => {
    const child = React.createElement("div", { "data-testid": "tab-ok" }, "Events");
    const boundary = new SurfaceErrorBoundary({ resetKey: "events", children: child });
    const stateUpdates: Array<Record<string, unknown>> = [];
    boundary.setState = ((updater: unknown) => {
      const next =
        typeof updater === "function"
          ? (updater as (prev: typeof boundary.state) => Partial<typeof boundary.state>)(boundary.state)
          : (updater as Partial<typeof boundary.state>);
      boundary.state = { ...boundary.state, ...next };
      stateUpdates.push(next as Record<string, unknown>);
    }) as typeof boundary.setState;

    // Healthy render shows children.
    expect(renderToStaticMarkup(boundary.render() as React.ReactElement)).toContain("Events");

    // Transient render error transitions to calm inline alert with Try again.
    const derived = SurfaceErrorBoundary.getDerivedStateFromError(new Error("Transient tab render crash"));
    boundary.state = { ...boundary.state, ...derived };
    const alertHtml = renderToStaticMarkup(boundary.render() as React.ReactElement);
    expect(alertHtml).toContain('role="alert"');
    expect(alertHtml).toContain("Couldn&#x27;t load this page");
    expect(alertHtml).toContain("Try again");

    // Clicking Try again resets error state and bumps retryCount in-place.
    (boundary as unknown as { handleRecover: () => void }).handleRecover();
    expect(boundary.state.error).toBeNull();
    expect(boundary.state.retryCount).toBe(1);
    expect(renderToStaticMarkup(boundary.render() as React.ReactElement)).toContain("Events");

    // Switching tabs (resetKey change) automatically clears an active error.
    boundary.state = {
      ...boundary.state,
      ...SurfaceErrorBoundary.getDerivedStateFromError(new Error("Another tab hiccup")),
    };
    expect(boundary.state.error).not.toBeNull();
    boundary.props = { resetKey: "pods", children: React.createElement("div", null, "Pods") };
    boundary.componentDidUpdate({ resetKey: "events", children: child });
    expect(boundary.state.error).toBeNull();
    expect(renderToStaticMarkup(boundary.render() as React.ReactElement)).toContain("Pods");
    expect(stateUpdates.length).toBeGreaterThanOrEqual(2);
  });

  it("shows update guidance with Refresh action when a chunk-load error exhausts retries", () => {
    const boundary = new SurfaceErrorBoundary({
      resetKey: "events",
      children: React.createElement("div", null, "Events"),
    });
    const derived = SurfaceErrorBoundary.getDerivedStateFromError(
      new TypeError("Failed to fetch dynamically imported module: /assets/Events-old.js"),
    );
    boundary.state = { ...boundary.state, ...derived };
    const html = renderToStaticMarkup(boundary.render() as React.ReactElement);
    expect(html).toContain("A newer version of Polynet is ready");
    expect(html).toContain("Refresh");
  });

  it("quietly checks /version.json with throttling, flags updates, and skips redundant retries when an update is known", async () => {
    resetAppUpdateRecoveryForTests();
    configureAppUpdateRecovery({ buildId: "build-old", baseUrl: "/", isProduction: true });

    let fetchCount = 0;
    const sameBuildFetch = (async () => {
      fetchCount += 1;
      return { ok: true, json: async () => ({ buildId: "build-old" }) } as Response;
    }) as typeof fetch;

    expect(await checkForAppUpdate({ now: 1_000, fetchImpl: sameBuildFetch })).toBe(false);
    expect(fetchCount).toBe(1);
    expect(isAppUpdateAvailable()).toBe(false);

    // Within throttle window: skips duplicate probe.
    expect(await checkForAppUpdate({ now: 30_000, fetchImpl: sameBuildFetch })).toBe(false);
    expect(fetchCount).toBe(1);

    // After throttle window with a newer buildId live: flags updateAvailable.
    const newerBuildFetch = (async () => {
      fetchCount += 1;
      return { ok: true, json: async () => ({ buildId: "build-new" }) } as Response;
    }) as typeof fetch;
    expect(await checkForAppUpdate({ now: 200_000, fetchImpl: newerBuildFetch })).toBe(true);
    expect(fetchCount).toBe(2);
    expect(isAppUpdateAvailable()).toBe(true);

    // Once updateAvailable is known, resilientImport fails immediately without wasting retry sleep.
    let calls = 0;
    let slept = 0;
    await expect(
      resilientImport(
        async () => {
          calls += 1;
          throw new TypeError("Failed to fetch dynamically imported module: /assets/Pods-old.js");
        },
        {
          retries: 1,
          sleep: async () => {
            slept += 1;
          },
          skipRetryWhen: isAppUpdateAvailable,
        },
      ),
    ).rejects.toThrow("Failed to fetch dynamically imported module");
    expect(calls).toBe(1);
    expect(slept).toBe(0);
    resetAppUpdateRecoveryForTests();
  });

  it("silently reloads once on chunk-load errors without flashing an error alert, then guards against reload loops", async () => {
    resetAppUpdateRecoveryForTests();
    const store = new Map<string, string>();
    const reloads: number[] = [];
    const prevWindow = (globalThis as Record<string, unknown>).window;
    (globalThis as Record<string, unknown>).window = {
      location: { origin: "https://www.polynet.ai", pathname: "/c/polynet/knowledge", search: "", reload: () => reloads.push(1) },
      sessionStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
      setTimeout: (fn: () => void) => {
        fn();
        return 1;
      },
    };
    try {
      configureAppUpdateRecovery({ buildId: "build-old", baseUrl: "/", isProduction: true });
      expect(canAttemptModuleReload()).toBe(true);

      // First chunk-load error inside SurfaceErrorBoundary: stays calm (aria-busy) with no error alert flash.
      const boundary = new SurfaceErrorBoundary({
        resetKey: "knowledge",
        children: React.createElement("div", null, "Knowledge"),
      });
      const derived = SurfaceErrorBoundary.getDerivedStateFromError(
        new TypeError("Failed to fetch dynamically imported module: /assets/Knowledge-old.js"),
      );
      boundary.state = { ...boundary.state, ...derived };
      expect(boundary.state.isAutoReloading).toBe(true);
      const quietHtml = renderToStaticMarkup(boundary.render() as React.ReactElement);
      expect(quietHtml).toContain('aria-busy="true"');
      expect(quietHtml).not.toContain('role="alert"');

      // Guarded reload triggers once and records session marker.
      const started = attemptModuleLoadRecovery(
        new TypeError("Failed to fetch dynamically imported module: /assets/Knowledge-old.js"),
        { reloadImpl: () => reloads.push(1) },
      );
      expect(started).toBe(true);
      await Promise.resolve();
      expect(store.size).toBe(1);

      // Fresh page load on the same build within 30s suppresses a second auto-reload and shows fallback UI.
      resetAppUpdateRecoveryForTests();
      configureAppUpdateRecovery({ buildId: "build-old", baseUrl: "/", isProduction: true });
      expect(canAttemptModuleReload()).toBe(false);
      const secondDerived = SurfaceErrorBoundary.getDerivedStateFromError(
        new TypeError("Failed to fetch dynamically imported module: /assets/Knowledge-old.js"),
      );
      boundary.state = { ...boundary.state, ...secondDerived };
      expect(boundary.state.isAutoReloading).toBe(false);
      const fallbackHtml = renderToStaticMarkup(boundary.render() as React.ReactElement);
      expect(fallbackHtml).toContain("A newer version of Polynet is ready");
      expect(fallbackHtml).toContain("Refresh");
    } finally {
      if (prevWindow === undefined) delete (globalThis as Record<string, unknown>).window;
      else (globalThis as Record<string, unknown>).window = prevWindow;
      resetAppUpdateRecoveryForTests();
    }
  });
});
