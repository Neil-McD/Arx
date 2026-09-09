import { expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { buildWebShellChromeHostProps } from "../apps/web/src/controllers/buildWebShellChromeHostProps";
import { channelPeopleScopeKey } from "../apps/web/src/controllers/useWebChannelPeoplePanel";

test("both authenticated Members entry points invoke the same roster handler", () => {
  const open = vi.fn(), navigate = vi.fn(), overlay = vi.fn();
  const props = buildWebShellChromeHostProps({
    destination: { kind: "community_chat", communitySlug: "example", channelSlug: "client" },
    communityChannels: [], communityInitials: () => "C", onOpenCommunityMembers: open,
    openCommunityChat: navigate, setMobileOverlay: overlay,
  } as any);
  props.mobileTopBarProps.onOpenMembers?.();
  props.communityShell.onOpenMembers?.();
  expect(open).toHaveBeenCalledTimes(2);
  expect(navigate).not.toHaveBeenCalled();
  expect(overlay).not.toHaveBeenCalled();
});

test("public funnel keeps its existing member preview overlay", () => {
  const open = vi.fn(), overlay = vi.fn();
  const props = buildWebShellChromeHostProps({
    destination: { kind: "community_funnel", communitySlug: "example" },
    communityChannels: [], communityInitials: () => "C", isPublicCommunityFunnel: true,
    onOpenCommunityMembers: open, setMobileOverlay: overlay,
  } as any);
  props.mobileTopBarProps.onOpenMembers?.();
  props.communityShell.onOpenMembers?.();
  expect(overlay.mock.calls).toEqual([["members"], ["members"]]);
  expect(open).not.toHaveBeenCalled();
});

test("panel scope distinguishes users, communities and private channels", () => {
  const scope = { userId: "viewer", communityId: "community", channelSlug: "private" };
  const original = channelPeopleScopeKey(scope);
  expect(channelPeopleScopeKey({ ...scope, userId: "other" })).not.toBe(original);
  expect(channelPeopleScopeKey({ ...scope, communityId: "other" })).not.toBe(original);
  expect(channelPeopleScopeKey({ ...scope, channelSlug: "general" })).not.toBe(original);
  expect(channelPeopleScopeKey({ ...scope, channelSlug: null }))
    .toBe(channelPeopleScopeKey({ ...scope, channelSlug: "general" }));
});

test("only the live roster owns pagination; directory hydration stays scoped", () => {
  const read = (file: string) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
  const directory = read("shared/useCommunityDirectoryController.ts");
  expect(directory).not.toContain("loadMoreCommunityDirectoryMembers");
  expect(directory).not.toContain("communityDirectoryMembersNextCursor");
  expect(directory).toContain("communityDirectoryMembers: isPresentationScoped");
  const panel = read("apps/web/src/components/WebCommunityInteractionProjection.tsx");
  expect(panel).not.toContain("const [peopleOpen");
  expect(panel).toContain("props.onPeopleOpenChange?.(true)");
});
