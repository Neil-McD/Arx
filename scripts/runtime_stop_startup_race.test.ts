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
    expect(memberDock).toMatch(
      /\{runtimeEvents\.length > 0 && threadKey \? \([\s\S]*?aria-label="Stop"/,
    );
  });

  it("persists authoritative cancellation before aborting the local stream", () => {
    const root = path.resolve(import.meta.dirname, "..");
    const controller = fs.readFileSync(
      path.join(root, "shared/useWebTurnRunnerController.ts"),
      "utf8",
    );
    const stopOneStart = controller.indexOf("const stopStreamingTurn");
    const stopAllStart = controller.indexOf("const stopAllStreamingTurns");
    const runTurnStart = controller.indexOf("const runAgentTurn");
    expect(stopOneStart).toBeGreaterThanOrEqual(0);
    expect(stopAllStart).toBeGreaterThan(stopOneStart);
    expect(runTurnStart).toBeGreaterThan(stopAllStart);
    const stopOne = controller.slice(stopOneStart, stopAllStart);
    const stopAll = controller.slice(stopAllStart, runTurnStart);
    expect(stopOne).toMatch(
      /cancelRuntimeRun\(session, resolvedThreadId, activeRunId\)[\s\S]*?\.finally\(\(\) => threadAbort\.abort\(\)\);[\s\S]*?return;/,
    );
    expect(stopAll).toMatch(
      /cancelRuntimeRun\(session, threadId, activeRunId\)[\s\S]*?\.finally\(\(\) => abort\?\.abort\(\)\);[\s\S]*?continue;/,
    );
  });

  it("uses the runtime auth transport and server-derived owner for Stop", () => {
    const root = path.resolve(import.meta.dirname, "..");
    const transport = fs.readFileSync(
      path.join(root, "shared/cloudRuntimeTransport.ts"),
      "utf8",
    );
    const routes = fs.readFileSync(
      path.join(root, "convex/httpRuntimeRoutes.ts"),
      "utf8",
    );
    const cloudThreadsGateway = fs.readFileSync(
      path.join(root, "shared/cloudThreadsGateway.ts"),
      "utf8",
    );
    expect(transport).toMatch(
      /cancelCloudRuntimeTurn[\s\S]*?"\/runtime\/runtime_cancel"[\s\S]*?thread_id: params\.threadId,[\s\S]*?run_id: params\.runId/,
    );
    expect(routes).toMatch(
      /path: "\/runtime\/runtime_cancel"[\s\S]*?method: "POST"[\s\S]*?requireAuthenticatedActor\(ctx, req\)[\s\S]*?cancelCloudRuntimeRunByThreadKeyInternal[\s\S]*?ownerId: auth\.actor\.dbUserId/,
    );
    expect(cloudThreadsGateway).not.toContain(
      "cancelCloudRuntimeRunByThreadKey",
    );
  });
});
