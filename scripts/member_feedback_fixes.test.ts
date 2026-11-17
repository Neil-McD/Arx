import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

// Fixes from the first member feedback on design v1 in production (Nov 17).
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("a pasted screenshot is attached in a direct message, in both message boxes", () => {
  const panel = read("apps/web/src/components/WebDirectMessagePanel.tsx");
  expect(panel).toMatch(/const onAttachmentPaste = [\s\S]*?event\.clipboardData\?\.files;[\s\S]*?if \(!canAcceptAttachmentDrop \|\| !files \|\| files\.length === 0\) return;[\s\S]*?props\.onAttachmentFilesSelected\?\.\(files\);/);
  expect(panel.match(/onPaste=\{onAttachmentPaste\}/g)).toHaveLength(2);
});

test("Home's review button opens the people waiting, not the Members page", () => {
  const app = read("apps/web/src/App.tsx");
  expect(app).toMatch(/onOpenJoinRequests: \(\) => \{\s*leavePhoneHome\(\);\s*const members = buildCommunityTabPath\(selectedActiveCommunitySlug, "members"\);\s*if \(members\) navigateTo\(`\$\{members\}\/requests`\);/);
  expect(app).not.toMatch(/\buseEffect\b/);
});

test("a member a host keeps in for free is called that, not jargon", () => {
  for (const path of ["shared/communityMembersTable.ts", "shared/communityMemberRecords.ts", "convex/communityMemberRecords.ts", "apps/web/src/v1/KitMembersPage.tsx", "apps/web/src/v1/KitMembersTable.tsx"]) {
    expect(read(path)).not.toMatch(/"Comped"|"Comp"|"Comping…"/);
  }
  expect(read("shared/communityMembersTable.ts")).toContain('label: "Free for good"');
});

test("the left column's text is 14px on desktop, and its rows stay 28px", () => {
  const css = read("apps/web/src/styles/design-v1.css");
  expect(css).toMatch(/:where\(:not\(\[data-layout="phone"\]\)\) \.community-nav \.nav-item,[\s\S]{0,700}font-size: 14px;/);
  expect(css).toMatch(/:root\[data-design="v1"\] \.community-nav \.nav-item \{\s*min-height: 28px;/);
});
