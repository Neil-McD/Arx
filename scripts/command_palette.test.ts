import { describe, expect, it } from "vitest";
import { matchScore, paletteItems, paletteSections, type PalettePlace } from "../shared/commandPalette";

const places: PalettePlace[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "inbox", label: "Inbox", icon: "inbox", hint: "4", fresh: true },
  { id: "channel:general", label: "General", icon: "hash", quiet: true },
  { id: "channel:wins", label: "wins", icon: "hash", hint: "new", fresh: true, quiet: true },
  { id: "knowledge", label: "Knowledge", icon: "stars" },
  { id: "events", label: "Events", icon: "cal" },
  { id: "members", label: "Members", icon: "users" },
];
const communities = [{ id: "de", label: "Distribution Engineer", initials: "DE", fresh: true }];
const suggestions = ["What did I miss?", "Who should I meet?", "Draft my intro"];

describe("command palette", () => {
  it("offers places (new first, quiet channels hidden), two questions and other communities when empty", () => {
    const sections = paletteSections({ query: "", places, suggestions, communities });
    expect(sections.map((section) => section.key)).toEqual(["go", "ask", "community"]);
    expect(sections[0].items.map((item) => item.label)).toEqual(["Inbox", "wins", "Home", "Knowledge", "Events", "Members"]);
    expect(sections[1].items.map((item) => item.label)).toEqual(["What did I miss?", "Who should I meet?"]);
    expect(sections[2].items[0]).toMatchObject({ kind: "community", hint: "new" });
  });

  it("narrows to matches, best first, and always ends with asking the guide the words as typed", () => {
    const sections = paletteSections({ query: "e", places, suggestions, communities });
    const items = paletteItems(sections);
    expect(items[0].label).toBe("Events");
    expect(items.at(-1)).toMatchObject({ kind: "ask", question: "e" });
    expect(items.some((item) => item.label === "General")).toBe(true);
  });

  it("finds a quiet channel by name, with or without #", () => {
    const items = paletteItems(paletteSections({ query: "#gen", places, suggestions, communities }));
    expect(items[0]).toMatchObject({ kind: "place", id: "channel:general" });
  });

  it("asks the guide when nothing matches", () => {
    const items = paletteItems(paletteSections({ query: "who priced a founding tier", places, suggestions, communities }));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "ask", question: "who priced a founding tier" });
  });

  it("scores a start over a word start over a contains", () => {
    expect(matchScore("Distribution Engineer", "dis")).toBe(3);
    expect(matchScore("Distribution Engineer", "eng")).toBe(2);
    expect(matchScore("Distribution Engineer", "ngin")).toBe(1);
    expect(matchScore("Home", "x")).toBe(0);
  });

  it("without the agent, offers places and communities only, and never asking", () => {
    const empty = paletteSections({ query: "", places, suggestions, communities, ask: false });
    expect(empty.map((section) => section.key)).toEqual(["go", "community"]);
    const typed = paletteItems(paletteSections({ query: "who priced a founding tier", places, suggestions, communities, ask: false }));
    expect(typed).toEqual([]);
  });

  it("phones have no search in the top bar, on any community page (Members included)", async () => {
    const { createRequire } = await import("node:module");
    const { vi } = await import("vitest");
    const React = await import("react");
    const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
    const root = createRequire(import.meta.url);
    if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { WebMobileTopBar } = await import("../apps/web/src/components/WebMobileTopBar");
    const base = {
      mode: "community", rootPage: "community", hasActiveCommunity: true, activeCommunityId: "c1", activeCommunityVisualIdentity: null,
      communityLabel: "The Build Club", canViewMembers: true, memberFaces: [], memberCount: 12, onOpenDrawer: () => {},
      canOpenCommunitySelector: true, onOpenCommunitySelector: () => {}, onOpenMembers: () => {},
    } as any;
    for (const page of [{ isCommunityHome: false }, { isCommunityHome: true }, { isThreadPage: true }, { communityDetailLabel: "General" }]) {
      const html = renderToStaticMarkup(React.createElement(WebMobileTopBar, { ...base, ...page }));
      expect(html).not.toContain("Search or ask");
    }
  });

  it("mounts the command palette across desktop and mobile community shells and routes mobile picks cleanly", async () => {
    const { vi } = await import("vitest");
    const { shouldMountCommunityCommandPalette } = await import("../apps/web/src/components/WebShellChromeHost");
    const { openCommunityPalettePlace } = await import("../apps/web/src/components/WebCommunityCommandPalette");

    expect(shouldMountCommunityCommandPalette({ hasActiveCommunity: true, showMobilePublicFunnel: false, isPublicCommunityFunnel: false })).toBe(true);
    expect(shouldMountCommunityCommandPalette({ hasActiveCommunity: false, showMobilePublicFunnel: false, isPublicCommunityFunnel: false })).toBe(false);
    expect(shouldMountCommunityCommandPalette({ hasActiveCommunity: true, showMobilePublicFunnel: true, isPublicCommunityFunnel: false })).toBe(false);
    expect(shouldMountCommunityCommandPalette({ hasActiveCommunity: true, showMobilePublicFunnel: false, isPublicCommunityFunnel: true })).toBe(false);

    const mobileShell: any = {
      showMobileShell: true,
      isDirectMessagesOpen: false,
      communityChannels: [],
      onSelectMobileRootPage: vi.fn(),
      onSelectCommunityTab: vi.fn(),
      onSelectCommunityTabFromMobile: vi.fn(),
      onToggleDirectMessages: vi.fn(),
      onSelectCommunityChannel: vi.fn(),
      onOpenMembers: vi.fn(),
      onOpenCommunitySettingsPane: vi.fn(),
    };
    openCommunityPalettePlace(mobileShell, "home");
    openCommunityPalettePlace(mobileShell, "inbox");
    openCommunityPalettePlace(mobileShell, "knowledge");
    expect(mobileShell.onSelectMobileRootPage).toHaveBeenNthCalledWith(1, "agent");
    expect(mobileShell.onSelectMobileRootPage).toHaveBeenNthCalledWith(2, "messages");
    expect(mobileShell.onSelectCommunityTabFromMobile).toHaveBeenCalledWith("resources");
    expect(mobileShell.onSelectCommunityTab).not.toHaveBeenCalled();

    const desktopShell: any = {
      ...mobileShell,
      showMobileShell: false,
      onSelectMobileRootPage: vi.fn(),
      onSelectCommunityTab: vi.fn(),
      onSelectCommunityTabFromMobile: vi.fn(),
      onToggleDirectMessages: vi.fn(),
    };
    openCommunityPalettePlace(desktopShell, "home");
    openCommunityPalettePlace(desktopShell, "inbox");
    openCommunityPalettePlace(desktopShell, "pods");
    expect(desktopShell.onSelectCommunityTab).toHaveBeenNthCalledWith(1, "agent");
    expect(desktopShell.onToggleDirectMessages).toHaveBeenCalledOnce();
    expect(desktopShell.onSelectCommunityTab).toHaveBeenNthCalledWith(2, "pods");
  });
});
