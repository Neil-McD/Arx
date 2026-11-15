import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";

it("whoever changes an event tells whoever shows events", async () => {
  const listeners = new Set<() => void>();
  vi.stubGlobal("window", {
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    dispatchEvent: () => { listeners.forEach((listener) => listener()); return true; },
  });
  vi.stubGlobal("Event", class { constructor(public type: string) {} });
  const { announceCommunityEventsChanged, onCommunityEventsChanged } = await import("../shared/communityEventsChanged");
  let heard = 0;
  const stop = onCommunityEventsChanged(() => { heard += 1; });
  announceCommunityEventsChanged();
  expect(heard).toBe(1);
  stop();
  announceCommunityEventsChanged();
  expect(heard).toBe(1);
  vi.unstubAllGlobals();
});

// Home stays mounted behind other pages. Without this its "Next up" showed a
// cancelled event, or missed a new one, until the page was reloaded (Nov 14).
it("the Events page, a pod's call and Home are wired to it", () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  expect(read("apps/web/src/v1/KitNextEvent.tsx")).toMatch(/onCommunityEventsChanged\(/);
  expect(read("apps/web/src/components/WebCommunityEventsSection.tsx").match(/announceCommunityEventsChanged\(\)/g)?.length).toBeGreaterThanOrEqual(3);
  expect(read("apps/web/src/v1/KitPodCall.tsx").match(/announceCommunityEventsChanged\(\)/g)?.length).toBe(2);
});
