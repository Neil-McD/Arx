import { expect, test } from "vitest";
import { podSettingsTabFrom, podSettingsTabsFor } from "../apps/web/src/v1/podSettingsTabs";

test("the builder gets every tab, a host gets Pitch and People, a member gets none", () => {
  expect(podSettingsTabsFor({ can_manage: true, can_edit: true })).toEqual(["pitch", "people", "access", "pod"]);
  expect(podSettingsTabsFor({ can_manage: true, can_edit: false })).toEqual(["pitch", "people"]);
  expect(podSettingsTabsFor({ can_manage: false, can_edit: false })).toEqual([]);
});

test("the open tab comes from the address, and only a real tab opens", () => {
  expect(podSettingsTabFrom("?settings=people")).toBe("people");
  expect(podSettingsTabFrom("?x=1&settings=access")).toBe("access");
  expect(podSettingsTabFrom("?settings=billing")).toBeNull();
  expect(podSettingsTabFrom("")).toBeNull();
});
