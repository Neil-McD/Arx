import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("runtime Stop startup race", () => {
  it("does not expose Stop until the first durable runtime event is visible", () => {
    const root = path.resolve(import.meta.dirname, "..");
    const memberDock = fs.readFileSync(
      path.join(root, "apps/web/src/components/WebMemberAgentDock.tsx"),
      "utf8",
    );
    const funnelEditor = fs.readFileSync(
      path.join(root, "apps/web/src/components/WebCommunityFunnelEditor.tsx"),
      "utf8",
    );
    expect(memberDock).toMatch(
      /\{runtimeEvents\.length > 0 && threadKey \? \([\s\S]*?aria-label="Stop"/,
    );
    expect(funnelEditor).toMatch(
      /\{runtimeEvents\.length > 0 \? \([\s\S]*?aria-label="Stop"/,
    );
  });
});
