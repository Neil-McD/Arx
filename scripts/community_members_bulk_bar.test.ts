import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const web = createRequire(new URL("../apps/web/package.json", import.meta.url));
const root = createRequire(import.meta.url);
if (web.resolve("react") !== root.resolve("react")) vi.doMock(web.resolve("react"), () => React);
vi.mock("../apps/web/src/components/CommunityMembersBulkBar.css", () => ({}));
const { CommunityMembersBulkBar } = await import("../apps/web/src/components/CommunityMembersBulkBar");

const tags = [{ slug: "beginner", name: "Beginner", people: 3 }];
const base = { session: {}, communityId: "c1", tags, filter: "", onFilter: () => {}, onClear: () => {}, onChanged: () => {} };
const selected = [{ userId: "u1", membershipId: "m1", role: "member", name: "Ana" }, { userId: "u2", membershipId: "m2", role: "moderator", name: "Sam" }];
const render = (props: Record<string, unknown>) => renderToStaticMarkup(React.createElement(CommunityMembersBulkBar, { ...base, canManage: true, isOwner: true, selected, ...props } as any));

test("owners and admins act on the people they selected: tag, untag, role, remove, ban", () => {
  const html = render({});
  expect(html).toContain("2 selected");
  for (const label of ["Tag the selected people", "Untag the selected people", "Change the role of the selected people"]) expect(html).toContain(label);
  expect(html).toContain("New tag…");
  expect(html).toContain(">Remove<");
  expect(html).toContain(">Ban<");
  // Only the owner can make admins.
  expect(html).toContain('value="admin"');
  expect(render({ isOwner: false })).not.toContain('value="admin"');
});

test("with nobody selected, or for a moderator, only the tag filter shows", () => {
  for (const props of [{ selected: [] }, { canManage: false }]) {
    const html = render(props);
    expect(html).toContain("Show people with a tag");
    expect(html).toContain("Beginner (3)");
    expect(html).not.toContain(" selected<");
    expect(html).not.toContain(">Remove<");
  }
});
