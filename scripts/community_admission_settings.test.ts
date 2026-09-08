import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
test("Auto-join has one Members control using canonical permission, action and selector", () => {
  const settings = read("apps/web/src/components/WebCommunityMembersPanel.tsx");
  expect(settings).toContain("admission?.canManage && admission.mode");
  expect(settings).toMatch(/WebPlatformRadioGroup[\s\S]*ariaLabel="Auto-join"/);
  expect(settings).toContain("disabled:admission.pending");
  expect(settings).toContain("admission.onChange(value)");
  expect(settings).toContain("approves pending requests");
  const app = read("apps/web/src/App.tsx");
  expect(app).toMatch(/admission: \{[\s\S]*entry_policy === "open"[\s\S]*entry_policy === "approval"[\s\S]*canManage: canManageMembersActiveCommunity[\s\S]*onChange: handleSetCommunityContextFreeAccessMode/);
  expect(read("apps/web/src/components/CommunityContextPanel.tsx")).not.toMatch(/Auto-join|onSetFreeAccessMode/);
  expect(read("apps/web/src/components/WebCommunityInteractionProjection.tsx")).not.toContain("onSetCommunityFreeAccessMode");
  expect(read("apps/web/src/styles/community-and-content.css")).not.toContain("community-context-autojoin");
  expect(read("apps/web/src/components/WebCommunitySettingsSection.tsx")).not.toContain("Auto-join");
});
