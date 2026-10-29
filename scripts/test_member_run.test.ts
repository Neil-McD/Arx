import { afterEach, expect, test } from "vitest";
import { applyTestMemberRun, buildTestMemberRunUrl, captureTestMemberRunFromLocation, clearTestMemberRun, readTestMemberRun, testMemberRunFrameName } from "../shared/testMemberRun";

function fakeWindow(href: string) {
  const store = new Map<string, string>();
  const location = new URL(href);
  (globalThis as any).window = {
    location,
    history: { state: null, replaceState: (_s: unknown, _t: string, next: string) => { const url = new URL(next, location.origin); location.search = url.search; } },
    sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
  };
  return location;
}
afterEach(() => { delete (globalThis as any).window; });

const owner = { access_token: "t", expires_at: 1, user: { id: "owner-sub", email: "owner@example.com", displayName: "Ada", avatarUrl: "a.png" } };

test("a test-run link is kept for the tab and taken off the address", () => {
  const url = buildTestMemberRunUrl("aieb", { authSubject: "polynet-test:abc", label: "Test member 1" });
  const location = fakeWindow(`https://polynet.local${url}&ref=x`);
  captureTestMemberRunFromLocation();
  expect(location.search).toBe("?ref=x");
  expect(readTestMemberRun()).toEqual({ authSubject: "polynet-test:abc", label: "Test member 1" });
  // The tab's session is the test member's, with nothing of the owner's.
  expect(applyTestMemberRun(owner).user).toEqual({ id: "polynet-test:abc", displayName: "Test member 1" });
  expect(applyTestMemberRun(owner).access_token).toBe("t");
  clearTestMemberRun();
  expect(applyTestMemberRun(owner)).toBe(owner);
});

test("only test subjects are taken", () => {
  fakeWindow("https://polynet.local/c/aieb/chat?test_run=someone-else");
  captureTestMemberRunFromLocation();
  expect(readTestMemberRun()).toBeNull();
  expect(applyTestMemberRun(owner)).toBe(owner);
});

test("watched in the owner's page, the run is kept on the frame, not the shared tab storage", () => {
  const run = { authSubject: "polynet-test:abc", label: "Test member 2" };
  fakeWindow(`https://polynet.local${buildTestMemberRunUrl("aieb", run)}`);
  const frame = (globalThis as any).window;
  frame.name = testMemberRunFrameName(run);
  frame.self = frame; frame.top = {};
  captureTestMemberRunFromLocation();
  expect(frame.sessionStorage.getItem("polynet:test-run:v1")).toBeNull();
  expect(readTestMemberRun()).toEqual(run);
  clearTestMemberRun();
  expect(frame.name).toBe("");
  expect(readTestMemberRun()).toBeNull();
});
