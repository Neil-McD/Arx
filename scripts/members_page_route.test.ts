import { afterEach, expect, test, vi } from "vitest";
import { goToMembersPage } from "../shared/routeDetails";

function at(path: string) {
  const pushed: string[] = [];
  vi.stubGlobal("window", {
    location: { pathname: path },
    history: { pushState: (_state: unknown, _title: string, url: string) => pushed.push(url) },
    dispatchEvent: () => true,
  });
  vi.stubGlobal("PopStateEvent", class { constructor(public type: string) {} });
  return pushed;
}
afterEach(() => vi.unstubAllGlobals());

test("Members opens in the community a profile was read in, not only the one in the address bar", () => {
  expect((() => { const pushed = at("/c/polynet/chat/wins"); goToMembersPage("m1"); return pushed; })()).toEqual(["/c/polynet/members/m1"]);
  expect((() => { const pushed = at("/c/polynet/inbox"); goToMembersPage("m2", "studio-method"); return pushed; })()).toEqual(["/c/studio-method/members/m2"]);
  // The phone app's prefix stays.
  expect((() => { const pushed = at("/m/c/polynet/inbox"); goToMembersPage("owner", "studio-method"); return pushed; })()).toEqual(["/m/c/studio-method/members/owner"]);
  // Outside any community, only a named one can be opened.
  expect((() => { const pushed = at("/inbox"); goToMembersPage("m3"); return pushed; })()).toEqual([]);
  expect((() => { const pushed = at("/inbox"); goToMembersPage("m3", "polynet"); return pushed; })()).toEqual(["/c/polynet/members/m3"]);
});
