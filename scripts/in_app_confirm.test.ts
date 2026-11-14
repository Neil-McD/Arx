import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { askInApp, registerInAppConfirmHost } from "../shared/inAppConfirm";

describe("the app's own \"are you sure?\"", () => {
  it("asks the host on screen and gives back its answer", async () => {
    const stop = registerInAppConfirmHost((question, answer) => answer(question.yes === "Delete"));
    expect(await askInApp({ message: "Delete this message?", yes: "Delete" })).toBe(true);
    expect(await askInApp({ message: "Leave?", yes: "Leave" })).toBe(false);
    stop();
  });
  it("falls back to the browser's box only when no host is on screen", async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("window", { confirm });
    expect(await askInApp({ message: "Remove this member?", yes: "Remove" })).toBe(true);
    expect(confirm).toHaveBeenCalledWith("Remove this member?");
    vi.unstubAllGlobals();
  });
  // Neil, Nov 14: browser pop-ups go. These files asked with the browser's box;
  // they must keep asking the app's way. (The classic Events page and the
  // unsaved-settings guard still use the browser's; they are listed, not missed.)
  it("no v1 page asks with the browser's box", () => {
    for (const file of [
      "apps/web/src/v1/KitChannelFeed.tsx", "apps/web/src/components/communityInteractionFeed.tsx",
      "apps/web/src/components/WebCommunityInteractionProjection.tsx", "apps/web/src/controllers/useWebCommunityChatController.ts",
      "apps/web/src/controllers/useWebCommunitySettingsController.ts", "apps/web/src/App.tsx", "apps/web/src/v1/KitEventsList.tsx",
    ]) {
      expect(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), file).not.toMatch(/window\.(confirm|alert|prompt)\(|[^.\w](confirm|alert|prompt)\(/);
    }
  });
});
