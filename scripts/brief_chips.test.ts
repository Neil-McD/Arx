import { expect, test } from "vitest";
import { BriefText } from "../apps/web/src/v1/KitBrief";
import { EntityIndexProvider } from "../shared/entityChipsUi";
import { buildEntityNameIndex } from "../shared/entityChips";
import { BRIEF_INSTRUCTIONS, parseBriefWriteCall } from "../shared/communityBriefs";
// The chips' context lives in shared/, so render with the same React it uses.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// What this reader can open: one course. Nothing else is a chip.
const index = buildEntityNameIndex("kiln", [{ kind: "course", name: "Start here", id: "m1" }]);
const render = (summary: string, withIndex = true) => renderToStaticMarkup(withIndex
  ? createElement(EntityIndexProvider, { index, navigate: () => undefined }, createElement(BriefText, { summary }))
  : createElement(BriefText, { summary }));

test("a name the guide bolded becomes a chip when the reader can open it; the rest stays plain words", () => {
  const html = render("New people are working through **Start here** and asking about pricing.");
  expect(html).toContain('class="entity-chip is-course"');
  expect(html).toContain('href="/c/kiln/knowledge/m1"');
  expect(html).toContain("New people are working through ");
  expect(html).not.toContain("**");
});

test("a bold name the reader can't open stays bold words, never a chip", () => {
  const html = render("The **Secret plans** course is coming together.");
  expect(html).not.toContain("entity-chip");
  expect(html).toContain("<strong>Secret plans</strong>");
});

test("a brief with no bold reads exactly as before", () => {
  expect(render("People are settling into a weekly rhythm.")).toBe("People are settling into a weekly rhythm.");
  // Without the names list (before it loads), the bold name is just bold.
  const before = render("Most are on **Start here**.", false);
  expect(before.replace(/<\/?span>/g, "")).toBe("Most are on <strong>Start here</strong>.");
});

test("the brief's writer is told to bold course, lesson and pod names, and a bolded brief is accepted", () => {
  expect(BRIEF_INSTRUCTIONS).toMatch(/name a course, a lesson or a pod, write its name in bold/);
  const parsed = parseBriefWriteCall({ operation: "brief.write", input: { summary: "Most are working through **Start here** this week.", refs: ["post:a1"] } }, new Set(["post:a1"]));
  expect(parsed).toEqual({ summary: "Most are working through **Start here** this week.", refs: ["post:a1"] });
});
