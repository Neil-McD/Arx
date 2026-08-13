import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  advanceWebAppActivity,
  createWebAppActivityState,
} from "../shared/webAppActivity";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("web app activity contract", () => {
  it("coalesces a visibility and focus burst into one resume", () => {
    const initial = createWebAppActivityState(true);
    const hidden = advanceWebAppActivity(initial, {
      isActive: false,
    });
    const focusWhileHidden = advanceWebAppActivity(hidden, {
      isActive: false,
    });
    const visibleAndFocused = advanceWebAppActivity(focusWhileHidden, {
      isActive: true,
    });
    const duplicateFocus = advanceWebAppActivity(visibleAndFocused, {
      isActive: true,
    });

    expect(hidden.resumeEpoch).toBe(0);
    expect(focusWhileHidden).toBe(hidden);
    expect(visibleAndFocused).toMatchObject({
      isActive: true,
      resumeEpoch: 1,
    });
    expect(duplicateFocus).toBe(visibleAndFocused);
  });

  it("emits explicit BFCache and online restoration while active", () => {
    const initial = createWebAppActivityState(true);
    const pageShow = advanceWebAppActivity(initial, {
      isActive: true,
      forceResume: true,
    });
    const online = advanceWebAppActivity(pageShow, {
      isActive: true,
      forceResume: true,
    });

    expect(pageShow.resumeEpoch).toBe(1);
    expect(online).toMatchObject({
      resumeEpoch: 2,
    });
  });

  it("keeps browser lifecycle ownership in one controller", () => {
    const owner = read("apps/web/src/controllers/useWebAppActivityController.ts");
    const formerOwners = [
      "shared/authSessionRefreshTimer.ts",
      "shared/useCommunityDirectoryLifecycle.ts",
      "shared/useCommunityAttentionController.ts",
      "apps/web/src/controllers/useWebActiveCommunityShellController.ts",
      "apps/web/src/controllers/useWebCommunityProfileHydrationController.ts",
    ].map(read);

    expect(owner.match(/addEventListener\("focus"/g)).toHaveLength(1);
    expect(owner.match(/addEventListener\("visibilitychange"/g)).toHaveLength(1);
    expect(owner).toContain('addEventListener("pageshow"');
    expect(owner).toContain('addEventListener("online"');
    expect(owner).toContain("next.resumeEpoch !== previous.resumeEpoch");
    expect(owner).not.toContain("setIsActive");
    for (const source of formerOwners) {
      expect(source).not.toMatch(/addEventListener\("focus"/);
      expect(source).not.toMatch(/addEventListener\("visibilitychange"/);
    }
  });

  it("does not replay an old resume when a consumer mounts or changes scope", () => {
    const hook = read("shared/useResumeEpochEffect.ts");

    expect(hook).toContain("useRef(resumeEpoch)");
    expect(hook).toContain("resumeEpoch <= lastHandledResumeEpochRef.current");
    expect(hook).toContain("lastHandledResumeEpochRef.current = resumeEpoch");
  });

  it("wires the one resume epoch only through lifecycle consumers that still need a refresh", () => {
    const app = read("apps/web/src/App.tsx");
    const auth = read("apps/web/src/controllers/useWebAppAuthController.ts");
    const access = read("apps/web/src/controllers/useWebActiveCommunityShellController.ts");
    const directory = read("shared/useCommunityDirectoryLifecycle.ts");
    const profiles = read("apps/web/src/controllers/useWebCommunityProfileHydrationController.ts");
    const attention = read("shared/useCommunityAttentionController.ts");

    expect(app).toContain("const appActivity = useWebAppActivityController()");
    expect(auth).toContain("resumeEpoch: params.resumeEpoch");
    for (const source of [access, directory, profiles]) {
      expect(source).toContain("useResumeEpochEffect");
    }
    expect(attention).not.toContain("useResumeEpochEffect");
    expect(attention).not.toContain("resumeEpoch");
  });
});
