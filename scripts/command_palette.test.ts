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
});
