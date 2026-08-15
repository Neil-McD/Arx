import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  RUNTIME_CANCELLATION_RETRY_DELAYS_MS,
  cancelRuntimeRunWithBoundedRetry,
} from "../shared/runtimeCancellationRetry";

describe("runtime Stop startup race", () => {
  it("retries a missing durable run and stops at the first successful cancellation", async () => {
    const cancel = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const wait = vi.fn<(delayMs: number) => Promise<void>>().mockResolvedValue(undefined);

    await expect(cancelRuntimeRunWithBoundedRetry({ cancel, wait })).resolves.toBe(true);
    expect(cancel).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[100], [250]]);
  });

  it("remains bounded when the exact run never becomes cancellable", async () => {
    const cancel = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
    const wait = vi.fn<(delayMs: number) => Promise<void>>().mockResolvedValue(undefined);

    await expect(cancelRuntimeRunWithBoundedRetry({ cancel, wait })).resolves.toBe(false);
    expect(cancel).toHaveBeenCalledTimes(RUNTIME_CANCELLATION_RETRY_DELAYS_MS.length);
    expect(wait.mock.calls).toEqual(
      RUNTIME_CANCELLATION_RETRY_DELAYS_MS.slice(1).map((delayMs) => [delayMs]),
    );
  });

  it("does not expose Stop until the shared controller has a run identity", () => {
    const root = path.resolve(import.meta.dirname, "..");
    const memberDock = fs.readFileSync(
      path.join(root, "apps/web/src/components/WebMemberAgentDock.tsx"),
      "utf8",
    );
    const funnelEditor = fs.readFileSync(
      path.join(root, "apps/web/src/components/WebCommunityFunnelEditor.tsx"),
      "utf8",
    );
    const controller = fs.readFileSync(
      path.join(root, "shared/useWebTurnRunnerController.ts"),
      "utf8",
    );

    expect(memberDock).toMatch(/\{streamingState && threadKey \? \([\s\S]*?aria-label="Stop"/);
    expect(memberDock).not.toMatch(/\{turnIsActive && threadKey \? \(/);
    expect(funnelEditor).toMatch(/\{streamingState \? \([\s\S]*?aria-label="Stop"/);
    expect(controller).toMatch(
      /cancelRuntimeRunWithBoundedRetry\([\s\S]*?\.finally\(\(\) => threadAbort\.abort\(\)\)/,
    );
  });
});
