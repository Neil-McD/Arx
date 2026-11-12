import { expect, test } from "vitest";
import { layoutNotes, noteWords, relatedNotes } from "../shared/communityKnowledgeMap";

const note = (slug: string, title: string, body_md: string) => ({ slug, title, body_md });

test("related notes come from the words: a named title, a shared title word, or several shared words", () => {
  const notes = [
    note("inv", "Invitations that work", "Lead with the result and end with one link. See Your first ten members."),
    note("ten", "Your first ten members", "Send ten invitations by hand."),
    note("door", "The three-line door", "A short join page converts."),
    note("price", "Founding tier pricing", "Price the founding tier low, raise it later."),
    note("tier", "Raising a tier price", "Tell founding members before you raise the tier."),
  ];
  const related = relatedNotes(notes);
  expect(related.get("inv")?.[0]).toBe("ten");
  expect(related.get("ten")).toContain("inv");
  expect(related.get("price")).toContain("tier");
  expect(related.get("door")).toEqual([]);
});

test("common words never count as a link", () => {
  expect([...noteWords("What members should do with the community")]).toEqual([]);
});

test("the map is the same every time, labeled notes first, inside the frame", () => {
  const slugs = Array.from({ length: 30 }, (_, i) => `n${i}`);
  const labeled = new Set(["n0", "n1", "n2"]);
  const a = layoutNotes(slugs, labeled, 848, 620);
  const b = layoutNotes([...slugs].reverse(), labeled, 848, 620);
  const pos = (points: typeof a) => Object.fromEntries(points.map((p) => [p.slug, [p.x, p.y]]));
  expect(pos(a)).toEqual(pos(b));
  expect(a.filter((p) => p.labeled).map((p) => p.slug).sort()).toEqual(["n0", "n1", "n2"]);
  for (const p of a) { expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(848); expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(620); }
});
